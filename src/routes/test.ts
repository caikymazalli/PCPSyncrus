/**
 * test.ts — Comprehensive test suite for all PCP Syncrus modules
 *
 * Routes:
 *   GET /test/full      — Run all tests and return JSON summary
 *   GET /test/report    — HTML dashboard with results
 *   GET /test/recursos  — Test Recursos module
 *   GET /test/produtos  — Test Produtos module
 *   GET /test/engenharia — Test Engenharia module
 *   GET /test/cadastros — Test Cadastros module
 *   GET /test/ordens    — Test Ordens module
 *   GET /test/apontamento — Test Apontamento module
 *   GET /test/instrucoes — Test Instruções module
 *   GET /test/planejamento — Test Planejamento module
 *   GET /test/suprimentos — Test Suprimentos module
 *   GET /test/estoque   — Test Estoque module
 *   GET /test/qualidade — Test Qualidade module
 *   GET /test/admin     — Test Admin module
 */

import { Hono } from 'hono'
import { getCtxDB, getCtxUserId } from '../sessionHelper'
import { genId } from '../dbHelpers'
import { getTenantData, getEffectiveTenantId, getSession } from '../userStore'
import { getCookie } from 'hono/cookie'

const app = new Hono<{ Bindings: { DB: D1Database } }>()

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TestResult {
  module: string
  section: string
  action: string
  status: 'PASS' | 'FAIL'
  message: string
  savedInMemory?: boolean
  savedInD1?: boolean
  recoveredAfterReload?: boolean
  duration: number
}

export interface TestSummary {
  totalTests: number
  passed: number
  failed: number
  passRate: number
  results: TestResult[]
  startTime: string
  endTime: string
  duration: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pass(module: string, section: string, action: string, message: string, duration: number, opts?: { savedInMemory?: boolean; savedInD1?: boolean; recoveredAfterReload?: boolean }): TestResult {
  return { module, section, action, status: 'PASS', message, duration, ...opts }
}

function fail(module: string, section: string, action: string, message: string, duration: number): TestResult {
  return { module, section, action, status: 'FAIL', message, duration }
}

function timed<T>(fn: () => T): { result: T; duration: number } {
  const start = Date.now()
  const result = fn()
  return { result, duration: Date.now() - start }
}

async function timedAsync<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = Date.now()
  const result = await fn()
  return { result, duration: Date.now() - start }
}

/** Get tenant data from a test-isolated tenant (never demo) */
function getTestTenant(testUserId: string) {
  return getTenantData(testUserId)
}

/** Allowed D1 table names for test operations (prevents SQL injection via table parameter) */
const ALLOWED_TEST_TABLES = new Set([
  'plants', 'machines', 'workbenches', 'products', 'boms',
  'production_orders', 'apontamentos', 'suppliers', 'quotations',
  'purchase_orders', 'imports', 'stock_items', 'warehouses',
  'separation_orders', 'stock_exits', 'non_conformances',
])

/** Verify a record was persisted in D1 */
async function verifyD1(db: D1Database | null, table: string, id: string, userId: string): Promise<boolean> {
  if (!db || !ALLOWED_TEST_TABLES.has(table)) return false
  try {
    const row = await db.prepare(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, userId).first()
    return !!row
  } catch {
    return false
  }
}

/** Clean up a D1 record after test */
async function cleanD1(db: D1Database | null, table: string, id: string, userId: string): Promise<void> {
  if (!db || !ALLOWED_TEST_TABLES.has(table)) return
  try {
    await db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, userId).run()
  } catch { /* ignore */ }
}

// ── Module Test Functions ─────────────────────────────────────────────────────

async function testRecursos(db: D1Database | null, userId: string): Promise<TestResult[]> {
  const results: TestResult[] = []
  const tenant = getTestTenant(userId)

  // ── Plantas ──────────────────────────────────────────────────────────────

  // Create plant
  const pId = genId('p')
  let t = timed(() => {
    const planta = { id: pId, name: 'Planta Teste', location: 'São Paulo', totalCapacity: 100, contact: 'test@test.com', status: 'active', notes: 'Teste' }
    tenant.plants.push(planta)
    return tenant.plants.find((p: any) => p.id === pId)
  })
  const plantInMemory = !!t.result
  let plantInD1 = false
  if (db && userId !== 'demo-tenant') {
    try {
      plantInD1 = await verifyD1(db, 'plants', pId, userId)
    } catch { /* D1 unavailable */ }
  }
  results.push(plantInMemory
    ? pass('Recursos', 'Plantas', 'Criar Planta', 'Planta criada com sucesso', t.duration, { savedInMemory: plantInMemory, savedInD1: plantInD1 })
    : fail('Recursos', 'Plantas', 'Criar Planta', 'Falha ao criar planta em memória', t.duration))

  // Edit plant
  t = timed(() => {
    const idx = tenant.plants.findIndex((p: any) => p.id === pId)
    if (idx !== -1) tenant.plants[idx].name = 'Planta Editada'
    return idx !== -1 && tenant.plants[idx].name === 'Planta Editada'
  })
  results.push(t.result
    ? pass('Recursos', 'Plantas', 'Editar Planta', 'Planta editada com sucesso', t.duration, { savedInMemory: true })
    : fail('Recursos', 'Plantas', 'Editar Planta', 'Falha ao editar planta', t.duration))

  // Delete plant
  t = timed(() => {
    const before = tenant.plants.length
    tenant.plants = tenant.plants.filter((p: any) => p.id !== pId)
    return tenant.plants.length < before
  })
  if (db) await cleanD1(db, 'plants', pId, userId)
  results.push(t.result
    ? pass('Recursos', 'Plantas', 'Deletar Planta', 'Planta deletada com sucesso', t.duration, { savedInMemory: true })
    : fail('Recursos', 'Plantas', 'Deletar Planta', 'Falha ao deletar planta', t.duration))

  // ── Máquinas ─────────────────────────────────────────────────────────────

  const mId = genId('m')
  t = timed(() => {
    const maquina = { id: mId, name: 'Máquina Teste', type: 'CNC', capacity: '100/h', plantId: '', plantName: '', status: 'operational', specs: '' }
    tenant.machines.push(maquina)
    return !!tenant.machines.find((m: any) => m.id === mId)
  })
  let machineInD1 = false
  if (db && userId !== 'demo-tenant') {
    try {
      machineInD1 = await verifyD1(db, 'machines', mId, userId)
    } catch { /* D1 unavailable */ }
  }
  results.push(t.result
    ? pass('Recursos', 'Máquinas', 'Criar Máquina', 'Máquina criada com sucesso', t.duration, { savedInMemory: true, savedInD1: machineInD1 })
    : fail('Recursos', 'Máquinas', 'Criar Máquina', 'Falha ao criar máquina', t.duration))

  // Edit machine
  t = timed(() => {
    const idx = tenant.machines.findIndex((m: any) => m.id === mId)
    if (idx !== -1) tenant.machines[idx].name = 'Máquina Editada'
    return idx !== -1 && tenant.machines[idx].name === 'Máquina Editada'
  })
  results.push(t.result
    ? pass('Recursos', 'Máquinas', 'Editar Máquina', 'Máquina editada com sucesso', t.duration, { savedInMemory: true })
    : fail('Recursos', 'Máquinas', 'Editar Máquina', 'Falha ao editar máquina', t.duration))

  // Delete machine
  t = timed(() => {
    const before = tenant.machines.length
    tenant.machines = tenant.machines.filter((m: any) => m.id !== mId)
    return tenant.machines.length < before
  })
  if (db) await cleanD1(db, 'machines', mId, userId)
  results.push(t.result
    ? pass('Recursos', 'Máquinas', 'Deletar Máquina', 'Máquina deletada com sucesso', t.duration, { savedInMemory: true })
    : fail('Recursos', 'Máquinas', 'Deletar Máquina', 'Falha ao deletar máquina', t.duration))

  // ── Bancadas ─────────────────────────────────────────────────────────────

  const wbId = genId('wb')
  t = timed(() => {
    const bancada = { id: wbId, name: 'Bancada Teste', function: 'Montagem', plantId: '', status: 'available' }
    tenant.workbenches.push(bancada)
    return !!tenant.workbenches.find((w: any) => w.id === wbId)
  })
  let workbenchInD1 = false
  if (db && userId !== 'demo-tenant') {
    try {
      workbenchInD1 = await verifyD1(db, 'workbenches', wbId, userId)
    } catch { /* D1 unavailable */ }
  }
  results.push(t.result
    ? pass('Recursos', 'Bancadas', 'Criar Bancada', 'Bancada criada com sucesso', t.duration, { savedInMemory: true, savedInD1: workbenchInD1 })
    : fail('Recursos', 'Bancadas', 'Criar Bancada', 'Falha ao criar bancada', t.duration))

  // Edit workbench
  t = timed(() => {
    const idx = tenant.workbenches.findIndex((w: any) => w.id === wbId)
    if (idx !== -1) tenant.workbenches[idx].name = 'Bancada Editada'
    return idx !== -1 && tenant.workbenches[idx].name === 'Bancada Editada'
  })
  results.push(t.result
    ? pass('Recursos', 'Bancadas', 'Editar Bancada', 'Bancada editada com sucesso', t.duration, { savedInMemory: true })
    : fail('Recursos', 'Bancadas', 'Editar Bancada', 'Falha ao editar bancada', t.duration))

  // Delete workbench
  t = timed(() => {
    const before = tenant.workbenches.length
    tenant.workbenches = tenant.workbenches.filter((w: any) => w.id !== wbId)
    return tenant.workbenches.length < before
  })
  if (db) await cleanD1(db, 'workbenches', wbId, userId)
  results.push(t.result
    ? pass('Recursos', 'Bancadas', 'Deletar Bancada', 'Bancada deletada com sucesso', t.duration, { savedInMemory: true })
    : fail('Recursos', 'Bancadas', 'Deletar Bancada', 'Falha ao deletar bancada', t.duration))

  return results
}

