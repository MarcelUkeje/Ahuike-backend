export interface DoctorSummary {
  id: string;
  name: string;
  slug: string;
  specialty: string;
  departmentId: string;
  imageUrl: string | null;
  rating: number;
  ratingCount: number;
  consultationFee: number;
  isAvailable: boolean;
}

export interface Doctor extends DoctorSummary {
  bio: string;
  qualifications: string[];
  availableSlots: AppointmentSlot[];
}

export interface AppointmentSlot {
  id: string;
  doctorId: string;
  slotDate: string;  // ISO date string YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;
  isBooked: boolean;
}
