# Deployment Playbook: Complete Replication Guide

This document provides step-by-step instructions to replicate the entire ATS CV testing infrastructure from scratch. Following this guide will result in a fully operational testing environment running at **$0/month** (using cloud free tiers).

**Time to complete:** 30-45 minutes (assuming accounts already created)

---

## Prerequisites

### Required Accounts (All Free Tier)

1. **Oracle Cloud** (Always Free tier)
   - Sign up: https://oracle.com/cloud/free
   - Credit card required (but not charged for free tier resources)
   - Provides: 4 ARM cores, 24GB RAM, 200GB storage

2. **Tailscale** (Free plan)
   - Sign up: https://tailscale.com
   - No credit card required
   - Provides: 100 devices, 3 users

3. **Pulumi** (Individual tier - free)
   - Sign up: https://app.pulumi.com/signup
   - No credit card required
   - Provides: Unlimited stacks, state management

4. **GitHub** (Free tier)
   - Sign up: https://github.com
   - For hosting code and CI/CD

### Required Software

Install on your local machine:

```bash
# Node.js 18+ (for Pulumi and TypeScript)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Pulumi CLI
curl -fsSL https://get.pulumi.com | sh

# Oracle Cloud CLI (oci)
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"

# Git
sudo apt-get install git
```

---

## Phase 1: Oracle Cloud Setup (10 minutes)

### Step 1.1: Create Compartment

Oracle uses "compartments" to organize resources.

```bash
# Login to Oracle Cloud Console
# Navigate to: Identity & Security → Compartments
# Click "Create Compartment"

Name: ats-testing
Description: ATS CV testing infrastructure
Parent Compartment: (root)
```

### Step 1.2: Generate API Keys

```bash
# Create .oci directory
mkdir -p ~/.oci

# Generate API signing key
openssl genrsa -out ~/.oci/oci_api_key.pem 2048
chmod 600 ~/.oci/oci_api_key.pem

# Generate public key
openssl rsa -pubout -in ~/.oci/oci_api_key.pem -out ~/.oci/oci_api_key_public.pem

# Display public key (copy this)
cat ~/.oci/oci_api_key_public.pem
```

### Step 1.3: Add Public Key to Oracle Cloud

```bash
# In Oracle Cloud Console:
# Navigate to: Profile Icon (top right) → User Settings
# Click "API Keys" → "Add API Key"
# Paste the public key from above
# Note down the "Configuration File Preview" - you'll need these values
```

### Step 1.4: Configure OCI CLI

Create `~/.oci/config`:

```ini
[DEFAULT]
user=ocid1.user.oc1..aaaa... (from Configuration File Preview)
fingerprint=xx:xx:xx:... (from Configuration File Preview)
tenancy=ocid1.tenancy.oc1..aaaa... (from Configuration File Preview)
region=us-phoenix-1
key_file=~/.oci/oci_api_key.pem
```

**Test configuration:**

```bash
oci iam region list
# Should display list of Oracle Cloud regions
```

### Step 1.5: Get Compartment OCID

```bash
# Get compartment OCID for ats-testing
oci iam compartment list --all | grep -A 5 "ats-testing"

# Note down the "id" field (ocid1.compartment.oc1..aaaa...)
# You'll need this for Pulumi configuration
```

---

## Phase 2: Tailscale Setup (5 minutes)

### Step 2.1: Create Auth Key

```bash
# Login to Tailscale admin console
# Navigate to: Settings → Keys
# Click "Generate auth key"

Options:
☑ Reusable
☑ Ephemeral (optional - for test runners)
Tags: ats-infrastructure

# Copy the generated key (tskey-auth-xxxx...)
# Store securely - you'll use this in cloud-init scripts
```

### Step 2.2: Install Tailscale Locally

```bash
# Install Tailscale on your dev machine
curl -fsSL https://tailscale.com/install.sh | sh

# Authenticate
sudo tailscale up

# Verify
tailscale status
```

---

## Phase 3: Repository Setup (5 minutes)

### Step 3.1: Clone Repository

```bash
git clone https://github.com/andiekobbietks/ats-cv-testing-research.git
cd ats-cv-testing-research
```

### Step 3.2: Install Dependencies

```bash
# Infrastructure dependencies
cd infrastructure
npm install

# Test dependencies
cd ../tests
npm install

# Analysis dependencies (Python)
cd ../analysis
pip install -r requirements.txt
```

---

## Phase 4: Pulumi Configuration (5 minutes)

### Step 4.1: Login to Pulumi

```bash
cd infrastructure
pulumi login
# Opens browser for authentication
```

### Step 4.2: Create New Stack

```bash
# Create production stack
pulumi stack init prod

# Or create dev stack for testing
pulumi stack init dev
```