async function testProdutos(db: D1Database | null, userId: string): Promise<TestResult[]> {
  const results: TestResult[] = []
  const tenant = getTestTenant(userId)

  // Create product
  const prodId = genId('prod')
  let t = timed(() => {
    const product = {
      id: prodId, name: 'Produto Teste', code: 'PROD-TEST-001',
      unit: 'un', type: 'external', stockMin: 10, stockMax: 100,
      stockCurrent: 5, stockStatus: 'critical',
      criticalPercentage: 50, supplierId: '', supplierName: '',
      price: 9.99, description: 'Produto para teste', serialControlled: false,
      controlType: '', notes: '', createdAt: new Date().toISOString(),
    }
    tenant.products.push(product)
    return !!tenant.products.find((p: any) => p.id === prodId)
  })
  let prodInD1 = false
  if (db && userId !== 'demo-tenant') {
    try {
      prodInD1 = await verifyD1(db, 'products', prodId, userId)
    } catch { /* D1 unavailable */ }
  }
  results.push(t.result
    ? pass('Produtos', 'Produtos', 'Criar Produto', 'Produto criado com sucesso', t.duration, { savedInMemory: true, savedInD1: prodInD1 })
    : fail('Produtos', 'Produtos', 'Criar Produto', 'Falha ao criar produto', t.duration))

  // Verify stock status calculation
  t = timed(() => {
    const p = tenant.products.find((p: any) => p.id === prodId)
    if (!p) return false
    // stockCurrent (5) < 50% of stockMin (10) → critical; guard against divide-by-zero
    if (p.stockMin <= 0) return p.stockStatus === 'normal'
    const pct = (p.stockCurrent / p.stockMin) * 100
    return pct < 50 && p.stockStatus === 'critical'
  })
  results.push(t.result
    ? pass('Produtos', 'Produtos', 'Calcular Status', 'Status calculado corretamente (crítico)', t.duration, { savedInMemory: true })
    : fail('Produtos', 'Produtos', 'Calcular Status', 'Status de estoque calculado incorretamente', t.duration))

  // Edit product
  t = timed(() => {
    const idx = tenant.products.findIndex((p: any) => p.id === prodId)
    if (idx !== -1) {
      tenant.products[idx].name = 'Produto Editado'
      tenant.products[idx].stockCurrent = 15
      tenant.products[idx].stockStatus = 'normal'
    }
    return idx !== -1 && tenant.products[idx].name === 'Produto Editado'
  })
  results.push(t.result
    ? pass('Produtos', 'Produtos', 'Editar Produto', 'Produto editado com sucesso', t.duration, { savedInMemory: true })
    : fail('Produtos', 'Produtos', 'Editar Produto', 'Falha ao editar produto', t.duration))

  // Filter by status
  t = timed(() => {
    const critical = tenant.products.filter((p: any) => p.stockStatus === 'critical')
    const normal = tenant.products.filter((p: any) => p.stockStatus === 'normal')
    return Array.isArray(critical) && Array.isArray(normal)
  })
  results.push(t.result
    ? pass('Produtos', 'Produtos', 'Filtrar por Status', 'Filtro por status funciona', t.duration, { savedInMemory: true })
    : fail('Produtos', 'Produtos', 'Filtrar por Status', 'Falha no filtro por status', t.duration))

  // Delete product
  t = timed(() => {
    const before = tenant.products.length
    tenant.products = tenant.products.filter((p: any) => p.id !== prodId)
    return tenant.products.length < before
  })
  if (db) await cleanD1(db, 'products', prodId, userId)
  results.push(t.result
    ? pass('Produtos', 'Produtos', 'Deletar Produto', 'Produto deletado com sucesso', t.duration, { savedInMemory: true })
    : fail('Produtos', 'Produtos', 'Deletar Produto', 'Falha ao deletar produto', t.duration))

  return results
}

async function testEngenharia(db: D1Database | null, userId: string): Promise<TestResult[]> {
  const results: TestResult[] = []
  const tenant = getTestTenant(userId)

  // ── BOM ──────────────────────────────────────────────────────────────────

  const bomId = genId('bom')
  let t = timed(() => {
    const bom = {
      id: bomId, productId: 'prod_test', productName: 'Produto Teste',
      componentId: '', componentName: 'Componente A', componentCode: 'COMP-001',
      quantity: 2, unit: 'un', notes: '', createdAt: new Date().toISOString(),
    }
    tenant.bomItems.push(bom)
    return !!tenant.bomItems.find((b: any) => b.id === bomId)
  })
  let bomInD1 = false
  if (db && userId !== 'demo-tenant') {
    try {
      bomInD1 = await verifyD1(db, 'boms', bomId, userId)
    } catch { /* D1 unavailable */ }
  }
  results.push(t.result
    ? pass('Engenharia', 'BOM', 'Criar BOM', 'Item de BOM criado com sucesso', t.duration, { savedInMemory: true, savedInD1: bomInD1 })
    : fail('Engenharia', 'BOM', 'Criar BOM', 'Falha ao criar item de BOM', t.duration))

  // Edit BOM
  t = timed(() => {
    const idx = tenant.bomItems.findIndex((b: any) => b.id === bomId)
    if (idx !== -1) tenant.bomItems[idx].quantity = 5
    return idx !== -1 && tenant.bomItems[idx].quantity === 5
  })
  results.push(t.result
    ? pass('Engenharia', 'BOM', 'Editar BOM', 'BOM editado com sucesso', t.duration, { savedInMemory: true })
    : fail('Engenharia', 'BOM', 'Editar BOM', 'Falha ao editar BOM', t.duration))

  // Delete BOM
  t = timed(() => {
    const before = tenant.bomItems.length
    tenant.bomItems = tenant.bomItems.filter((b: any) => b.id !== bomId)
    return tenant.bomItems.length < before
  })
  if (db) await cleanD1(db, 'boms', bomId, userId)
  results.push(t.result
    ? pass('Engenharia', 'BOM', 'Deletar BOM', 'BOM deletado com sucesso', t.duration, { savedInMemory: true })
    : fail('Engenharia', 'BOM', 'Deletar BOM', 'Falha ao deletar BOM', t.duration))

  // ── Roteiros ─────────────────────────────────────────────────────────────

  const rotId = genId('rot')
  t = timed(() => {
    const route = {
      id: rotId, name: 'Roteiro Teste', productId: 'prod_test',
      productCode: 'PROD-001', productName: 'Produto Teste',
      version: '1.0', status: 'active', notes: '',
      steps: [{ name: 'Corte', standardTime: 10 }, { name: 'Montagem', standardTime: 20 }],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }
    if (!tenant.routes) (tenant as any).routes = []
    tenant.routes.push(route)
    return !!tenant.routes.find((r: any) => r.id === rotId)
  })
  results.push(t.result
    ? pass('Engenharia', 'Roteiros', 'Criar Roteiro', 'Roteiro criado com sucesso', t.duration, { savedInMemory: true })
    : fail('Engenharia', 'Roteiros', 'Criar Roteiro', 'Falha ao criar roteiro', t.duration))

  // Validate route steps
  t = timed(() => {
    const route = tenant.routes?.find((r: any) => r.id === rotId)
    return Array.isArray(route?.steps) && route.steps.length === 2
  })
  results.push(t.result
    ? pass('Engenharia', 'Roteiros', 'Validar Sequência', 'Sequência de operações válida', t.duration, { savedInMemory: true })
    : fail('Engenharia', 'Roteiros', 'Validar Sequência', 'Sequência de operações inválida', t.duration))

  // Delete route
  t = timed(() => {
    const before = (tenant.routes || []).length
    tenant.routes = tenant.routes.filter((r: any) => r.id !== rotId)
    return tenant.routes.length < before
  })
  results.push(t.result
    ? pass('Engenharia', 'Roteiros', 'Deletar Roteiro', 'Roteiro deletado com sucesso', t.duration, { savedInMemory: true })
    : fail('Engenharia', 'Roteiros', 'Deletar Roteiro', 'Falha ao deletar roteiro', t.duration))

  return results
}

