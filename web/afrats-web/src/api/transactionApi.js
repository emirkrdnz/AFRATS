import apiClient from './apiClient';

const transactionApi = {
  // POST /api/transactions
  create: (data) =>
    apiClient.post('/transactions', data),

  // GET /api/transactions?page&pageSize&startDate&endDate&categoryId&type
  getAll: (params) =>
    apiClient.get('/transactions', { params }),

  // GET /api/transactions/:id
  getById: (id) =>
    apiClient.get(`/transactions/${id}`),

  // PUT /api/transactions/:id
  update: (id, data) =>
    apiClient.put(`/transactions/${id}`, data),

  // DELETE /api/transactions/:id
  delete: (id) =>
    apiClient.delete(`/transactions/${id}`),

  // POST /api/transactions/import (CSV)
  importCsv: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/transactions/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // GET /api/transactions/summary?month&year
  getSummary: (month, year) =>
    apiClient.get('/transactions/summary', { params: { month, year } }),

  // GET /api/transactions/categories?type
  getCategories: (type) =>
    apiClient.get('/transactions/categories', { params: type ? { type } : {} }),

  // POST /api/transactions/categories
  createCategory: (data) =>
    apiClient.post('/transactions/categories', data),

  // GET /api/transactions/admin/stats?startDate&endDate
  getAdminStats: (params) =>
    apiClient.get('/transactions/admin/stats', { params }),

  // GET /api/transactions/admin/:userId?page&pageSize&...
  getAdminUserTransactions: (userId, params) =>
    apiClient.get(`/transactions/admin/${userId}`, { params }),
};

export default transactionApi;
