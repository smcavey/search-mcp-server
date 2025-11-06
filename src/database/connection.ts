import { Pool, PoolClient, QueryResult as PGQueryResult } from 'pg';
import { DatabaseConfig } from '../types/index.js';

export class DatabaseConnection {
  private pool: Pool;
  private config: DatabaseConfig;

  constructor(connectionString: string) {
    // Parse the connection string to extract config
    const url = new URL(connectionString);
    
    this.config = {
      host: url.hostname,
      port: parseInt(url.port || '5432'),
      database: url.pathname.slice(1), // Remove leading slash
      user: url.username,
      password: url.password,
      ssl: url.searchParams.get('sslmode') === 'require' || url.searchParams.get('ssl') === 'true'
    };

    this.pool = new Pool({
      connectionString: connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  async connect(): Promise<PoolClient> {
    try {
      const client = await this.pool.connect();
      console.error('Connected to PostgreSQL database');
      return client;
    } catch (error) {
      console.error('Failed to connect to PostgreSQL:', error);
      throw new Error(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async query(sql: string, parameters?: any[]): Promise<PGQueryResult> {
    const client = await this.connect();
    try {
      const startTime = Date.now();
      const result = await client.query(sql, parameters);
      const executionTime = Date.now() - startTime;
      
      // Add execution time to result
      (result as any).executionTime = executionTime;
      
      return result;
    } finally {
      client.release();
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 as test');
      return result.rows[0]?.test === 1;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  async getDatabaseInfo(): Promise<{ name: string; version: string; size: string }> {
    try {
      const versionResult = await this.query('SELECT version()');
      const sizeResult = await this.query(`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `);
      
      return {
        name: this.config.database,
        version: versionResult.rows[0]?.version || 'Unknown',
        size: sizeResult.rows[0]?.size || 'Unknown'
      };
    } catch (error) {
      console.error('Failed to get database info:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  getConfig(): DatabaseConfig {
    return { ...this.config };
  }
} 