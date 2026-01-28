# ATS CV Testing Infrastructure

Complete Pulumi infrastructure setup for deploying the ATS CV testing environment on Oracle Cloud's Always Free tier.

## Overview

This infrastructure deploys a distributed testing environment for evaluating how Applicant Tracking Systems (ATS) parse CVs with different formatting (table vs. list skills). The entire setup runs at **$0/month** using Oracle Cloud's Always Free tier.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Tailscale VPN Mesh                       │
│                   (100.64.0.0/10)                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Granite VM  │  │  PostHog VM  │  │Test Runner VMs│     │
│  │  (ARM A1)    │  │  (x86 Micro) │  │  (x86 Micro)  │     │
│  │              │  │              │  │               │     │
│  │ • Ollama     │  │ • PostgreSQL │  │ • Playwright  │     │
│  │ • Granite    │  │ • ClickHouse │  │ • Chromium    │     │
│  │ • LiteLLM    │  │ • Redis      │  │ • Firefox     │     │
│  │              │  │ • PostHog    │  │               │     │
│  │ 4 vCPU       │  │ Analytics    │  │ 3 Runners:    │     │
│  │ 24 GB RAM    │  │              │  │  - US (5 ATS) │     │
│  │              │  │              │  │  - EU (5 ATS) │     │
│  │ Port: 8000   │  │ Port: 8000   │  │  - AP (5 ATS) │     │
│  │ (API)        │  │ (UI)         │  │               │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Components

1. **Granite VM** (ARM A1.Flex, 4 vCPU, 24GB RAM)
   - Runs Ollama with Granite 3.1 Dense 8B model
   - LiteLLM proxy for OpenAI-compatible API
   - Generates CVs for testing

2. **PostHog VM** (x86 Micro, 1GB RAM)
   - Self-hosted analytics platform
   - Tracks test results and accuracy metrics
   - PostgreSQL + ClickHouse + Redis

3. **Test Runner VMs** (3× x86 Micro, 1GB RAM each)
   - Regional test execution (US, EU, APAC)
   - Playwright with Chromium and Firefox
   - Tests 5 ATS systems per region (15 total)

### Resource Allocation

| Component | Type | vCPU | RAM | Region | Cost |
|-----------|------|------|-----|--------|------|
| Granite VM | ARM A1.Flex | 4 | 24 GB | us-phoenix-1 | $0 |
| PostHog VM | E2.1.Micro | 0.125 | 1 GB | us-phoenix-1 | $0 |
| Test Runner US | E2.1.Micro | 0.125 | 1 GB | us-phoenix-1 | $0 |
| Test Runner EU | E2.1.Micro | 0.125 | 1 GB | eu-frankfurt-1* | ~$6/mo |
| Test Runner AP | E2.1.Micro | 0.125 | 1 GB | ap-singapore-1* | ~$6/mo |
| **TOTAL** | | 4.5 | 28 GB | | **$0-12/month** |

*Note: Oracle Free Tier includes only 2 micro instances. To stay within free tier, you can:
- Option A: Deploy only US runner and PostHog (100% free, tests 5 ATS systems)
- Option B: Deploy all 3 runners for full 15 ATS coverage (~$12/month for 2 additional micro instances)
- Option C: Consolidate test runners into 1 VM with scheduled regional testing (100% free)

## Prerequisites

### Required Accounts

1. **Oracle Cloud** (Always Free tier)
   - Sign up: https://oracle.com/cloud/free
   - Provides: 4 ARM cores, 24GB RAM, 200GB storage

2. **Tailscale** (Free plan)
   - Sign up: https://tailscale.com
   - Provides: 100 devices, secure mesh network

3. **Pulumi** (Individual tier - free)
   - Sign up: https://app.pulumi.com/signup
   - Provides: Unlimited stacks, state management

### Required Software

```bash
# Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Pulumi CLI
curl -fsSL https://get.pulumi.com | sh

# Oracle Cloud CLI
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"
```

## Setup

### 1. Oracle Cloud Configuration

#### Create API Keys

