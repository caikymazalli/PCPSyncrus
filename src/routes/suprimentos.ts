import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxUserId, getCtxEmpresaId } from '../sessionHelper'
import { genId, dbInsert, dbInsertWithRetry, dbUpdate, dbDelete, ok, err } from '../dbHelpers'
import { tenants, markTenantModified } from '../userStore'

const app = new Hono()

/**
 * Escapar string para JSON de forma segura
 */
function escapeJsonString(str: string): string {
  if (typeof str !== 'string') return ''

  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\b/g, '\\b')
    .replace(/\f/g, '\\f')
}

/**
 * Serializar objeto para JSON de forma segura
 */
function safeJsonStringify(obj: any): string {
  try {
    const jsonStr = JSON.stringify(obj)
    JSON.parse(jsonStr)
    return jsonStr
  } catch (e) {
    console.error('[JSON] Erro ao stringify:', (e as any).message)
    return '[]'
  }
}

/**
 * Serializar quotations para JSON de forma segura
 */
function safeStringifyQuotations(quotations: any[]): string {
  try {
    const jsonStr = JSON.stringify(quotations)
    JSON.parse(jsonStr)
    console.log('[SUPRIMENTOS] JSON válido gerado:', jsonStr.length, 'bytes')
    return jsonStr
  } catch (e) {
    console.error('[SUPRIMENTOS] Erro ao stringify quotations:', (e as any).message)
    return '[]'
  }
}

// ── Rota principal do módulo Suprimentos ──────────────────────────────────────
app.get('/', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const mockData = tenant
  const quotations = (mockData as any).quotations || []
  const purchaseOrders = (mockData as any).purchaseOrders || []
  const suppliers = (mockData as any).suppliers || []
  const stockItems = (mockData as any).stockItems || []
  const products = (mockData as any).products || []
  const imports = (mockData as any).imports || []

  const statusInfo: Record<string, { label: string, color: string, bg: string }> = {
    sent:                  { label: 'Enviada',             color: '#3498DB', bg: '#d1ecf1' },
    awaiting_responses:    { label: 'Aguard. Respostas',   color: '#d97706', bg: '#fffbeb' },
    with_responses:        { label: 'Com Respostas',       color: '#7c3aed', bg: '#f5f3ff' },
    pending_approval:      { label: 'Pend. Aprovação',     color: '#dc2626', bg: '#fef2f2' },
    approved:              { label: 'Aprovada',            color: '#16a34a', bg: '#f0fdf4' },
    cancelled:             { label: 'Cancelada',           color: '#6c757d', bg: '#e2e3e5' },
    rejected:              { label: 'Negada',              color: '#dc2626', bg: '#fef2f2' },
    awaiting_negotiation:  { label: 'Em Negociação',       color: '#2563eb', bg: '#eff6ff' },
  }

  const pcStatusInfo: Record<string, { label: string, badge: string }> = {
    pending_approval: { label: 'Pend. Aprovação', badge: 'badge-warning' },
    pending:    { label: 'Pendente',     badge: 'badge-warning' },
    confirmed:  { label: 'Confirmado',   badge: 'badge-info' },
    in_transit: { label: 'Em Trânsito',  badge: 'badge-primary' },
    delivered:  { label: 'Entregue',     badge: 'badge-success' },
    cancelled:  { label: 'Cancelado',    badge: 'badge-secondary' },
    approved:   { label: 'Aprovado',     badge: 'badge-success' },
    rejected:   { label: 'Recusado',     badge: 'badge-secondary' },
  }

  const impStatusInfo: Record<string, { label: string, color: string, bg: string, icon: string }> = {
    draft:        { label: 'Rascunho',        color: '#6c757d', bg: '#e9ecef',  icon: 'fa-file' },
    waiting_ship: { label: 'Aguard. Embarque', color: '#d97706', bg: '#fffbeb', icon: 'fa-clock' },
    in_transit:   { label: 'Em Trânsito',      color: '#2980B9', bg: '#e8f4fd', icon: 'fa-ship' },
    customs:      { label: 'Desembaraço',      color: '#7c3aed', bg: '#f5f3ff', icon: 'fa-stamp' },
    delivered:    { label: 'Entregue',         color: '#16a34a', bg: '#f0fdf4', icon: 'fa-check-circle' },
    cancelled:    { label: 'Cancelado',        color: '#dc2626', bg: '#fef2f2', icon: 'fa-times-circle' },
  }

  const allItems = [...stockItems, ...products]

  const criticalItems = allItems.filter((i: any) =>
    (i.status === 'critical' || i.stockStatus === 'critical') &&
    i.productionType === 'external' &&
    i.supplierIds && i.supplierIds.length > 0
  )

  const cotacaoBySupplier: Record<string, any[]> = {}
  for (const item of criticalItems) {
    for (const sid of (item.supplierIds || [])) {
      if (!cotacaoBySupplier[sid]) cotacaoBySupplier[sid] = []
      cotacaoBySupplier[sid].push(item)
    }
  }

  const pendingApproval = quotations.filter((q: any) => q.status === 'pending_approval')
  const importsData = imports || []
  const totalImportBRL = importsData.reduce((acc: number, imp: any) => acc + (imp.numerario?.totalLandedCostBRL || 0), 0)

  const quotationsData = (quotations || []).map((q: any) => ({
    id: q.id || '',
    code: q.code || '',
    status: q.status || 'pending',
    deadline: q.deadline || '',
    supplierName: q.supplierName || '',
    items: (q.items || []).map((item: any) => ({
      id: item.id || '',
      productName: item.productName || '',
      productCode: item.productCode || '',
      quantity: item.quantity || 0,
      unit: item.unit || 'un',
      unitPrice: item.unitPrice || 0,
    })),
    supplierResponses: (q.supplierResponses || []).map((resp: any) => ({
      id: resp.id || '',
      supplierName: resp.supplierName || '',
      totalPrice: resp.totalPrice || 0,
      deliveryDays: resp.deliveryDays || 0,
      paymentTerms: resp.paymentTerms || '',
      notes: resp.notes || '',
      respondedAt: resp.respondedAt || '',
    })),
    createdAt: q.createdAt || '',
  }))

  const content = `<h1>Suprimentos</h1>`

  return c.html(layout('Suprimentos', content, 'suprimentos', userInfo))
})

