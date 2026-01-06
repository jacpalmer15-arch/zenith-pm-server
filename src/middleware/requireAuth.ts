import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '@/config/supabase.js';
import { errorResponse } from '@/types/response.js';
import { AuthPayload } from '@/types/auth.js';

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json(
        errorResponse('UNAUTHORIZED', 'Missing or invalid Authorization header')
      );
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with Supabase
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json(
        errorResponse('UNAUTHORIZED', 'Invalid or expired token')
      );
      return;
    }

    // Attach auth payload to request
    const authPayload: AuthPayload = {
      userId: data.user.id,
      email: data.user.email,
      claims: data.user.user_metadata || {},
    };

    req.auth = authPayload;
    next();
  } catch {
    res.status(401).json(
      errorResponse('UNAUTHORIZED', 'Token verification failed')
    );
  }
}