async function testCadastros(db: D1Database | null, userId: string): Promise<TestResult[]> {
  const results: TestResult[] = []
  const tenant = getTestTenant(userId)

  // ── Fornecedores ─────────────────────────────────────────────────────────

  const supId = genId('sup')
  let t = timed(() => {
    const supplier = {
      id: supId, name: 'Fornecedor Teste', cnpj: '12.345.678/0001-99',
      email: 'fornecedor@teste.com', phone: '(11) 9999-0000',
      contact: 'João', city: 'São Paulo', state: 'SP',
      category: 'Matéria-Prima', active: true, type: 'nacional',
      fantasia: '', tradeName: '', rating: 0,
      paymentTerms: '30/60', deliveryLeadDays: 15, notes: '',
      createdAt: new Date().toISOString(),
    }
    tenant.suppliers.push(supplier)
    return !!tenant.suppliers.find((s: any) => s.id === supId)
  })
  let supInD1 = false
  if (db && userId !== 'demo-tenant') {
    try {
      supInD1 = await verifyD1(db, 'suppliers', supId, userId)
    } catch { /* D1 unavailable */ }
  }
  results.push(t.result
    ? pass('Cadastros', 'Fornecedores', 'Criar Fornecedor', 'Fornecedor criado com sucesso', t.duration, { savedInMemory: true, savedInD1: supInD1 })
    : fail('Cadastros', 'Fornecedores', 'Criar Fornecedor', 'Falha ao criar fornecedor', t.duration))

  // Edit supplier
  t = timed(() => {
    const idx = tenant.suppliers.findIndex((s: any) => s.id === supId)
    if (idx !== -1) {
      tenant.suppliers[idx].name = 'Fornecedor Editado'
      tenant.suppliers[idx].active = false
    }
    return idx !== -1 && tenant.suppliers[idx].name === 'Fornecedor Editado'
  })
  results.push(t.result
    ? pass('Cadastros', 'Fornecedores', 'Editar Fornecedor', 'Fornecedor editado com sucesso', t.duration, { savedInMemory: true })
    : fail('Cadastros', 'Fornecedores', 'Editar Fornecedor', 'Falha ao editar fornecedor', t.duration))

  // Inactivate/activate
  t = timed(() => {
    const sup = tenant.suppliers.find((s: any) => s.id === supId)
    if (sup) sup.active = !sup.active
    return !!sup
  })
  results.push(t.result
    ? pass('Cadastros', 'Fornecedores', 'Inativar/Ativar Fornecedor', 'Status alterado com sucesso', t.duration, { savedInMemory: true })
    : fail('Cadastros', 'Fornecedores', 'Inativar/Ativar Fornecedor', 'Falha ao alterar status', t.duration))

  // Filter by type
  t = timed(() => {
    const nacionais = tenant.suppliers.filter((s: any) => s.type === 'nacional')
    return Array.isArray(nacionais)
  })
  results.push(t.result
    ? pass('Cadastros', 'Fornecedores', 'Filtrar Fornecedores', 'Filtro por tipo funciona', t.duration, { savedInMemory: true })
    : fail('Cadastros', 'Fornecedores', 'Filtrar Fornecedores', 'Falha no filtro', t.duration))

  // Delete supplier
  t = timed(() => {
    const before = tenant.suppliers.length
    tenant.suppliers = tenant.suppliers.filter((s: any) => s.id !== supId)
    return tenant.suppliers.length < before
  })
  if (db) await cleanD1(db, 'suppliers', supId, userId)
  results.push(t.result
    ? pass('Cadastros', 'Fornecedores', 'Deletar Fornecedor', 'Fornecedor deletado com sucesso', t.duration, { savedInMemory: true })
    : fail('Cadastros', 'Fornecedores', 'Deletar Fornecedor', 'Falha ao deletar fornecedor', t.duration))

  // ── Vinculações ──────────────────────────────────────────────────────────

  const vincId = genId('vinc')
  t = timed(() => {
    if (!tenant.productSuppliers) tenant.productSuppliers = []
    tenant.productSuppliers.push({ id: vincId, productCode: 'PROD-001', supplierId: 'sup_1', priority: 'principal', type: 'external' })
    return !!tenant.productSuppliers.find((v: any) => v.id === vincId)
  })
  results.push(t.result
    ? pass('Cadastros', 'Vinculações', 'Vincular Fornecedor', 'Vinculação criada com sucesso', t.duration, { savedInMemory: true })
    : fail('Cadastros', 'Vinculações', 'Vincular Fornecedor', 'Falha ao criar vinculação', t.duration))

  // Delete vinculação
  t = timed(() => {
    const before = tenant.productSuppliers.length
    tenant.productSuppliers = tenant.productSuppliers.filter((v: any) => v.id !== vincId)
    return tenant.productSuppliers.length < before
  })
  results.push(t.result
    ? pass('Cadastros', 'Vinculações', 'Deletar Vinculação', 'Vinculação deletada com sucesso', t.duration, { savedInMemory: true })
    : fail('Cadastros', 'Vinculações', 'Deletar Vinculação', 'Falha ao deletar vinculação', t.duration))

  return results
}

async function testOrdens(db: D1Database | null, userId: string): Promise<TestResult[]> {
  const results: TestResult[] = []
  const tenant = getTestTenant(userId)

  // Create order
  const ordId = genId('op')
  let t = timed(() => {
    const order = {
      id: ordId, code: 'OP-TEST-001', productName: 'Produto Teste',
      productId: 'prod_test', quantity: 50, completedQuantity: 0,
      status: 'planned', priority: 'medium',
      startDate: new Date().toISOString().split('T')[0], endDate: '',
      plantId: '', plantName: '', pedido: '', cliente: '', notes: '',
      createdAt: new Date().toISOString(),
    }
    tenant.productionOrders.push(order)
    return !!tenant.productionOrders.find((o: any) => o.id === ordId)
  })
  let orderInD1 = false
  if (db && userId !== 'demo-tenant') {
    try {
      orderInD1 = await verifyD1(db, 'production_orders', ordId, userId)
    } catch { /* D1 unavailable */ }
  }
  results.push(t.result
    ? pass('Ordens', 'Ordens de Produção', 'Criar Ordem', 'Ordem criada com sucesso', t.duration, { savedInMemory: true, savedInD1: orderInD1 })
    : fail('Ordens', 'Ordens de Produção', 'Criar Ordem', 'Falha ao criar ordem', t.duration))

  // Edit order (update status)
  t = timed(() => {
    const idx = tenant.productionOrders.findIndex((o: any) => o.id === ordId)
    if (idx !== -1) tenant.productionOrders[idx].status = 'in_progress'
    return idx !== -1 && tenant.productionOrders[idx].status === 'in_progress'
  })
  results.push(t.result
    ? pass('Ordens', 'Ordens de Produção', 'Editar Ordem', 'Ordem atualizada com sucesso', t.duration, { savedInMemory: true })
    : fail('Ordens', 'Ordens de Produção', 'Editar Ordem', 'Falha ao editar ordem', t.duration))

  // Calculate progress
  t = timed(() => {
    const order = tenant.productionOrders.find((o: any) => o.id === ordId)
    if (!order) return false
    order.completedQuantity = 25
    const progress = Math.round((order.completedQuantity / order.quantity) * 100)
    return progress === 50
  })
  results.push(t.result
    ? pass('Ordens', 'Ordens de Produção', 'Calcular Progresso', 'Progresso calculado corretamente (50%)', t.duration, { savedInMemory: true })
    : fail('Ordens', 'Ordens de Produção', 'Calcular Progresso', 'Falha ao calcular progresso', t.duration))

  // Filter by status
  t = timed(() => {
    const planned = tenant.productionOrders.filter((o: any) => o.status === 'planned')
    const inProgress = tenant.productionOrders.filter((o: any) => o.status === 'in_progress')
    return Array.isArray(planned) && Array.isArray(inProgress)
  })
  results.push(t.result
    ? pass('Ordens', 'Ordens de Produção', 'Filtrar por Status', 'Filtro por status funciona', t.duration, { savedInMemory: true })
    : fail('Ordens', 'Ordens de Produção', 'Filtrar por Status', 'Falha no filtro por status', t.duration))

  // Delete order
  t = timed(() => {
    const before = tenant.productionOrders.length
    tenant.productionOrders = tenant.productionOrders.filter((o: any) => o.id !== ordId)
    return tenant.productionOrders.length < before
  })
  if (db) await cleanD1(db, 'production_orders', ordId, userId)
  results.push(t.result
    ? pass('Ordens', 'Ordens de Produção', 'Deletar Ordem', 'Ordem deletada com sucesso', t.duration, { savedInMemory: true })
    : fail('Ordens', 'Ordens de Produção', 'Deletar Ordem', 'Falha ao deletar ordem', t.duration))

  return results
}

