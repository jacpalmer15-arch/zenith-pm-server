import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      correlationId: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Get or generate request ID
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  req.requestId = requestId;
  
  // Correlation ID (same as request ID if not provided)
  req.correlationId = (req.headers['x-correlation-id'] as string) || requestId;
  
  // Set response headers
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Correlation-Id', req.correlationId);
  
  next();
}
