import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '@/types/response.js';
import { Role } from '@/types/auth.js';

export function requireRole(allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Ensure employee middleware has run first
    if (!req.employee) {
      res.status(403).json(
        errorResponse('FORBIDDEN', 'Employee record required')
      );
      return;
    }

    // Check if employee role is in allowed roles
    if (!allowedRoles.includes(req.employee.role)) {
      res.status(403).json(
        errorResponse(
          'FORBIDDEN',
          `Access denied. Required role(s): ${allowedRoles.join(', ')}`
        )
      );
      return;
    }

    next();
  };
}
