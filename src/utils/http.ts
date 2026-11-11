import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { traceFailure, traceRequest, traceResponse } from '@/telemetry';

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
  traceRequest(config);
  return config;
});

let refreshing: Promise<string> | null = null;

/**
 * Renueva el access token. El refresh token se rota (auth-service revoca el viejo al emitir el nuevo) y las pestañas comparten
 * localStorage: si dos pestañas recibían 401 a la vez, las dos mandaban el mismo refresh token, una ganaba y la otra recibía 401 y
 * cerraba la sesión en TODAS. Por eso la renovación va bajo un candado entre pestañas (Web Locks) y, ya dentro, si otra pestaña
 * renovó mientras se esperaba (el access token guardado no es el que falló), se usa ese sin volver a refrescar.
 */
async function doRefresh(staleAccess: string | null): Promise<string> {
  const run = async (): Promise<string> => {
    const current = getAccessToken();
    if (current && current !== staleAccess) return current;
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new Error('sin refresh token');
    // `baseURL` como opción y no pegado a mano: en producción VITE_API_URL termina en «/» y `${baseURL}/auth/refresh` daba
    // «//auth/refresh», que el gateway responde con 404. La renovación nunca llegó a auth-service y la sesión moría a los 15 minutos
    // (lo que dura el access token). axios junta las barras igual que en el resto de llamadas.
    const { data } = await axios.post('/auth/refresh', { refreshToken }, { baseURL });
    setTokens(data.accessToken, data.refreshToken);
    return data.accessToken;
  };
  return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request('crm:auth-refresh', run) : run();
}

http.interceptors.response.use(
  (response) => {
    traceResponse(response);
    return response;
  },
  async (error: AxiosError) => {
    traceFailure(error);
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
      const staleAccess = String(original.headers.Authorization ?? '').replace(/^Bearer /, '') || null;
      try {
        if (!refreshing) {
          refreshing = doRefresh(staleAccess).finally(() => {
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
        // Sin Web Locks (navegador viejo) la carrera sigue posible: si el refresco falló pero otra pestaña ya guardó un token
        // nuevo, se reintenta con ese en vez de cerrar la sesión.
        const fresh = getAccessToken();
        if (fresh && fresh !== staleAccess) {
          original.headers.Authorization = `Bearer ${fresh}`;
          return http(original);
        }
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
