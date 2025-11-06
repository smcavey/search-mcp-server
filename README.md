# ACM Search MCP Server

A Model Context Protocol (MCP) server that provides secure access to ACM (Advanced Cluster Management) search databases. This server enables AI assistants and other MCP clients to query and analyze Kubernetes resources across managed clusters through a standardized interface.


## Features

- **Full PostgreSQL Support**: Execute SQL queries with parameter binding and result formatting
- **Database Introspection**: List tables, describe schemas, and search table structures
- **ACM Resource Analysis**: Advanced search across Kubernetes resources in managed clusters
- **Wildcard Namespace Filtering**: Support for shell-style patterns like `open-cluster-management*`
- **Multiple Transport Modes**: Support for both stdio (CLI) and SSE server modes
- **Security**: Parameterized queries prevent SQL injection attacks
- **Performance**: Configurable row limits and query optimization
- **Observability**: Built-in health checks, statistics, and logging

## Available Tools

The server provides conditional tool exposure for security:

### 🔐 Default Mode (Secure)
By default, only the primary tool is exposed:
- `find_resources` - Advanced search and analysis of Kubernetes resources across ACM managed clusters (includes wildcard namespace filtering)

### 🛠️ Database Mode (With `db: show` header)
When the `db: show` header is provided, all database tools become available:
- `find_resources` - Advanced search and analysis of Kubernetes resources across ACM managed clusters
- `query_database` - Execute SQL queries with optional parameters and row limits
- `get_database_stats` - Retrieve database statistics (table count, rows, size, connections)
- `list_tables` - List all tables with row counts and schema information
- `search_tables` - Search for tables by name pattern

### 📋 Usage Examples

**Default connection (only find_resources):**
```bash
claude mcp add --transport sse acm-search https://your-route/sse \
  --header "Authorization: Bearer $TOKEN"
```

**Database access (all tools):**
```bash
claude mcp add --transport sse acm-search https://your-route/sse \
  --header "Authorization: Bearer $TOKEN" \
  --header "db: show"
```

### ✨ Wildcard Namespace Filtering

The `find_resources` tool supports powerful wildcard patterns for namespace filtering:

```json
// Single wildcard - find all open-cluster-management namespaces
{
  "name": "find_resources",
  "arguments": {
    "kind": "Pod",
    "namespace": "open-cluster-management*"
  }
}

// Mixed patterns - specific namespaces plus wildcard
{
  "name": "find_resources",
  "arguments": {
    "kind": "Pod",
    "namespace": "kube-*,default,openshift-config"
  }
}

// Multiple wildcards - find pods in both kube-* and openshift-* namespaces
{
  "name": "find_resources",
  "arguments": {
    "kind": "Pod",
    "namespace": "kube-*,openshift-*"
  }
}
```

**Supported patterns:**
- `*` - matches any characters (converted to SQL `%`)
- `?` - matches single character (converted to SQL `_`)
- Mixed exact and wildcard patterns in comma-separated lists

## 🚀 Quick Deployment (New Clusters)

**For deploying on a new OpenShift cluster with existing container images:**

### ⚡ TL;DR - Quick Commands
```bash
oc login https://your-cluster-url
./scripts/create-secret.sh    # Auto-discovers ACM database
make deploy-prebuilt          # Deploys pre-built containers with authentication
make status                   # Get connection details and bearer token info
```

**Note**: All API endpoints require bearer token authentication (OpenShift/Kubernetes tokens).

### Prerequisites
- OpenShift CLI (`oc`) installed and configured
- Access to an OpenShift cluster with Red Hat ACM deployed

### Deployment Steps

1. **Login to OpenShift cluster**
   ```bash
   oc login https://your-cluster-url
   ```

2. **Generate database connection secret**
   ```bash
   ./scripts/create-secret.sh
   ```
   This script will:
   - 🔍 **Auto-discover your ACM namespace** (`open-cluster-management`, `ocm`, etc.)
   - 🔑 **Extract database credentials** from ACM's `search-postgres` secret
   - 📝 **Generate `k8s/secret.yaml`** with correct connection details
   - ⚡ **Usually requires no manual input** (fully automatic on standard ACM)

3. **Deploy using pre-built images**
   ```bash
   make deploy-prebuilt
   ```

