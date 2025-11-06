// Output formatting utilities for enhanced find_resources

import {
  FindResourcesResult,
  ResourceResult,
  CountResult,
  SummaryResult,
  HealthResult,
  RESOURCE_CONFIGS,
  DEFAULT_RESOURCE_CONFIG
} from './types.js';

export class FindResourcesFormatter {
  /**
   * Format the final result for MCP response
   */
  static formatResult(result: FindResourcesResult): any {
    switch (result.mode) {
      case 'list':
        return this.formatListResult(result);
      case 'count':
        return this.formatCountResult(result);
      case 'summary':
        return this.formatSummaryResult(result);
      case 'health':
        return this.formatHealthResult(result);
      default:
        return this.formatListResult(result);
    }
  }

  /**
   * Format list mode results
   */
  private static formatListResult(result: FindResourcesResult): any {
    const resources = result.data as ResourceResult[];

    if (resources.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `## ACM Resources\n\nNo resources found matching the specified criteria.`,
          },
        ],
      };
    }

    // Group resources by kind to use appropriate columns
    const resourcesByKind = this.groupResourcesByKind(resources);
    let content = '';

    for (const [kind, kindResources] of Object.entries(resourcesByKind)) {
      if (Object.keys(resourcesByKind).length > 1) {
        content += `### ${kind} Resources\n\n`;
      }

      const config = RESOURCE_CONFIGS.find(c => c.kind === kind) || DEFAULT_RESOURCE_CONFIG;
      const table = this.createTable(kindResources, config.columns);
      content += table + '\n\n';
    }

    // Add metadata
    const executionTime = result.metadata.executionTime;
    const totalCount = result.metadata.totalCount;

    content += `*Query executed in ${executionTime}ms*\n\n`;
    content += `*Showing ${Math.min(resources.length, totalCount)} of ${totalCount} resources*`;

    return {
      content: [
        {
          type: 'text',
          text: `## ACM Resources\n\n${content}`,
        },
      ],
    };
  }

  /**
   * Format count mode results
   */
  private static formatCountResult(result: FindResourcesResult): any {
    const counts = result.data as CountResult[];

    if (counts.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `## Resource Count\n\nNo resources found matching the specified criteria.`,
          },
        ],
      };
    }

    // Create count table
    const headerRow = `| Label | Count | Percentage |`;
    const separatorRow = `| --- | --- | --- |`;
    const dataRows = counts
      .map(item => `| ${item.label} | ${item.count} | ${item.percentage}% |`)
      .join('\n');

    const total = counts.reduce((sum, item) => sum + item.count, 0);

    const content = `${headerRow}\n${separatorRow}\n${dataRows}\n\n**Total: ${total} resources**\n\n*Query executed in ${result.metadata.executionTime}ms*`;

    return {
      content: [
        {
          type: 'text',
          text: `## Resource Count\n\n${content}`,
        },
      ],
    };
  }

  /**
   * Format summary mode results
   */
  private static formatSummaryResult(result: FindResourcesResult): any {
    const summary = result.data as SummaryResult;

    let content = `**Overview:**\n`;
    content += `- Total Resources: ${summary.totalResources}\n`;
    content += `- Total Clusters: ${summary.totalClusters}\n\n`;

    // Resources by cluster
    if (summary.resourcesByCluster.length > 0) {
      content += `**Resources by Cluster:**\n`;
      for (const item of summary.resourcesByCluster.slice(0, 10)) {
        content += `- ${item.label}: ${item.count} resources\n`;
      }
      content += '\n';
    }

    // Resources by kind
    if (summary.resourcesByKind.length > 0) {
      content += `**Resources by Type:**\n`;
      for (const item of summary.resourcesByKind.slice(0, 10)) {
        content += `- ${item.label}: ${item.count} resources\n`;
      }
      content += '\n';
    }

    // Resources by namespace (top 10)
    if (summary.resourcesByNamespace.length > 0) {
      content += `**Top Namespaces:**\n`;
      for (const item of summary.resourcesByNamespace.slice(0, 10)) {
        content += `- ${item.label}: ${item.count} resources\n`;
      }
    }

    content += `\n*Query executed in ${result.metadata.executionTime}ms*`;

    return {
      content: [
        {
          type: 'text',
          text: `## Resource Summary\n\n${content}`,
        },
      ],
    };
  }

  /**
   * Format health mode results
   */
  private static formatHealthResult(result: FindResourcesResult): any {
    const health = result.data as HealthResult;

    let content = `**Health Overview:**\n`;
    content += `- Total Resources: ${health.total}\n`;
    content += `- ✅ Healthy: ${health.healthy} (${health.total > 0 ? Math.round((health.healthy / health.total) * 100) : 0}%)\n`;
    content += `- ❌ Unhealthy: ${health.unhealthy} (${health.total > 0 ? Math.round((health.unhealthy / health.total) * 100) : 0}%)\n`;
    content += `- ❓ Unknown: ${health.unknown} (${health.total > 0 ? Math.round((health.unknown / health.total) * 100) : 0}%)\n\n`;

    // Status breakdown
    if (health.details.length > 0) {
      content += `**Status Breakdown:**\n`;
      const headerRow = `| Status | Count | Percentage |`;
      const separatorRow = `| --- | --- | --- |`;
      const dataRows = health.details
        .map(detail => {
          const icon = this.getStatusIcon(detail.status);
          return `| ${icon} ${detail.status} | ${detail.count} | ${detail.percentage}% |`;
        })
        .join('\n');

      content += `${headerRow}\n${separatorRow}\n${dataRows}\n\n`;
    }

    // Top issues
    if (health.topIssues && health.topIssues.length > 0) {
      content += `**Top Issues:**\n`;
      for (const issue of health.topIssues.slice(0, 5)) {
        content += `- 🔴 ${issue}\n`;
      }
      content += '\n';
    }

    content += `*Query executed in ${result.metadata.executionTime}ms*`;

    return {
      content: [
        {
          type: 'text',
          text: `## Resource Health Analysis\n\n${content}`,
        },
      ],
    };
  }

  /**
   * Group resources by kind
   */
  private static groupResourcesByKind(resources: ResourceResult[]): Record<string, ResourceResult[]> {
    const grouped: Record<string, ResourceResult[]> = {};

    for (const resource of resources) {
      const kind = resource.kind || 'Unknown';
      if (!grouped[kind]) {
        grouped[kind] = [];
      }
      grouped[kind].push(resource);
    }

    return grouped;
  }

  /**
   * Create markdown table from resources
   */
  private static createTable(resources: ResourceResult[], columns: string[]): string {
    // Create header
    const headerRow = `| ${columns.join(' | ')} |`;
    const separatorRow = `| ${columns.map(() => '---').join(' | ')} |`;

    // Create data rows
    const dataRows = resources.map(resource => {
      const values = columns.map(column => {
        const value = resource[column];
        return this.escapeMarkdown(this.formatValue(value));
      });
      return `| ${values.join(' | ')} |`;
    }).join('\n');

    return `${headerRow}\n${separatorRow}\n${dataRows}`;
  }

  /**
   * Format individual values for display
   */
  private static formatValue(value: any): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (typeof value === 'number') {
      return value.toString();
    }

    if (Array.isArray(value)) {
      return value.join(', ');
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return value.toString();
  }

  /**
   * Escape markdown special characters
   */
  private static escapeMarkdown(text: string): string {
    return text
      .replace(/\|/g, '\\|')
      .replace(/\n/g, '<br>')
      .replace(/\r/g, '');
  }

  /**
   * Get appropriate icon for status
   */
  private static getStatusIcon(status: string): string {
    switch (status.toLowerCase()) {
      case 'healthy':
      case 'running':
      case 'active':
      case 'succeeded':
        return '✅';
      case 'unhealthy':
      case 'failed':
      case 'error':
      case 'crashloopbackoff':
        return '❌';
      case 'pending':
      case 'waiting':
        return '🟡';
      case 'unknown':
      default:
        return '❓';
    }
  }
}