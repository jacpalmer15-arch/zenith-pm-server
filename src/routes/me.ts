import { Router, Request, Response } from 'express';
import { successResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';

const router = Router();

router.get('/api/me', requireAuth, requireEmployee, (req: Request, res: Response) => {
  // Both auth and employee are guaranteed to exist due to middleware
  const data = {
    employee: req.employee!,
    auth: req.auth!,
  };

  res.json(successResponse(data));
});

export default router;
