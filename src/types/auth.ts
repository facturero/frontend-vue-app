export type AuthProvider = 'password' | 'google';

export interface Credentials {
  email: string;
  password: string;
}

export interface GoogleAuth {
  idToken: string;
  identification?: string;
}

export interface UserSummary {
  id: string;
  email: string;
  emailVerified: boolean;
  authProvider: AuthProvider;
  avatarFileId: string | null;
}

export interface TokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken: string;
  isNewUser?: boolean;
  needsOrg?: boolean;
  user: UserSummary;
}

export interface Me {
  id: string;
  email: string;
  emailVerified: boolean;
  authProvider: AuthProvider;
  orgId: string | null;
  permissions: string[];
  fullName: string | null;
  identification: { type: string; number: string } | null;
  createdAt: string;
  avatarFileId: string | null;
}

export interface CompleteProfileInput {
  fullName: string;
  identificationType: string;
  identificationNumber: string;
  avatarFileId?: string;
}
