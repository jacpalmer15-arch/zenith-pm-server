import { Router, Request, Response } from 'express';
import {
  createServerClient,
  translateDbError,
} from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import {
  createReceiptLineSchema,
  updateReceiptLineSchema,
} from '@/validations/receiptLine.js';
import { Receipt, ReceiptLineItem } from '@/types/database.js';
import { ZodError } from 'zod';

const router = Router();

/**
 * GET /api/receipts/:id/lines
 * List line items for a receipt
 * TECH role: read-only access
 * OFFICE/ADMIN: full access
 */
router.get(
  '/api/receipts/:id/lines',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Verify receipt exists
      const { error: receiptError } = await supabase
        .from('receipts')
        .select('id')
        .eq('id', id)
        .single();

      if (receiptError) {
        if (receiptError.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Receipt not found'));
          return;
        }
        const apiError = translateDbError(receiptError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Fetch line items
      const { data, error } = await supabase
        .from('receipt_line_items')
        .select('*')
        .eq('receipt_id', id)
        .order('line_no', { ascending: true });

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      res.json(successResponse(data ?? []));
    } catch (error) {
      console.error('Error fetching receipt line items:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch receipt line items')
        );
    }
  }
);

/**
 * POST /api/receipts/:id/lines
 * Add a line item to a receipt
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed (only if receipt not allocated)
 */
router.post(
  '/api/receipts/:id/lines',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = createReceiptLineSchema.parse(req.body);

      const supabase = createServerClient();

      // Check if receipt exists and is not allocated
      const { data: receipt, error: receiptError } = await supabase
        .from('receipts')
        .select('is_allocated')
        .eq('id', id)
        .single<Pick<Receipt, 'is_allocated'>>();

      if (receiptError) {
        if (receiptError.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Receipt not found'));
          return;
        }
        const apiError = translateDbError(receiptError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      if (receipt.is_allocated) {
        res.status(400).json(
          errorResponse(
            'VALIDATION_ERROR',
            'Cannot add line items to an allocated receipt'
          )
        );
        return;
      }

      // Get next line number
      const { data: maxLineData } = await supabase
        .from('receipt_line_items')
        .select('line_no')
        .eq('receipt_id', id)
        .order('line_no', { ascending: false })
        .limit(1)
        .maybeSingle<Pick<ReceiptLineItem, 'line_no'>>();

      const nextLineNo = maxLineData ? maxLineData.line_no + 1 : 1;

      // Calculate amount
      const amount = Math.round(validatedData.qty * validatedData.unit_cost * 100) / 100;

      // Insert line item
      const { data, error } = await supabase
        .from('receipt_line_items')
        .insert({
          receipt_id: id,
          line_no: nextLineNo,
          part_id: validatedData.part_id || null,
          description: validatedData.description || '',
          uom: validatedData.uom || null,
          qty: validatedData.qty,
          unit_cost: validatedData.unit_cost,
          amount: amount,
          created_by: req.employee!.id,
        })
        .select()
        .single<ReceiptLineItem>();

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
      console.error('Error creating receipt line item:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create receipt line item')
        );
    }
  }
);

/**
 * PATCH /api/receipt-lines/:id
 * Update a receipt line item
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed (only if receipt not allocated)
 */
router.patch(
  '/api/receipt-lines/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = updateReceiptLineSchema.parse(req.body);

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

      // Get line item with receipt info
      const { data: lineItem, error: lineError } = await supabase
        .from('receipt_line_items')
        .select('receipt_id, qty, unit_cost')
        .eq('id', id)
        .single<Pick<ReceiptLineItem, 'receipt_id' | 'qty' | 'unit_cost'>>();

      if (lineError) {
        if (lineError.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Receipt line item not found'));
          return;
        }
        const apiError = translateDbError(lineError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Check if receipt is allocated
      const { data: receiptData, error: receiptError } = await supabase
        .from('receipts')
        .select('is_allocated')
        .eq('id', lineItem.receipt_id)
        .single<Pick<Receipt, 'is_allocated'>>();

      if (receiptError) {
        const apiError = translateDbError(receiptError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      if (receiptData.is_allocated) {
        res.status(400).json(
          errorResponse(
            'VALIDATION_ERROR',
            'Cannot update line items of an allocated receipt'
          )
        );
        return;
      }

      // Prepare update data
      const updateData: Record<string, unknown> = { ...validatedData };

      // Recalculate amount if qty or unit_cost changed
      if (validatedData.qty !== undefined || validatedData.unit_cost !== undefined) {
        const newQty = validatedData.qty ?? lineItem.qty;
        const newUnitCost = validatedData.unit_cost ?? lineItem.unit_cost;
        updateData.amount = Math.round(newQty * newUnitCost * 100) / 100;
      }

      // Update line item
      const { data, error } = await supabase
        .from('receipt_line_items')
        .update(updateData)
        .eq('id', id)
        .select()
        .single<ReceiptLineItem>();

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
      console.error('Error updating receipt line item:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update receipt line item')
        );
    }
  }
);

/**
 * DELETE /api/receipt-lines/:id
 * Delete a receipt line item
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed (only if receipt not allocated)
 */
router.delete(
  '/api/receipt-lines/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Get line item with receipt info
      const { data: lineItem, error: lineError } = await supabase
        .from('receipt_line_items')
        .select('receipt_id')
        .eq('id', id)
        .single<Pick<ReceiptLineItem, 'receipt_id'>>();

      if (lineError) {
        if (lineError.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Receipt line item not found'));
          return;
        }
        const apiError = translateDbError(lineError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Check if receipt is allocated
      const { data: receiptData2, error: receiptError2 } = await supabase
        .from('receipts')
        .select('is_allocated')
        .eq('id', lineItem.receipt_id)
        .single<Pick<Receipt, 'is_allocated'>>();

      if (receiptError2) {
        const apiError = translateDbError(receiptError2);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      if (receiptData2.is_allocated) {
        res.status(400).json(
          errorResponse(
            'VALIDATION_ERROR',
            'Cannot delete line items from an allocated receipt'
          )
        );
        return;
      }

      // Delete line item
      const { error } = await supabase
        .from('receipt_line_items')
        .delete()
        .eq('id', id);

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting receipt line item:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to delete receipt line item')
        );
    }
  }
);

export default router;
