export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: 'patient' | 'doctor' | 'admin' | 'nurse' | 'front_desk';
  isVerified: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OTPCode {
  id: string;
  userId: string;
  code: string;
  expiresAt: string;
  createdAt: string;
}

