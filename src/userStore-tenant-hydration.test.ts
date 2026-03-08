/**
 * userStore-tenant-hydration.test.ts
 *
 * Tests for the tenant-scoped data fallback behavior introduced to prevent
 * product_supplier_links and work_instructions from disappearing after a
 * cold start / deploy when `session.empresaId` is NULL in D1.
 *
 * Scenarios covered:
 * 1. getSessionAsync — returns empresaId from session row when present.
 * 2. getSessionAsync — falls back to registered_users.empresa_id when
 *    the session row has NULL empresa_id (e.g. sessions created before
 *    migration 0010 or with NULL value).
 * 3. loadTenantFromDB — resolves empresaId from registered_users when
 *    the parameter is undefined, and uses it to load product_supplier_links.
 * 4. loadTenantFromDB — resolves empresaId from registered_users when
 *    the parameter is undefined, and uses it to load work_instructions +
 *    work_instruction_steps.
 * 5. loadTenantFromDB — does NOT resolve empresaId for demo-tenant (no-op).
 * 6. loadTenantFromDB — skips registered_users lookup gracefully when DB throws.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  getSessionAsync,
  loadTenantFromDB,
  sessions,
  tenants,
  resetTenantHydrationCache,
} from './userStore'

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_TOKEN = 'test-token-hydration-fallback'
const TEST_USER_ID = 'user-hydration-fallback-001'
const TEST_EMPRESA_ID = 'empresa-fallback-001'

function cleanup() {
  delete sessions[TEST_TOKEN]
  delete tenants[TEST_USER_ID]
  resetTenantHydrationCache(TEST_USER_ID)
}

/**
 * Build a mock D1 database.
 *
 * `queryMap` maps a substring of the SQL to the value returned by `.first()`.
 * `allMap` maps a substring of the SQL to the value returned by `.all()`.
 */
function makeMockDB(
  queryMap: Record<string, any> = {},
  allMap: Record<string, any[]> = {}
): any {
  const prepared = (sql: string) => {
    const boundValues: any[] = []
    const bound = (...args: any[]) => {
      boundValues.push(...args.flat())
      return {
        first: () => {
          for (const [key, val] of Object.entries(queryMap)) {
            if (sql.includes(key)) return Promise.resolve(val)
          }
          return Promise.resolve(null)
        },
        all: () => {
          for (const [key, rows] of Object.entries(allMap)) {
            if (sql.includes(key)) return Promise.resolve({ results: rows })
          }
          return Promise.resolve({ results: [] })
        },
        run: () => Promise.resolve({ success: true, results: [] }),
      }
    }
    return {
      bind: (...args: any[]) => bound(...args),
      first: () => bound().first(),
      all: () => bound().all(),
      run: () => bound().run(),
    }
  }
  return { prepare: prepared }
}

// ── getSessionAsync tests ─────────────────────────────────────────────────────

describe('getSessionAsync — empresaId fallback', () => {
  beforeEach(cleanup)

  it('returns empresaId directly from session row when present', async () => {
    const db = makeMockDB({
      'sessions WHERE token': {
        token: TEST_TOKEN,
        user_id: TEST_USER_ID,
        email: 'test@test.com',
        nome: 'Test',
        empresa: 'Corp',
        plano: 'starter',
        role: 'admin',
        is_demo: 0,
        created_at: new Date().toISOString(),
        expires_at: Date.now() + 3_600_000,
        empresa_id: TEST_EMPRESA_ID,
        grupo_id: null,
      },
      'registered_users WHERE id': {
        owner_id: null,
        empresa_id: 'should-not-be-used',
        grupo_id: null,
      },
    })

    const session = await getSessionAsync(TEST_TOKEN, db)
    expect(session).not.toBeNull()
    expect(session!.empresaId).toBe(TEST_EMPRESA_ID)
  })

  it('falls back to registered_users.empresa_id when session row has NULL empresa_id', async () => {
    const db = makeMockDB({
      'sessions WHERE token': {
        token: TEST_TOKEN,
        user_id: TEST_USER_ID,
        email: 'test@test.com',
        nome: 'Test',
        empresa: 'Corp',
        plano: 'starter',
        role: 'admin',
        is_demo: 0,
        created_at: new Date().toISOString(),
        expires_at: Date.now() + 3_600_000,
        empresa_id: null,    // ← simulates old session without empresa_id
        grupo_id: null,
      },
      'registered_users WHERE id': {
        owner_id: null,
        empresa_id: TEST_EMPRESA_ID,
        grupo_id: 'grupo-fallback-001',
      },
    })

    const session = await getSessionAsync(TEST_TOKEN, db)
    expect(session).not.toBeNull()
    expect(session!.empresaId).toBe(TEST_EMPRESA_ID)
    expect(session!.grupoId).toBe('grupo-fallback-001')
  })

  it('returns null empresaId when both session row and registered_users have NULL', async () => {
    const db = makeMockDB({
      'sessions WHERE token': {
        token: TEST_TOKEN,
        user_id: TEST_USER_ID,
        email: 'test@test.com',
        nome: 'Test',
        empresa: 'Corp',
        plano: 'starter',
        role: 'admin',
        is_demo: 0,
        created_at: new Date().toISOString(),
        expires_at: Date.now() + 3_600_000,
        empresa_id: null,
        grupo_id: null,
      },
      'registered_users WHERE id': {
        owner_id: null,
        empresa_id: null,
        grupo_id: null,
      },
    })

    const session = await getSessionAsync(TEST_TOKEN, db)
    expect(session).not.toBeNull()
    expect(session!.empresaId).toBeNull()
  })
})

