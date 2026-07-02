import apiClient from './client';
import type { AuthTokens, User } from '@/domain/entities';

export const authApi = {
  login: (email:string, password:string): Promise<AuthTokens> =>
    apiClient.post('/api/auth/login', { email, password }),
  register: (data:{email:string;password:string;confirmPassword:string;firstName:string;lastName:string;phoneNumber?:string}): Promise<void> =>
    apiClient.post('/api/auth/register', data),
  getMe: (): Promise<User> =>
    apiClient.get('/api/auth/profile'),
  logout: (): Promise<void> =>
    apiClient.post('/api/auth/logout'),
  refreshToken: (refreshToken:string): Promise<AuthTokens> =>
    apiClient.post('/api/auth/refresh-token', { refreshToken }),
  updateProfile: (data:{firstName:string;lastName:string;phoneNumber?:string}): Promise<User> =>
    apiClient.put('/api/auth/profile', data),
  changePassword: (data:{currentPassword:string;newPassword:string}): Promise<void> =>
    apiClient.post('/api/auth/change-password', data),
  forgotPassword: (email:string): Promise<void> =>
    apiClient.post('/api/auth/forgot-password', { email }),
  deleteAccount: (): Promise<void> =>
    apiClient.delete('/api/auth/profile'),
};
