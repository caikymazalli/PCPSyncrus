/**
 * estoque-serial.test.ts
 *
 * Testes para a lógica de Liberação S/N (serial release):
 * 1. Criar um item pendente com controle de série inicializa corretamente
 *    (totalQty, identifiedQty=0, status=pending, entries=[]).
 * 2. Salvar rejeita números de série em branco.
 * 3. Salvar rejeita duplicatas (case-insensitive) dentro do mesmo item.
 * 4. Salvar com dados válidos atualiza status e entries.
 * 5. Guardrails de código-fonte: D1 INSERT em serial_numbers, UPDATE em serial_pending_items,
 *    origin='manual', status='done', guard userId !== 'demo-tenant'.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import app from './estoque'
import { sessions, tenants } from '../userStore'

// ── Helpers ───────────────────────────────────────────────────────────────────

const TOKEN = 'test-token-serial-release'
const USER_ID = 'test-user-serial-release'

function setupSession() {
  sessions[TOKEN] = {
    token: TOKEN,
    userId: USER_ID,
    email: 'test-serial@test.com',
    nome: 'Test User',
    empresa: 'Test Corp',
    plano: 'starter',
    role: 'admin',
    isDemo: false,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 3_600_000,
    empresaId: '1',
    grupoId: null,
  }
}

function setupTenant() {
  tenants[USER_ID] = {
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
  }
}

function cleanup() {
  delete sessions[TOKEN]
  delete tenants[USER_ID]
}

function authed(path: string, init?: RequestInit) {
  return app.request(path, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> || {}),
      Cookie: 'pcp_session=' + TOKEN,
    },
  })
}

// ── 1. Creating a pending item ────────────────────────────────────────────────

describe('POST /estoque/api/pending-serial/create — serial controlled item', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('creates pending item with correct totalQty, identifiedQty=0, status=pending, entries=[]', async () => {
    const res = await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productCode: 'PROD-001',
        productName: 'Produto Teste Série',
        totalQty: 3,
        unit: 'un',
        controlType: 'serie',
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.ok).toBe(true)
    expect(data.item).toBeDefined()
    expect(data.item.productCode).toBe('PROD-001')
    expect(data.item.totalQty).toBe(3)
    expect(data.item.identifiedQty).toBe(0)
    expect(data.item.status).toBe('pending')
    expect(data.item.entries).toEqual([])
    expect(data.item.controlType).toBe('serie')

    // Verify it was stored in the tenant
    const pending = (tenants[USER_ID].serialPendingItems as any[])
    expect(pending.length).toBe(1)
    expect(pending[0].totalQty).toBe(3)
    expect(pending[0].identifiedQty).toBe(0)
    expect(pending[0].entries).toEqual([])
  })

  it('initializes correct row count matching totalQty=5', async () => {
    const res = await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productCode: 'PROD-002',
        productName: 'Produto 5 Unidades',
        totalQty: 5,
        unit: 'un',
        controlType: 'serie',
      }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.item.totalQty).toBe(5)
    // entries should be empty — rows are UI-side, server just stores the qty
    expect(data.item.entries).toHaveLength(0)
  })

  it('replaces existing pending item for the same product', async () => {
    // Create first
    await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode: 'PROD-X', productName: 'Produto X', totalQty: 2, unit: 'un', controlType: 'serie' }),
    })
    // Create again for same product
    await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode: 'PROD-X', productName: 'Produto X', totalQty: 4, unit: 'un', controlType: 'serie' }),
    })

    const pending = (tenants[USER_ID].serialPendingItems as any[])
    expect(pending.filter((p: any) => p.productCode === 'PROD-X')).toHaveLength(1)
    expect(pending[0].totalQty).toBe(4)
  })
})

// ── 2. Saving rejects blank serial numbers ────────────────────────────────────

describe('POST /estoque/api/serial-release — rejeita números em branco', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna erro quando uma entrada tem número em branco', async () => {
    // First create a pending item
    const createRes = await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode: 'PROD-A', productName: 'Prod A', totalQty: 2, unit: 'un', controlType: 'serie' }),
    })
    const { item } = await createRes.json() as any

    // Try to save with a blank entry
    const res = await authed('/api/serial-release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pendingId: item.id,
        entries: [
          { number: 'SN-0001', qty: 1 },
          { number: '',        qty: 1 },  // blank
        ],
      }),
    })

    expect(res.status).toBe(400)
    const data = await res.json() as any
    expect(data.ok).toBe(false)
    expect(data.error).toMatch(/branco/i)
  })

  it('retorna erro quando entrada tem apenas espaços', async () => {
    const createRes = await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode: 'PROD-B', productName: 'Prod B', totalQty: 1, unit: 'un', controlType: 'serie' }),
    })
    const { item } = await createRes.json() as any

    const res = await authed('/api/serial-release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pendingId: item.id,
        entries: [{ number: '   ', qty: 1 }],
      }),
    })

    expect(res.status).toBe(400)
    const data = await res.json() as any
    expect(data.ok).toBe(false)
  })
})

// ── 3. Saving rejects duplicates ──────────────────────────────────────────────

describe('POST /estoque/api/serial-release — rejeita duplicatas', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('rejeita números duplicados no mesmo payload (case-insensitive)', async () => {
    const createRes = await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode: 'PROD-C', productName: 'Prod C', totalQty: 3, unit: 'un', controlType: 'serie' }),
    })
    const { item } = await createRes.json() as any

    const res = await authed('/api/serial-release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pendingId: item.id,
        entries: [
          { number: 'SN-0001', qty: 1 },
          { number: 'SN-0002', qty: 1 },
          { number: 'sn-0001', qty: 1 },  // duplicate (case-insensitive)
        ],
      }),
    })

    expect(res.status).toBe(400)
    const data = await res.json() as any
    expect(data.ok).toBe(false)
    expect(data.error).toMatch(/duplicado/i)
  })

  it('aceita números únicos e salva corretamente', async () => {
    const createRes = await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode: 'PROD-D', productName: 'Prod D', totalQty: 3, unit: 'un', controlType: 'serie' }),
    })
    const { item } = await createRes.json() as any

    const res = await authed('/api/serial-release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pendingId: item.id,
        entries: [
          { number: 'SN-0001', qty: 1 },
          { number: 'SN-0002', qty: 1 },
          { number: 'SN-0003', qty: 1 },
        ],
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.ok).toBe(true)
    expect(data.status).toBe('done')
    expect(data.identifiedQty).toBe(3)
    expect(data.totalQty).toBe(3)

    // Verify tenant state updated
    const pi = (tenants[USER_ID].serialPendingItems as any[]).find((p: any) => p.id === item.id)
    expect(pi.status).toBe('done')
    expect(pi.entries).toHaveLength(3)
    expect(pi.identifiedQty).toBe(3)

    // Verify serialNumbers were registered
    const sns = (tenants[USER_ID].serialNumbers as any[])
    expect(sns).toHaveLength(3)
    expect(sns.map((s: any) => s.number).sort()).toEqual(['SN-0001', 'SN-0002', 'SN-0003'].sort())
  })

  it('marca status como partial quando identifiedQty < totalQty', async () => {
    const createRes = await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode: 'PROD-E', productName: 'Prod E', totalQty: 5, unit: 'un', controlType: 'serie' }),
    })
    const { item } = await createRes.json() as any

    const res = await authed('/api/serial-release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pendingId: item.id,
        entries: [
          { number: 'SN-A1', qty: 1 },
          { number: 'SN-A2', qty: 1 },
        ],
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.ok).toBe(true)
    expect(data.status).toBe('partial')
    expect(data.identifiedQty).toBe(2)
    expect(data.totalQty).toBe(5)
  })
})

// ── Source-code guardrails: D1 persistence in /api/serial-release ────────────

describe('estoque.ts source-code guardrails serial-release D1 persistence', () => {
  const src = readFileSync(resolve(__dirname, 'estoque.ts'), 'utf8')
  const handlerStart = src.indexOf("app.post('/api/serial-release'")
  const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
  const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)

  it('usa origin manual (não planilha)', () => {
    expect(handlerBody).toContain("origin: 'manual'")
    expect(handlerBody).not.toContain("origin: 'planilha'")
  })

  it('status final usa done (alinhado com D1 schema)', () => {
    expect(handlerBody).toContain("pi.status = 'done'")
    expect(handlerBody).not.toContain("pi.status = 'complete'")
  })

  it('persiste cada serial em serial_numbers no D1 com guard userId !== demo-tenant', () => {
    expect(handlerBody).toContain("INSERT OR IGNORE INTO serial_numbers")
    expect(handlerBody).toContain("userId !== 'demo-tenant'")
  })

  it('inclui colunas user_id e empresa_id no INSERT de serial_numbers', () => {
    expect(handlerBody).toContain('user_id')
    expect(handlerBody).toContain('empresa_id')
    expect(handlerBody).toContain('almoxarifado_id')
    expect(handlerBody).toContain('location')
  })

  it('atualiza serial_pending_items no D1 após o loop de entries', () => {
    expect(handlerBody).toContain('UPDATE serial_pending_items')
    expect(handlerBody).toContain('entries_json')
    expect(handlerBody).toContain('identified_qty')
  })

  it('envolve operações D1 em try/catch com console.warn', () => {
    expect(handlerBody).toContain('[ESTOQUE][SERIAL-RELEASE]')
    expect(handlerBody).toMatch(/try\s*\{/)
    expect(handlerBody).toMatch(/catch\s*\(/)
  })
})

// ── API: POST /estoque/api/serial-location/update ────────────────────────────

describe('POST /estoque/api/serial-location/update — edição inline de endereço', () => {
  beforeEach(() => {
    setupSession()
    setupTenant()
    // seed an existing serial number and an almoxarifado location
    ;(tenants[USER_ID] as any).serialNumbers = [
      {
        id: 'sn-test-001',
        itemCode: 'PROD-LOC',
        number: 'SN-LOC-001',
        qty: 1,
        controlType: 'serie',
        status: 'em_estoque',
        origin: 'manual',
        createdAt: new Date().toISOString(),
        userId: USER_ID,
        empresaId: '1',
        almoxarifadoId: 'alm1',
        location: '',
      },
    ]
    ;(tenants[USER_ID] as any).almoxarifadoLocations = [
      { id: 'loc-001', almoxarifadoId: 'alm1', code: 'A-01-01', description: 'Prateleira A', status: 'active' },
      { id: 'loc-002', almoxarifadoId: 'alm1', code: 'B-02-03', description: 'Prateleira B', status: 'active' },
    ]
  })
  afterEach(cleanup)

  it('atualiza location quando endereço existe no almoxarifado', async () => {
    const res = await authed('/api/serial-location/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snId: 'sn-test-001', almoxarifadoId: 'alm1', locationCode: 'A-01-01' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.ok).toBe(true)
    expect(data.location).toBe('A-01-01')
    // in-memory state updated
    const sn = ((tenants[USER_ID] as any).serialNumbers as any[]).find((s: any) => s.id === 'sn-test-001')
    expect(sn?.location).toBe('A-01-01')
  })

  it('retorna erro quando endereço não existe no almoxarifado', async () => {
    const res = await authed('/api/serial-location/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snId: 'sn-test-001', almoxarifadoId: 'alm1', locationCode: 'Z-99-99' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as any
    expect(data.ok).toBe(false)
    expect(data.error).toMatch(/Z-99-99/)
    expect(data.error).toMatch(/cadastro/i)
  })

  it('aceita endereço vazio (limpar location)', async () => {
    // first set a location
    ;(tenants[USER_ID] as any).serialNumbers[0].location = 'A-01-01'
    const res = await authed('/api/serial-location/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snId: 'sn-test-001', almoxarifadoId: 'alm1', locationCode: '' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.ok).toBe(true)
    expect(data.location).toBe('')
    const sn = ((tenants[USER_ID] as any).serialNumbers as any[]).find((s: any) => s.id === 'sn-test-001')
    expect(sn?.location).toBe('')
  })

  it('valida endereço case-insensitive', async () => {
    const res = await authed('/api/serial-location/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snId: 'sn-test-001', almoxarifadoId: 'alm1', locationCode: 'a-01-01' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.ok).toBe(true)
  })

  it('retorna erro quando snId não existe', async () => {
    const res = await authed('/api/serial-location/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snId: 'sn-does-not-exist', almoxarifadoId: 'alm1', locationCode: 'A-01-01' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as any
    expect(data.ok).toBe(false)
  })

  it('retorna erro quando endereço pertence a almoxarifado inativo', async () => {
    ;(tenants[USER_ID] as any).almoxarifadoLocations.push(
      { id: 'loc-003', almoxarifadoId: 'alm1', code: 'C-01-01', description: 'Inativa', status: 'inactive' }
    )
    const res = await authed('/api/serial-location/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snId: 'sn-test-001', almoxarifadoId: 'alm1', locationCode: 'C-01-01' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as any
    expect(data.ok).toBe(false)
    expect(data.error).toMatch(/C-01-01/)
  })
})

// ── Source-code guardrails: serial-location/update ───────────────────────────

describe('estoque.ts source-code guardrails serial-location/update', () => {
  const src = readFileSync(resolve(__dirname, 'estoque.ts'), 'utf8')
  const handlerStart = src.indexOf("app.post('/api/serial-location/update'")
  const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
  const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)

  it('endpoint exists in estoque.ts', () => {
    expect(handlerStart).toBeGreaterThan(0)
  })

  it('valida existência do endereço no almoxarifado antes de salvar', () => {
    expect(handlerBody).toContain('almoxarifadoLocations')
    expect(handlerBody).toContain('status !== \'inactive\'')
  })

  it('persiste no D1 com UPDATE serial_numbers', () => {
    expect(handlerBody).toContain('UPDATE serial_numbers SET location')
  })

  it('usa guard userId !== demo-tenant', () => {
    expect(handlerBody).toContain("userId !== 'demo-tenant'")
  })

  it('envolve D1 em try/catch com console.warn', () => {
    expect(handlerBody).toContain('[ESTOQUE][SERIAL-LOCATION]')
    expect(handlerBody).toMatch(/try\s*\{/)
    expect(handlerBody).toMatch(/catch\s*\(/)
  })
})

// ── Source-code guardrails: Liberação S/N inline edit UI ─────────────────────

describe('estoque.ts source-code: aba Liberação S/N suporte a edição inline de endereço', () => {
  const src = readFileSync(resolve(__dirname, 'estoque.ts'), 'utf8')

  it('tabela de S/N liberados tem atributo data-sn-id nas linhas', () => {
    const tabStart = src.indexOf('id="tabLiberacaoSerial"')
    const tabContent = src.slice(tabStart, tabStart + 5000)
    expect(tabContent).toContain('data-sn-id=')
  })

  it('célula de endereço tem handler ondblclick', () => {
    const tabStart = src.indexOf('id="tabLiberacaoSerial"')
    const tabContent = src.slice(tabStart, tabStart + 5000)
    expect(tabContent).toContain('ondblclick="startSnLocationEdit(this)"')
  })

  it('exibe código do almoxarifado no endereço quando há mais de um almoxarifado', () => {
    // The SSR logic must include allAlm.length > 1 check for prefix display
    expect(src).toContain('allAlm.length > 1')
  })

  it('função startSnLocationEdit está definida no JS embutido', () => {
    expect(src).toContain('function startSnLocationEdit(cell)')
  })

  it('startSnLocationEdit faz fetch para /estoque/api/serial-location/update', () => {
    const fnStart = src.indexOf('function startSnLocationEdit(cell)')
    const fnEnd = src.indexOf('\n  function ', fnStart + 1)
    const fnBody = src.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 4000)
    expect(fnBody).toContain('/estoque/api/serial-location/update')
  })
})
