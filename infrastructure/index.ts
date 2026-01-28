import * as pulumi from '@pulumi/pulumi';
import * as oci from '@pulumi/oci';
import { GraniteVM } from './components/GraniteVM';
import { TestRunnerVM } from './components/TestRunnerVM';
import { PostHogVM } from './components/PostHogVM';
import { regionsConfig } from './config';

// Get configuration
const config = new pulumi.Config();
const compartmentId = config.requireSecret('compartmentId');
const tailscaleAuthKey = config.requireSecret('tailscaleAuthKey');
const sshPublicKey = config.get('sshPublicKey') || '';

// Get OCI provider configuration
const ociConfig = new pulumi.Config('oci');
const primaryRegion = ociConfig.require('region');

// Get availability domains for primary region
const availabilityDomains = oci.identity.getAvailabilityDomainsOutput({
  compartmentId: compartmentId,
});

const primaryAD = availabilityDomains.apply(ads => ads.availabilityDomains[0].name);

// Create VCN (Virtual Cloud Network)
const vcn = new oci.core.Vcn('ats-vcn', {
  compartmentId: compartmentId,
  cidrBlocks: [regionsConfig.networking.vcn.cidr],
  displayName: 'ats-testing-vcn',
  dnsLabel: 'atstesting',
  freeformTags: {
    Name: 'ATS Testing VCN',
    Project: 'ATS-CV-Testing',
  },
});

// Create Internet Gateway
const internetGateway = new oci.core.InternetGateway('ats-igw', {
  compartmentId: compartmentId,
  vcnId: vcn.id,
  displayName: 'ats-internet-gateway',
  enabled: true,
  freeformTags: {
    Name: 'ATS Testing IGW',
    Project: 'ATS-CV-Testing',
  },
});

// Create Route Table
const routeTable = new oci.core.RouteTable('ats-route-table', {
  compartmentId: compartmentId,
  vcnId: vcn.id,
  displayName: 'ats-route-table',
  routeRules: [
    {
      destination: '0.0.0.0/0',
      destinationType: 'CIDR_BLOCK',
      networkEntityId: internetGateway.id,
    },
  ],
  freeformTags: {
    Name: 'ATS Testing Route Table',
    Project: 'ATS-CV-Testing',
  },
});

// Create Security List
const securityList = new oci.core.SecurityList('ats-security-list', {
  compartmentId: compartmentId,
  vcnId: vcn.id,
  displayName: 'ats-security-list',
  
  // Egress rules - allow all outbound
  egressSecurityRules: [
    {
      destination: '0.0.0.0/0',
      protocol: 'all',
      description: 'Allow all outbound traffic',
    },
  ],
  
  // Ingress rules
  ingressSecurityRules: [
    {
      protocol: '6', // TCP
      source: '0.0.0.0/0',
      tcpOptions: {
        min: 22,
        max: 22,
      },
      description: 'SSH access',
    },
    {
      protocol: '6', // TCP
      source: regionsConfig.networking.tailscale.network,
      tcpOptions: {
        min: 8000,
        max: 8000,
      },
      description: 'Granite API / PostHog (Tailscale only)',
    },
    {
      protocol: '6', // TCP
      source: regionsConfig.networking.tailscale.network,
      tcpOptions: {
        min: 11434,
        max: 11434,
      },
      description: 'Ollama API (Tailscale only)',
    },
    {
      protocol: '1', // ICMP
      source: '0.0.0.0/0',
      description: 'ICMP for ping',
    },
  ],
  freeformTags: {
    Name: 'ATS Testing Security List',
    Project: 'ATS-CV-Testing',
  },
});

// Create Public Subnet
const publicSubnet = new oci.core.Subnet('ats-public-subnet', {
  compartmentId: compartmentId,
  vcnId: vcn.id,
  cidrBlock: regionsConfig.networking.vcn.subnets[0].cidr,
  displayName: 'ats-public-subnet',
  dnsLabel: 'public',
  routeTableId: routeTable.id,
  securityListIds: [securityList.id],
  prohibitPublicIpOnVnic: false,
  freeformTags: {
    Name: 'ATS Testing Public Subnet',
    Project: 'ATS-CV-Testing',
  },
});

// Deploy Granite VM (ARM, 24GB RAM)
const graniteVM = new GraniteVM('granite-vm', {
  compartmentId: compartmentId,
  subnetId: publicSubnet.id,
  availabilityDomain: primaryAD,
  sshPublicKey: sshPublicKey,
  tailscaleAuthKey: tailscaleAuthKey,
  region: primaryRegion,
  displayName: 'granite-vm',
});

// Deploy PostHog VM
const posthogVM = new PostHogVM('posthog-vm', {
  compartmentId: compartmentId,
  subnetId: publicSubnet.id,
  availabilityDomain: primaryAD,
  sshPublicKey: sshPublicKey,
  tailscaleAuthKey: tailscaleAuthKey,
  region: primaryRegion,
  displayName: 'posthog-vm',
});

