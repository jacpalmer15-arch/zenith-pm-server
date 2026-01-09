import { SupabaseClient } from '@supabase/supabase-js';

export async function processPmAppWebhook(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<void> {
  const webhookEventId = payload.webhook_event_id as string | undefined;

  if (!webhookEventId) {
    throw new Error('Missing webhook_event_id in job payload');
  }

  const { error } = await supabase
    .from('webhook_events')
    .update({
      status: 'PROCESSED',
      processed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', webhookEventId);

  if (error) {
    throw new Error('Failed to update webhook event status');
  }
}
