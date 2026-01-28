#!/usr/bin/env python3
"""
Visualization Generator for ATS Analysis

Generates all publication-quality charts for the ATS CV Testing Research.
Creates professional visualizations for ROI analysis, market coverage,
and regional distribution.
"""

import numpy as np
import matplotlib.pyplot as plt
import pandas as pd
import json
from pathlib import Path
from typing import Dict, List, Tuple

# Styling
plt.style.use('seaborn-v0_8-darkgrid')
COLORS = {
    'primary': '#2E86AB',
    'secondary': '#A23B72',
    'accent': '#F18F01',
    'success': '#06A77D',
    'danger': '#C73E1D',
    'tier1': '#4A90E2',
    'tier2': '#7B68EE',
    'longtail': '#FFB347',
}


def load_data() -> Dict:
    """Load data from JSON files"""
    base_path = Path(__file__).parent.parent.parent / 'data'
    
    with open(base_path / 'ats-systems.json', 'r') as f:
        ats_data = json.load(f)
    
    # Market data not strictly needed for visualization
    market_data = {}
    
    return {'ats': ats_data, 'market': market_data}


def create_roi_vs_systems_chart(output_dir: Path):
    """Chart 1: ROI vs Number of Systems Tested"""
    
    # Data from ROI calculator model
    systems = [5, 10, 15, 20, 34]
    roi_12m = [456.3, 523.7, 548.2, 512.8, 387.4]  # 12-month ROI %
    roi_24m = [685.1, 743.8, 762.9, 724.5, 618.3]  # 24-month ROI %
    
    fig, ax = plt.subplots(figsize=(12, 7))
    
    # Plot both timeframes
    x = np.arange(len(systems))
    width = 0.35
    
    bars1 = ax.bar(x - width/2, roi_12m, width, label='12-Month ROI', 
                   color=COLORS['primary'], alpha=0.8, edgecolor='black', linewidth=1.5)
    bars2 = ax.bar(x + width/2, roi_24m, width, label='24-Month ROI',
                   color=COLORS['success'], alpha=0.8, edgecolor='black', linewidth=1.5)
    
    # Highlight optimal point
    ax.axvline(x=2, color=COLORS['accent'], linestyle='--', linewidth=3,
              label='Optimal: 15 systems', alpha=0.8)
    
    # Labels and formatting
    ax.set_xlabel('Number of ATS Systems Tested', fontsize=13, fontweight='bold')
    ax.set_ylabel('Return on Investment (%)', fontsize=13, fontweight='bold')
    ax.set_title('ROI Analysis: Optimal Stopping at 15 Systems\n' +
                'Peak ROI at 79.5% Market Coverage',
                fontsize=15, fontweight='bold', pad=20)
    ax.set_xticks(x)
    ax.set_xticklabels(systems)
    ax.legend(loc='upper right', fontsize=11, framealpha=0.9)
    ax.grid(True, alpha=0.3, axis='y')
    
    # Add value labels on bars
    for bars in [bars1, bars2]:
        for bar in bars:
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height,
                   f'{height:.0f}%',
                   ha='center', va='bottom', fontsize=9, fontweight='bold')
    
    # Add annotation for optimal point
    ax.annotate('Maximum ROI\n548% (12M)\n763% (24M)',
               xy=(2, roi_24m[2]), xytext=(3.2, roi_24m[2] + 50),
               fontsize=10, fontweight='bold',
               bbox=dict(boxstyle='round,pad=0.8', facecolor='yellow', alpha=0.8),
               arrowprops=dict(arrowstyle='->', lw=2.5, color=COLORS['accent']))
    
    plt.tight_layout()
    plt.savefig(output_dir / 'roi_vs_systems.png', dpi=300, bbox_inches='tight')
    print(f"✓ Created: roi_vs_systems.png")
    plt.close()


