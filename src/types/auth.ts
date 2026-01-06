export type Role = 'TECH' | 'OFFICE' | 'ADMIN';

export interface AuthPayload {
  userId: string;
  email?: string;
  claims: Record<string, unknown>;
}

export interface Employee {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
