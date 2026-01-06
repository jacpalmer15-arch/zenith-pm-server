import { Router, Request, Response } from 'express';
import { createServerClient, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { createQuoteLineSchema, updateQuoteLineSchema } from '@/validations/quoteLine.js';
import { QuoteLine } from '@/types/database.js';
import { ZodError } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';

const router = Router();

/**
 * Helper function to recalculate quote totals from lines
 */
async function recalculateQuoteTotals(
  supabase: SupabaseClient,
  quoteId: string
): Promise<{ success: boolean; error: unknown }> {
  // Get quote to fetch tax rate
  const { data: quoteData, error: quoteError } = await supabase
    .from('quotes')
    .select('tax_rule_id, tax_rate_snapshot')
    .eq('id', quoteId)
    .single<{ tax_rule_id: string; tax_rate_snapshot: number | null }>();

  if (quoteError || !quoteData) {
    return { success: false, error: quoteError };
  }

  // Get tax rate from tax_rule if not snapshotted
  let taxRate = quoteData.tax_rate_snapshot;
  if (taxRate === null) {
    const { data: taxRule, error: taxError } = await supabase
      .from('tax_rules')
      .select('rate')
      .eq('id', quoteData.tax_rule_id)
      .single<{ rate: number }>();

    if (taxError || !taxRule) {
      return { success: false, error: taxError };
    }
    taxRate = taxRule.rate;
  }

  // Get all lines for this quote
  const { data: lines, error: linesError } = await supabase
    .from('quote_lines')
    .select('*')
    .eq('quote_id', quoteId)
    .returns<QuoteLine[]>();

  if (linesError) {
    return { success: false, error: linesError };
  }

  // Calculate totals
  let subtotal = 0;
  let taxTotal = 0;

  for (const line of lines || []) {
    const lineSubtotal = Number(line.qty) * Number(line.unit_price);
    const lineTax = line.is_taxable ? lineSubtotal * taxRate : 0;
    const lineTotal = lineSubtotal + lineTax;

    // Update line totals
    await supabase
      .from('quote_lines')
      .update({
        line_subtotal: lineSubtotal,
        line_tax: lineTax,
        line_total: lineTotal,
      })
      .eq('id', line.id);

    subtotal += lineSubtotal;
    taxTotal += lineTax;
  }

  const totalAmount = subtotal + taxTotal;

  // Update quote totals
  const { error: updateError } = await supabase
    .from('quotes')
    .update({
      subtotal,
      tax_total: taxTotal,
      total_amount: totalAmount,
    })
    .eq('id', quoteId);

  if (updateError) {
    return { success: false, error: updateError };
  }

  return { success: true, error: null };
}

/**
 * GET /api/quotes/:id/lines
 * List lines for a quote
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/quotes/:id/lines',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Verify quote exists
      const { error: quoteError } = await supabase
        .from('quotes')
        .select('id')
        .eq('id', id)
        .single();

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
      const { data, error } = await supabase
        .from('quote_lines')
        .select('*')
        .eq('quote_id', id)
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
      console.error('Error listing quote lines:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list quote lines')
      );
    }
  }
);

/**
 * POST /api/quotes/:id/lines
 * Add a line to a quote (only if DRAFT)
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/quotes/:id/lines',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = createQuoteLineSchema.parse(req.body);

      const supabase = createServerClient();

      // Check if quote exists and is DRAFT
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select('status')
        .eq('id', id)
        .single();

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

      if (quote.status !== 'DRAFT') {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Only DRAFT quotes can be modified')
        );
        return;
      }

      // If part_id is provided, verify it exists
      if (validatedData.part_id) {
        const { data: part, error: partError } = await supabase
          .from('parts')
          .select('id')
          .eq('id', validatedData.part_id)
          .single();

        if (partError || !part) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', 'Invalid part_id: part does not exist')
          );
          return;
        }
      }

      // Get the next line_no for this quote
      const { data: maxLineData } = await supabase
        .from('quote_lines')
        .select('line_no')
        .eq('quote_id', id)
        .order('line_no', { ascending: false })
        .limit(1)
        .single<{ line_no: number }>();

      const nextLineNo = maxLineData ? maxLineData.line_no + 1 : 1;

      // Insert quote line
      const { data, error } = await supabase
        .from('quote_lines')
        .insert({
          quote_id: id,
          line_no: nextLineNo,
          ...validatedData,
        })
        .select()
        .single<QuoteLine>();

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Recalculate quote totals
      const { success, error: recalcError } = await recalculateQuoteTotals(supabase, id);
      if (!success) {
        console.error('Error recalculating quote totals:', recalcError);
        // Don't fail the request, just log the error
      }

      res.status(201).json(successResponse(data));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues)
        );
        return;
      }
      console.error('Error creating quote line:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create quote line')
      );
    }
  }
);

/**
 * PATCH /api/quote-lines/:id
 * Update a quote line (only if quote is DRAFT)
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.patch(
  '/api/quote-lines/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = updateQuoteLineSchema.parse(req.body);

      // Ensure at least one field is being updated
      if (Object.keys(validatedData).length === 0) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'At least one field must be provided for update')
        );
        return;
      }

      const supabase = createServerClient();

      // Get quote line with quote status
      const { data: lineData, error: lineError } = await supabase
        .from('quote_lines')
        .select('*, quotes!inner(status)')
        .eq('id', id)
        .single<QuoteLine & { quotes: { status: string } }>();

      if (lineError) {
        if (lineError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Quote line not found')
          );
          return;
        }
        const apiError = translateDbError(lineError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Check if quote is DRAFT
      const quoteStatus = lineData.quotes.status;
      if (quoteStatus !== 'DRAFT') {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Only lines on DRAFT quotes can be modified')
        );
        return;
      }

      // If part_id is being updated, verify it exists
      if (validatedData.part_id) {
        const { data: part, error: partError } = await supabase
          .from('parts')
          .select('id')
          .eq('id', validatedData.part_id)
          .single();

        if (partError || !part) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', 'Invalid part_id: part does not exist')
          );
          return;
        }
      }

      // Update quote line
      const { data, error } = await supabase
        .from('quote_lines')
        .update(validatedData)
        .eq('id', id)
        .select()
        .single<QuoteLine>();

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Recalculate quote totals
      const { success, error: recalcError } = await recalculateQuoteTotals(supabase, lineData.quote_id);
      if (!success) {
        console.error('Error recalculating quote totals:', recalcError);
        // Don't fail the request, just log the error
      }

      res.json(successResponse(data));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues)
        );
        return;
      }
      console.error('Error updating quote line:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update quote line')
      );
    }
  }
);

/**
 * DELETE /api/quote-lines/:id
 * Delete a quote line (only if quote is DRAFT)
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.delete(
  '/api/quote-lines/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Get quote line with quote status
      const { data: lineData, error: lineError } = await supabase
        .from('quote_lines')
        .select('*, quotes!inner(status)')
        .eq('id', id)
        .single<QuoteLine & { quotes: { status: string } }>();

      if (lineError) {
        if (lineError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Quote line not found')
          );
          return;
        }
        const apiError = translateDbError(lineError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Check if quote is DRAFT
      const quoteStatus = lineData.quotes.status;
      if (quoteStatus !== 'DRAFT') {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Only lines on DRAFT quotes can be deleted')
        );
        return;
      }

      const quoteId = lineData.quote_id;

      // Delete quote line
      const { error } = await supabase
        .from('quote_lines')
        .delete()
        .eq('id', id);

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Recalculate quote totals
      const { success, error: recalcError } = await recalculateQuoteTotals(supabase, quoteId);
      if (!success) {
        console.error('Error recalculating quote totals:', recalcError);
        // Don't fail the request, just log the error
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting quote line:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to delete quote line')
      );
    }
  }
);

export default router;
