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
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
} from '@/validations/purchaseOrder.js';
import { receivePurchaseOrderSchema } from '@/validations/receive.js';
import { PurchaseOrder, PurchaseOrderLine, Part } from '@/types/database.js';
import { ZodError } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';

const router = Router();

/**
 * Helper function to get next purchase order number from database
 */
async function getNextPurchaseOrderNumber(
  supabase: SupabaseClient
): Promise<{ poNo: string | null; error: unknown }> {
  const result = await supabase.rpc('get_next_number', {
    p_kind: 'purchase_order',
  });

  return {
    poNo: typeof result.data === 'string' ? result.data : null,
    error: result.error,
  };
}

/**
 * GET /api/purchase-orders
 * List purchase orders with filters and pagination
 * TECH role: read-only access
 * OFFICE/ADMIN: full access
 */
router.get(
  '/api/purchase-orders',
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
        ['po_no', 'vendor_name', 'po_date', 'status', 'total', 'created_at', 'updated_at'],
        'created_at',
        'desc'
      );

      // Parse filter params
      const vendorName =
        typeof req.query.vendor_name === 'string'
          ? req.query.vendor_name
          : undefined;
      const status =
        typeof req.query.status === 'string' ? req.query.status : undefined;

      // Build query
      let query = supabase.from('purchase_orders').select('*', { count: 'exact' });

      // Apply filters
      if (vendorName) {
        query = query.ilike('vendor_name', `%${vendorName}%`);
      }
      if (status) {
        query = query.eq('status', status);
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
      console.error('Error listing purchase orders:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list purchase orders')
        );
    }
  }
);

/**
 * POST /api/purchase-orders
 * Create a new purchase order
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/purchase-orders',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = createPurchaseOrderSchema.parse(req.body);

      const supabase = createServerClient();

      // Call DB function to get next purchase order number
      const { poNo, error: numberError } =
        await getNextPurchaseOrderNumber(supabase);

      if (numberError || !poNo) {
        console.error('Error generating purchase order number:', numberError);
        res.status(500).json(
          errorResponse(
            'INTERNAL_SERVER_ERROR',
            'Failed to generate purchase order number'
          )
        );
        return;
      }

      // Prepare insert data with defaults
      const insertData: Record<string, unknown> = {
        ...validatedData,
        po_no: poNo,
        created_by: req.employee!.id,
        updated_by: req.employee!.id,
      };

      // Insert purchase order
      const { data, error } = await supabase
        .from('purchase_orders')
        .insert(insertData)
        .select()
        .single<PurchaseOrder>();

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
      console.error('Error creating purchase order:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create purchase order')
        );
    }
  }
);

/**
 * GET /api/purchase-orders/:id
 * Get a single purchase order by ID with lines
 * TECH role: read-only access
 * OFFICE/ADMIN: full access
 */
router.get(
  '/api/purchase-orders/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Fetch purchase order with lines
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('id', id)
        .single<PurchaseOrder>();

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
      const { data: lines, error: linesError } = await supabase
        .from('purchase_order_lines')
        .select('*')
        .eq('po_id', id)
        .order('line_no', { ascending: true });

      if (linesError) {
        const apiError = translateDbError(linesError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      res.json(
        successResponse({
          ...po,
          lines: lines ?? [],
        })
      );
    } catch (error) {
      console.error('Error fetching purchase order:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch purchase order')
        );
    }
  }
);