> **💡 Why 2 steps?** The secret generation is separate for security - it contains database credentials that should never be committed to git. The script auto-discovers your specific ACM configuration and generates the secret locally.

This approach:
- ✅ **Uses existing Quay.io images** - no local building required
- ✅ **Auto-discovers ACM database credentials** from the live cluster
- ✅ **Sets up integrated authentication** for secure external access
- ✅ **No development tools needed** - just OpenShift CLI
- ✅ **Works across different ACM configurations** - not hardcoded to specific namespaces
- ✅ **Security-conscious** - credentials never stored in repository

### Access Your Deployment

After deployment, get connection info:
```bash
make status
```

### Connection Options

#### Option A: HTTPS Route (requires certificate handling)

**Default mode (only find_resources tool):**
```bash
export TOKEN=$(oc whoami -t)
claude mcp add --env NODE_TLS_REJECT_UNAUTHORIZED=0 --scope project \
  --transport sse acm-search \
  https://acm-search-mcp-server-route-acm-search.apps.$CLUSTER_DOMAIN/sse \
  --header "Authorization: Bearer $TOKEN"
```

**Database mode (all tools):**
```bash
export TOKEN=$(oc whoami -t)
claude mcp add --env NODE_TLS_REJECT_UNAUTHORIZED=0 --scope project \
  --transport sse acm-search \
  https://acm-search-mcp-server-route-acm-search.apps.$CLUSTER_DOMAIN/sse \
  --header "Authorization: Bearer $TOKEN" \
  --header "db: show"
```

#### Option B: HTTP Service (no certificate issues)

**Default mode (only find_resources tool):**
```bash
# Terminal 1: Set up port-forward
oc port-forward service/acm-search-mcp-server-service 8080:80 -n acm-search

# Terminal 2: Connect Claude Code
export TOKEN=$(oc whoami -t)
claude mcp add --scope project \
  --transport sse acm-search \
  http://localhost:8080/sse \
  --header "Authorization: Bearer $TOKEN"
```

**Database mode (all tools):**
```bash
# Terminal 1: Set up port-forward
oc port-forward service/acm-search-mcp-server-service 8080:80 -n acm-search

# Terminal 2: Connect Claude Code with database access
export TOKEN=$(oc whoami -t)
claude mcp add --scope project \
  --transport sse acm-search \
  http://localhost:8080/sse \
  --header "Authorization: Bearer $TOKEN" \
  --header "db: show"
```

Replace `$CLUSTER_DOMAIN` with values from `make status`.

## ⚠️ Troubleshooting ACM Configurations

**IMPORTANT**: Red Hat ACM can be deployed in different namespaces depending on the installation method, version, and configuration. This can cause deployment failures if not handled properly.

### Common ACM Namespace Variations

Our deployment scripts now **automatically discover** the ACM namespace, but you should be aware of these common patterns:

| Namespace | Installation Method | Notes |
|-----------|-------------------|-------|
| `open-cluster-management` | Standard ACM install | Most common, default expectation |
| `ocm` | Some ACM variants | Short form, seen in various deployments |
| `multicluster-engine` | MCE-based installs | When using MultiCluster Engine |
| `rhacm` | Operator-based installs | Red Hat Advanced Cluster Management |

### Automatic Namespace Discovery

The deployment process automatically:
1. **🔍 Searches common ACM namespaces** for the `search-postgres` secret
2. **✅ Auto-configures database URL** with correct namespace
3. **🚨 Falls back to manual input** if no ACM found

### Manual Database Configuration

If automatic discovery fails, you can manually configure the database connection:

```bash
# Generate secret manually
./scripts/create-secret.sh

# When prompted, enter database details:
# Host: search-postgres.<ACM_NAMESPACE>.svc.cluster.local
# Port: 5432 (default)
# Database: search
# Username: searchuser (typically)
# Password: <from ACM secret>
```

### Verifying ACM Installation

Check if ACM is installed and find its namespace:

```bash
# Find search-postgres secret across all namespaces
oc get secret --all-namespaces | grep search-postgres

# Check for ACM operator
oc get csv --all-namespaces | grep advanced-cluster-management

# List ACM-related namespaces
oc get namespace | grep -E "(acm|ocm|open-cluster|multicluster)"
```

### Deployment Failures

If deployment hangs or fails:

1. **Check pod logs**:
   ```bash
   make logs
   ```

