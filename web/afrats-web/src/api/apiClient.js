import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// --- Request interceptor — JWT token ekle ---
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// --- Response interceptor #1: Success envelope unwrap + Error normalize ---
//
// Backend'lerimiz iki farklı error shape dönüyor:
//   AuthService (ProblemDetails):
//     { type, title, status, errors: { Email: ["..."] }, traceId }
//   TransactionService (custom envelope):
//     { success: false, message, errors: [{ field, message }], traceId }
//
// Frontend her yerde tek shape kullanabilsin diye normalize ediyoruz:
//     { message: string, fieldErrors: { Email: "...", Password: "..." } }
apiClient.interceptors.response.use(
  (response) => {
    // Success path: { success: true, data: ... } → unwrap
    const body = response.data;
    if (body && typeof body === 'object' && body.success === true && 'data' in body) {
      response.data = body.data;
    }
    return response;
  },
  (error) => {
    // Error path: backend response yoksa (network / timeout) → olduğu gibi reject
    if (!error.response?.data) {
      return Promise.reject(error);
    }

    const raw = error.response.data;
    const normalized = normalizeError(raw);

    // Orijinal response'u koruyoruz, sadece data field'ını normalize ile değiştiriyoruz.
    // Bu sayede tüm sayfalar `err.response.data.message` / `err.response.data.fieldErrors` kullanabilir.
    error.response.data = normalized;
    return Promise.reject(error);
  }
);

/**
 * Iki backend error shape'ini tek bir normalized shape'e çevirir.
 *
 * @returns {{ message: string, fieldErrors: Record<string, string> }}
 */
function normalizeError(raw) {
  // ProblemDetails (AuthService)
  if (raw.title !== undefined && raw.errors && !Array.isArray(raw.errors)) {
    // raw.errors = { Email: ["..."], Password: ["..."] }
    const fieldErrors = {};
    for (const [field, messages] of Object.entries(raw.errors)) {
      fieldErrors[field] = Array.isArray(messages) ? messages[0] : String(messages);
    }
    return {
      message: raw.title || 'Request failed.',
      fieldErrors,
    };
  }

  // Custom envelope (TransactionService)
  if (raw.success === false) {
    const fieldErrors = {};
    if (Array.isArray(raw.errors)) {
      for (const err of raw.errors) {
        if (err?.field && err?.message) fieldErrors[err.field] = err.message;
      }
    }
    return {
      message: raw.message || 'Request failed.',
      fieldErrors,
    };
  }

  // Bilinmeyen shape — yine de işe yarar bir şey döndür
  return {
    message: raw.message || raw.title || 'Request failed.',
    fieldErrors: {},
  };
}

// --- Response interceptor #2: 401 + refresh ---
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Login ve refresh-token endpoint'leri 401 alabilir, bu beklenen davranış —
    // refresh denemeyiz. Aksi halde "yanlış şifre" girişi sonsuz refresh loop'una düşer.
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/login')
                    || originalRequest?.url?.includes('/auth/register')
                    || originalRequest?.url?.includes('/auth/refresh-token');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await apiClient.post('/auth/refresh-token', { refreshToken });

        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);

        apiClient.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
        processQueue(null, data.accessToken);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;