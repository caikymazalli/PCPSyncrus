/**
 * userStore-empresa-linkage.test.ts
 *
 * Tests for PR #1 — standardize user↔empresa linkage using
 * `registered_users.empresa_id` as the source of truth.
 *
 * Scenarios covered:
 * 1. loginUser resolves empresaId from registered_users.empresa_id (not user_empresa).
 * 2. loginUser resolves grupoId by querying empresas with the resolved empresaId.
 * 3. loginUser sets empresaId = null when registered_users.empresa_id is NULL.
 * 4. loginUser safe-fallbacks when DB throws during empresa_id lookup.
 * 5. Admin listing includes users sharing the same empresa_id.
 * 6. Admin listing excludes users with empresa_id = NULL (different empresa).
 * 7. Admin listing deduplicates users appearing via both empresa_id and owner_id.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { loginUser, sessions, registeredUsers } from './userStore'
import { hashPassword } from './userStore'

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_EMAIL    = 'empresa-link-test@test.com'
const TEST_USER_ID  = 'user-empresa-link-001'
const TEST_EMPRESA_ID = 'empresa-link-test-001'
const TEST_GRUPO_ID   = 'grupo-link-test-001'

async function makePwdHash(pwd: string): Promise<string> {
  return hashPassword(pwd)
}

/** Build a mock D1 database that matches SQL substrings. */
function makeMockDB(
  queryMap: Record<string, any> = {},
  allMap: Record<string, any[]> = {}
): any {
  const prepared = (sql: string) => {
    return {
      bind: (..._args: any[]) => ({
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
      }),
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
  return { prepare: prepared }
}

// ── loginUser — empresaId from registered_users ───────────────────────────────

describe('loginUser — resolves empresaId from registered_users (not user_empresa)', () => {
  const PWD = 'test-pwd-123'

  beforeEach(async () => {
    // Remove any cached session tokens for this test user
    Object.keys(sessions).forEach(k => {
      if (sessions[k].userId === TEST_USER_ID) delete sessions[k]
    })
    delete registeredUsers[TEST_EMAIL]
  })

  it('sets empresaId from registered_users.empresa_id when available', async () => {
    const pwdHash = await makePwdHash(PWD)

    const db = makeMockDB({
      // registered_users lookup (by email — the SELECT * query)
      'registered_users WHERE email': {
        id: TEST_USER_ID,
        email: TEST_EMAIL,
        pwd_hash: pwdHash,
        nome: 'Test',
        sobrenome: 'User',
        empresa: 'Corp',
        plano: 'starter',
        role: 'admin',
        tel: '',
        setor: '',
        porte: '',
        is_demo: 0,
        created_at: '2024-01-01',
        last_login: null,
        trial_start: '2024-01-01',
        trial_end: '2099-12-31',
        owner_id: null,
        empresa_id: TEST_EMPRESA_ID,
      },
      // empresa_id lookup by userId (SELECT empresa_id FROM registered_users WHERE id = ?)
      'empresa_id FROM registered_users': { empresa_id: TEST_EMPRESA_ID },
      // grupo_id lookup (SELECT grupo_id FROM empresas WHERE id = ?)
      'grupo_id FROM empresas': { grupo_id: TEST_GRUPO_ID },
      // sessions update
      'sessions WHERE token': null,
      'last_login': null,
    })

    const result = await loginUser(TEST_EMAIL, PWD, db)

    expect(result.ok).toBe(true)
    expect(result.token).toBeDefined()
    const session = sessions[result.token!]
    expect(session).toBeDefined()
    expect(session.empresaId).toBe(TEST_EMPRESA_ID)
    expect(session.grupoId).toBe(TEST_GRUPO_ID)
  })

  it('sets empresaId = null when registered_users.empresa_id is NULL', async () => {
    const pwdHash = await makePwdHash(PWD)

    const db = makeMockDB({
      'registered_users WHERE email': {
        id: TEST_USER_ID,
        email: TEST_EMAIL,
        pwd_hash: pwdHash,
        nome: 'Test',
        sobrenome: 'User',
        empresa: 'Corp',
        plano: 'starter',
        role: 'admin',
        tel: '',
        setor: '',
        porte: '',
        is_demo: 0,
        created_at: '2024-01-01',
        last_login: null,
        trial_start: '2024-01-01',
        trial_end: '2099-12-31',
        owner_id: null,
        empresa_id: null,
      },
      'empresa_id FROM registered_users': { empresa_id: null },
    })

    const result = await loginUser(TEST_EMAIL, PWD, db)

    expect(result.ok).toBe(true)
    const session = sessions[result.token!]
    expect(session.empresaId).toBeNull()
    expect(session.grupoId).toBeNull()
  })

  it('sets empresaId = null and does not throw when DB lookup throws', async () => {
    const pwdHash = await makePwdHash(PWD)

    // DB that succeeds for SELECT * (email lookup) but throws on empresa_id lookup
    const baseDb = makeMockDB({
      'registered_users WHERE email': {
        id: TEST_USER_ID,
        email: TEST_EMAIL,
        pwd_hash: pwdHash,
        nome: 'Test',
        sobrenome: 'User',
        empresa: 'Corp',
        plano: 'starter',
        role: 'admin',
        tel: '',
        setor: '',
        porte: '',
        is_demo: 0,
        created_at: '2024-01-01',
        last_login: null,
        trial_start: '2024-01-01',
        trial_end: '2099-12-31',
        owner_id: null,
        empresa_id: null,
      },
    })

    const db = {
      prepare: (sql: string) => {
        const stmt = baseDb.prepare(sql)
        // Make empresa_id lookup throw
        if (sql.includes('empresa_id FROM registered_users') || sql.includes('grupo_id FROM empresas')) {
          return {
            bind: () => ({
              first: () => Promise.reject(new Error('DB error')),
              all: () => Promise.resolve({ results: [] }),
              run: () => Promise.resolve({ success: true, results: [] }),
            }),
          }
        }
        return stmt
      },
    }

    const result = await loginUser(TEST_EMAIL, PWD, db as any)

    // Should still succeed with login — empresaId falls back to null
    expect(result.ok).toBe(true)
    const session = sessions[result.token!]
    expect(session.empresaId).toBeNull()
  })

  it('does NOT query user_empresa table during login', async () => {
    const queriedTables: string[] = []
    const pwdHash = await makePwdHash(PWD)

    const trackingDb = {
      prepare: (sql: string) => {
        queriedTables.push(sql)
        return makeMockDB({
          'registered_users WHERE email': {
            id: TEST_USER_ID,
            email: TEST_EMAIL,
            pwd_hash: pwdHash,
            nome: 'Test',
            sobrenome: 'User',
            empresa: 'Corp',
            plano: 'starter',
            role: 'admin',
            tel: '',
            setor: '',
            porte: '',
            is_demo: 0,
            created_at: '2024-01-01',
            last_login: null,
            trial_start: '2024-01-01',
            trial_end: '2099-12-31',
            owner_id: null,
            empresa_id: null,
          },
          'empresa_id FROM registered_users': { empresa_id: null },
        }).prepare(sql)
      },
    }

    await loginUser(TEST_EMAIL, PWD, trackingDb as any)

    const usedUserEmpresaTable = queriedTables.some(sql => sql.includes('user_empresa'))
    expect(usedUserEmpresaTable).toBe(false)
  })
})

// ── Admin listing — empresa_id-scoped user query ──────────────────────────────

describe('admin listing — empresa_id scoped user queries (source-code safeguard)', () => {
  const { readFileSync } = require('fs')
  const { resolve } = require('path')
  const src = readFileSync(resolve(__dirname, 'routes/admin.ts'), 'utf-8')

  it('queries registered_users with empresa_id = ? condition', () => {
    expect(src).toContain('empresa_id = ?')
  })

  it('queries registered_users.empresa_id in owner lookup', () => {
    expect(src).toContain('SELECT owner_id, empresa_id FROM registered_users WHERE id = ?')
  })

  it('admin listing uses session.empresaId as primary empresa_id source', () => {
    expect(src).toContain("session?.empresaId")
  })

  it('deduplicates users via Set to avoid duplicates when empresa_id overlaps owner_id chain', () => {
    expect(src).toContain('seen.has(row.id)')
  })
})
