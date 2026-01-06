import { z } from 'zod';

/**
 * Validation schema for creating a new location
 */
export const createLocationSchema = z.object({
  label: z.string().max(100).optional(),
  street: z.string().min(1).max(255),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(50),
  zip: z.string().min(1).max(20),
  notes: z.string().optional(),
  is_active: z.boolean().optional(),
});

/**
 * Validation schema for updating an existing location
 * All fields are optional since this is a partial update
 */
export const updateLocationSchema = createLocationSchema.partial();

/**
 * TypeScript types inferred from schemas
 */
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