```bash
mkdir -p ~/.oci

# Generate API signing key
openssl genrsa -out ~/.oci/oci_api_key.pem 2048
chmod 600 ~/.oci/oci_api_key.pem

# Generate public key
openssl rsa -pubout -in ~/.oci/oci_api_key.pem -out ~/.oci/oci_api_key_public.pem

# Display public key (add this to Oracle Cloud Console)
cat ~/.oci/oci_api_key_public.pem
```

#### Configure OCI CLI

Create `~/.oci/config`:

```ini
[DEFAULT]
user=ocid1.user.oc1..aaaa...
fingerprint=xx:xx:xx:...
tenancy=ocid1.tenancy.oc1..aaaa...
region=us-phoenix-1
key_file=~/.oci/oci_api_key.pem
```

Test configuration:
```bash
oci iam region list
```

#### Get Compartment OCID

```bash
oci iam compartment list --all | grep -A 5 "ats-testing"
# Note down the "id" field
```

### 2. Tailscale Setup

#### Create Auth Key

1. Login to Tailscale admin console
2. Navigate to: Settings → Keys
3. Click "Generate auth key"
4. Options:
   - ☑ Reusable
   - ☑ Ephemeral (optional)
   - Tags: ats-infrastructure
5. Copy the key (tskey-auth-xxxx...)

#### Install Tailscale Locally

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale status
```

### 3. Repository Setup

```bash
git clone https://github.com/andiekobbietks/ats-cv-testing-research.git
cd ats-cv-testing-research/infrastructure
npm install
```

### 4. Pulumi Configuration

#### Login to Pulumi

```bash
pulumi login
```

#### Create Stack

```bash
# Create production stack
pulumi stack init prod

# Or create dev stack
pulumi stack init dev
```

#### Configure Secrets

```bash
# Oracle Cloud configuration
pulumi config set oci:tenancyOcid "ocid1.tenancy.oc1..aaaa..." --secret
pulumi config set oci:userOcid "ocid1.user.oc1..aaaa..." --secret
pulumi config set oci:fingerprint "xx:xx:xx:..."
pulumi config set oci:privateKeyPath "~/.oci/oci_api_key.pem"
pulumi config set oci:region "us-phoenix-1"

# Compartment
pulumi config set compartmentId "ocid1.compartment.oc1..aaaa..." --secret

# Tailscale
pulumi config set tailscaleAuthKey "tskey-auth-xxxx..." --secret

# SSH key for instance access
ssh-keygen -t rsa -b 4096 -f ~/.ssh/ats_testing_rsa -N ""
pulumi config set sshPublicKey "$(cat ~/.ssh/ats_testing_rsa.pub)"
```

#### Verify Configuration

```bash
pulumi config
```

## Deployment

### Preview Changes

```bash
pulumi preview
```

This shows what resources will be created:
- 1 VCN (Virtual Cloud Network)
- 1 Internet Gateway
- 1 Route Table
- 1 Security List
- 1 Public Subnet
- 1 Granite VM (ARM)
- 1 PostHog VM
- 3 Test Runner VMs

### Deploy Infrastructure

```bash
pulumi up
```

Review the plan and confirm with `yes`.

Deployment takes approximately **10-15 minutes**.

### Verify Deployment

```bash
# Check Tailscale network
tailscale status
# Should show all 5 VMs connected

# Get outputs
pulumi stack output

# SSH into Granite VM
ssh -i ~/.ssh/ats_testing_rsa ubuntu@$(pulumi stack output granitePublicIP)

# Verify Ollama is running
curl http://localhost:11434/api/tags

# Verify litellm proxy
curl http://localhost:8000/v1/models

exit
```

## Usage

### Access Services

#### Granite API (via Tailscale)

```bash
curl http://100.64.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ollama/granite3.1-dense:8b",
    "messages": [
      {
        "role": "user",
        "content": "Generate a software engineer CV with 5 years experience"
      }
    ],
    "temperature": 0.7
  }'
```

#### PostHog Dashboard (via Tailscale)

```bash
# Get URL
pulumi stack output posthogURL

