import apiClient from './client';
import type { PaginatedResult } from '@/domain/entities';

interface NotificationItem {
  id: string; type: string; title: string; message: string;
  isRead: boolean; channel: string; relatedId: string; createdAt: string; readAt?: string;
}

export const notificationApi = {
  getAll: (params?: { page?: number; pageSize?: number }): Promise<PaginatedResult<NotificationItem>> =>
    apiClient.get('/api/notifications', { params }),
  getUnreadCount: (): Promise<{ unreadCount: number }> =>
    apiClient.get('/api/notifications/unread-count'),
  markAsRead: (id: string): Promise<void> =>
    apiClient.patch(`/api/notifications/${id}/read`),
  markAllAsRead: (): Promise<void> =>
    apiClient.patch('/api/notifications/read-all'),
  getPreferences: (): Promise<{ emailEnabled: boolean; inAppEnabled: boolean }> =>
    apiClient.get('/api/notifications/preferences'),
  updatePreferences: (data: { emailEnabled: boolean; inAppEnabled: boolean }): Promise<void> =>
    apiClient.put('/api/notifications/preferences', data),
};
