import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '@/config/supabase.js';
import { errorResponse } from '@/types/response.js';
import { Employee } from '@/types/auth.js';

export async function requireEmployee(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Ensure auth middleware has run first
    if (!req.auth) {
      res.status(401).json(
        errorResponse('UNAUTHORIZED', 'Authentication required')
      );
      return;
    }

    // Query employee record
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', req.auth.userId)
      .single<Employee>();

    if (error || !data) {
      res.status(403).json(
        errorResponse('FORBIDDEN', 'No employee record found for this user')
      );
      return;
    }

    // Check if employee is active
    if (!data.is_active) {
      res.status(403).json(
        errorResponse('FORBIDDEN', 'Employee account is inactive')
      );
      return;
    }

    // Attach employee to request
    req.employee = { ...data };
    next();
  } catch (error) {
    console.error('Failed to fetch employee data:', error);
    res.status(500).json(
      errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch employee data')
    );
  }
}
