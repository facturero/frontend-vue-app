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
