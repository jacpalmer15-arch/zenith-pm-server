import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/config/env.js';

/**
 * Creates a Supabase server client using service role key for server-side access.
 * Uses factory pattern - creates a new client instance on each call.
 * 
 * Differences from src/config/supabase.ts:
 * - Factory pattern (new instance each call) vs Singleton (shared instance)
 * - Factory is preferred for new code for better testability and isolation
 * - Singleton remains for backward compatibility with existing middleware
 * 
 * Why factory instead of singleton:
 * - More flexible for testing (easy to mock)
 * - Avoids shared state issues in concurrent environments
 * - Allows for different configurations if needed
 * 
 * @returns {SupabaseClient} A new Supabase client instance
 */
export function createServerClient(): SupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
