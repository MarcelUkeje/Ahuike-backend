export interface DepartmentSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  isActive: boolean;
}

export interface Department extends DepartmentSummary {
  doctors: DoctorInDepartment[];
}

export interface DoctorInDepartment {
  id: string;
  name: string;
  specialty: string;
  rating: number;
  consultationFee: number;
  isAvailable: boolean;
}
