// lib/api/auth.ts — Login, cadastro, sessão
// Importe sempre de "@/lib/api" (lib/api/index.ts junta todos).
import { api } from './client'

export interface AuthResponse {
  accessToken?: string; refreshToken?: string; expiresAt: string
  role: string; userName: string; userId: string
  comandaId?: string
  permissions?: string[]
}

export interface CpfLookupResponse { name: string; hasPassword: boolean }

export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/api/auth/login', { email, password }),
  clientLogin: (email: string, password: string) =>
    api.post<AuthResponse>('/api/auth/client-login', { email, password }),
  register: (name: string, email: string, password: string, whatsApp?: string, cpf?: string) =>
    api.post<AuthResponse>('/api/auth/register', { name, email, password, whatsApp, cpf }),
  cpfLookup: (cpf: string) =>
    api.post<CpfLookupResponse>('/api/auth/cpf-lookup', { cpf }),
  setupAccount: (cpf: string, email: string, password: string) =>
    api.post<AuthResponse>('/api/auth/setup-account', { cpf, email, password }),
  completeProfile: (email: string, password: string) =>
    api.post('/api/auth/complete-profile', { email, password }),
  quickLogin: (name: string, cpf: string | null, whatsApp: string, tableIdentifier?: string) =>
    api.post<AuthResponse>('/api/auth/quick-login', { name, cpf: cpf || null, whatsApp, tableIdentifier }),
  /** Entrar com Google: clientId null = desligado (o botão não aparece). */
  googleConfig: () => api.get<{ clientId: string | null }>('/api/auth/google/config'),
  /** credential = ID token do botão do Google. Com mesa, já abre a comanda. */
  google: (credential: string, tableIdentifier?: string) =>
    api.post<AuthResponse>('/api/auth/google', { credential, tableIdentifier: tableIdentifier ?? null }),
  /** Quem entrou com Google informa o WhatsApp (e o CPF, opcional). */
  completarCadastroGoogle: (whatsApp: string, cpf?: string | null) =>
    api.post('/api/auth/completar-cadastro', { whatsApp, cpf: cpf || null }),
  logout:         () => api.post('/api/auth/logout'),
  forgotPassword: (email: string) =>
    api.post('/api/auth/forgot-password', { email }),
  resetPassword:  (token: string, newPassword: string) =>
    api.post('/api/auth/reset-password', { token, newPassword }),
  uploadProfileImage: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<{ url: string }>('/api/upload/profile-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }
}