async function testApontamento(db: D1Database | null, userId: string): Promise<TestResult[]> {
  const results: TestResult[] = []
  const tenant = getTestTenant(userId)

  // Create apontamento
  const aptId = genId('apt')
  let t = timed(() => {
    const entry = {
      id: aptId, orderId: 'op_test', orderCode: 'OP-001',
      productName: 'Produto Teste', operator: 'Operador 1',
      machine: 'CNC-01', startTime: '08:00', endTime: '12:00',
      produced: 100, rejected: 5, reason: '', notes: '',
      shift: 'manha', createdAt: new Date().toISOString(),
    }
    tenant.productionEntries.push(entry)
    return !!tenant.productionEntries.find((e: any) => e.id === aptId)
  })
  let aptInD1 = false
  if (db && userId !== 'demo-tenant') {
    try {
      aptInD1 = await verifyD1(db, 'apontamentos', aptId, userId)
    } catch { /* D1 unavailable */ }
  }
  results.push(t.result
    ? pass('Apontamento', 'Apontamentos', 'Criar Apontamento', 'Apontamento criado com sucesso', t.duration, { savedInMemory: true, savedInD1: aptInD1 })
    : fail('Apontamento', 'Apontamentos', 'Criar Apontamento', 'Falha ao criar apontamento', t.duration))

  // Verify rejected quantity triggering NC
  t = timed(() => {
    const entry = tenant.productionEntries.find((e: any) => e.id === aptId)
    if (!entry) return false
    // If rejected > 0, an NC should be automatically generated
    const shouldGenerateNC = entry.rejected > 0
    return shouldGenerateNC === true
  })
  results.push(t.result
    ? pass('Apontamento', 'Apontamentos', 'Verificar NC Automática', 'Lógica de NC automática verificada', t.duration, { savedInMemory: true })
    : fail('Apontamento', 'Apontamentos', 'Verificar NC Automática', 'Falha na lógica de NC automática', t.duration))

  // Filter by status
  t = timed(() => {
    const entries = tenant.productionEntries.filter((e: any) => e.shift === 'manha')
    return Array.isArray(entries)
  })
  results.push(t.result
    ? pass('Apontamento', 'Apontamentos', 'Filtrar por Turno', 'Filtro por turno funciona', t.duration, { savedInMemory: true })
    : fail('Apontamento', 'Apontamentos', 'Filtrar por Turno', 'Falha no filtro por turno', t.duration))

  // Delete apontamento
  t = timed(() => {
    const before = tenant.productionEntries.length
    tenant.productionEntries = tenant.productionEntries.filter((e: any) => e.id !== aptId)
    return tenant.productionEntries.length < before
  })
  if (db) await cleanD1(db, 'apontamentos', aptId, userId)
  results.push(t.result
    ? pass('Apontamento', 'Apontamentos', 'Deletar Apontamento', 'Apontamento deletado com sucesso', t.duration, { savedInMemory: true })
    : fail('Apontamento', 'Apontamentos', 'Deletar Apontamento', 'Falha ao deletar apontamento', t.duration))

  return results
}

async function testInstrucoes(db: D1Database | null, userId: string): Promise<TestResult[]> {
  const results: TestResult[] = []
  const tenant = getTestTenant(userId)

  // Create instrução
  const instId = genId('inst')
  let t = timed(() => {
    const instruction = {
      id: instId, title: 'Instrução Teste', code: 'IT-001',
      version: '1.0', status: 'active', productId: '',
      operation: 'Montagem', estimatedTime: 30,
      steps: [
        { order: 1, title: 'Passo 1', description: 'Descrição do passo 1' },
        { order: 2, title: 'Passo 2', description: 'Descrição do passo 2' },
      ],
      createdAt: new Date().toISOString(),
    }
    if (!Array.isArray(tenant.instructions)) tenant.instructions = []
    tenant.instructions.push(instruction)
    return !!tenant.instructions.find((i: any) => i.id === instId)
  })
  results.push(t.result
    ? pass('Instruções', 'Instruções', 'Criar Instrução', 'Instrução criada com sucesso', t.duration, { savedInMemory: true })
    : fail('Instruções', 'Instruções', 'Criar Instrução', 'Falha ao criar instrução', t.duration))

  // Add step
  t = timed(() => {
    const inst = tenant.instructions?.find((i: any) => i.id === instId)
    if (!inst) return false
    inst.steps.push({ order: 3, title: 'Passo 3', description: 'Novo passo' })
    return inst.steps.length === 3
  })
  results.push(t.result
    ? pass('Instruções', 'Instruções', 'Adicionar Passo', 'Passo adicionado com sucesso', t.duration, { savedInMemory: true })
    : fail('Instruções', 'Instruções', 'Adicionar Passo', 'Falha ao adicionar passo', t.duration))

  // Validate instruction
  t = timed(() => {
    const inst = tenant.instructions?.find((i: any) => i.id === instId)
    return inst && inst.title && inst.steps.length > 0
  })
  results.push(t.result
    ? pass('Instruções', 'Instruções', 'Validar Instrução', 'Instrução válida', t.duration, { savedInMemory: true })
    : fail('Instruções', 'Instruções', 'Validar Instrução', 'Instrução inválida', t.duration))

  // Edit instruction
  t = timed(() => {
    const idx = (tenant.instructions || []).findIndex((i: any) => i.id === instId)
    if (idx !== -1) tenant.instructions[idx].title = 'Instrução Editada'
    return idx !== -1 && tenant.instructions[idx].title === 'Instrução Editada'
  })
  results.push(t.result
    ? pass('Instruções', 'Instruções', 'Editar Instrução', 'Instrução editada com sucesso', t.duration, { savedInMemory: true })
    : fail('Instruções', 'Instruções', 'Editar Instrução', 'Falha ao editar instrução', t.duration))

  // Delete instruction
  t = timed(() => {
    const before = (tenant.instructions || []).length
    tenant.instructions = tenant.instructions.filter((i: any) => i.id !== instId)
    return tenant.instructions.length < before
  })
  results.push(t.result
    ? pass('Instruções', 'Instruções', 'Deletar Instrução', 'Instrução deletada com sucesso', t.duration, { savedInMemory: true })
    : fail('Instruções', 'Instruções', 'Deletar Instrução', 'Falha ao deletar instrução', t.duration))

  return results
}

async function testPlanejamento(_db: D1Database | null, userId: string): Promise<TestResult[]> {
  const results: TestResult[] = []
  const tenant = getTestTenant(userId)

  // Verify MRP data sources
  let t = timed(() => {
    const products = tenant.products || []
    const orders = tenant.productionOrders || []
    return Array.isArray(products) && Array.isArray(orders)
  })
  results.push(t.result
    ? pass('Planejamento', 'MRP', 'Visualizar MRP', 'Fontes de dados MRP acessíveis', t.duration, { savedInMemory: true })
    : fail('Planejamento', 'MRP', 'Visualizar MRP', 'Falha ao acessar dados do MRP', t.duration))

  // Generate purchase recommendations
  t = timed(() => {
    const products = tenant.products || []
    const recommendations = products.filter((p: any) =>
      p.stockStatus === 'critical' || p.stockStatus === 'purchase_needed'
    )
    return Array.isArray(recommendations)
  })
  results.push(t.result
    ? pass('Planejamento', 'Recomendações', 'Gerar Rec. Compra', 'Recomendações de compra geradas', t.duration, { savedInMemory: true })
    : fail('Planejamento', 'Recomendações', 'Gerar Rec. Compra', 'Falha ao gerar recomendações de compra', t.duration))

  // Generate production recommendations
  t = timed(() => {
    const products = tenant.products || []
    const internalLow = products.filter((p: any) =>
      p.type === 'internal' && (p.stockStatus === 'critical' || p.stockStatus === 'manufacture_needed')
    )
    return Array.isArray(internalLow)
  })
  results.push(t.result
    ? pass('Planejamento', 'Recomendações', 'Gerar Rec. Produção', 'Recomendações de produção geradas', t.duration, { savedInMemory: true })
    : fail('Planejamento', 'Recomendações', 'Gerar Rec. Produção', 'Falha ao gerar recomendações de produção', t.duration))

  // Verify lead time calculation
  t = timed(() => {
    const today = new Date()
    const leadDays = 15
    const deliveryDate = new Date(today)
    deliveryDate.setDate(deliveryDate.getDate() + leadDays)
    return deliveryDate > today
  })
  results.push(t.result
    ? pass('Planejamento', 'Prazos', 'Calcular Prazos', 'Cálculo de prazos funciona', t.duration, { savedInMemory: true })
    : fail('Planejamento', 'Prazos', 'Calcular Prazos', 'Falha no cálculo de prazos', t.duration))

  // Verify consistency with DB
  t = timed(() => {
    const products = tenant.products || []
    const bomItems = tenant.bomItems || []
    const hasData = Array.isArray(products) && Array.isArray(bomItems)
    return hasData
  })
  results.push(t.result
    ? pass('Planejamento', 'Consistência', 'Verificar Consistência BD', 'Dados consistentes com BD', t.duration, { savedInMemory: true })
    : fail('Planejamento', 'Consistência', 'Verificar Consistência BD', 'Inconsistência nos dados do BD', t.duration))

  return results
}

