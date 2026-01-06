import { describe, it, expect } from 'vitest';
import { parsePagination } from '../pagination.js';

describe('parsePagination', () => {
  describe('limit parameter', () => {
    it('should return default limit of 20 when not provided', () => {
      const result = parsePagination({});
      expect(result.limit).toBe(20);
    });

    it('should parse valid limit', () => {
      const result = parsePagination({ limit: '50' });
      expect(result.limit).toBe(50);
    });

    it('should parse numeric limit', () => {
      const result = parsePagination({ limit: 50 });
      expect(result.limit).toBe(50);
    });

    it('should clamp limit to max of 100', () => {
      const result = parsePagination({ limit: '999' });
      expect(result.limit).toBe(100);
    });

    it('should clamp limit to min of 1', () => {
      const result = parsePagination({ limit: '0' });
      expect(result.limit).toBe(1);
    });

    it('should clamp negative limit to 1', () => {
      const result = parsePagination({ limit: '-5' });
      expect(result.limit).toBe(1);
    });

    it('should use default limit for invalid values', () => {
      const result = parsePagination({ limit: 'invalid' });
      expect(result.limit).toBe(20);
    });

    it('should use default limit for NaN', () => {
      const result = parsePagination({ limit: NaN });
      expect(result.limit).toBe(20);
    });
  });

  describe('offset parameter', () => {
    it('should return default offset of 0 when not provided', () => {
      const result = parsePagination({});
      expect(result.offset).toBe(0);
    });

    it('should parse valid offset', () => {
      const result = parsePagination({ offset: '10' });
      expect(result.offset).toBe(10);
    });

    it('should parse numeric offset', () => {
      const result = parsePagination({ offset: 10 });
      expect(result.offset).toBe(10);
    });

    it('should clamp negative offset to 0', () => {
      const result = parsePagination({ offset: '-5' });
      expect(result.offset).toBe(0);
    });

    it('should use default offset for invalid values', () => {
      const result = parsePagination({ offset: 'invalid' });
      expect(result.offset).toBe(0);
    });

    it('should use default offset for NaN', () => {
      const result = parsePagination({ offset: NaN });
      expect(result.offset).toBe(0);
    });
  });

  describe('combined parameters', () => {
    it('should parse both limit and offset', () => {
      const result = parsePagination({ limit: '50', offset: '10' });
      expect(result).toEqual({ limit: 50, offset: 10 });
    });

    it('should handle defaults when both are missing', () => {
      const result = parsePagination({});
      expect(result).toEqual({ limit: 20, offset: 0 });
    });

    it('should handle mixed valid and invalid values', () => {
      const result = parsePagination({ limit: '50', offset: 'invalid' });
      expect(result).toEqual({ limit: 50, offset: 0 });
    });

    it('should handle edge case with limit=100 and offset=0', () => {
      const result = parsePagination({ limit: '100', offset: '0' });
      expect(result).toEqual({ limit: 100, offset: 0 });
    });

    it('should clamp limit and offset independently', () => {
      const result = parsePagination({ limit: '999', offset: '-10' });
      expect(result).toEqual({ limit: 100, offset: 0 });
    });
  });

  describe('edge cases', () => {
    it('should handle empty query object', () => {
      const result = parsePagination({});
      expect(result).toEqual({ limit: 20, offset: 0 });
    });

    it('should handle undefined values', () => {
      const result = parsePagination({ limit: undefined, offset: undefined });
      expect(result).toEqual({ limit: 20, offset: 0 });
    });

    it('should handle null values', () => {
      const result = parsePagination({ limit: null, offset: null });
      // Number(null) = 0, which gets clamped to limit=1, offset=0
      expect(result).toEqual({ limit: 1, offset: 0 });
    });

    it('should ignore extra parameters', () => {
      const result = parsePagination({ limit: '30', offset: '5', extra: 'ignored' });
      expect(result).toEqual({ limit: 30, offset: 5 });
    });
  });
});
