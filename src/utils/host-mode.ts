/**
 * La misma aplicación se sirve en dos dominios: `crm.noahsolution.com` (todo el CRM) y `pos.noahsolution.com` (solo la caja web).
 * Que sea el dominio quien decida el modo evita una segunda aplicación que duplique el login, el idioma, el diseño y las
 * llamadas a la API: en `pos.` el router solo deja entrar a la caja y a las pantallas de acceso.
 */
export function isPosHost(hostname: string = typeof window === 'undefined' ? '' : window.location.hostname): boolean {
  return hostname.toLowerCase().startsWith('pos.');
}

/** Rutas que existen en el dominio de caja: la caja misma y lo necesario para entrar (login, invitación, restablecer contraseña). */
// /profile y /organization/settings: si alguien sin organización entra por aquí, el router lo manda a completarla; sin dejarlas
// pasar, esa redirección rebotaría contra la restricción del dominio sin fin.
const POS_HOST_PATHS = ['/pos', '/login', '/accept-invite', '/restablecer-contrasena', '/profile', '/organization/settings'];

export function isAllowedOnPosHost(path: string): boolean {
  return POS_HOST_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}
