#!/bin/bash

# Script to create the Kubernetes secret for the PostgreSQL MCP Server
# This script helps you create the secret.yaml file with proper base64 encoding

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}PostgreSQL MCP Server - Secret Generator${NC}"
echo "================================================"

# Check if secret.yaml already exists
if [ -f "k8s/secret.yaml" ]; then
    echo -e "${YELLOW}Warning: k8s/secret.yaml already exists!${NC}"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
fi

# Get database connection details
echo -e "\n${GREEN}Enter your PostgreSQL connection details:${NC}"

read -p "Database Host: " DB_HOST
read -p "Database Port (default: 5432): " DB_PORT
DB_PORT=${DB_PORT:-5432}
read -p "Database Name: " DB_NAME
read -p "Database Username: " DB_USER
read -s -p "Database Password: " DB_PASS
echo

# Construct the database URL
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Base64 encode the database URL
ENCODED_URL=$(echo -n "$DATABASE_URL" | base64)

# Create the secret file
cat > k8s/secret.yaml << EOF
apiVersion: v1
kind: Secret
metadata:
  name: postgres-mcp-secret
  namespace: postgres-mcp
type: Opaque
data:
  # Base64 encoded database URL
  # Generated on: $(date)
  database-url: ${ENCODED_URL}
EOF

echo -e "\n${GREEN}Secret file created successfully!${NC}"
echo -e "File: ${YELLOW}k8s/secret.yaml${NC}"
echo -e "\n${GREEN}To apply the secret to your cluster:${NC}"
echo -e "  kubectl apply -f k8s/secret.yaml"
echo -e "\n${YELLOW}Remember:${NC}"
echo -e "  - The secret.yaml file is excluded from git (.gitignore)"
echo -e "  - Keep this file secure and don't commit it to version control"
echo -e "  - You can regenerate this file anytime using this script" 