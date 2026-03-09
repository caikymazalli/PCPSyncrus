/**
 * moduleAccess.ts — Helpers de controle de acesso por módulo.
 *
 * Regras:
 *   - 'allowed'   → acesso total (padrão quando sem registro)
 *   - 'read_only' → somente leitura (writes bloqueados)
 *   - 'denied'    → negado (writes bloqueados)
 */

import { getCtxSession } from './sessionHelper'
import type { ModuleKey, AccessLevel } from './modules'

/**
 * Consulta o nível de acesso de um módulo para uma empresa.
 * Retorna 'allowed' se não houver registro no banco.
 */
export async function getEmpresaModuleAccess(
  db: D1Database | null,
  empresaId: string,
  moduleKey: ModuleKey
): Promise<AccessLevel> {
  if (!db) return 'allowed'
  try {
    const row = await db
      .prepare('SELECT access_level FROM empresa_modules WHERE empresa_id = ? AND module_key = ?')
      .bind(empresaId, moduleKey)
      .first<{ access_level: string }>()
    if (!row) return 'allowed'
    const level = row.access_level
    if (level === 'read_only' || level === 'denied') return level as AccessLevel
    return 'allowed'
  } catch {
    return 'allowed'
  }
}

/**
 * Middleware helper: verifica se a empresa pode escrever no módulo.
 * Retorna uma Response 403 se bloqueado, null se permitido.
 *
 * Usuários demo e não autenticados são ignorados (deixam o fluxo normal
 * tratar 401 / mock data).
 */
export async function requireModuleWriteAccess(
  c: any,
  moduleKey: ModuleKey
): Promise<Response | null> {
  const session = getCtxSession(c)
  if (!session || session.isDemo) return null

  // Para membros convidados (ownerId preenchido), usa o userId do dono da empresa
  const empresaId = session.ownerId || session.userId
  const db: D1Database | null = c.env?.DB || null

  const access = await getEmpresaModuleAccess(db, empresaId, moduleKey)
  if (access !== 'allowed') {
    return c.json({ ok: false, error: 'Módulo negado (somente leitura).' }, 403)
  }
  return null
}