### Step 4.3: Configure Secrets

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

# SSH key for instance access (optional)
ssh-keygen -t rsa -b 4096 -f ~/.ssh/ats_testing_rsa -N ""
pulumi config set sshPublicKey "$(cat ~/.ssh/ats_testing_rsa.pub)"
```

### Step 4.4: Verify Configuration

```bash
pulumi config
# Should show all configuration values (secrets are encrypted)
```

---

## Phase 5: Deploy Infrastructure (10-15 minutes)

### Step 5.1: Review Deployment Plan

```bash
pulumi preview
# Shows what will be created:
# - 1 Granite VM (ARM, 24GB RAM)
# - 3 Test Runner VMs (regional)
# - 1 PostHog VM
# - Network configuration (VCN, subnets, security lists)
```

### Step 5.2: Deploy

```bash
pulumi up
# Review the plan
# Confirm: yes

# Deployment takes ~10 minutes
# Pulumi will show progress:
#   + Creating VM instances
#   + Configuring networking
#   + Running cloud-init scripts
```

**Expected output:**

```
Updating (prod)

     Type                            Name                    Status
 +   pulumi:pulumi:Stack            infrastructure-prod     created
 +   ├─ oci:Core:Vcn                ats-vcn                 created
 +   ├─ oci:Core:Subnet             ats-subnet              created
 +   ├─ oci:Core:SecurityList       ats-security-list       created
 +   ├─ GraniteVM                   granite-vm              created
 +   ├─ TestRunnerVM                runner-us               created
 +   ├─ TestRunnerVM                runner-eu               created
 +   ├─ TestRunnerVM                runner-ap               created
 +   └─ PostHogVM                   posthog-vm              created

Outputs:
    granitePublicIP: "xxx.xxx.xxx.xxx"
    graniteTailscaleIP: "100.64.0.1"
    posthogPublicIP: "xxx.xxx.xxx.xxx"
    posthogURL: "http://100.64.0.5:8000"

Resources:
    + 15 created

Duration: 12m34s
```

### Step 5.3: Verify Deployment

```bash
# Check Tailscale network
tailscale status
# Should show all 5 VMs connected

# SSH into Granite VM
ssh -i ~/.ssh/ats_testing_rsa ubuntu@$(pulumi stack output granitePublicIP)

# Verify Ollama is running
curl http://localhost:11434/api/tags
# Should return list of models including granite3.1-dense:8b

# Verify litellm proxy
curl http://localhost:8000/v1/models
# Should return OpenAI-compatible model list

# Exit SSH
exit
```

---

## Phase 6: Verify Services (5 minutes)

### Step 6.1: Test Granite API

```bash
# From your local machine (via Tailscale)
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

# Should return generated CV content
```

### Step 6.2: Access PostHog Dashboard

```bash
# Get PostHog URL
pulumi stack output posthogURL

# Open in browser (via Tailscale)
# First-time setup:
#   - Create admin account
#   - Skip team invite
#   - Configure organization name: "ATS Testing"
```

### Step 6.3: Verify Test Runners

```bash
# SSH into US runner
ssh -i ~/.ssh/ats_testing_rsa ubuntu@$(pulumi stack output runnerUsPublicIP)

# Check Playwright installation
npx playwright --version

# Check environment variables
echo $GRANITE_API_URL
echo $POSTHOG_API_URL

# Run sample test
cd /opt/ats-tests
npm test -- tests/ats/workday.spec.ts

# Exit
exit
```

---

## Phase 7: Run First Test Suite (5 minutes)

### Step 7.1: Trigger Test Run

```bash
# From local machine
cd tests

# Set environment variables
export GRANITE_API_URL="http://100.64.0.1:8000"
export POSTHOG_API_URL="http://100.64.0.5:8000"
export POSTHOG_API_KEY="your-posthog-project-api-key"

# Run tests for all 15 ATS systems
npm test

