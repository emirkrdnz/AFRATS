import apiClient from './apiClient';

const authApi = {
  // ── Auth flow ──
  register: (data) =>
    apiClient.post('/auth/register', data),

  login: (email, password) =>
    apiClient.post('/auth/login', { email, password }),

  refreshToken: (refreshToken) =>
    apiClient.post('/auth/refresh-token', { refreshToken }),

  logout: (refreshToken) =>
    apiClient.post('/auth/logout', { refreshToken }),

  // ── Email & password ──
  confirmEmail: (token) =>
    apiClient.get('/auth/confirm-email', { params: { token } }),

  forgotPassword: (email) =>
    apiClient.post('/auth/forgot-password', { email }),

  resetPassword: (token, newPassword, confirmNewPassword) =>
    apiClient.post('/auth/reset-password', { token, newPassword, confirmNewPassword }),

  // ── Profile (authenticated) ──
  getProfile: () =>
    apiClient.get('/auth/profile'),

  updateProfile: (data) =>
    apiClient.put('/auth/profile', data),

  changePassword: (currentPassword, newPassword, confirmNewPassword) =>
    apiClient.post('/auth/change-password', { currentPassword, newPassword, confirmNewPassword }),

  deleteAccount: () =>
    apiClient.delete('/auth/profile'),

  // ── Admin ──
  getUsers: (params) =>
    apiClient.get('/auth/admin/users', { params }),

  getUserById: (userId) =>
    apiClient.get(`/auth/admin/users/${userId}`),

  toggleUserStatus: (userId, isActive) =>
    apiClient.put(`/auth/admin/users/${userId}/status`, { isActive }),
};

export default authApi;