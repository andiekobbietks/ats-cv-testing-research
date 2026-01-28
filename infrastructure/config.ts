import * as fs from 'fs';
import * as path from 'path';

export interface Region {
  name: string;
  displayName: string;
  continent: string;
  country: string;
  availability: string;
  capabilities: {
    armInstances: boolean;
    x86Instances: boolean;
    blockStorage: boolean;
    objectStorage: boolean;
    loadBalancer: boolean;
  };
  atsTargets: string[];
  purpose: string;
  timezone: string;
  latencyToATS: Record<string, string>;
}

export interface TestRunner {
  name: string;
  region: string;
  instance: string;
  ocpu: number;
  memory: number;
  purpose: string;
}

export interface ATSSystem {
  name: string;
  marketShare: number;
  globalRank: number;
  region: string;
  tier: number;
  strengths: string[];
  demoURL: string;
  selectors: Record<string, string>;
  parsingQuality: {
    table: number;
    list: number;
    grade: string;
  };
}

export interface RegionsConfig {
  regions: Region[];
  deployment: {
    granite: {
      region: string;
      instance: string;
      ocpu: number;
      memory: number;
      rationale: string;
    };
    testRunners: TestRunner[];
    posthog: {
      region: string;
      instance: string;
      ocpu: number;
      memory: number;
      storage: string;
      rationale: string;
    };
  };
  networking: {
    vcn: {
      cidr: string;
      subnets: Array<{
        name: string;
        cidr: string;
        type: string;
        purpose: string;
      }>;
    };
    tailscale: {
      network: string;
      assignments: Record<string, string>;
      purpose: string;
    };
  };
}

export interface ATSSystemsConfig {
  tier1: ATSSystem[];
  tier2: ATSSystem[];
  metadata: {
    totalSystems: number;
    totalMarketCoverage: number;
    tier1Coverage: number;
    tier2Coverage: number;
    lastUpdated: string;
    sources: string[];
  };
}

const dataDir = path.resolve(__dirname, '../data');

export function loadRegionsConfig(): RegionsConfig {
  const regionsPath = path.join(dataDir, 'regions.json');
  const content = fs.readFileSync(regionsPath, 'utf-8');
  return JSON.parse(content) as RegionsConfig;
}

export function loadATSSystemsConfig(): ATSSystemsConfig {
  const atsPath = path.join(dataDir, 'ats-systems.json');
  const content = fs.readFileSync(atsPath, 'utf-8');
  return JSON.parse(content) as ATSSystemsConfig;
}

export const regionsConfig = loadRegionsConfig();
export const atsSystemsConfig = loadATSSystemsConfig();

export const allATSSystems = [...atsSystemsConfig.tier1, ...atsSystemsConfig.tier2];
