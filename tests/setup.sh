#!/bin/bash

# ATS CV Testing Research - Quick Start Script
# This script helps you get started with the Playwright test suite

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ATS CV Testing Research - Quick Start                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if in correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the tests/ directory"
    exit 1
fi

echo "📦 Step 1: Installing dependencies..."
npm install

echo ""
echo "🎭 Step 2: Installing Playwright browsers..."
npx playwright install chromium

echo ""
echo "✅ Step 3: Checking TypeScript compilation..."
npx tsc --noEmit

echo ""
echo "📝 Step 4: Setting up environment variables..."
if [ ! -f ".env" ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env and add your API keys:"
    echo "   - GRANITE_API_KEY (required)"
    echo "   - POSTHOG_API_KEY (optional)"
else
    echo "✓ .env file already exists"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Setup Complete!                                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "🚀 Quick Commands:"
echo ""
echo "  Run all tests:              npm test"
echo "  Run specific ATS:           npx playwright test ats/workday.spec.ts"
echo "  Run with UI mode:           npm run test:ui"
echo "  Run in headed mode:         npm run test:headed"
echo "  Debug mode:                 npm run test:debug"
echo ""
echo "📚 Documentation: See README.md for detailed information"
echo ""
echo "⚙️  Next Steps:"
echo "  1. Edit .env and add your API keys"
echo "  2. Run: npm test"
echo ""
