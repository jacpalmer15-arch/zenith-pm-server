import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Creates an audit log entry
 */
export async function createAuditLog(
  supabase: SupabaseClient,
  params: {
    entity_type: string;
    entity_id: string;
    action: string;
    actor_user_id: string;
    before_data?: Record<string, unknown>;
    after_data?: Record<string, unknown>;
    notes?: string;
  }
): Promise<{ error: unknown }> {
  const { error } = await supabase.from('audit_logs').insert({
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    action: params.action,
    actor_user_id: params.actor_user_id,
    before_data: params.before_data || null,
    after_data: params.after_data || null,
    notes: params.notes || null,
  });

  return { error };
}
