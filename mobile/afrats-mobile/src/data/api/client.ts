import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_URL, TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/core/constants';

const apiClient = axios.create({ baseURL: API_URL, timeout: 15000, headers: { 'Content-Type': 'application/json' } });

let isRefreshing = false;
let failedQueue: Array<{ resolve:(token:string)=>void; reject:(error:unknown)=>void }> = [];

const processQueue = (error:unknown, token:string|null=null) => {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve(token!));
  failedQueue = [];
};

apiClient.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    if (response.data?.success === true && response.data?.data !== undefined) return response.data.data;
    return response.data;
  },
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => { failedQueue.push({ resolve, reject }); })
          .then((token) => { original.headers.Authorization = `Bearer ${token}`; return apiClient(original); });
      }
      original._retry = true;
      isRefreshing = true;
      try {
        const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        if (!refreshToken) throw new Error('No refresh token');
        const res = await axios.post(`${API_URL}/api/auth/refresh-token`, { refreshToken });
        const tokens = res.data?.data ?? res.data;
        const newToken = tokens.accessToken;
        await SecureStore.setItemAsync(TOKEN_KEY, newToken);
        if (tokens.refreshToken) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
        processQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
        return Promise.reject(refreshError);
      } finally { isRefreshing = false; }
    }
    const d = error.response?.data;
    return Promise.reject({
      message: d?.message ?? d?.title ?? 'Something went wrong',
      errors: Array.isArray(d?.errors) ? d.errors : d?.errors ? Object.values(d.errors).flat() : [],
      status: error.response?.status,
    });
  }
);

export default apiClient;
