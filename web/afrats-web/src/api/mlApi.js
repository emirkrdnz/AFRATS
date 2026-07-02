import apiClient from './apiClient';

const mlApi = {
  // GET /api/ml/risk-scores/current
  getCurrentRisk: () =>
    apiClient.get('/ml/risk-scores/current'),

  // GET /api/ml/risk-scores/history?months=6
  getRiskHistory: (months = 6) =>
    apiClient.get('/ml/risk-scores/history', { params: { months } }),

  // GET /api/ml/anomalies?page&pageSize&status
  // Returns: { items: [...], totalCount, page, pageSize }
  // items: ALL algorithm rows (Ensemble + IsolationForest + ZScore + LOF)
  // Frontend groups by transactionId.
  getAnomalies: (params) =>
    apiClient.get('/ml/anomalies', { params }),

  // GET /api/ml/anomalies/:transactionId → algorithm breakdown + metrics
  getAnomalyDetail: (transactionId) =>
    apiClient.get(`/ml/anomalies/${transactionId}`),

  // PATCH /api/ml/anomalies/:transactionId/status
  // Body: { status: 'Pending' | 'Reviewed' | 'Confirmed' | 'FalsePositive' }
  updateAnomalyStatus: (transactionId, status) =>
    apiClient.patch(`/ml/anomalies/${transactionId}/status`, { status }),

  // GET /api/ml/admin/high-risk-users
  getHighRiskUsers: () =>
    apiClient.get('/ml/admin/high-risk-users'),

  // GET /api/ml/admin/stats
  getAdminStats: () =>
    apiClient.get('/ml/admin/stats'),
};

export default mlApi;
