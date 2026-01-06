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
