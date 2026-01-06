/**
 * Customer database record type
 */
export interface Customer {
  id: string;
  customer_no: string;
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
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  qbo_customer_ref: string | null;
  qbo_last_synced_at: string | null;
}

/**
 * Location database record type
 */
export interface Location {
  id: string;
  customer_id: string;
  label: string | null;
  street: string;
  city: string;
  state: string;
  zip: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Project database record type
 */
export interface Project {
  id: string;
  project_no: string;
  customer_id: string;
  name: string;
  status: 'Planning' | 'Quoted' | 'Active' | 'Completed' | 'Closed';
  job_street: string | null;
  job_city: string | null;
  job_state: string | null;
  job_zip: string | null;
  base_contract_amount: number;
  change_order_amount: number;
  contract_amount: number;
  budget_amount: number;
  invoiced_amount: number;
  paid_amount: number;
  total_cost: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  qbo_job_ref: string | null;
  qbo_last_synced_at: string | null;
}

/**
 * Work order status type
 */
export type WorkOrderStatus =
  | 'UNSCHEDULED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELED';

/**
 * Work order database record type
 */
export interface WorkOrder {
  id: string;
  customer_id: string;
  location_id: string;
  work_order_no: string | null;
  status: WorkOrderStatus;
  priority: number;
  summary: string;
  description: string;
  requested_window_start: string | null;
  requested_window_end: string | null;
  assigned_to: string | null;
  opened_at: string;
  completed_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  contract_subtotal: number;
  contract_tax: number;
  contract_total: number;
}

/**
 * Work order schedule database record type
 */
export interface WorkOrderSchedule {
  id: string;
  work_order_id: string;
  tech_user_id: string;
  start_at: string;
  end_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Work order time entry database record type
 */
export interface WorkOrderTimeEntry {
  id: string;
  work_order_id: string;
  tech_user_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  break_minutes: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Quote type enum
 */
export type QuoteType = 'BASE' | 'CHANGE_ORDER';

/**
 * Quote status enum
 */
export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';

/**
 * Quote database record type
 */
export interface Quote {
  id: string;
  quote_no: string;
  project_id: string | null;
  work_order_id: string | null;
  quote_type: QuoteType;
  parent_quote_id: string | null;
  status: QuoteStatus;
  quote_date: string;
  valid_until: string | null;
  tax_rule_id: string;
  tax_rate_snapshot: number | null;
  subtotal: number;
  tax_total: number;
  total_amount: number;
  accepted_at: string | null;
  pdf_file_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  qbo_estimate_ref: string | null;
  qbo_last_synced_at: string | null;
  qbo_push_status: string | null;
}

/**
 * Quote line database record type
 */
export interface QuoteLine {
  id: string;
  quote_id: string;
  line_no: number;
  part_id: string | null;
  description: string;
  uom: string;
  qty: number;
  unit_price: number;
  is_taxable: boolean;
  line_subtotal: number;
  line_tax: number;
  line_total: number;
  created_at: string;
  updated_at: string;
}
