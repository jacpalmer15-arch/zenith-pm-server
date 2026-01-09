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
  QBO_CLIENT_ID: z.string().min(1),
  QBO_CLIENT_SECRET: z.string().min(1),
  QBO_REDIRECT_URI: z.string().url(),
  QBO_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  QBO_WEBHOOK_VERIFIER: z.string().min(1),
  QBO_TOKEN_ENCRYPTION_KEY: z.string().min(1),
  QBO_API_MINOR_VERSION: z.string().default('65'),
  PM_APP_WEBHOOK_SECRET: z.string().min(1),
  // File storage configuration
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('uploads'),
  STORAGE_MAX_FILE_SIZE: z.string().default('10485760').transform(Number), // 10MB default
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
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
