// Kubernetes label selector parsing utilities

import { LabelSelector } from '../find-resources/types.js';

/**
 * Parse Kubernetes label selector string into structured format
 * Supports: key=value, key!=value, key in (value1,value2), key notin (value1,value2), key, !key
 */
export function parseLabelSelector(selector: string): LabelSelector[] {
  if (!selector || selector.trim() === '') {
    return [];
  }

  const selectors: LabelSelector[] = [];

  // Split by comma, but handle parentheses for 'in' and 'notin' operators
  const parts = splitLabelSelector(selector);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const parsed = parseSingleSelector(trimmed);
    if (parsed) {
      selectors.push(parsed);
    }
  }

  return selectors;
}

function splitLabelSelector(selector: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inParens = false;

  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];

    if (char === '(') {
      inParens = true;
    } else if (char === ')') {
      inParens = false;
    } else if (char === ',' && !inParens) {
      parts.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function parseSingleSelector(selector: string): LabelSelector | null {
  // Handle 'in' and 'notin' operators first
  const inMatch = selector.match(/^(\w+)\s+(notin|in)\s*\(([^)]+)\)$/);
  if (inMatch) {
    const [, key, operator, valuesStr] = inMatch;
    const values = valuesStr.split(',').map(v => v.trim());
    return {
      key,
      operator: operator as 'in' | 'notin',
      values
    };
  }

  // Handle != operator
  const notEqualMatch = selector.match(/^(\w+)\s*!=\s*(.+)$/);
  if (notEqualMatch) {
    const [, key, value] = notEqualMatch;
    return {
      key,
      operator: '!=',
      values: [value.trim()]
    };
  }

  // Handle = operator (explicit)
  const equalMatch = selector.match(/^(\w+)\s*=\s*(.+)$/);
  if (equalMatch) {
    const [, key, value] = equalMatch;
    return {
      key,
      operator: '=',
      values: [value.trim()]
    };
  }

  // Handle existence checks (!key)
  const notExistsMatch = selector.match(/^!(\w+)$/);
  if (notExistsMatch) {
    const [, key] = notExistsMatch;
    return {
      key,
      operator: 'notexists',
      values: []
    };
  }

  // Handle existence checks (key)
  const existsMatch = selector.match(/^(\w+)$/);
  if (existsMatch) {
    const [, key] = existsMatch;
    return {
      key,
      operator: 'exists',
      values: []
    };
  }

  return null;
}

/**
 * Convert label selectors to SQL WHERE conditions
 */
export function labelSelectorsToSQL(
  selectors: LabelSelector[],
  dataColumn: string = 'data'
): { conditions: string[], params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  for (const selector of selectors) {
    switch (selector.operator) {
      case '=':
        conditions.push(`${dataColumn}->'label'->>'${selector.key}' = $${paramIndex}`);
        params.push(selector.values[0]);
        paramIndex++;
        break;

      case '!=':
        conditions.push(`(${dataColumn}->'label'->>'${selector.key}' != $${paramIndex} OR ${dataColumn}->'label'->>'${selector.key}' IS NULL)`);
        params.push(selector.values[0]);
        paramIndex++;
        break;

      case 'in':
        const inPlaceholders = selector.values.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`${dataColumn}->'label'->>'${selector.key}' IN (${inPlaceholders})`);
        params.push(...selector.values);
        break;

      case 'notin':
        const notinPlaceholders = selector.values.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`(${dataColumn}->'label'->>'${selector.key}' NOT IN (${notinPlaceholders}) OR ${dataColumn}->'label'->>'${selector.key}' IS NULL)`);
        params.push(...selector.values);
        break;

      case 'exists':
        conditions.push(`${dataColumn}->'label'->>'${selector.key}' IS NOT NULL`);
        break;

      case 'notexists':
        conditions.push(`${dataColumn}->'label'->>'${selector.key}' IS NULL`);
        break;
    }
  }

  return { conditions, params };
}

/**
 * Validate label selector syntax
 */
export function validateLabelSelector(selector: string): { valid: boolean, error?: string } {
  try {
    const parsed = parseLabelSelector(selector);

    // Check for empty selectors
    if (parsed.length === 0 && selector.trim() !== '') {
      return { valid: false, error: 'Invalid label selector syntax' };
    }

    // Validate each selector
    for (const sel of parsed) {
      // Check key format (must be valid Kubernetes label key)
      if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-_.]*[a-zA-Z0-9])?$/.test(sel.key)) {
        return { valid: false, error: `Invalid label key: ${sel.key}` };
      }

      // Check values for = and != operators
      if ((sel.operator === '=' || sel.operator === '!=') && sel.values.length !== 1) {
        return { valid: false, error: `Operator ${sel.operator} requires exactly one value` };
      }

      // Check values for in/notin operators
      if ((sel.operator === 'in' || sel.operator === 'notin') && sel.values.length === 0) {
        return { valid: false, error: `Operator ${sel.operator} requires at least one value` };
      }
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Failed to parse label selector' };
  }
}

/**
 * Examples of valid label selectors:
 * - "app=nginx"
 * - "app=nginx,env=prod"
 * - "app!=nginx"
 * - "app in (nginx,apache)"
 * - "app notin (nginx,apache)"
 * - "app"
 * - "!app"
 * - "app=nginx,env in (prod,staging),tier!=frontend"
 */