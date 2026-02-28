/**
 * debug.ts — Debug endpoints for diagnosing D1 persistence issues
 *
 * Routes:
 *   GET /debug/insert  — Attempt a direct INSERT into plants and verify persistence
 *   GET /debug/count   — Count rows in main tables (plants, machines, workbenches)
 *   GET /debug/plants  — List first 10 plants
 */

import { Hono } from 'hono'
import { getCtxDB, getCtxUserId } from '../sessionHelper'

const app = new Hono<{ Bindings: { DB: D1Database } }>()

app.get('/insert', async (c) => {
  try {
    const db = getCtxDB(c)
    const userId = getCtxUserId(c)

    console.log('[DEBUG] === INICIANDO TEST ===')
    console.log('[DEBUG] userId:', userId)
    console.log('[DEBUG] db exists:', !!db)

    if (!db) {
      return c.json({
        success: false,
        error: 'DB not available',
        db: db
      })
    }

    // Test 1: INSERT simples
    const testId = `test-${Date.now()}`
    const testData = {
      id: testId,
      empresa_id: '1',
      user_id: userId,
      name: 'TEST PLANT',
      location: 'test',
      total_capacity: 100,
      contact: 'test@test.com',
      status: 'active',
      notes: 'debug test'
    }

    console.log('[DEBUG] Dados a inserir:', testData)

    const keys = Object.keys(testData)
    const vals = Object.values(testData)
    const placeholders = keys.map(() => '?').join(', ')
    const sql = `INSERT INTO plants (${keys.join(', ')}) VALUES (${placeholders})`

    console.log('[DEBUG] SQL:', sql)
    console.log('[DEBUG] VALUES:', vals)

    const insertResult = await db.prepare(sql).bind(...vals).run()

    console.log('[DEBUG] INSERT Result:', insertResult)

    // Test 2: Verificar se foi salvo
    console.log('[DEBUG] Verificando se foi salvo...')
    const verifyResult = await db.prepare('SELECT * FROM plants WHERE id = ?').bind(testId).all()

    console.log('[DEBUG] Verify Result:', verifyResult)

    return c.json({
      success: true,
      testId,
      insertResult,
      verifyResult,
      found: verifyResult.results && verifyResult.results.length > 0
    })
  } catch (e) {
    console.error('[DEBUG] ERROR:', e)
    return c.json({
      success: false,
      error: String(e),
      message: (e as any)?.message,
      cause: (e as any)?.cause,
      stack: (e as any)?.stack
    }, 500)
  }
})

app.get('/count', async (c) => {
  try {
    const db = getCtxDB(c)

    console.log('[DEBUG COUNT] Iniciando...')

    if (!db) {
      return c.json({ success: false, error: 'DB not available' })
    }

    const plantsCount = await db.prepare('SELECT COUNT(*) as count FROM plants').all()
    const machinesCount = await db.prepare('SELECT COUNT(*) as count FROM machines').all()
    const workbenchesCount = await db.prepare('SELECT COUNT(*) as count FROM workbenches').all()

    console.log('[DEBUG COUNT] Plants:', plantsCount)
    console.log('[DEBUG COUNT] Machines:', machinesCount)
    console.log('[DEBUG COUNT] Workbenches:', workbenchesCount)

    return c.json({
      success: true,
      plants: plantsCount,
      machines: machinesCount,
      workbenches: workbenchesCount
    })
  } catch (e) {
    console.error('[DEBUG COUNT] ERROR:', e)
    return c.json({
      success: false,
      error: String(e)
    }, 500)
  }
})

app.get('/plants', async (c) => {
  try {
    const db = getCtxDB(c)

    if (!db) {
      return c.json({ success: false, error: 'DB not available' })
    }

    const result = await db.prepare('SELECT * FROM plants LIMIT 10').all()

    console.log('[DEBUG PLANTS] Result:', result)

    return c.json({
      success: true,
      count: result.results?.length || 0,
      data: result.results
    })
  } catch (e) {
    console.error('[DEBUG PLANTS] ERROR:', e)
    return c.json({
      success: false,
      error: String(e)
    }, 500)
  }
})

export default app
