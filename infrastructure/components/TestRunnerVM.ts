import * as pulumi from '@pulumi/pulumi';
import * as oci from '@pulumi/oci';

export interface TestRunnerVMArgs {
  compartmentId: pulumi.Input<string>;
  subnetId: pulumi.Input<string>;
  availabilityDomain: pulumi.Input<string>;
  sshPublicKey: pulumi.Input<string>;
  tailscaleAuthKey: pulumi.Input<string>;
  region: string;
  graniteApiUrl: string;
  posthogApiUrl: string;
  atsTargets: string[];
  displayName?: string;
  tailscaleIp: string;
}

export class TestRunnerVM extends pulumi.ComponentResource {
  public readonly instance: oci.core.Instance;
  public readonly publicIp: pulumi.Output<string>;
  public readonly privateIp: pulumi.Output<string>;
  public readonly tailscaleIp: string;

  constructor(name: string, args: TestRunnerVMArgs, opts?: pulumi.ComponentResourceOptions) {
    super('custom:infrastructure:TestRunnerVM', name, {}, opts);

    const displayName = args.displayName || name;
    this.tailscaleIp = args.tailscaleIp;

    // Get x86 Ubuntu image for micro instances
    const images = oci.core.getImagesOutput({
      compartmentId: args.compartmentId,
      operatingSystem: 'Canonical Ubuntu',
      operatingSystemVersion: '22.04',
      shape: 'VM.Standard.E2.1.Micro',
      sortBy: 'TIMECREATED',
      sortOrder: 'DESC',
    });

    // Cloud-init script for Test Runner setup
    const cloudInit = pulumi.interpolate`#cloud-config
package_update: true
package_upgrade: true

packages:
  - curl
  - git
  - nodejs
  - npm
  - chromium-browser
  - firefox
  - xvfb

runcmd:
  # Install Tailscale
  - curl -fsSL https://tailscale.com/install.sh | sh
  - tailscale up --authkey=${args.tailscaleAuthKey} --hostname=${displayName} --accept-routes
  
  # Install Node.js 18 LTS
  - curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  - apt-get install -y nodejs
  
  # Create test directory
  - mkdir -p /opt/ats-tests
  - chown -R ubuntu:ubuntu /opt/ats-tests
  
  # Install Playwright and dependencies
  - cd /opt/ats-tests
  - sudo -u ubuntu npm init -y
  - sudo -u ubuntu npm install --save-dev @playwright/test
  - sudo -u ubuntu npm install axios posthog-node dotenv
  - sudo -u ubuntu npx playwright install --with-deps chromium firefox
  
  # Set environment variables
  - |
    cat >> /home/ubuntu/.bashrc <<'EOF'
    export GRANITE_API_URL="${args.graniteApiUrl}"
    export POSTHOG_API_URL="${args.posthogApiUrl}"
    export ATS_TARGETS="${pulumi.output(args.atsTargets).apply(targets => targets.join(','))}"
    export TEST_REGION="${args.region}"
    export PLAYWRIGHT_BROWSERS_PATH=/home/ubuntu/.cache/ms-playwright
    EOF
  
  # Create systemd environment file
  - |
    cat > /etc/environment <<'EOF'
    GRANITE_API_URL="${args.graniteApiUrl}"
    POSTHOG_API_URL="${args.posthogApiUrl}"
    ATS_TARGETS="${pulumi.output(args.atsTargets).apply(targets => targets.join(','))}"
    TEST_REGION="${args.region}"
    EOF
  
  # Create test run script
  - |
    cat > /usr/local/bin/run-ats-tests.sh <<'EOF'
    #!/bin/bash
    set -e
    
    source /home/ubuntu/.bashrc
    cd /opt/ats-tests
    
    echo "=== Starting ATS Tests ==="
    echo "Region: $TEST_REGION"
    echo "Granite API: $GRANITE_API_URL"
    echo "PostHog API: $POSTHOG_API_URL"
    echo "ATS Targets: $ATS_TARGETS"
    echo "==========================="
    
    # Run tests for each ATS target
    IFS=',' read -ra TARGETS <<< "$ATS_TARGETS"
    for ats in "\${TARGETS[@]}"; do
      echo "Testing: $ats"
      npm test -- "tests/ats/$(echo $ats | tr '[:upper:]' '[:lower:]' | tr ' ' '-').spec.ts" || true
    done
    
    echo "=== Tests Complete ==="
    EOF
  
  - chmod +x /usr/local/bin/run-ats-tests.sh
  
  # Create systemd timer for daily test runs (3 AM local time)
  - |
    cat > /etc/systemd/system/ats-tests.service <<'EOF'
    [Unit]
    Description=ATS CV Testing Service
    After=network-online.target tailscale.service
    Wants=network-online.target
    
    [Service]
    Type=oneshot
    User=ubuntu
    WorkingDirectory=/opt/ats-tests
    EnvironmentFile=/etc/environment
    ExecStart=/usr/local/bin/run-ats-tests.sh
    StandardOutput=append:/var/log/ats-tests.log
    StandardError=append:/var/log/ats-tests.log
    EOF
  
  - |
    cat > /etc/systemd/system/ats-tests.timer <<'EOF'
    [Unit]
    Description=Daily ATS Tests Timer
    
    [Timer]
    OnCalendar=*-*-* 03:00:00
    Persistent=true
    
    [Install]
    WantedBy=timers.target
    EOF
  
  # Enable and start timer
  - systemctl daemon-reload
  - systemctl enable ats-tests.timer
  - systemctl start ats-tests.timer
  
  # Configure firewall
  - ufw allow from 100.64.0.0/10
  - ufw allow 22/tcp
  - ufw --force enable
  
  # Create health check script
  - |
    cat > /usr/local/bin/test-runner-health-check.sh <<'EOF'
    #!/bin/bash
    echo "=== Test Runner Health Check ==="
    echo "Region: ${args.region}"
    echo "ATS Targets: ${pulumi.output(args.atsTargets).apply(targets => targets.join(', '))}"
    echo ""
    echo "Tailscale Status:"
    tailscale status
    echo ""
    echo "Playwright Browsers:"
    npx playwright --version
    echo ""
    echo "Next Test Run:"
    systemctl list-timers ats-tests.timer --no-pager
    echo ""
    echo "Last Test Results:"
    tail -20 /var/log/ats-tests.log
    EOF
  
  - chmod +x /usr/local/bin/test-runner-health-check.sh

write_files:
  - path: /etc/motd
    content: |
      ==========================================
      Test Runner VM - ATS CV Testing Research
      ==========================================
      
      Region: ${args.region}
      ATS Targets: ${pulumi.output(args.atsTargets).apply(targets => targets.join(', '))}
      Tailscale IP: ${this.tailscaleIp}
      
      Run tests: /usr/local/bin/run-ats-tests.sh
      Health check: /usr/local/bin/test-runner-health-check.sh
      Test logs: tail -f /var/log/ats-tests.log
      
      Timer status: systemctl status ats-tests.timer
      
      ==========================================

final_message: "Test Runner VM setup complete. Tests scheduled to run daily at 3 AM."
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
          Purpose: 'Test Runner',
          Region: args.region,
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
      atsTargets: args.atsTargets,
    });
  }
}