def create_coverage_chart(output_dir: Path):
    """Chart 2: Market Coverage vs Systems Tested"""
    
    data = load_data()
    
    # Extract cumulative coverage
    tier1_systems = data['ats']['tier1']
    tier2_systems = data['ats']['tier2']
    
    systems = []
    coverage = []
    cumulative = 0
    
    for i, system in enumerate(tier1_systems + tier2_systems, 1):
        systems.append(i)
        cumulative += system['marketShare']
        coverage.append(cumulative)
    
    # Extend with long tail estimate
    systems.extend([20, 25, 30, 34])
    coverage.extend([87.3, 92.1, 96.2, 100.0])
    
    fig, ax = plt.subplots(figsize=(13, 7))
    
    # Plot coverage curve
    ax.plot(systems, coverage, 'o-', color=COLORS['primary'], 
           linewidth=3, markersize=8, label='Actual Coverage', markeredgecolor='black')
    
    # Color regions
    ax.axhspan(0, 49.5, alpha=0.1, color=COLORS['tier1'], label='Tier 1 (Top 5)')
    ax.axhspan(49.5, 79.5, alpha=0.1, color=COLORS['tier2'], label='Tier 2 (6-15)')
    ax.axhspan(79.5, 100, alpha=0.1, color=COLORS['longtail'], label='Long Tail (16+)')
    
    # Mark key milestones
    milestones = [
        (5, 49.5, 'Tier 1\n49.5%'),
        (15, 79.5, 'Optimal\n79.5%'),
        (34, 100.0, 'Full\n100%'),
    ]
    
    for x, y, label in milestones:
        ax.axvline(x=x, color='gray', linestyle='--', linewidth=1.5, alpha=0.6)
        ax.axhline(y=y, color='gray', linestyle='--', linewidth=1.5, alpha=0.6)
        ax.plot(x, y, 'o', markersize=12, color=COLORS['danger'], 
               markeredgecolor='black', markeredgewidth=2, zorder=5)
        ax.text(x, y + 5, label, fontsize=10, fontweight='bold',
               ha='center', bbox=dict(boxstyle='round,pad=0.5', 
               facecolor='white', alpha=0.9, edgecolor='black'))
    
    # Pareto principle line
    ax.plot([0, 34], [0, 100], 'k--', linewidth=1.5, alpha=0.3, label='Linear')
    
    # Labels
    ax.set_xlabel('Number of ATS Systems Tested', fontsize=13, fontweight='bold')
    ax.set_ylabel('Cumulative Market Coverage (%)', fontsize=13, fontweight='bold')
    ax.set_title('Market Coverage vs Systems Tested\n' +
                'Pareto Principle: 15 Systems = 79.5% Coverage',
                fontsize=15, fontweight='bold', pad=20)
    ax.legend(loc='lower right', fontsize=10, framealpha=0.9)
    ax.grid(True, alpha=0.3)
    ax.set_xlim(0, 36)
    ax.set_ylim(0, 105)
    
    plt.tight_layout()
    plt.savefig(output_dir / 'market_coverage.png', dpi=300, bbox_inches='tight')
    print(f"✓ Created: market_coverage.png")
    plt.close()


def create_marginal_gain_chart(output_dir: Path):
    """Chart 3: Marginal Gain (Diminishing Returns)"""
    
    data = load_data()
    
    systems = []
    names = []
    shares = []
    colors = []
    
    # Tier 1
    for system in data['ats']['tier1']:
        systems.append(len(systems) + 1)
        names.append(system['name'])
        shares.append(system['marketShare'])
        colors.append(COLORS['tier1'])
    
    # Tier 2
    for system in data['ats']['tier2']:
        systems.append(len(systems) + 1)
        names.append(system['name'])
        shares.append(system['marketShare'])
        colors.append(COLORS['tier2'])
    
    fig, ax = plt.subplots(figsize=(14, 8))
    
    # Create bar chart
    bars = ax.bar(systems, shares, color=colors, alpha=0.8, 
                  edgecolor='black', linewidth=1.2)
    
    # Add dividers
    ax.axvline(x=5.5, color='red', linestyle='--', linewidth=2.5, 
              label='Tier 1 → Tier 2', alpha=0.8)
    ax.axvline(x=15.5, color='orange', linestyle='--', linewidth=2.5,
              label='Tier 2 → Long Tail', alpha=0.8)
    
    # Labels
    ax.set_xlabel('ATS System (Ranked by Market Share)', fontsize=13, fontweight='bold')
    ax.set_ylabel('Market Share (%)', fontsize=13, fontweight='bold')
    ax.set_title('Marginal Gain per System: Diminishing Returns\n' +
                'Power Law Distribution (Pareto α ≈ 0.8)',
                fontsize=15, fontweight='bold', pad=20)
    ax.set_xticks(systems)
    ax.set_xticklabels(names, rotation=45, ha='right', fontsize=9)
    ax.legend(loc='upper right', fontsize=11, framealpha=0.9)
    ax.grid(True, alpha=0.3, axis='y')
    
    # Add value labels on significant bars
    for i, bar in enumerate(bars):
        if i < 5 or shares[i] > 2.0:  # Label tier 1 and significant tier 2
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height,
                   f'{height:.1f}%',
                   ha='center', va='bottom', fontsize=8, fontweight='bold')
    
    # Add annotation showing diminishing returns
    ax.annotate('Top 5: 49.5%\n(9.9% avg)',
               xy=(3, 10), xytext=(3, 14),
               fontsize=10, fontweight='bold',
               bbox=dict(boxstyle='round,pad=0.6', facecolor='lightblue', alpha=0.9),
               arrowprops=dict(arrowstyle='->', lw=2))
    
    ax.annotate('Next 10: 30%\n(3.0% avg)',
               xy=(10, 2.5), xytext=(10, 8),
               fontsize=10, fontweight='bold',
               bbox=dict(boxstyle='round,pad=0.6', facecolor='lightgreen', alpha=0.9),
               arrowprops=dict(arrowstyle='->', lw=2))
    
    plt.tight_layout()
    plt.savefig(output_dir / 'marginal_gain.png', dpi=300, bbox_inches='tight')
    print(f"✓ Created: marginal_gain.png")
    plt.close()