// ── API: POST /suprimentos/api/quotations/create ──────────────────────────────
app.post('/suprimentos/api/quotations/create', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const empresaId = getCtxEmpresaId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body) return err(c, 'Dados inválidos')
  if (!body.deadline) return err(c, 'Data limite obrigatória')
  if (!body.supplierIds || body.supplierIds.length === 0) return err(c, 'Selecione pelo menos um fornecedor')
  if (body.tipo !== 'critico' && (!body.items || body.items.length === 0)) return err(c, 'Adicione pelo menos um produto')
  const id = genId('cot')
  const code = `COT-${new Date().getFullYear()}-${String(tenant.quotations.length + 1).padStart(3,'0')}`
  const quotation = {
    id, code,
    descricao: body.descricao || 'Cotação de suprimentos',
    tipo: body.tipo || 'manual',
    items: body.items || [],
    supplierIds: body.supplierIds || [],
    deadline: body.deadline,
    observations: body.observations || '',
    status: 'sent',
    createdBy: 'Admin',
    createdAt: new Date().toISOString(),
    supplierResponses: [],
  }
  tenant.quotations.push(quotation)
  if (db && userId !== 'demo-tenant') {
    const persistResult = await dbInsertWithRetry(db, 'quotations', {
      id, user_id: userId, empresa_id: empresaId, title: quotation.descricao, status: 'sent',
      deadline: quotation.deadline, notes: JSON.stringify({ items: quotation.items, observations: quotation.observations }),
    })
    if (!persistResult.success) {
      console.error(`[ERROR] Falha ao persistir cotação ${id} em D1 após ${persistResult.attempts} tentativas: ${persistResult.error}`)
      return ok(c, {
        quotation, code,
        warning: 'Cotação salva localmente. Falha ao salvar no banco. Sincronizará automaticamente.',
      })
    }
  }
  return ok(c, { quotation, code })
})