# Open in browser: http://100.64.0.5:8000
# First-time setup:
#   1. Create admin account
#   2. Configure organization
#   3. Get API key from Settings → Project
```

### Run Tests

#### Manual Test Run

```bash
# SSH into test runner
ssh -i ~/.ssh/ats_testing_rsa ubuntu@$(pulumi stack output runner-usPublicIP)

# Run tests
/usr/local/bin/run-ats-tests.sh

# View logs
tail -f /var/log/ats-tests.log
```

#### Automated Tests

Tests run automatically daily at 3 AM (local time for each region).

Check timer status:
```bash
systemctl status ats-tests.timer
systemctl list-timers
```

### Health Checks

#### Granite VM

```bash
ssh ubuntu@granite-vm "/usr/local/bin/granite-health-check.sh"
```

#### PostHog VM

```bash
ssh ubuntu@posthog-vm "/usr/local/bin/posthog-health-check.sh"
```

#### Test Runners

```bash
ssh ubuntu@runner-us "/usr/local/bin/test-runner-health-check.sh"
ssh ubuntu@runner-eu "/usr/local/bin/test-runner-health-check.sh"
ssh ubuntu@runner-ap "/usr/local/bin/test-runner-health-check.sh"
```

## Outputs

After deployment, Pulumi exports these outputs:

```bash
# VPC
vpcId                    - VCN OCID
vpcCidr                  - VCN CIDR blocks
subnetId                 - Public subnet OCID