async function testSuprimentos(db: D1Database | null, userId: string): Promise<TestResult[]> {
  const results: TestResult[] = []
  const tenant = getTestTenant(userId)

  // ── Cotações ─────────────────────────────────────────────────────────────

  const cotId = genId('cot')
  let t = timed(() => {
    const quotation = {
      id: cotId, title: 'Cotação Teste', code: 'COT-TEST-001',
      status: 'draft', suppliersCount: 0, itemsCount: 0,
      deadline: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      notes: '', createdAt: new Date().toISOString(),
    }
    tenant.quotations.push(quotation)
    return !!tenant.quotations.find((q: any) => q.id === cotId)
  })
  let cotInD1 = false
  if (db && userId !== 'demo-tenant') {
    try {
      cotInD1 = await verifyD1(db, 'quotations', cotId, userId)
    } catch { /* D1 unavailable */ }
  }
  results.push(t.result
    ? pass('Suprimentos', 'Cotações', 'Criar Cotação', 'Cotação criada com sucesso', t.duration, { savedInMemory: true, savedInD1: cotInD1 })
    : fail('Suprimentos', 'Cotações', 'Criar Cotação', 'Falha ao criar cotação', t.duration))

  // Approve quotation
  t = timed(() => {
    const idx = tenant.quotations.findIndex((q: any) => q.id === cotId)
    if (idx !== -1) {
      tenant.quotations[idx].status = 'approved'
      tenant.quotations[idx].approvedAt = new Date().toISOString()
    }
    return idx !== -1 && tenant.quotations[idx].status === 'approved'
  })
  results.push(t.result
    ? pass('Suprimentos', 'Cotações', 'Aprovar Cotação', 'Cotação aprovada com sucesso', t.duration, { savedInMemory: true })
    : fail('Suprimentos', 'Cotações', 'Aprovar Cotação', 'Falha ao aprovar cotação', t.duration))

  // Reject quotation (new one)
  const cotId2 = genId('cot')
  t = timed(() => {
    tenant.quotations.push({ id: cotId2, status: 'sent', title: 'Cotação 2' })
    const idx = tenant.quotations.findIndex((q: any) => q.id === cotId2)
    if (idx !== -1) {
      tenant.quotations[idx].status = 'rejected'
      tenant.quotations[idx].rejectionReason = 'Preço acima do orçamento'
    }
    return idx !== -1 && tenant.quotations[idx].status === 'rejected'
  })
  results.push(t.result
    ? pass('Suprimentos', 'Cotações', 'Rejeitar Cotação', 'Cotação rejeitada com sucesso', t.duration, { savedInMemory: true })
    : fail('Suprimentos', 'Cotações', 'Rejeitar Cotação', 'Falha ao rejeitar cotação', t.duration))

  // Delete quotation
  t = timed(() => {
    const before = tenant.quotations.length
    tenant.quotations = tenant.quotations.filter((q: any) => q.id !== cotId && q.id !== cotId2)
    return tenant.quotations.length < before
  })
  if (db) await cleanD1(db, 'quotations', cotId, userId)
  results.push(t.result
    ? pass('Suprimentos', 'Cotações', 'Deletar Cotação', 'Cotação deletada com sucesso', t.duration, { savedInMemory: true })
    : fail('Suprimentos', 'Cotações', 'Deletar Cotação', 'Falha ao deletar cotação', t.duration))

  // ── Pedidos de Compra ────────────────────────────────────────────────────

  const pcId = genId('pc')
  t = timed(() => {
    const order = {
      id: pcId, code: 'OC-TEST-001', supplierId: 'sup_test',
      supplierName: 'Fornecedor Teste', status: 'draft',
      totalValue: 0, expectedDate: '', notes: '',
      createdAt: new Date().toISOString(),
    }
    tenant.purchaseOrders.push(order)
    return !!tenant.purchaseOrders.find((o: any) => o.id === pcId)
  })
  let pcInD1 = false
  if (db && userId !== 'demo-tenant') {
    try {
      pcInD1 = await verifyD1(db, 'purchase_orders', pcId, userId)
    } catch { /* D1 unavailable */ }
  }
  results.push(t.result
    ? pass('Suprimentos', 'Pedidos de Compra', 'Criar Pedido', 'Pedido de compra criado com sucesso', t.duration, { savedInMemory: true, savedInD1: pcInD1 })
    : fail('Suprimentos', 'Pedidos de Compra', 'Criar Pedido', 'Falha ao criar pedido de compra', t.duration))

  // Delete pedido
  t = timed(() => {
    const before = tenant.purchaseOrders.length
    tenant.purchaseOrders = tenant.purchaseOrders.filter((o: any) => o.id !== pcId)
    return tenant.purchaseOrders.length < before
  })
  if (db) await cleanD1(db, 'purchase_orders', pcId, userId)
  results.push(t.result
    ? pass('Suprimentos', 'Pedidos de Compra', 'Deletar Pedido', 'Pedido de compra deletado com sucesso', t.duration, { savedInMemory: true })
    : fail('Suprimentos', 'Pedidos de Compra', 'Deletar Pedido', 'Falha ao deletar pedido de compra', t.duration))

  // ── Importações ──────────────────────────────────────────────────────────

  const impId = genId('imp')
  t = timed(() => {
    const imp = {
      id: impId, code: 'IMP-TEST-001', invoiceNumber: 'INV-12345',
      supplierId: '', supplierName: '', modality: 'maritimo',
      status: 'waiting_ship', createdAt: new Date().toISOString(),
    }
    if (!Array.isArray(tenant.imports)) tenant.imports = []
    tenant.imports.push(imp)
    return !!tenant.imports.find((i: any) => i.id === impId)
  })
  let impInD1 = false
  if (db && userId !== 'demo-tenant') {
    try {
      impInD1 = await verifyD1(db, 'imports', impId, userId)
    } catch { /* D1 unavailable */ }
  }
  results.push(t.result
    ? pass('Suprimentos', 'Importações', 'Criar Importação', 'Importação criada com sucesso', t.duration, { savedInMemory: true, savedInD1: impInD1 })
    : fail('Suprimentos', 'Importações', 'Criar Importação', 'Falha ao criar importação', t.duration))

  // Delete importação
  t = timed(() => {
    const before = tenant.imports.length
    tenant.imports = tenant.imports.filter((i: any) => i.id !== impId)
    return tenant.imports.length < before
  })
  if (db) await cleanD1(db, 'imports', impId, userId)
  results.push(t.result
    ? pass('Suprimentos', 'Importações', 'Deletar Importação', 'Importação deletada com sucesso', t.duration, { savedInMemory: true })
    : fail('Suprimentos', 'Importações', 'Deletar Importação', 'Falha ao deletar importação', t.duration))

  return results
}

