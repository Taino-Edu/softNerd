// =============================================================================
// lib/auth.ts — Utilitários de autenticação
//
// Os tokens JWT (accessToken, refreshToken) são gerenciados exclusivamente
// pelo backend como cookies HttpOnly — não acessíveis via JavaScript.
// Apenas metadados não sensíveis (role, nome, userId) são salvos em cookies
// comuns para uso na UI (sem impacto na segurança se expostos via JS).
// =============================================================================
import Cookies from 'js-cookie'
import { AuthResponse } from './api'
import { clearReservationCart } from '@/hooks/useReservationCart'

export function saveAuth(auth: AuthResponse) {
  Cookies.set('userRole',  auth.role,     { expires: 30 })
  Cookies.set('userName',  auth.userName, { expires: 30 })
  Cookies.set('userId',    auth.userId,   { expires: 30 })
  if (auth.permissions)
    Cookies.set('userPermissions', JSON.stringify(auth.permissions), { expires: 30 })
  else
    Cookies.remove('userPermissions')
}

export function clearAuth() {
  ;['userRole', 'userName', 'userId', 'userPermissions'].forEach(k => Cookies.remove(k))
  // O carrinho de reserva mora em localStorage, não em cookie: sem limpar aqui ele
  // sobrevive ao logout e reaparece pra próxima conta que logar neste navegador.
  clearReservationCart()
}

export function getRole():        string    { return Cookies.get('userRole') || '' }
export function getUserName():    string    { return Cookies.get('userName') || '' }
export function getUserId():      string    { return Cookies.get('userId')   || '' }
export function isAdmin():        boolean   { return getRole() === 'Admin' }
export function isOperator():     boolean   { return getRole() === 'Operator' }
export function isLoggedIn():     boolean   { return !!Cookies.get('userRole') }

export function getPermissions(): string[] {
  try {
    const raw = Cookies.get('userPermissions')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function hasPermission(perm: string): boolean {
  if (isAdmin()) return true
  return getPermissions().includes(perm)
}
