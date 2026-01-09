import { SupabaseClient } from '@supabase/supabase-js';
import { fetchQboEntity } from '@/services/quickbooks/client.js';

interface QboAddress {
  Line1?: string;
  City?: string;
  CountrySubDivisionCode?: string;
  PostalCode?: string;
}

interface QboEmail {
  Address?: string;
}

interface QboPhone {
  FreeFormNumber?: string;
}

interface QboCustomer {
  Id: string;
  DisplayName?: string;
  CompanyName?: string;
  FullyQualifiedName?: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryEmailAddr?: QboEmail;
  PrimaryPhone?: QboPhone;
  BillAddr?: QboAddress;
  ShipAddr?: QboAddress;
  ParentRef?: { value?: string };
  Job?: boolean;
  SyncToken?: string;
}

interface QboWebhookEntity {
  name?: string;
  id?: string;
  operation?: string;
}

interface QboWebhookNotification {
  realmId?: string;
  dataChangeEvent?: {
    entities?: QboWebhookEntity[];
  };
}

function mapAddress(address?: QboAddress): {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  return {
    street: address?.Line1 ?? null,
    city: address?.City ?? null,
    state: address?.CountrySubDivisionCode ?? null,
    zip: address?.PostalCode ?? null,
  };
}

async function getNextNumber(
  supabase: SupabaseClient,
  kind: 'customer' | 'project'
): Promise<string> {
  const { data, error } = await supabase.rpc('get_next_number', {
    p_kind: kind,
  });

  if (error || typeof data !== 'string') {
    throw new Error(`Failed to generate ${kind} number`);
  }

  return data;
}

async function upsertEntityMap(
  supabase: SupabaseClient,
  entityType: string,
  localTable: string,
  localId: string,
  qboId: string,
  syncToken: string | null,
  syncedAt: string
): Promise<void> {
  await supabase
    .from('qbo_entity_map')
    .upsert(
      {
        entity_type: entityType,
        local_table: localTable,
        local_id: localId,
        qbo_id: qboId,
        qbo_sync_token: syncToken,
        last_synced_at: syncedAt,
      },
      { onConflict: 'entity_type,qbo_id' }
    );
}

async function upsertCustomer(
  supabase: SupabaseClient,
  qboCustomer: QboCustomer,
  syncedAt: string
): Promise<string> {
  const billAddress = mapAddress(qboCustomer.BillAddr);
  const serviceAddress = mapAddress(qboCustomer.ShipAddr);

  const name =
    qboCustomer.DisplayName ??
    qboCustomer.CompanyName ??
    qboCustomer.FullyQualifiedName ??
    `Customer ${qboCustomer.Id}`;

  const contactName = [qboCustomer.GivenName, qboCustomer.FamilyName]
    .filter(Boolean)
    .join(' ');

  const { data: existing, error: existingError } = await supabase
    .from('customers')
    .select('id, customer_no')
    .eq('qbo_customer_ref', qboCustomer.Id)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('customers')
      .update({
        name,
        contact_name: contactName || null,
        email: qboCustomer.PrimaryEmailAddr?.Address ?? null,
        phone: qboCustomer.PrimaryPhone?.FreeFormNumber ?? null,
        billing_street: billAddress.street,
        billing_city: billAddress.city,
        billing_state: billAddress.state,
        billing_zip: billAddress.zip,
        service_street: serviceAddress.street,
        service_city: serviceAddress.city,
        service_state: serviceAddress.state,
        service_zip: serviceAddress.zip,
        qbo_customer_ref: qboCustomer.Id,
        qbo_last_synced_at: syncedAt,
        updated_at: syncedAt,
      })
      .eq('id', existing.id);

    if (updateError) {
      throw updateError;
    }

    await upsertEntityMap(
      supabase,
      'Customer',
      'customers',
      existing.id,
      qboCustomer.Id,
      qboCustomer.SyncToken ?? null,
      syncedAt
    );

    return existing.id;
  }

  const customerNo = await getNextNumber(supabase, 'customer');

  const { data: inserted, error: insertError } = await supabase
    .from('customers')
    .insert({
      customer_no: customerNo,
      name,
      contact_name: contactName || null,
      email: qboCustomer.PrimaryEmailAddr?.Address ?? null,
      phone: qboCustomer.PrimaryPhone?.FreeFormNumber ?? null,
      billing_street: billAddress.street,
      billing_city: billAddress.city,
      billing_state: billAddress.state,
      billing_zip: billAddress.zip,
      service_street: serviceAddress.street,
      service_city: serviceAddress.city,
      service_state: serviceAddress.state,
      service_zip: serviceAddress.zip,
      qbo_customer_ref: qboCustomer.Id,
      qbo_last_synced_at: syncedAt,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw insertError ?? new Error('Failed to insert customer');
  }

  await upsertEntityMap(
    supabase,
    'Customer',
    'customers',
    inserted.id,
    qboCustomer.Id,
    qboCustomer.SyncToken ?? null,
    syncedAt
  );

  return inserted.id;
}

