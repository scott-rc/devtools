export function ignoreNotFound(error: Error): void {
  if (error instanceof Deno.errors.NotFound) return;
  throw error;
}
