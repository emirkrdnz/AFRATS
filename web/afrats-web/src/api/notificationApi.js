import apiClient from './apiClient';

const notificationApi = {
  // GET /api/notifications?page&pageSize&isRead
  getAll: (params) =>
    apiClient.get('/notifications', { params }),

  // GET /api/notifications/unread-count
  getUnreadCount: () =>
    apiClient.get('/notifications/unread-count'),

  // PUT /api/notifications/:id/read
  markAsRead: (id) =>
    apiClient.put(`/notifications/${id}/read`),

  // PUT /api/notifications/read-all
  markAllAsRead: () =>
    apiClient.put('/notifications/read-all'),

  // GET /api/notifications/preferences
  getPreferences: () =>
    apiClient.get('/notifications/preferences'),

  // PUT /api/notifications/preferences
  updatePreferences: (data) =>
    apiClient.put('/notifications/preferences', data),
};

export default notificationApi;
