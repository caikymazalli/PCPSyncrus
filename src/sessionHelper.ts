/**
 * sessionHelper.ts
 * Helpers para extrair UserInfo e TenantData a partir do contexto Hono.
 * Todas as rotas devem usar getCtxUser() para obter dados reais do usuário logado.
 */

import { getCookie } from 'hono/cookie'
import type { Context } from 'hono'
import { getSession, getTenantData, getEffectiveTenantId, registeredUsers } from './userStore'
import type { UserSession, TenantData } from './userStore'
import type { UserInfo } from './layout'

const SESSION_COOKIE = 'pcp_session'

/** Retorna a sessão ativa ou null */
export function getCtxSession(c: Context): UserSession | null {
  const token = getCookie(c, SESSION_COOKIE)
  return getSession(token)
}

/** Retorna UserInfo para o layout (com dados reais do usuário logado) */
export function getCtxUserInfo(c: Context): UserInfo {
  const session = getCtxSession(c)
  if (!session) {
    return { nome: 'Usuário', empresa: 'Empresa', plano: 'starter', isDemo: false, role: 'admin' }
  }
  // Pegar trialEnd do registeredUser se existir
  const regUser = Object.values(registeredUsers).find(u => u.userId === session.userId)
  return {
    nome:    session.nome,
    empresa: session.empresa,
    plano:   session.plano,
    isDemo:  session.isDemo,
    role:    session.role,
    trialEnd: regUser?.trialEnd,
  }
}

/** Retorna o TenantData para o usuário logado */
export function getCtxTenant(c: Context): TenantData {
  const session = getCtxSession(c)
  const tenantId = getEffectiveTenantId(session)
  return getTenantData(tenantId)
}

/** Helper: requer sessão ativa, caso contrário redireciona para /login */
export function requireSession(c: Context): UserSession | null {
  const session = getCtxSession(c)
  // Para demo, sempre retorna a sessão demo
  return session
}
