export interface Prescription {
  id:             string;
  patientId:      string;
  doctorId:       string | null;
  appointmentId:  string | null;
  medicationName: string;
  dosage:         string;
  frequency:      string;
  duration:       string;
  instructions:   string;
  isActive:       boolean;
  issuedAt:       string;
  expiresAt:      string | null;
}