def create_regional_distribution_chart(output_dir: Path):
    """Chart 4: Regional Market Distribution"""
    
    data = load_data()
    
    regions = ['Americas', 'EMEA', 'APAC']
    shares = [40, 35, 25]
    values = [2720, 2380, 1700]  # Millions USD
    
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 7))
    
    # Pie chart
    colors_pie = [COLORS['primary'], COLORS['secondary'], COLORS['accent']]
    explode = (0.05, 0.05, 0.05)
    
    wedges, texts, autotexts = ax1.pie(shares, labels=regions, autopct='%1.1f%%',
                                        startangle=90, colors=colors_pie, explode=explode,
                                        textprops={'fontsize': 12, 'fontweight': 'bold'},
                                        wedgeprops={'edgecolor': 'black', 'linewidth': 2})
    
    ax1.set_title('Global Market Share by Region\n$6.8B Total Market (2026)',
                 fontsize=14, fontweight='bold', pad=20)
    
    # Bar chart with values
    bars = ax2.bar(regions, values, color=colors_pie, alpha=0.8, 
                   edgecolor='black', linewidth=2)
    
    ax2.set_ylabel('Market Value (Millions USD)', fontsize=12, fontweight='bold')
    ax2.set_title('Regional Market Values\nCAGR: 12.5% (2023-2026)',
                 fontsize=14, fontweight='bold', pad=20)
    ax2.grid(True, alpha=0.3, axis='y')
    
    # Add value labels
    for bar in bars:
        height = bar.get_height()
        ax2.text(bar.get_x() + bar.get_width()/2., height,
                f'${height:,.0f}M\n({height/68:.0f}%)',
                ha='center', va='bottom', fontsize=11, fontweight='bold')
    
    # Add regional characteristics
    characteristics = {
        'Americas': 'U.S.-dominated\nIntegration-focused',
        'EMEA': 'GDPR compliance\nMultilingual',
        'APAC': 'Fastest growth (18%)\nMobile-first'
    }
    
    for i, (region, char) in enumerate(characteristics.items()):
        ax2.text(i, values[i] * 0.5, char, ha='center', va='center',
                fontsize=9, style='italic',
                bbox=dict(boxstyle='round,pad=0.5', facecolor='white', 
                         alpha=0.8, edgecolor='gray'))
    
    plt.tight_layout()
    plt.savefig(output_dir / 'regional_distribution.png', dpi=300, bbox_inches='tight')
    print(f"✓ Created: regional_distribution.png")
    plt.close()


def create_cost_breakdown_chart(output_dir: Path):
    """Chart 5: Cost Breakdown Analysis"""
    
    systems = [5, 10, 15, 20, 34]
    
    # Cost components (in thousands)
    testing_costs = [6.8, 13.6, 20.4, 27.2, 46.24]  # Initial testing
    infrastructure = [0.5, 0.5, 0.5, 0.5, 0.5]      # Monthly infrastructure
    maintenance = [0.85, 1.7, 2.55, 3.4, 5.78]      # Monthly maintenance
    
    fig, ax = plt.subplots(figsize=(13, 7))
    
    x = np.arange(len(systems))
    width = 0.25
    
    bars1 = ax.bar(x - width, testing_costs, width, label='One-time Testing',
                   color=COLORS['primary'], alpha=0.8, edgecolor='black')
    bars2 = ax.bar(x, infrastructure, width, label='Infrastructure (monthly)',
                   color=COLORS['accent'], alpha=0.8, edgecolor='black')
    bars3 = ax.bar(x + width, maintenance, width, label='Maintenance (monthly)',
                   color=COLORS['secondary'], alpha=0.8, edgecolor='black')
    
    ax.set_xlabel('Number of Systems', fontsize=13, fontweight='bold')
    ax.set_ylabel('Cost ($1,000s)', fontsize=13, fontweight='bold')
    ax.set_title('Cost Breakdown by Number of Systems\n$85/hr Blended Rate, 16 Hours/System',
                fontsize=15, fontweight='bold', pad=20)
    ax.set_xticks(x)
    ax.set_xticklabels(systems)
    ax.legend(loc='upper left', fontsize=11, framealpha=0.9)
    ax.grid(True, alpha=0.3, axis='y')
    
    # Add total cost annotations
    for i in range(len(systems)):
        total_12m = testing_costs[i] + (infrastructure[i] + maintenance[i]) * 12
        ax.text(i, testing_costs[i] + infrastructure[i] + maintenance[i] + 3,
               f'12M Total:\n${total_12m:.0f}K',
               ha='center', fontsize=8, fontweight='bold',
               bbox=dict(boxstyle='round,pad=0.4', facecolor='yellow', alpha=0.7))
    
    plt.tight_layout()
    plt.savefig(output_dir / 'cost_breakdown.png', dpi=300, bbox_inches='tight')
    print(f"✓ Created: cost_breakdown.png")
    plt.close()


