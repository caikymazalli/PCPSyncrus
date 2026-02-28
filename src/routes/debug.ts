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

interface CountRow { count: number }

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

app.get('/cleanup', async (c) => {
  try {
    const db = getCtxDB(c)

    if (!db) {
      return c.json({ success: false, error: 'DB not available' })
    }

    console.log('[DEBUG CLEANUP] === INICIANDO LIMPEZA ===')

    const tabelas = [
      'plantas', 'maquinas', 'bancadas', 'produtos', 'bom',
      'ordens_producao', 'apontamentos', 'fornecedores', 'cotacoes',
      'pedidos_compra', 'importacoes', 'itens_estoque', 'nao_conformidades',
      'ordens_separacao', 'baixas_estoque', 'almoxarifados'
    ]

    const results: Record<string, unknown> = {}

    for (const tabela of tabelas) {
      try {
        console.log(`[DEBUG CLEANUP] Deletando de ${tabela}...`)
        const deleteResult = await db
          .prepare(`DELETE FROM ${tabela} WHERE empresa_id IN ('e1', 'e2', 'e3')`)
          .run()
        results[tabela] = deleteResult
        console.log(`[DEBUG CLEANUP] ${tabela} deletado:`, deleteResult)
      } catch (e) {
        console.log(`[DEBUG CLEANUP] ${tabela} não existe ou erro:`, String(e))
        results[tabela] = { error: String(e) }
      }
    }

    console.log('[DEBUG CLEANUP] Deletando empresas e1, e2, e3...')
    const deleteEmpresas = await db
      .prepare(`DELETE FROM empresas WHERE id IN ('e1', 'e2', 'e3')`)
      .run()
    console.log('[DEBUG CLEANUP] Empresas deletadas:', deleteEmpresas)

    console.log('[DEBUG CLEANUP] Deletando grupo g1...')
    const deleteGrupo = await db
      .prepare(`DELETE FROM grupo WHERE id = 'g1'`)
      .run()
    console.log('[DEBUG CLEANUP] Grupo deletado:', deleteGrupo)

    console.log('[DEBUG CLEANUP] Verificando resultado...')
    const grupoCount = await db.prepare('SELECT COUNT(*) as count FROM grupo').all()
    const empresaCount = await db.prepare('SELECT COUNT(*) as count FROM empresas').all()

    console.log('[DEBUG CLEANUP] Grupo count:', grupoCount)
    console.log('[DEBUG CLEANUP] Empresa count:', empresaCount)

    return c.json({
      success: true,
      message: 'Limpeza concluída',
      deletions: results,
      finalCounts: {
        grupos: (grupoCount.results[0] as CountRow).count,
        empresas: (empresaCount.results[0] as CountRow).count
      }
    })
  } catch (e) {
    console.error('[DEBUG CLEANUP] ERROR:', e)
    return c.json({
      success: false,
      error: String(e),
      message: (e as any)?.message
    }, 500)
  }
})

app.get('/seed', async (c) => {
  try {
    const db = getCtxDB(c)

    if (!db) {
      return c.json({ success: false, error: 'DB not available' })
    }

    console.log('[DEBUG SEED] === INICIANDO SEED ===')

    const gruposData = [
      { id: '1', name: 'Woson Latam Comércio de Equipamentos Médicos Odontológicos Ltda' },
      { id: '2', name: 'Empresa Validação Final LTDA' },
      { id: '3', name: 'Cefal' },
      { id: '4', name: 'Escola' },
      { id: '5', name: 'Empresa Teste' },
      { id: '6', name: 'Fix Test Empresa' }
    ]

    const empresasData = [
      { id: '1', grupo_id: '1', name: 'Woson Latam Comércio de Equipamentos Médicos Odontológicos Ltda', cnpj: '00.000.000/0001-00', email: 'caiky.mazalli@wosonlatam.com.br' },
      { id: '2', grupo_id: '2', name: 'Empresa Validação Final LTDA', cnpj: '00.000.000/0001-00', email: 'carlos.souza.test2@empresa.com' },
      { id: '3', grupo_id: '3', name: 'Cefal', cnpj: '00.000.000/0001-00', email: 'adauto.mazalli@gmail.com' },
      { id: '4', grupo_id: '4', name: 'Escola', cnpj: '00.000.000/0001-00', email: 'marcia.mazalli@gmail.com' },
      { id: '5', grupo_id: '5', name: 'Empresa Teste', cnpj: '00.000.000/0001-00', email: 'test_admin@teste.com' },
      { id: '6', grupo_id: '6', name: 'Fix Test Empresa', cnpj: '00.000.000/0001-00', email: 'testmember@fixtest.com' }
    ]

    const results: { grupos: Record<string, unknown>; empresas: Record<string, unknown> } = { grupos: {}, empresas: {} }

    for (const grupo of gruposData) {
      try {
        console.log(`[DEBUG SEED] Inserindo grupo ${grupo.id}...`)
        const insertResult = await db
          .prepare(`INSERT INTO grupo (id, name) VALUES (?, ?)`)
          .bind(grupo.id, grupo.name)
          .run()
        results.grupos[grupo.id] = insertResult
        console.log(`[DEBUG SEED] Grupo ${grupo.id} inserido:`, insertResult)
      } catch (e) {
        console.error(`[DEBUG SEED] Erro ao inserir grupo ${grupo.id}:`, e)
        results.grupos[grupo.id] = { error: String(e) }
      }
    }

    for (const empresa of empresasData) {
      try {
        console.log(`[DEBUG SEED] Inserindo empresa ${empresa.id}...`)
        const insertResult = await db
          .prepare(`INSERT INTO empresas (id, grupo_id, name, cnpj, email, type, status) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(empresa.id, empresa.grupo_id, empresa.name, empresa.cnpj, empresa.email, 'filial', 'ativa')
          .run()
        results.empresas[empresa.id] = insertResult
        console.log(`[DEBUG SEED] Empresa ${empresa.id} inserida:`, insertResult)
      } catch (e) {
        console.error(`[DEBUG SEED] Erro ao inserir empresa ${empresa.id}:`, e)
        results.empresas[empresa.id] = { error: String(e) }
      }
    }

    console.log('[DEBUG SEED] Verificando resultado...')
    const grupoCount = await db.prepare('SELECT COUNT(*) as count FROM grupo').all()
    const empresaCount = await db.prepare('SELECT COUNT(*) as count FROM empresas').all()
    const grupos = await db.prepare('SELECT id, name FROM grupo').all()
    const empresas = await db.prepare('SELECT id, grupo_id, name FROM empresas').all()

    console.log('[DEBUG SEED] Final grupo count:', grupoCount)
    console.log('[DEBUG SEED] Final empresa count:', empresaCount)

    return c.json({
      success: true,
      message: 'Seed concluído',
      inserts: results,
      finalCounts: {
        grupos: (grupoCount.results[0] as CountRow).count,
        empresas: (empresaCount.results[0] as CountRow).count
      },
      finalData: {
        grupos: grupos.results,
        empresas: empresas.results
      }
    })
  } catch (e) {
    console.error('[DEBUG SEED] ERROR:', e)
    return c.json({
      success: false,
      error: String(e),
      message: (e as any)?.message,
      stack: (e as any)?.stack
    }, 500)
  }
})

export default app