// ── API: POST /suprimentos/api/quotations/:id/approve ────────────────────────
app.post('/suprimentos/api/quotations/:id/approve', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const empresaId = getCtxEmpresaId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as any
  const idx = tenant.quotations.findIndex((q: any) => q.id === id)
  if (idx === -1) return err(c, 'Cotação não encontrada', 404)
  const previousStatus = tenant.quotations[idx].status
  const now = new Date().toISOString()
  tenant.quotations[idx].status = 'approved'
  tenant.quotations[idx].approvedBy = 'Admin'
  tenant.quotations[idx].approvedAt = now
  markTenantModified(userId)
  const pcId = genId('pc')
  const pcCode = `PC-${new Date().getFullYear()}-${String(tenant.purchaseOrders.length + 1).padStart(3,'0')}`
  const pc = { id: pcId, code: pcCode, quotationId: id, supplierId: body.supplierName || '', supplierName: body.supplierName || 'Fornecedor', status: 'pending', totalValue: 0, currency: 'BRL', createdAt: now }
  tenant.purchaseOrders.push(pc)
  if (db && userId !== 'demo-tenant') {
    const updateOk = await dbUpdate(db, 'quotations', id, userId, { status: 'approved', approved_by: 'Admin', approved_at: now, updated_at: now })
    if (!updateOk) {
      console.error(`[APPROVE] Falha ao atualizar cotação ${id} em D1`)
      return err(c, 'Falha ao persistir aprovação no banco de dados', 500)
    }
    await dbInsert(db, 'quotation_statuses', {
      id: genId('qst'), quotation_id: id, user_id: userId, empresa_id: empresaId || '1',
      previous_status: previousStatus, new_status: 'approved', changed_by: 'Admin', notes: `Cotação aprovada. PC: ${pcCode}`, created_at: now,
    })
    await dbInsert(db, 'purchase_orders', { id: pcId, user_id: userId, empresa_id: empresaId, supplier_id: pc.supplierId, status: 'pending', total_value: 0, expected_date: '', notes: `Gerado da cotação ${tenant.quotations[idx].code || id}` })
  }
  return ok(c, { pcCode })
})

// ── API: POST /suprimentos/api/quotations/:id/reject ─────────────────────────
app.post('/suprimentos/api/quotations/:id/reject', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const empresaId = getCtxEmpresaId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as any
  const idx = tenant.quotations.findIndex((q: any) => q.id === id)
  if (idx === -1) return err(c, 'Cotação não encontrada', 404)
  const previousStatus = tenant.quotations[idx].status
  const now = new Date().toISOString()
  tenant.quotations[idx].status = 'rejected'
  tenant.quotations[idx].rejectionReason = body.motivo || ''
  markTenantModified(userId)
  if (db && userId !== 'demo-tenant') {
    const updateOk = await dbUpdate(db, 'quotations', id, userId, { status: 'rejected', quotation_reason: body.motivo || '', updated_at: now })
    if (!updateOk) {
      console.error(`[REJECT] Falha ao atualizar cotação ${id} em D1`)
      return err(c, 'Falha ao persistir negação no banco de dados', 500)
    }
    await dbInsert(db, 'quotation_statuses', {
      id: genId('qst'), quotation_id: id, user_id: userId, empresa_id: empresaId || '1',
      previous_status: previousStatus, new_status: 'rejected', changed_by: 'Admin', notes: body.motivo || '', created_at: now,
    })
  }
  return ok(c)
})

// ── API: POST /suprimentos/api/quotations/:id/resend ─────────────────────────
app.post('/suprimentos/api/quotations/:id/resend', async (c) => {
  const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const idx = tenant.quotations.findIndex((q: any) => q.id === id)
  if (idx === -1) return err(c, 'Cotação não encontrada', 404)
  const q = tenant.quotations[idx]
  if (q.status !== 'sent' && q.status !== 'awaiting_responses') {
    return err(c, 'Cotação não pode ser reenviada no status atual')
  }
  tenant.quotations[idx].resentAt = new Date().toISOString()
  console.log(`[COTAÇÃO] Cotação ${q.code} reenviada`)
  return ok(c, { code: q.code })
})

// ── API: POST /suprimentos/api/quotations/:id/negotiate ──────────────────────
app.post('/suprimentos/api/quotations/:id/negotiate', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const empresaId = getCtxEmpresaId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as any
  if (!body.observations || !body.observations.trim()) return err(c, 'Observações da negociação são obrigatórias', 400)
  const idx = tenant.quotations.findIndex((q: any) => q.id === id)
  if (idx === -1) return err(c, 'Cotação não encontrada', 404)
  const previousStatus = tenant.quotations[idx].status
  const now = new Date().toISOString()
  tenant.quotations[idx].status = 'awaiting_negotiation'
  tenant.quotations[idx].negotiationObs = body.observations.trim()
  markTenantModified(userId)
  if (db && userId !== 'demo-tenant') {
    const updateOk = await dbUpdate(db, 'quotations', id, userId, { status: 'awaiting_negotiation', updated_at: now })
    if (!updateOk) {
      console.error(`[NEGOTIATE] Falha ao atualizar cotação ${id} em D1`)
      return err(c, 'Falha ao persistir negociação no banco de dados', 500)
    }
    await dbInsert(db, 'quotation_statuses', {
      id: genId('qst'), quotation_id: id, user_id: userId, empresa_id: empresaId || '1',
      previous_status: previousStatus, new_status: 'awaiting_negotiation', changed_by: 'Admin',
      notes: body.observations.trim(), created_at: now,
    })
    await dbInsert(db, 'quotation_negotiations', {
      id: genId('qng'), quotation_id: id, user_id: userId, empresa_id: empresaId || '1',
      observations: body.observations.trim(), created_by: 'Admin', created_at: now,
    })
  }
  return ok(c, { status: 'awaiting_negotiation' })
})