2. **Verify database connectivity**:
   ```bash
   # Check if secret has correct database URL
   oc get secret acm-search-mcp-secret -n acm-search -o yaml

   # Test connectivity from a debug pod
   oc run debug --rm -it --image=postgres:latest -- psql "$DATABASE_URL"
   ```

3. **Regenerate secret with correct namespace**:
   ```bash
   # Remove old secret
   oc delete secret acm-search-mcp-secret -n acm-search

   # Regenerate with updated script
   ./scripts/create-secret.sh
   oc apply -f k8s/secret.yaml

   # Restart deployment
   oc rollout restart deployment/acm-search-mcp-server -n acm-search
   ```

### Common Error Patterns

| Error | Cause | Solution |
|-------|-------|----------|
| `connection refused` | Wrong ACM namespace | Use dynamic discovery script |
| `timeout waiting for condition` | Database connection failure | Check database URL in secret |
| `no such host` | Incorrect service name | Verify ACM namespace and service exists |

## 🛠️ Development Deployment

**For development or when you need to build custom images:**

### Additional Prerequisites
- Podman or Docker installed
- Quay.io account and push access

### Development Scenarios

#### **Build All and Deploy**
```bash
./scripts/create-secret.sh  # Generate database connection secret
make deploy                 # Build fresh image + deploy
```
This will:
- Generate database connection secret (if not already done)
- Build MCP server container with integrated authentication
- Push image to Quay.io registry
- Deploy to OpenShift cluster
- Set up all resources (namespace, RBAC, existing secret)

#### **Clean Everything and Rebuild**
```bash
make rebuild         # Complete fresh start
```
This will:
- Delete entire namespace and all resources
- Remove local container image
- Build fresh image from scratch
- Push to Quay.io registry
- Deploy everything fresh

#### **Build Image Only**
```bash
make build           # Build and push container image only
make deploy-prebuilt # Then deploy the image you just built
```

### Other Development Commands
```bash
make status          # Check health and get access info
make test            # Test endpoints
make logs            # View server logs
make clean-all       # Clean everything without rebuilding
```

## 📋 Common Operations

### Health & Status
```bash
make status          # Overall deployment health and access info
make test            # Test all endpoints
make logs            # View application logs
```

### Troubleshooting
```bash
# Check deployment status
make status

# View logs for issues
make logs

# Common issue: Pod CrashLoopBackOff (usually auth)
make logs            # Check for "password authentication failed"
./scripts/create-secret.sh  # Regenerate with current ACM credentials
oc rollout restart deployment acm-search-mcp-server -n acm-search

# Route not accessible
oc get route acm-search-mcp-server-route -n acm-search -o wide

# Test authentication (should work with either header)
export TOKEN=$(oc whoami -t)
curl -k -H "Authorization: Bearer $TOKEN" <route-url>/info
curl -k -H "kubernetes-authorization: Bearer $TOKEN" <route-url>/info
```

### Cleanup Options
```bash
make clean           # Remove deployment only (keeps namespace/secrets)
make clean-namespace # Remove entire namespace and all resources
make clean-all       # Remove namespace + local container image
make rebuild         # Clean everything + rebuild from scratch
```

## 🏗️ Container Architecture

This deployment uses a **single-container approach** with integrated authentication:

### Registry Information
- **MCP Server**: `quay.io/bjoydeep/acm-search-mcp-server:with-auth-latest`
- **Repository**: `git@github.com:stolostron/search-mcp-server.git`

### Architecture
```
Client → [Bearer Token] → MCP Server (Port 3000)
                             ↓
                       [Validates via K8s TokenReview API]
                             ↓
                       [Allow/Deny Request]
```

### Key Benefits
- ⚡ **Fast deployment** with pre-built images
- 🛡️ **Integrated authentication** via Kubernetes TokenReview API
- 🔧 **Simplified architecture** - single container instead of sidecar pattern
- 📦 **External registry** (Quay.io) for better availability
- 🔧 **Production-ready** operations and troubleshooting

### Deployment Flow
```bash
# Pre-built images are pulled from Quay.io
# OpenShift resources are configured automatically
make deploy-prebuilt
```

## 🛡️ Security Features

