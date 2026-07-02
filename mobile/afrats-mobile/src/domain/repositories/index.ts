import type { AuthTokens, User, Transaction, Category, Anomaly, RiskProfile, Notification, PaginatedResult } from '@/domain/entities';

export interface IAuthRepository {
  login(email: string, password: string): Promise<AuthTokens>;
  register(email: string, password: string, firstName: string, lastName: string): Promise<void>;
  getMe(): Promise<User>;
  logout(): Promise<void>;
}

export interface ITransactionRepository {
  getAll(params: TransactionQueryParams): Promise<PaginatedResult<Transaction>>;
  getById(id: string): Promise<Transaction>;
  create(data: CreateTransactionDto): Promise<Transaction>;
  update(id: string, data: UpdateTransactionDto): Promise<Transaction>;
  delete(id: string): Promise<void>;
  getCategories(): Promise<Category[]>;
}

export interface IAnomalyRepository {
  getAll(params: AnomalyQueryParams): Promise<PaginatedResult<Anomaly>>;
  getById(id: string): Promise<Anomaly>;
  updateStatus(id: string, status: string): Promise<Anomaly>;
}

export interface IRiskRepository {
  getMyProfile(): Promise<RiskProfile>;
  getUserProfile(userId: string): Promise<RiskProfile>;
}

export interface INotificationRepository {
  getAll(): Promise<Notification[]>;
  markAsRead(id: string): Promise<void>;
  markAllAsRead(): Promise<void>;
}

export interface TransactionQueryParams {
  page?: number;
  pageSize?: number;
  type?: 'Income' | 'Expense';
  categoryId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface AnomalyQueryParams {
  page?: number;
  pageSize?: number;
  status?: string;
}

export interface CreateTransactionDto {
  categoryId: string;
  amount: number;
  description: string;
  transactionDate: string;
  type: string;
}

export interface UpdateTransactionDto extends Partial<CreateTransactionDto> {}