// Deploy Test Runner VMs
const graniteApiUrl = `http://${regionsConfig.networking.tailscale.assignments['granite-vm']}:8000`;
const posthogApiUrl = `http://${regionsConfig.networking.tailscale.assignments['posthog-vm']}:8000`;

const testRunners: TestRunnerVM[] = [];

regionsConfig.deployment.testRunners.forEach((runnerConfig) => {
  const region = regionsConfig.regions.find(r => r.name === runnerConfig.region);
  
  if (region) {
    const runner = new TestRunnerVM(runnerConfig.name, {
      compartmentId: compartmentId,
      subnetId: publicSubnet.id,
      availabilityDomain: primaryAD,
      sshPublicKey: sshPublicKey,
      tailscaleAuthKey: tailscaleAuthKey,
      region: runnerConfig.region,
      graniteApiUrl: graniteApiUrl,
      posthogApiUrl: posthogApiUrl,
      atsTargets: region.atsTargets,
      displayName: runnerConfig.name,
      tailscaleIp: regionsConfig.networking.tailscale.assignments[runnerConfig.name],
    });
    
    testRunners.push(runner);
  }
});

// Export important outputs
export const vpcId = vcn.id;
export const vpcCidr = vcn.cidrBlocks;
export const subnetId = publicSubnet.id;

// Granite VM outputs
export const graniteInstanceId = graniteVM.instance.id;
export const granitePublicIP = graniteVM.publicIp;
export const granitePrivateIP = graniteVM.privateIp;
export const graniteTailscaleIP = graniteVM.tailscaleIp;
export const graniteApiURL = graniteApiUrl;

// PostHog VM outputs
export const posthogInstanceId = posthogVM.instance.id;
export const posthogPublicIP = posthogVM.publicIp;
export const posthogPrivateIP = posthogVM.privateIp;
export const posthogTailscaleIP = posthogVM.tailscaleIp;
export const posthogURL = posthogVM.posthogUrl;

// Test Runner outputs - using a Map to store dynamic exports
const testRunnerOutputs: Record<string, pulumi.Output<any> | string | string[]> = {};

testRunners.forEach((runner, index) => {
  const runnerConfig = regionsConfig.deployment.testRunners[index];
  const region = regionsConfig.regions.find(r => r.name === runnerConfig.region);
  
  testRunnerOutputs[`${runnerConfig.name}InstanceId`] = runner.instance.id;
  testRunnerOutputs[`${runnerConfig.name}PublicIP`] = runner.publicIp;
  testRunnerOutputs[`${runnerConfig.name}PrivateIP`] = runner.privateIp;
  testRunnerOutputs[`${runnerConfig.name}TailscaleIP`] = runner.tailscaleIp;
  testRunnerOutputs[`${runnerConfig.name}AtsTargets`] = region?.atsTargets || [];
});

// Export test runner outputs
export const testRunnersOutput = testRunnerOutputs;

// Summary outputs
export const deploymentSummary = pulumi.output({
  infrastructure: {
    vcn: vcn.cidrBlocks,
    region: primaryRegion,
  },
  granite: {
    publicIP: graniteVM.publicIp,
    tailscaleIP: graniteVM.tailscaleIp,
    apiURL: graniteApiUrl,
    model: 'granite3.1-dense:8b',
  },
  posthog: {
    publicIP: posthogVM.publicIp,
    tailscaleIP: posthogVM.tailscaleIp,
    url: posthogVM.posthogUrl,
  },
  testRunners: testRunners.map((runner, i) => ({
    name: regionsConfig.deployment.testRunners[i].name,
    region: regionsConfig.deployment.testRunners[i].region,
    publicIP: runner.publicIp,
    tailscaleIP: runner.tailscaleIp,
    atsTargets: regionsConfig.regions.find(
      r => r.name === regionsConfig.deployment.testRunners[i].region
    )?.atsTargets || [],
  })),
  totalResources: {
    vms: 2 + testRunners.length,
    armOCPUs: 4,
    armMemoryGB: 24,
    microInstances: 1 + testRunners.length,
  },
});

// Connection instructions
export const sshCommands = pulumi.output({
  granite: graniteVM.publicIp.apply(ip => `ssh -i ~/.ssh/ats_testing_rsa ubuntu@${ip}`),
  posthog: posthogVM.publicIp.apply(ip => `ssh -i ~/.ssh/ats_testing_rsa ubuntu@${ip}`),
  testRunners: testRunners.map((runner, i) => ({
    name: regionsConfig.deployment.testRunners[i].name,
    command: runner.publicIp.apply(ip => `ssh -i ~/.ssh/ats_testing_rsa ubuntu@${ip}`),
  })),
});

// Health check commands
export const healthCheckCommands = {
  granite: 'ssh ubuntu@granite-vm "/usr/local/bin/granite-health-check.sh"',
  posthog: 'ssh ubuntu@posthog-vm "/usr/local/bin/posthog-health-check.sh"',
  testRunners: testRunners.map((_, i) => ({
    name: regionsConfig.deployment.testRunners[i].name,
    command: `ssh ubuntu@${regionsConfig.deployment.testRunners[i].name} "/usr/local/bin/test-runner-health-check.sh"`,
  })),
};
