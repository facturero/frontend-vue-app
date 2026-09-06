/**
 * Reintenta una acción hasta que la condición se cumpla o se agote el tiempo.
 * Úsalo para invariantes que dependen de un evento asíncrono (RabbitMQ) en vez de
 * un `expect` inmediato, que sería flaky.
 */
export async function waitForCondition(
  check: () => Promise<boolean>,
  options: { timeoutMs?: number; intervalMs?: number; message?: string } = {},
): Promise<void> {
  const { timeoutMs = 15_000, intervalMs = 1_000, message = 'condición no se cumplió a tiempo' } = options;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout esperando: ${message}`);
}
