import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxUserId, getCtxEmpresaId } from '../sessionHelper'
import { genId, dbInsert, dbInsertWithRetry, dbUpdate, dbDelete, ok, err } from '../dbHelpers'
import { tenants, markTenantModified } from '../userStore'

const app = new Hono()

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

// ── Rota principal
app.get('/', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  
  const quotations = (tenant as any).quotations || []
  const purchaseOrders = (tenant as any).purchaseOrders || []
  const suppliers = (tenant as any).suppliers || []
  const stockItems = (tenant as any).stockItems || []
  const products = (tenant as any).products || []
  const imports = (tenant as any).imports || []

  const pendingApproval = quotations.filter((q: any) => q.status === 'pending_approval')
  const importsData = imports || []

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

  const content = `
  <div class="section-header">
    <div>
      <div style="font-size:14px;color:#6c757d;">Suprimentos — Compras, Cotações, Pedidos e Importações</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-secondary" onclick="openModal('gerarCotacaoModal')">
        <i class="fas fa-file-invoice-dollar"></i> Nova Cotação
      </button>
      <button class="btn btn-primary" onclick="openModal('novoPedidoCompraModal')">
        <i class="fas fa-plus"></i> Pedido de Compra
      </button>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:20px;">
    <div class="kpi-card">
      <div style="font-size:22px;font-weight:800;color:#1B4F72;">${quotations.length}</div>
      <div style="font-size:12px;color:#6c757d;margin-top:4px;">Total Cotações</div>
    </div>
    <div class="kpi-card" style="border-left:3px solid #dc2626;">
      <div style="font-size:22px;font-weight:800;color:#dc2626;">${pendingApproval.length}</div>
      <div style="font-size:12px;color:#6c757d;margin-top:4px;"><i class="fas fa-clock" style="color:#dc2626;"></i> Pend. Aprovação</div>
    </div>
    <div class="kpi-card" style="border-left:3px solid #27AE60;">
      <div style="font-size:22px;font-weight:800;color:#27AE60;">${purchaseOrders.length}</div>
      <div style="font-size:12px;color:#6c757d;margin-top:4px;">Pedidos de Compra</div>
    </div>
    <div class="kpi-card" style="border-left:3px solid #2980B9;">
      <div style="font-size:22px;font-weight:800;color:#2980B9;">${importsData.length}</div>
      <div style="font-size:12px;color:#6c757d;margin-top:4px;"><i class="fas fa-ship" style="color:#2980B9;"></i> Importações</div>
    </div>
  </div>

  <div data-tab-group="suprimentos">
    <div class="tab-nav">
      <button class="tab-btn active" onclick="switchTab('tabCotacoes','suprimentos')">
        <i class="fas fa-file-invoice-dollar" style="margin-right:6px;"></i>Cotações
        ${pendingApproval.length > 0 ? '<span style="background:#dc2626;color:white;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px;margin-left:4px;">'+pendingApproval.length+'</span>' : ''}
      </button>
      <button class="tab-btn" onclick="switchTab('tabPedidos','suprimentos')">
        <i class="fas fa-shopping-cart" style="margin-right:6px;"></i>Pedidos de Compra
      </button>
    </div>

    <div class="tab-content active" id="tabCotacoes">
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Código</th><th>Itens</th><th>Fornecedor</th><th>Status</th><th>Data</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${quotations.map((q: any) => `
              <tr>
                <td style="font-weight:700;color:#1B4F72;">${q.code}</td>
                <td>${q.items ? q.items.length : 0} itens</td>
                <td>${q.supplierName || '—'}</td>
                <td><span class="badge">${q.status || 'pendente'}</span></td>
                <td style="font-size:12px;color:#9ca3af;">${new Date(q.createdAt+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td><button class="btn btn-secondary btn-sm" onclick="openQuotationDetail('${q.id}')"><i class="fas fa-eye"></i></button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="tab-content" id="tabPedidos">
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Código</th><th>Fornecedor</th><th>Valor</th><th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${purchaseOrders.map((pc: any) => `
              <tr>
                <td style="font-weight:700;color:#1B4F72;">${pc.code}</td>
                <td>${pc.supplierName || '—'}</td>
                <td>R$ ${(pc.totalValue || 0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                <td><span class="badge">${pc.status || 'pendente'}</span></td>
                <td><button class="btn btn-secondary btn-sm" onclick="abrirModalPedidoCompra('${pc.id}')"><i class="fas fa-eye"></i></button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <script>
    window.quotationsData = ${safeStringifyQuotations(quotationsData).replace(/<\//g, '<\\/')};
    window.purchaseOrdersData = ${safeJsonStringify(purchaseOrders).replace(/<\//g, '<\\/')};
    console.log('[SUPRIMENTOS] Dados carregados:', window.quotationsData.length, 'cotações');
  </script>
  <script src="/static/suprimentos-init.js"></script>
  `

  return c.html(layout('Suprimentos', content, 'suprimentos', userInfo))
})

// ── API: POST /suprimentos/api/quotations/create
app.post('/suprimentos/api/quotations/create', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const empresaId = getCtxEmpresaId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body) return err(c, 'Dados inválidos')
  if (!body.deadline) return err(c, 'Data limite obrigatória')
  if (!body.supplierIds || body.supplierIds.length === 0) return err(c, 'Selecione pelo menos um fornecedor')
  if (body.tipo !== 'critico' && (!body.items || body.items.length === 0)) return err(c, 'Adicione pelo menos um produto')
  
  const id = genId('cot')
  const code = `COT-${new Date().getFullYear()}-${String((tenant as any).quotations.length + 1).padStart(3,'0')}`
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
  
  if (!(tenant as any).quotations) (tenant as any).quotations = []
  (tenant as any).quotations.push(quotation)
  
  if (db && userId !== 'demo-tenant') {
    const persistResult = await dbInsertWithRetry(db, 'quotations', {
      id, user_id: userId, empresa_id: empresaId, title: quotation.descricao, status: 'sent',
      deadline: quotation.deadline, notes: JSON.stringify({ items: quotation.items, observations: quotation.observations }),
    })
    if (!persistResult.success) {
      console.error(`[ERROR] Falha ao persistir cotação ${id}`)
      return ok(c, { quotation, code, warning: 'Cotação salva localmente. Sincronizará automaticamente.' })
    }
  }
  return ok(c, { quotation, code })
})

// ── API: POST /suprimentos/api/quotations/:id/approve
app.post('/suprimentos/api/quotations/:id/approve', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const empresaId = getCtxEmpresaId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as any
  const idx = (tenant as any).quotations.findIndex((q: any) => q.id === id)
  if (idx === -1) return err(c, 'Cotação não encontrada', 404)
  
  const now = new Date().toISOString()
  (tenant as any).quotations[idx].status = 'approved'
  (tenant as any).quotations[idx].approvedBy = 'Admin'
  (tenant as any).quotations[idx].approvedAt = now
  markTenantModified(userId)
  
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'quotations', id, userId, { status: 'approved', updated_at: now })
  }
  return ok(c)
})

