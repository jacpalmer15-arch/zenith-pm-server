import { PaginationParams } from './types.js';

/**
 * Parses pagination parameters from query string
 * Enforces bounds: limit 1-100 (default 20), offset >= 0 (default 0)
 * 
 * @param query - Query parameters object from request
 * @returns Validated pagination parameters
 */
export function parsePagination(query: Record<string, unknown>): PaginationParams {
  // Parse limit with bounds checking
  let limit = 20; // default
  if (query.limit !== undefined) {
    const parsedLimit = Number(query.limit);
    if (!isNaN(parsedLimit)) {
      limit = Math.min(Math.max(parsedLimit, 1), 100); // clamp between 1 and 100
    }
  }

  // Parse offset with bounds checking
  let offset = 0; // default
  if (query.offset !== undefined) {
    const parsedOffset = Number(query.offset);
    if (!isNaN(parsedOffset)) {
      offset = Math.max(parsedOffset, 0); // ensure >= 0
    }
  }

  return { limit, offset };
}
