#!/bin/bash
set -e

echo "=========================================="
echo "ATS CV Testing Research - One-Click Deploy"
echo "=========================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install from https://nodejs.org"
    exit 1
fi

if ! command -v pulumi &> /dev/null; then
    echo "❌ Pulumi CLI not found. Install from https://www.pulumi.com/docs/get-started/install/"
    exit 1
fi

if ! command -v oci &> /dev/null; then
    echo "❌ Oracle Cloud CLI not found. Install from https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliinstall.htm"
    exit 1
fi

echo "✅ All prerequisites found"
echo ""

# Prompt for configuration
echo "Configuration Setup"
echo "==================="
echo ""

read -p "Oracle Cloud Compartment OCID: " COMPARTMENT_ID
read -p "Tailscale Auth Key: " TAILSCALE_KEY

# Navigate to infrastructure
cd infrastructure

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

# Initialize Pulumi stack
echo ""
echo "Initializing Pulumi stack..."
pulumi login

if ! pulumi stack select prod 2>/dev/null; then
    echo "Creating new stack 'prod'..."
    pulumi stack init prod
fi

# Configure secrets
echo ""
echo "Configuring Pulumi secrets..."
pulumi config set compartmentId "$COMPARTMENT_ID" --secret
pulumi config set tailscaleAuthKey "$TAILSCALE_KEY" --secret

# Generate SSH key if not exists
if [ ! -f ~/.ssh/ats_testing_rsa ]; then
    echo ""
    echo "Generating SSH key..."
    ssh-keygen -t rsa -b 4096 -f ~/.ssh/ats_testing_rsa -N ""
fi

pulumi config set sshPublicKey "$(cat ~/.ssh/ats_testing_rsa.pub)"

# Deploy infrastructure
echo ""
echo "=========================================="
echo "Deploying infrastructure..."
echo "This will take 10-15 minutes"
echo "=========================================="
echo ""

pulumi up --yes

# Get outputs
echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""

GRANITE_IP=$(pulumi stack output granitePublicIP 2>/dev/null || echo "N/A")
POSTHOG_URL=$(pulumi stack output posthogURL 2>/dev/null || echo "N/A")

echo "Granite VM Public IP: $GRANITE_IP"
echo "PostHog Dashboard: $POSTHOG_URL"
echo ""
echo "Next Steps:"
echo "1. Wait 5-10 minutes for cloud-init to complete"
echo "2. Verify Tailscale: tailscale status"
echo "3. Test Granite API: curl http://100.64.0.1:8000/v1/models"
echo "4. Access PostHog: $POSTHOG_URL"
echo "5. Run tests: cd ../tests && npm test"
echo ""
echo "=========================================="
echo "Deployment successful! 🎉"
echo "=========================================="
