import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  WORKER_SECRET: z.string().min(1),
  APP_REPORT_WEBHOOK_SECRET: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  WORKER_POLL_INTERVAL_MS: z.string().default('5000').transform(Number),
  WORKER_ID: z.string().optional(),
  WORKER_BATCH_SIZE: z.string().default('10').transform(Number),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  try {
    cachedEnv = envSchema.parse(process.env);
    return cachedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`Environment validation failed:\n${messages.join('\n')}`);
    }
    throw error;
  }
}

// Export for convenience
export const env = getEnv();
