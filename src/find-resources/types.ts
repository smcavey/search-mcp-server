// Enhanced find_resources types and interfaces

export interface FindResourcesArgs {
  // Basic filters
  kind?: string | string[];           // Single or multiple kinds
  name?: string;                      // Exact name or regex pattern
  namespace?: string | string[];      // Single or multiple namespaces
  cluster?: string | string[];        // Single or multiple clusters

  // Advanced filters
  labelSelector?: string;             // K8s label selector: "app=nginx,env!=test"
  clusterSelector?: string;           // Labels on clusters: "env=prod,cloud=AWS"
  status?: string | string[];         // Running, Failed, Pending, etc.
  textSearch?: string;                // Search across all text fields

  // Time-based filters
  ageNewerThan?: string;              // "1h", "2d", "1w"
  ageOlderThan?: string;              // "1h", "2d", "1w"

  // Output control
  outputMode?: 'list' | 'count' | 'summary' | 'health';
  groupBy?: string;                   // "status", "namespace", "cluster", "kind", "label:key"
  countOnly?: boolean;                // Return only numbers
  limit?: number;                     // Max results (default 50)
  sortBy?: string;                    // "name", "created", "namespace"
  sortOrder?: 'asc' | 'desc';         // Sort direction
}

export interface ResourceResult {
  name: string;
  namespace?: string;
  kind: string;
  cluster: string;
  status?: string;
  created?: string;
  labels?: Record<string, string>;
  // Dynamic fields based on resource type
  [key: string]: any;
}

export interface CountResult {
  label: string;
  count: number;
  percentage?: number;
}

export interface HealthResult {
  total: number;
  healthy: number;
  unhealthy: number;
  unknown: number;
  details: {
    status: string;
    count: number;
    percentage: number;
  }[];
  topIssues?: string[];
}

export interface SummaryResult {
  totalResources: number;
  totalClusters: number;
  resourcesByCluster: CountResult[];
  resourcesByKind: CountResult[];
  resourcesByNamespace: CountResult[];
}

export interface FindResourcesResult {
  mode: 'list' | 'count' | 'summary' | 'health';
  data: ResourceResult[] | CountResult[] | SummaryResult | HealthResult;
  metadata: {
    totalCount: number;
    executionTime: number;
    query: string;
    filters: FindResourcesArgs;
  };
}

export interface LabelSelector {
  key: string;
  operator: '=' | '!=' | 'in' | 'notin' | 'exists' | 'notexists';
  values: string[];
}

export interface TimeFilter {
  field: 'created' | 'age';
  operator: 'gt' | 'lt' | 'gte' | 'lte';
  value: Date;
}

// Resource-specific output configurations
export interface ResourceOutputConfig {
  kind: string;
  columns: string[];
  statusFields: string[];
  healthFields: string[];
}

// UNIVERSAL SAFE COLUMNS: Same for all resource types for consistency and safety
const UNIVERSAL_COLUMNS = ['name', 'namespace', 'kind', 'age', 'cluster', 'data'];

export const RESOURCE_CONFIGS: ResourceOutputConfig[] = [
  {
    kind: 'Pod',
    columns: UNIVERSAL_COLUMNS,
    statusFields: ['status'],
    healthFields: ['status', 'restarts']
  },
  {
    kind: 'Deployment',
    columns: UNIVERSAL_COLUMNS,
    statusFields: ['ready', 'desired', 'available'],
    healthFields: ['ready', 'desired', 'available']
  },
  {
    kind: 'Service',
    columns: UNIVERSAL_COLUMNS,
    statusFields: ['type'],
    healthFields: ['endpoints']
  },
  {
    kind: 'ManagedCluster',
    columns: UNIVERSAL_COLUMNS,
    statusFields: ['status'],
    healthFields: ['status', 'addons']
  },
  {
    kind: 'ClusterOperator',
    columns: UNIVERSAL_COLUMNS,
    statusFields: ['available', 'degraded', 'progressing'],
    healthFields: ['available', 'degraded', 'progressing']
  },
  {
    kind: 'Secret',
    columns: UNIVERSAL_COLUMNS,
    statusFields: ['type'],
    healthFields: []
  },
  {
    kind: 'ConfigMap',
    columns: UNIVERSAL_COLUMNS,
    statusFields: [],
    healthFields: []
  },
  {
    kind: 'Node',
    columns: UNIVERSAL_COLUMNS,
    statusFields: ['status'],
    healthFields: ['status']
  }
];

// Default configuration for unknown resource types
export const DEFAULT_RESOURCE_CONFIG: ResourceOutputConfig = {
  kind: 'Unknown',
  columns: UNIVERSAL_COLUMNS,
  statusFields: ['status'],
  healthFields: ['status']
};