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
  createPurchaseOrderLineSchema,
  updatePurchaseOrderLineSchema,
} from '@/validations/purchaseOrderLine.js';
import { PurchaseOrder, PurchaseOrderLine } from '@/types/database.js';
import { ZodError } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';

const router = Router();

/**
 * Helper function to recalculate purchase order totals
 */
async function recalculatePurchaseOrderTotals(
  supabase: SupabaseClient,
  poId: string
): Promise<void> {
  // Get all lines for the purchase order
  const { data: lines, error: linesError } = await supabase
    .from('purchase_order_lines')
    .select('line_total')
    .eq('po_id', poId);

  if (linesError) {
    throw linesError;
  }

  // Calculate subtotal
  const subtotal = lines?.reduce((sum, line) => sum + Number(line.line_total), 0) || 0;

  // Get current PO to get tax amount
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select('tax')
    .eq('id', poId)
    .single<Pick<PurchaseOrder, 'tax'>>();

  if (poError) {
    throw poError;
  }

  const tax = Number(po.tax) || 0;
  const total = subtotal + tax;

  // Update purchase order totals
  const { error: updateError } = await supabase
    .from('purchase_orders')
    .update({
      subtotal,
      total,
    })
    .eq('id', poId);

  if (updateError) {
    throw updateError;
  }
}

/**
 * GET /api/purchase-orders/:id/lines
 * List lines for a purchase order
 * TECH role: read-only access
 * OFFICE/ADMIN: full access
 */
router.get(
  '/api/purchase-orders/:id/lines',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Verify purchase order exists
      const { error: poError } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('id', id)
        .single();

      if (poError) {
        if (poError.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Purchase order not found'));
          return;
        }
        const apiError = translateDbError(poError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Fetch lines
      const { data, error } = await supabase
        .from('purchase_order_lines')
        .select('*')
        .eq('po_id', id)
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
      console.error('Error fetching purchase order lines:', error);
      res.status(500).json(
        errorResponse(
          'INTERNAL_SERVER_ERROR',
          'Failed to fetch purchase order lines'
        )
      );
    }
  }
);

/**
 * POST /api/purchase-orders/:id/lines
 * Add a line to a purchase order (only if DRAFT)
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/purchase-orders/:id/lines',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = createPurchaseOrderLineSchema.parse(req.body);

      const supabase = createServerClient();

      // Get current purchase order to check status
      const { data: currentPO, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('status')
        .eq('id', id)
        .single<Pick<PurchaseOrder, 'status'>>();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Purchase order not found'));
          return;
        }
        const apiError = translateDbError(fetchError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Check if PO is DRAFT
      if (currentPO.status !== 'DRAFT') {
        res.status(400).json(
          errorResponse(
            'VALIDATION_ERROR',
            'Only DRAFT purchase orders can have lines added'
          )
        );
        return;
      }

      // Get the next line number
      const { data: existingLines } = await supabase
        .from('purchase_order_lines')
        .select('line_no')
        .eq('po_id', id)
        .order('line_no', { ascending: false })
        .limit(1);

      const nextLineNo = existingLines && existingLines.length > 0
        ? Number(existingLines[0].line_no) + 1
        : 1;

      // Calculate line total
      const lineTotal = validatedData.qty_ordered * validatedData.unit_price;

      // Insert line
      const { data, error } = await supabase
        .from('purchase_order_lines')
        .insert({
          po_id: id,
          line_no: nextLineNo,
          part_id: validatedData.part_id,
          description: validatedData.description,
          uom: validatedData.uom,
          qty_ordered: validatedData.qty_ordered,
          unit_price: validatedData.unit_price,
          line_total: lineTotal,
        })
        .select()
        .single<PurchaseOrderLine>();

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Recalculate PO totals
      await recalculatePurchaseOrderTotals(supabase, id);

      res.status(201).json(successResponse(data));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues)
        );
        return;
      }
      console.error('Error creating purchase order line:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create purchase order line')
        );
    }
  }
);

/**
 * PATCH /api/purchase-order-lines/:id
 * Update a purchase order line (only if PO is DRAFT)
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.patch(
  '/api/purchase-order-lines/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = updatePurchaseOrderLineSchema.parse(req.body);

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

      // Get the current line to check PO status
      const { data: currentLine, error: lineError } = await supabase
        .from('purchase_order_lines')
        .select('po_id, qty_ordered, unit_price')
        .eq('id', id)
        .single<Pick<PurchaseOrderLine, 'po_id' | 'qty_ordered' | 'unit_price'>>();

      if (lineError) {
        if (lineError.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Purchase order line not found'));
          return;
        }
        const apiError = translateDbError(lineError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Check PO status
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .select('status')
        .eq('id', currentLine.po_id)
        .single<Pick<PurchaseOrder, 'status'>>();

      if (poError) {
        const apiError = translateDbError(poError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Check if PO is DRAFT
      if (po.status !== 'DRAFT') {
        res.status(400).json(
          errorResponse(
            'VALIDATION_ERROR',
            'Only lines on DRAFT purchase orders can be modified'
          )
        );
        return;
      }

      // Calculate new line total if qty_ordered or unit_price is being updated
      const qtyOrdered = validatedData.qty_ordered ?? currentLine.qty_ordered;
      const unitPrice = validatedData.unit_price ?? currentLine.unit_price;
      const lineTotal = Number(qtyOrdered) * Number(unitPrice);

      // Update line
      const { data, error } = await supabase
        .from('purchase_order_lines')
        .update({
          ...validatedData,
          line_total: lineTotal,
        })
        .eq('id', id)
        .select()
        .single<PurchaseOrderLine>();

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Recalculate PO totals
      await recalculatePurchaseOrderTotals(supabase, currentLine.po_id);

      res.json(successResponse(data));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues)
        );
        return;
      }
      console.error('Error updating purchase order line:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update purchase order line')
        );
    }
  }
);

/**
 * DELETE /api/purchase-order-lines/:id
 * Delete a purchase order line (only if PO is DRAFT)
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.delete(
  '/api/purchase-order-lines/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Get the current line to check PO status
      const { data: currentLine, error: lineError } = await supabase
        .from('purchase_order_lines')
        .select('po_id')
        .eq('id', id)
        .single<Pick<PurchaseOrderLine, 'po_id'>>();

      if (lineError) {
        if (lineError.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Purchase order line not found'));
          return;
        }
        const apiError = translateDbError(lineError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Check PO status
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .select('status')
        .eq('id', currentLine.po_id)
        .single<Pick<PurchaseOrder, 'status'>>();

      if (poError) {
        const apiError = translateDbError(poError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Check if PO is DRAFT
      if (po.status !== 'DRAFT') {
        res.status(400).json(
          errorResponse(
            'VALIDATION_ERROR',
            'Only lines on DRAFT purchase orders can be deleted'
          )
        );
        return;
      }

      // Delete line
      const { error } = await supabase
        .from('purchase_order_lines')
        .delete()
        .eq('id', id);

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Recalculate PO totals
      await recalculatePurchaseOrderTotals(supabase, currentLine.po_id);

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting purchase order line:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to delete purchase order line')
        );
    }
  }
);

export default router;
