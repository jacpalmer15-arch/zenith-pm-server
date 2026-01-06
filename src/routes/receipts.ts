import { Router, Request, Response } from 'express';
import {
  createServerClient,
  parsePagination,
  parseSort,
  translateDbError,
} from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import {
  createReceiptSchema,
  updateReceiptSchema,
} from '@/validations/receipt.js';
import { allocateReceiptSchema } from '@/validations/allocation.js';
import { Receipt } from '@/types/database.js';
import { ZodError } from 'zod';

const router = Router();

/**
 * GET /api/receipts
 * List receipts with filters and pagination
 * TECH role: read-only access
 * OFFICE/ADMIN: full access
 */
router.get(
  '/api/receipts',
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
        ['receipt_date', 'vendor_name', 'total_amount', 'created_at', 'updated_at'],
        'created_at',
        'desc'
      );

      // Parse filter params
      const isAllocated =
        typeof req.query.is_allocated === 'string'
          ? req.query.is_allocated === 'true'
          : undefined;
      const workOrderId =
        typeof req.query.work_order_id === 'string'
          ? req.query.work_order_id
          : undefined;
      const vendorName =
        typeof req.query.vendor_name === 'string'
          ? req.query.vendor_name
          : undefined;

      // Build query
      let query = supabase.from('receipts').select('*', { count: 'exact' });

      // Apply filters
      if (isAllocated !== undefined) {
        query = query.eq('is_allocated', isAllocated);
      }
      if (workOrderId) {
        query = query.eq('allocated_to_work_order_id', workOrderId);
      }
      if (vendorName) {
        query = query.ilike('vendor_name', `%${vendorName}%`);
      }

      // Apply sort
      if (sort) {
        query = query.order(sort.field, { ascending: sort.direction === 'asc' });
      }

      // Apply pagination
      query = query.range(
        pagination.offset,
        pagination.offset + pagination.limit - 1
      );

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
      console.error('Error listing receipts:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list receipts')
        );
    }
  }
);

/**
 * POST /api/receipts
 * Create a new receipt
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/receipts',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = createReceiptSchema.parse(req.body);

      const supabase = createServerClient();

      // Insert receipt
      const { data, error } = await supabase
        .from('receipts')
        .insert({
          ...validatedData,
          created_by: req.employee!.id,
        })
        .select()
        .single<Receipt>();

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
      console.error('Error creating receipt:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create receipt')
        );
    }
  }
);

/**
 * GET /api/receipts/:id
 * Get a single receipt by ID with line items
 * TECH role: read-only access
 * OFFICE/ADMIN: full access
 */
router.get(
  '/api/receipts/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Fetch receipt with line items
      const { data, error } = await supabase
        .from('receipts')
        .select(
          `
          *,
          receipt_line_items(*)
        `
        )
        .eq('id', id)
        .single<Receipt>();

      if (error) {
        if (error.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Receipt not found'));
          return;
        }
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      res.json(successResponse(data));
    } catch (error) {
      console.error('Error fetching receipt:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch receipt')
        );
    }
  }
);

