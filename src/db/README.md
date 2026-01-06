# DB Access Layer

Clean database access layer for Zenith PM Server using Supabase with reusable query helpers.

## Overview

This module provides:
- **Server Client** - Factory for Supabase client instances
- **Pagination** - Parse and validate pagination parameters
- **Sorting** - Parse and validate sort parameters with allowlist
- **Filtering** - Extract allowed filters from query params
- **Error Translation** - Map PostgreSQL errors to API responses

## Usage

### Import

```typescript
import {
  createServerClient,
  parsePagination,
  parseSort,
  parseFilters,
  translateDbError,
  type PaginationParams,
  type SortParams,
  type QueryResult,
} from '@/db/index.js';
```

### Pagination

```typescript
// GET /api/users?limit=50&offset=100
const pagination = parsePagination(req.query);
// Returns: { limit: 50, offset: 100 }

// Enforces bounds:
// - limit: 1-100 (default 20)
// - offset: >= 0 (default 0)
```

### Sorting

```typescript
// GET /api/users?sort=name:desc
const sort = parseSort(req.query, ['name', 'created_at', 'email']);
// Returns: { field: 'name', direction: 'desc' }

// Invalid field returns null
const invalid = parseSort({ sort: 'invalid' }, ['name']);
// Returns: null

// With defaults
const defaultSort = parseSort({}, ['name'], 'created_at', 'desc');
// Returns: { field: 'created_at', direction: 'desc' }
```

### Filtering

```typescript
interface UserFilters extends Record<string, unknown> {
  name?: string;
  email?: string;
  is_active?: boolean;
}

// GET /api/users?name=John&email=john@example.com&extra=ignored
const filters = parseFilters<UserFilters>(
  req.query,
  ['name', 'email', 'is_active']
);
// Returns: { name: 'John', email: 'john@example.com' }
// 'extra' is ignored as it's not in allowlist
```

### Complete Example

```typescript
import { Router } from 'express';
import {
  createServerClient,
  parsePagination,
  parseSort,
  parseFilters,
  translateDbError,
} from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';

interface UserFilters extends Record<string, unknown> {
  name?: string;
  email?: string;
  is_active?: boolean;
}

const router = Router();

router.get('/api/users', async (req, res) => {
  try {
    // Parse query parameters
    const pagination = parsePagination(req.query);
    const sort = parseSort(req.query, ['name', 'created_at', 'email'], 'created_at', 'desc');
    const filters = parseFilters<UserFilters>(req.query, ['name', 'email', 'is_active']);

    // Create Supabase client
    const supabase = createServerClient();
    
    // Build query
    let query = supabase
      .from('users')
      .select('*', { count: 'exact' });

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    // Apply sort
    if (sort) {
      query = query.order(sort.field, { ascending: sort.direction === 'asc' });
    }

    // Apply pagination
    const start = pagination.offset;
    const end = pagination.offset + pagination.limit - 1;
    query = query.range(start, end);

    // Execute query
    const { data, error, count } = await query;

    if (error) {
      const apiError = translateDbError(error);
      return res.status(apiError.statusCode).json(
        errorResponse(apiError.code, apiError.message)
      );
    }

    // Return response with pagination metadata
    res.json(
      successResponse({
        data: data || [],
        meta: {
          limit: pagination.limit,
          offset: pagination.offset,
          total: count || 0,
        },
      })
    );
  } catch (error) {
    console.error('Failed to fetch users:', error);
    res.status(500).json(
      errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch users')
    );
  }
});

export default router;
```

## Error Translation

Maps PostgreSQL error codes to HTTP status codes:

| PostgreSQL Code | Error Type | HTTP Status | API Code |
|----------------|------------|-------------|----------|
| 23505 | unique_violation | 409 | CONFLICT |
| 23503 | foreign_key_violation | 400 | BAD_REQUEST |
| 42P01 | undefined_table | 500 | INTERNAL_SERVER_ERROR |
| 23502 | not_null_violation | 400 | BAD_REQUEST |
| 23514 | check_violation | 400 | BAD_REQUEST |
| Other | - | 500 | INTERNAL_SERVER_ERROR |

```typescript
try {
  const { data, error } = await supabase.from('users').insert(newUser);
  
  if (error) {
    const apiError = translateDbError(error);
    return res.status(apiError.statusCode).json(
      errorResponse(apiError.code, apiError.message)
    );
  }
  
  res.json(successResponse(data));
} catch (error) {
  // Handle unexpected errors
}
```

## Type Definitions

```typescript
interface PaginationParams {
  limit: number;   // 1-100, default 20
  offset: number;  // >= 0, default 0
}

interface PaginationMeta {
  limit: number;
  offset: number;
  total?: number;
}

interface SortParams {
  field: string;
  direction: 'asc' | 'desc';
}

interface QueryOptions {
  pagination?: PaginationParams;
  sort?: SortParams;
  filters?: Record<string, unknown>;
}

interface QueryResult<T> {
  data: T[];
  meta: PaginationMeta;
}

interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}
```

## Factory vs Singleton

This module uses a **factory pattern** (`createServerClient`) which creates a new client instance on each call.

The existing `src/config/supabase.ts` uses a **singleton pattern** (`getSupabaseClient`) which returns a shared instance.

### When to Use Each

**Factory (`createServerClient`)** - Recommended for new code:
- Better testability (easier to mock)
- No shared state between requests
- More flexible for different configurations

**Singleton (`getSupabaseClient`)** - For backward compatibility:
- Used by existing middleware
- Slightly more efficient (reuses connection)

Both use the same service role key from environment configuration.

## Testing

The module includes comprehensive unit tests:
- `pagination.test.ts` - 23 tests
- `sort.test.ts` - 27 tests
- `filters.test.ts` - 19 tests
- `integration.test.ts` - 7 tests

Run tests:
```bash
npm test -- src/db/__tests__
```
