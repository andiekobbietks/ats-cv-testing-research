import PDFDocument from 'pdfkit';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface LaTeXCompileOptions {
  engine?: 'pdflatex' | 'xelatex' | 'lualatex' | 'pdfkit';
  outputDir?: string;
  cleanup?: boolean;
  timeout?: number;
}

export interface CompileResult {
  success: boolean;
  pdfPath: string;
  pdfBuffer?: Buffer;
  logs?: string;
  error?: string;
}

export class LaTeXCompiler {
  private defaultEngine: 'pdflatex' | 'pdfkit';
  private tempDir: string;

  constructor(options?: { preferPDFKit?: boolean; tempDir?: string }) {
    this.defaultEngine = options?.preferPDFKit ? 'pdfkit' : 'pdflatex';
    this.tempDir = options?.tempDir || path.join(os.tmpdir(), 'ats-latex-compile');
  }

  async compile(
    latex: string,
    outputName: string,
    options?: LaTeXCompileOptions
  ): Promise<CompileResult> {
    const engine = options?.engine || this.defaultEngine;
    const outputDir = options?.outputDir || this.tempDir;
    const cleanup = options?.cleanup !== false;

    await fs.mkdir(outputDir, { recursive: true });

    try {
      if (engine === 'pdfkit') {
        return await this.compileWithPDFKit(latex, outputName, outputDir);
      } else {
        return await this.compileWithLaTeX(latex, outputName, outputDir, engine, options?.timeout);
      }
    } finally {
      if (cleanup) {
        await this.cleanupAuxiliaryFiles(outputDir, outputName);
      }
    }
  }

  private async compileWithLaTeX(
    latex: string,
    outputName: string,
    outputDir: string,
    engine: 'pdflatex' | 'xelatex' | 'lualatex',
    timeout?: number
  ): Promise<CompileResult> {
    const texPath = path.join(outputDir, `${outputName}.tex`);
    const pdfPath = path.join(outputDir, `${outputName}.pdf`);

    try {
      await fs.writeFile(texPath, latex, 'utf-8');

      const command = `${engine} -interaction=nonstopmode -output-directory="${outputDir}" "${texPath}"`;
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: timeout || 30000,
        maxBuffer: 10 * 1024 * 1024,
      });

      try {
        await fs.access(pdfPath);
        const pdfBuffer = await fs.readFile(pdfPath);

        return {
          success: true,
          pdfPath,
          pdfBuffer,
          logs: stdout + stderr,
        };
      } catch {
        return {
          success: false,
          pdfPath,
          logs: stdout + stderr,
          error: 'PDF file was not generated',
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        pdfPath,
        error: errorMessage,
        logs: errorMessage,
      };
    }
  }

  private async compileWithPDFKit(
    latex: string,
    outputName: string,
    outputDir: string
  ): Promise<CompileResult> {
    const pdfPath = path.join(outputDir, `${outputName}.pdf`);

    try {
      const cvData = this.parseLatexToStructuredData(latex);
      const pdfBuffer = await this.generatePDFFromStructuredData(cvData);

      await fs.writeFile(pdfPath, pdfBuffer);

      return {
        success: true,
        pdfPath,
        pdfBuffer,
        logs: 'Compiled with PDFKit fallback',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        pdfPath,
        error: `PDFKit compilation failed: ${errorMessage}`,
      };
    }
  }

  private parseLatexToStructuredData(latex: string): CVStructuredData {
    const data: CVStructuredData = {
      name: '',
      email: '',
      phone: '',
      sections: [],
    };

    // Extract name (look for \name{} or first bold/Large text)
    const nameMatch = latex.match(/\\name\{([^}]+)\}|\\textbf\{\\Large\s+([^}]+)\}/);
    if (nameMatch) {
      data.name = (nameMatch[1] || nameMatch[2] || '').trim();
    }

    // Extract email
    const emailMatch = latex.match(/\\email\{([^}]+)\}|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      data.email = (emailMatch[1] || emailMatch[2] || '').trim();
    }

    // Extract phone
    const phoneMatch = latex.match(/\\phone\{([^}]+)\}|(\+?[\d\s\-()]{10,})/);
    if (phoneMatch) {
      data.phone = (phoneMatch[1] || phoneMatch[2] || '').trim();
    }

    // Extract sections (section, subsection, or \cventry)
    const sectionRegex = /\\(?:section|subsection)\{([^}]+)\}([^\\]*(?:\\(?!(?:section|subsection))[^\\]*)*)/g;
    let match;

    while ((match = sectionRegex.exec(latex)) !== null) {
      const title = match[1]?.trim() || '';
      const content = match[2]?.trim() || '';
      
      if (title && content) {
        data.sections.push({
          title,
          content: this.cleanLatexContent(content),
        });
      }
    }

    return data;
  }

  private cleanLatexContent(content: string): string {
    return content
      .replace(/\\textbf\{([^}]+)\}/g, '$1')
      .replace(/\\textit\{([^}]+)\}/g, '$1')
      .replace(/\\emph\{([^}]+)\}/g, '$1')
      .replace(/\\item\s*/g, '• ')
      .replace(/\\\\/g, '\n')
      .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
      .replace(/\\[a-zA-Z]+/g, '')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async generatePDFFromStructuredData(data: CVStructuredData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      if (data.name) {
        doc.fontSize(24).font('Helvetica-Bold').text(data.name, { align: 'center' });
        doc.moveDown(0.5);
      }

      // Contact info
      const contactInfo = [data.email, data.phone].filter(Boolean).join(' | ');
      if (contactInfo) {
        doc.fontSize(10).font('Helvetica').text(contactInfo, { align: 'center' });
        doc.moveDown(1);
      }

      // Sections
      for (const section of data.sections) {
        doc.fontSize(14).font('Helvetica-Bold').text(section.title);
        doc.moveDown(0.3);
        
        doc.fontSize(10).font('Helvetica').text(section.content, {
          align: 'left',
          lineGap: 2,
        });
        
        doc.moveDown(1);
      }

      doc.end();
    });
  }

  private async cleanupAuxiliaryFiles(outputDir: string, baseName: string): Promise<void> {
    const extensions = ['.aux', '.log', '.out', '.toc', '.tex'];
    
    for (const ext of extensions) {
      try {
        await fs.unlink(path.join(outputDir, `${baseName}${ext}`));
      } catch {
        // Ignore errors for files that don't exist
      }
    }
  }

  async checkLaTeXInstallation(): Promise<{ installed: boolean; engines: string[] }> {
    const engines = ['pdflatex', 'xelatex', 'lualatex'];
    const availableEngines: string[] = [];

    for (const engine of engines) {
      try {
        await execAsync(`which ${engine}`);
        availableEngines.push(engine);
      } catch {
        // Engine not found
      }
    }

    return {
      installed: availableEngines.length > 0,
      engines: availableEngines,
    };
  }

  setDefaultEngine(engine: 'pdflatex' | 'pdfkit'): void {
    this.defaultEngine = engine;
  }

  getTempDir(): string {
    return this.tempDir;
  }
}

interface CVStructuredData {
  name: string;
  email: string;
  phone: string;
  sections: Array<{ title: string; content: string }>;
}

export function createLaTeXCompiler(options?: {
  preferPDFKit?: boolean;
  tempDir?: string;
}): LaTeXCompiler {
  return new LaTeXCompiler(options);
}
