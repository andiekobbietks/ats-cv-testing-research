import * as pulumi from '@pulumi/pulumi';
import * as oci from '@pulumi/oci';

export interface PostHogVMArgs {
  compartmentId: pulumi.Input<string>;
  subnetId: pulumi.Input<string>;
  availabilityDomain: pulumi.Input<string>;
  sshPublicKey: pulumi.Input<string>;
  tailscaleAuthKey: pulumi.Input<string>;
  region: string;
  displayName?: string;
}

export class PostHogVM extends pulumi.ComponentResource {
  public readonly instance: oci.core.Instance;
  public readonly publicIp: pulumi.Output<string>;
  public readonly privateIp: pulumi.Output<string>;
  public readonly tailscaleIp: string;
  public readonly posthogUrl: string;

  constructor(name: string, args: PostHogVMArgs, opts?: pulumi.ComponentResourceOptions) {
    super('custom:infrastructure:PostHogVM', name, {}, opts);

    const displayName = args.displayName || 'posthog-vm';
    this.tailscaleIp = '100.64.0.5';
    this.posthogUrl = `http://${this.tailscaleIp}:8000`;

    // Get x86 Ubuntu image for micro instance
    const images = oci.core.getImagesOutput({
      compartmentId: args.compartmentId,
      operatingSystem: 'Canonical Ubuntu',
      operatingSystemVersion: '22.04',
      shape: 'VM.Standard.E2.1.Micro',
      sortBy: 'TIMECREATED',
      sortOrder: 'DESC',
    });

    // Cloud-init script for PostHog setup
    const cloudInit = pulumi.interpolate`#cloud-config
package_update: true
package_upgrade: true

packages:
  - curl
  - git
  - docker.io
  - docker-compose

runcmd:
  # Install Tailscale
  - curl -fsSL https://tailscale.com/install.sh | sh
  - tailscale up --authkey=${args.tailscaleAuthKey} --hostname=posthog-vm --accept-routes
  
  # Add ubuntu user to docker group
  - usermod -aG docker ubuntu
  
  # Create PostHog directory
  - mkdir -p /opt/posthog
  - chown -R ubuntu:ubuntu /opt/posthog
  
  # Create docker-compose file for PostHog
  - |
    cat > /opt/posthog/docker-compose.yml <<'EOF'
    version: '3'
    
    services:
      postgres:
        image: postgres:15-alpine
        container_name: posthog-postgres
        environment:
          POSTGRES_USER: posthog
          POSTGRES_PASSWORD: posthog
          POSTGRES_DB: posthog
        volumes:
          - postgres-data:/var/lib/postgresql/data
        restart: unless-stopped
        healthcheck:
          test: ["CMD-SHELL", "pg_isready -U posthog"]
          interval: 10s
          timeout: 5s
          retries: 5
    
      redis:
        image: redis:7-alpine
        container_name: posthog-redis
        restart: unless-stopped
        healthcheck:
          test: ["CMD", "redis-cli", "ping"]
          interval: 10s
          timeout: 5s
          retries: 5
    
      clickhouse:
        image: clickhouse/clickhouse-server:23.11-alpine
        container_name: posthog-clickhouse
        volumes:
          - clickhouse-data:/var/lib/clickhouse
        environment:
          CLICKHOUSE_DB: posthog
          CLICKHOUSE_USER: posthog
          CLICKHOUSE_PASSWORD: posthog
        restart: unless-stopped
        healthcheck:
          test: ["CMD", "wget", "--spider", "-q", "http://localhost:8123/ping"]
          interval: 10s
          timeout: 5s
          retries: 5
    
      posthog:
        image: posthog/posthog:latest
        container_name: posthog
        depends_on:
          postgres:
            condition: service_healthy
          redis:
            condition: service_healthy
          clickhouse:
            condition: service_healthy
        ports:
          - "8000:8000"
        environment:
          DISABLE_SECURE_SSL_REDIRECT: 'true'
          IS_BEHIND_PROXY: 'false'
          DATABASE_URL: 'postgres://posthog:posthog@postgres:5432/posthog'
          CLICKHOUSE_HOST: 'clickhouse'
          CLICKHOUSE_DATABASE: 'posthog'
          CLICKHOUSE_USER: 'posthog'
          CLICKHOUSE_PASSWORD: 'posthog'
          REDIS_URL: 'redis://redis:6379/'
          SECRET_KEY: 'ats-cv-testing-secret-key-change-in-production'
          SITE_URL: 'http://${this.tailscaleIp}:8000'
        restart: unless-stopped
        volumes:
          - posthog-data:/data
    
    volumes:
      postgres-data:
      clickhouse-data:
      posthog-data:
    EOF
  
  # Start PostHog with docker-compose
  - cd /opt/posthog
  - docker-compose up -d
  
  # Wait for PostHog to initialize
  - sleep 60
  
  # Configure firewall for Tailscale network only
  - ufw allow from 100.64.0.0/10 to any port 8000
  - ufw allow 22/tcp
  - ufw --force enable
  
  # Create systemd service to ensure PostHog starts on boot
  - |
    cat > /etc/systemd/system/posthog.service <<'EOF'
    [Unit]
    Description=PostHog Analytics Platform
    After=docker.service
    Requires=docker.service
    
    [Service]
    Type=oneshot
    RemainAfterExit=yes
    WorkingDirectory=/opt/posthog
    ExecStart=/usr/bin/docker-compose up -d
    ExecStop=/usr/bin/docker-compose down
    
    [Install]
    WantedBy=multi-user.target
    EOF
  
  - systemctl daemon-reload
  - systemctl enable posthog
  
  # Create backup script
  - |
    cat > /usr/local/bin/backup-posthog.sh <<'EOF'
    #!/bin/bash
    set -e
    
    BACKUP_DIR="/opt/posthog-backups"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    
    mkdir -p $BACKUP_DIR
    
    echo "Backing up PostHog PostgreSQL database..."
    docker exec posthog-postgres pg_dump -U posthog posthog > "$BACKUP_DIR/posthog-db-$TIMESTAMP.sql"
    
    echo "Compressing backup..."
    gzip "$BACKUP_DIR/posthog-db-$TIMESTAMP.sql"
    
    echo "Backup complete: $BACKUP_DIR/posthog-db-$TIMESTAMP.sql.gz"
    
    # Keep only last 7 days of backups
    find $BACKUP_DIR -name "posthog-db-*.sql.gz" -mtime +7 -delete
    EOF
  
  - chmod +x /usr/local/bin/backup-posthog.sh
  
  # Schedule weekly backups (Sunday at 2 AM)
  - echo "0 2 * * 0 /usr/local/bin/backup-posthog.sh >> /var/log/posthog-backup.log 2>&1" | crontab -
  
  # Create health check script
  - |
    cat > /usr/local/bin/posthog-health-check.sh <<'EOF'
    #!/bin/bash
    echo "=== PostHog Health Check ==="
    echo "Docker Containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    echo "PostHog API:"
    curl -s -o /dev/null -w "Status: %{http_code}\n" http://localhost:8000/
    echo ""
    echo "Tailscale Status:"
    tailscale status
    echo ""
    echo "Disk Usage:"
    df -h /opt/posthog | tail -1
    echo ""
    echo "Memory Usage:"
    free -h
    EOF
  
  - chmod +x /usr/local/bin/posthog-health-check.sh
  
  # Add health check to cron (every 6 hours)
  - echo "0 */6 * * * /usr/local/bin/posthog-health-check.sh >> /var/log/posthog-health.log 2>&1" | crontab -

write_files:
  - path: /etc/motd
    content: |
      ======================================
      PostHog VM - ATS CV Testing Research
      ======================================
      
      Services:
        - PostHog UI: http://localhost:8000
        - Tailscale IP: ${this.tailscaleIp}
        - URL: ${this.posthogUrl}
      
      Docker status: docker ps
      View logs: docker-compose -f /opt/posthog/docker-compose.yml logs -f
      
      Health check: /usr/local/bin/posthog-health-check.sh
      Backup: /usr/local/bin/backup-posthog.sh
      
      First-time setup:
        1. Open ${this.posthogUrl} in browser
        2. Create admin account
        3. Configure organization
        4. Get API key from Settings → Project
      
      ======================================

final_message: "PostHog VM setup complete. Access PostHog at ${this.posthogUrl}"
`;

    // Create the micro instance
    this.instance = new oci.core.Instance(
      `${name}-instance`,
      {
        availabilityDomain: args.availabilityDomain,
        compartmentId: args.compartmentId,
        shape: 'VM.Standard.E2.1.Micro',
        displayName: displayName,
        sourceDetails: {
          sourceType: 'image',
          sourceId: images.apply(imgs => imgs.images[0].id),
          bootVolumeSizeInGbs: '50',
        },
        createVnicDetails: {
          subnetId: args.subnetId,
          assignPublicIp: 'true',
          displayName: `${displayName}-vnic`,
        },
        metadata: {
          ssh_authorized_keys: args.sshPublicKey,
          user_data: cloudInit.apply(ci => Buffer.from(ci).toString('base64')),
        },
        freeformTags: {
          Name: displayName,
          Purpose: 'PostHog Analytics',
          Project: 'ATS-CV-Testing',
        },
      },
      { parent: this }
    );

    // Get the public IP
    const vnicAttachments = oci.core.getVnicAttachmentsOutput({
      compartmentId: args.compartmentId,
      instanceId: this.instance.id,
    });

    const vnicId = vnicAttachments.apply(va => va.vnicAttachments[0].vnicId);

    const vnic = vnicId.apply(id =>
      oci.core.getVnic({
        vnicId: id,
      })
    );

    this.publicIp = vnic.apply(v => v.publicIpAddress || '');
    this.privateIp = vnic.apply(v => v.privateIpAddress);

    this.registerOutputs({
      instanceId: this.instance.id,
      publicIp: this.publicIp,
      privateIp: this.privateIp,
      tailscaleIp: this.tailscaleIp,
      posthogUrl: this.posthogUrl,
    });
  }
}