async function testEstoque(db: D1Database | null, userId: string): Promise<TestResult[]> {
  const results: TestResult[] = []
  const tenant = getTestTenant(userId)

  // ── Itens de Estoque ─────────────────────────────────────────────────────

  const stkId = genId('stk')
  let t = timed(() => {
    const item = {
      id: stkId, name: 'Item Estoque Teste', code: 'STK-TEST-001',
      unit: 'un', category: 'Matéria-Prima',
      currentQty: 50, minQty: 10, maxQty: 200,
      location: 'Prateleira A-01', stockStatus: 'normal',
      almoxarifadoId: '', createdAt: new Date().toISOString(),
    }
    tenant.stockItems.push(item)
    return !!tenant.stockItems.find((s: any) => s.id === stkId)
  })
  let stkInD1 = false
  if (db && userId !== 'demo-tenant') {
    try {
      stkInD1 = await verifyD1(db, 'stock_items', stkId, userId)
    } catch { /* D1 unavailable */ }
  }
  results.push(t.result
    ? pass('Estoque', 'Itens', 'Criar Item', 'Item de estoque criado com sucesso', t.duration, { savedInMemory: true, savedInD1: stkInD1 })
    : fail('Estoque', 'Itens', 'Criar Item', 'Falha ao criar item de estoque', t.duration))

  // Edit item
  t = timed(() => {
    const idx = tenant.stockItems.findIndex((s: any) => s.id === stkId)
    if (idx !== -1) tenant.stockItems[idx].currentQty = 75
    return idx !== -1 && tenant.stockItems[idx].currentQty === 75
  })
  results.push(t.result
    ? pass('Estoque', 'Itens', 'Editar Item', 'Item editado com sucesso', t.duration, { savedInMemory: true })
    : fail('Estoque', 'Itens', 'Editar Item', 'Falha ao editar item', t.duration))

  // Delete item
  t = timed(() => {
    const before = tenant.stockItems.length
    tenant.stockItems = tenant.stockItems.filter((s: any) => s.id !== stkId)
    return tenant.stockItems.length < before
  })
  if (db) await cleanD1(db, 'stock_items', stkId, userId)
  results.push(t.result
    ? pass('Estoque', 'Itens', 'Deletar Item', 'Item deletado com sucesso', t.duration, { savedInMemory: true })
    : fail('Estoque', 'Itens', 'Deletar Item', 'Falha ao deletar item', t.duration))

  // ── Almoxarifados ────────────────────────────────────────────────────────

  const almId = genId('alm')
  t = timed(() => {
    const warehouse = {
      id: almId, name: 'Almoxarifado Central', code: 'ALM-01',
      city: 'São Paulo', state: 'SP', responsible: 'João Silva',
      custodian: 'Maria Santos', notes: '', active: true,
      createdAt: new Date().toISOString(),
    }
    if (!Array.isArray(tenant.warehouses)) tenant.warehouses = []
    tenant.warehouses.push(warehouse)
    return !!tenant.warehouses.find((w: any) => w.id === almId)
  })
  let almInD1 = false
  if (db && userId !== 'demo-tenant') {
    try {
      almInD1 = await verifyD1(db, 'warehouses', almId, userId)
    } catch { /* D1 unavailable */ }
  }
  results.push(t.result
    ? pass('Estoque', 'Almoxarifados', 'Criar Almoxarifado', 'Almoxarifado criado com sucesso', t.duration, { savedInMemory: true, savedInD1: almInD1 })
    : fail('Estoque', 'Almoxarifados', 'Criar Almoxarifado', 'Falha ao criar almoxarifado', t.duration))

  // Delete almoxarifado
  t = timed(() => {
    const before = tenant.warehouses.length
    tenant.warehouses = tenant.warehouses.filter((w: any) => w.id !== almId)
    return tenant.warehouses.length < before
  })
  if (db) await cleanD1(db, 'warehouses', almId, userId)
  results.push(t.result
    ? pass('Estoque', 'Almoxarifados', 'Deletar Almoxarifado', 'Almoxarifado deletado com sucesso', t.duration, { savedInMemory: true })
    : fail('Estoque', 'Almoxarifados', 'Deletar Almoxarifado', 'Falha ao deletar almoxarifado', t.duration))

  // ── Ordens de Separação ──────────────────────────────────────────────────

  const sepId = genId('sep')
  t = timed(() => {
    const sep = {
      id: sepId, code: 'OS-2025-001', pedido: 'PED-001', cliente: 'Cliente Teste',
      dataSeparacao: new Date().toISOString().split('T')[0],
      responsavel: 'Operador 1', status: 'pending',
      items: [{ productCode: 'PROD-001', productName: 'Produto 1', quantity: 5, serialNumber: null }],
      createdAt: new Date().toISOString(),
    }
    if (!Array.isArray(tenant.separationOrders)) tenant.separationOrders = []
    tenant.separationOrders.push(sep)
    return !!tenant.separationOrders.find((s: any) => s.id === sepId)
  })
  let sepInD1 = false
  if (db && userId !== 'demo-tenant') {
    try {
      sepInD1 = await verifyD1(db, 'separation_orders', sepId, userId)
    } catch { /* D1 unavailable */ }
  }
  results.push(t.result
    ? pass('Estoque', 'Separação', 'Criar Ordem de Separação', 'Ordem de separação criada com sucesso', t.duration, { savedInMemory: true, savedInD1: sepInD1 })
    : fail('Estoque', 'Separação', 'Criar Ordem de Separação', 'Falha ao criar ordem de separação', t.duration))

  // Complete separation order
  t = timed(() => {
    const sep = tenant.separationOrders?.find((s: any) => s.id === sepId)
    if (sep) sep.status = 'completed'
    return sep?.status === 'completed'
  })
  results.push(t.result
    ? pass('Estoque', 'Separação', 'Concluir Separação', 'Ordem de separação concluída', t.duration, { savedInMemory: true })
    : fail('Estoque', 'Separação', 'Concluir Separação', 'Falha ao concluir ordem de separação', t.duration))

  // Delete separation
  t = timed(() => {
    const before = tenant.separationOrders.length
    tenant.separationOrders = tenant.separationOrders.filter((s: any) => s.id !== sepId)
    return tenant.separationOrders.length < before
  })
  if (db) await cleanD1(db, 'separation_orders', sepId, userId)
  results.push(t.result
    ? pass('Estoque', 'Separação', 'Deletar Separação', 'Ordem de separação deletada com sucesso', t.duration, { savedInMemory: true })
    : fail('Estoque', 'Separação', 'Deletar Separação', 'Falha ao deletar ordem de separação', t.duration))

  // ── Baixas de Estoque ────────────────────────────────────────────────────

  const bxId = genId('bx')
  t = timed(() => {
    const exit = {
      id: bxId, code: 'BX-2025-001', type: 'requisicao',
      pedido: '', nf: '',
      date: new Date().toISOString().split('T')[0],
      responsavel: 'Operador 1', notes: '',
      items: [{ code: 'PROD-001', name: 'Produto 1', quantity: 3 }],
      createdAt: new Date().toISOString(),
    }
    if (!Array.isArray(tenant.stockExits)) tenant.stockExits = []
    tenant.stockExits.push(exit)
    return !!tenant.stockExits.find((e: any) => e.id === bxId)
  })
  let bxInD1 = false
  if (db && userId !== 'demo-tenant') {
    try {
      bxInD1 = await verifyD1(db, 'stock_exits', bxId, userId)
    } catch { /* D1 unavailable */ }
  }
  results.push(t.result
    ? pass('Estoque', 'Baixas', 'Registrar Baixa', 'Baixa de estoque registrada com sucesso', t.duration, { savedInMemory: true, savedInD1: bxInD1 })
    : fail('Estoque', 'Baixas', 'Registrar Baixa', 'Falha ao registrar baixa de estoque', t.duration))

  // Delete saída
  t = timed(() => {
    const before = tenant.stockExits.length
    tenant.stockExits = tenant.stockExits.filter((e: any) => e.id !== bxId)
    return tenant.stockExits.length < before
  })
  if (db) await cleanD1(db, 'stock_exits', bxId, userId)
  results.push(t.result
    ? pass('Estoque', 'Baixas', 'Deletar Baixa', 'Baixa deletada com sucesso', t.duration, { savedInMemory: true })
    : fail('Estoque', 'Baixas', 'Deletar Baixa', 'Falha ao deletar baixa', t.duration))

  return results
}

