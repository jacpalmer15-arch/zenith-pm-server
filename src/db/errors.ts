import { PostgrestError } from '@supabase/supabase-js';

/**
 * API error structure for consistent error responses
 */
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Type guard to check if an error is a PostgrestError
 */
function isPostgrestError(error: unknown): error is PostgrestError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'details' in error &&
    'message' in error
  );
}

/**
 * Translates Supabase/Postgres errors to consistent API errors
 * Prevents leaking sensitive database details to clients
 * 
 * @param error - Error from Supabase query
 * @returns Translated API error
 */
export function translateDbError(error: PostgrestError | Error): ApiError {
  // Handle PostgrestError from Supabase using type guard
  if (isPostgrestError(error)) {
    // Map specific Postgres error codes
    switch (error.code) {
      case '23505': // unique_violation
        return {
          statusCode: 409,
          code: 'CONFLICT',
          message: 'A record with this value already exists',
          details: error.details,
        };

      case '23503': // foreign_key_violation
        return {
          statusCode: 400,
          code: 'BAD_REQUEST',
          message: 'Referenced record does not exist',
          details: error.details,
        };

      case '42P01': // undefined_table
        return {
          statusCode: 500,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database configuration error',
        };

      case '23502': // not_null_violation
        return {
          statusCode: 400,
          code: 'BAD_REQUEST',
          message: 'Required field is missing',
          details: error.details,
        };

      case '23514': // check_violation
        return {
          statusCode: 400,
          code: 'BAD_REQUEST',
          message: 'Invalid data value',
          details: error.details,
        };

      default:
        // Generic database error - don't leak details
        return {
          statusCode: 500,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'A database error occurred',
        };
    }
  }

  // Generic error fallback
  return {
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  };
}
