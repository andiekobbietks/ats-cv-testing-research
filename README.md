"# ATS CV Testing Research

> Mathematical analysis and production infrastructure for testing CV compatibility across 15 Applicant Tracking Systems

[![Coverage](https://img.shields.io/badge/ATS%20Coverage-79%25-success)](./docs/03-mathematical-analysis.md)
[![ROI](https://img.shields.io/badge/ROI-720%25-brightgreen)](./docs/03-mathematical-analysis.md)
[![Cost](https://img.shields.io/badge/Cost-%240%2Fmo-blue)](./docs/04-architecture-decisions.md)
[![Tests](https://img.shields.io/badge/Tests-15%20ATS-purple)](./tests)
[![Infrastructure](https://img.shields.io/badge/IaC-Pulumi-blueviolet)](./infrastructure)

## The Problem

**CVs with table-based skills sections fail ATS autofill**, costing qualified job seekers interviews. This was demonstrated in a viral TikTok by @november.20 showing Philips' ATS completely failing to parse a table-formatted CV.

## The Solution

Apply **optimal stopping theory** to prove we only need to test **15 systems (79% coverage)** instead of all 34.

**Mathematical proof:** Testing beyond 15 systems has **negative ROI** due to diminishing returns.

## Quick Start

```bash
git clone https://github.com/andiekobbietks/ats-cv-testing-research
cd ats-cv-testing-research
./scripts/deploy.sh
```

## Repository Structure

- **[docs/](./docs/)** - 6 research documents (120+ pages)
- **[infrastructure/](./infrastructure/)** - Pulumi IaC for Oracle Cloud
- **[tests/](./tests/)** - 15 Playwright test files
- **[analysis/](./analysis/)** - Mathematical models and simulations
- **[data/](./data/)** - ATS market data and configurations
- **[scripts/](./scripts/)** - Deployment and reporting tools

## Research Documentation

1. **[Problem Statement](./docs/01-problem-statement.md)** - Origin story and TikTok analysis
2. **[Research Journey](./docs/02-research-journey.md)** - Thought process evolution
3. **[Mathematical Analysis](./docs/03-mathematical-analysis.md)** ⭐ - Optimal stopping theory
4. **[Architecture Decisions](./docs/04-architecture-decisions.md)** - Technology stack
5. **[Competitive Landscape](./docs/05-competitive-landscape.md)** - Market analysis
6. **[Deployment Playbook](./docs/06-deployment-playbook.md)** - Replication guide

## License

MIT

## Citation

```bibtex
@misc{ats-cv-testing-2026,
  author = {Andie Kobbie},
  title = {ATS CV Testing Research},
  year = {2026},
  url = {https://github.com/andiekobbietks/ats-cv-testing-research}
}
```" 
