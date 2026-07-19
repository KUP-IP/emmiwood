export type Id = string;

export interface Shop {
  id: Id;
  name: string;
  address: string;
  phone: string;
  timezone: string;
  min_notice_minutes: number;
  horizon_days: number;
  change_cutoff_minutes: number;
}

export interface Service {
  id: Id;
  name: string;
  description: string;
  price_cents: number;
  duration_minutes: number;
  buffer_minutes: number;
  active: number;
  sort_order: number;
}

export interface Barber {
  id: Id;
  name: string;
  bio: string;
  active: number;
  sort_order: number;
}

export interface Eligibility {
  id: Id;
  barber_id: Id;
  service_id: Id;
}

export interface Slot {
  start: number;
  barberId: Id;
  barberName: string;
}

export interface Catalog {
  shop: Shop;
  services: Service[];
  barbers: Barber[];
  eligibility: Eligibility[];
}

export interface Appointment {
  id: Id;
  service_id: Id;
  barber_id: Id;
  start_at: number;
  end_at: number;
  status: string;
  customer_name: string;
  phone: string;
  email?: string;
  sms_consent?: number;
  barber_name: string;
  service_name: string;
  price_cents?: number;
  duration_minutes?: number;
  notes?: string;
}

export interface CustomerSummary {
  id: Id;
  name: string;
  phone: string;
  email?: string;
  sms_consent: number;
  appointment_count: number;
  last_appointment_at?: number;
}

export interface AdminUser {
  id: Id;
  email: string;
  role: string;
}

export type AdminRow = Record<string, string | number | boolean | null> & { id: Id };
export type AdminResource = "services" | "barbers" | "availability" | "blocks" | "eligibility";

export interface Dashboard {
  admin: AdminUser;
  shop: Shop;
  appointments: Appointment[];
  barbers: Barber[];
  services: Service[];
  availability: AdminRow[];
  blocks: AdminRow[];
  eligibility: Eligibility[];
  outbox: AdminRow[];
  events: AdminRow[];
  customers: CustomerSummary[];
}
