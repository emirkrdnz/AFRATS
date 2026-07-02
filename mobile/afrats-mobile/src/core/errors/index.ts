export interface AppError { message: string; errors: string[]; status?: number; }
export const isAppError = (e: unknown): e is AppError =>
  typeof e === 'object' && e !== null && 'message' in e;
export const extractErrorMessage = (e: unknown): string => {
  if (isAppError(e)) {
    if (Array.isArray(e.errors) && e.errors.length > 0) return e.errors.join('\n');
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return 'An unexpected error occurred';
};
