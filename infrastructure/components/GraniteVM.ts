import * as pulumi from '@pulumi/pulumi';
import * as oci from '@pulumi/oci';

export interface GraniteVMArgs {
  compartmentId: pulumi.Input<string>;
  subnetId: pulumi.Input<string>;
  availabilityDomain: pulumi.Input<string>;
  sshPublicKey: pulumi.Input<string>;
  tailscaleAuthKey: pulumi.Input<string>;
  region: string;
  displayName?: string;
}

export class GraniteVM extends pulumi.ComponentResource {
  public readonly instance: oci.core.Instance;
  public readonly publicIp: pulumi.Output<string>;
  public readonly privateIp: pulumi.Output<string>;
  public readonly tailscaleIp: string;

  constructor(name: string, args: GraniteVMArgs, opts?: pulumi.ComponentResourceOptions) {
    super('custom:infrastructure:GraniteVM', name, {}, opts);

    const displayName = args.displayName || 'granite-vm';
    this.tailscaleIp = '100.64.0.1';

    // Get ARM Ubuntu image for Oracle Cloud
    const images = oci.core.getImagesOutput({
      compartmentId: args.compartmentId,
      operatingSystem: 'Canonical Ubuntu',
      operatingSystemVersion: '22.04',
      shape: 'VM.Standard.A1.Flex',
      sortBy: 'TIMECREATED',
      sortOrder: 'DESC',
    });

    // Cloud-init script for Granite VM setup
    const cloudInit = pulumi.interpolate`#cloud-config
package_update: true
package_upgrade: true

packages:
  - curl
  - git
  - build-essential
  - python3
  - python3-pip
  - docker.io
  - docker-compose

runcmd:
  # Install Tailscale
  - curl -fsSL https://tailscale.com/install.sh | sh
  - tailscale up --authkey=${args.tailscaleAuthKey} --hostname=granite-vm --accept-routes
  
  # Install Ollama
  - curl -fsSL https://ollama.com/install.sh | sh
  
  # Start Ollama service
  - systemctl enable ollama
  - systemctl start ollama
  
  # Wait for Ollama to start
  - sleep 10
  
  # Pull Granite 3.1 Dense 8B model
  - ollama pull granite3.1-dense:8b
  
  # Install litellm for OpenAI-compatible API
  - pip3 install litellm[proxy]
  
  # Create litellm config
  - |
    cat > /opt/litellm_config.yaml <<'EOF'
    model_list:
      - model_name: ollama/granite3.1-dense:8b
        litellm_params:
          model: ollama/granite3.1-dense:8b
          api_base: http://localhost:11434
    
    general_settings:
      master_key: sk-1234
      database_url: sqlite:////opt/litellm.db
    
    litellm_settings:
      drop_params: true
      set_verbose: false
    EOF
  
  # Create systemd service for litellm
  - |
    cat > /etc/systemd/system/litellm.service <<'EOF'
    [Unit]
    Description=LiteLLM Proxy Server
    After=network.target ollama.service
    Requires=ollama.service
    
    [Service]
    Type=simple
    User=ubuntu
    WorkingDirectory=/opt
    ExecStart=/usr/local/bin/litellm --config /opt/litellm_config.yaml --port 8000 --host 0.0.0.0
    Restart=always
    RestartSec=10
    
    [Install]
    WantedBy=multi-user.target
    EOF
  
  # Start litellm service
  - systemctl daemon-reload
  - systemctl enable litellm
  - systemctl start litellm
  
  # Configure firewall for Tailscale network only
  - ufw allow from 100.64.0.0/10 to any port 8000
  - ufw allow from 100.64.0.0/10 to any port 11434
  - ufw allow 22/tcp
  - ufw --force enable
  
  # Create health check script
  - |
    cat > /usr/local/bin/granite-health-check.sh <<'EOF'
    #!/bin/bash
    echo "=== Granite VM Health Check ==="
    echo "Ollama Status:"
    systemctl status ollama --no-pager | head -3
    echo ""
    echo "LiteLLM Status:"
    systemctl status litellm --no-pager | head -3
    echo ""
    echo "Tailscale Status:"
    tailscale status
    echo ""
    echo "Available Models:"
    curl -s http://localhost:11434/api/tags | python3 -m json.tool
    echo ""
    echo "LiteLLM Models:"
    curl -s http://localhost:8000/v1/models | python3 -m json.tool
    EOF
  
  - chmod +x /usr/local/bin/granite-health-check.sh
  
  # Add health check to cron (every hour)
  - echo "0 * * * * /usr/local/bin/granite-health-check.sh >> /var/log/granite-health.log 2>&1" | crontab -

write_files:
  - path: /etc/motd
    content: |
      =====================================
      Granite VM - ATS CV Testing Research
      =====================================
      
      Services:
        - Ollama: http://localhost:11434
        - LiteLLM API: http://localhost:8000
        - Tailscale IP: ${this.tailscaleIp}
      
      Health check: /usr/local/bin/granite-health-check.sh
      Logs: journalctl -u ollama -u litellm -f
      
      Model: granite3.1-dense:8b
      
      =====================================

final_message: "Granite VM setup complete. Ollama and LiteLLM are running."
`;

    // Create the ARM instance
    this.instance = new oci.core.Instance(
      `${name}-instance`,
      {
        availabilityDomain: args.availabilityDomain,
        compartmentId: args.compartmentId,
        shape: 'VM.Standard.A1.Flex',
        shapeConfig: {
          ocpus: 4,
          memoryInGbs: 24,
        },
        displayName: displayName,
        sourceDetails: {
          sourceType: 'image',
          sourceId: images.apply(imgs => imgs.images[0].id),
          bootVolumeSizeInGbs: '100',
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
          Purpose: 'Granite ML Model',
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
    });
  }
}
