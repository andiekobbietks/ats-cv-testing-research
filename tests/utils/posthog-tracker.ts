import { PostHog } from 'posthog-node';

export interface ATSTestEvent {
  atsName: string;
  format: 'table' | 'list';
  success: boolean;
  parsingAccuracy?: number;
  fieldsParsed?: {
    firstName: boolean;
    lastName: boolean;
    email: boolean;
    phone: boolean;
    skills: boolean;
  };
  duration: number;
  error?: string;
}

export interface TestRunMetadata {
  testId: string;
  timestamp: string;
  browser: string;
  environment: string;
}

export class PostHogTracker {
  private client: PostHog | null = null;
  private apiKey: string;
  private host: string;
  private enabled: boolean;
  private distinctId: string;

  constructor(config?: {
    apiKey?: string;
    host?: string;
    enabled?: boolean;
    distinctId?: string;
  }) {
    this.apiKey = config?.apiKey || process.env.POSTHOG_API_KEY || '';
    this.host = config?.host || process.env.POSTHOG_HOST || 'https://app.posthog.com';
    this.enabled = config?.enabled !== false && !!this.apiKey;
    this.distinctId = config?.distinctId || process.env.POSTHOG_DISTINCT_ID || 'ats-test-runner';

    if (this.enabled) {
      this.client = new PostHog(this.apiKey, {
        host: this.host,
        flushAt: 1,
        flushInterval: 0,
      });
    }
  }

  async trackATSTest(event: ATSTestEvent, metadata: TestRunMetadata): Promise<void> {
    if (!this.enabled || !this.client) {
      console.log('[PostHog] Tracking disabled, skipping event:', event.atsName);
      return;
    }

    try {
      this.client.capture({
        distinctId: this.distinctId,
        event: 'ats_test_completed',
        properties: {
          ats_name: event.atsName,
          cv_format: event.format,
          success: event.success,
          parsing_accuracy: event.parsingAccuracy,
          fields_parsed: event.fieldsParsed,
          duration_ms: event.duration,
          error: event.error,
          test_id: metadata.testId,
          timestamp: metadata.timestamp,
          browser: metadata.browser,
          environment: metadata.environment,
        },
      });

      await this.flush();
    } catch (error) {
      console.error('[PostHog] Failed to track event:', error);
    }
  }

  async trackTestSuiteStart(metadata: {
    totalTests: number;
    browser: string;
    environment: string;
  }): Promise<void> {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      this.client.capture({
        distinctId: this.distinctId,
        event: 'test_suite_started',
        properties: {
          total_tests: metadata.totalTests,
          browser: metadata.browser,
          environment: metadata.environment,
          timestamp: new Date().toISOString(),
        },
      });

      await this.flush();
    } catch (error) {
      console.error('[PostHog] Failed to track suite start:', error);
    }
  }

  async trackTestSuiteEnd(metadata: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    duration: number;
    browser: string;
    environment: string;
  }): Promise<void> {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      this.client.capture({
        distinctId: this.distinctId,
        event: 'test_suite_completed',
        properties: {
          total_tests: metadata.totalTests,
          passed_tests: metadata.passedTests,
          failed_tests: metadata.failedTests,
          success_rate: (metadata.passedTests / metadata.totalTests) * 100,
          duration_ms: metadata.duration,
          browser: metadata.browser,
          environment: metadata.environment,
          timestamp: new Date().toISOString(),
        },
      });

      await this.flush();
    } catch (error) {
      console.error('[PostHog] Failed to track suite end:', error);
    }
  }

  async trackCVGeneration(metadata: {
    format: 'table' | 'list';
    success: boolean;
    duration: number;
    tokensUsed?: number;
    model?: string;
    error?: string;
  }): Promise<void> {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      this.client.capture({
        distinctId: this.distinctId,
        event: 'cv_generated',
        properties: {
          format: metadata.format,
          success: metadata.success,
          duration_ms: metadata.duration,
          tokens_used: metadata.tokensUsed,
          model: metadata.model,
          error: metadata.error,
          timestamp: new Date().toISOString(),
        },
      });

      await this.flush();
    } catch (error) {
      console.error('[PostHog] Failed to track CV generation:', error);
    }
  }

  async trackPDFCompilation(metadata: {
    format: 'table' | 'list';
    engine: string;
    success: boolean;
    duration: number;
    error?: string;
  }): Promise<void> {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      this.client.capture({
        distinctId: this.distinctId,
        event: 'pdf_compiled',
        properties: {
          format: metadata.format,
          engine: metadata.engine,
          success: metadata.success,
          duration_ms: metadata.duration,
          error: metadata.error,
          timestamp: new Date().toISOString(),
        },
      });

      await this.flush();
    } catch (error) {
      console.error('[PostHog] Failed to track PDF compilation:', error);
    }
  }

  async setPersonProperties(properties: Record<string, unknown>): Promise<void> {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      this.client.identify({
        distinctId: this.distinctId,
        properties,
      });

      await this.flush();
    } catch (error) {
      console.error('[PostHog] Failed to set person properties:', error);
    }
  }

  async flush(): Promise<void> {
    if (!this.client) {
      return;
    }

    return new Promise((resolve) => {
      this.client?.flush();
      // PostHog flush is fire-and-forget in newer versions
      setTimeout(resolve, 100);
    });
  }

  async shutdown(): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.flush();
    await this.client.shutdown();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getDistinctId(): string {
    return this.distinctId;
  }
}

export function createPostHogTracker(config?: {
  apiKey?: string;
  host?: string;
  enabled?: boolean;
  distinctId?: string;
}): PostHogTracker {
  return new PostHogTracker(config);
}

export function calculateParsingAccuracy(
  expected: Record<string, string>,
  actual: Record<string, string>
): { accuracy: number; fieldsParsed: Record<string, boolean> } {
  const fields = Object.keys(expected);
  const fieldsParsed: Record<string, boolean> = {};
  let correctFields = 0;

  for (const field of fields) {
    const expectedValue = expected[field]?.toLowerCase().trim() || '';
    const actualValue = actual[field]?.toLowerCase().trim() || '';
    
    // Use fuzzy matching for better accuracy
    const isMatch = actualValue.includes(expectedValue) || 
                   expectedValue.includes(actualValue) ||
                   levenshteinDistance(expectedValue, actualValue) < 3;
    
    fieldsParsed[field] = isMatch;
    if (isMatch) {
      correctFields++;
    }
  }

  const accuracy = fields.length > 0 ? (correctFields / fields.length) * 100 : 0;

  return { accuracy, fieldsParsed };
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2[i - 1] === str1[j - 1]) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        const substitution = matrix[i - 1]![j - 1]! + 1;
        const insertion = matrix[i]![j - 1]! + 1;
        const deletion = matrix[i - 1]![j]! + 1;
        matrix[i]![j] = Math.min(substitution, insertion, deletion);
      }
    }
  }

  return matrix[str2.length]![str1.length]!;
}
