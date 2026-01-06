/**
 * Pagination parameters for database queries
 */
export interface PaginationParams {
  limit: number; // default 20, max 100
  offset: number; // default 0
}

/**
 * Pagination metadata returned with query results
 */
export interface PaginationMeta {
  limit: number;
  offset: number;
  total?: number;
}

/**
 * Sort parameters for database queries
 */
export interface SortParams {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Combined query options for database queries
 */
export interface QueryOptions {
  pagination?: PaginationParams;
  sort?: SortParams;
  filters?: Record<string, unknown>;
}

/**
 * Generic query result with data and pagination metadata
 */
export interface QueryResult<T> {
  data: T[];
  meta: PaginationMeta;
}
