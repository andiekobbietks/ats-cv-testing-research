import axios, { AxiosInstance } from 'axios';

export interface CVGenerationRequest {
  name: string;
  email: string;
  phone: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
  format: 'table' | 'list';
}

export interface ExperienceEntry {
  company: string;
  position: string;
  startDate: string;
  endDate: string;
  description: string[];
}

export interface EducationEntry {
  institution: string;
  degree: string;
  field: string;
  graduationDate: string;
}

export interface CVGenerationResponse {
  latex: string;
  format: 'table' | 'list';
  metadata: {
    generatedAt: string;
    model: string;
    tokensUsed: number;
  };
}

export class CVGenerator {
  private client: AxiosInstance;
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor(config?: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
  }) {
    this.apiKey = config?.apiKey || process.env.GRANITE_API_KEY || '';
    this.baseURL = config?.baseURL || process.env.GRANITE_API_URL || 'https://api.granite.ai/v1';
    this.model = config?.model || process.env.GRANITE_MODEL || 'granite-3-8b-instruct';

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });
  }

  async generateCV(request: CVGenerationRequest): Promise<CVGenerationResponse> {
    const prompt = this.buildPrompt(request);
    
    try {
      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert LaTeX CV generator. Generate clean, professional CVs in LaTeX format. Output only the LaTeX code, no explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4096,
      });

      const latex = this.extractLatex(response.data.choices[0]?.message?.content || '');

      return {
        latex,
        format: request.format,
        metadata: {
          generatedAt: new Date().toISOString(),
          model: response.data.model || this.model,
          tokensUsed: response.data.usage?.total_tokens || 0,
        }
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Granite API error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  private buildPrompt(request: CVGenerationRequest): string {
    const formatInstructions = request.format === 'table' 
      ? 'Use tabular environment for experience and education sections with columns for dates, companies/institutions, and roles/degrees.'
      : 'Use itemize and description environments for experience and education sections with clear date ranges and bullet points.';

    return `Generate a professional CV in LaTeX format with the following details:

Name: ${request.name}
Email: ${request.email}
Phone: ${request.phone}

Format: ${request.format.toUpperCase()}
${formatInstructions}

Experience:
${request.experience.map(exp => `
- ${exp.position} at ${exp.company}
  ${exp.startDate} - ${exp.endDate}
  ${exp.description.map(d => `  • ${d}`).join('\n')}
`).join('\n')}

Education:
${request.education.map(edu => `
- ${edu.degree} in ${edu.field}
  ${edu.institution}, ${edu.graduationDate}
`).join('\n')}

Skills:
${request.skills.join(', ')}

Requirements:
1. Use standard article or moderncv document class
2. Include proper contact information header
3. ${formatInstructions}
4. Professional formatting with clear section headers
5. Include all information provided
6. Output ONLY valid LaTeX code, no markdown code blocks or explanations

Begin the LaTeX document with \\documentclass and end with \\end{document}.`;
  }

  private extractLatex(content: string): string {
    // Remove markdown code blocks if present
    let latex = content.trim();
    
    if (latex.startsWith('```latex') || latex.startsWith('```')) {
      latex = latex.replace(/^```(?:latex)?\n?/, '').replace(/```\s*$/, '');
    }
    
    // Ensure document starts with \documentclass
    if (!latex.includes('\\documentclass')) {
      throw new Error('Generated content does not contain valid LaTeX document structure');
    }
    
    return latex.trim();
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/models');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  getModel(): string {
    return this.model;
  }

  isConfigured(): boolean {
    return !!this.apiKey && !!this.baseURL;
  }
}

export function createCVGenerator(config?: {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}): CVGenerator {
  return new CVGenerator(config);
}

export function generateSampleCVRequest(
  format: 'table' | 'list',
  seed?: number
): CVGenerationRequest {
  const random = seed !== undefined ? seededRandom(seed) : Math.random;
  
  const names = ['John Smith', 'Jane Doe', 'Michael Johnson', 'Sarah Williams', 'David Brown'];
  const companies = ['Tech Corp', 'Innovation Labs', 'Digital Solutions', 'Cloud Systems', 'Data Dynamics'];
  const positions = ['Software Engineer', 'Senior Developer', 'Tech Lead', 'Full Stack Developer', 'Backend Engineer'];
  const skills = ['Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'AWS', 'Docker', 'Kubernetes', 'PostgreSQL', 'MongoDB'];
  
  const name = names[Math.floor(random() * names.length)] || 'John Smith';
  
  return {
    name,
    email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
    phone: `+1 (555) ${String(Math.floor(random() * 900) + 100).padStart(3, '0')}-${String(Math.floor(random() * 9000) + 1000).padStart(4, '0')}`,
    experience: [
      {
        company: companies[Math.floor(random() * companies.length)] || 'Tech Corp',
        position: positions[Math.floor(random() * positions.length)] || 'Software Engineer',
        startDate: '2020-01',
        endDate: '2023-12',
        description: [
          'Developed and maintained web applications using modern frameworks',
          'Collaborated with cross-functional teams to deliver features',
          'Implemented CI/CD pipelines and improved deployment processes'
        ]
      },
      {
        company: companies[Math.floor(random() * companies.length)] || 'Innovation Labs',
        position: 'Junior Developer',
        startDate: '2018-06',
        endDate: '2019-12',
        description: [
          'Built RESTful APIs and microservices',
          'Wrote unit and integration tests',
          'Participated in code reviews and agile ceremonies'
        ]
      }
    ],
    education: [
      {
        institution: 'University of Technology',
        degree: 'Bachelor of Science',
        field: 'Computer Science',
        graduationDate: '2018-05'
      }
    ],
    skills: skills.slice(0, 6 + Math.floor(random() * 4)),
    format
  };
}

function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}
