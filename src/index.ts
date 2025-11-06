#!/usr/bin/env node

import { PostgresMCPServer } from './server.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Please provide a database URL as a command-line argument');
    console.error('Usage: npm run dev postgresql://user:password@host:port/database');
    console.error('Example: npm run dev postgresql://postgres:password@localhost:5432/mydb');
    process.exit(1);
  }

  const databaseUrl = args[0];

  try {
    const server = new PostgresMCPServer(databaseUrl);
    await server.run();
  } catch (error) {
    console.error('Failed to start PostgreSQL MCP server:', error);
    process.exit(1);
  }
}

main(); 