/**
 * PATCH /api/purchase-orders/:id
 * Update a purchase order (only if DRAFT)
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.patch(
  '/api/purchase-orders/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = updatePurchaseOrderSchema.parse(req.body);

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

      // First, get the current purchase order to check status
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
            'Only DRAFT purchase orders can be modified'
          )
        );
        return;
      }

      // Prepare update data
      const updateData: Record<string, unknown> = {
        ...validatedData,
        updated_by: req.employee!.id,
      };

      // Update purchase order
      const { data, error } = await supabase
        .from('purchase_orders')
        .update(updateData)
        .eq('id', id)
        .select()
        .single<PurchaseOrder>();

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
      console.error('Error updating purchase order:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update purchase order')
        );
    }
  }
);

/**
 * POST /api/purchase-orders/:id/send
 * Set purchase order status to SENT
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/purchase-orders/:id/send',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Get current purchase order
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
            'Only DRAFT purchase orders can be sent'
          )
        );
        return;
      }

      // Update status to SENT
      const { data, error } = await supabase
        .from('purchase_orders')
        .update({
          status: 'SENT',
          updated_by: req.employee!.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single<PurchaseOrder>();

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      res.json(successResponse(data));
    } catch (error) {
      console.error('Error sending purchase order:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to send purchase order')
        );
    }
  }
);

/**
 * POST /api/purchase-orders/:id/receive
 * Mark items as received, update inventory
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/purchase-orders/:id/receive',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = receivePurchaseOrderSchema.parse(req.body);

      const supabase = createServerClient();

      // Get current purchase order
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

      // Check if PO is SENT or PARTIAL
      if (currentPO.status !== 'SENT' && currentPO.status !== 'PARTIAL') {
        res.status(400).json(
          errorResponse(
            'VALIDATION_ERROR',
            'Only SENT or PARTIAL purchase orders can be received'
          )
        );
        return;
      }

      // Process each line
      for (const receiveLine of validatedData.lines) {
        // Get the purchase order line
        const { data: line, error: lineError } = await supabase
          .from('purchase_order_lines')
          .select('*, po_id')
          .eq('id', receiveLine.line_id)
          .eq('po_id', id)
          .single<PurchaseOrderLine & { po_id: string }>();

        if (lineError || !line) {
          res.status(404).json(
            errorResponse(
              'NOT_FOUND',
              `Purchase order line ${receiveLine.line_id} not found`
            )
          );
          return;
        }

        // Update qty_received
        const newQtyReceived = Number(line.qty_received) + receiveLine.qty_received;
        const { error: updateLineError } = await supabase
          .from('purchase_order_lines')
          .update({
            qty_received: newQtyReceived,
            updated_at: new Date().toISOString(),
          })
          .eq('id', receiveLine.line_id);

        if (updateLineError) {
          const apiError = translateDbError(updateLineError);
          res.status(apiError.statusCode).json(
            errorResponse(apiError.code, apiError.message, apiError.details)
          );
          return;
        }

        // If part_id exists, check if it's inventoried
        if (line.part_id) {
          const { data: part, error: partError } = await supabase
            .from('parts')
            .select('is_inventoried, qty_on_hand')
            .eq('id', line.part_id)
            .single<Pick<Part, 'is_inventoried' | 'qty_on_hand'>>();

          if (partError) {
            const apiError = translateDbError(partError);
            res.status(apiError.statusCode).json(
              errorResponse(apiError.code, apiError.message, apiError.details)
            );
            return;
          }

          if (part.is_inventoried) {
            // Create inventory transaction
            const { error: txnError } = await supabase
              .from('inventory_ledger')
              .insert({
                part_id: line.part_id,
                txn_type: 'PURCHASE',
                qty_delta: receiveLine.qty_received,
                unit_cost: line.unit_price,
                txn_date: new Date().toISOString().split('T')[0],
                reference_type: 'purchase_order',
                reference_id: id,
              });

            if (txnError) {
              const apiError = translateDbError(txnError);
              res.status(apiError.statusCode).json(
                errorResponse(apiError.code, apiError.message, apiError.details)
              );
              return;
            }

            // Update parts.qty_on_hand
            const newQtyOnHand = Number(part.qty_on_hand) + receiveLine.qty_received;
            const { error: updatePartError } = await supabase
              .from('parts')
              .update({
                qty_on_hand: newQtyOnHand,
                updated_at: new Date().toISOString(),
              })
              .eq('id', line.part_id);

            if (updatePartError) {
              const apiError = translateDbError(updatePartError);
              res.status(apiError.statusCode).json(
                errorResponse(apiError.code, apiError.message, apiError.details)
              );
              return;
            }
          }
        }
      }

      // Check if all lines are fully received
      const { data: allLines, error: allLinesError } = await supabase
        .from('purchase_order_lines')
        .select('qty_ordered, qty_received')
        .eq('po_id', id);

      if (allLinesError) {
        const apiError = translateDbError(allLinesError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      const allFullyReceived = allLines?.every(
        (line) => Number(line.qty_received) >= Number(line.qty_ordered)
      );

      const newStatus = allFullyReceived ? 'RECEIVED' : 'PARTIAL';

      // Update purchase order status
      const { data, error } = await supabase
        .from('purchase_orders')
        .update({
          status: newStatus,
          updated_by: req.employee!.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single<PurchaseOrder>();

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
      console.error('Error receiving purchase order:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to receive purchase order')
        );
    }
  }
);

export default router;