// ── API: POST /suprimentos/api/purchase-orders/create ────────────────────────
app.post('/suprimentos/api/purchase-orders/create', async (c) => {
  const userId = getCtxUserId(c); const empresaId = getCtxEmpresaId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.quotationId) return err(c, 'Cotação obrigatória', 400)
  const quotIdx = (tenant.quotations || []).findIndex((q: any) => q.id === body.quotationId)
  if (quotIdx === -1) return err(c, 'Cotação não encontrada', 404)
  const quot = tenant.quotations[quotIdx]
  if (quot.status !== 'approved') return err(c, 'Cotação deve estar aprovada', 400)
  const id = genId('pc')
  const code = `PED-${new Date().getFullYear()}-${String((tenant.purchaseOrders.length || 0) + 1).padStart(3,'0')}`
  const pedido = {
    id, code,
    quotationId: quot.id,
    quotationCode: quot.code,
    supplierName: quot.supplierName || (quot.supplierResponses?.[0]?.supplierName || ''),
    items: quot.items || [],
    totalValue: quot.totalValue || (quot.supplierResponses?.[0]?.totalPrice || 0),
    pedidoData: body.pedidoData || '',
    dataEntrega: body.dataEntrega || '',
    observacoes: body.observacoes || '',
    status: 'pending_approval',
    createdAt: new Date().toISOString(),
    userId,
    empresaId,
  }
  if (!tenant.purchaseOrders) (tenant as any).purchaseOrders = []
  tenant.purchaseOrders.push(pedido)
  console.log(`[PEDIDO] ✅ Pedido criado: ${pedido.id}`)
  markTenantModified(userId)
  return ok(c, { purchaseOrder: pedido, message: 'Pedido de compra criado com sucesso' })
})

// ── API: POST /suprimentos/api/purchase-orders/:id/approve ───────────────────
app.post('/suprimentos/api/purchase-orders/:id/approve', async (c) => {
  const pedidoId = c.req.param('id')
  const tenant = getCtxTenant(c)
  const userId = getCtxUserId(c)
  const pedidoIdx = (tenant.purchaseOrders || []).findIndex((p: any) => p.id === pedidoId)
  if (pedidoIdx === -1) return err(c, 'Pedido não encontrado', 404)
  tenant.purchaseOrders[pedidoIdx].status = 'approved'
  tenant.purchaseOrders[pedidoIdx].approvedAt = new Date().toISOString()
  console.log(`[PEDIDO] ✅ Pedido aprovado: ${pedidoId}`)
  markTenantModified(userId)
  return ok(c, { purchaseOrder: tenant.purchaseOrders[pedidoIdx] })
})

// ── API: POST /suprimentos/api/purchase-orders/:id/reject ────────────────────
app.post('/suprimentos/api/purchase-orders/:id/reject', async (c) => {
  const pedidoId = c.req.param('id')
  const tenant = getCtxTenant(c)
  const userId = getCtxUserId(c)
  const pedidoIdx = (tenant.purchaseOrders || []).findIndex((p: any) => p.id === pedidoId)
  if (pedidoIdx === -1) return err(c, 'Pedido não encontrado', 404)
  tenant.purchaseOrders[pedidoIdx].status = 'rejected'
  tenant.purchaseOrders[pedidoIdx].rejectedAt = new Date().toISOString()
  console.log(`[PEDIDO] ✅ Pedido recusado: ${pedidoId}`)
  markTenantModified(userId)
  return ok(c, { purchaseOrder: tenant.purchaseOrders[pedidoIdx] })
})

// ── API: POST /suprimentos/api/imports/create ────────────────────────────────
app.post('/suprimentos/api/imports/create', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const empresaId = getCtxEmpresaId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.invoiceNumber) return err(c, 'Número da Invoice obrigatório')
  const id = genId('imp')
  const code = `IMP-${new Date().getFullYear()}-${String((tenant.imports?.length || 0) + 1).padStart(3,'0')}`
  const imp = {
    id, code, invoiceNumber: body.invoiceNumber,
    supplierId: body.supplierId || '', supplierName: body.supplierName || '',
    modality: body.modality || 'maritimo', status: 'waiting_ship',
    createdAt: new Date().toISOString(),
  }
  if (!tenant.imports) (tenant as any).imports = []
  tenant.imports.push(imp)
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'imports', {
      id, user_id: userId, empresa_id: empresaId, code, invoice_number: imp.invoiceNumber,
      supplier_id: imp.supplierId, status: 'waiting_ship',
    })
  }
  return ok(c, { imp, code })
})