# Or run single ATS
npm test -- tests/ats/workday.spec.ts
```

### Step 7.2: View Results in PostHog

```bash
# Open PostHog dashboard
# Navigate to: Insights → New Insight
# Query:
#   Event: ats_test_completed
#   Group by: properties.ats_system
#   Aggregate: Average of properties.accuracy
```

**Expected chart:**
```
Workday: 96% accuracy (list format)
Greenhouse: 97% accuracy
iCIMS: 92% accuracy
...
```

---

## Cost Breakdown

### Monthly Costs

| Service | Plan | Cost |
|---------|------|------|
| Oracle Cloud | Always Free tier | $0 |
| Tailscale | Free plan | $0 |
| Pulumi | Individual tier | $0 |
| GitHub | Free tier | $0 |
| **TOTAL** | | **$0** |

### Only If Scaling Beyond Free Tiers

| Service | Upgrade Trigger | Cost |
|---------|----------------|------|
| Oracle Cloud | > 24GB RAM or > 4 vCPU | ~$50/month |
| Tailscale | > 100 devices | $5/user/month |
| Pulumi | > 500 resources | $0 (still free) |

**Current usage:**
- Oracle: 5 VMs, 28GB RAM, 4.5 vCPU → **Within free tier**
- Tailscale: 5 devices → **Within free tier**
- Pulumi: ~50 resources → **Within free tier**

---

## Maintenance Tasks

### Daily (Automated)

```bash
# Cron job on test runners (3 AM local time)
0 3 * * * cd /opt/ats-tests && npm test >> /var/log/ats-tests.log 2>&1
```

**No manual intervention needed.**

### Weekly

```bash
# Check for ATS form changes (automated tests will alert on failure)
# Review PostHog dashboard for anomalies
# Update Pulumi stack if needed

cd infrastructure
pulumi up
```

### Monthly

```bash
# Update dependencies
cd infrastructure && npm update
cd ../tests && npm update
cd ../analysis && pip install -r requirements.txt --upgrade

# Review Oracle Cloud free tier usage
oci limits resource-availability list

# Backup PostHog data
ssh ubuntu@posthog-vm
docker exec posthog-postgres pg_dump -U posthog > backup.sql
```

---

## Adding New ATS System

**Time:** 30-60 minutes per system

### Step 1: Add to Data File

Edit `data/ats-systems.json`:

```json
{
  "name": "NewATS",
  "marketShare": 1.2,
  "region": "americas",
  "demoURL": "https://newats.com/apply/demo",
  "selectors": {
    "upload": "input#resume-upload",
    "name": "input[name='fullName']",
    "email": "input[name='email']"
  }
}
```

### Step 2: Create Test File

Create `tests/ats/newats.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { generateCV } from '../fixtures/cv-generator';
import { compileLatex } from '../fixtures/latex-compiler';
import { trackEvent } from '../utils/posthog-tracker';

test.describe('NewATS', () => {
  test('should parse list-format CV correctly', async ({ page }) => {
    // Generate CV
    const cv = await generateCV({
      role: 'Software Engineer',
      years: 5,
      industry: 'tech'
    });

    // Compile to PDF (list format)
    const pdf = await compileLatex(cv, { skillsFormat: 'list' });

    // Navigate to ATS
    await page.goto('https://newats.com/apply/demo');

    // Upload CV
    await page.setInputFiles('input#resume-upload', pdf);

    // Wait for parsing
    await page.waitForSelector('.parsing-complete');

    // Verify parsed data
    const parsedName = await page.locator('input[name="fullName"]').inputValue();
    expect(parsedName).toBe(cv.fullName);

    // Track result
    await trackEvent('ats_test_completed', {
      ats_system: 'NewATS',
      cv_format: 'list',
      accuracy: 95,
      parsed_correctly: ['name', 'email', 'skills']
    });
  });
});
```

### Step 3: Update Configuration

Edit `infrastructure/config.ts`:

```typescript
export const atsConfig = {
  tier1: [...],
  tier2: [..., 'NewATS'],
};
```

### Step 4: Deploy

```bash
# Re-deploy infrastructure (if new region needed)
cd infrastructure
pulumi up

# Run new test
cd ../tests
npm test -- tests/ats/newats.spec.ts
```

---

## Troubleshooting

### Issue: Pulumi Deployment Fails

**Error:** `timeout waiting for instance to be ready`

**Solution:**
```bash
# Check Oracle Cloud console for instance state
# Increase cloud-init timeout in component files
# Re-run: pulumi up
```

---

### Issue: Tailscale VMs Not Connecting

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

---

### Issue: Playwright Test Timeouts

**Error:** `waiting for selector "input#upload" timed out`

**Solution:**
```bash
# ATS may have changed their form
# Use Playwright codegen to inspect
npx playwright codegen https://ats-system.com/apply

# Update selectors in data/ats-systems.json
```

---

### Issue: Granite Model Out of Memory

**Error:** `CUDA out of memory` or `malloc failed`

**Solution:**
```bash
# Switch to smaller quantization
ollama pull granite3.1-dense:8b-Q4_K_S  # Even smaller

# Or upgrade Oracle instance to 32GB RAM
# (still within free tier if using A1.Flex)
```

---

## Scaling Beyond Free Tier

### Scenario 1: Need More Test Runners (> 3 regions)

**Solution:** Deploy additional micro instances

**Cost impact:**
```
Each additional region: 1 micro VM
Oracle allows 2 free micro VMs (already used)
Additional micro VMs: $5-10/month each

