/**
 * Extract a human-readable error message from an unknown error object.
 */
export const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as any).message === "string"
  ) {
    return (err as any).message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
};
