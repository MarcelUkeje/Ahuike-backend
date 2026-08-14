export interface MedicalRecord {
  id:            string;
  patientId:     string;
  doctorId:      string | null;
  appointmentId: string | null;
  recordType:    string;
  title:         string;
  description:   string;
  diagnosis:     string | null;
  treatmentPlan: string | null;
  createdAt:     string;
  updatedAt:     string;
}
