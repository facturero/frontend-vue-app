export type AuthMode = 'login' | 'register';

/**
 * Pantalla con la que abre `/login`. `?mode=register` abre directo «Crear cuenta»: es a donde apunta «Pruébalo gratis» de
 * la landing, para que quien llega a probar no tenga que buscar el botón. Cualquier otro valor es el login de siempre.
 */
export function initialAuthMode(query: Record<string, unknown>): AuthMode {
  const raw = query.mode;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'register' ? 'register' : 'login';
}

/**
 * Credenciales de desarrollo precargadas en el formulario. SOLO en desarrollo y solo al entrar: en producción (y al
 * crear una cuenta) un cliente no debe ver `admin@admin.com` escrito en el formulario.
 */
export function prefilledCredentials(dev: boolean, mode: AuthMode): { email: string; password: string } {
  return dev && mode === 'login' ? { email: 'admin@admin.com', password: 'admin' } : { email: '', password: '' };
}
