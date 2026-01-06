/**
 * Parses filter parameters from query string
 * Extracts only allowed filter keys from query params
 * 
 * @param query - Query parameters object from request
 * @param allowedFilters - Array of filter keys that are allowed
 * @returns Object with validated filter key-values
 */
export function parseFilters<T extends Record<string, unknown>>(
  query: Record<string, unknown>,
  allowedFilters: (keyof T)[]
): Partial<T> {
  const filters: Partial<T> = {};

  for (const key of allowedFilters) {
    const keyStr = String(key);
    if (keyStr in query && query[keyStr] !== undefined) {
      // Cast to T's value type - caller is responsible for proper typing
      filters[key] = query[keyStr] as T[keyof T];
    }
  }

  return filters;
}
