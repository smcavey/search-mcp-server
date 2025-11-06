#!/bin/bash

# Script to create the Kubernetes secret for the PostgreSQL MCP Server
# ACM-aware version that auto-discovers connection details from Red Hat ACM
# Falls back to generic input if ACM components are not found

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}PostgreSQL MCP Server - ACM-Aware Secret Generator${NC}"
echo "========================================================"

# Function to discover ACM namespace dynamically
discover_acm_namespace() {
    echo -e "${BLUE}🔍 Auto-discovering ACM namespace...${NC}"

    # Common ACM namespace patterns to search
    local POTENTIAL_NAMESPACES=("open-cluster-management" "ocm" "multicluster-engine" "rhacm")
    local FOUND_NAMESPACES=()

    # Search for search-postgres secret in potential namespaces
    for ns in "${POTENTIAL_NAMESPACES[@]}"; do
        if oc get secret search-postgres -n "$ns" &>/dev/null; then
            echo "  ✓ Found search-postgres secret in namespace: $ns"
            FOUND_NAMESPACES+=("$ns")
        fi
    done

    # Also search all namespaces for search-postgres secret (fallback)
    if [ ${#FOUND_NAMESPACES[@]} -eq 0 ]; then
        echo "  Searching all namespaces for search-postgres secret..."
        while IFS= read -r ns; do
            if [ -n "$ns" ] && [ "$ns" != "NAMESPACE" ]; then
                FOUND_NAMESPACES+=("$ns")
                echo "  ✓ Found search-postgres secret in namespace: $ns"
            fi
        done < <(oc get secret --all-namespaces | grep search-postgres | awk '{print $1}' | sort -u)
    fi

    # Handle results
    if [ ${#FOUND_NAMESPACES[@]} -eq 0 ]; then
        echo -e "${RED}  ✗ No ACM search-postgres secret found in any namespace${NC}"
        return 1
    elif [ ${#FOUND_NAMESPACES[@]} -eq 1 ]; then
        ACM_NAMESPACE="${FOUND_NAMESPACES[0]}"
        echo -e "${GREEN}  ✓ ACM namespace auto-discovered: ${ACM_NAMESPACE}${NC}"
        return 0
    else
        echo -e "${YELLOW}  ⚠ Multiple ACM namespaces found:${NC}"
        for i in "${!FOUND_NAMESPACES[@]}"; do
            echo "    $((i+1)). ${FOUND_NAMESPACES[i]}"
        done
        echo
        read -p "Select namespace (1-${#FOUND_NAMESPACES[@]}): " choice
        if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#FOUND_NAMESPACES[@]}" ]; then
            ACM_NAMESPACE="${FOUND_NAMESPACES[$((choice-1))]}"
            echo -e "${GREEN}  ✓ Selected ACM namespace: ${ACM_NAMESPACE}${NC}"
            return 0
        else
            echo -e "${RED}  ✗ Invalid selection${NC}"
            return 1
        fi
    fi
}

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

echo
echo -e "${BLUE}=== ACM Auto-Discovery ===${NC}"

# Try to auto-discover ACM PostgreSQL details
ACM_DISCOVERED=false
DB_HOST=""
DB_PORT="5432"
DB_NAME=""
DB_USER=""
DB_PASS=""
ACM_NAMESPACE=""

# Discover ACM namespace dynamically
if discover_acm_namespace; then
    echo -e "${GREEN}Found ACM search-postgres secret! Extracting connection details...${NC}"

    # Extract database credentials from the secret
    if DB_USER=$(oc get secret search-postgres -n "$ACM_NAMESPACE" -o jsonpath='{.data.database-user}' 2>/dev/null | base64 -d); then
        echo "✓ Found database user: $DB_USER"
    fi

    if DB_PASS=$(oc get secret search-postgres -n "$ACM_NAMESPACE" -o jsonpath='{.data.database-password}' 2>/dev/null | base64 -d); then
        echo "✓ Found database password: [HIDDEN]"
    fi

    if DB_NAME=$(oc get secret search-postgres -n "$ACM_NAMESPACE" -o jsonpath='{.data.database-name}' 2>/dev/null | base64 -d); then
        echo "✓ Found database name: $DB_NAME"
    fi

    # Try to find the PostgreSQL service/pod for hostname
    if oc get service search-postgres -n "$ACM_NAMESPACE" &>/dev/null; then
        DB_HOST="search-postgres.${ACM_NAMESPACE}.svc.cluster.local"
        echo "✓ Found database service: $DB_HOST"
        ACM_DISCOVERED=true
    elif oc get pod -n "$ACM_NAMESPACE" -l app=search-postgres &>/dev/null; then
        # Fallback to pod IP if service not found
        POD_IP=$(oc get pod -n "$ACM_NAMESPACE" -l app=search-postgres -o jsonpath='{.items[0].status.podIP}' 2>/dev/null)
        if [ -n "$POD_IP" ]; then
            DB_HOST="$POD_IP"
            echo "✓ Found database pod IP: $DB_HOST"
            ACM_DISCOVERED=true
        fi
    fi
else
    echo -e "${YELLOW}ACM search-postgres secret not found in any expected namespace${NC}"
    echo "Falling back to manual input..."
fi

echo
if [ "$ACM_DISCOVERED" = true ]; then
    echo -e "${GREEN}=== ACM Connection Details Discovered ===${NC}"
    echo "Host: $DB_HOST"
    echo "Port: $DB_PORT"
    echo "Database: $DB_NAME"
    echo "User: $DB_USER"
    echo "Password: [HIDDEN]"
    echo
    read -p "Use these discovered values? (Y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        ACM_DISCOVERED=false
        echo "Proceeding with manual input..."
    fi
fi

if [ "$ACM_DISCOVERED" = false ]; then
    echo -e "\n${GREEN}Enter your PostgreSQL connection details:${NC}"
    
    read -p "Database Host: " DB_HOST
    read -p "Database Port (default: 5432): " DB_PORT
    DB_PORT=${DB_PORT:-5432}
    read -p "Database Name: " DB_NAME
    read -p "Database Username: " DB_USER
    read -s -p "Database Password: " DB_PASS
    echo
fi

# Construct the database URL
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Base64 encode the database URL
ENCODED_URL=$(echo -n "$DATABASE_URL" | base64)

# Determine target namespace (can be overridden with NAMESPACE env var)
TARGET_NAMESPACE=${NAMESPACE:-acm-search}

# Create the secret file using template
if [ -f "k8s/secret.yaml.template" ]; then
    echo -e "${BLUE}Using secret.yaml.template...${NC}"
    sed -e "s/YOUR_BASE64_ENCODED_DATABASE_URL_HERE/${ENCODED_URL}/g" \
        -e "s/namespace: mcp-server/namespace: ${TARGET_NAMESPACE}/g" \
        k8s/secret.yaml.template > k8s/secret.yaml

    # Add generation timestamp as comment
    sed -i.bak "/database-url:/i\\
  # Generated on: $(date)\\
" k8s/secret.yaml && rm k8s/secret.yaml.bak
else
    echo -e "${YELLOW}Template not found, generating inline...${NC}"
    # Fallback to inline generation
    cat > k8s/secret.yaml << EOF
apiVersion: v1
kind: Secret
metadata:
  name: postgres-mcp-secret
  namespace: ${TARGET_NAMESPACE}
type: Opaque
data:
  # Base64 encoded database URL
  # Generated on: $(date)
  database-url: ${ENCODED_URL}
EOF
fi

echo -e "\n${GREEN}Secret file created successfully!${NC}"
echo -e "File: ${YELLOW}k8s/secret.yaml${NC}"
echo -e "Target Namespace: ${YELLOW}${TARGET_NAMESPACE}${NC}"

if [ "$ACM_DISCOVERED" = true ]; then
    echo -e "\n${BLUE}✓ Used ACM auto-discovered connection details${NC}"
    echo -e "  ACM Namespace: ${ACM_NAMESPACE}"
    echo -e "  Service: search-postgres.${ACM_NAMESPACE}.svc.cluster.local"
    echo -e "  Deployment Namespace: ${TARGET_NAMESPACE}"
else
    echo -e "\n${YELLOW}⚠ Used manually entered connection details${NC}"
    echo -e "  Deployment Namespace: ${TARGET_NAMESPACE}"
fi

echo -e "\n${GREEN}To apply the secret to your cluster:${NC}"
echo -e "  kubectl apply -f k8s/secret.yaml"
echo -e "\n${YELLOW}Remember:${NC}"
echo -e "  - The secret.yaml file is excluded from git (.gitignore)"
echo -e "  - Keep this file secure and don't commit it to version control"
echo -e "  - You can regenerate this file anytime using this script"
echo -e "  - For generic database setup, use: ./scripts/create-secret-generic.sh" 