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

/** Ensure empresa_id has a value, defaulting to '1' if not provided */
function ensureEmpresaId(data: Record<string, any>): void {
  if (!data.empresa_id) {
    data.empresa_id = '1'
  }
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
    // Ensure empresa_id has a value before inserting
    ensureEmpresaId(data)

    const keys = Object.keys(data)
    const vals = Object.values(data)
    const placeholders = keys.map(() => '?').join(', ')

    console.log(`[D1][INSERT] ${table}:`, { keys, values: vals, data })

    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`

    console.log(`[D1][SQL] ${sql}`)

    const result = await db.prepare(sql).bind(...vals).run()

    console.log(`[D1][SUCCESS] ${table} id=${data.id || '?'}:`, { success: true, result })

    return true
  } catch (e) {
    console.error(`[D1][INSERT][ERROR] ${table}:`, {
      error: e,
      message: (e as any)?.message,
      cause: (e as any)?.cause,
      stack: (e as any)?.stack,
      data
    })
    return false
  }
}

/** Insert a record into D1 with automatic retry */
export async function dbInsertWithRetry(
  db: D1Database,
  table: string,
  data: Record<string, any>,
  maxRetries = 3
): Promise<{ success: boolean; attempts: number; error?: string }> {
  // Ensure empresa_id has a value before inserting
  ensureEmpresaId(data)

  const keys = Object.keys(data)
  const vals = Object.values(data)
  const placeholders = keys.map(() => '?').join(', ')
  let lastError: Error | undefined
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[D1][INSERT][RETRY] Attempt ${attempt}/${maxRetries} for ${table} id=${data.id || '?'}`)
      await db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`)
        .bind(...vals).run()
      console.log(`[D1][INSERT][SUCCESS] ${table} id=${data.id || '?'} on attempt ${attempt}`)
      return { success: true, attempts: attempt }
    } catch (e) {
      lastError = e as Error
      console.error(`[D1][INSERT][FAIL] ${table} id=${data.id || '?'} attempt ${attempt}:`, e)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }
  return { success: false, attempts: maxRetries, error: lastError?.message }
}

/** Update a record in D1 */
export async function dbUpdate(db: D1Database, table: string, id: string, userId: string, data: Record<string, any>): Promise<boolean> {
  try {
    const keys = Object.keys(data)
    const vals = Object.values(data)

    console.log(`[D1][UPDATE] ${table} id=${id}:`, { keys, data })

    const setClause = keys.map(k => `${k} = ?`).join(', ')
    const sql = `UPDATE ${table} SET ${setClause} WHERE id = ? AND user_id = ?`

    console.log(`[D1][SQL] ${sql}`)

    const result = await db.prepare(sql).bind(...vals, id, userId).run()

    console.log(`[D1][SUCCESS] ${table} id=${id}`, { result })

    return true
  } catch (e) {
    console.error(`[D1][UPDATE][ERROR] ${table} id=${id}:`, {
      error: e,
      message: (e as any)?.message,
      data
    })
    return false
  }
}

/** Delete a record from D1 */
export async function dbDelete(db: D1Database, table: string, id: string, userId: string): Promise<boolean> {
  try {
    console.log(`[D1][DELETE] ${table} id=${id}`)

    const sql = `DELETE FROM ${table} WHERE id = ? AND user_id = ?`

    console.log(`[D1][SQL] ${sql}`)

    const result = await db.prepare(sql).bind(id, userId).run()

    console.log(`[D1][SUCCESS] ${table} id=${id}`, { result })

    return true
  } catch (e) {
    console.error(`[D1][DELETE][ERROR] ${table} id=${id}:`, {
      error: e,
      message: (e as any)?.message
    })
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