/**
 * PATCH /api/receipts/:id
 * Update a receipt (only if not allocated)
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.patch(
  '/api/receipts/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = updateReceiptSchema.parse(req.body);

      // Ensure at least one field is being updated
      if (Object.keys(validatedData).length === 0) {
        res.status(400).json(
          errorResponse(
            'VALIDATION_ERROR',
            'At least one field must be provided for update'
          )
        );
        return;
      }

      const supabase = createServerClient();

      // First, check if receipt is already allocated
      const { data: currentReceipt, error: fetchError } = await supabase
        .from('receipts')
        .select('is_allocated')
        .eq('id', id)
        .single<Pick<Receipt, 'is_allocated'>>();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Receipt not found'));
          return;
        }
        const apiError = translateDbError(fetchError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Check if receipt is allocated
      if (currentReceipt.is_allocated) {
        res.status(400).json(
          errorResponse(
            'VALIDATION_ERROR',
            'Cannot update an allocated receipt'
          )
        );
        return;
      }

      // Update receipt
      const { data, error } = await supabase
        .from('receipts')
        .update(validatedData)
        .eq('id', id)
        .select()
        .single<Receipt>();

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      res.json(successResponse(data));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues)
        );
        return;
      }
      console.error('Error updating receipt:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update receipt')
        );
    }
  }
);

/**
 * POST /api/receipts/:id/allocate
 * Allocate a receipt to work order or overhead
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/receipts/:id/allocate',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = allocateReceiptSchema.parse(req.body);

      const supabase = createServerClient();

      // Check if receipt exists and is not already allocated
      const { data: currentReceipt, error: fetchError } = await supabase
        .from('receipts')
        .select('is_allocated')
        .eq('id', id)
        .single<Pick<Receipt, 'is_allocated'>>();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Receipt not found'));
          return;
        }
        const apiError = translateDbError(fetchError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Check if already allocated
      if (currentReceipt.is_allocated) {
        res.status(400).json(
          errorResponse(
            'VALIDATION_ERROR',
            'Receipt is already allocated'
          )
        );
        return;
      }

      // Update receipt with allocation details
      const updateData: Record<string, unknown> = {
        is_allocated: true,
      };

      if (validatedData.allocated_to_work_order_id) {
        updateData.allocated_to_work_order_id = validatedData.allocated_to_work_order_id;
      } else if (validatedData.allocated_overhead_bucket) {
        updateData.allocated_overhead_bucket = validatedData.allocated_overhead_bucket;
      }

      const { data: updatedReceipt, error: updateError } = await supabase
        .from('receipts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single<Receipt>();

      if (updateError) {
        const apiError = translateDbError(updateError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // If work order allocation and lines are provided, create job_cost_entries
      if (validatedData.allocated_to_work_order_id && validatedData.lines) {
        const jobCostEntries = validatedData.lines.map((line, index) => {
          const amount = Math.round(line.qty * line.unit_cost * 100) / 100;
          const txnDate = updatedReceipt.receipt_date || new Date().toISOString().split('T')[0];
          return {
            work_order_id: validatedData.allocated_to_work_order_id,
            cost_type_id: line.cost_type_id,
            cost_code_id: line.cost_code_id,
            part_id: line.part_id || null,
            txn_date: txnDate,
            qty: line.qty,
            unit_cost: line.unit_cost,
            amount: amount,
            description: line.description || null,
            receipt_id: id,
            source_type: 'receipt',
            idempotency_key: `receipt:${id}:line:${index + 1}`,
            created_by: req.employee!.id,
          };
        });

        const { error: costEntriesError } = await supabase
          .from('job_cost_entries')
          .insert(jobCostEntries);

        if (costEntriesError) {
          // Rollback: mark receipt as not allocated
          await supabase
            .from('receipts')
            .update({
              is_allocated: false,
              allocated_to_work_order_id: null,
            })
            .eq('id', id);

          const apiError = translateDbError(costEntriesError);
          res.status(apiError.statusCode).json(
            errorResponse(apiError.code, apiError.message, apiError.details)
          );
          return;
        }
      }

      // Create audit log entry
      const auditEntry = {
        entity_type: 'receipt',
        entity_id: id,
        action: 'RECEIPT_ALLOCATED',
        actor_user_id: req.employee!.id,
        after_data: updatedReceipt,
        notes: validatedData.allocated_to_work_order_id
          ? `Allocated to work order ${validatedData.allocated_to_work_order_id}`
          : `Allocated to overhead bucket: ${validatedData.allocated_overhead_bucket}`,
      };

      await supabase.from('audit_logs').insert(auditEntry);

      res.json(successResponse(updatedReceipt));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues)
        );
        return;
      }
      console.error('Error allocating receipt:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to allocate receipt')
        );
    }
  }
);

export default router;
