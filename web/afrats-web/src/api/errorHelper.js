/**
 * apiClient.js error interceptor'ı tüm backend hatalarını şu shape'e normalize eder:
 *   { message: string, fieldErrors: { Email: "...", Password: "..." } }
 *
 * Bu helper'lar normalize edilmiş shape üzerinden çalışır. ProblemDetails
 * (AuthService) ve custom envelope (TransactionService) ayrımı apiClient'ta yapılır,
 * burada tek shape'le iş bitirilir.
 */

export function extractErrorMessage(err, fallback = 'An error occurred. Please try again.') {
  const data = err?.response?.data;
  if (!data) return err?.message || fallback;

  if (data.message) return data.message;

  // Eğer fieldErrors varsa ve message yoksa, ilk field error'u kullan
  if (data.fieldErrors && typeof data.fieldErrors === 'object') {
    const firstField = Object.keys(data.fieldErrors)[0];
    if (firstField) return data.fieldErrors[firstField];
  }

  return fallback;
}

/**
 * Field-bazlı validation hatalarını lowercase key'lerle döner.
 * Form'da react-hook-form'un setError'ı veya field-bazlı render için kullanılır.
 *
 * Backend "Email" döner, frontend "email" kullanır → lowercase normalize.
 *
 * Returns: { email: "...", password: "..." }
 */
export function extractFieldErrors(err) {
  const fieldErrors = err?.response?.data?.fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== 'object') return {};

  const result = {};
  for (const [field, message] of Object.entries(fieldErrors)) {
    const key = field.charAt(0).toLowerCase() + field.slice(1);
    result[key] = message;
  }
  return result;
}