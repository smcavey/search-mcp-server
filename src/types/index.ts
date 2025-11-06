export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

export interface QueryResult {
  columns: string[];
  rows: any[][];
  rowCount: number | null;
  executionTime?: number;
}

export interface TableInfo {
  tableName: string;
  schema: string;
  rowCount?: number;
  size?: string;
}

export interface ColumnInfo {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  defaultValue?: string;
  description?: string;
}

export interface TableSchema {
  tableName: string;
  schema: string;
  columns: ColumnInfo[];
  indexes?: string[];
  constraints?: string[];
}

export interface DatabaseQuery {
  sql: string;
  parameters?: any[];
  timeout?: number;
}

export interface QueryOptions {
  maxRows?: number;
  timeout?: number;
  includeMetadata?: boolean;
} 