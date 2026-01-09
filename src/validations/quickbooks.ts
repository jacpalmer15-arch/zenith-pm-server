import { z } from 'zod';

export const qboConnectQuerySchema = z.object({
  state: z.string().min(1).optional(),
});

export const qboCallbackQuerySchema = z.object({
  code: z.string().min(1),
  realmId: z.string().min(1),
  state: z.string().optional(),
});

export const qboConnectionQuerySchema = z.object({
  realm_id: z.string().min(1).optional(),
});

export const qboRefreshSchema = z.object({
  realm_id: z.string().min(1),
});

export const qboPushCustomersSchema = z.object({
  realm_id: z.string().min(1),
  customer_ids: z.array(z.string().uuid()).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const qboPushProjectsSchema = z.object({
  realm_id: z.string().min(1),
  project_ids: z.array(z.string().uuid()).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
