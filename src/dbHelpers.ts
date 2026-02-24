/**
 * dbHelpers.ts — Helpers para operações D1 por módulo
 * 
 * Cada helper lê/escreve no D1 usando o user_id para isolamento por tenant.
 * Fallback para dados em memória quando D1 não está disponível.
 */

import type { Context } from 'hono'
import { getCtxSession, getCtxTenant, getCtxDB, getCtxUserId } from './sessionHelper'

// ── Generic D1 CRUD ──────────────────────────────────────────────────────────

export function genId(prefix = 'rec'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

/** Fetch all records for a tenant from a D1 table */
export async function dbGetAll(db: D1Database, table: string, userId: string, extraWhere = ''): Promise<any[]> {
  try {
    const where = `user_id = ?${extraWhere ? ' AND ' + extraWhere : ''}`
    const rows = await db.prepare(`SELECT * FROM ${table} WHERE ${where} ORDER BY created_at DESC`)
      .bind(userId).all()
    return rows.results || []
  } catch {
    return []
  }
}

/** Insert a record into D1 */
export async function dbInsert(db: D1Database, table: string, data: Record<string, any>): Promise<boolean> {
  try {
    const keys = Object.keys(data)
    const vals = Object.values(data)
    const placeholders = keys.map(() => '?').join(', ')
    await db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`)
      .bind(...vals).run()
    return true
  } catch (e) {
    console.error('dbInsert error:', e)
    return false
  }
}

/** Update a record in D1 */
export async function dbUpdate(db: D1Database, table: string, id: string, userId: string, data: Record<string, any>): Promise<boolean> {
  try {
    const keys = Object.keys(data)
    const vals = Object.values(data)
    const setClause = keys.map(k => `${k} = ?`).join(', ')
    await db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ? AND user_id = ?`)
      .bind(...vals, id, userId).run()
    return true
  } catch {
    return false
  }
}

/** Delete a record from D1 */
export async function dbDelete(db: D1Database, table: string, id: string, userId: string): Promise<boolean> {
  try {
    await db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, userId).run()
    return true
  } catch {
    return false
  }
}

/** Helper to respond with JSON success */
export function ok(c: any, data: any = {}) {
  return c.json({ ok: true, ...data })
}

/** Helper to respond with JSON error */
export function err(c: any, msg: string, status = 400) {
  return c.json({ ok: false, error: msg }, status)
}