# Granite VM
graniteInstanceId        - Instance OCID
granitePublicIP          - Public IP address
granitePrivateIP         - Private IP address
graniteTailscaleIP       - Tailscale IP (100.64.0.1)
graniteApiURL            - API URL (http://100.64.0.1:8000)

# PostHog VM
posthogInstanceId        - Instance OCID
posthogPublicIP          - Public IP address
posthogPrivateIP         - Private IP address
posthogTailscaleIP       - Tailscale IP (100.64.0.5)
posthogURL               - Dashboard URL (http://100.64.0.5:8000)

# Test Runners
runner-usInstanceId      - US runner instance OCID
runner-usPublicIP        - US runner public IP
runner-usTailscaleIP     - US runner Tailscale IP (100.64.0.2)
runner-usAtsTargets      - [Workday, Greenhouse, iCIMS, Lever, UKG]

runner-euInstanceId      - EU runner instance OCID
runner-euPublicIP        - EU runner public IP
runner-euTailscaleIP     - EU runner Tailscale IP (100.64.0.3)
runner-euAtsTargets      - [SAP SuccessFactors, Teamtailor, Personio, ...]

runner-apInstanceId      - AP runner instance OCID
runner-apPublicIP        - AP runner public IP
runner-apTailscaleIP     - AP runner Tailscale IP (100.64.0.4)
runner-apAtsTargets      - [Zoho Recruit, SEEK Talent, PageUp, ...]

# Summary
deploymentSummary        - Complete deployment information
sshCommands              - SSH commands for all VMs
healthCheckCommands      - Health check commands
```

View all outputs:
```bash
pulumi stack output --json | jq
```

## Maintenance

### Update Infrastructure

```bash
# Pull latest changes
git pull

# Preview changes
pulumi preview

# Apply changes
pulumi up
```

### Update Dependencies

```bash
npm update

# Rebuild TypeScript
npm run build
```

### Backup PostHog Data

```bash
# Manual backup
ssh ubuntu@posthog-vm "/usr/local/bin/backup-posthog.sh"

# Automated: Weekly backups run Sunday at 2 AM
```

### Rotate Secrets

#### Tailscale Auth Key (every 90 days)

```bash
# Generate new key in Tailscale admin
pulumi config set tailscaleAuthKey "tskey-auth-new..." --secret
pulumi up
```

#### OCI API Keys (every 180 days)

```bash
# Generate new key pair
openssl genrsa -out ~/.oci/oci_api_key_new.pem 2048

# Add to Oracle Cloud console
# Update config
pulumi config set oci:privateKeyPath "~/.oci/oci_api_key_new.pem"
```

## Troubleshooting

### Deployment Fails

**Error:** `timeout waiting for instance to be ready`

**Solution:**
```bash
# Check Oracle Cloud console for instance state
# VMs may take 10-15 minutes for cloud-init to complete
# Re-run: pulumi up
```

### Tailscale VMs Not Connecting

**Error:** `VMs not showing in tailscale status`

**Solution:**
```bash
# SSH into VM
ssh ubuntu@<public-ip>

# Check Tailscale status
sudo tailscale status

# Re-authenticate if needed
sudo tailscale up --authkey=tskey-auth-xxx
```

### Playwright Test Timeouts

**Error:** `waiting for selector timed out`

**Solution:**
```bash
# ATS may have changed their form
# Use Playwright codegen to inspect
npx playwright codegen https://ats-system.com/apply

# Update selectors in data/ats-systems.json
```

### Granite Model Out of Memory

**Error:** `CUDA out of memory` or `malloc failed`

**Solution:**
```bash
# Switch to smaller quantization
ollama pull granite3.1-dense:8b-Q4_K_S

# Or upgrade to 32GB ARM instance (still free tier)
```

## Cleanup

### Destroy All Resources

```bash
pulumi destroy
```

Review the plan and confirm with `yes`.

This will delete:
- All VM instances
- VCN and networking resources
- Security rules

**Note:** Pulumi state is preserved. You can redeploy later with `pulumi up`.

### Delete Stack

```bash
pulumi stack rm <stack-name>
```

## Cost Analysis

### Current Configuration (Free Tier)

| Resource | Specification | Oracle Free Tier | Usage | Cost |
|----------|---------------|------------------|-------|------|
| ARM Compute | 4 vCPU, 24 GB RAM | ✅ Within limits | 100% | $0 |
| Micro Instances | 2 instances | ✅ Within limits (US + PostHog) | 100% | $0 |
| Extra Micro Instances | 2 instances (EU + AP) | ❌ Beyond free tier | Optional | ~$12/mo |
| Block Storage | 100 GB total | ✅ Within limits | 50% | $0 |
| Outbound Data | ~500 GB/month | ✅ Within limits | 5% | $0 |
| **TOTAL (Free Tier)** | | | | **$0/month** |
| **TOTAL (All Regions)** | | | | **~$12/month** |

### Scaling Beyond Free Tier

If you need more resources:

| Scenario | Additional Cost |
|----------|-----------------|
| 3rd micro instance (for EU/AP runners) | ~$6/month each |
| Additional ARM vCPU (beyond 4) | ~$1.50/month per vCPU |
| Additional storage (beyond 200GB) | ~$0.085/GB/month |

### Free Tier Limits

- ARM: 4 vCPU, 24 GB RAM (combined across all A1.Flex instances)
- x86: 2 micro instances (VM.Standard.E2.1.Micro)
- Storage: 200 GB block volumes
- Outbound data: 10 TB/month

## Architecture Decisions

### Why Oracle Cloud?

- Best free tier in the industry (ARM with 24GB RAM)
- Permanent free tier (not a trial)
- Excellent performance for ML workloads

### Why ARM for Granite?

- 4 vCPU + 24 GB RAM in free tier
- Better performance/watt for ML inference
- Granite 3.1 optimized for ARM architecture

### Why Tailscale?

- Zero-trust security model
- No firewall configuration needed
- Easy inter-VM communication
- 100 devices free tier

### Why Self-Hosted PostHog?

- Full data ownership
- No analytics costs
- Unlimited events and users
- Complete feature set

## Contributing

See main repository README for contribution guidelines.

## Support

- Documentation: See `docs/` directory
- Deployment Guide: `docs/06-deployment-playbook.md`
- Issues: GitHub Issues
- Discussions: GitHub Discussions

## License

MIT License - See LICENSE file in repository root

## References

- [Pulumi Documentation](https://www.pulumi.com/docs/)
- [Oracle Cloud Documentation](https://docs.oracle.com/en-us/iaas/)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Tailscale Documentation](https://tailscale.com/kb/)
- [PostHog Documentation](https://posthog.com/docs)
- [Ollama Documentation](https://ollama.ai/docs)
- [Deployment Playbook](../docs/06-deployment-playbook.md)

---

**Last Updated:** 2026-01-28  
**Version:** 1.0.0
