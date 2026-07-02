import apiClient from './client';
import type { RiskProfile, RiskHistoryItem } from '@/domain/entities';

export const riskApi = {
  getMyProfile: (): Promise<RiskProfile> =>
    apiClient.get('/api/ml/risk-scores/current'),

  getHistory: (months = 6): Promise<RiskHistoryItem[]> =>
    apiClient.get('/api/ml/risk-scores/history', { params: { months } }),

  getUserProfile: (userId: string): Promise<RiskProfile> =>
    apiClient.get(`/api/ml/admin/users/${userId}/risk`),
};