// ── loadTenantFromDB tests ────────────────────────────────────────────────────

describe('loadTenantFromDB — empresaId fallback', () => {
  beforeEach(cleanup)

  it('resolves empresaId from registered_users and loads product_supplier_links', async () => {
    const mockLink = {
      id: 'link-001',
      product_id: 'prod-001',
      supplier_id: 'sup-001',
      supplier_name: 'Fornecedor A',
      supplier_email: '',
      supplier_phone: '',
      status: 'active',
      created_at: new Date().toISOString(),
      user_id: TEST_USER_ID,
      empresa_id: TEST_EMPRESA_ID,
    }

    const db = makeMockDB(
      // first() queries
      {
        'registered_users WHERE id': { empresa_id: TEST_EMPRESA_ID },
      },
      // all() queries
      {
        'product_supplier_links WHERE user_id': [mockLink],
      }
    )

    // Call with no empresaId — should resolve from registered_users
    await loadTenantFromDB(TEST_USER_ID, db, undefined)

    const tenant = tenants[TEST_USER_ID]
    expect(tenant).toBeDefined()
    expect(tenant.productSupplierLinks).toHaveLength(1)
    expect(tenant.productSupplierLinks[0].supplier_name).toBe('Fornecedor A')
  })

  it('resolves empresaId from registered_users and loads work_instructions with steps', async () => {
    const mockInstruction = {
      id: 'instr-001',
      code: 'IT-001',
      title: 'Instrução Teste',
      description: 'Desc',
      current_version: '1.0',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: TEST_USER_ID,
      updated_by: TEST_USER_ID,
      user_id: TEST_USER_ID,
      empresa_id: TEST_EMPRESA_ID,
    }
    const mockStep = {
      id: 'step-001',
      version_id: 'ver-001',
      step_number: 1,
      title: 'Passo 1',
      description: 'Primeiro passo',
      observation: '',
      created_at: new Date().toISOString(),
      created_by: TEST_USER_ID,
      user_id: TEST_USER_ID,
      empresa_id: TEST_EMPRESA_ID,
    }

    const db = makeMockDB(
      { 'registered_users WHERE id': { empresa_id: TEST_EMPRESA_ID } },
      {
        'work_instructions WHERE user_id': [mockInstruction],
        'work_instruction_steps WHERE user_id': [mockStep],
      }
    )

    await loadTenantFromDB(TEST_USER_ID, db, undefined)

    const tenant = tenants[TEST_USER_ID]
    expect(tenant.workInstructions).toHaveLength(1)
    expect(tenant.workInstructions[0].title).toBe('Instrução Teste')
    expect(tenant.workInstructionSteps).toHaveLength(1)
    expect(tenant.workInstructionSteps[0].title).toBe('Passo 1')
  })

  it('does not call DB for demo-tenant', async () => {
    let called = false
    const db = makeMockDB() // will set called=false; we override prepare to track calls
    const trackingDB = {
      prepare: (...args: any[]) => { called = true; return db.prepare(...args) },
    }

    await loadTenantFromDB('demo-tenant', trackingDB as any, undefined)
    expect(called).toBe(false)
  })

  it('proceeds without empresa filter when registered_users lookup throws', async () => {
    const mockLink = {
      id: 'link-002',
      product_id: 'prod-002',
      supplier_id: 'sup-002',
      supplier_name: 'Fornecedor B',
      supplier_email: '',
      supplier_phone: '',
      status: 'active',
      created_at: new Date().toISOString(),
    }

    // DB that throws on registered_users first() but succeeds for all() queries
    const db = makeMockDB(
      // first() — registered_users throws, others return null
      { '__throw_registered_users__': null },
      // all() — product_supplier_links returns a row
      { 'product_supplier_links WHERE user_id': [mockLink] }
    )
    // Patch: make registered_users first() throw instead of returning null
    const originalPrepare = db.prepare.bind(db)
    db.prepare = (sql: string) => {
      const stmt = originalPrepare(sql)
      if (sql.includes('registered_users')) {
        return {
          bind: (..._args: any[]) => ({
            first: () => Promise.reject(new Error('DB error')),
            all: () => Promise.resolve({ results: [] }),
            run: () => Promise.resolve({ success: true, results: [] }),
          }),
          first: () => Promise.reject(new Error('DB error')),
          all: () => Promise.resolve({ results: [] }),
          run: () => Promise.resolve({ success: true, results: [] }),
        }
      }
      return stmt
    }

    // Should not throw — graceful degradation
    await expect(loadTenantFromDB(TEST_USER_ID, db as any, undefined)).resolves.toBeUndefined()
    // product_supplier_links should still be loaded (without empresa filter)
    const tenant = tenants[TEST_USER_ID]
    expect(tenant.productSupplierLinks).toHaveLength(1)
  })
})
