import { z } from 'zod';

/**
 * Payment method enum matching the database enum
 */
export const paymentMethodEnum = z.enum(['CHECK', 'CASH', 'ACH', 'CREDIT_CARD', 'WIRE', 'OTHER']);

/**
 * Validation schema for recording a payment
 */
export const recordPaymentSchema = z.object({
  payment_date: z.string().date(),
  amount: z.number().positive(),
  payment_method: paymentMethodEnum,
  reference_no: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});

/**
 * TypeScript types inferred from schemas
 */
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodEnum>;
