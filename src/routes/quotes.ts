import { Router, Request, Response } from 'express';
import { createServerClient, parsePagination, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { createQuoteSchema, updateQuoteSchema } from '@/validations/quote.js';
import { Quote, QuoteLine } from '@/types/database.js';
import { ZodError } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { createAuditLog } from '@/services/auditLog.js';

const router = Router();

/**
 * Helper function to get next quote number from database
 */
async function getNextQuoteNumber(
  supabase: SupabaseClient
): Promise<{ quoteNo: string | null; error: unknown }> {
  const result = await supabase.rpc('get_next_number', {
    p_kind: 'quote',
  });

  return {
    quoteNo: typeof result.data === 'string' ? result.data : null,
    error: result.error,
  };
}

/**
 * GET /api/quotes
 * List quotes with pagination and filters
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/quotes',
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

      // Build query
      let query = supabase
        .from('quotes')
        .select('*', { count: 'exact' });

      // Apply filters
      if (customerId) {
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
      console.error('Error listing quotes:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list quotes')
      );
    }
  }
);

/**
 * POST /api/quotes
 * Create a new quote
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/quotes',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = createQuoteSchema.parse(req.body);

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

      // Call DB function to get next quote number
      const { quoteNo, error: numberError } = await getNextQuoteNumber(supabase);

      if (numberError || !quoteNo) {
        console.error('Error generating quote number:', numberError);
        res.status(500).json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to generate quote number')
        );
        return;
      }

      // Insert quote with generated quote_no
      const { data, error } = await supabase
        .from('quotes')
        .insert({
          ...validatedData,
          quote_no: quoteNo,
          created_by: req.employee!.id,
          updated_by: req.employee!.id,
        })
        .select()
        .single<Quote>();

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
      console.error('Error creating quote:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create quote')
      );
    }
  }
);

/**
 * GET /api/quotes/:id
 * Get a single quote by ID with lines
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/quotes/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Get quote
      const { data: quoteData, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', id)
        .single<Quote>();

      if (quoteError) {
        if (quoteError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Quote not found')
          );
          return;
        }
        const apiError = translateDbError(quoteError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Get quote lines
      const { data: lines, error: linesError } = await supabase
        .from('quote_lines')
        .select('*')
        .eq('quote_id', id)
        .order('line_no', { ascending: true })
        .returns<QuoteLine[]>();

      if (linesError) {
        const apiError = translateDbError(linesError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Combine quote with lines
      const result = {
        ...quoteData,
        lines: lines || [],
      };

      res.json(successResponse(result));
    } catch (error) {
      console.error('Error fetching quote:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch quote')
      );
    }
  }
);

/**
 * PATCH /api/quotes/:id
 * Update a quote (only if DRAFT)
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.patch(
  '/api/quotes/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = updateQuoteSchema.parse(req.body);

      // Ensure at least one field is being updated
      if (Object.keys(validatedData).length === 0) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'At least one field must be provided for update')
        );
        return;
      }

      const supabase = createServerClient();

      // Check if quote exists and is DRAFT
      const { data: existingQuote, error: fetchError } = await supabase
        .from('quotes')
        .select('status')
        .eq('id', id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Quote not found')
          );
          return;
        }
        const apiError = translateDbError(fetchError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      if (existingQuote.status !== 'DRAFT') {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Only DRAFT quotes can be modified')
        );
        return;
      }

      // Update quote
      const { data, error } = await supabase
        .from('quotes')
        .update({
          ...validatedData,
          updated_by: req.employee!.id,
        })
        .eq('id', id)
        .select()
        .single<Quote>();

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
      console.error('Error updating quote:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update quote')
      );
    }
  }
);

/**
 * POST /api/quotes/:id/send
 * Set quote status to SENT
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/quotes/:id/send',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Check if quote exists and is DRAFT
      const { data: existingQuoteData, error: fetchError } = await supabase
        .from('quotes')
        .select('status')
        .eq('id', id)
        .single<{ status: string }>();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Quote not found')
          );
          return;
        }
        const apiError = translateDbError(fetchError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      if (existingQuoteData.status !== 'DRAFT') {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Only DRAFT quotes can be sent')
        );
        return;
      }

      // Update quote status to SENT
      const { data, error } = await supabase
        .from('quotes')
        .update({
          status: 'SENT',
          updated_by: req.employee!.id,
        })
        .eq('id', id)
        .select()
        .single<Quote>();

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      res.json(successResponse(data));
    } catch (error) {
      console.error('Error sending quote:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to send quote')
      );
    }
  }
);

/**
 * POST /api/quotes/:id/accept
 * Accept a quote with contract updates
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/quotes/:id/accept',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Get quote with tax rule
      const { data: quoteData, error: quoteError } = await supabase
        .from('quotes')
        .select('*, tax_rules!inner(rate)')
        .eq('id', id)
        .single<Quote & { tax_rules: { rate: number } }>();

      if (quoteError) {
        if (quoteError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Quote not found')
          );
          return;
        }
        const apiError = translateDbError(quoteError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      if (quoteData.status === 'ACCEPTED') {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Quote is already accepted')
        );
        return;
      }

      // Store before state for audit
      const beforeData = { ...quoteData };

      // Get tax rate from tax_rule
      const taxRate = quoteData.tax_rules.rate;

      // Update quote status to ACCEPTED and snapshot tax rate
      const { data: updatedQuote, error: updateError } = await supabase
        .from('quotes')
        .update({
          status: 'ACCEPTED',
          accepted_at: new Date().toISOString(),
          tax_rate_snapshot: taxRate,
          updated_by: req.employee!.id,
        })
        .eq('id', id)
        .select()
        .single<Quote>();

      if (updateError) {
        const apiError = translateDbError(updateError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Update project or work order contract amounts
      if (quoteData.project_id) {
        // Get current project
        const { data: projectData, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', quoteData.project_id)
          .single<{
            base_contract_amount: number;
            change_order_amount: number;
          }>();

        if (projectError || !projectData) {
          res.status(500).json(
            errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch project')
          );
          return;
        }

        let newBaseContract = Number(projectData.base_contract_amount);
        let newChangeOrderAmount = Number(projectData.change_order_amount);

        if (quoteData.quote_type === 'BASE') {
          newBaseContract = Number(quoteData.total_amount);
        } else if (quoteData.quote_type === 'CHANGE_ORDER') {
          newChangeOrderAmount = newChangeOrderAmount + Number(quoteData.total_amount);
        }

        const newContractAmount = newBaseContract + newChangeOrderAmount;

        // Update project
        const { error: projectUpdateError } = await supabase
          .from('projects')
          .update({
            base_contract_amount: newBaseContract,
            change_order_amount: newChangeOrderAmount,
            contract_amount: newContractAmount,
            status: 'Active',
            updated_by: req.employee!.id,
          })
          .eq('id', quoteData.project_id);

        if (projectUpdateError) {
          const apiError = translateDbError(projectUpdateError);
          res.status(apiError.statusCode).json(
            errorResponse(apiError.code, apiError.message, apiError.details)
          );
          return;
        }
      } else if (quoteData.work_order_id) {
        // Update work order
        const { error: workOrderUpdateError } = await supabase
          .from('work_orders')
          .update({
            contract_subtotal: Number(quoteData.subtotal),
            contract_tax: Number(quoteData.tax_total),
            contract_total: Number(quoteData.total_amount),
          })
          .eq('id', quoteData.work_order_id);

        if (workOrderUpdateError) {
          const apiError = translateDbError(workOrderUpdateError);
          res.status(apiError.statusCode).json(
            errorResponse(apiError.code, apiError.message, apiError.details)
          );
          return;
        }
      }

      // Create audit log
      const { error: auditError } = await createAuditLog(supabase, {
        entity_type: 'quote',
        entity_id: id,
        action: 'QUOTE_ACCEPTED',
        actor_user_id: req.employee!.id,
        before_data: beforeData as unknown as Record<string, unknown>,
        after_data: updatedQuote as unknown as Record<string, unknown>,
      });

      if (auditError) {
        console.error('Error creating audit log:', auditError);
        // Don't fail the request if audit log fails
      }

      res.json(successResponse(updatedQuote));
    } catch (error) {
      console.error('Error accepting quote:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to accept quote')
      );
    }
  }
);

export default router;
