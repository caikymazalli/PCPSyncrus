/**
 * suporte-routes.test.ts
 *
 * Testes de salvaguarda para o módulo de suporte (Chamados).
 * Verifica:
 * 1. O padrão D1-first está presente no código-fonte do handler de criação de ticket
 *    (memória só é atualizada após D1 ter sucesso).
 * 2. Quando D1 falha e Queue não está disponível, a API retorna erro e NÃO atualiza memória.
 * 3. Quando D1 tem sucesso (mock), a memória é atualizada corretamente.
 * 4. markTenantModified é chamado apenas após persistência garantida.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import app from './suporte'
import { sessions, tenants } from '../userStore'

interface ApiResponse<T = Record<string, unknown>> {
  ok: boolean
  error?: string
  ticket?: Record<string, unknown>
  queued?: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_TOKEN   = 'test-token-suporte-safeguard'
const TEST_USER_ID = 'test-user-suporte-safeguard'

function setupSession() {
  sessions[TEST_TOKEN] = {
    token:     TEST_TOKEN,
    userId:    TEST_USER_ID,
    email:     'test-suporte@test.com',
    nome:      'Test User Suporte',
    empresa:   'Test Corp',
    plano:     'starter',
    role:      'admin',
    isDemo:    false,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 3_600_000,
    empresaId: '1',
    grupoId:   null,
  }
}

function setupTenant() {
  tenants[TEST_USER_ID] = {
    plants: [], machines: [], workbenches: [],
    products: [], productionOrders: [], productionEntries: [],
    stockItems: [], nonConformances: [],
    suppliers: [],
    quotations: [], purchaseOrders: [], imports: [],
    boms: [], instructions: [], qualityChecks: [], users: [],
    kpis: {}, chartData: {},
    bomItems: [], productSuppliers: [], workOrders: [], routes: [],
    serialNumbers: [], serialPendingItems: [],
    warehouses: [], separationOrders: [], stockExits: [],
    supplierCategories: [], productSupplierLinks: [],
    quotationNegotiations: [],
    workInstructions: [], workInstructionVersions: [],
    workInstructionSteps: [], workInstructionPhotos: [],
    workInstructionAuditLog: [],
  } as any
}

function cleanup() {
  delete sessions[TEST_TOKEN]
  delete tenants[TEST_USER_ID]
}

function authedRequest(path: string, init?: RequestInit, env?: Record<string, unknown>) {
  return app.request(path, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> || {}),
      Cookie: 'pcp_session=' + TEST_TOKEN,
    },
  }, env)
}

const failingDB = {
  prepare: () => ({
    bind: () => ({
      run:   () => Promise.reject(new Error('D1 connection failed')),
      all:   () => Promise.reject(new Error('D1 connection failed')),
      first: () => Promise.reject(new Error('D1 connection failed')),
    }),
    run:   () => Promise.reject(new Error('D1 connection failed')),
    all:   () => Promise.reject(new Error('D1 connection failed')),
    first: () => Promise.reject(new Error('D1 connection failed')),
  }),
}

const successDB = {
  prepare: () => ({
    bind: () => ({
      run:   () => Promise.resolve({ success: true, results: [] }),
      all:   () => Promise.resolve({ results: [] }),
      first: () => Promise.resolve(null),
    }),
    run:   () => Promise.resolve({ success: true, results: [] }),
    all:   () => Promise.resolve({ results: [] }),
    first: () => Promise.resolve(null),
  }),
}

// ── Source-code guardrail: D1-first pattern ───────────────────────────────────

describe('suporte.ts source-code guardrails D1-first', () => {
  const src = readFileSync(resolve(__dirname, 'suporte.ts'), 'utf8')

  it('tickets handler: bloco D1 aparece antes de supportTickets.push', () => {
    const handlerStart = src.indexOf("app.post('/api/tickets'")
    const handlerEnd   = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody  = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)

    const d1BlockPos = handlerBody.indexOf("userId !== 'demo-tenant'")
    const memPushPos = handlerBody.indexOf('supportTickets.push')
    expect(d1BlockPos).toBeGreaterThan(-1)
    expect(memPushPos).toBeGreaterThan(-1)
    expect(d1BlockPos).toBeLessThan(memPushPos)
  })

  it('tickets handler: markTenantModified importado e chamado', () => {
    expect(src).toContain("import { markTenantModified }")
    const handlerStart = src.indexOf("app.post('/api/tickets'")
    const handlerEnd   = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody  = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('markTenantModified(userId)')
  })

  it('tickets handler: sem catch{} silencioso em writes D1', () => {
    const handlerStart = src.indexOf("app.post('/api/tickets'")
    const handlerEnd   = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody  = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).not.toMatch(/catch\s*\{\s*\}/)
  })
})

// ── POST /api/tickets — D1 falhando e sem Queue (retorna erro) ────────────────

describe('POST /suporte/api/tickets — D1 falhando, sem Queue', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna erro 500 e NÃO atualiza memória quando D1 falha e Queue indisponível', async () => {
    const initial = ((tenants[TEST_USER_ID] as any).supportTickets as any[] || []).length

    const res = await authedRequest('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Ticket', description: 'Test description' }),
    }, { DB: failingDB })

    expect(res.status).toBe(500)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)

    // Memória NÃO deve ter sido atualizada
    expect(((tenants[TEST_USER_ID] as any).supportTickets as any[] || []).length).toBe(initial)
  })
})

// ── POST /api/tickets — D1 com sucesso ───────────────────────────────────────

describe('POST /suporte/api/tickets — D1 com sucesso em produção', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 200 e atualiza memória quando D1 tem sucesso', async () => {
    const initial = ((tenants[TEST_USER_ID] as any).supportTickets as any[] || []).length

    const res = await authedRequest('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Ticket', description: 'Test description', priority: 'high' }),
    }, { DB: successDB })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)
    expect(data.ticket).toBeDefined()

    expect(((tenants[TEST_USER_ID] as any).supportTickets as any[] || []).length).toBe(initial + 1)
  })

  it('ticket criado contém empresa_name a partir da sessão', async () => {
    const res = await authedRequest('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Ticket com empresa', description: 'Teste empresa_name', priority: 'medium' }),
    }, { DB: successDB })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)
    // empresa_name deve conter o nome da empresa da sessão (não o ID/código)
    const ticket = data.ticket as Record<string, unknown>
    expect(ticket).toBeDefined()
    expect(ticket.empresa_name).toBe('Test Corp')
  })

  it('ticket criado contém atendente_id e atendente_name nulos (abertura pelo cliente)', async () => {
    const res = await authedRequest('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Ticket cliente', description: 'Sem atendente', priority: 'low' }),
    }, { DB: successDB })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    const ticket = data.ticket as Record<string, unknown>
    expect(ticket.atendente_id).toBeNull()
    expect(ticket.atendente_name).toBeNull()
  })

  it('ticket criado com empresaId=1 usa userId como empresa_id (não o placeholder)', async () => {
    // Session has empresaId='1' (placeholder) → must fall back to userId for empresa_id
    const res = await authedRequest('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Ticket empresa_id', description: 'Teste resolve empresa', priority: 'medium' }),
    }, { DB: successDB })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    const ticket = data.ticket as Record<string, unknown>
    // empresa_id must NOT be '1' (the placeholder); it must be the real userId
    expect(ticket.empresa_id).not.toBe('1')
    expect(ticket.empresa_id).toBe(TEST_USER_ID)
  })

  it('retorna erro quando title está ausente', async () => {
    const res = await authedRequest('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'No title here' }),
    }, { DB: successDB })

    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
  })
})

// ── Source-code guardrail: master.ts suporte filtros opcionais ────────────────

describe('master.ts source-code: filtros opcionais de suporte', () => {
  const masterSrc = readFileSync(resolve(__dirname, 'master.ts'), 'utf8')

  it('GET /api/support/tickets aceita filtro status opcional', () => {
    expect(masterSrc).toContain("c.req.query('status')")
  })

  it('GET /api/support/tickets aceita filtro priority opcional', () => {
    expect(masterSrc).toContain("c.req.query('priority')")
  })

  it('GET /api/support/tickets aceita filtro only_overdue opcional', () => {
    expect(masterSrc).toContain("c.req.query('only_overdue')")
  })

  it('GET /api/support/tickets aceita filtro limit com teto máximo (500)', () => {
    expect(masterSrc).toContain('Math.min(limitRaw, 500)')
  })

  it('padrão global: query sem filtros retorna todos os tickets', () => {
    // The WHERE clause must be empty when no conditions apply
    expect(masterSrc).toContain("conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''")
  })

  it('UI exibe select de empresa para filtro opcional', () => {
    expect(masterSrc).toContain('supportFilterEmpresa')
  })

  it('UI exibe select de status para filtro opcional', () => {
    expect(masterSrc).toContain('supportFilterStatus')
  })

  it('UI exibe select de prioridade para filtro opcional', () => {
    expect(masterSrc).toContain('supportFilterPriority')
  })

  it('UI exibe checkbox only_overdue para filtro opcional', () => {
    expect(masterSrc).toContain('supportFilterOverdue')
  })

  it('clearSupportFilters limpa todos os filtros e recarrega globalmente', () => {
    expect(masterSrc).toContain('function clearSupportFilters(')
    expect(masterSrc).toContain('loadSupportTickets(null)')
  })

  it('safeJsonForScriptTag está definida e usada para masterClientsData', () => {
    expect(masterSrc).toContain('function safeJsonForScriptTag(')
    expect(masterSrc).toContain('safeJsonForScriptTag(clients)')
  })
})

// ── Source-code guardrails: master.ts JS fixes ───────────────────────────────

describe('master.ts source-code: JS fixes and security', () => {
  const masterSrc = readFileSync(resolve(__dirname, 'master.ts'), 'utf8')

  it('renderKanban: does not use JSON.stringify for onclick (would cause SyntaxError in HTML attributes)', () => {
    // JSON.stringify produces double-quoted strings that break onclick="..." attributes
    const renderKanbanStart = masterSrc.indexOf('function renderKanban(')
    const renderKanbanEnd   = masterSrc.indexOf('\n  async function updateTicketStatus', renderKanbanStart)
    const renderBody = masterSrc.slice(renderKanbanStart, renderKanbanEnd)
    expect(renderBody).not.toContain('JSON.stringify(t.id)')
  })

  it('renderKanban: uses data-action/data-ticket-id attributes (no inline handlers)', () => {
    const renderKanbanStart = masterSrc.indexOf('function renderKanban(')
    const renderKanbanEnd   = masterSrc.indexOf('\n  async function updateTicketStatus', renderKanbanStart)
    const renderBody = masterSrc.slice(renderKanbanStart, renderKanbanEnd)
    // Must use data-action and data-ticket-id instead of inline onclick/onchange handlers
    expect(renderBody).toContain('data-action="ticket-status"')
    expect(renderBody).toContain('data-action="ticket-view"')
    expect(renderBody).toContain('data-action="ticket-edit"')
    expect(renderBody).toContain('data-ticket-id=')
    // Must NOT use inline onchange/onclick handlers (which cause SyntaxError with special chars in IDs)
    expect(renderBody).not.toContain('onchange=')
    expect(renderBody).not.toContain('onclick=')
    // Must NOT use JSON.stringify for ticket IDs in HTML attributes
    expect(renderBody).not.toContain('JSON.stringify(t.id)')
  })

  it('renderKanban: event delegation handles ticket-view, ticket-edit, ticket-status', () => {
    // Click delegation must handle ticket-view and ticket-edit
    expect(masterSrc).toContain("action === 'ticket-view'")
    expect(masterSrc).toContain("action === 'ticket-edit'")
    // Change delegation must handle ticket-status updates via updateTicketStatus
    expect(masterSrc).toContain('updateTicketStatus(')
    expect(masterSrc).toContain('viewTicket(')
    expect(masterSrc).toContain('editTicket(')
  })

  it('openClientDetail: uses esc() to prevent XSS in modal title', () => {
    const detailFnStart = masterSrc.indexOf('function openClientDetail(')
    const detailFnEnd   = masterSrc.indexOf('\n  function switchDetTab(', detailFnStart)
    const detailBody = masterSrc.slice(detailFnStart, detailFnEnd)
    expect(detailBody).toContain('esc(cli.fantasia || cli.empresa)')
  })

  it('salvarTicketMaster: sends empresa_name in payload to display company name (not ID code)', () => {
    const fnStart = masterSrc.indexOf('async function salvarTicketMaster(')
    const fnEnd   = masterSrc.indexOf('\n  </script>', fnStart)
    const fnBody  = masterSrc.slice(fnStart, fnEnd)
    expect(fnBody).toContain('empresa_name')
    expect(fnBody).toContain('masterClientsData.find')
  })

  it('fillMissingEmpresaNames: uses correct "id" column (not non-existent "user_id")', () => {
    const fnStart = masterSrc.indexOf('async function fillMissingEmpresaNames(')
    const fnEnd   = masterSrc.indexOf('\n// ── API: POST /api/support/tickets', fnStart)
    const fnBody  = masterSrc.slice(fnStart, fnEnd)
    // Must use column 'id', not 'user_id' (which does not exist in registered_users)
    expect(fnBody).toContain('SELECT id, empresa FROM registered_users WHERE id IN')
    expect(fnBody).not.toContain('WHERE user_id IN')
    expect(fnBody).toContain('nameMap[u.id]')
    expect(fnBody).not.toContain('nameMap[u.user_id]')
  })
})
