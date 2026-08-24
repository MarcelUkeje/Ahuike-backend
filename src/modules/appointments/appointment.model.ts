export const appointmentStatuses = [
  'pending',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const;

export type AppointmentStatus = (typeof appointmentStatuses)[number];

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  departmentId: string;
  slotId: string;
  reasonForVisit: string;
  consultationFee: number;  // integer kobo/naira (₦)
  status: AppointmentStatus;
  notes: string | null;
  idempotencyKey?: string | null;
  paymentUrl?: string | null;
  doctorInstructions?: string | null;
  followUpDate?: string | null;
  createdAt: string;
  updatedAt: string;
  slotDate?: string | null;
  startTime?: string | null;
}
