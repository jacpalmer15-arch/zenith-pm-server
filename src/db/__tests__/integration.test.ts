/**
 * Integration test demonstrating DB layer usage
 * This shows how to use the pagination, sort, and filter helpers together
 */

import { describe, it, expect } from 'vitest';
import {
  parsePagination,
  parseSort,
  parseFilters,
  createServerClient,
} from '../index.js';

describe('DB Layer Integration', () => {
  describe('Acceptance Criteria', () => {
    it('createServerClient() returns working Supabase client', () => {
      const client = createServerClient();
      expect(client).toBeDefined();
      expect(typeof client.from).toBe('function');
      expect(client.auth).toBeDefined();
    });

    it("parsePagination({ limit: '50', offset: '10' }) returns { limit: 50, offset: 10 }", () => {
      const result = parsePagination({ limit: '50', offset: '10' });
      expect(result).toEqual({ limit: 50, offset: 10 });
    });

    it("parsePagination({ limit: '999' }) clamps to { limit: 100, offset: 0 }", () => {
      const result = parsePagination({ limit: '999' });
      expect(result).toEqual({ limit: 100, offset: 0 });
    });

    it('parsePagination({}) returns { limit: 20, offset: 0 }', () => {
      const result = parsePagination({});
      expect(result).toEqual({ limit: 20, offset: 0 });
    });

    it("parseSort({ sort: 'name:desc' }, ['name', 'created_at']) returns { field: 'name', direction: 'desc' }", () => {
      const result = parseSort({ sort: 'name:desc' }, ['name', 'created_at']);
      expect(result).toEqual({ field: 'name', direction: 'desc' });
    });

    it("parseSort({ sort: 'invalid' }, ['name']) returns null", () => {
      const result = parseSort({ sort: 'invalid' }, ['name']);
      expect(result).toBeNull();
    });
  });

  describe('Usage Example', () => {
    it('should combine pagination, sort, and filters', () => {
      // Simulate Express query params
      const query = {
        limit: '25',
        offset: '50',
        sort: 'created_at:desc',
        name: 'John',
        email: 'john@example.com',
        status: 'active',
        extra: 'ignored',
      };

      // Parse all parameters
      const pagination = parsePagination(query);
      const sort = parseSort(query, ['name', 'created_at', 'updated_at']);
      const filters = parseFilters(query, ['name', 'email', 'status']);

      // Verify results
      expect(pagination).toEqual({ limit: 25, offset: 50 });
      expect(sort).toEqual({ field: 'created_at', direction: 'desc' });
      expect(filters).toEqual({
        name: 'John',
        email: 'john@example.com',
        status: 'active',
      });

      // This demonstrates how these would be used in a route handler:
      // const supabase = createServerClient();
      // let query = supabase
      //   .from('employees')
      //   .select('*', { count: 'exact' });
      //
      // // Apply filters
      // Object.entries(filters).forEach(([key, value]) => {
      //   query = query.eq(key, value);
      // });
      //
      // // Apply sort
      // if (sort) {
      //   query = query.order(sort.field, { ascending: sort.direction === 'asc' });
      // }
      //
      // // Apply pagination
      // query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
      //
      // const { data, error, count } = await query;
    });
  });
});
