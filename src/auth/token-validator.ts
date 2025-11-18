import https from 'https';
import fs from 'fs';

export interface TokenValidationResult {
  valid: boolean;
  user?: {
    username: string;
    uid: string;
    groups: string[];
  };
  error?: string;
}

export class KubernetesTokenValidator {
  private saTokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';
  private k8sHost = process.env.KUBERNETES_SERVICE_HOST || 'kubernetes.default.svc.cluster.local';
  private k8sPort = process.env.KUBERNETES_SERVICE_PORT || '443';
  private k8sUrl = `https://${this.k8sHost}:${this.k8sPort}`;

  async validateBearerToken(authHeader: string): Promise<TokenValidationResult> {
    // Validate Authorization header format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        valid: false,
        error: 'Invalid Bearer token format. Expected: Authorization: Bearer <token>'
      };
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Basic token length validation
    if (token.length < 10) {
      return {
        valid: false,
        error: 'Token too short'
      };
    }

    try {
      // Read service account token for API calls
      let saToken: string;
      try {
        saToken = fs.readFileSync(this.saTokenPath, 'utf8').trim();
      } catch (error) {
        return {
          valid: false,
          error: 'Service account token not found. Ensure pod has proper service account mounted.'
        };
      }

      // Create TokenReview request
      const tokenReviewRequest = {
        apiVersion: 'authentication.k8s.io/v1',
        kind: 'TokenReview',
        spec: {
          token: token
        }
      };

      // Call Kubernetes TokenReview API
      const result = await this.callK8sAPI(
        '/apis/authentication.k8s.io/v1/tokenreviews',
        tokenReviewRequest,
        saToken
      );

      // Check authentication result
      if (result.status?.authenticated) {
        return {
          valid: true,
          user: {
            username: result.status.user?.username || 'unknown',
            uid: result.status.user?.uid || 'unknown',
            groups: result.status.user?.groups || []
          }
        };
      } else {
        return {
          valid: false,
          error: 'Token not authenticated by Kubernetes API'
        };
      }

    } catch (error) {
      console.error('Token validation error:', error);
      return {
        valid: false,
        error: `Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private callK8sAPI(path: string, data: any, saToken: string, method: string = 'POST'): Promise<any> {
    return new Promise((resolve, reject) => {
      const isGet = method === 'GET';
      const postData = isGet ? '' : JSON.stringify(data);

      const options = {
        hostname: this.k8sHost,
        port: parseInt(this.k8sPort),
        path,
        method,
        headers: {
          'Authorization': `Bearer ${saToken}`,
          'Accept': 'application/json'
        } as any,
        rejectUnauthorized: false, // Skip TLS verification (like curl -k)
        timeout: 5000 // 5 second timeout
      };

      if (!isGet) {
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            // Accept both 200 and 201 status codes (Kubernetes may return either)
            if (res.statusCode !== 200 && res.statusCode !== 201) {
              reject(new Error(`TokenReview API returned status ${res.statusCode}: ${body}`));
              return;
            }
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Failed to parse TokenReview response: ${e instanceof Error ? e.message : 'Unknown error'}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('TokenReview API request timed out'));
      });

      if (!isGet) {
        req.write(postData);
      }
      req.end();
    });
  }

  // Test method to check if we can reach the Kubernetes API
  async testK8sConnection(): Promise<boolean> {
    try {
      const saToken = fs.readFileSync(this.saTokenPath, 'utf8').trim();
      // Try a simple API call to test connectivity
      await this.callK8sAPI('/api', null, saToken, 'GET');
      return true;
    } catch (error) {
      console.error('Kubernetes API connection test failed:', error);
      return false;
    }
  }

  /**
   * Check if user has ACM administrator permissions
   *
   * This function determines if a user should have access to ACM search database
   * by checking for ACM administrative capabilities.
   *
   * @param validationResult - Result from validateBearerToken()
   * @returns Promise<boolean> - true if user has ACM admin access
   */
  async checkACMAdminPermissions(validationResult: TokenValidationResult): Promise<boolean> {
    if (!validationResult.valid || !validationResult.user) {
      return false;
    }

    const username = validationResult.user.username;
    const groups = validationResult.user.groups || [];

    try {
      console.log(`[ACM-AUTH] Checking permissions for user: ${username}, groups: [${groups.join(', ')}]`);

      // Check: cluster admin permissions via any group (including custom groups)
      // First try the common system groups for performance
      const systemClusterAdminGroups = ['system:masters', 'system:cluster-admins'];
      const userSystemAdminGroup = groups.find(group => systemClusterAdminGroups.includes(group));

      if (userSystemAdminGroup) {
        console.log(`[ACM-AUTH] User ${username} granted access via system group: ${userSystemAdminGroup}`);
        return true;
      }

      // Check if any user group has cluster-admin role via ClusterRoleBindings
      const hasClusterAdminViaGroup = await this.checkGroupsForClusterAdmin(groups, username);
      if (hasClusterAdminViaGroup) {
        return true;
      }

      // Check: Can create ManagedClusters (signature ACM admin permission)
      // ManagedClusters are cluster-scoped resources that only ACM administrators can create
      console.log(`[ACM-AUTH] Testing ManagedCluster creation permission for user: ${username}`);
      const hasACMAdminCapability = await this.checkSubjectAccessReview(username, {
        verb: 'create',
        resource: 'managedclusters',
        group: 'cluster.open-cluster-management.io'
      });

      console.log(`[ACM-AUTH] ManagedCluster creation check result: ${hasACMAdminCapability}`);

      if (hasACMAdminCapability) {
        console.log(`[ACM-AUTH] User ${username} granted access via ACM admin capability (managedcluster creation)`);
        return true;
      }

      console.log(`[ACM-AUTH] User ${username} denied access - insufficient ACM permissions`);
      return false;

    } catch (error) {
      console.error(`[ACM-AUTH] Error checking ACM permissions for user ${username}:`, error);
      return false;
    }
  }

  /**
   * Check if any of the user's groups have cluster-admin role via ClusterRoleBindings
   *
   * @param groups - User's group memberships
   * @param username - Username for logging
   * @returns Promise<boolean> - true if any group has cluster-admin permissions
   */
  private async checkGroupsForClusterAdmin(groups: string[], username: string): Promise<boolean> {
    try {
      const saToken = fs.readFileSync(this.saTokenPath, 'utf8').trim();

      // Get all ClusterRoleBindings with cluster-admin role
      const clusterRoleBindingsPath = '/apis/rbac.authorization.k8s.io/v1/clusterrolebindings';

      const result = await this.callK8sAPI(clusterRoleBindingsPath, null, saToken, 'GET');

      if (!result.items) {
        console.log(`[ACM-AUTH] No ClusterRoleBindings found`);
        return false;
      }

      // Check if any ClusterRoleBinding grants cluster-admin to user's groups
      for (const binding of result.items) {
        if (binding.roleRef?.name === 'cluster-admin') {
          const subjects = binding.subjects || [];

          for (const subject of subjects) {
            if (subject.kind === 'Group' && groups.includes(subject.name)) {
              console.log(`[ACM-AUTH] User ${username} granted access via group "${subject.name}" with cluster-admin role (ClusterRoleBinding: ${binding.metadata?.name})`);
              return true;
            }
          }
        }
      }

      return false;

    } catch (error) {
      console.error(`[ACM-AUTH] Error checking ClusterRoleBindings for user ${username}:`, error);
      return false;
    }
  }

  /**
   * Check if user has specific permissions via SubjectAccessReview API
   *
   * @param username - Username to check
   * @param permission - Permission to check (verb, resource, group)
   * @returns Promise<boolean> - true if user has the permission
   */
  private async checkSubjectAccessReview(
    username: string,
    permission: { verb: string; resource: string; group?: string }
  ): Promise<boolean> {
    try {
      const saToken = fs.readFileSync(this.saTokenPath, 'utf8').trim();

      const subjectAccessReview = {
        apiVersion: 'authorization.k8s.io/v1',
        kind: 'SubjectAccessReview',
        spec: {
          user: username,
          resourceAttributes: {
            verb: permission.verb,
            resource: permission.resource,
            group: permission.group || ''
          }
        }
      };

      const result = await this.callK8sAPI(
        '/apis/authorization.k8s.io/v1/subjectaccessreviews',
        subjectAccessReview,
        saToken
      );

      return result.status?.allowed === true;

    } catch (error) {
      console.error(`[ACM-AUTH] SubjectAccessReview failed for user ${username}:`, error);
      return false;
    }
  }
}