import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '@/types/response.js';

export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  res.status(404).json(
    errorResponse(
      'NOT_FOUND',
      `Route ${req.method} ${req.path} not found`
    )
  );
}
