export interface Patient {
  id: string;
  userId: string;
  name: string;
  dob: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  medicalHistory: string;
  createdAt: string;
  updatedAt: string;
}

// Used for API responses to include the user's email
export interface PatientProfile extends Patient {
  email: string;
}
