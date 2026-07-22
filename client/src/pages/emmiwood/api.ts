import type { AdminResource, AdminRow, AdminUser, Appointment, Catalog, CustomerSummary, Dashboard, Slot } from './types';

const BASE = '/api/emmiwood';
type Envelope<T> = { ok: boolean; data: T; error?: string | { message?: string }; code?: string; message?: string };

export class EmmiwoodApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'EmmiwoodApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({})) as Partial<Envelope<T>>;
  const error = typeof body.error === 'string' ? body.error : body.error?.message;
  if (!response.ok || !body.ok) throw new EmmiwoodApiError(error || body.message || 'Something went wrong. Please try again.', response.status, body.code);
  return body.data as T;
}

export const emmiwoodApi = {
  catalog: () => request<Catalog>('/catalog'),
  slots: (serviceId: string, date: string, barberId = 'first') => request<Slot[]>(`/slots?${new URLSearchParams({ serviceId, date, barberId })}`),
  book: (input: Record<string, unknown>) => request<{ id: string; manageToken: string; start: number; barberName: string; serviceName: string }>('/appointments', { method: 'POST', body: JSON.stringify(input) }),
  exchangeManage: (token: string) => request<Appointment>('/appointments/manage-session', { method: 'POST', body: JSON.stringify({ token }) }),
  manage: () => request<Appointment>('/appointments/manage'),
  cancel: () => request<{ ok: true }>('/appointments/cancel', { method: 'POST', body: '{}' }),
  reschedule: (input: Record<string, unknown>) => request<Appointment>('/appointments/reschedule', { method: 'POST', body: JSON.stringify(input) }),
  requestCode: (phone: string) => request<{ ok: true; previewCode?: string }>('/admin/auth/request-code', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyCode: (phone: string, code: string) => request<{ admin: AdminUser }>('/admin/auth/verify', { method: 'POST', body: JSON.stringify({ phone, code }) }),
  me: () => request<AdminUser>('/admin/auth/me'),
  logout: () => request<{ ok: true }>('/admin/auth/logout', { method: 'POST', body: '{}' }),
  dashboard: () => request<Dashboard>('/admin/dashboard'),
  appointments: () => request<Appointment[]>('/admin/appointments'),
  customers: () => request<CustomerSummary[]>('/admin/customers'),
  createAppointment: (input: Record<string, unknown>) => request<Appointment>('/admin/appointments', { method: 'POST', body: JSON.stringify(input) }),
  updateAppointment: (id: string, input: Record<string, unknown>) => request<Appointment>(`/admin/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  cancelAppointment: (id: string) => request<{ ok: true }>(`/admin/appointments/${id}`, { method: 'DELETE' }),
  resources: (resource: AdminResource) => request<AdminRow[]>(`/admin/resources/${resource}`),
  createResource: (resource: AdminResource, input: AdminRow) => request<AdminRow>(`/admin/resources/${resource}`, { method: 'POST', body: JSON.stringify(input) }),
  updateResource: (resource: AdminResource, id: string, input: AdminRow) => request<AdminRow>(`/admin/resources/${resource}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteResource: (resource: AdminResource, id: string) => request<{ ok: true }>(`/admin/resources/${resource}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