// ── API: POST /suprimentos/api/product-imp-field ─────────────────────────────
app.post('/suprimentos/api/product-imp-field', async (c) => {
  const tenant = getCtxTenant(c)
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.code || !body.field) return err(c, 'code e field obrigatórios')
  const { code, field, value } = body
  const allowedFields = ['descPT', 'descEN', 'ncm']
  if (!allowedFields.includes(field)) return err(c, 'Campo não permitido')
  const allItems: any[] = [...(tenant.stockItems || []), ...(tenant.products || [])]
  const item = allItems.find((i: any) => i.code === code)
  if (item) {
    item[field] = value
  } else {
    if (!tenant.impProdDesc) (tenant as any).impProdDesc = {}
    if (!tenant.impProdDesc[code]) tenant.impProdDesc[code] = {}
    tenant.impProdDesc[code][field] = value
  }
  if (db && userId !== 'demo-tenant') {
    try {
      await db.prepare(
        `UPDATE products SET ${field} = ? WHERE user_id = ? AND code = ?`
      ).bind(value, userId, code).run()
    } catch(_) { }
    try {
      await db.prepare(
        `INSERT INTO imp_prod_desc (user_id, code, field, value, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, code, field) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
      ).bind(userId, code, field, value).run()
    } catch(_) { }
  }
  return ok(c, { code, field, value })
})

// ── API: GET /suprimentos/api/list ────────────────────────────────────────────
app.get('/suprimentos/api/list', (c) => {
  const tenant = getCtxTenant(c)
  return ok(c, { quotations: tenant.quotations, orders: tenant.purchaseOrders, imports: tenant.imports })
})

// ── API: POST /suprimentos/api/quotations/:id/respond ────────────────────────
app.post('/suprimentos/api/quotations/:id/respond', async (c) => {
  const quotId = c.req.param('id')
  const body = await c.req.json().catch(() => null)

  if (!body || !body.supplierName || body.totalPrice === undefined) {
    return err(c, 'Fornecedor e preço obrigatórios', 400)
  }

  console.log('[COTAÇÃO-RESPOSTA] Recebendo resposta de:', body.supplierName, 'para:', quotId)

  const allTenantEntries = Object.entries(tenants)
  for (const [userId, tenant] of allTenantEntries) {
    if (!tenant.quotations) continue
    const quotIdx = tenant.quotations.findIndex((q: any) => q.id === quotId)
    if (quotIdx !== -1) {
      const q = tenant.quotations[quotIdx]

      if (q.supplierResponses?.some((r: any) => r.supplierName.toLowerCase() === body.supplierName.toLowerCase())) {
        return err(c, 'Este fornecedor já respondeu esta cotação', 400)
      }

      if (q.deadline && new Date(q.deadline + 'T23:59:59') < new Date()) {
        return err(c, 'Cotação expirada', 400)
      }

      if (!q.supplierResponses) q.supplierResponses = []
      q.supplierResponses.push({
        id: genId('resp'),
        supplierName: body.supplierName,
        totalPrice: body.totalPrice,
        deliveryDays: body.deliveryDays || 0,
        paymentTerms: body.paymentTerms || '',
        notes: body.notes || '',
        respondedAt: new Date().toISOString(),
      })

      q.status = 'with_responses'
      markTenantModified(userId)

      const db = getCtxDB(c)
      if (db && userId !== 'demo-tenant') {
        try {
          await db.prepare(`UPDATE quotations SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
            .bind(q.status, new Date().toISOString(), quotId, userId).run()
          console.log('[COTAÇÃO-RESPOSTA] ✅ Status persistido em D1:', q.status)
        } catch (e) {
          console.error('[COTAÇÃO-RESPOSTA] ⚠️ Erro ao persistir status:', (e as any).message)
        }
      }

      console.log('[COTAÇÃO-RESPOSTA] ✅ Resposta salva:', quotId)
      return ok(c, { quotation: q, message: 'Resposta recebida com sucesso' })
    }
  }

  return err(c, 'Cotação não encontrada', 404)
})

export default app