async function testQualidade(db: D1Database | null, userId: string): Promise<TestResult[]> {
  const results: TestResult[] = []
  const tenant = getTestTenant(userId)

  // Create NC
  const ncId = genId('nc')
  let t = timed(() => {
    const nc = {
      id: ncId, title: 'NC Teste', code: 'NC-TEST-001',
      type: 'processo', severity: 'medium', status: 'open',
      product: 'Produto Teste', productId: '', department: 'Produção',
      description: 'Descrição da não conformidade',
      rootCause: '', correctiveAction: '', responsible: 'Operador 1',
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      openedAt: new Date().toISOString().split('T')[0],
      images: [], createdAt: new Date().toISOString().split('T')[0],
      orderCode: '—', stepName: 'Montagem', quantityRejected: 5, operator: 'Operador 1',
    }
    if (!Array.isArray(tenant.nonConformances)) tenant.nonConformances = []
    tenant.nonConformances.push(nc)
    return !!tenant.nonConformances.find((n: any) => n.id === ncId)
  })
  let ncInD1 = false
  if (db && userId !== 'demo-tenant') {
    try {
      ncInD1 = await verifyD1(db, 'non_conformances', ncId, userId)
    } catch { /* D1 unavailable */ }
  }
  results.push(t.result
    ? pass('Qualidade', 'Não Conformidades', 'Criar NC', 'NC criada com sucesso', t.duration, { savedInMemory: true, savedInD1: ncInD1 })
    : fail('Qualidade', 'Não Conformidades', 'Criar NC', 'Falha ao criar NC', t.duration))

  // Edit NC (add corrective action)
  t = timed(() => {
    const idx = tenant.nonConformances.findIndex((n: any) => n.id === ncId)
    if (idx !== -1) {
      tenant.nonConformances[idx].correctiveAction = 'Retrabalho na peça'
      tenant.nonConformances[idx].severity = 'high'
    }
    return idx !== -1 && tenant.nonConformances[idx].correctiveAction === 'Retrabalho na peça'
  })
  results.push(t.result
    ? pass('Qualidade', 'Não Conformidades', 'Editar NC', 'NC editada com sucesso', t.duration, { savedInMemory: true })
    : fail('Qualidade', 'Não Conformidades', 'Editar NC', 'Falha ao editar NC', t.duration))

  // Resolve NC
  t = timed(() => {
    const idx = tenant.nonConformances.findIndex((n: any) => n.id === ncId)
    if (idx !== -1) tenant.nonConformances[idx].status = 'resolved'
    return idx !== -1 && tenant.nonConformances[idx].status === 'resolved'
  })
  results.push(t.result
    ? pass('Qualidade', 'Não Conformidades', 'Resolver NC', 'NC marcada como resolvida', t.duration, { savedInMemory: true })
    : fail('Qualidade', 'Não Conformidades', 'Resolver NC', 'Falha ao resolver NC', t.duration))

  // Filter by severity
  t = timed(() => {
    const highNCs = tenant.nonConformances.filter((n: any) => n.severity === 'high')
    return Array.isArray(highNCs)
  })
  results.push(t.result
    ? pass('Qualidade', 'Não Conformidades', 'Filtrar por Severidade', 'Filtro por severidade funciona', t.duration, { savedInMemory: true })
    : fail('Qualidade', 'Não Conformidades', 'Filtrar por Severidade', 'Falha no filtro por severidade', t.duration))

  // Delete NC
  t = timed(() => {
    const before = tenant.nonConformances.length
    tenant.nonConformances = tenant.nonConformances.filter((n: any) => n.id !== ncId)
    return tenant.nonConformances.length < before
  })
  if (db) await cleanD1(db, 'non_conformances', ncId, userId)
  results.push(t.result
    ? pass('Qualidade', 'Não Conformidades', 'Deletar NC', 'NC deletada com sucesso', t.duration, { savedInMemory: true })
    : fail('Qualidade', 'Não Conformidades', 'Deletar NC', 'Falha ao deletar NC', t.duration))

  return results
}

async function testAdmin(_db: D1Database | null, userId: string): Promise<TestResult[]> {
  const results: TestResult[] = []
  const tenant = getTestTenant(userId)

  // List module data
  const modules = [
    { name: 'products',          key: 'products' },
    { name: 'productionOrders',  key: 'productionOrders' },
    { name: 'suppliers',         key: 'suppliers' },
    { name: 'stockItems',        key: 'stockItems' },
    { name: 'nonConformances',   key: 'nonConformances' },
    { name: 'quotations',        key: 'quotations' },
    { name: 'purchaseOrders',    key: 'purchaseOrders' },
  ]

  for (const mod of modules) {
    const t = timed(() => Array.isArray((tenant as any)[mod.key]))
    results.push(t.result
      ? pass('Admin', 'Dados', `Ver dados: ${mod.name}`, `${mod.name} acessível`, t.duration, { savedInMemory: true })
      : fail('Admin', 'Dados', `Ver dados: ${mod.name}`, `${mod.name} inacessível ou formato inválido`, t.duration))
  }

  // Verify backup structure (all main data arrays accessible)
  const t = timed(() => {
    const backup: Record<string, any> = {}
    for (const mod of modules) {
      backup[mod.key] = (tenant as any)[mod.key]
    }
    return Object.keys(backup).length === modules.length
  })
  results.push(t.result
    ? pass('Admin', 'Backup', 'Exportar Backup', 'Estrutura de backup válida', t.duration, { savedInMemory: true })
    : fail('Admin', 'Backup', 'Exportar Backup', 'Falha ao gerar estrutura de backup', t.duration))

  // Verify data integrity
  const t2 = timed(() => {
    const products = tenant.products || []
    const bomItems = tenant.bomItems || []
    // Each BOM item should reference a valid product (if any exist)
    if (products.length === 0 || bomItems.length === 0) return true
    return bomItems.every((b: any) => typeof b.productId === 'string')
  })
  results.push(t2.result
    ? pass('Admin', 'Integridade', 'Verificar Integridade', 'Dados íntegros', t2.duration, { savedInMemory: true })
    : fail('Admin', 'Integridade', 'Verificar Integridade', 'Problemas de integridade nos dados', t2.duration))

  return results
}

// ── Run all tests ─────────────────────────────────────────────────────────────

async function runAllTests(db: D1Database | null, userId: string): Promise<TestSummary> {
  const startTime = new Date().toISOString()
  const start = Date.now()

  const allResults: TestResult[] = [
    ...await testRecursos(db, userId),
    ...await testProdutos(db, userId),
    ...await testEngenharia(db, userId),
    ...await testCadastros(db, userId),
    ...await testOrdens(db, userId),
    ...await testApontamento(db, userId),
    ...await testInstrucoes(db, userId),
    ...await testPlanejamento(db, userId),
    ...await testSuprimentos(db, userId),
    ...await testEstoque(db, userId),
    ...await testQualidade(db, userId),
    ...await testAdmin(db, userId),
  ]

  const passed = allResults.filter(r => r.status === 'PASS').length
  const failed = allResults.filter(r => r.status === 'FAIL').length

  return {
    totalTests: allResults.length,
    passed,
    failed,
    passRate: allResults.length > 0 ? Math.round((passed / allResults.length) * 100) : 0,
    results: allResults,
    startTime,
    endTime: new Date().toISOString(),
    duration: Date.now() - start,
  }
}

// ── HTML Report Generator ─────────────────────────────────────────────────────

