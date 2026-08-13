export interface Patient {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

/** Full patient record including password hash — never expose this to clients. */
export interface PatientRecord extends Patient {
  passwordHash: string;
}