- **Bearer Token Authentication**: Validates tokens via Kubernetes TokenReview API
- **Dual Header Support**: Accepts both `Authorization` and `kubernetes-authorization` headers
- **RBAC**: Service account has `system:auth-delegator` permissions for token validation
- **TLS Termination**: Automatic HTTPS via OpenShift routes (edge termination)
- **Network Isolation**: Runs in dedicated `acm-search` namespace
- **Credential Auto-Discovery**: Securely discovers ACM database passwords

## 🔐 Authentication

The MCP server requires bearer token authentication for all endpoints except `/health`.

### Supported Headers

The server accepts bearer tokens via either header:

1. **Standard Authorization Header** (RFC 6750):
   ```bash
   Authorization: Bearer <your-token>
   ```

2. **Custom Kubernetes Authorization Header**:
   ```bash
   kubernetes-authorization: Bearer <your-token>
   ```

### Token Validation

- **Method**: Kubernetes TokenReview API
- **Permissions**: Service account has `system:auth-delegator` ClusterRole
- **Security**: Validates against the Kubernetes API server

### Getting a Token

```bash
# Get your current user token
oc whoami -t

# Use the token for API calls
export TOKEN=$(oc whoami -t)
curl -H "Authorization: Bearer $TOKEN" <endpoint-url>
```

### Connection Methods

#### Option A: HTTPS Route (with certificates)
```bash
# Requires -k flag for self-signed certificates
curl -k -H "Authorization: Bearer $TOKEN" \
  https://acm-search-mcp-server-route-acm-search.apps.$CLUSTER_DOMAIN/info
```

#### Option B: HTTP Service (no certificates)
```bash
# Via port-forward (no certificate issues)
oc port-forward service/acm-search-mcp-server-service 8080:80 -n acm-search

# Then connect via HTTP
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/info
```

### Authentication Flow

```
1. Client sends request with Bearer token
2. MCP server extracts token from Authorization header
3. Server calls Kubernetes TokenReview API to validate token
4. If valid: Request proceeds with user context
5. If invalid: 401/403 error returned
```

### Troubleshooting Authentication

**Missing token error:**
```json
{"error":"Missing authorization header","expected":"Either \"Authorization: Bearer <token>\" or \"kubernetes-authorization: Bearer <token>\""}
```

**Invalid token error:**
```json
{"error":"Token validation failed","details":"Token not authenticated by Kubernetes API"}
```

**Solution:** Ensure you're using a valid OpenShift/Kubernetes token and the service account has proper RBAC permissions.

## 🔒 ACM Administrator Authorization

The MCP server implements **ACM-specific authorization** to ensure only authorized administrators can access ACM search database.

### Authorization Requirements

**Access is granted to users who have EITHER:**

1. **Cluster Administrator Permissions** (highest level):
   - Users in `system:masters` group (traditional cluster admins)
   - Users in `system:cluster-admins` group (OpenShift cluster admins like `kube:admin`)

2. **ACM Administrator Permissions** (ACM-specific):
   - Users who can create ManagedClusters (`managedclusters.cluster.open-cluster-management.io`)
   - Users with `open-cluster-management:cluster-manager-admin` ClusterRole

### Authorization Flow

```
1. 🔍 Token Validation → Kubernetes TokenReview API
2. 🔐 ACM Authorization → Check admin permissions
3. ✅ Grant Access → Only if authorized
```

### Supported User Types

| User Type | Example | Authorization Method | Access |
|-----------|---------|---------------------|---------|
| **Cluster Admin** | `kube:admin` | `system:cluster-admins` group | ✅ **Granted** |
| **Traditional Admin** | Custom admin user | `system:masters` group | ✅ **Granted** |
| **ACM Admin** | Corporate LDAP user | ManagedCluster creation capability | ✅ **Granted** |
| **Regular User** | Developer | Limited permissions | ❌ **Denied** |

### Granting ACM Access

**For Corporate/LDAP Users:**
```bash
# Grant ACM cluster manager admin role
oc adm policy add-cluster-role-to-user open-cluster-management:cluster-manager-admin jane.admin@company.com

# Verify permissions
oc auth can-i create managedclusters.cluster.open-cluster-management.io --as=jane.admin@company.com
```

**For Service Accounts:**
```bash
# Create service account for automation
oc create sa acm-search-automation -n acm-search
oc adm policy add-cluster-role-to-user open-cluster-management:cluster-manager-admin \
  system:serviceaccount:acm-search:acm-search-automation

# Get long-lived token
export TOKEN=$(oc create token acm-search-automation -n acm-search --duration=8760h)

# Use in automation
claude mcp add --transport sse acm-search https://route/sse \
  --header "Authorization: Bearer $TOKEN"
```

