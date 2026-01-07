import { Router, Request, Response } from 'express';
import { createServerClient, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { createInvoiceLineSchema, updateInvoiceLineSchema } from '@/validations/invoiceLine.js';
import { InvoiceLine } from '@/types/database.js';
import { ZodError } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';

const router = Router();

/**
 * Helper function to recalculate invoice totals from lines
 */
async function recalculateInvoiceTotals(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<{ success: boolean; error: unknown }> {
  // Get invoice to fetch tax rate
  const { data: invoiceData, error: invoiceError } = await supabase
    .from('invoices')
    .select('tax_rule_id, tax_rate_snapshot')
    .eq('id', invoiceId)
    .single<{ tax_rule_id: string; tax_rate_snapshot: number | null }>();

  if (invoiceError || !invoiceData) {
    return { success: false, error: invoiceError };
  }

  // Get tax rate from tax_rule if not snapshotted
  let taxRate = invoiceData.tax_rate_snapshot;
  if (taxRate === null) {
    const { data: taxRule, error: taxError } = await supabase
      .from('tax_rules')
      .select('rate')
      .eq('id', invoiceData.tax_rule_id)
      .single<{ rate: number }>();

    if (taxError || !taxRule) {
      return { success: false, error: taxError };
    }
    taxRate = taxRule.rate;
  }

  // Get all lines for this invoice
  const { data: lines, error: linesError } = await supabase
    .from('invoice_lines')
    .select('*')
    .eq('invoice_id', invoiceId)
    .returns<InvoiceLine[]>();

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
      .from('invoice_lines')
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

  // Update invoice totals
  const { error: updateError } = await supabase
    .from('invoices')
    .update({
      subtotal,
      tax_total: taxTotal,
      total_amount: totalAmount,
    })
    .eq('id', invoiceId);

  if (updateError) {
    return { success: false, error: updateError };
  }

  return { success: true, error: null };
}

/**
 * GET /api/invoices/:id/lines
 * List lines for an invoice
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/invoices/:id/lines',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Verify invoice exists
      const { error: invoiceError } = await supabase
        .from('invoices')
        .select('id')
        .eq('id', id)
        .single();

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
      const { data, error } = await supabase
        .from('invoice_lines')
        .select('*')
        .eq('invoice_id', id)
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
      console.error('Error listing invoice lines:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list invoice lines')
      );
    }
  }
);

/**
 * POST /api/invoices/:id/lines
 * Add a line to an invoice (only if DRAFT)
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/invoices/:id/lines',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = createInvoiceLineSchema.parse(req.body);

      const supabase = createServerClient();

      // Check if invoice exists and is DRAFT
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', id)
        .single();

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

      if (invoice.status !== 'DRAFT') {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Only DRAFT invoices can be modified')
        );
        return;
      }

      // If quote_line_id is provided, verify it exists
      if (validatedData.quote_line_id) {
        const { data: quoteLine, error: quoteLineError } = await supabase
          .from('quote_lines')
          .select('id')
          .eq('id', validatedData.quote_line_id)
          .single();

        if (quoteLineError || !quoteLine) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', 'Invalid quote_line_id: quote line does not exist')
          );
          return;
        }
      }

      // Get the next line_no for this invoice
      const { data: maxLineData } = await supabase
        .from('invoice_lines')
        .select('line_no')
        .eq('invoice_id', id)
        .order('line_no', { ascending: false })
        .limit(1)
        .single<{ line_no: number }>();

      const nextLineNo = maxLineData ? maxLineData.line_no + 1 : 1;

      // Insert invoice line
      const { data, error } = await supabase
        .from('invoice_lines')
        .insert({
          invoice_id: id,
          line_no: nextLineNo,
          ...validatedData,
        })
        .select()
        .single<InvoiceLine>();

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Recalculate invoice totals
      const { success, error: recalcError } = await recalculateInvoiceTotals(supabase, id);
      if (!success) {
        console.error('Error recalculating invoice totals:', recalcError);
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
      console.error('Error creating invoice line:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create invoice line')
      );
    }
  }
);

/**
 * PATCH /api/invoice-lines/:id
 * Update an invoice line (only if invoice is DRAFT)
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.patch(
  '/api/invoice-lines/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = updateInvoiceLineSchema.parse(req.body);

      // Ensure at least one field is being updated
      if (Object.keys(validatedData).length === 0) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'At least one field must be provided for update')
        );
        return;
      }

      const supabase = createServerClient();

      // Get invoice line with invoice status
      const { data: lineData, error: lineError } = await supabase
        .from('invoice_lines')
        .select('*, invoices!inner(status)')
        .eq('id', id)
        .single<InvoiceLine & { invoices: { status: string } }>();

      if (lineError) {
        if (lineError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Invoice line not found')
          );
          return;
        }
        const apiError = translateDbError(lineError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Check if invoice is DRAFT
      const invoiceStatus = lineData.invoices.status;
      if (invoiceStatus !== 'DRAFT') {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Only lines on DRAFT invoices can be modified')
        );
        return;
      }

      // If quote_line_id is being updated, verify it exists
      if (validatedData.quote_line_id) {
        const { data: quoteLine, error: quoteLineError } = await supabase
          .from('quote_lines')
          .select('id')
          .eq('id', validatedData.quote_line_id)
          .single();

        if (quoteLineError || !quoteLine) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', 'Invalid quote_line_id: quote line does not exist')
          );
          return;
        }
      }

      // Update invoice line
      const { data, error } = await supabase
        .from('invoice_lines')
        .update(validatedData)
        .eq('id', id)
        .select()
        .single<InvoiceLine>();

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Recalculate invoice totals
      const { success, error: recalcError } = await recalculateInvoiceTotals(supabase, lineData.invoice_id);
      if (!success) {
        console.error('Error recalculating invoice totals:', recalcError);
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
      console.error('Error updating invoice line:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update invoice line')
      );
    }
  }
);

/**
 * DELETE /api/invoice-lines/:id
 * Delete an invoice line (only if invoice is DRAFT)
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.delete(
  '/api/invoice-lines/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Get invoice line with invoice status
      const { data: lineData, error: lineError } = await supabase
        .from('invoice_lines')
        .select('*, invoices!inner(status)')
        .eq('id', id)
        .single<InvoiceLine & { invoices: { status: string } }>();

      if (lineError) {
        if (lineError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Invoice line not found')
          );
          return;
        }
        const apiError = translateDbError(lineError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Check if invoice is DRAFT
      const invoiceStatus = lineData.invoices.status;
      if (invoiceStatus !== 'DRAFT') {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Only lines on DRAFT invoices can be deleted')
        );
        return;
      }

      const invoiceId = lineData.invoice_id;

      // Delete invoice line
      const { error } = await supabase
        .from('invoice_lines')
        .delete()
        .eq('id', id);

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Recalculate invoice totals
      const { success, error: recalcError } = await recalculateInvoiceTotals(supabase, invoiceId);
      if (!success) {
        console.error('Error recalculating invoice totals:', recalcError);
        // Don't fail the request, just log the error
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting invoice line:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to delete invoice line')
      );
    }
  }
);

export default router;