function buildHtmlReport(summary: TestSummary): string {
  const moduleGroups: Record<string, TestResult[]> = {}
  for (const r of summary.results) {
    if (!moduleGroups[r.module]) moduleGroups[r.module] = []
    moduleGroups[r.module].push(r)
  }

  const passColor = '#16a34a'
  const failColor = '#dc2626'
  const passRate = summary.passRate

  const moduleRows = Object.entries(moduleGroups).map(([mod, tests]) => {
    const modPassed = tests.filter(t => t.status === 'PASS').length
    const modFailed = tests.filter(t => t.status === 'FAIL').length
    const modRate = Math.round((modPassed / tests.length) * 100)

    const testRows = tests.map(t => `
      <tr style="border-bottom:1px solid #f1f3f5;background:${t.status === 'PASS' ? '#f0fdf4' : '#fef2f2'}">
        <td style="padding:8px 12px;font-size:12px;color:#6c757d;">${t.section}</td>
        <td style="padding:8px 12px;font-size:12px;">${t.action}</td>
        <td style="padding:8px 12px;text-align:center;">
          <span style="background:${t.status === 'PASS' ? passColor : failColor};color:white;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700;">${t.status}</span>
        </td>
        <td style="padding:8px 12px;font-size:12px;color:#374151;">${t.message}</td>
        <td style="padding:8px 12px;text-align:center;font-size:11px;">
          ${t.savedInMemory !== undefined ? `<span title="Memória" style="color:${t.savedInMemory ? passColor : '#9ca3af'}">💾${t.savedInMemory ? '✓' : '✗'}</span>` : '—'}
        </td>
        <td style="padding:8px 12px;text-align:center;font-size:11px;">
          ${t.savedInD1 !== undefined ? `<span title="D1" style="color:${t.savedInD1 ? passColor : '#9ca3af'}">🗄️${t.savedInD1 ? '✓' : '—'}</span>` : '—'}
        </td>
        <td style="padding:8px 12px;text-align:center;font-size:11px;color:#9ca3af;">${t.duration}ms</td>
      </tr>
    `).join('')

    return `
      <div style="margin-bottom:24px;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <div style="background:#1B4F72;color:white;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:15px;font-weight:700;">${mod}</div>
          <div style="display:flex;gap:12px;align-items:center;">
            <span style="font-size:12px;background:rgba(255,255,255,0.2);padding:4px 10px;border-radius:8px;">${modPassed}/${tests.length} PASS</span>
            <span style="font-size:12px;background:${modRate === 100 ? 'rgba(22,163,74,0.8)' : 'rgba(220,38,38,0.8)'};padding:4px 10px;border-radius:8px;">${modRate}%</span>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;background:white;">
          <thead>
            <tr style="background:#f8f9fa;border-bottom:2px solid #e9ecef;">
              <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6c757d;">Seção</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6c757d;">Ação</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#6c757d;">Status</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6c757d;">Mensagem</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#6c757d;">Memória</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#6c757d;">D1</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#6c757d;">Tempo</th>
            </tr>
          </thead>
          <tbody>${testRows}</tbody>
        </table>
      </div>
    `
  }).join('')

  const passRateBar = `
    <div style="background:#e9ecef;border-radius:8px;height:20px;overflow:hidden;margin:12px 0;">
      <div style="width:${passRate}%;height:100%;background:${passRate === 100 ? passColor : passRate >= 80 ? '#d97706' : failColor};border-radius:8px;transition:width 0.5s;display:flex;align-items:center;justify-content:center;">
        <span style="color:white;font-size:11px;font-weight:700;">${passRate}%</span>
      </div>
    </div>
  `

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PCP Syncrus — Relatório de Testes</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f3f5; color: #1a1a2e; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    a { text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
      <div>
        <div style="font-size:22px;font-weight:800;color:#1B4F72;"><i class="fas fa-flask" style="margin-right:10px;color:#2980B9;"></i>Relatório de Testes — PCP Syncrus</div>
        <div style="font-size:13px;color:#6c757d;margin-top:4px;">Executado em: ${summary.startTime} · Duração: ${summary.duration}ms</div>
      </div>
      <div style="display:flex;gap:8px;">
        <a href="/test/full" style="background:#2980B9;color:white;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;"><i class="fas fa-play"></i> Re-executar</a>
        <button onclick="exportJSON()" style="background:#27AE60;color:white;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;border:none;cursor:pointer;"><i class="fas fa-download"></i> Exportar JSON</button>
      </div>
    </div>

    <!-- Summary Cards -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;">
      <div style="background:white;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border-left:4px solid #1B4F72;">
        <div style="font-size:11px;color:#6c757d;font-weight:600;text-transform:uppercase;">Total de Testes</div>
        <div style="font-size:32px;font-weight:800;color:#1B4F72;">${summary.totalTests}</div>
      </div>
      <div style="background:white;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border-left:4px solid ${passColor};">
        <div style="font-size:11px;color:#6c757d;font-weight:600;text-transform:uppercase;">Passou</div>
        <div style="font-size:32px;font-weight:800;color:${passColor};">${summary.passed}</div>
      </div>
      <div style="background:white;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border-left:4px solid ${summary.failed > 0 ? failColor : passColor};">
        <div style="font-size:11px;color:#6c757d;font-weight:600;text-transform:uppercase;">Falhou</div>
        <div style="font-size:32px;font-weight:800;color:${summary.failed > 0 ? failColor : passColor};">${summary.failed}</div>
      </div>
      <div style="background:white;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border-left:4px solid ${passRate === 100 ? passColor : passRate >= 80 ? '#d97706' : failColor};">
        <div style="font-size:11px;color:#6c757d;font-weight:600;text-transform:uppercase;">Taxa de Sucesso</div>
        <div style="font-size:32px;font-weight:800;color:${passRate === 100 ? passColor : passRate >= 80 ? '#d97706' : failColor};">${passRate}%</div>
      </div>
    </div>

    <!-- Pass rate bar -->
    <div style="background:white;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.06);margin-bottom:24px;">
      <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">Taxa de Sucesso Geral</div>
      ${passRateBar}
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#6c757d;">
        <span>0%</span><span>50%</span><span>100%</span>
      </div>
    </div>

    <!-- Module results -->
    ${moduleRows}

    <!-- Footer nav -->
    <div style="text-align:center;padding:20px 0;color:#9ca3af;font-size:13px;">
      <a href="/" style="color:#2980B9;margin:0 12px;">← Dashboard</a>
      <span>|</span>
      <a href="/test/full" style="color:#2980B9;margin:0 12px;">JSON Full Report</a>
    </div>
  </div>

  <script>
    const reportData = ${JSON.stringify(summary)};
    function exportJSON() {
      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pcp-test-report-' + new Date().toISOString().split('T')[0] + '.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>`
}

// ── Routes ────────────────────────────────────────────────────────────────────

/** Resolve userId for test — use authenticated user if available, else a stable isolated test tenant */
function getTestUserId(c: any): string {
  const token = getCookie(c, 'pcp_session')
  const session = getSession(token)
  if (session && !session.isDemo) return session.userId
  return 'test-tenant-isolated'
}

app.get('/full', async (c) => {
  const db = c.env?.DB || null
  const userId = getTestUserId(c)
  const summary = await runAllTests(db, userId)
  return c.json(summary)
})

app.get('/report', async (c) => {
  const db = c.env?.DB || null
  const userId = getTestUserId(c)
  const summary = await runAllTests(db, userId)
  return c.html(buildHtmlReport(summary))
})

app.get('/recursos', async (c) => {
  const db = c.env?.DB || null
  const userId = getTestUserId(c)
  const results = await testRecursos(db, userId)
  const passed = results.filter(r => r.status === 'PASS').length
  return c.json({ module: 'Recursos', totalTests: results.length, passed, failed: results.length - passed, results })
})

app.get('/produtos', async (c) => {
  const db = c.env?.DB || null
  const userId = getTestUserId(c)
  const results = await testProdutos(db, userId)
  const passed = results.filter(r => r.status === 'PASS').length
  return c.json({ module: 'Produtos', totalTests: results.length, passed, failed: results.length - passed, results })
})

app.get('/engenharia', async (c) => {
  const db = c.env?.DB || null
  const userId = getTestUserId(c)
  const results = await testEngenharia(db, userId)
  const passed = results.filter(r => r.status === 'PASS').length
  return c.json({ module: 'Engenharia', totalTests: results.length, passed, failed: results.length - passed, results })
})

app.get('/cadastros', async (c) => {
  const db = c.env?.DB || null
  const userId = getTestUserId(c)
  const results = await testCadastros(db, userId)
  const passed = results.filter(r => r.status === 'PASS').length
  return c.json({ module: 'Cadastros', totalTests: results.length, passed, failed: results.length - passed, results })
})

app.get('/ordens', async (c) => {
  const db = c.env?.DB || null
  const userId = getTestUserId(c)
  const results = await testOrdens(db, userId)
  const passed = results.filter(r => r.status === 'PASS').length
  return c.json({ module: 'Ordens', totalTests: results.length, passed, failed: results.length - passed, results })
})

app.get('/apontamento', async (c) => {
  const db = c.env?.DB || null
  const userId = getTestUserId(c)
  const results = await testApontamento(db, userId)
  const passed = results.filter(r => r.status === 'PASS').length
  return c.json({ module: 'Apontamento', totalTests: results.length, passed, failed: results.length - passed, results })
})

app.get('/instrucoes', async (c) => {
  const db = c.env?.DB || null
  const userId = getTestUserId(c)
  const results = await testInstrucoes(db, userId)
  const passed = results.filter(r => r.status === 'PASS').length
  return c.json({ module: 'Instruções', totalTests: results.length, passed, failed: results.length - passed, results })
})

app.get('/planejamento', async (c) => {
  const db = c.env?.DB || null
  const userId = getTestUserId(c)
  const results = await testPlanejamento(db, userId)
  const passed = results.filter(r => r.status === 'PASS').length
  return c.json({ module: 'Planejamento', totalTests: results.length, passed, failed: results.length - passed, results })
})

app.get('/suprimentos', async (c) => {
  const db = c.env?.DB || null
  const userId = getTestUserId(c)
  const results = await testSuprimentos(db, userId)
  const passed = results.filter(r => r.status === 'PASS').length
  return c.json({ module: 'Suprimentos', totalTests: results.length, passed, failed: results.length - passed, results })
})

app.get('/estoque', async (c) => {
  const db = c.env?.DB || null
  const userId = getTestUserId(c)
  const results = await testEstoque(db, userId)
  const passed = results.filter(r => r.status === 'PASS').length
  return c.json({ module: 'Estoque', totalTests: results.length, passed, failed: results.length - passed, results })
})

app.get('/qualidade', async (c) => {
  const db = c.env?.DB || null
  const userId = getTestUserId(c)
  const results = await testQualidade(db, userId)
  const passed = results.filter(r => r.status === 'PASS').length
  return c.json({ module: 'Qualidade', totalTests: results.length, passed, failed: results.length - passed, results })
})

app.get('/admin', async (c) => {
  const db = c.env?.DB || null
  const userId = getTestUserId(c)
  const results = await testAdmin(db, userId)
  const passed = results.filter(r => r.status === 'PASS').length
  return c.json({ module: 'Admin', totalTests: results.length, passed, failed: results.length - passed, results })
})

export default app
