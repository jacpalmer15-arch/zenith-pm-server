import { Router, Request, Response } from 'express';
import { createServerClient, parsePagination, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { createInvoiceSchema, updateInvoiceSchema } from '@/validations/invoice.js';
import { recordPaymentSchema } from '@/validations/payment.js';
import { Invoice, InvoiceLine, Payment } from '@/types/database.js';
import { ZodError } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { createAuditLog } from '@/services/auditLog.js';

const router = Router();

/**
 * Helper function to get next invoice number from database
 */
async function getNextInvoiceNumber(
  supabase: SupabaseClient
): Promise<{ invoiceNo: string | null; error: unknown }> {
  const result = await supabase.rpc('get_next_number', {
    p_kind: 'invoice',
  });

  return {
    invoiceNo: typeof result.data === 'string' ? result.data : null,
    error: result.error,
  };
}

/**
 * Helper function to get next payment number from database
 */
async function getNextPaymentNumber(
  supabase: SupabaseClient
): Promise<{ paymentNo: string | null; error: unknown }> {
  const result = await supabase.rpc('get_next_number', {
    p_kind: 'payment',
  });

  return {
    paymentNo: typeof result.data === 'string' ? result.data : null,
    error: result.error,
  };
}

/**
 * GET /api/invoices
 * List invoices with pagination and filters
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/invoices',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();

      // Parse pagination params
      const pagination = parsePagination(req.query);

      // Parse filter params
      const customerId = typeof req.query.customer_id === 'string' ? req.query.customer_id.trim() : '';
      const projectId = typeof req.query.project_id === 'string' ? req.query.project_id.trim() : '';
      const workOrderId = typeof req.query.work_order_id === 'string' ? req.query.work_order_id.trim() : '';
      const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';

      // UUID validation regex
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      // Build query
      let query = supabase
        .from('invoices')
        .select('*', { count: 'exact' });

      // Apply filters
      if (customerId) {
        // Validate UUID format to prevent injection
        if (!uuidRegex.test(customerId)) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', 'Invalid customer_id format')
          );
          return;
        }
        // Need to join with projects or work_orders to filter by customer
        query = query.or(`project_id.in.(select id from projects where customer_id.eq.${customerId}),work_order_id.in.(select id from work_orders where customer_id.eq.${customerId})`);
      }

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      if (workOrderId) {
        query = query.eq('work_order_id', workOrderId);
      }

      if (status) {
        query = query.eq('status', status);
      }

      // Apply sort (default: newest first)
      query = query.order('created_at', { ascending: false });

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
      console.error('Error listing invoices:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list invoices')
      );
    }
  }
);

/**
 * POST /api/invoices
 * Create a new invoice
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/invoices',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = createInvoiceSchema.parse(req.body);

      const supabase = createServerClient();

      // Verify tax_rule exists
      const { data: taxRule, error: taxError } = await supabase
        .from('tax_rules')
        .select('id')
        .eq('id', validatedData.tax_rule_id)
        .single();

      if (taxError || !taxRule) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid tax_rule_id: tax rule does not exist')
        );
        return;
      }

      // Verify project or work_order exists
      if (validatedData.project_id) {
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('id')
          .eq('id', validatedData.project_id)
          .single();

        if (projectError || !project) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', 'Invalid project_id: project does not exist')
          );
          return;
        }
      } else if (validatedData.work_order_id) {
        const { data: workOrder, error: workOrderError } = await supabase
          .from('work_orders')
          .select('id')
          .eq('id', validatedData.work_order_id)
          .single();

        if (workOrderError || !workOrder) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', 'Invalid work_order_id: work order does not exist')
          );
          return;
        }
      }

      // Call DB function to get next invoice number
      const { invoiceNo, error: numberError } = await getNextInvoiceNumber(supabase);

      if (numberError || !invoiceNo) {
        console.error('Error generating invoice number:', numberError);
        res.status(500).json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to generate invoice number')
        );
        return;
      }

      // Insert invoice with generated invoice_no
      const { data, error } = await supabase
        .from('invoices')
        .insert({
          ...validatedData,
          invoice_no: invoiceNo,
          created_by: req.employee!.id,
          updated_by: req.employee!.id,
        })
        .select()
        .single<Invoice>();

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
      console.error('Error creating invoice:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create invoice')
      );
    }
  }
);

/**
 * GET /api/invoices/:id
 * Get a single invoice by ID with lines
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/invoices/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Get invoice
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .single<Invoice>();

      if (invoiceError) {
        if (invoiceError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Invoice not found')
          );
          return;
        }
        const apiError = translateDbError(invoiceError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Get invoice lines
      const { data: lines, error: linesError } = await supabase
        .from('invoice_lines')
        .select('*')
        .eq('invoice_id', id)
        .order('line_no', { ascending: true })
        .returns<InvoiceLine[]>();

      if (linesError) {
        const apiError = translateDbError(linesError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Combine invoice with lines
      const result = {
        ...invoiceData,
        lines: lines || [],
      };

      res.json(successResponse(result));
    } catch (error) {
      console.error('Error fetching invoice:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch invoice')
      );
    }
  }
);

/**
 * PATCH /api/invoices/:id
 * Update an invoice (only if DRAFT)
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.patch(
  '/api/invoices/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = updateInvoiceSchema.parse(req.body);

      // Ensure at least one field is being updated
      if (Object.keys(validatedData).length === 0) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'At least one field must be provided for update')
        );
        return;
      }

      const supabase = createServerClient();

      // Check if invoice exists and is DRAFT
      const { data: existingInvoice, error: fetchError } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Invoice not found')
          );
          return;
        }
        const apiError = translateDbError(fetchError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      if (existingInvoice.status !== 'DRAFT') {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Only DRAFT invoices can be modified')
        );
        return;
      }

      // Update invoice
      const { data, error } = await supabase
        .from('invoices')
        .update({
          ...validatedData,
          updated_by: req.employee!.id,
        })
        .eq('id', id)
        .select()
        .single<Invoice>();

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
      console.error('Error updating invoice:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update invoice')
      );
    }
  }
);

/**
 * POST /api/invoices/:id/send
 * Set invoice status to SENT
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/invoices/:id/send',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Check if invoice exists and is DRAFT
      const { data: existingInvoiceData, error: fetchError } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', id)
        .single<{ status: string }>();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Invoice not found')
          );
          return;
        }
        const apiError = translateDbError(fetchError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      if (existingInvoiceData.status !== 'DRAFT') {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Only DRAFT invoices can be sent')
        );
        return;
      }

      // Update invoice status to SENT
      const { data, error } = await supabase
        .from('invoices')
        .update({
          status: 'SENT',
          sent_at: new Date().toISOString(),
          updated_by: req.employee!.id,
        })
        .eq('id', id)
        .select()
        .single<Invoice>();

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // If invoice is linked to a project, update project invoiced_amount
      if (data.project_id) {
        const { data: projectData, error: projectError } = await supabase
          .from('projects')
          .select('invoiced_amount')
          .eq('id', data.project_id)
          .single<{ invoiced_amount: number }>();

        if (projectError) {
          console.error('Error fetching project:', projectError);
          // Don't fail the request if project update fails
        } else {
          const newInvoicedAmount = Number(projectData.invoiced_amount) + Number(data.total_amount);

          const { error: projectUpdateError } = await supabase
            .from('projects')
            .update({
              invoiced_amount: newInvoicedAmount,
              updated_by: req.employee!.id,
            })
            .eq('id', data.project_id);

          if (projectUpdateError) {
            console.error('Error updating project invoiced amount:', projectUpdateError);
            // Don't fail the request if project update fails
          }
        }
      }

      res.json(successResponse(data));
    } catch (error) {
      console.error('Error sending invoice:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to send invoice')
      );
    }
  }
);

/**
 * POST /api/invoices/:id/mark-paid
 * Record payment for an invoice
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/invoices/:id/mark-paid',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = recordPaymentSchema.parse(req.body);

      const supabase = createServerClient();

      // Get invoice
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .single<Invoice>();

      if (invoiceError) {
        if (invoiceError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Invoice not found')
          );
          return;
        }
        const apiError = translateDbError(invoiceError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Validate invoice status (must be SENT or PARTIAL)
      if (invoiceData.status !== 'SENT' && invoiceData.status !== 'PARTIAL') {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Only SENT or PARTIAL invoices can receive payments')
        );
        return;
      }

      // Call DB function to get next payment number
      const { paymentNo, error: numberError } = await getNextPaymentNumber(supabase);

      if (numberError || !paymentNo) {
        console.error('Error generating payment number:', numberError);
        res.status(500).json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to generate payment number')
        );
        return;
      }

      // Create payment record
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          invoice_id: id,
          payment_no: paymentNo,
          payment_date: validatedData.payment_date,
          amount: validatedData.amount,
          payment_method: validatedData.payment_method,
          reference_no: validatedData.reference_no || null,
          notes: validatedData.notes || null,
          created_by: req.employee!.id,
          updated_by: req.employee!.id,
        })
        .select()
        .single<Payment>();

      if (paymentError) {
        const apiError = translateDbError(paymentError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Calculate new paid amount
      const newPaidAmount = Number(invoiceData.paid_amount) + validatedData.amount;
      const totalAmount = Number(invoiceData.total_amount);

      // Determine new status
      let newStatus: 'PAID' | 'PARTIAL' = 'PARTIAL';
      let paidAt: string | null = null;

      if (newPaidAmount >= totalAmount) {
        newStatus = 'PAID';
        paidAt = new Date().toISOString();
      }

      // Update invoice paid_amount and status
      const { data: updatedInvoice, error: updateError } = await supabase
        .from('invoices')
        .update({
          paid_amount: newPaidAmount,
          status: newStatus,
          paid_at: paidAt,
          updated_by: req.employee!.id,
        })
        .eq('id', id)
        .select()
        .single<Invoice>();

      if (updateError) {
        const apiError = translateDbError(updateError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // If invoice is linked to a project, update project paid_amount
      if (invoiceData.project_id) {
        // Get current project
        const { data: projectData, error: projectError } = await supabase
          .from('projects')
          .select('paid_amount')
          .eq('id', invoiceData.project_id)
          .single<{
            paid_amount: number;
          }>();

        if (projectError) {
          console.error('Error fetching project:', projectError);
          // Don't fail the request if project update fails
        } else {
          // Update project paid_amount
          const newProjectPaidAmount = Number(projectData.paid_amount) + validatedData.amount;

          const { error: projectUpdateError } = await supabase
            .from('projects')
            .update({
              paid_amount: newProjectPaidAmount,
              updated_by: req.employee!.id,
            })
            .eq('id', invoiceData.project_id);

          if (projectUpdateError) {
            console.error('Error updating project amounts:', projectUpdateError);
            // Don't fail the request if project update fails
          }
        }
      }

      // Create audit log
      const { error: auditError } = await createAuditLog(supabase, {
        entity_type: 'invoice',
        entity_id: id,
        action: 'PAYMENT_RECORDED',
        actor_user_id: req.employee!.id,
        before_data: invoiceData as unknown as Record<string, unknown>,
        after_data: {
          ...updatedInvoice,
          payment,
        } as unknown as Record<string, unknown>,
      });

      if (auditError) {
        console.error('Error creating audit log:', auditError);
        // Don't fail the request if audit log fails
      }

      res.json(
        successResponse({
          invoice: updatedInvoice,
          payment,
        })
      );
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues)
        );
        return;
      }
      console.error('Error recording payment:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to record payment')
      );
    }
  }
);

export default router;
