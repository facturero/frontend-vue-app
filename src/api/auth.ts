import { http } from '@/utils/http';
import type { CompleteProfileInput, Credentials, GoogleAuth, Me, TokenResponse } from '@/types/auth';

export interface AcceptInviteInput {
  token: string;
  password: string;
}

export const authApi = {
  register: (body: Credentials) =>
    http.post<TokenResponse>('/auth/register', {
      email: body.email,
      password: body.password,
      identification: body.identification,
    }).then((r) => r.data),

  login: (body: Credentials) =>
    http.post<TokenResponse>('/auth/login', body).then((r) => r.data),

  google: (body: GoogleAuth) =>
    http.post<TokenResponse>('/auth/google', body).then((r) => r.data),

  refresh: (refreshToken: string) =>
    http.post<TokenResponse>('/auth/refresh', { refreshToken }).then((r) => r.data),

  logout: (refreshToken: string) =>
    http.post<void>('/auth/logout', { refreshToken }).then((r) => r.data),

  me: () => http.get<Me>('/auth/me').then((r) => r.data),

  completeProfile: (body: CompleteProfileInput) =>
    http.post<TokenResponse>('/auth/complete-profile', body).then((r) => r.data),

  acceptInvite: (body: AcceptInviteInput) =>
    http.post<TokenResponse>('/auth/accept-invite', body).then((r) => r.data),
};
