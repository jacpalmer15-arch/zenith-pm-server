import { SortParams } from './types.js';

/**
 * Parses sort parameters from query string
 * Format: "field" or "field:asc" or "field:desc"
 * Validates field against allowlist
 * 
 * @param query - Query parameters object from request
 * @param allowedFields - Array of field names that are allowed for sorting
 * @param defaultField - Optional default field to sort by
 * @param defaultDirection - Optional default sort direction (default: 'asc')
 * @returns SortParams or null if no valid sort specified
 */
export function parseSort(
  query: Record<string, unknown>,
  allowedFields: string[],
  defaultField?: string,
  defaultDirection: 'asc' | 'desc' = 'asc'
): SortParams | null {
  const sortParam = query.sort;

  // If no sort param, use defaults if provided
  if (!sortParam || typeof sortParam !== 'string') {
    if (defaultField) {
      return { field: defaultField, direction: defaultDirection };
    }
    return null;
  }

  // Parse sort parameter
  const parts = sortParam.split(':');
  const field = parts[0]?.trim();
  const directionPart = parts[1];

  // Validate field is in allowlist
  if (!field || !allowedFields.includes(field)) {
    return null;
  }

  // Parse direction with default
  let direction: 'asc' | 'desc' = 'asc';
  if (directionPart !== undefined) {
    const directionStr = directionPart.trim().toLowerCase();
    if (directionStr === 'desc') {
      direction = 'desc';
    } else if (directionStr === 'asc') {
      direction = 'asc';
    } else {
      // Invalid direction specified
      return null;
    }
  }

  return { field, direction };
}
