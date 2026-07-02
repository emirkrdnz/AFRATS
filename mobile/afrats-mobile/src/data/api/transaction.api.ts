import type { TransactionQueryParams, CreateTransactionDto, UpdateTransactionDto } from '@/domain/repositories';
import type { Transaction, Category, PaginatedResult } from '@/domain/entities';
import apiClient from './client';

export const transactionApi = {
  getAll: (params: TransactionQueryParams): Promise<PaginatedResult<Transaction>> =>
    apiClient.get('/api/transactions', { params }),

  getById: (id: string): Promise<Transaction> =>
    apiClient.get(`/api/transactions/${id}`),

  create: (data: CreateTransactionDto): Promise<Transaction> =>
    apiClient.post('/api/transactions', data),

  update: (id: string, data: UpdateTransactionDto): Promise<Transaction> =>
    apiClient.put(`/api/transactions/${id}`, data),

  delete: (id: string): Promise<void> =>
    apiClient.delete(`/api/transactions/${id}`),

  getCategories: (): Promise<Category[]> =>
    apiClient.get('/api/transactions/categories'),
};