// ── API: POST /suprimentos/api/quotations/:id/reject
app.post('/suprimentos/api/quotations/:id/reject', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as any
  const idx = (tenant as any).quotations.findIndex((q: any) => q.id === id)
  if (idx === -1) return err(c, 'Cotação não encontrada', 404)
  
  const now = new Date().toISOString()
  (tenant as any).quotations[idx].status = 'rejected'
  (tenant as any).quotations[idx].rejectionReason = body.motivo || ''
  markTenantModified(userId)
  
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'quotations', id, userId, { status: 'rejected', updated_at: now })
  }
  return ok(c)
})

// ── API: POST /suprimentos/api/quotations/:id/resend
app.post('/suprimentos/api/quotations/:id/resend', async (c) => {
  const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const idx = (tenant as any).quotations.findIndex((q: any) => q.id === id)
  if (idx === -1) return err(c, 'Cotação não encontrada', 404)
  
  const q = (tenant as any).quotations[idx]
  if (q.status !== 'sent' && q.status !== 'awaiting_responses') {
    return err(c, 'Cotação não pode ser reenviada no status atual')
  }
  
  (tenant as any).quotations[idx].resentAt = new Date().toISOString()
  return ok(c, { code: q.code })
})

// ── API: POST /suprimentos/api/quotations/:id/negotiate
app.post('/suprimentos/api/quotations/:id/negotiate', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as any
  if (!body.observations || !body.observations.trim()) return err(c, 'Observações são obrigatórias', 400)
  
  const idx = (tenant as any).quotations.findIndex((q: any) => q.id === id)
  if (idx === -1) return err(c, 'Cotação não encontrada', 404)
  
  const now = new Date().toISOString()
  (tenant as any).quotations[idx].status = 'awaiting_negotiation'
  (tenant as any).quotations[idx].negotiationObs = body.observations.trim()
  markTenantModified(userId)
  
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'quotations', id, userId, { status: 'awaiting_negotiation', updated_at: now })
  }
  return ok(c, { status: 'awaiting_negotiation' })
})

