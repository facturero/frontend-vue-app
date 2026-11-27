/**
 * Código de negocio del error (`code`), cuando el servicio lo devuelve. Sirve
 * para reaccionar a un caso concreto —el 409 `PLAN_VERSION_CONFLICT` del
 * editor del plano— sin mirar el texto, que cambia con el idioma.
 */
export function extractErrorCode(e: unknown): string | null {
  const err = e as {
    response?: { data?: { code?: string; error?: { code?: string } } };
  };
  return err?.response?.data?.code ?? err?.response?.data?.error?.code ?? null;
}

export function extractError(e: unknown): string {
  const err = e as {
    response?: { data?: { message?: string; details?: unknown; error?: { message?: string } } };
    message?: string;
  };
  const data = err?.response?.data;
  // Errores de validación: el mensaje es genérico («La petición no es válida.») y el motivo viene en `details`. Sin esto la
  // persona no sabía qué corregir (p. ej. un título de tarea de más de 500 caracteres).
  const reasons = Array.isArray(data?.details)
    ? (data.details as Array<{ message?: unknown }>).map((d) => d?.message).filter((m): m is string => typeof m === 'string' && !!m)
    : [];
  if (data?.message && reasons.length) return `${data.message} ${[...new Set(reasons)].join(' ')}`;
  return (
    data?.message ??
    // audit-log-service anida el error (`{ error: { code, message } }`) en vez
    // de devolverlo plano como el resto. Sin este caso, el usuario veía el
    // mensaje crudo de axios ("Request failed with status code 403").
    data?.error?.message ??
    err?.message ??
    'Error inesperado'
  );
}
