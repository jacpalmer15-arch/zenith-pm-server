import { describe, it, expect } from 'vitest';
import { parseSort } from '../sort.js';

describe('parseSort', () => {
  const allowedFields = ['name', 'created_at', 'updated_at', 'email'];

  describe('basic parsing', () => {
    it('should parse field without direction (default asc)', () => {
      const result = parseSort({ sort: 'name' }, allowedFields);
      expect(result).toEqual({ field: 'name', direction: 'asc' });
    });

    it('should parse field with asc direction', () => {
      const result = parseSort({ sort: 'name:asc' }, allowedFields);
      expect(result).toEqual({ field: 'name', direction: 'asc' });
    });

    it('should parse field with desc direction', () => {
      const result = parseSort({ sort: 'name:desc' }, allowedFields);
      expect(result).toEqual({ field: 'name', direction: 'desc' });
    });

    it('should handle uppercase direction', () => {
      const result = parseSort({ sort: 'name:DESC' }, allowedFields);
      expect(result).toEqual({ field: 'name', direction: 'desc' });
    });

    it('should handle mixed case direction', () => {
      const result = parseSort({ sort: 'name:AsC' }, allowedFields);
      expect(result).toEqual({ field: 'name', direction: 'asc' });
    });

    it('should trim whitespace', () => {
      const result = parseSort({ sort: '  name : desc  ' }, allowedFields);
      expect(result).toEqual({ field: 'name', direction: 'desc' });
    });
  });

  describe('field validation', () => {
    it('should return null for field not in allowlist', () => {
      const result = parseSort({ sort: 'invalid' }, allowedFields);
      expect(result).toBeNull();
    });

    it('should return null for field not in allowlist with direction', () => {
      const result = parseSort({ sort: 'invalid:desc' }, allowedFields);
      expect(result).toBeNull();
    });

    it('should accept all allowed fields', () => {
      expect(parseSort({ sort: 'name' }, allowedFields)).not.toBeNull();
      expect(parseSort({ sort: 'created_at' }, allowedFields)).not.toBeNull();
      expect(parseSort({ sort: 'updated_at' }, allowedFields)).not.toBeNull();
      expect(parseSort({ sort: 'email' }, allowedFields)).not.toBeNull();
    });

    it('should handle empty allowlist', () => {
      const result = parseSort({ sort: 'name' }, []);
      expect(result).toBeNull();
    });
  });

  describe('invalid input handling', () => {
    it('should return null when sort param is missing', () => {
      const result = parseSort({}, allowedFields);
      expect(result).toBeNull();
    });

    it('should return null when sort param is not a string', () => {
      const result = parseSort({ sort: 123 }, allowedFields);
      expect(result).toBeNull();
    });

    it('should return null when sort param is an array', () => {
      const result = parseSort({ sort: ['name', 'desc'] }, allowedFields);
      expect(result).toBeNull();
    });

    it('should return null for invalid direction', () => {
      const result = parseSort({ sort: 'name:invalid' }, allowedFields);
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseSort({ sort: '' }, allowedFields);
      expect(result).toBeNull();
    });

    it('should return null for whitespace only', () => {
      const result = parseSort({ sort: '   ' }, allowedFields);
      expect(result).toBeNull();
    });

    it('should return null for colon only', () => {
      const result = parseSort({ sort: ':' }, allowedFields);
      expect(result).toBeNull();
    });

    it('should return null for direction only', () => {
      const result = parseSort({ sort: ':desc' }, allowedFields);
      expect(result).toBeNull();
    });
  });

  describe('default values', () => {
    it('should use default field when no sort param provided', () => {
      const result = parseSort({}, allowedFields, 'created_at');
      expect(result).toEqual({ field: 'created_at', direction: 'asc' });
    });

    it('should use default field and direction when no sort param provided', () => {
      const result = parseSort({}, allowedFields, 'created_at', 'desc');
      expect(result).toEqual({ field: 'created_at', direction: 'desc' });
    });

    it('should override defaults when sort param is provided', () => {
      const result = parseSort({ sort: 'name:asc' }, allowedFields, 'created_at', 'desc');
      expect(result).toEqual({ field: 'name', direction: 'asc' });
    });

    it('should not use defaults when sort param is invalid', () => {
      const result = parseSort({ sort: 'invalid' }, allowedFields, 'created_at', 'desc');
      expect(result).toBeNull();
    });

    it('should return null when no sort param and no defaults', () => {
      const result = parseSort({}, allowedFields);
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle multiple colons (use first split)', () => {
      const result = parseSort({ sort: 'name:desc:extra' }, allowedFields);
      // Only uses first two parts, ignores extra
      expect(result).toEqual({ field: 'name', direction: 'desc' });
    });

    it('should handle field with underscore', () => {
      const result = parseSort({ sort: 'created_at:desc' }, allowedFields);
      expect(result).toEqual({ field: 'created_at', direction: 'desc' });
    });

    it('should be case-sensitive for field names', () => {
      const result = parseSort({ sort: 'NAME:desc' }, allowedFields);
      expect(result).toBeNull();
    });

    it('should handle single character field name', () => {
      const result = parseSort({ sort: 'x:desc' }, ['x']);
      expect(result).toEqual({ field: 'x', direction: 'desc' });
    });
  });
});
