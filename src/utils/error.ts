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
    response?: { data?: { message?: string; error?: { message?: string } } };
    message?: string;
  };
  return (
    err?.response?.data?.message ??
    // audit-log-service anida el error (`{ error: { code, message } }`) en vez
    // de devolverlo plano como el resto. Sin este caso, el usuario veía el
    // mensaje crudo de axios ("Request failed with status code 403").
    err?.response?.data?.error?.message ??
    err?.message ??
    'Error inesperado'
  );
}
