import { describe, it, expect } from 'vitest';
import { parseFilters } from '../filters.js';

interface TestFilters extends Record<string, unknown> {
  name?: string;
  email?: string;
  is_active?: boolean;
  age?: number;
  role?: string;
}

describe('parseFilters', () => {
  describe('basic filtering', () => {
    it('should extract allowed filters from query', () => {
      const query = { name: 'John', email: 'john@example.com' };
      const result = parseFilters<TestFilters>(query, ['name', 'email']);
      expect(result).toEqual({ name: 'John', email: 'john@example.com' });
    });

    it('should only include allowed filters', () => {
      const query = { name: 'John', email: 'john@example.com', extra: 'ignored' };
      const result = parseFilters<TestFilters>(query, ['name']);
      expect(result).toEqual({ name: 'John' });
    });

    it('should return empty object when no filters match', () => {
      const query = { extra: 'ignored', other: 'value' };
      const result = parseFilters<TestFilters>(query, ['name', 'email']);
      expect(result).toEqual({});
    });

    it('should handle empty query', () => {
      const query = {};
      const result = parseFilters<TestFilters>(query, ['name', 'email']);
      expect(result).toEqual({});
    });

    it('should handle empty allowlist', () => {
      const query = { name: 'John', email: 'john@example.com' };
      const result = parseFilters<TestFilters>(query, []);
      expect(result).toEqual({});
    });
  });

  describe('value types', () => {
    it('should preserve string values', () => {
      const query = { name: 'John' };
      const result = parseFilters<TestFilters>(query, ['name']);
      expect(result).toEqual({ name: 'John' });
      expect(typeof result.name).toBe('string');
    });

    it('should preserve boolean values', () => {
      const query = { is_active: true };
      const result = parseFilters<TestFilters>(query, ['is_active']);
      expect(result).toEqual({ is_active: true });
      expect(typeof result.is_active).toBe('boolean');
    });

    it('should preserve number values', () => {
      const query = { age: 25 };
      const result = parseFilters<TestFilters>(query, ['age']);
      expect(result).toEqual({ age: 25 });
      expect(typeof result.age).toBe('number');
    });

    it('should preserve string number values', () => {
      const query = { age: '25' };
      const result = parseFilters<TestFilters>(query, ['age']);
      expect(result).toEqual({ age: '25' });
      expect(typeof result.age).toBe('string');
    });

    it('should handle null values', () => {
      const query = { name: null };
      const result = parseFilters<TestFilters>(query, ['name']);
      // null is a valid value, not excluded like undefined
      expect(result).toEqual({ name: null });
    });

    it('should handle array values', () => {
      const query = { name: ['John', 'Jane'] };
      const result = parseFilters<TestFilters>(query, ['name']);
      expect(result).toEqual({ name: ['John', 'Jane'] });
    });
  });

  describe('edge cases', () => {
    it('should exclude undefined values', () => {
      const query = { name: 'John', email: undefined };
      const result = parseFilters<TestFilters>(query, ['name', 'email']);
      expect(result).toEqual({ name: 'John' });
    });

    it('should handle empty string values', () => {
      const query = { name: '' };
      const result = parseFilters<TestFilters>(query, ['name']);
      expect(result).toEqual({ name: '' });
    });

    it('should handle zero values', () => {
      const query = { age: 0 };
      const result = parseFilters<TestFilters>(query, ['age']);
      expect(result).toEqual({ age: 0 });
    });

    it('should handle false values', () => {
      const query = { is_active: false };
      const result = parseFilters<TestFilters>(query, ['is_active']);
      expect(result).toEqual({ is_active: false });
    });

    it('should handle multiple filters', () => {
      const query = {
        name: 'John',
        email: 'john@example.com',
        is_active: true,
        age: 25,
        extra: 'ignored',
      };
      const result = parseFilters<TestFilters>(query, ['name', 'email', 'is_active', 'age']);
      expect(result).toEqual({
        name: 'John',
        email: 'john@example.com',
        is_active: true,
        age: 25,
      });
    });
  });

  describe('special characters in keys', () => {
    it('should handle keys with underscores', () => {
      const query = { is_active: true, created_at: '2024-01-01' };
      const result = parseFilters<TestFilters>(query, ['is_active']);
      expect(result).toEqual({ is_active: true });
    });

    it('should handle camelCase keys', () => {
      interface CamelFilters extends Record<string, unknown> {
        firstName?: string;
        lastName?: string;
      }
      const query = { firstName: 'John', lastName: 'Doe' };
      const result = parseFilters<CamelFilters>(query, ['firstName', 'lastName']);
      expect(result).toEqual({ firstName: 'John', lastName: 'Doe' });
    });
  });

  describe('type safety', () => {
    it('should work with typed interfaces', () => {
      interface StrictFilters extends Record<string, unknown> {
        id: string;
        status: 'active' | 'inactive';
      }
      const query = { id: '123', status: 'active' };
      const result = parseFilters<StrictFilters>(query, ['id', 'status']);
      expect(result).toEqual({ id: '123', status: 'active' });
    });
  });
});
