import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const baseURL = import.meta.env.VITE_API_URL;

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}
export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}
export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export const http = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Idioma activo de la interfaz. Se lee de localStorage y no del store de i18n
 * para que este módulo siga siendo independiente de Vue: el interceptor corre
 * fuera de cualquier componente.
 */
function currentLocale(): string {
  return localStorage.getItem('app-locale') || 'es';
}

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // El backend traduce con esto lo que no vive en el front: nombres y
  // descripciones del catálogo de plugins, y los mensajes de error.
  config.headers['Accept-Language'] = currentLocale();
  return config;
});

let refreshing: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('sin refresh token');
  const { data } = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const status = error.response?.status;
    const url = original?.url ?? '';
    const isAuthCall =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/google') ||
      url.includes('/auth/refresh');

    if (status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        if (!refreshing) {
          refreshing = doRefresh().finally(() => {
            refreshing = null;
          });
        }
        const newToken = await refreshing;
        // Sanity check: si el token que acabamos de guardar no está en localStorage,
        // algo está muy mal (storage bloqueado, otro tab lo pisó). No reintentes.
        if (getAccessToken() !== newToken) {
          clearTokens();
          if (window.location.pathname !== '/login') window.location.href = '/login';
          return Promise.reject(error);
        }
        original.headers.Authorization = `Bearer ${newToken}`;
        return http(original);
      } catch {
        clearTokens();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }

    // Si es un 401 después de un retry (el refresh trajo un token pero /me sigue fallando),
    // no hay ciclo válido posible: limpia y expulsa al login. Esto rompe cualquier bucle.
    if (status === 401 && original?._retry && !isAuthCall) {
      clearTokens();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  },
);
