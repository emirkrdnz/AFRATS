import apiClient from './client';
import type { AnomalyListResponse, AnomalyDetail } from '@/domain/entities';

export const anomalyApi = {
  getAll: (params?: { status?: string; page?: number; pageSize?: number }): Promise<AnomalyListResponse> =>
    apiClient.get('/api/ml/anomalies', { params }),

  getById: (transactionId: string): Promise<AnomalyDetail> =>
    apiClient.get(`/api/ml/anomalies/${transactionId}`),

  updateStatus: (transactionId: string, status: string): Promise<void> =>
    apiClient.patch(`/api/ml/anomalies/${transactionId}/status`, { status }),
};
