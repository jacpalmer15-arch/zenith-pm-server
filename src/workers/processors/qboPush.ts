import { SupabaseClient } from '@supabase/supabase-js';
import { createQboCustomer } from '@/services/quickbooks/client.js';

interface CustomerRow {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  service_street: string | null;
  service_city: string | null;
  service_state: string | null;
  service_zip: string | null;
  qbo_customer_ref: string | null;
}

interface ProjectRow {
  id: string;
  name: string;
  customer_id: string;
  job_street: string | null;
  job_city: string | null;
  job_state: string | null;
  job_zip: string | null;
  qbo_job_ref: string | null;
}

function buildQboAddress(
  street: string | null,
  city: string | null,
  state: string | null,
  zip: string | null
): Record<string, string> | undefined {
  if (!street && !city && !state && !zip) {
    return undefined;
  }

  return {
    ...(street ? { Line1: street } : {}),
    ...(city ? { City: city } : {}),
    ...(state ? { CountrySubDivisionCode: state } : {}),
    ...(zip ? { PostalCode: zip } : {}),
  };
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
      { onConflict: 'entity_type,local_id' }
    );
}

async function pushCustomerToQbo(
  supabase: SupabaseClient,
  realmId: string,
  customer: CustomerRow
): Promise<string> {
  const billAddr = buildQboAddress(
    customer.billing_street,
    customer.billing_city,
    customer.billing_state,
    customer.billing_zip
  );
  const shipAddr = buildQboAddress(
    customer.service_street,
    customer.service_city,
    customer.service_state,
    customer.service_zip
  );

  const payload: Record<string, unknown> = {
    DisplayName: customer.name,
    CompanyName: customer.name,
    ...(customer.email ? { PrimaryEmailAddr: { Address: customer.email } } : {}),
    ...(customer.phone ? { PrimaryPhone: { FreeFormNumber: customer.phone } } : {}),
    ...(billAddr ? { BillAddr: billAddr } : {}),
    ...(shipAddr ? { ShipAddr: shipAddr } : {}),
  };

  const response = await createQboCustomer(supabase, realmId, payload);
  const qboCustomer = response.Customer as { Id?: string; SyncToken?: string } | undefined;

  if (!qboCustomer?.Id) {
    throw new Error('QuickBooks customer response missing Id');
  }

  const syncedAt = new Date().toISOString();

  await supabase
    .from('customers')
    .update({
      qbo_customer_ref: qboCustomer.Id,
      qbo_last_synced_at: syncedAt,
    })
    .eq('id', customer.id);

  await upsertEntityMap(
    supabase,
    'Customer',
    'customers',
    customer.id,
    qboCustomer.Id,
    qboCustomer.SyncToken ?? null,
    syncedAt
  );

  return qboCustomer.Id;
}

async function ensureCustomerInQbo(
  supabase: SupabaseClient,
  realmId: string,
  customerId: string
): Promise<string> {
  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single<CustomerRow>();

  if (error || !customer) {
    throw new Error('Customer not found for QBO sync');
  }

  if (customer.qbo_customer_ref) {
    return customer.qbo_customer_ref;
  }

  return pushCustomerToQbo(supabase, realmId, customer);
}

export async function processQboPushCustomer(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<void> {
  const realmId = payload.realm_id as string | undefined;
  const customerId = payload.customer_id as string | undefined;

  if (!realmId || !customerId) {
    throw new Error('Missing realm_id or customer_id for QBO push');
  }

  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single<CustomerRow>();

  if (error || !customer) {
    throw new Error('Customer not found for QBO push');
  }

  if (customer.qbo_customer_ref) {
    return;
  }

  await pushCustomerToQbo(supabase, realmId, customer);
}

export async function processQboPushProject(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<void> {
  const realmId = payload.realm_id as string | undefined;
  const projectId = payload.project_id as string | undefined;

  if (!realmId || !projectId) {
    throw new Error('Missing realm_id or project_id for QBO push');
  }

  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single<ProjectRow>();

  if (error || !project) {
    throw new Error('Project not found for QBO push');
  }

  if (project.qbo_job_ref) {
    return;
  }

  const parentId = await ensureCustomerInQbo(supabase, realmId, project.customer_id);

  const payloadBody: Record<string, unknown> = {
    DisplayName: project.name,
    Job: true,
    ParentRef: { value: parentId },
  };

  const jobAddr = buildQboAddress(
    project.job_street,
    project.job_city,
    project.job_state,
    project.job_zip
  );

  if (jobAddr) {
    payloadBody.ShipAddr = jobAddr;
  }

  const response = await createQboCustomer(supabase, realmId, payloadBody);
  const qboJob = response.Customer as { Id?: string; SyncToken?: string } | undefined;

  if (!qboJob?.Id) {
    throw new Error('QuickBooks job response missing Id');
  }

  const syncedAt = new Date().toISOString();

  await supabase
    .from('projects')
    .update({
      qbo_job_ref: qboJob.Id,
      qbo_last_synced_at: syncedAt,
    })
    .eq('id', project.id);

  await upsertEntityMap(
    supabase,
    'Job',
    'projects',
    project.id,
    qboJob.Id,
    qboJob.SyncToken ?? null,
    syncedAt
  );
}