def create_sensitivity_heatmap(output_dir: Path):
    """Chart 6: Sensitivity Analysis Heatmap"""
    
    # Parameters: hourly rate, hours per system
    hourly_rates = [50, 70, 85, 100, 125, 150]
    hours_per_system = [8, 12, 16, 24, 32, 40]
    
    # Optimal number of systems for each combination
    # (Pre-calculated from roi-calculator.ts sensitivity analysis)
    optimal_systems = np.array([
        [15, 15, 15, 15, 15, 10],
        [15, 15, 15, 15, 10, 10],
        [15, 15, 15, 10, 10, 10],
        [15, 15, 10, 10, 10, 10],
        [15, 10, 10, 10, 10, 5],
        [10, 10, 10, 10, 5, 5],
    ])
    
    fig, ax = plt.subplots(figsize=(11, 8))
    
    im = ax.imshow(optimal_systems, cmap='RdYlGn', aspect='auto', vmin=5, vmax=20)
    
    # Set ticks
    ax.set_xticks(np.arange(len(hours_per_system)))
    ax.set_yticks(np.arange(len(hourly_rates)))
    ax.set_xticklabels(hours_per_system)
    ax.set_yticklabels([f'${r}' for r in hourly_rates])
    
    # Labels
    ax.set_xlabel('Hours per System', fontsize=13, fontweight='bold')
    ax.set_ylabel('Hourly Rate', fontsize=13, fontweight='bold')
    ax.set_title('Sensitivity Analysis: Optimal Systems Count\n' +
                'Impact of Cost Parameters on Optimal Stopping Point',
                fontsize=15, fontweight='bold', pad=20)
    
    # Add text annotations
    for i in range(len(hourly_rates)):
        for j in range(len(hours_per_system)):
            text = ax.text(j, i, optimal_systems[i, j],
                          ha="center", va="center", color="black",
                          fontsize=12, fontweight='bold')
    
    # Colorbar
    cbar = plt.colorbar(im, ax=ax)
    cbar.set_label('Optimal Number of Systems', fontsize=11, fontweight='bold')
    
    # Add annotation
    ax.text(0.5, -0.15, 'Base case: $85/hr, 16 hours/system → 15 systems optimal',
           transform=ax.transAxes, ha='center', fontsize=11, style='italic',
           bbox=dict(boxstyle='round,pad=0.8', facecolor='yellow', alpha=0.7))
    
    plt.tight_layout()
    plt.savefig(output_dir / 'sensitivity_heatmap.png', dpi=300, bbox_inches='tight')
    print(f"✓ Created: sensitivity_heatmap.png")
    plt.close()


def main():
    """Generate all visualizations"""
    
    print("\n" + "=" * 80)
    print("GENERATING VISUALIZATION CHARTS")
    print("=" * 80 + "\n")
    
    # Create output directory
    output_dir = Path(__file__).parent / 'visualizations'
    output_dir.mkdir(exist_ok=True)
    
    print(f"Output directory: {output_dir}\n")
    
    # Generate all charts
    charts = [
        ("ROI vs Systems", create_roi_vs_systems_chart),
        ("Market Coverage", create_coverage_chart),
        ("Marginal Gain", create_marginal_gain_chart),
        ("Regional Distribution", create_regional_distribution_chart),
        ("Cost Breakdown", create_cost_breakdown_chart),
        ("Sensitivity Heatmap", create_sensitivity_heatmap),
    ]
    
    for name, func in charts:
        print(f"Generating {name}...")
        func(output_dir)
    
    print("\n" + "=" * 80)
    print(f"✓ Successfully generated {len(charts)} charts")
    print(f"✓ Location: {output_dir}")
    print("=" * 80 + "\n")


if __name__ == '__main__':
    main()
