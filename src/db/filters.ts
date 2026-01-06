/**
 * Parses filter parameters from query string
 * Extracts only allowed filter keys from query params
 * 
 * Note: Type safety is enforced at compile time via TypeScript.
 * The caller is responsible for ensuring the query values match
 * the expected types defined in T. No runtime validation is performed.
 * 
 * @param query - Query parameters object from request
 * @param allowedFilters - Array of filter keys that are allowed
 * @returns Object with validated filter key-values
 * 
 * @example
 * interface UserFilters extends Record<string, unknown> {
 *   name?: string;
 *   email?: string;
 *   is_active?: boolean;
 * }
 * 
 * const filters = parseFilters<UserFilters>(
 *   { name: 'John', email: 'john@example.com', extra: 'ignored' },
 *   ['name', 'email']
 * );
 * // Returns: { name: 'John', email: 'john@example.com' }
 */
export function parseFilters<T extends Record<string, unknown>>(
  query: Record<string, unknown>,
  allowedFilters: (keyof T)[]
): Partial<T> {
  const filters: Partial<T> = {};

  for (const key of allowedFilters) {
    const keyStr = String(key);
    if (keyStr in query && query[keyStr] !== undefined) {
      // Type safety enforced by caller - cast to T's value type
      filters[key] = query[keyStr] as T[keyof T];
    }
  }

  return filters;
}
