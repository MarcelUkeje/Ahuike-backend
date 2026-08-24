export interface AuthTokenPayload {
  sub: string; // userId
  email: string;
  role: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  token?: string; // backwards compatibility
  user?: { id: string; email: string; role: string };
  patient?: any;
  profile?: any;
}
