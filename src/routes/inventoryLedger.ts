import { Router, Request, Response } from 'express';
import { createServerClient, parsePagination, parseSort, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { createInventoryLedgerSchema } from '@/validations/inventoryLedger.js';
import { InventoryLedger } from '@/types/database.js';
import { ZodError } from 'zod';

const router = Router();

/**
 * GET /api/parts/:id/inventory-ledger
 * List inventory ledger transactions for a specific part
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/parts/:id/inventory-ledger',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();
      
      // Parse pagination params
      const pagination = parsePagination(req.query);
      
      // Parse sort params
      const sort = parseSort(
        req.query,
        ['txn_date', 'txn_type', 'qty_delta', 'created_at'],
        'created_at',
        'desc'
      );
      
      // Build query
      let query = supabase
        .from('inventory_ledger')
        .select('*', { count: 'exact' })
        .eq('part_id', id);
      
      // Apply sort
      if (sort) {
        query = query.order(sort.field, { ascending: sort.direction === 'asc' });
      }
      
      // Apply pagination
      query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
      
      const { data, error, count } = await query;
      
      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }
      
      res.json(
        successResponse(data ?? [], {
          pagination: {
            limit: pagination.limit,
            offset: pagination.offset,
            total: count ?? 0,
          },
        })
      );
    } catch (error) {
      console.error('Error listing inventory ledger:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list inventory ledger')
      );
    }
  }
);

/**
 * POST /api/parts/:id/inventory-ledger
 * Create a new inventory ledger transaction for a specific part
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/parts/:id/inventory-ledger',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      // Validate request body
      const validatedData = createInventoryLedgerSchema.parse(req.body);
      
      const supabase = createServerClient();
      
      // Verify part exists
      const { error: partError } = await supabase
        .from('parts')
        .select('id')
        .eq('id', id)
        .single();
      
      if (partError) {
        if (partError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Part not found')
          );
          return;
        }
        const apiError = translateDbError(partError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }
      
      // Insert inventory ledger entry
      const { data, error } = await supabase
        .from('inventory_ledger')
        .insert({
          part_id: id,
          ...validatedData,
        })
        .select()
        .single<InventoryLedger>();
      
      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }
      
      res.status(201).json(successResponse(data));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues)
        );
        return;
      }
      console.error('Error creating inventory ledger entry:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create inventory ledger entry')
      );
    }
  }
);

/**
 * GET /api/inventory-ledger
 * List all inventory ledger transactions with filters
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/inventory-ledger',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();
      
      // Parse pagination params
      const pagination = parsePagination(req.query);
      
      // Parse sort params
      const sort = parseSort(
        req.query,
        ['txn_date', 'txn_type', 'qty_delta', 'created_at'],
        'created_at',
        'desc'
      );
      
      // Parse filter params
      const partId = typeof req.query.part_id === 'string' ? req.query.part_id : undefined;
      const txnType = typeof req.query.txn_type === 'string' ? req.query.txn_type : undefined;
      const referenceId = typeof req.query.reference_id === 'string' ? req.query.reference_id : undefined;
      
      // Validate txn_type if provided
      const validTxnTypes = ['RECEIPT', 'ADJUSTMENT', 'USAGE', 'RETURN'];
      if (txnType && !validTxnTypes.includes(txnType)) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', `Invalid txn_type. Must be one of: ${validTxnTypes.join(', ')}`)
        );
        return;
      }
      
      // Build query
      let query = supabase
        .from('inventory_ledger')
        .select('*', { count: 'exact' });
      
      // Apply filters
      if (partId) {
        query = query.eq('part_id', partId);
      }
      
      if (txnType) {
        query = query.eq('txn_type', txnType);
      }
      
      if (referenceId) {
        query = query.eq('reference_id', referenceId);
      }
      
      // Apply sort
      if (sort) {
        query = query.order(sort.field, { ascending: sort.direction === 'asc' });
      }
      
      // Apply pagination
      query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
      
      const { data, error, count } = await query;
      
      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }
      
      res.json(
        successResponse(data ?? [], {
          pagination: {
            limit: pagination.limit,
            offset: pagination.offset,
            total: count ?? 0,
          },
        })
      );
    } catch (error) {
      console.error('Error listing inventory ledger:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list inventory ledger')
      );
    }
  }
);

export default router;
