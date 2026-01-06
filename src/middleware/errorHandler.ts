import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '@/types/response.js';
import { env } from '@/config/env.js';

export interface HttpError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export function errorHandler(
  err: HttpError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected error occurred';

  // Log error for internal tracking (but don't expose to client)
  if (statusCode >= 500) {
    console.error('Server error:', {
      requestId: req.requestId,
      error: err.message,
      stack: err.stack,
    });
  }

  // Don't leak stack traces in production
  const details = env.NODE_ENV === 'development' ? err.details : undefined;

  res.status(statusCode).json(
    errorResponse(code, message, details)
  );
}