### Authorization Troubleshooting

**Access Denied Error:**
```json
{
  "error": "Access denied",
  "details": "ACM administrator permissions required",
  "requirement": "User must have permissions to create ManagedClusters or be in system:masters group"
}
```

**Common Solutions:**

1. **Check User Groups:**
   ```bash
   oc whoami --show-context
   # Should show cluster admin context
   ```

2. **Verify ACM Permissions:**
   ```bash
   oc auth can-i create managedclusters.cluster.open-cluster-management.io
   # Should return "yes" for ACM admins
   ```

3. **Grant ACM Admin Role:**
   ```bash
   # For current user
   oc adm policy add-cluster-role-to-user open-cluster-management:cluster-manager-admin $(oc whoami)

   # For specific user
   oc adm policy add-cluster-role-to-user open-cluster-management:cluster-manager-admin username
   ```

### Security Design

- **🎯 Purpose-built**: Only ACM administrators need access to cluster-wide search data
- **🔐 Least Privilege**: More restrictive than general cluster admin requirements
- **🚀 Future-proof**: Works with any identity provider (LDAP, OAuth, service accounts)
- **🛡️ Defense in Depth**: Multiple authorization layers (token + capability check)

### Implementation Details

The authorization logic is implemented in `src/auth/token-validator.ts`:

```typescript
// 1. Quick group check (fast path)
const clusterAdminGroups = ['system:masters', 'system:cluster-admins'];
if (groups.includes(clusterAdminGroup)) {
  return true; // ✅ Cluster admins granted immediately
}

// 2. ACM capability check (for non-cluster-admins)
const canCreateManagedClusters = await checkSubjectAccessReview(username, {
  verb: 'create',
  resource: 'managedclusters',
  group: 'cluster.open-cluster-management.io'
});
```

This ensures that:
- ✅ **Current `kube:admin` continues to work**
- ✅ **Corporate admins work with proper ACM roles**
- ✅ **Service accounts work with ACM permissions**
- ✅ **Regular users are properly blocked**

## 📈 Advanced Configuration

### Resource Limits
Default resource limits in `k8s/deployment_docker.yaml`:
- **MCP Server**: 512Mi memory, 500m CPU (includes integrated authentication)

### Scaling
```bash
oc scale deployment acm-search-mcp-server --replicas=2 -n acm-search
```

### Database Connection
The server connects to ACM's search database at:
`search-postgres.open-cluster-management.svc.cluster.local:5432/search`

## 💻 Development

### Project Structure

```
src/
   index.ts           # CLI entry point (stdio mode)
   http-server.ts     # SSE server entry point
   server.ts          # Core MCP server implementation (includes wildcard namespace support)
   database/
      connection.ts   # Database connection management
      queries.ts      # SQL query implementations
   types/
      index.ts        # TypeScript type definitions
   auth/
      token-validator.ts # Kubernetes token validation
   utils/
      cross-resource.ts  # Resource filtering with wildcard support
   find-resources/       # ACM resource search functionality
k8s/                     # Kubernetes deployment manifests
scripts/                 # Deployment and setup scripts
Makefile                 # Build and deployment automation
```

### Protocol Support

#### MCP Protocol Versions
- **Primary**: Server-Sent Events (SSE) for Claude Code integration
- **Legacy**: stdio for direct CLI integration

#### Transport Modes
- **stdio**: Direct MCP client integration via stdin/stdout
- **SSE**: Server-Sent Events for real-time communication with Claude Code

## 🔄 Deployment Scenarios Summary

| Scenario | Command | Requirements | Use Case |
|----------|---------|-------------|----------|
| **New Cluster** | `./scripts/create-secret.sh` + `make deploy-prebuilt` | OpenShift CLI only | Production deployments, new clusters |
| **Build & Deploy** | `./scripts/create-secret.sh` + `make deploy` | OpenShift CLI + Podman + Quay.io access | Development, custom builds |
| **Fresh Restart** | `make rebuild` | OpenShift CLI + Podman + Quay.io access | Troubleshooting, clean development |

## License

MIT License

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## Related Documentation

- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [OpenShift Documentation](https://docs.openshift.com/)