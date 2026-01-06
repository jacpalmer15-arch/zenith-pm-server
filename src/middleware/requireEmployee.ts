import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '@/config/supabase.js';
import { errorResponse } from '@/types/response.js';
import { Employee, Role } from '@/types/auth.js';

interface EmployeeRow {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

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
      .single<EmployeeRow>();

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
    const employee: Employee = {
      id: data.id,
      display_name: data.display_name,
      email: data.email,
      phone: data.phone,
      role: data.role,
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    req.employee = employee;
    next();
  } catch {
    res.status(500).json(
      errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch employee data')
    );
  }
}
