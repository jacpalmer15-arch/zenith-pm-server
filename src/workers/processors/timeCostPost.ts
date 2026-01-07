import { SupabaseClient } from '@supabase/supabase-js';

interface TimeEntry {
  id: string;
  work_order_id: string;
  tech_user_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  break_minutes: number;
}

interface Employee {
  id: string;
  display_name: string;
  labor_rate?: number;
}

interface Settings {
  default_labor_rate: number;
  labor_cost_type_id?: string;
  labor_cost_code_id?: string;
}

interface WorkOrder {
  project_id: string | null;
  total_cost?: number;
}

/**
 * Process time entry cost posting job
 * Creates a job_cost_entry for labor costs based on time entry data
 */
export async function processTimeCostPost(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<void> {
  const timeEntryId = payload.time_entry_id as string;

  if (!timeEntryId) {
    throw new Error('Missing time_entry_id in payload');
  }

  // 1. Fetch time entry
  const { data: timeEntry, error: timeEntryError } = await supabase
    .from('work_order_time_entries')
    .select('id, work_order_id, tech_user_id, clock_in_at, clock_out_at, break_minutes')
    .eq('id', timeEntryId)
    .single<TimeEntry>();

  if (timeEntryError || !timeEntry) {
    throw new Error(`Time entry not found: ${timeEntryId}`);
  }

  if (!timeEntry.clock_out_at) {
    throw new Error(`Time entry ${timeEntryId} is not clocked out yet`);
  }

  // 2. Calculate hours
  const clockInMs = new Date(timeEntry.clock_in_at).getTime();
  const clockOutMs = new Date(timeEntry.clock_out_at).getTime();
  const totalMinutes = (clockOutMs - clockInMs) / 60000;
  const workedMinutes = totalMinutes - timeEntry.break_minutes;
  const hours = workedMinutes / 60;

  if (hours <= 0) {
    throw new Error(`Invalid hours calculated: ${hours}`);
  }

  // 3. Fetch employee and labor rate
  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('id, display_name, labor_rate')
    .eq('id', timeEntry.tech_user_id)
    .single<Employee>();

  if (employeeError || !employee) {
    throw new Error(`Employee not found: ${timeEntry.tech_user_id}`);
  }

  // 4. Fetch settings for default labor rate and cost type/code
  const { data: settings, error: settingsError } = await supabase
    .from('settings')
    .select('default_labor_rate, labor_cost_type_id, labor_cost_code_id')
    .limit(1)
    .single<Settings>();

  if (settingsError || !settings) {
    throw new Error('Settings not found');
  }

  // Use employee labor rate if set, otherwise use default
  const laborRate = employee.labor_rate ?? settings.default_labor_rate;

  if (!laborRate || laborRate <= 0) {
    throw new Error(`Invalid labor rate: ${laborRate}`);
  }

  // 5. Calculate cost
  const amount = Math.round(hours * laborRate * 100) / 100; // Round to 2 decimal places

  // 6. Get cost_type_id and cost_code_id from settings
  // If not set in settings, we need to find a default labor cost type and code
  let costTypeId = settings.labor_cost_type_id;
  let costCodeId = settings.labor_cost_code_id;

  // If settings don't have labor cost type/code, try to find one with "labor" in the name
  if (!costTypeId || !costCodeId) {
    const { data: costTypes } = await supabase
      .from('cost_types')
      .select('id, name')
      .ilike('name', '%labor%')
      .limit(1);

    if (costTypes && costTypes.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      costTypeId = costTypes[0].id;

      // Find a cost code for this cost type
      const { data: costCodes } = await supabase
        .from('cost_codes')
        .select('id, code')
        .eq('cost_type_id', costTypeId)
        .limit(1);

      if (costCodes && costCodes.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        costCodeId = costCodes[0].id;
      }
    }
  }

  if (!costTypeId || !costCodeId) {
    throw new Error('Labor cost type or cost code not configured in settings');
  }

  // 7. Check idempotency
  const idempotencyKey = `time_entry:${timeEntryId}`;
  const { data: existingEntry } = await supabase
    .from('job_cost_entries')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .limit(1);

  if (existingEntry && existingEntry.length > 0) {
    // Entry already exists, skip
    return;
  }

  // 8. Fetch work order to get project_id
  const { data: workOrder, error: workOrderError } = await supabase
    .from('work_orders')
    .select('project_id')
    .eq('id', timeEntry.work_order_id)
    .single<WorkOrder>();

  if (workOrderError || !workOrder) {
    throw new Error(`Work order not found: ${timeEntry.work_order_id}`);
  }

  // 9. Insert job_cost_entry
  const txnDate = new Date(timeEntry.clock_out_at).toISOString().split('T')[0];
  const description = `Labor: ${employee.display_name} on ${txnDate}`;

  const { error: insertError } = await supabase
    .from('job_cost_entries')
    .insert({
      project_id: workOrder.project_id,
      work_order_id: timeEntry.work_order_id,
      cost_type_id: costTypeId,
      cost_code_id: costCodeId,
      txn_date: txnDate,
      qty: hours,
      unit_cost: laborRate,
      amount: amount,
      description: description,
      source_type: 'TIME_ENTRY',
      source_id: timeEntryId,
      idempotency_key: idempotencyKey,
    });

  if (insertError) {
    throw new Error(`Failed to insert job_cost_entry: ${insertError.message}`);
  }

  // 10. Update work_order total_cost (if column exists)
  // Note: This is optional and depends on whether total_cost is tracked
  const { data: workOrderWithCost } = await supabase
    .from('work_orders')
    .select('total_cost')
    .eq('id', timeEntry.work_order_id)
    .single();

  if (workOrderWithCost && 'total_cost' in workOrderWithCost) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const currentTotal = workOrderWithCost.total_cost ?? 0;
    await supabase
      .from('work_orders')
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      .update({ total_cost: currentTotal + amount })
      .eq('id', timeEntry.work_order_id);
  }
}
