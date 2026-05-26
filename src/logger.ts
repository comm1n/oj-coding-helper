export function log(scope: string, message: string): void {
  console.error(`[${scope}] ${message}`);
}

export function logError(scope: string, error: unknown): void {
  if (error instanceof Error) {
    console.error(`[${scope}] ${error.message}`);
    return;
  }
  console.error(`[${scope}] ${String(error)}`);
}
