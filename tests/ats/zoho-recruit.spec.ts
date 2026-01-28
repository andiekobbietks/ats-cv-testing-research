import { test, expect, Page } from '@playwright/test';
import { createCVGenerator, generateSampleCVRequest } from '../fixtures/cv-generator';
import { createLaTeXCompiler } from '../fixtures/latex-compiler';
import { createPostHogTracker, calculateParsingAccuracy } from '../utils/posthog-tracker';
import atsSystemsData from '../../data/ats-systems.json';

const atsSystem = [...atsSystemsData.tier1, ...atsSystemsData.tier2].find(
  (system) => system.name === 'Zoho Recruit'
);

if (!atsSystem) {
  throw new Error('Zoho Recruit ATS system not found in ats-systems.json');
}

test.describe('Zoho Recruit ATS Tests', () => {
  let cvGenerator: ReturnType<typeof createCVGenerator>;
  let latexCompiler: ReturnType<typeof createLaTeXCompiler>;
  let posthogTracker: ReturnType<typeof createPostHogTracker>;

  test.beforeAll(() => {
    cvGenerator = createCVGenerator();
    latexCompiler = createLaTeXCompiler({ preferPDFKit: true });
    posthogTracker = createPostHogTracker();
  });

  test.afterAll(async () => {
    await posthogTracker.shutdown();
  });

  test('should parse table format CV correctly', async ({ page, browserName }) => {
    await testATSParsing(page, browserName, 'table');
  });

  test('should parse list format CV correctly', async ({ page, browserName }) => {
    await testATSParsing(page, browserName, 'list');
  });

  async function testATSParsing(
    page: Page,
    browserName: string,
    format: 'table' | 'list'
  ): Promise<void> {
    const startTime = Date.now();
    const testId = `zoho-recruit-${format}-${Date.now()}`;

    try {
      // Step 1: Generate CV
      const cvRequest = generateSampleCVRequest(format, Date.now());
      const cvGenStartTime = Date.now();
      const cvResponse = await cvGenerator.generateCV(cvRequest);
      const cvGenDuration = Date.now() - cvGenStartTime;

      await posthogTracker.trackCVGeneration({
        format,
        success: true,
        duration: cvGenDuration,
        tokensUsed: cvResponse.metadata.tokensUsed,
        model: cvResponse.metadata.model,
      });

      // Step 2: Compile to PDF
      const compileStartTime = Date.now();
      const compileResult = await latexCompiler.compile(
        cvResponse.latex,
        `cv-zoho-recruit-${format}-${Date.now()}`,
        { cleanup: true }
      );
      const compileDuration = Date.now() - compileStartTime;

      await posthogTracker.trackPDFCompilation({
        format,
        engine: 'pdfkit',
        success: compileResult.success,
        duration: compileDuration,
        error: compileResult.error,
      });

      expect(compileResult.success).toBe(true);
      expect(compileResult.pdfBuffer).toBeDefined();

      // Step 3: Navigate to ATS
      await page.goto(atsSystem!.demoURL, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForLoadState('domcontentloaded');

      // Step 4: Upload CV
      const uploadSelector = atsSystem!.selectors.upload;
      await page.waitForSelector(uploadSelector, { timeout: 30000 });
      
      const fileInput = await page.locator(uploadSelector);
      await fileInput.setInputFiles({
        name: `cv-${format}.pdf`,
        mimeType: 'application/pdf',
        buffer: compileResult.pdfBuffer!,
      });

      // Wait for parsing
      await page.waitForTimeout(3000);

      // Step 5: Verify parsed fields
      const parsedData = await extractParsedFields(page, atsSystem!.selectors);
      
      const expectedData = {
        firstName: cvRequest.name.split(' ')[0] || '',
        lastName: cvRequest.name.split(' ').slice(1).join(' ') || '',
        email: cvRequest.email,
        phone: cvRequest.phone.replace(/\D/g, ''),
        skills: cvRequest.skills.join(', '),
      };

      const { accuracy, fieldsParsed } = calculateParsingAccuracy(expectedData, parsedData);

      // Step 6: Track results
      const duration = Date.now() - startTime;
      await posthogTracker.trackATSTest(
        {
          atsName: 'Zoho Recruit',
          format,
          success: accuracy >= 70,
          parsingAccuracy: accuracy,
          fieldsParsed: {
            firstName: fieldsParsed.firstName || false,
            lastName: fieldsParsed.lastName || false,
            email: fieldsParsed.email || false,
            phone: fieldsParsed.phone || false,
            skills: fieldsParsed.skills || false,
          },
          duration,
        },
        {
          testId,
          timestamp: new Date().toISOString(),
          browser: browserName,
          environment: process.env.CI ? 'ci' : 'local',
        }
      );

      // Assertions
      expect(accuracy).toBeGreaterThanOrEqual(atsSystem!.parsingQuality[format]);
      expect(fieldsParsed.email).toBe(true);
      expect(fieldsParsed.phone).toBe(true);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      await posthogTracker.trackATSTest(
        {
          atsName: 'Zoho Recruit',
          format,
          success: false,
          duration,
          error: errorMessage,
        },
        {
          testId,
          timestamp: new Date().toISOString(),
          browser: browserName,
          environment: process.env.CI ? 'ci' : 'local',
        }
      );

      throw error;
    }
  }

  async function extractParsedFields(
    page: Page,
    selectors: Record<string, string>
  ): Promise<Record<string, string>> {
    const data: Record<string, string> = {};

    for (const [field, selector] of Object.entries(selectors)) {
      if (field === 'upload') continue;

      try {
        const element = page.locator(selector).first();
        const value = await element.inputValue().catch(() => '');
        data[field] = value.trim();
      } catch {
        data[field] = '';
      }
    }

    return data;
  }
});
