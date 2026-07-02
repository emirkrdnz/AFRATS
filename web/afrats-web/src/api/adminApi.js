// src/api/adminApi.js
//
// apiClient baseURL = '/api' (Vite proxy → http://localhost:5000/api)
// Bu yüzden buradaki path'ler /api'siz yazılır:
//   apiClient.get('/auth/admin/users') → /api/auth/admin/users → Gateway ✅
//
// Health endpoint'leri /api prefix'i OLMADAN çalışır (/health/auth vb.)
// Bu yüzden health için axios'u baseURL olmadan kullanıyoruz.
//
// Sprint F: Her fonksiyon artık opsiyonel `config` (axios config) alır
// — `{ signal }` AbortController desteği için. Eski çağrı sözleşmeleri
// kırılmaz çünkü tüm parametreler default'lu.

import axios from 'axios';
import apiClient from './apiClient';

// Gateway base — Vite proxy üzerinden veya direkt
const GATEWAY_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')  // /api suffix'ini kaldır
  : '';  // boş → Vite proxy, path tam yazılır

// Health için baseURL'siz axios instance
const healthClient = axios.create({
  baseURL: GATEWAY_BASE,
  timeout: 5000,
  headers: { 'Content-Type': 'application/json' },
});

// JWT token ekle
healthClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Merge query params + axios config without mutating caller objects.
// Caller'lar `{ ...params, __signal }` gibi marker'ları geçirmesin diye
// burada `signal` ve `params` ayrılır.
function pickConfig(config = {}) {
  const { signal, ...rest } = config;
  return signal ? { ...rest, signal } : rest;
}

const adminApi = {
  // ── AuthService — apiClient baseURL /api + bu path = /api/auth/admin/* ──

  getUsers(params = {}, config = {}) {
    return apiClient.get('/auth/admin/users', { params, ...pickConfig(config) });
  },

  getUserById(id, config = {}) {
    return apiClient.get(`/auth/admin/users/${id}`, pickConfig(config));
  },

  updateUserStatus(id, isActive, config = {}) {
    return apiClient.put(`/auth/admin/users/${id}/status`, { isActive }, pickConfig(config));
  },

  // Sprint AB3: soft-delete kullanıcı (IsDeleted=true + IsActive=false).
  // Backend global query filter silinmiş kullanıcıları otomatik gizler.
  deleteUser(id, config = {}) {
    return apiClient.delete(`/auth/admin/users/${id}`, pickConfig(config));
  },

  // ── TransactionService — /api/transactions/admin/* ───────────────────────

  getTransactionStats(params = {}, config = {}) {
    // Sprint D1: params artık startDate/endDate içerebilir.
    // Internal `__signal` marker'ı caller tarafından geçirilirse signal'e çevir.
    const { __signal, ...rest } = params;
    const cfg = pickConfig(__signal ? { signal: __signal, ...config } : config);
    return apiClient.get('/transactions/admin/stats', { params: rest, ...cfg });
  },

  // Sprint M1: günlük gruplanmış istatistik dizisi (30 gün default).
  // Dashboard'daki anomaly trend + income/expense bar chart'ları besler.
  getTransactionTimeseries(days = 30, config = {}) {
    return apiClient.get('/transactions/admin/timeseries', {
      params: { days },
      ...pickConfig(config),
    });
  },

  // Sprint Y: kategori bazlı toplam — Analytics "Spending by Category" donut.
  // type: "Income" / "Expense" / undefined (her ikisi).
  getCategorySpending(days = 30, type = 'Expense', config = {}) {
    return apiClient.get('/transactions/admin/by-category', {
      params: { days, ...(type ? { type } : {}) },
      ...pickConfig(config),
    });
  },

  getUserTransactions(userId, params = {}, config = {}) {
    return apiClient.get(`/transactions/admin/${userId}`, { params, ...pickConfig(config) });
  },

  // Sprint AB5: per-user lifetime özet — drawer'da count + ilk/son aktivite gösterimi.
  getUserSummary(userId, config = {}) {
    return apiClient.get(`/transactions/admin/${userId}/summary`, pickConfig(config));
  },

  // ── MLService — /api/ml/admin/* ──────────────────────────────────────────

  getRiskDistribution(config = {}) {
    return apiClient.get('/ml/admin/stats', pickConfig(config));
  },

  getModelPerformance(config = {}) {
    return apiClient.get('/ml/admin/model-performance', pickConfig(config));
  },

  getHighRiskUsers(page = 1, config = {}) {
    return apiClient.get('/ml/admin/high-risk-users', {
      params: { page },
      ...pickConfig(config),
    });
  },

  getUserRisk(userId, limit = 20, config = {}) {
    // Sprint AB6: zaman bazlı 'months' yerine count-based 'limit' — sparkline'da
    // sabit X-ekseni için tutarlı görünüm (son N risk score eventi).
    return apiClient.get(`/ml/admin/users/${userId}/risk`, {
      params: { limit },
      ...pickConfig(config),
    });
  },

  // Sprint AB5: per-user anomaly özet sayıları — drawer için.
  getUserAnomalyCount(userId, config = {}) {
    return apiClient.get(`/ml/admin/users/${userId}/anomaly-count`, pickConfig(config));
  },

  // ── Broker (RabbitMQ Management proxy) — Topology sayfası için ──────────

  getBrokerOverview(config = {}) {
    return apiClient.get('/ml/admin/broker/overview', pickConfig(config));
  },

  getBrokerQueues(config = {}) {
    return apiClient.get('/ml/admin/broker/queues', pickConfig(config));
  },

  // ── Service health — /health/* (no /api prefix) ──────────────────────────
  // YARP routes: /health/auth → afrats-auth /health  (PathSet transform)
  //              /health/txn  → afrats-txn  /health
  //              /health/ml   → afrats-ml   /health
  //              /health/notif → afrats-notif /health

  getHealthAuth(config = {}) {
    return healthClient.get('/health/auth', pickConfig(config));
  },

  getHealthTxn(config = {}) {
    return healthClient.get('/health/txn', pickConfig(config));
  },

  getHealthMl(config = {}) {
    return healthClient.get('/health/ml', pickConfig(config));
  },

  getHealthNotif(config = {}) {
    return healthClient.get('/health/notif', pickConfig(config));
  },
};

export default adminApi;
