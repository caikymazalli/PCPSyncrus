/**
 * sessionHelper.ts
 * Helpers para extrair UserInfo e TenantData a partir do contexto Hono.
 * Suporte a D1 para persistência de sessões entre reinicializações do worker.
 */

import { getCookie } from 'hono/cookie'
import type { Context } from 'hono'
import { getSession, getSessionAsync, getTenantData, getEffectiveTenantId, registeredUsers, getDB } from './userStore'
import type { UserSession, TenantData } from './userStore'
import type { UserInfo } from './layout'

const SESSION_COOKIE = 'pcp_session'

/** Retorna a sessão ativa ou null (sícrono — usa cache em memória) */
export function getCtxSession(c: Context): UserSession | null {
  const token = getCookie(c, SESSION_COOKIE)
  return getSession(token)
}

/** Retorna a sessão ativa com fallback para D1 (assíncono) */
export async function getCtxSessionAsync(c: Context): Promise<UserSession | null> {
  const token = getCookie(c, SESSION_COOKIE)
  const db = getDB(c)
  
  // Try in-memory first
  const cached = getSession(token)
  if (cached) return cached
  
  // Try D1
  if (db && token) {
    try {
      const { getSessionAsync } = await import('./userStore')
      return await getSessionAsync(token, db)
    } catch {}
  }
  
  return null
}

/** Retorna UserInfo para o layout (com dados reais do usuário logado) */
export function getCtxUserInfo(c: Context): UserInfo {
  const session = getCtxSession(c)
  if (!session) {
    return { nome: 'Usuário', empresa: 'Empresa', plano: 'starter', isDemo: false, role: 'admin' }
  }
  const regUser = Object.values(registeredUsers).find(u => u.userId === session.userId)
  return {
    nome:    session.nome,
    empresa: session.empresa,
    plano:   session.plano,
    isDemo:  session.isDemo,
    role:    session.role,
    trialEnd: regUser?.trialEnd,
    ownerId:  session.ownerId ?? regUser?.ownerId ?? null,
  }
}

/** Retorna o TenantData para o usuário logado (dados em memória) */
export function getCtxTenant(c: Context): TenantData {
  const session = getCtxSession(c)
  const tenantId = getEffectiveTenantId(session)
  return getTenantData(tenantId)
}

/** Retorna o DB binding do Cloudflare D1 */
export function getCtxDB(c: Context): D1Database | null {
  return getDB(c)
}

/** Helper: requer sessão ativa */
export function requireSession(c: Context): UserSession | null {
  return getCtxSession(c)
}

/** Retorna o userId do usuário logado */
export function getCtxUserId(c: Context): string {
  const session = getCtxSession(c)
  if (!session || session.isDemo) return 'demo-tenant'
  return session.userId
}

/** Retorna o empresaId da sessão ativa */
export function getCtxEmpresaId(c: Context): string {
  const session = getCtxSession(c)
  return session?.empresaId || ''
}

/** Retorna o grupoId da sessão ativa */
export function getCtxGrupoId(c: Context): string {
  const session = getCtxSession(c)
  return session?.grupoId || ''
}

/** Retorna o nome da empresa da sessão ativa */
export function getCtxEmpresa(c: Context): any {
  const session = getCtxSession(c)
  return session?.empresa || null
}

/** Retorna o grupoId da sessão ativa */
export function getCtxGrupo(c: Context): any {
  const session = getCtxSession(c)
  return session?.grupoId || null
}