async function upsertProject(
  supabase: SupabaseClient,
  qboJob: QboCustomer,
  customerId: string,
  syncedAt: string
): Promise<void> {
  const jobAddress = mapAddress(qboJob.ShipAddr ?? qboJob.BillAddr);
  const name =
    qboJob.DisplayName ??
    qboJob.CompanyName ??
    qboJob.FullyQualifiedName ??
    `Project ${qboJob.Id}`;

  const { data: existing, error: existingError } = await supabase
    .from('projects')
    .select('id')
    .eq('qbo_job_ref', qboJob.Id)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        name,
        customer_id: customerId,
        job_street: jobAddress.street,
        job_city: jobAddress.city,
        job_state: jobAddress.state,
        job_zip: jobAddress.zip,
        qbo_job_ref: qboJob.Id,
        qbo_last_synced_at: syncedAt,
        updated_at: syncedAt,
      })
      .eq('id', existing.id);

    if (updateError) {
      throw updateError;
    }

    await upsertEntityMap(
      supabase,
      'Job',
      'projects',
      existing.id,
      qboJob.Id,
      qboJob.SyncToken ?? null,
      syncedAt
    );

    return;
  }

  const projectNo = await getNextNumber(supabase, 'project');

  const { data: inserted, error: insertError } = await supabase
    .from('projects')
    .insert({
      project_no: projectNo,
      customer_id: customerId,
      name,
      job_street: jobAddress.street,
      job_city: jobAddress.city,
      job_state: jobAddress.state,
      job_zip: jobAddress.zip,
      qbo_job_ref: qboJob.Id,
      qbo_last_synced_at: syncedAt,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw insertError ?? new Error('Failed to insert project');
  }

  await upsertEntityMap(
    supabase,
    'Job',
    'projects',
    inserted.id,
    qboJob.Id,
    qboJob.SyncToken ?? null,
    syncedAt
  );
}

async function ensureParentCustomer(
  supabase: SupabaseClient,
  realmId: string,
  parentId: string,
  syncedAt: string
): Promise<string> {
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('qbo_customer_ref', parentId)
    .maybeSingle();

  if (existing?.id) {
    return existing.id;
  }

  const response = await fetchQboEntity(supabase, realmId, 'customer', parentId);
  const qboCustomer = (response.Customer ?? response.customer) as QboCustomer | undefined;

  if (!qboCustomer) {
    throw new Error('QuickBooks parent customer not found');
  }

  return upsertCustomer(supabase, qboCustomer, syncedAt);
}

export async function processQboWebhookEvent(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<void> {
  const webhookEventId = payload.webhook_event_id as string | undefined;

  if (!webhookEventId) {
    throw new Error('Missing webhook_event_id in job payload');
  }

  const { data: webhookEvent, error } = await supabase
    .from('qbo_webhook_events')
    .select('*')
    .eq('id', webhookEventId)
    .single();

  if (error || !webhookEvent) {
    throw new Error('QuickBooks webhook event not found');
  }

  const syncedAt = new Date().toISOString();

  await supabase
    .from('qbo_webhook_events')
    .update({
      status: 'PROCESSING',
      attempts: webhookEvent.attempts + 1,
      last_error: null,
    })
    .eq('id', webhookEventId);

  try {
    const notifications = (webhookEvent.payload as { eventNotifications?: QboWebhookNotification[] })
      .eventNotifications;

    if (!notifications || notifications.length === 0) {
      await supabase
        .from('qbo_webhook_events')
        .update({
          status: 'PROCESSED',
          processed_at: syncedAt,
        })
        .eq('id', webhookEventId);
      return;
    }

    for (const notification of notifications) {
      const realmId = notification.realmId ?? webhookEvent.realm_id;
      const entities = notification.dataChangeEvent?.entities ?? [];

      for (const entity of entities) {
        if (!entity.name || !entity.id) {
          continue;
        }

        if (entity.name === 'Customer') {
          const response = await fetchQboEntity(supabase, realmId, 'customer', entity.id);
          const qboCustomer = (response.Customer ?? response.customer) as QboCustomer | undefined;

          if (!qboCustomer) {
            continue;
          }

          if (qboCustomer.Job || qboCustomer.ParentRef?.value) {
            const parentId = qboCustomer.ParentRef?.value;
            if (!parentId) {
              continue;
            }
            const customerId = await ensureParentCustomer(
              supabase,
              realmId,
              parentId,
              syncedAt
            );
            await upsertProject(supabase, qboCustomer, customerId, syncedAt);
          } else {
            await upsertCustomer(supabase, qboCustomer, syncedAt);
          }
        }
      }
    }

    await supabase
      .from('qbo_webhook_events')
      .update({
        status: 'PROCESSED',
        processed_at: syncedAt,
      })
      .eq('id', webhookEventId);
  } catch (processError) {
    const message = processError instanceof Error ? processError.message : String(processError);

    await supabase
      .from('qbo_webhook_events')
      .update({
        status: 'FAILED',
        last_error: message,
      })
      .eq('id', webhookEventId);

    throw processError;
  }
}