// ── API: POST /suprimentos/api/purchase-orders/create
app.post('/suprimentos/api/purchase-orders/create', async (c) => {
  const userId = getCtxUserId(c); const empresaId = getCtxEmpresaId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.quotationId) return err(c, 'Cotação obrigatória', 400)
  
  const quotIdx = ((tenant as any).quotations || []).findIndex((q: any) => q.id === body.quotationId)
  if (quotIdx === -1) return err(c, 'Cotação não encontrada', 404)
  
  const quot = (tenant as any).quotations[quotIdx]
  const id = genId('pc')
  const code = `PED-${new Date().getFullYear()}-${String(((tenant as any).purchaseOrders.length || 0) + 1).padStart(3,'0')}`
  const pedido = {
    id, code,
    quotationId: quot.id,
    quotationCode: quot.code,
    supplierName: quot.supplierName || '',
    items: quot.items || [],
    totalValue: quot.totalValue || 0,
    pedidoData: body.pedidoData || '',
    dataEntrega: body.dataEntrega || '',
    observacoes: body.observacoes || '',
    status: 'pending_approval',
    createdAt: new Date().toISOString(),
  }
  
  if (!(tenant as any).purchaseOrders) (tenant as any).purchaseOrders = []
  (tenant as any).purchaseOrders.push(pedido)
  markTenantModified(userId)
  
  return ok(c, { purchaseOrder: pedido, message: 'Pedido de compra criado com sucesso' })
})

// ── API: POST /suprimentos/api/purchase-orders/:id/approve
app.post('/suprimentos/api/purchase-orders/:id/approve', async (c) => {
  const pedidoId = c.req.param('id')
  const tenant = getCtxTenant(c)
  const userId = getCtxUserId(c)
  const pedidoIdx = ((tenant as any).purchaseOrders || []).findIndex((p: any) => p.id === pedidoId)
  if (pedidoIdx === -1) return err(c, 'Pedido não encontrado', 404)
  
  (tenant as any).purchaseOrders[pedidoIdx].status = 'approved'
  (tenant as any).purchaseOrders[pedidoIdx].approvedAt = new Date().toISOString()
  markTenantModified(userId)
  
  return ok(c, { purchaseOrder: (tenant as any).purchaseOrders[pedidoIdx] })
})

// ── API: POST /suprimentos/api/purchase-orders/:id/reject
app.post('/suprimentos/api/purchase-orders/:id/reject', async (c) => {
  const pedidoId = c.req.param('id')
  const tenant = getCtxTenant(c)
  const userId = getCtxUserId(c)
  const pedidoIdx = ((tenant as any).purchaseOrders || []).findIndex((p: any) => p.id === pedidoId)
  if (pedidoIdx === -1) return err(c, 'Pedido não encontrado', 404)
  
  (tenant as any).purchaseOrders[pedidoIdx].status = 'rejected'
  (tenant as any).purchaseOrders[pedidoIdx].rejectedAt = new Date().toISOString()
  markTenantModified(userId)
  
  return ok(c, { purchaseOrder: (tenant as any).purchaseOrders[pedidoIdx] })
})

// ── API: GET /suprimentos/api/list
app.get('/suprimentos/api/list', (c) => {
  const tenant = getCtxTenant(c)
  return ok(c, { quotations: (tenant as any).quotations || [], orders: (tenant as any).purchaseOrders || [] })
})

export default app