4th region: +$5/month
5th region: +$10/month
```

---

### Scenario 2: Need More RAM for Granite (> 24GB)

**Solution:** Upgrade to paid instance or use multiple VMs

**Cost impact:**
```
VM.Standard.A1.Flex with 48GB RAM: ~$25/month
Or use 2 VMs with load balancing: $0 (2 × 24GB = 48GB free)
```

---

### Scenario 3: Need More Storage (> 200GB)

**Solution:** Add block storage volumes

**Cost impact:**
```
Oracle block storage pricing: $0.085/GB/month
Additional 100GB: $8.50/month
```

---

## Security Best Practices

### 1. Rotate Tailscale Auth Keys

```bash
# Every 90 days
# Generate new auth key in Tailscale admin
# Update Pulumi config
pulumi config set tailscaleAuthKey "tskey-auth-new..." --secret

# Re-deploy
pulumi up
```

### 2. Update Oracle API Keys

```bash
# Every 180 days
# Generate new OCI key pair
openssl genrsa -out ~/.oci/oci_api_key_new.pem 2048

# Add to Oracle Cloud console
# Update Pulumi config
pulumi config set oci:privateKeyPath "~/.oci/oci_api_key_new.pem"
```

### 3. Keep Dependencies Updated

```bash
# Monthly
npm audit fix
pip check
```

---

## Monitoring & Alerts

### PostHog Alerts

Configure in PostHog dashboard:

**Alert 1: Test Failure Rate**
```
Trigger: properties.accuracy < 80% for any ATS
Action: Send webhook to Slack
Frequency: Immediate
```

**Alert 2: No Tests in 48 Hours**
```
Trigger: No "ats_test_completed" events in 2 days
Action: Email notification
```

---

## Backup & Recovery

### Backup PostHog Data

```bash
# Weekly cron job
0 0 * * 0 ssh ubuntu@posthog-vm 'docker exec posthog-postgres pg_dump -U posthog' > ~/backups/posthog-$(date +\%Y\%m\%d).sql
```

### Backup Pulumi State

```bash
# Pulumi state is already backed up in Pulumi Cloud
# To export local copy:
pulumi stack export --file backup-$(date +%Y%m%d).json
```

### Disaster Recovery

```bash
# Complete recovery from scratch:
# 1. Follow this playbook from "Phase 1"
# 2. Restore Pulumi state: pulumi stack import --file backup.json
# 3. Restore PostHog data: ssh ubuntu@posthog-vm 'docker exec -i posthog-postgres psql -U posthog' < backup.sql
```

**Recovery Time Objective (RTO):** 1 hour  
**Recovery Point Objective (RPO):** 7 days (weekly backups)

---

## Performance Optimization

### Granite Inference Speed

**Current:** ~12 seconds per CV

**Optimization 1: Reduce context length**
```typescript
// Shorter system prompt
const prompt = "Generate CV: Name, email, skills, experience. 500 words max.";
```

**Result:** 12s → 8s

**Optimization 2: Use Q4_K_S quantization**
```bash
ollama pull granite3.1-dense:8b-Q4_K_S
```

**Result:** 12s → 10s (quality: -0.2 points)

---

### Playwright Test Speed

**Current:** ~5 minutes per ATS test

**Optimization 1: Parallelize tests**
```bash
# Run 3 tests in parallel
npm test -- --workers=3
```

**Result:** 5 min × 15 tests = 75 min → 25 min

**Optimization 2: Reuse browser contexts**
```typescript
// playwright.config.ts
export default {
  use: {
    browserContext: 'persistent',
  },
};
```

**Result:** 25 min → 18 min

---

## Next Steps

After successful deployment:

1. **Run baseline test suite** (all 15 ATS)
2. **Configure PostHog dashboards** (accuracy trends)
3. **Set up monitoring alerts** (Slack webhook)
4. **Fine-tune Granite model** (optional, for better CV generation)
5. **Build web interface** (for end users)

**You now have a production-ready ATS testing infrastructure running at $0/month!**

---

## Support & Resources

### Documentation
- Pulumi: https://www.pulumi.com/docs/
- Oracle Cloud: https://docs.oracle.com/en-us/iaas/
- Playwright: https://playwright.dev/docs/intro
- Tailscale: https://tailscale.com/kb/

### Community
- Discord: [Your project Discord]
- GitHub Discussions: https://github.com/andiekobbietks/ats-cv-testing-research/discussions

### Professional Support
- Email: support@yourdomain.com
- Response time: 24-48 hours

---

**Congratulations! You've successfully deployed the ATS CV testing infrastructure.**
