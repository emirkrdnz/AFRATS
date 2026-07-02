import apiClient from './client';
import type { TransactionSummary } from '@/domain/entities';

export const summaryApi = {
  getSummary: (month?: number, year?: number): Promise<TransactionSummary> =>
    apiClient.get('/api/transactions/summary', { params: { month, year } }),
};
