import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxUserId, getCtxEmpresaId } from '../sessionHelper'
import { genId, dbInsert, dbInsertWithRetry, dbUpdate, dbDelete, ok, err } from '../dbHelpers'
import { tenants, markTenantModified } from '../userStore'
import { requireModuleWriteAccess } from '../moduleAccess'

const app = new Hono()

app.use('*', async (c, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    const blocked = await requireModuleWriteAccess(c, 'suprimentos')
    if (blocked) return blocked
  }
  return next()
})

/**
 * Escapar string para JSON de forma segura
 */
function escapeJsonString(str: string): string {
  if (typeof str !== 'string') return ''

  return str
    .replace(/\\/g, '\\\\')  // Backslash primeiro
    .replace(/"/g, '\\"')     // Aspas duplas
    .replace(/\n/g, '\\n')    // Quebra de linha
    .replace(/\r/g, '\\r')    // Carriage return
    .replace(/\t/g, '\\t')    // Tab
    .replace(/\b/g, '\\b')    // Backspace
    .replace(/\f/g, '\\f')    // Form feed
}

/**
 * Serializar objeto para JSON de forma segura
 */
function safeJsonStringify(obj: any): string {
  try {
    const jsonStr = JSON.stringify(obj)
    // Validar que é JSON válido
    JSON.parse(jsonStr)
    return jsonStr
  } catch (e) {
    console.error('[JSON] Erro ao stringify:', (e as any).message)
    return '[]'
  }
}

/**
 * Escape string for use in HTML attribute values (double-quoted)
 */
function escapeHtmlAttr(str: string): string {
  if (typeof str !== 'string') return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Escape string for use as a JS argument (single-quoted) inside an HTML onclick attribute
 */
function escapeJsStr(str: string): string {
  if (typeof str !== 'string') return ''
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/</g, '&lt;')
}

/**
 * Serializar quotations para JSON de forma segura
 */
function safeStringifyQuotations(quotations: any[]): string {
  try {
    const jsonStr = JSON.stringify(quotations)
    // Validar que é JSON válido
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
  const mockData = tenant  // per-session data
  const quotations = (mockData as any).quotations || []
  const purchaseOrders = (mockData as any).purchaseOrders || []
  const suppliers = (mockData as any).suppliers || []
  const stockItems = (mockData as any).stockItems || []
  const products = (mockData as any).products || []
  const imports = (mockData as any).imports || []

  // Build a map: productCode → [supplierIds] from tenant.productSuppliers
  const productSupplierMap = new Map<string, string[]>()
  const productSuppliers = (mockData as any).productSuppliers || []
  for (const ps of productSuppliers) {
    const productKey = ps.productCode || ps.productId
    if (!productKey) continue
    if (!productSupplierMap.has(productKey)) {
      productSupplierMap.set(productKey, [])
    }
    if (ps.supplierIds && Array.isArray(ps.supplierIds)) {
      const supplierList = productSupplierMap.get(productKey)
      if (supplierList) { supplierList.push(...ps.supplierIds) }
    }
  }

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

  // Itens críticos externos com fornecedor → disparo de cotação
  const criticalItems = allItems.filter((i: any) =>
    (i.status === 'critical' || i.stockStatus === 'critical') &&
    i.productionType === 'external' &&
    i.supplierIds && i.supplierIds.length > 0
  )

  // Agrupar cotações por fornecedor (relatório)
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

  const content = `
  <script>
    window.quotationsData = ${safeStringifyQuotations(quotationsData).replace(/<\//g, '<\\/')};
    window.purchaseOrdersData = ${safeJsonStringify(purchaseOrders).replace(/<\//g, '<\\/')};
    window.statusInfoData = ${safeJsonStringify(statusInfo).replace(/<\//g, '<\\/')};
    window.suppliersData = ${safeJsonStringify(suppliers).replace(/<\//g, '<\\/')};
    window.importsData = ${safeJsonStringify(importsData).replace(/<\//g, '<\\/')};
    window.allItemsData = ${safeJsonStringify([...stockItems, ...products]).replace(/<\//g, '<\\/')};
  </script>

  <!-- Pop-up: cotações pendentes de aprovação -->
  ${pendingApproval.length > 0 ? `
  <div id="pendingApprovalPopup" style="position:fixed;top:80px;right:20px;z-index:500;width:360px;background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.18);border-top:4px solid #dc2626;animation:slideInRight 0.3s ease;">
    <div style="padding:14px 16px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:32px;height:32px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-file-invoice-dollar" style="color:#dc2626;font-size:14px;"></i>
        </div>
        <div>
          <div style="font-size:13px;font-weight:700;color:#dc2626;">Cotações Aguardando Aprovação!</div>
          <div style="font-size:11px;color:#6c757d;">${pendingApproval.length} cotação(ões) para analisar</div>
        </div>
      </div>
      <button onclick="document.getElementById('pendingApprovalPopup').style.display='none'" style="background:none;border:none;font-size:18px;cursor:pointer;color:#9ca3af;">×</button>
    </div>
    <div style="padding:10px 16px;">
      ${pendingApproval.map((q: any) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f8f9fa;">
        <div>
          <div style="font-size:12px;font-weight:700;color:#1B4F72;">${q.code}</div>
          <div style="font-size:11px;color:#6c757d;">${q.items.length} item(ns) · ${q.supplierResponses.length > 0 ? 'R$ ' + (q.supplierResponses[0]?.totalPrice||0).toLocaleString('pt-BR',{minimumFractionDigits:2}) : 'Sem respostas'}</div>
        </div>
        <button class="btn btn-success btn-sm" data-action="approve-quotation" data-id="${escapeHtmlAttr(q.id)}" data-code="${escapeHtmlAttr(q.code)}" data-supplier="${escapeHtmlAttr(q.supplierResponses[0]?.supplierName||'fornecedor')}">
          <i class="fas fa-check"></i> Aprovar
        </button>
      </div>`).join('')}
    </div>
    <div style="padding:10px 16px;">
      <button class="btn btn-primary btn-sm" style="width:100%;justify-content:center;" onclick="document.getElementById('pendingApprovalPopup').style.display='none';switchTab('tabCotacoes','suprimentos')">
        <i class="fas fa-list"></i> Ver Todas as Cotações
      </button>
    </div>
  </div>
  <style>@keyframes slideInRight{from{opacity:0;transform:translateX(40px);}to{opacity:1;transform:translateX(0);}}</style>` : ''}

  <!-- Pop-up: itens críticos para cotação -->
  ${criticalItems.length > 0 ? `
  <div id="criticalQuotPopup" style="position:fixed;top:${pendingApproval.length > 0 ? '280' : '80'}px;right:20px;z-index:500;width:360px;background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.18);border-top:4px solid #F39C12;animation:slideInRight 0.3s ease;">
    <div style="padding:14px 16px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:32px;height:32px;border-radius:50%;background:#fffbeb;display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-exclamation-triangle" style="color:#F39C12;font-size:14px;"></i>
        </div>
        <div>
          <div style="font-size:13px;font-weight:700;color:#d97706;">Itens Críticos: Gerar Cotações?</div>
          <div style="font-size:11px;color:#6c757d;">${criticalItems.length} itens · ${Object.keys(cotacaoBySupplier).length} fornecedor(es) impactado(s)</div>
        </div>
      </div>
      <button onclick="document.getElementById('criticalQuotPopup').style.display='none'" style="background:none;border:none;font-size:18px;cursor:pointer;color:#9ca3af;">×</button>
    </div>
    <div style="padding:10px 16px;">
      ${criticalItems.slice(0,3).map((i: any) => `<div style="font-size:12px;color:#374151;padding:3px 0;border-bottom:1px solid #f8f9fa;">${i.name} — <span style="color:#dc2626;font-weight:600;">Estoque: ${i.quantity??i.stockCurrent??0} / Mín: ${i.minQuantity??i.stockMin??0}</span></div>`).join('')}
      ${criticalItems.length > 3 ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px;">+${criticalItems.length-3} mais...</div>` : ''}
    </div>
    <div style="padding:10px 16px;display:flex;gap:8px;">
      <button onclick="document.getElementById('criticalQuotPopup').style.display='none'" class="btn btn-secondary btn-sm" style="flex:1;justify-content:center;">Depois</button>
      <button onclick="gerarCotacoesCriticos();document.getElementById('criticalQuotPopup').style.display='none'" class="btn btn-sm" style="flex:1;justify-content:center;background:#F39C12;color:white;border:none;border-radius:6px;font-weight:600;cursor:pointer;">
        <i class="fas fa-paper-plane"></i> Gerar Cotações
      </button>
    </div>
  </div>` : ''}

  <!-- Header -->
  <div class="section-header">
    <div>
      <div style="font-size:14px;color:#6c757d;">Suprimentos — Compras, Cotações, Pedidos e Importações</div>
      <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
        <span class="badge" style="background:#fef2f2;color:#dc2626;"><i class="fas fa-clock" style="font-size:9px;"></i> ${pendingApproval.length} Pend. Aprovação</span>
        <span class="badge badge-warning">${quotations.filter((q: any) => q.status==='sent'||q.status==='awaiting_responses').length} Em Andamento</span>
        <span class="badge badge-success">${purchaseOrders.filter((p: any) => p.status !== 'cancelled').length} Pedidos Ativos</span>
        <span class="badge badge-info"><i class="fas fa-ship" style="font-size:9px;"></i> ${importsData.length} Importações</span>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-secondary" onclick="openModal('gerarCotacaoModal')">
        <i class="fas fa-file-invoice-dollar"></i> Nova Cotação
      </button>
      <button class="btn btn-secondary" onclick="openModal('novaImportacaoModal')">
        <i class="fas fa-ship"></i> Nova Importação
      </button>
      <button class="btn btn-primary" onclick="openModal('novoPedidoCompraModal')">
        <i class="fas fa-plus"></i> Pedido de Compra
      </button>
    </div>
  </div>

  <!-- KPIs -->
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
    <div class="kpi-card" style="border-left:3px solid #7c3aed;">
      <div style="font-size:18px;font-weight:800;color:#7c3aed;">R$ ${totalImportBRL.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
      <div style="font-size:12px;color:#6c757d;margin-top:4px;">Custo Desemb. Total</div>
    </div>
  </div>

  <!-- Tabs -->
  <div data-tab-group="suprimentos">
    <div class="tab-nav">
      <button class="tab-btn active" onclick="switchTab('tabCotacoes','suprimentos')">
        <i class="fas fa-file-invoice-dollar" style="margin-right:6px;"></i>Cotações
        ${pendingApproval.length > 0 ? `<span style="background:#dc2626;color:white;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px;margin-left:4px;">${pendingApproval.length}</span>` : ''}
      </button>
      <button class="tab-btn" onclick="switchTab('tabPedidos','suprimentos')">
        <i class="fas fa-shopping-cart" style="margin-right:6px;"></i>Pedidos de Compra
      </button>
      <button class="tab-btn" onclick="switchTab('tabRelatorio','suprimentos')">
        <i class="fas fa-chart-bar" style="margin-right:6px;"></i>Por Fornecedor
      </button>
      <button class="tab-btn" onclick="switchTab('tabImportacao','suprimentos')">
        <i class="fas fa-ship" style="margin-right:6px;"></i>Importação
        ${importsData.length > 0 ? `<span style="background:#2980B9;color:white;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px;margin-left:4px;">${importsData.length}</span>` : ''}
      </button>
    </div>

    <!-- COTAÇÕES TAB -->
    <div class="tab-content active" id="tabCotacoes">
      <div class="card" style="overflow:hidden;">
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Código</th><th>Itens</th><th>Fornecedor(es) / Resposta</th><th>Melhor Valor</th><th>Prazo</th><th>Status</th><th>Data</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${quotations.map((q: any) => {
                const si = statusInfo[q.status] || statusInfo.sent
                const bestResp = q.supplierResponses.length > 0
                  ? q.supplierResponses.reduce((best: any, r: any) => (!best || r.totalPrice < best.totalPrice) ? r : best, null)
                  : null
                return `
                <tr>
                  <td style="font-weight:700;color:#1B4F72;">${q.code}</td>
                  <td>
                    ${q.items.map((it: any) => `<div style="font-size:12px;"><span style="font-family:monospace;font-size:10px;background:#e8f4fd;padding:1px 5px;border-radius:3px;">${it.productCode}</span> ${it.productName} <strong>(${it.quantity}${it.unit})</strong></div>`).join('')}
                  </td>
                  <td>
                    ${q.supplierResponses.length > 0
                      ? q.supplierResponses.map((r: any) => `<div style="font-size:12px;color:#374151;display:flex;align-items:center;gap:6px;">${r.supplierName === bestResp?.supplierName ? '<i class="fas fa-crown" style="color:#F39C12;font-size:10px;" title="Melhor preço"></i>' : '<span style="width:14px;"></span>'} ${r.supplierName}<span style="color:#27AE60;font-weight:600;margin-left:4px;">R$ ${r.totalPrice.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div>`).join('')
                      : '<span style="font-size:12px;color:#9ca3af;"><i class="fas fa-spinner fa-spin" style="font-size:10px;"></i> Aguardando...</span>'
                    }
                  </td>
                  <td style="font-weight:700;color:#1B4F72;">${bestResp ? 'R$ ' + bestResp.totalPrice.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—'}</td>
                  <td style="font-size:12px;color:#6c757d;">${bestResp ? bestResp.deliveryDays + ' dias' : '—'}</td>
                  <td><span class="badge" style="background:${si.bg};color:${si.color};">${si.label}</span></td>
                  <td style="font-size:12px;color:#9ca3af;">${new Date(q.createdAt+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                  <td>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;">
                      <button class="btn btn-secondary btn-sm" data-action="view-quotation" data-id="${escapeHtmlAttr(q.id)}" title="Ver detalhes"><i class="fas fa-eye"></i></button>
                      ${q.status === 'pending_approval' ? `
                      <button class="btn btn-success btn-sm" data-action="approve-quotation" data-id="${escapeHtmlAttr(q.id)}" data-code="${escapeHtmlAttr(q.code)}" data-supplier="${escapeHtmlAttr(q.supplierResponses[0]?.supplierName||'fornecedor')}" title="Aprovar"><i class="fas fa-check"></i></button>
                      <button class="btn btn-danger btn-sm" data-action="reject-quotation" data-id="${escapeHtmlAttr(q.id)}" data-code="${escapeHtmlAttr(q.code)}" title="Recusar"><i class="fas fa-times"></i></button>` : ''}
                      ${q.status === 'sent' || q.status === 'awaiting_responses' ? `
                      <button class="btn btn-secondary btn-sm" data-action="resend-quotation" data-id="${escapeHtmlAttr(q.id)}" data-code="${escapeHtmlAttr(q.code)}" title="Reenviar"><i class="fas fa-redo"></i></button>` : ''}
                      <button class="btn btn-sm" style="background:#f5f3ff;color:#7c3aed;border:1px solid #c4b5fd;" data-action="copy-supplier-link" data-id="${escapeHtmlAttr(q.id)}" title="Copiar link fornecedor"><i class="fas fa-link"></i></button>
                    </div>
                  </td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- PEDIDOS DE COMPRA TAB -->
    <div class="tab-content" id="tabPedidos">
      <div class="card" style="overflow:hidden;">
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Código PC</th><th>Fornecedor</th><th>Itens</th><th>Valor</th><th>Moeda</th><th>Import.</th><th>Entrega Prev.</th><th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${purchaseOrders.map((pc: any) => {
                const si = pcStatusInfo[pc.status] || pcStatusInfo.pending
                const currColors: Record<string,{c:string,bg:string}> = { EUR:{c:'#7c3aed',bg:'#ede9fe'}, USD:{c:'#2980B9',bg:'#e8f4fd'}, BRL:{c:'#16a34a',bg:'#f0fdf4'} }
                const cc = currColors[pc.currency] || currColors.BRL
                return `
                <tr>
                  <td style="font-weight:700;color:#1B4F72;">${pc.code}</td>
                  <td style="font-size:12px;font-weight:600;color:#374151;">${pc.supplierName}</td>
                  <td>${pc.items.map((it: any) => `<div style="font-size:12px;"><span style="font-family:monospace;font-size:10px;background:#e8f4fd;padding:1px 4px;border-radius:3px;">${it.productCode}</span> ${it.productName}</div>`).join('')}</td>
                  <td style="font-weight:700;color:#1B4F72;">${pc.currency} ${pc.totalValue.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                  <td><span class="badge" style="background:${cc.bg};color:${cc.c};">${pc.currency}</span></td>
                  <td>${pc.isImport ? '<span class="badge badge-info"><i class="fas fa-ship" style="font-size:9px;"></i> Sim</span>' : '<span class="badge badge-secondary">Não</span>'}</td>
                  <td style="font-size:12px;color:#6c757d;">${(pc.dataEntrega || pc.expectedDelivery) ? new Date((pc.dataEntrega || pc.expectedDelivery)+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                  <td><span class="badge ${si.badge}">${si.label}</span></td>
                  <td>
                    <div style="display:flex;gap:4px;">
                      <button class="btn btn-secondary btn-sm" data-action="view-pc" data-id="${escapeHtmlAttr(pc.id)}" title="Ver detalhes"><i class="fas fa-eye"></i></button>
                      ${pc.isImport ? `<button class="btn btn-sm" style="background:#e8f4fd;color:#2980B9;border:1px solid #bee3f8;" onclick="switchTab('tabImportacao','suprimentos')" title="Ver importação"><i class="fas fa-ship"></i></button>` : ''}
                    </div>
                  </td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- RELATÓRIO POR FORNECEDOR TAB -->
    <div class="tab-content" id="tabRelatorio">
      <div style="font-size:14px;color:#6c757d;margin-bottom:16px;">Cotações separadas por fornecedor — itens em estoque crítico externo</div>
      ${Object.keys(cotacaoBySupplier).length === 0 ? `
        <div class="card" style="padding:32px;text-align:center;color:#9ca3af;">
          <i class="fas fa-check-circle" style="font-size:48px;margin-bottom:12px;color:#27AE60;"></i>
          <div style="font-size:15px;font-weight:600;color:#374151;">Nenhum item crítico externo com fornecedor vinculado</div>
        </div>` :
        Object.entries(cotacaoBySupplier).map(([sid, items]: [string, any]) => {
          const sup = suppliers.find((s: any) => s.id === sid)
          if (!sup) return ''
          const ti = sup.type === 'importado' ? { color:'#2980B9', bg:'#e8f4fd', label:'Importado' } : { color:'#16a34a', bg:'#f0fdf4', label:'Nacional' }
          return `
          <div class="card" style="margin-bottom:16px;overflow:hidden;border-left:4px solid ${ti.color};">
            <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:38px;height:38px;background:${ti.bg};border-radius:10px;display:flex;align-items:center;justify-content:center;">
                  <i class="fas fa-truck" style="color:${ti.color};font-size:16px;"></i>
                </div>
                <div>
                  <div style="font-size:15px;font-weight:700;color:#1B4F72;">${sup.name}</div>
                  <div style="font-size:12px;color:#6c757d;">${sup.contact} · ${sup.email} · Prazo: <strong>${sup.deliveryLeadDays} dias</strong></div>
                </div>
              </div>
              <div style="display:flex;gap:8px;">
                <span class="badge" style="background:${ti.bg};color:${ti.color};">${ti.label}</span>
                <button class="btn btn-sm" style="background:#F39C12;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;padding:6px 12px;cursor:pointer;" data-action="disparar-cotacao" data-supplier-id="${escapeHtmlAttr(sid)}" data-supplier-name="${escapeHtmlAttr(sup.name)}" data-supplier-email="${escapeHtmlAttr(sup.email)}">
                  <i class="fas fa-paper-plane"></i> Disparar Cotação
                </button>
              </div>
            </div>
            <div class="table-wrapper">
              <table>
                <thead><tr><th>Item</th><th>Código</th><th>Estoque Atual</th><th>Estoque Mín.</th><th>Qtd Sugerida</th><th>Prazo Forn.</th></tr></thead>
                <tbody>
                  ${items.map((i: any) => {
                    const curr = i.quantity ?? i.stockCurrent ?? 0
                    const min = i.minQuantity ?? i.stockMin ?? 0
                    const sugg = Math.max(0, min - curr) + Math.round(min * 0.2)
                    return `<tr>
                      <td style="font-weight:600;color:#374151;">${i.name}</td>
                      <td><span style="font-family:monospace;font-size:11px;background:#e8f4fd;padding:2px 6px;border-radius:4px;color:#1B4F72;">${i.code}</span></td>
                      <td style="font-weight:700;color:#dc2626;">${curr} ${i.unit}</td>
                      <td style="color:#6c757d;">${min} ${i.unit}</td>
                      <td style="font-weight:700;color:#27AE60;">${sugg} ${i.unit}</td>
                      <td style="color:#2980B9;font-weight:600;">${sup.deliveryLeadDays} dias</td>
                    </tr>`
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>`
        }).join('')
      }
    </div>

    <!-- IMPORTAÇÃO TAB -->
    <div class="tab-content" id="tabImportacao">
      <div style="font-size:14px;color:#6c757d;margin-bottom:14px;">Gestão de importações estrangeiras — Invoice, alíquotas de impostos e pré-via de numerário</div>

      <!-- KPIs de Importação -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px;">
        <div class="kpi-card" style="border-left:3px solid #2980B9;">
          <div style="font-size:22px;font-weight:800;color:#2980B9;">${importsData.length}</div>
          <div style="font-size:12px;color:#6c757d;">Total Processos</div>
        </div>
        <div class="kpi-card" style="border-left:3px solid #F39C12;">
          <div style="font-size:22px;font-weight:800;color:#d97706;">${importsData.filter((i: any) => i.status === 'in_transit').length}</div>
          <div style="font-size:12px;color:#6c757d;"><i class="fas fa-ship" style="color:#d97706;"></i> Em Trânsito</div>
        </div>
        <div class="kpi-card" style="border-left:3px solid #7c3aed;">
          <div style="font-size:22px;font-weight:800;color:#7c3aed;">${importsData.filter((i: any) => i.status === 'customs').length}</div>
          <div style="font-size:12px;color:#6c757d;">Em Desembaraço</div>
        </div>
        <div class="kpi-card" style="border-left:3px solid #1B4F72;">
          <div style="font-size:17px;font-weight:800;color:#1B4F72;">R$ ${totalImportBRL.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
          <div style="font-size:12px;color:#6c757d;">Custo Total Desemb.</div>
        </div>
      </div>

      <!-- Listagem de importações -->
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${importsData.length === 0 ? `
        <div class="card" style="padding:40px;text-align:center;">
          <i class="fas fa-ship" style="font-size:48px;color:#d1d5db;margin-bottom:12px;"></i>
          <div style="font-size:15px;font-weight:600;color:#374151;">Nenhuma importação cadastrada</div>
          <div style="font-size:13px;color:#9ca3af;margin-top:4px;">Clique em "Nova Importação" para iniciar um processo</div>
        </div>` :
        importsData.map((imp: any) => {
          const si = impStatusInfo[imp.status] || impStatusInfo.draft
          const taxes = imp.taxes || {}
          const num = imp.numerario || {}
          return `
          <div class="card" style="overflow:hidden;border-left:4px solid ${si.color};">
            <!-- Cabeçalho -->
            <div style="padding:16px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
              <div style="display:flex;align-items:center;gap:14px;">
                <div style="width:44px;height:44px;background:${si.bg};border-radius:10px;display:flex;align-items:center;justify-content:center;">
                  <i class="fas ${si.icon}" style="color:${si.color};font-size:18px;"></i>
                </div>
                <div>
                  <div style="font-size:16px;font-weight:800;color:#1B4F72;">${imp.code}</div>
                  <div style="font-size:12px;color:#6c757d;">${imp.supplierName} · Invoice: <strong>${imp.invoiceNumber}</strong> · NCM: <strong>${imp.ncm}</strong></div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span class="badge" style="background:${si.bg};color:${si.color};font-size:12px;"><i class="fas ${si.icon}" style="font-size:9px;margin-right:4px;"></i>${si.label}</span>
                <button class="btn btn-secondary btn-sm" onclick="openImportDetail('${imp.id}')" title="Ver detalhes completos">
                  <i class="fas fa-eye"></i> Detalhes
                </button>
                <button class="btn btn-sm" style="background:#e8f4fd;color:#2980B9;border:1px solid #bee3f8;" onclick="openNumerario('${imp.id}')" title="Pré-via de numerário">
                  <i class="fas fa-calculator"></i> Numerário
                </button>
                <button class="btn btn-sm" style="background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;" onclick="openRascunhoLI('${imp.id}')" title="Rascunho de LI">
                  <i class="fas fa-file-alt"></i> LI
                </button>
                <button class="btn btn-sm" style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;" onclick="openFechamento('${imp.id}')" title="Fechamento de Processo / Documentos">
                  <i class="fas fa-folder-open"></i> Fechar
                </button>
              </div>
            </div>

            <!-- Grid de informações -->
            <div style="padding:16px 20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
              <div>
                <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Produto / Descrição</div>
                <div style="font-size:13px;color:#374151;font-weight:600;">${imp.description}</div>
                <div style="font-size:11px;color:#9ca3af;">${imp.netWeight}kg líquido · ${imp.grossWeight}kg bruto</div>
              </div>
              <div>
                <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Invoice</div>
                <div style="font-size:13px;color:#374151;font-weight:600;">${imp.invoiceValueEUR > 0 ? `€ ${imp.invoiceValueEUR.toLocaleString('pt-BR',{minimumFractionDigits:2})}` : `US$ ${imp.invoiceValueUSD.toLocaleString('pt-BR',{minimumFractionDigits:2})}`}</div>
                <div style="font-size:11px;color:#9ca3af;">= R$ ${imp.invoiceValueBRL.toLocaleString('pt-BR',{minimumFractionDigits:2})} (câmbio ${imp.exchangeRate})</div>
              </div>
              <div>
                <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Impostos (Total)</div>
                <div style="font-size:13px;font-weight:800;color:#dc2626;">R$ ${(taxes.taxBRL||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                <div style="font-size:11px;color:#9ca3af;">II:${taxes.ii||0}% | IPI:${taxes.ipi||0}% | ICMS:${taxes.icms||0}%</div>
              </div>
              <div>
                <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Custo Desembaraçado</div>
                <div style="font-size:15px;font-weight:800;color:#1B4F72;">R$ ${(num.totalLandedCostBRL||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                <div style="font-size:11px;color:#9ca3af;">Custo unit.: R$ ${(num.unitCostBRL||0).toFixed(2)}</div>
              </div>
              <div>
                <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Rota</div>
                <div style="font-size:12px;color:#374151;">${imp.portOfOrigin} → ${imp.portOfDestination}</div>
                <div style="font-size:11px;color:#9ca3af;">${imp.incoterm} · Chegada: ${new Date(imp.expectedArrival+'T12:00:00').toLocaleDateString('pt-BR')}</div>
              </div>
            </div>

            <!-- Timeline compacta -->
            <div style="padding:0 20px 16px;">
              <div style="display:flex;gap:0;overflow-x:auto;">
                ${imp.timeline.map((t: any, idx: number) => {
                  const isPast = t.user !== null
                  return `
                  <div style="display:flex;align-items:center;min-width:0;">
                    <div style="display:flex;flex-direction:column;align-items:center;min-width:130px;">
                      <div style="width:28px;height:28px;border-radius:50%;background:${isPast?'#1B4F72':'#e9ecef'};display:flex;align-items:center;justify-content:center;margin-bottom:6px;">
                        <i class="fas ${isPast?'fa-check':'fa-clock'}" style="font-size:11px;color:${isPast?'white':'#9ca3af'};"></i>
                      </div>
                      <div style="font-size:10px;font-weight:600;color:${isPast?'#1B4F72':'#9ca3af'};text-align:center;line-height:1.3;">${t.event}</div>
                      <div style="font-size:10px;color:#9ca3af;text-align:center;">${new Date(t.date+'T12:00:00').toLocaleDateString('pt-BR')}</div>
                    </div>
                    ${idx < imp.timeline.length - 1 ? `<div style="height:2px;background:${isPast?'#1B4F72':'#e9ecef'};width:24px;min-width:24px;margin:0 4px;margin-top:-18px;"></div>` : ''}
                  </div>`
                }).join('')}
              </div>
            </div>
          </div>`
        }).join('')}
      </div>

      <!-- Subseção: Lista de Produtos Importados -->
      <div style="margin-top:32px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
          <div>
            <div style="font-size:16px;font-weight:800;color:#2980B9;display:flex;align-items:center;gap:8px;">
              <i class="fas fa-boxes"></i> Produtos de Fornecedores Importados
            </div>
            <div style="font-size:12px;color:#6c757d;margin-top:2px;">Itens vinculados a fornecedores do tipo "Importado" — com NCM, preço unitário, descrição técnica em PT e EN</div>
          </div>
          <div style="display:flex;gap:8px;">
            <input type="text" id="filterImpProd" class="form-control" placeholder="Filtrar produto..." style="width:200px;font-size:12px;" oninput="filterImportProducts()">
            <button class="btn btn-secondary btn-sm" onclick="toggleImpProdSection()"><i class="fas fa-chevron-down" id="impProdChevron"></i> Expandir</button>
          </div>
        </div>

        <!-- Sumário de stats -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;">
          <div style="background:#e8f4fd;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:20px;font-weight:800;color:#2980B9;">${[...stockItems, ...products].filter((i: any) => { const allSupplierIds = [...(i.supplierIds||[]), ...(productSupplierMap.get(i.code)||[])]; return allSupplierIds.some((sid: string) => suppliers.find((s: any) => s.id === sid && s.type === 'importado')) }).length}</div>
            <div style="font-size:11px;color:#6c757d;margin-top:2px;">Produtos com Forn. Import.</div>
          </div>
          <div style="background:#ede9fe;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:20px;font-weight:800;color:#7c3aed;">${suppliers.filter((s: any) => s.type === 'importado').length}</div>
            <div style="font-size:11px;color:#6c757d;margin-top:2px;">Fornecedores Importados</div>
          </div>
          <div style="background:#f0fdf4;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:20px;font-weight:800;color:#16a34a;">${importsData.length}</div>
            <div style="font-size:11px;color:#6c757d;margin-top:2px;">Processos de Importação</div>
          </div>
        </div>

        <!-- Tabela de produtos importados (colapsável) -->
        <div id="impProdTableSection" style="display:none;">
          <div class="card" style="overflow:hidden;border-top:3px solid #2980B9;">
            <div style="overflow-x:auto;">
              <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                  <tr style="background:#1B4F72;color:white;">
                    <th style="padding:10px 12px;text-align:left;white-space:nowrap;width:90px;">Código</th>
                    <th style="padding:10px 12px;text-align:left;">Descrição (Produto)</th>
                    <th style="padding:10px 12px;text-align:left;">Descrição PT <span style="font-size:9px;opacity:0.8;">(clique p/ editar)</span></th>
                    <th style="padding:10px 12px;text-align:left;">Descrição EN <span style="font-size:9px;opacity:0.8;">(clique p/ editar)</span></th>
                    <th style="padding:10px 12px;text-align:left;width:110px;">NCM <span style="font-size:9px;opacity:0.8;">(clique p/ editar)</span></th>
                    <th style="padding:10px 12px;text-align:left;white-space:nowrap;">Fornecedor</th>
                    <th style="padding:10px 12px;text-align:left;white-space:nowrap;">Status</th>
                  </tr>
                </thead>
                <tbody id="impProdTableBody">
                  ${(() => {
                    const importedSupIds = new Set(suppliers.filter((s: any) => s.type === 'importado').map((s: any) => s.id))
                    const importedItems = [...stockItems, ...products].filter((i: any) => {
                      const allSupplierIds = [...(i.supplierIds||[]), ...(productSupplierMap.get(i.code)||[])]
                      return allSupplierIds.some((sid: string) => importedSupIds.has(sid))
                    })
                    if (importedItems.length === 0) {
                      return `<tr><td colspan="10" style="padding:28px;text-align:center;color:#9ca3af;"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px;"></i>Nenhum item vinculado a fornecedor importado</td></tr>`
                    }
                    // Calcular preço unit. referência a partir do processo de importação se existir
                    return importedItems.map((item: any) => {
                      const supId = [...(item.supplierIds||[]), ...(productSupplierMap.get(item.code)||[])].find((sid: string) => importedSupIds.has(sid))
                      const sup = suppliers.find((s: any) => s.id === supId)
                      // Tentar achar processo de importação que tem esse produto pelo código
                      const relatedImp = importsData.find((imp: any) =>
                        (imp.items || []).some((it: any) => it.productCode === item.code) ||
                        imp.description?.toLowerCase().includes(item.name?.toLowerCase().split(' ')[0]?.toLowerCase())
                      )
                      // Preço unit referência a partir do process de importação ou do pedido de compra
                      const relatedPC = purchaseOrders.find((pc: any) => pc.items?.some((it: any) => it.productCode === item.code))
                      const refUnitPrice = relatedPC?.items?.find((it: any) => it.productCode === item.code)?.unitPrice || 0
                      const qty = item.quantity ?? item.stockCurrent ?? 0
                      const subtotal = refUnitPrice * qty
                      // NCM: pegar do processo de importação se existir
                      // NCM: prioridade = cadastro do produto > processo de importação > notas do fornecedor
                      const ncm = item.ncm || (tenant.impProdDesc?.[item.code]?.['ncm']) || relatedImp?.ncm || sup?.notes?.match(/NCM\s*([\d.]+)/)?.[1] || '—'
                      // Descrição EN: baseada no nome do produto
                      const descEN = item.descEN || (tenant.impProdDesc?.[item.code]?.['descEN']) || item.englishDescription || item.englishDesc || ''
                      // descPT: prioridade = cadastro do produto > impProdDesc > descrição genérica
                      const itemDescPT = item.descPT || (tenant.impProdDesc?.[item.code]?.['descPT']) || item.description || ''
                      const autoDescEN = descEN || (() => {
                        const nameMap: Record<string,string> = {
                          'Chapa Al 6061': 'Aluminum Alloy 6061 Sheet',
                          'Chapa': 'Sheet',
                          'Alumínio': 'Aluminum',
                          'Parafuso': 'Bolt',
                          'Pino': 'Pin',
                          'Rolamento': 'Bearing',
                          'Anel': 'Ring',
                          'Barra': 'Bar',
                          'Bloco': 'Block'
                        }
                        for (const [pt, en] of Object.entries(nameMap)) {
                          if (item.name?.includes(pt)) return en + ' — ' + item.code
                        }
                        return '—'
                      })()
                      const statusColors: Record<string,{c:string,bg:string,l:string}> = {
                        critical: {c:'#dc2626',bg:'#fef2f2',l:'Crítico'},
                        purchase_needed: {c:'#d97706',bg:'#fffbeb',l:'Comprar'},
                        normal: {c:'#16a34a',bg:'#f0fdf4',l:'Normal'},
                        manufacture_needed: {c:'#7c3aed',bg:'#f5f3ff',l:'Fabricar'}
                      }
                      const st = statusColors[item.status || item.stockStatus || 'normal'] || statusColors.normal
                      const technicalDetail = item.description || sup?.notes || '—'
                      return `
                      <tr class="imp-prod-row" data-code="${item.code}" style="border-bottom:1px solid #f1f3f5;" onmouseenter="this.style.background='#f0f9ff'" onmouseleave="this.style.background='white'">
                        <td style="padding:8px 12px;font-family:monospace;font-size:11px;background:#e8f4fd;color:#1B4F72;font-weight:700;white-space:nowrap;">${item.code}</td>
                        <td style="padding:8px 12px;font-weight:600;color:#374151;max-width:180px;">
                          <div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtmlAttr(item.name)}">${item.name}</div>
                          <div style="font-size:10px;color:#9ca3af;">${item.unit}</div>
                        </td>
                        <td style="padding:6px 10px;min-width:160px;" ondblclick="startInlineEdit(this,'impDescPT','${item.code}','descPT')">
                          <div class="imp-inline-view" style="font-size:12px;color:${itemDescPT?'#374151':'#dc2626'};cursor:pointer;min-height:24px;padding:3px 6px;border-radius:4px;border:1px solid transparent;" title="Duplo clique para editar" onmouseenter="this.style.borderColor='#bee3f8'" onmouseleave="this.style.borderColor='transparent'">
                            ${itemDescPT || '<span style=&quot;font-style:italic;font-size:11px;&quot;>— clique para preencher —</span>'}
                          </div>
                          <input class="form-control imp-inline-input" style="display:none;font-size:12px;" data-field="descPT" data-code="${item.code}" value="${escapeHtmlAttr(itemDescPT)}" onblur="saveInlineEdit(this)" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')cancelInlineEdit(this)" placeholder="Descrição em português...">
                        </td>
                        <td style="padding:6px 10px;min-width:160px;" ondblclick="startInlineEdit(this,'impDescEN','${item.code}','descEN')">
                          <div class="imp-inline-view" style="font-size:12px;color:${item.descEN||autoDescEN?'#374151':'#dc2626'};cursor:pointer;min-height:24px;padding:3px 6px;border-radius:4px;border:1px solid transparent;font-style:italic;" title="Duplo clique para editar" onmouseenter="this.style.borderColor='#bee3f8'" onmouseleave="this.style.borderColor='transparent'">
                            ${item.descEN || autoDescEN || '<span style=&quot;font-style:italic;font-size:11px;&quot;>— clique para preencher —</span>'}
                          </div>
                          <input class="form-control imp-inline-input" style="display:none;font-size:12px;" data-field="descEN" data-code="${item.code}" value="${escapeHtmlAttr(item.descEN||autoDescEN||'')}" onblur="saveInlineEdit(this)" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')cancelInlineEdit(this)" placeholder="Description in English...">
                        </td>
                        <td style="padding:6px 10px;min-width:100px;" ondblclick="startInlineEdit(this,'impNCM','${item.code}','ncm')">
                          <div class="imp-inline-view" style="font-size:12px;font-weight:700;color:${ncm!=='—'?'#7c3aed':'#dc2626'};cursor:pointer;min-height:24px;padding:3px 6px;border-radius:4px;border:1px solid transparent;font-family:monospace;" title="Duplo clique para editar" onmouseenter="this.style.borderColor='#ddd6fe'" onmouseleave="this.style.borderColor='transparent'">
                            ${ncm !== '—' ? ncm : '<span style=&quot;font-style:italic;font-size:11px;font-family:sans-serif;&quot;>— preencher —</span>'}
                          </div>
                          <input class="form-control imp-inline-input" style="display:none;font-size:12px;font-family:monospace;" data-field="ncm" data-code="${item.code}" value="${escapeHtmlAttr(ncm!=='—'?ncm:'')}" onblur="saveInlineEdit(this)" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')cancelInlineEdit(this)" placeholder="0000.00.00">
                        </td>
                        <td style="padding:8px 12px;max-width:120px;">
                          <div style="font-size:11px;font-weight:600;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtmlAttr(sup?.name||'—')}">${sup?.name||'—'}</div>
                        </td>
                        <td style="padding:8px 12px;white-space:nowrap;">
                          <span class="badge" style="background:${st.bg};color:${st.c};font-size:10px;">${st.l}</span>
                        </td>
                      </tr>`
                    }).join('')
                  })()}
                </tbody>
              </table>
            </div>
            <!-- Rodapé com totais -->
            <div style="padding:12px 16px;background:#f8f9fa;border-top:1px solid #e9ecef;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
              <div style="font-size:12px;color:#6c757d;">
                <i class="fas fa-info-circle" style="margin-right:4px;"></i>
                Preços unitários de referência baseados nos últimos pedidos de compra. Para atualizar, edite a descrição EN diretamente.
              </div>
              <button class="btn btn-secondary btn-sm" onclick="exportImpProdCSV()">
                <i class="fas fa-file-csv"></i> Exportar CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Subseção: Rascunho de LI -->
      <div style="margin-top:28px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div>
            <div style="font-size:16px;font-weight:800;color:#7c3aed;display:flex;align-items:center;gap:8px;">
              <i class="fas fa-file-alt"></i> Rascunhos de LI (Licença de Importação)
            </div>
            <div style="font-size:12px;color:#6c757d;margin-top:2px;">Pré-preenchimento automático para todos os itens importados — gerado sob solicitação</div>
          </div>
        </div>
        <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;overflow:hidden;">
          <div style="padding:14px 20px;border-bottom:1px solid #ede9fe;display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;gap:10px;font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;">
            <div>Processo / Produto</div><div>NCM</div><div>Regime</div><div>Status LI</div><div>Ações</div>
          </div>
          ${importsData.map((imp: any) => `
          <div style="padding:12px 20px;border-bottom:1px solid #ede9fe;display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;gap:10px;align-items:center;background:white;">
            <div>
              <div style="font-size:13px;font-weight:700;color:#374151;">${imp.code}</div>
              <div style="font-size:11px;color:#9ca3af;">${imp.description} · ${imp.supplierName}</div>
            </div>
            <div style="font-size:13px;font-weight:600;color:#7c3aed;">${imp.ncm}</div>
            <div><span class="badge" style="background:#ede9fe;color:#7c3aed;font-size:11px;">Importação Comum</span></div>
            <div>
              <span class="badge" style="background:#fef2f2;color:#dc2626;font-size:11px;">
                <i class="fas fa-clock" style="font-size:9px;"></i> Pendente
              </span>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-sm" style="background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;font-size:11px;" onclick="openRascunhoLI('${imp.id}')">
                <i class="fas fa-file-alt"></i> Gerar LI
              </button>
            </div>
          </div>`).join('')}
          ${importsData.length === 0 ? `<div style="padding:28px;text-align:center;background:white;color:#9ca3af;font-size:13px;"><i class="fas fa-file-alt" style="font-size:24px;margin-bottom:8px;display:block;"></i>Nenhum processo de importação cadastrado</div>` : ''}
        </div>
      </div>

    </div>
  </div>


  <!-- ══ MODAIS ══════════════════════════════════════════════════════════════ -->

  <!-- Modal: Gerar Cotação -->
  <div class="modal-overlay" id="gerarCotacaoModal">
    <div class="modal" style="max-width:640px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-file-invoice-dollar" style="margin-right:8px;"></i>Gerar Nova Cotação</h3>
        <button onclick="closeModal('gerarCotacaoModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;max-height:70vh;overflow-y:auto;">
        <div class="form-group">
          <label class="form-label">Tipo de Cotação</label>
          <select class="form-control" id="cotTipo" onchange="onCotTipoChange()">
            <option value="manual">Manual — selecionar itens e fornecedores</option>
            <option value="critico">Automático — todos os itens críticos externos</option>
          </select>
        </div>
        <div id="cotItensSection">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <label class="form-label" style="margin:0;">Itens para Cotação</label>
            <button class="btn btn-secondary btn-sm" onclick="addCotItem()"><i class="fas fa-plus"></i> Adicionar Item</button>
          </div>
          <div id="cotItensList">
            <div class="cot-item" style="display:grid;grid-template-columns:2fr 80px 60px auto;gap:8px;margin-bottom:8px;align-items:center;">
              <select class="form-control" style="font-size:12px;">
                <option value="">Selecionar item...</option>
                ${[...stockItems, ...products].map((i: any) => `<option value="${i.code}">${i.name} (${i.code})</option>`).join('')}
              </select>
              <input class="form-control" type="number" placeholder="Qtd" min="1">
              <input class="form-control" type="text" placeholder="Un" value="un">
              <button class="btn btn-danger btn-sm" onclick="this.closest('.cot-item').remove()"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        </div>
        <div style="margin-top:14px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <label class="form-label" style="margin:0;">Fornecedores (cotações serão enviadas separadamente)</label>
            <button class="btn btn-secondary btn-sm" onclick="addCotSupplier()"><i class="fas fa-plus"></i> Adicionar</button>
          </div>
          <div id="cotSupplierList">
            <div class="cot-sup" style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
              <select class="form-control" style="font-size:12px;flex:1;">
                <option value="">Selecionar fornecedor...</option>
                ${suppliers.map((s: any) => `<option value="${s.id}">${s.name} (${s.type}) — Prazo: ${s.deliveryLeadDays}d</option>`).join('')}
              </select>
              <button class="btn btn-danger btn-sm" onclick="this.closest('.cot-sup').remove()"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        </div>
        <div class="form-group" style="margin-top:12px;">
          <label class="form-label">Data Limite *</label>
          <input class="form-control" type="date" id="cotDataLimite">
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" rows="2" placeholder="Condições especiais, especificações técnicas..." id="cotObs"></textarea>
        </div>
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;font-size:12px;color:#92400e;">
          <i class="fas fa-info-circle" style="margin-right:6px;"></i>
          <strong>Múltiplos fornecedores:</strong> E-mails serão enviados separadamente para cada fornecedor, com link individual para resposta. Você será notificado quando todas as cotações forem recebidas.
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('gerarCotacaoModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarCotacao()" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Gerar e Disparar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Detalhes Cotação -->
  <div class="modal-overlay" id="quotationDetailModal">
    <div class="modal" style="max-width:660px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;" id="quotDetailTitle"><i class="fas fa-file-invoice-dollar" style="margin-right:8px;"></i>Detalhes da Cotação</h3>
        <button onclick="closeModal('quotationDetailModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;max-height:60vh;overflow-y:auto;" id="quotDetailBody"></div>
      <div id="quotNegotiationArea" style="display:none;padding:0 24px 16px;">
        <label style="font-size:12px;font-weight:700;color:#2563eb;display:block;margin-bottom:4px;"><i class="fas fa-comments" style="margin-right:4px;"></i>Observações da Negociação</label>
        <textarea id="quotNegotiationObs" class="form-control" rows="3" placeholder="Descreva os termos da negociação, contrapropostas ou condições..."></textarea>
      </div>
      <div style="padding:14px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;" id="quotDetailActions">
        <button onclick="closeModal('quotationDetailModal')" class="btn btn-secondary">Fechar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Detalhes Importação -->
  <div class="modal-overlay" id="importDetailModal">
    <div class="modal" style="max-width:740px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;" id="importDetailTitle"><i class="fas fa-ship" style="margin-right:8px;"></i>Processo de Importação</h3>
        <button onclick="closeModal('importDetailModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;max-height:75vh;overflow-y:auto;" id="importDetailBody"></div>
      <div style="padding:14px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;">
        <button onclick="closeModal('importDetailModal')" class="btn btn-secondary">Fechar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Pré-via de Numerário -->
  <div class="modal-overlay" id="numerarioModal">
    <div class="modal" style="max-width:660px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;" id="numerarioTitle"><i class="fas fa-calculator" style="margin-right:8px;"></i>Pré-via de Numerário</h3>
        <button onclick="closeModal('numerarioModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;max-height:75vh;overflow-y:auto;" id="numerarioBody"></div>
      <div style="padding:14px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:space-between;align-items:center;">
        <button class="btn btn-secondary btn-sm" onclick="printNumerario()"><i class="fas fa-print"></i> Imprimir</button>
        <button onclick="closeModal('numerarioModal')" class="btn btn-secondary">Fechar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Nova Importação (expandido) -->
  <div class="modal-overlay" id="novaImportacaoModal">
    <div class="modal" style="max-width:860px;">
      <div style="padding:18px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-ship" style="margin-right:8px;"></i>Nova Importação</h3>
        <button onclick="closeModal('novaImportacaoModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <!-- Abas internas do modal -->
      <div style="display:flex;gap:0;border-bottom:2px solid #e9ecef;padding:0 24px;background:#f8f9fa;">
        <button class="imp-modal-tab active" id="impTab1" onclick="switchImpTab(1)" style="padding:10px 18px;font-size:13px;font-weight:600;border:none;background:none;color:#1B4F72;border-bottom:2px solid #1B4F72;margin-bottom:-2px;cursor:pointer;">1. Cabeçalho</button>
        <button class="imp-modal-tab" id="impTab2" onclick="switchImpTab(2)" style="padding:10px 18px;font-size:13px;font-weight:600;border:none;background:none;color:#6c757d;cursor:pointer;">2. Itens da Invoice</button>
        <button class="imp-modal-tab" id="impTab3" onclick="switchImpTab(3)" style="padding:10px 18px;font-size:13px;font-weight:600;border:none;background:none;color:#6c757d;cursor:pointer;">3. Impostos & Numerário</button>
      </div>
      <div style="padding:20px 24px;max-height:68vh;overflow-y:auto;">

        <!-- ABA 1: Cabeçalho -->
        <div id="impTabContent1">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div class="form-group" style="grid-column:span 2;">
              <label class="form-label">Fornecedor *</label>
              <select class="form-control" id="impFornecedor">
                <option value="">Selecionar fornecedor importado...</option>
                ${suppliers.filter((s: any) => s.type === 'importado').map((s: any) => `<option value="${s.id}">${s.name} (${s.country})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Nº Invoice *</label>
              <input class="form-control" id="impInvoice" type="text" placeholder="Ex: INV-2024-002">
            </div>
            <div class="form-group">
              <label class="form-label">Data Invoice</label>
              <input class="form-control" id="impDataInvoice" type="date">
            </div>
            <!-- Modalidade de transporte -->
            <div class="form-group" style="grid-column:span 2;">
              <label class="form-label"><i class="fas fa-route" style="margin-right:5px;color:#1B4F72;"></i>Modalidade de Transporte *</label>
              <div style="display:flex;gap:12px;margin-top:4px;" id="impModalidadeGroup">
                <label style="display:flex;align-items:center;gap:8px;padding:10px 16px;border:2px solid #e9ecef;border-radius:8px;cursor:pointer;flex:1;transition:all 0.2s;" id="lblAereo" onclick="selectModalidade('aereo')">
                  <i class="fas fa-plane" style="color:#2980B9;font-size:18px;"></i>
                  <span style="font-size:13px;font-weight:600;">Aéreo</span>
                  <input type="radio" name="impModalidade" value="aereo" style="margin-left:auto;">
                </label>
                <label style="display:flex;align-items:center;gap:8px;padding:10px 16px;border:2px solid #e9ecef;border-radius:8px;cursor:pointer;flex:1;transition:all 0.2s;" id="lblTerrestre" onclick="selectModalidade('terrestre')">
                  <i class="fas fa-truck" style="color:#27AE60;font-size:18px;"></i>
                  <span style="font-size:13px;font-weight:600;">Terrestre</span>
                  <input type="radio" name="impModalidade" value="terrestre" style="margin-left:auto;">
                </label>
                <label style="display:flex;align-items:center;gap:8px;padding:10px 16px;border:2px solid #e9ecef;border-radius:8px;cursor:pointer;flex:1;transition:all 0.2s;" id="lblMaritimo" onclick="selectModalidade('maritimo')">
                  <i class="fas fa-ship" style="color:#7c3aed;font-size:18px;"></i>
                  <span style="font-size:13px;font-weight:600;">Marítimo</span>
                  <input type="radio" name="impModalidade" value="maritimo" checked style="margin-left:auto;">
                </label>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Incoterm</label>
              <select class="form-control" id="impIncoterm">
                <option value="CIF">CIF — Cost, Insurance &amp; Freight</option>
                <option value="FOB">FOB — Free On Board</option>
                <option value="EXW">EXW — Ex Works</option>
                <option value="DDU">DDU — Delivered Duty Unpaid</option>
                <option value="DDP">DDP — Delivered Duty Paid</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Moeda</label>
              <select class="form-control" id="impMoeda" onchange="updateImpMoedaLabel()">
                <option value="EUR">EUR — Euro</option>
                <option value="USD">USD — Dólar EUA</option>
                <option value="GBP">GBP — Libra Esterlina</option>
                <option value="CNY">CNY — Yuan Chinês</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Taxa de Câmbio (R$)</label>
              <input class="form-control" type="number" id="impCambio" value="5.52" min="0" step="0.01" oninput="calcImpBRL()">
            </div>
            <div class="form-group" id="impOrigemGroup">
              <label class="form-label" id="impOrigemLabel">Porto de Origem</label>
              <input class="form-control" id="impOrigem" type="text" placeholder="Ex: Hamburg, Rotterdam">
            </div>
            <div class="form-group" id="impDestinoGroup">
              <label class="form-label" id="impDestinoLabel">Porto de Destino</label>
              <input class="form-control" id="impDestino" type="text" value="Santos" placeholder="Santos, Itajaí...">
            </div>
            <div class="form-group">
              <label class="form-label">Chegada Prevista</label>
              <input class="form-control" id="impChegada" type="date">
            </div>
            <div class="form-group">
              <label class="form-label">Peso Bruto Total (kg)</label>
              <input class="form-control" id="impPesoBruto" type="number" placeholder="0">
            </div>
          </div>
          <div style="text-align:right;margin-top:12px;">
            <button class="btn btn-primary" onclick="switchImpTab(2)">Próximo: Itens da Invoice <i class="fas fa-arrow-right"></i></button>
          </div>
        </div>

        <!-- ABA 2: Itens da Invoice -->
        <div id="impTabContent2" style="display:none;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div style="font-size:14px;font-weight:700;color:#1B4F72;"><i class="fas fa-boxes" style="margin-right:6px;"></i>Itens da Invoice</div>
            <button class="btn btn-primary btn-sm" onclick="addImpItem()"><i class="fas fa-plus"></i> Adicionar Item</button>
          </div>
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#92400e;">
            <i class="fas fa-info-circle" style="margin-right:6px;"></i>
            <strong>Atenção:</strong> Cada item deve ter NCM, Descrição em Português e em Inglês (obrigatórias para LI e DI). O subtotal é calculado automaticamente.
          </div>
          <!-- Cabeçalho da tabela Invoice -->
          <div style="display:grid;grid-template-columns:90px 2fr 70px 1fr 90px 90px 80px 36px;gap:6px;padding:6px 8px;background:#f1f3f5;border-radius:6px;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;margin-bottom:4px;">
            <div>Cód.</div><div>Descrição EN</div><div>Qtd</div><div>Observações</div><div>Val. Unit.</div><div>Val. Total</div><div>NCM</div><div></div>
          </div>
          <div id="impItensList" style="display:flex;flex-direction:column;gap:6px;">
            <!-- Itens adicionados dinamicamente -->
          </div>
          <div style="margin-top:12px;padding:12px 16px;background:#f0fdf4;border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:13px;font-weight:600;color:#374151;"><i class="fas fa-sigma" style="margin-right:6px;color:#27AE60;"></i>Total Invoice (moeda):</span>
            <span id="impTotalMoeda" style="font-size:16px;font-weight:800;color:#1B4F72;">0.00</span>
          </div>
          <div style="margin-top:6px;padding:10px 16px;background:#e8f4fd;border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:13px;font-weight:600;color:#374151;"><i class="fas fa-exchange-alt" style="margin-right:6px;color:#2980B9;"></i>Total Invoice (BRL):</span>
            <span id="impTotalBRL" style="font-size:16px;font-weight:800;color:#2980B9;">R$ 0,00</span>
          </div>
          <input type="hidden" id="impBRL" value="0">
          <div style="display:flex;justify-content:space-between;margin-top:14px;">
            <button class="btn btn-secondary" onclick="switchImpTab(1)"><i class="fas fa-arrow-left"></i> Voltar</button>
            <button class="btn btn-primary" onclick="switchImpTab(3)">Próximo: Impostos &amp; Numerário <i class="fas fa-arrow-right"></i></button>
          </div>
        </div>

        <!-- ABA 3: Impostos & Numerário -->
        <div id="impTabContent3" style="display:none;">
          <div style="background:#e8f4fd;border-radius:8px;padding:14px;margin-bottom:14px;">
            <div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:12px;"><i class="fas fa-percent" style="margin-right:6px;"></i>Alíquotas de Impostos</div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
              <div class="form-group" style="margin:0;">
                <label class="form-label">II (%)</label>
                <input class="form-control" type="number" value="12" id="taxII" min="0" step="0.01" oninput="calcImpostos()">
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label">IPI (%)</label>
                <input class="form-control" type="number" value="5" id="taxIPI" min="0" step="0.01" oninput="calcImpostos()">
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label">PIS (%)</label>
                <input class="form-control" type="number" value="1.65" id="taxPIS" min="0" step="0.01" oninput="calcImpostos()">
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label">COFINS (%)</label>
                <input class="form-control" type="number" value="7.6" id="taxCOFINS" min="0" step="0.01" oninput="calcImpostos()">
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label">ICMS (%)</label>
                <input class="form-control" type="number" value="12" id="taxICMS" min="0" step="0.01" oninput="calcImpostos()">
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label">AFRMM (R$)</label>
                <input class="form-control" type="number" value="25" id="taxAFRMM" min="0" step="0.01" oninput="calcImpostos()">
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label">SISCOMEX (R$)</label>
                <input class="form-control" type="number" value="185" id="taxSISCOMEX" min="0" step="0.01" oninput="calcImpostos()">
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label"><strong>Total Impostos</strong></label>
                <input class="form-control" type="text" id="taxTotal" readonly style="background:#fef2f2;color:#dc2626;font-weight:700;">
              </div>
            </div>
          </div>

          <div style="background:#f5f3ff;border-radius:8px;padding:14px;margin-bottom:14px;">
            <div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:12px;"><i class="fas fa-calculator" style="margin-right:6px;"></i>Pré-via de Numerário (despesas estimadas)</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
              <div class="form-group" style="margin:0;">
                <label class="form-label">Frete (R$)</label>
                <input class="form-control" type="number" id="numFrete" value="1500" min="0" oninput="calcNumerario()">
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label">Seguro (R$)</label>
                <input class="form-control" type="number" id="numSeguro" value="300" min="0" oninput="calcNumerario()">
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label">Despachante (R$)</label>
                <input class="form-control" type="number" id="numDesp" value="1200" min="0" oninput="calcNumerario()">
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label">Taxas Porto (R$)</label>
                <input class="form-control" type="number" id="numPorto" value="800" min="0" oninput="calcNumerario()">
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label">Armazenagem (R$)</label>
                <input class="form-control" type="number" id="numArm" value="400" min="0" oninput="calcNumerario()">
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label"><strong>Custo Total Desemb.</strong></label>
                <input class="form-control" type="text" id="numTotal" readonly style="background:#ede9fe;color:#7c3aed;font-weight:700;">
              </div>
            </div>
          </div>

          <!-- Resumo final -->
          <div style="background:#1B4F72;border-radius:8px;padding:14px;color:white;">
            <div style="font-size:13px;font-weight:700;margin-bottom:10px;"><i class="fas fa-chart-pie" style="margin-right:6px;"></i>Resumo do Processo</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;" id="impResumoGrid">
              <div style="background:rgba(255,255,255,0.1);border-radius:6px;padding:10px;text-align:center;">
                <div style="font-size:10px;opacity:0.7;">ITENS NA INVOICE</div>
                <div style="font-size:20px;font-weight:800;" id="impResumoItens">0</div>
              </div>
              <div style="background:rgba(255,255,255,0.1);border-radius:6px;padding:10px;text-align:center;">
                <div style="font-size:10px;opacity:0.7;">TOTAL IMPOSTOS</div>
                <div style="font-size:14px;font-weight:800;" id="impResumoImpostos">R$ 0,00</div>
              </div>
              <div style="background:rgba(255,255,255,0.15);border-radius:6px;padding:10px;text-align:center;border:1px solid rgba(255,255,255,0.3);">
                <div style="font-size:10px;opacity:0.7;">CUSTO TOTAL DESEMBARAÇADO</div>
                <div style="font-size:16px;font-weight:800;" id="impResumoCusto">R$ 0,00</div>
              </div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:14px;">
            <button class="btn btn-secondary" onclick="switchImpTab(2)"><i class="fas fa-arrow-left"></i> Voltar</button>
          </div>
        </div>

      </div>
      <div style="padding:14px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:12px;color:#9ca3af;">* Campos obrigatórios</div>
        <div style="display:flex;gap:10px;">
          <button onclick="closeModal('novaImportacaoModal')" class="btn btn-secondary">Cancelar</button>
          <button onclick="salvarImportacao()" class="btn btn-primary"><i class="fas fa-save"></i> Criar Processo</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal: Rascunho de LI (Licença de Importação) -->
  <div class="modal-overlay" id="rascunhoLIModal">
    <div class="modal" style="max-width:800px;">
      <div style="padding:18px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#7c3aed;"><i class="fas fa-file-alt" style="margin-right:8px;"></i>Rascunho de LI — <span id="liImpCodigo"></span></h3>
        <button onclick="closeModal('rascunhoLIModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;max-height:75vh;overflow-y:auto;" id="rascunhoLIBody">
      </div>
      <div style="padding:14px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:space-between;">
        <button class="btn btn-secondary btn-sm" onclick="imprimirLI()"><i class="fas fa-print"></i> Imprimir / PDF</button>
        <div style="display:flex;gap:10px;">
          <button onclick="closeModal('rascunhoLIModal')" class="btn btn-secondary">Fechar</button>
          <button onclick="showToastSup('✅ Rascunho de LI enviado ao despachante!', 'success')" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Enviar ao Despachante</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal: Fechamento de Processo (histórico de arquivos) -->
  <div class="modal-overlay" id="fechamentoProcessoModal">
    <div class="modal" style="max-width:760px;">
      <div style="padding:18px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-folder-open" style="margin-right:8px;"></i>Fechamento de Processo — <span id="fechImpCodigo"></span></h3>
        <button onclick="closeModal('fechamentoProcessoModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;max-height:75vh;overflow-y:auto;">
        <!-- Sub-abas de fechamento -->
        <div style="display:flex;gap:0;border-bottom:2px solid #e9ecef;margin-bottom:16px;">
          <button class="fech-tab active" id="fechTabDoc" onclick="switchFechTab('doc')" style="padding:8px 16px;font-size:12px;font-weight:600;border:none;background:none;color:#1B4F72;border-bottom:2px solid #1B4F72;margin-bottom:-2px;cursor:pointer;"><i class="fas fa-file-upload" style="margin-right:5px;"></i>Documentos</button>
          <button class="fech-tab" id="fechTabHist" onclick="switchFechTab('hist')" style="padding:8px 16px;font-size:12px;font-weight:600;border:none;background:none;color:#6c757d;cursor:pointer;"><i class="fas fa-history" style="margin-right:5px;"></i>Histórico</button>
          <button class="fech-tab" id="fechTabAudit" onclick="switchFechTab('audit')" style="padding:8px 16px;font-size:12px;font-weight:600;border:none;background:none;color:#6c757d;cursor:pointer;"><i class="fas fa-shield-alt" style="margin-right:5px;"></i>Auditoria</button>
        </div>

        <!-- Aba: Documentos -->
        <div id="fechTabContentDoc">
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#92400e;">
            <i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>
            <strong>Documentos obrigatórios:</strong> Invoice Comercial, Packing List, BL/AWB/CRT, LI aprovada, DI, DANFE de Importação, Comprovante de câmbio.
          </div>
          <!-- Área de upload -->
          <div id="fechUploadArea" style="border:2px dashed #cbd5e1;border-radius:10px;padding:28px;text-align:center;margin-bottom:16px;cursor:pointer;transition:all 0.2s;" onmouseenter="this.style.borderColor='#1B4F72'" onmouseleave="this.style.borderColor='#cbd5e1'" onclick="document.getElementById('fechFileInput').click()">
            <i class="fas fa-cloud-upload-alt" style="font-size:32px;color:#1B4F72;margin-bottom:10px;"></i>
            <div style="font-size:14px;font-weight:600;color:#374151;">Arraste arquivos aqui ou clique para selecionar</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:4px;">PDF, XLSX, DOCX, JPG, PNG — Máx. 25MB por arquivo</div>
            <input type="file" id="fechFileInput" multiple style="display:none" onchange="addFechDocuments(this.files)">
          </div>
          <!-- Categorias de documentos -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
            ${['Invoice Comercial', 'Packing List', 'BL / AWB / CRT', 'LI (Licença Importação)', 'DI (Declaração Importação)', 'DANFE de Importação', 'Comprovante de Câmbio', 'Certificado de Origem', 'Apólice de Seguro', 'Outros'].map((doc, i) => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f8f9fa;border-radius:8px;border:1px solid #e9ecef;" id="docSlot${i}">
              <div style="width:32px;height:32px;background:#e9ecef;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;" id="docSlotIcon${i}">
                <i class="fas fa-file-pdf" style="color:#9ca3af;font-size:14px;"></i>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:12px;font-weight:600;color:#374151;">${doc}</div>
                <div style="font-size:11px;color:#9ca3af;" id="docSlotStatus${i}">Aguardando upload</div>
              </div>
              <button class="btn btn-sm" style="background:#e8f4fd;color:#2980B9;border:1px solid #bee3f8;" data-action="upload-doc" data-slot-index="${i}" data-slot-doc="${escapeHtmlAttr(doc)}"><i class="fas fa-upload"></i></button>
            </div>`).join('')}
          </div>
        </div>

        <!-- Aba: Histórico -->
        <div id="fechTabContentHist" style="display:none;">
          <div id="fechHistoricoBody">
            <!-- Preenchido pelo JS -->
          </div>
        </div>

        <!-- Aba: Auditoria -->
        <div id="fechTabContentAudit" style="display:none;">
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:14px;">
            <i class="fas fa-shield-alt" style="color:#16a34a;margin-right:8px;"></i>
            <strong style="font-size:13px;color:#15803d;">Registro de Auditoria</strong>
            <span style="font-size:12px;color:#374151;"> — Todas as ações são registradas automaticamente com usuário, data e hora para fins de auditoria.</span>
          </div>
          <div id="fechAuditoriaBody">
            <!-- Preenchido pelo JS -->
          </div>
        </div>

      </div>
      <div style="padding:14px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:12px;color:#9ca3af;"><i class="fas fa-lock" style="margin-right:4px;"></i>Histórico imutável para fins de auditoria fiscal</div>
        <button onclick="closeModal('fechamentoProcessoModal')" class="btn btn-secondary">Fechar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Novo Pedido de Compra -->
  <div class="modal-overlay" id="novoPedidoCompraModal">
    <div class="modal" style="max-width:560px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-shopping-cart" style="margin-right:8px;"></i>Novo Pedido de Compra</h3>
        <button onclick="closeModal('novoPedidoCompraModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Cotação de Referência *</label>
            <select class="form-control" id="formQuotationRef" required onchange="carregarItensQuotacao()">
              <option value="">— Selecione uma cotação aprovada —</option>
              ${(quotations as any[]).filter((q: any) => q.status === 'approved').sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((q: any) => {
                const bestResponse = (q.supplierResponses || []).reduce((best: any, r: any) => (!best || r.totalPrice < best.totalPrice) ? r : best, null)
                const totalValue = bestResponse ? bestResponse.totalPrice : (q.items || []).reduce((sum: number, item: any) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0)
                const supplierName = bestResponse?.supplierName || q.supplierName || q.supplierResponses?.[0]?.supplierName || 'Fornecedor'
                return `<option value="${q.id}">${q.code} | ${supplierName} | R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</option>`
              }).join('')}
              ${(quotations as any[]).filter((q: any) => q.status === 'approved').length === 0 ? '<option value="" disabled>Nenhuma cotação aprovada disponível</option>' : ''}
            </select>
          </div>
          <div id="quotationItemsContainer" style="display:none;grid-column:span 2;">
            <label class="form-label" style="font-weight:700;">Itens da Cotação</label>
            <div id="quotationItems" style="margin-top:8px;"></div>
          </div>
          <div class="form-group"><label class="form-label">Data do Pedido *</label><input class="form-control" type="date" id="formPedidoData" required></div>
          <div class="form-group"><label class="form-label">Data de Entrega *</label><input class="form-control" type="date" id="formDataEntrega" required></div>
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Observações</label><textarea class="form-control" rows="2" placeholder="Observações especiais para o pedido..." id="formObservacoes"></textarea></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novoPedidoCompraModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarNovoPedidoCompra()" class="btn btn-primary" id="btnCriarPC"><i class="fas fa-save"></i> Salvar Pedido de Compra</button>
      </div>
    </div>
  </div>

  <!-- Modal: Detalhes do Pedido de Compra -->
  <div class="modal-overlay" id="pedidoCompraDetailModal">
    <div class="modal" style="max-width:620px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 id="pedidoDetailTitle" style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-shopping-cart" style="margin-right:8px;"></i>Detalhes do Pedido de Compra</h3>
        <button onclick="closeModal('pedidoCompraDetailModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div id="pedidoDetailBody" style="padding:24px;max-height:70vh;overflow-y:auto;"></div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;">
        <button onclick="closeModal('pedidoCompraDetailModal')" class="btn btn-secondary">Fechar</button>
      </div>
    </div>
  </div>

  <script src="/static/purchase-order-actions.js"></script>
  <script src="/static/pedido-modal.js"></script>
  <script src="/static/suprimentos-init.js"></script>
  <script src="/static/quotations-actions.js"></script>
  `

  return c.html(layout('Suprimentos', content, 'suprimentos', userInfo))
})

// ── Interface pública para fornecedor responder cotação (redireciona para URL com código) ──
app.get('/cotacao/:id/responder', (c) => {
  const quotId = c.req.param('id')
  const tenant = getCtxTenant(c)
  const quotations = tenant.quotations || []
  const q = quotations.find((x: any) => x.id === quotId)

  if (!q) {
    return c.html(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;">
      <h2 style="color:#dc2626;">Cotação não encontrada</h2><p>O link pode ter expirado ou ser inválido.</p></body></html>`, 404)
  }

  if (q.code) {
    return c.redirect(`/suprimentos/quote-response?code=${encodeURIComponent(q.code)}`, 301)
  }

  const userInfo = getCtxUserInfo(c)
  const suppliers = tenant.suppliers || []
  const productSuppliers = tenant.productSuppliers || []

  const firstItem = q.items[0]
  const ps = (productSuppliers as any[]).find((p: any) => p.productCode === firstItem?.productCode)
  const mainSupplierId = ps?.supplierIds?.[0]
  const supplier = suppliers.find((s: any) => s.id === mainSupplierId)

  return c.html(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cotação ${q.code} — Resposta do Fornecedor</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f4f8; }
    .form-control { width: 100%; padding: 10px 12px; border: 1.5px solid #d1d5db; border-radius: 8px; font-size: 13px; outline: none; box-sizing: border-box; }
    .form-control:focus { border-color: #2980B9; box-shadow: 0 0 0 3px rgba(41,128,185,0.1); }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; }
    .btn-primary { background: #1B4F72; color: white; }
    .btn-success { background: #27AE60; color: white; }
  </style>
</head>
<body>
  <div style="max-width:680px;margin:40px auto;padding:0 16px;">
    <div style="background:#1B4F72;border-radius:12px 12px 0 0;padding:24px;display:flex;align-items:center;gap:16px;">
      <div style="width:48px;height:48px;background:rgba(255,255,255,0.15);border-radius:10px;display:flex;align-items:center;justify-content:center;">
        <i class="fas fa-file-invoice-dollar" style="color:white;font-size:22px;"></i>
      </div>
      <div>
        <div style="font-size:18px;font-weight:800;color:white;">Resposta de Cotação</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.7);">${q.code} — PCP Planner</div>
      </div>
    </div>
    <div style="background:white;padding:24px;border-radius:0 0 12px 12px;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
      ${q.status === 'pending_approval' || q.status === 'approved' ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;text-align:center;">
        <i class="fas fa-check-circle" style="font-size:32px;color:#27AE60;margin-bottom:8px;"></i>
        <div style="font-size:15px;font-weight:700;color:#15803d;">Cotação já respondida!</div>
        <div style="font-size:13px;color:#6c757d;margin-top:4px;">Sua resposta foi recebida e está sendo analisada pela equipe de compras.</div>
      </div>` : `
      <div style="margin-bottom:20px;">
        <div style="font-size:14px;color:#6c757d;margin-bottom:4px;">Solicitante</div>
        <div style="font-size:16px;font-weight:700;color:#1B4F72;">${userInfo.empresa} — PCP Planner</div>
        <div style="font-size:13px;color:#9ca3af;">Data: ${new Date(q.createdAt+'T12:00:00').toLocaleDateString('pt-BR')}</div>
      </div>
      <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:12px;"><i class="fas fa-boxes" style="margin-right:6px;color:#2980B9;"></i>Itens para Cotação</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#e9ecef;">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6c757d;text-transform:uppercase;">Item</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6c757d;text-transform:uppercase;">Qtd</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6c757d;text-transform:uppercase;">Un.</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6c757d;text-transform:uppercase;">Preço Unit. *</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6c757d;text-transform:uppercase;">Total</th>
          </thead>
          <tbody>
            ${q.items.map((it: any, idx: number) => `
            <tr style="border-bottom:1px solid #e9ecef;">
              <td style="padding:10px 12px;font-weight:600;color:#374151;">${it.productName}</td>
              <td style="padding:10px 12px;font-weight:700;color:#1B4F72;">${it.quantity}</td>
              <td style="padding:10px 12px;color:#6c757d;">${it.unit}</td>
              <td style="padding:10px 12px;">
                <div style="display:flex;align-items:center;gap:4px;">
                  <span style="color:#6c757d;font-size:12px;">R$</span>
                  <input type="number" id="unitPrice_${idx}" class="form-control" style="width:100px;" placeholder="0,00" min="0" step="0.01" oninput="calcTotal(${idx},${it.quantity})">
                </div>
              </td>
              <td style="padding:10px 12px;font-weight:700;color:#27AE60;" id="total_${idx}">R$ 0,00</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr style="background:#f8f9fa;">
            <td colspan="4" style="padding:10px 12px;font-weight:700;color:#374151;text-align:right;">TOTAL GERAL:</td>
            <td style="padding:10px 12px;font-weight:800;color:#1B4F72;font-size:16px;" id="grandTotal">R$ 0,00</td>
          </tr></tfoot>
        </table>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;">
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;"><i class="fas fa-clock" style="margin-right:4px;color:#2980B9;"></i>Prazo de Entrega (dias) *</label>
          <input type="number" id="deliveryDays" class="form-control" placeholder="Ex: 7" min="1">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;"><i class="fas fa-credit-card" style="margin-right:4px;color:#2980B9;"></i>Condições de Pagamento</label>
          <input type="text" id="paymentTerms" class="form-control" placeholder="Ex: 30 dias" value="${escapeHtmlAttr(supplier?.paymentTerms||'')}">
        </div>
        <div style="grid-column:span 2;">
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">Observações / Condições Especiais</label>
          <textarea id="supNotes" class="form-control" rows="3" placeholder="Validade da proposta, condições de frete, disponibilidade..."></textarea>
        </div>
      </div>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;margin-bottom:20px;font-size:12px;color:#92400e;">
        <i class="fas fa-info-circle" style="margin-right:6px;"></i>
        <strong>Importante:</strong> Ao enviar, os valores serão registrados automaticamente no sistema. Um e-mail de confirmação será enviado.
      </div>
      <div style="display:flex;gap:12px;justify-content:flex-end;">
        <button class="btn" style="background:#f1f3f5;color:#374151;" onclick="window.close()">Cancelar</button>
        <button class="btn btn-success" onclick="submitQuotation()"><i class="fas fa-paper-plane"></i> Enviar Cotação</button>
      </div>`}
    </div>
    <div style="text-align:center;margin-top:16px;font-size:12px;color:#9ca3af;">
      <i class="fas fa-shield-alt" style="margin-right:4px;"></i> Formulário seguro • PCP Planner © ${new Date().getFullYear()}
    </div>
  </div>
  <script>
  const items = ${JSON.stringify(q.items)};
  const totals = new Array(items.length).fill(0);
  const quotId = ${JSON.stringify(q.id || '')};
  const supplierNameFromCtx = ${JSON.stringify(supplier?.name || '')};

  function calcTotal(idx, qty) {
    const price = parseFloat(document.getElementById('unitPrice_' + idx).value) || 0;
    totals[idx] = price * qty;
    document.getElementById('total_' + idx).textContent = 'R$ ' + totals[idx].toLocaleString('pt-BR', {minimumFractionDigits:2});
    const grand = totals.reduce((a, b) => a + b, 0);
    document.getElementById('grandTotal').textContent = 'R$ ' + grand.toLocaleString('pt-BR', {minimumFractionDigits:2});
  }

  async function submitQuotation() {
    const days = document.getElementById('deliveryDays').value;
    const paymentTerms = document.getElementById('paymentTerms').value || '';
    const supNotes = document.getElementById('supNotes').value || '';
    const allFilled = items.every((_, idx) => parseFloat(document.getElementById('unitPrice_' + idx).value) > 0);
    if (!allFilled) { alert('⚠ Preencha o preço unitário de todos os itens!'); return; }
    if (!days) { alert('⚠ Informe o prazo de entrega!'); return; }
    const grand = totals.reduce((a, b) => a + b, 0);
    const itemsWithPrice = items.map((it, idx) => ({
      productCode: it.productCode,
      productName: it.productName,
      quantity: it.quantity,
      unit: it.unit || 'un',
      unitPrice: parseFloat(document.getElementById('unitPrice_' + idx).value) || 0,
      totalPrice: totals[idx] || 0,
    }));
    const btn = document.querySelector('.btn-success');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    try {
      const res = await fetch('/suprimentos/api/quotations/' + quotId + '/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierName: supplierNameFromCtx || 'Fornecedor',
          totalPrice: grand,
          deliveryDays: parseInt(days),
          paymentTerms,
          notes: supNotes,
          items: itemsWithPrice,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        document.querySelector('body > div').innerHTML += '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:100;">' +
          '<div style="background:white;border-radius:16px;padding:40px;text-align:center;max-width:400px;">' +
          '<i class="fas fa-check-circle" style="font-size:64px;color:#27AE60;margin-bottom:16px;"></i>' +
          '<h2 style="color:#1B4F72;margin-bottom:8px;">Cotação Enviada!</h2>' +
          '<p style="color:#6c757d;font-size:14px;">Sua cotação foi recebida.<br>Total: <strong>R$ ' + grand.toLocaleString('pt-BR',{minimumFractionDigits:2}) + '</strong><br>Prazo: <strong>' + days + ' dias</strong></p>' +
          '<p style="color:#6c757d;font-size:12px;margin-top:12px;">A equipe de compras será notificada e entrará em contato em caso de aprovação.</p>' +
          '</div></div>';
      } else {
        alert('❌ Erro ao enviar: ' + (data.error || 'Erro desconhecido'));
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Cotação';
      }
    } catch(e) {
      alert('❌ Erro de conexão. Verifique sua internet e tente novamente.');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Cotação';
    }
  }
</script>
</body>
</html>`)
})

// ── Rota pública: GET /suprimentos/quote-response?code=<quotCode> ───────────────
app.get('/quote-response', async (c) => {
  const quotCode = c.req.query('code')

  if (!quotCode) {
    return c.html(`
      <div style="text-align:center;padding:40px;">
        <h2>Erro: Cotação não especificada</h2>
        <p><a href="/">Voltar</a></p>
      </div>
    `)
  }

  console.log('[COTAÇÃO-RESPOSTA] Abrindo formulário para:', quotCode)

  // Search for the quotation across all tenants
  let quotId = ''
  let quotItems: any[] = []
  let quotDeadline = ''
  const allTenantEntries = Object.entries(tenants)
  for (const [, t] of allTenantEntries) {
    const q = (t.quotations || []).find((q: any) => q.code === quotCode)
    if (q) {
      quotId = q.id || ''
      quotItems = q.items || []
      quotDeadline = q.deadline || ''
      break
    }
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Responder Cotação</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #f8f9fa; font-family: system-ui, -apple-system, sans-serif; }
    .container { max-width: 600px; margin: 40px auto; padding: 20px; }
    .card { background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 24px; }
    h1 { margin-bottom: 24px; color: #1B4F72; }
    .info-box { background: #f0f4f8; padding: 16px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #2980B9; }
    .info-box p { margin: 8px 0; font-size: 14px; }
    .form-group { margin-bottom: 16px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; color: #374151; font-size: 14px; }
    input, textarea { width: 100%; padding: 10px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; font-family: inherit; }
    input:focus, textarea:focus { outline: none; border-color: #2980B9; box-shadow: 0 0 0 3px rgba(41,128,185,0.1); }
    textarea { resize: vertical; min-height: 100px; }
    button { background: #2980B9; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; transition: background 0.2s; }
    button:hover { background: #1B4F72; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .success { background: #d4edda; color: #155724; padding: 12px; border-radius: 6px; margin-bottom: 16px; border-left: 4px solid #28a745; }
    .error { background: #f8d7da; color: #721c24; padding: 12px; border-radius: 6px; margin-bottom: 16px; border-left: 4px solid #dc3545; }
    .required { color: #dc3545; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>&#128203; Responder Cotação</h1>
      <div class="info-box" id="quotationInfo">
        <p><strong>Cotação:</strong> <span id="quotCode">${quotCode}</span></p>
        <p><strong>Produtos:</strong> <span id="quotItems">${quotItems.length > 0 ? quotItems.length + ' iten(s)' : '—'}</span></p>
        <p><strong>Prazo até:</strong> <span id="quotDeadline">${quotDeadline ? new Date(quotDeadline + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</span></p>
      </div>
      <div id="feedback"></div>
      <form id="responseForm">
        <div class="form-group">
          <label for="supplierName">Nome do Fornecedor <span class="required">*</span></label>
          <input type="text" id="supplierName" name="supplierName" placeholder="Ex: Woson Ningbo" required>
        </div>

        ${quotItems.length > 0 ? `
        <div class="form-group" style="margin-bottom:20px;">
          <label style="margin-bottom:10px;display:block;">Itens da Cotação — Preencha o preço unitário de cada item <span class="required">*</span></label>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#f0f4f8;">
                <th style="padding:8px 10px;text-align:left;font-weight:600;color:#374151;">Produto</th>
                <th style="padding:8px 10px;text-align:center;font-weight:600;color:#374151;">Qtd</th>
                <th style="padding:8px 10px;text-align:center;font-weight:600;color:#374151;">Un.</th>
                <th style="padding:8px 10px;text-align:right;font-weight:600;color:#374151;">Preço Unit. (R$) *</th>
                <th style="padding:8px 10px;text-align:right;font-weight:600;color:#1B4F72;">Total (R$)</th>
              </tr>
            </thead>
            <tbody id="itemsTableBody"></tbody>
            <tfoot>
              <tr style="background:#f0f4f8;font-weight:700;">
                <td colspan="4" style="padding:8px 10px;text-align:right;color:#374151;">TOTAL GERAL:</td>
                <td style="padding:8px 10px;text-align:right;color:#1B4F72;font-size:15px;" id="grandTotalCell">R$ 0,00</td>
              </tr>
            </tfoot>
          </table>
        </div>` : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label for="deliveryDays">Prazo de Entrega (dias) <span class="required">*</span></label>
            <input type="number" id="deliveryDays" name="deliveryDays" placeholder="30" min="1" required>
          </div>
          <div class="form-group">
            <label for="paymentTerms">Condições de Pagamento</label>
            <input type="text" id="paymentTerms" name="paymentTerms" placeholder="Ex: 30 dias, À vista">
          </div>
        </div>
        <div class="form-group">
          <label for="notes">Observações</label>
          <textarea id="notes" name="notes" placeholder="Ex: Frete incluído, Validade 30 dias, etc"></textarea>
        </div>
        <button type="submit" id="submitBtn">Enviar Resposta</button>
      </form>
    </div>
  </div>
  <script>
    const quotId = ${JSON.stringify(quotId)}
    const quotItems = ${JSON.stringify(quotItems)}
    const itemTotals = []

    function showFeedback(message, type) {
      const el = document.getElementById('feedback')
      el.className = type
      el.textContent = message
      el.style.display = 'block'
    }

    // Render items table dynamically
    function renderItemsTable() {
      const tbody = document.getElementById('itemsTableBody')
      if (!tbody || quotItems.length === 0) return
      tbody.innerHTML = quotItems.map((it, idx) => {
        itemTotals[idx] = 0
        return '<tr style="border-bottom:1px solid #e5e7eb;">' +
          '<td style="padding:8px 10px;font-weight:600;color:#374151;">' + (it.productName || it.name || '—') + '</td>' +
          '<td style="padding:8px 10px;text-align:center;font-weight:700;color:#1B4F72;">' + (it.quantity || 1) + '</td>' +
          '<td style="padding:8px 10px;text-align:center;color:#6c757d;">' + (it.unit || 'un') + '</td>' +
          '<td style="padding:8px 10px;text-align:right;">' +
            '<input type="number" id="unitPrice_' + idx + '" style="width:120px;padding:6px 8px;border:1.5px solid #d1d5db;border-radius:6px;font-size:13px;text-align:right;" ' +
            'placeholder="0,00" min="0" step="0.01" oninput="calcItemTotal(' + idx + ',' + (it.quantity||1) + ')" required>' +
          '</td>' +
          '<td style="padding:8px 10px;text-align:right;font-weight:700;color:#27AE60;" id="itemTotal_' + idx + '">R$ 0,00</td>' +
          '</tr>'
      }).join('')
    }

    function calcItemTotal(idx, qty) {
      const val = parseFloat(document.getElementById('unitPrice_' + idx).value) || 0
      itemTotals[idx] = val * qty
      const el = document.getElementById('itemTotal_' + idx)
      if (el) el.textContent = 'R$ ' + itemTotals[idx].toLocaleString('pt-BR', {minimumFractionDigits:2})
      const grand = itemTotals.reduce((a,b) => a+b, 0)
      const gc = document.getElementById('grandTotalCell')
      if (gc) gc.textContent = 'R$ ' + grand.toLocaleString('pt-BR', {minimumFractionDigits:2})
    }

    renderItemsTable()

    document.getElementById('responseForm').addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = document.getElementById('submitBtn')
      const supplierName = document.getElementById('supplierName').value.trim()
      if (!supplierName) { showFeedback('❌ Informe o nome do fornecedor', 'error'); return }

      // Validate per-item prices if items exist
      let itemsWithPrice = []
      let grand = 0
      if (quotItems.length > 0) {
        const allFilled = quotItems.every((_, idx) => parseFloat(document.getElementById('unitPrice_' + idx)?.value || '0') > 0)
        if (!allFilled) { showFeedback('❌ Preencha o preço unitário de todos os itens', 'error'); return }
        itemsWithPrice = quotItems.map((it, idx) => ({
          productCode: it.productCode || it.code || '',
          productName: it.productName || it.name || '',
          quantity: it.quantity || 1,
          unit: it.unit || 'un',
          unitPrice: parseFloat(document.getElementById('unitPrice_' + idx).value) || 0,
          totalPrice: itemTotals[idx] || 0,
        }))
        grand = itemTotals.reduce((a,b) => a+b, 0)
      } else {
        // fallback: single total price field (legacy)
        const tp = document.getElementById('totalPrice')
        grand = tp ? parseFloat(tp.value) || 0 : 0
      }

      btn.disabled = true
      btn.textContent = '⏳ Enviando...'
      const formData = {
        supplierName,
        totalPrice: grand,
        deliveryDays: parseInt(document.getElementById('deliveryDays').value) || 30,
        paymentTerms: document.getElementById('paymentTerms').value || '',
        notes: document.getElementById('notes').value || '',
        items: itemsWithPrice,
      }
      try {
        const res = await fetch('/suprimentos/api/quotations/' + quotId + '/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        const data = await res.json()
        if (data.ok) {
          showFeedback('✅ Resposta enviada com sucesso! Você pode fechar esta página.', 'success')
          document.getElementById('responseForm').style.display = 'none'
        } else {
          showFeedback('❌ Erro: ' + (data.error || 'Erro desconhecido'), 'error')
          btn.disabled = false
          btn.textContent = 'Enviar Resposta'
        }
      } catch (e) {
        showFeedback('❌ Erro de conexão', 'error')
        btn.disabled = false
        btn.textContent = 'Enviar Resposta'
      }
    })
  </script>
</body>
</html>`

  return c.html(html)
})

// ── API: POST /suprimentos/api/quotations/:id/respond ────────────────────────
app.post('/api/quotations/:id/respond', async (c) => {
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

      const existingResponseIdx = q.supplierResponses?.findIndex(
        (r: any) => r.supplierName.toLowerCase() === body.supplierName.toLowerCase()
      ) ?? -1

      if (existingResponseIdx !== -1 && q.status !== 'awaiting_negotiation') {
        return err(c, 'Este fornecedor já respondeu esta cotação', 400)
      }

      if (q.deadline && new Date(q.deadline + 'T23:59:59') < new Date()) {
        return err(c, 'Cotação expirada', 400)
      }

      if (!q.supplierResponses) q.supplierResponses = []

      const respId = genId('resp')
      const respondedAt = new Date().toISOString()

      if (existingResponseIdx !== -1 && q.status === 'awaiting_negotiation') {
        const { negotiationHistory: _nh, ...previousResponse } = q.supplierResponses[existingResponseIdx]
        if (!q.supplierResponses[existingResponseIdx].negotiationHistory) {
          q.supplierResponses[existingResponseIdx].negotiationHistory = []
        }
        q.supplierResponses[existingResponseIdx].negotiationHistory.push(previousResponse)
        q.supplierResponses[existingResponseIdx].totalPrice = body.totalPrice
        q.supplierResponses[existingResponseIdx].deliveryDays = body.deliveryDays || 0
        q.supplierResponses[existingResponseIdx].paymentTerms = body.paymentTerms || ''
        q.supplierResponses[existingResponseIdx].notes = body.notes || ''
        q.supplierResponses[existingResponseIdx].respondedAt = respondedAt
        q.supplierResponses[existingResponseIdx].items = body.items || []
        console.log('[COTAÇÃO-RESPOSTA] ♻️ Resposta atualizada durante negociação:', body.supplierName)
      } else {
        q.supplierResponses.push({
          id: respId,
          supplierName: body.supplierName,
          totalPrice: body.totalPrice,
          deliveryDays: body.deliveryDays || 0,
          paymentTerms: body.paymentTerms || '',
          notes: body.notes || '',
          respondedAt,
          items: body.items || [],
        })
      }

      q.status = 'with_responses'
      markTenantModified(userId)

      // Persist to D1: status + response in quotation_responses table
      const db = getCtxDB(c)
      if (db && userId !== 'demo-tenant') {
        try {
          await db.prepare(`UPDATE quotations SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
            .bind(q.status, respondedAt, quotId, userId).run()
          console.log('[COTAÇÃO-RESPOSTA] ✅ Status persistido em D1:', q.status)
        } catch (e) {
          console.error('[COTAÇÃO-RESPOSTA] ⚠️ Erro ao persistir status:', (e as any).message)
        }
        // Persist supplier response to quotation_responses for post-deploy survival
        try {
          const itemsJson = JSON.stringify(body.items || [])
          if (existingResponseIdx !== -1 && q.status === 'awaiting_negotiation') {
            await db.prepare(`UPDATE quotation_responses SET total_price=?, delivery_days=?, payment_terms=?, notes=?, responded_at=? WHERE quotation_id=? AND supplier_name=? AND user_id=?`)
              .bind(body.totalPrice, body.deliveryDays||0, body.paymentTerms||'', itemsJson, respondedAt, quotId, body.supplierName, userId).run()
          } else {
            await db.prepare(`INSERT INTO quotation_responses (id, quotation_id, supplier_id, supplier_name, unit_price, total_price, delivery_days, payment_terms, notes, responded_at, user_id, empresa_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
              .bind(respId, quotId, '', body.supplierName,
                (body.items && body.items[0]) ? (body.items[0].unitPrice || 0) : 0,
                body.totalPrice, body.deliveryDays||0, body.paymentTerms||'',
                itemsJson, respondedAt, userId, q.empresaId || '1').run()
          }
          console.log('[COTAÇÃO-RESPOSTA] ✅ Resposta persistida em D1 quotation_responses')
        } catch (e) {
          console.error('[COTAÇÃO-RESPOSTA] ⚠️ Erro ao persistir resposta em quotation_responses:', (e as any).message)
        }
      }

      console.log('[COTAÇÃO-RESPOSTA] ✅ Resposta salva:', quotId)
      return ok(c, { quotation: q, message: 'Resposta recebida com sucesso' })
    }
  }

  return err(c, 'Cotação não encontrada', 404)
})


// ── API: POST /suprimentos/api/quotations/create (new format) ─────────────────
app.post('/api/quotations/create', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  
  if (!body) return err(c, 'Dados inválidos')
  if (!body.deadline) return err(c, 'Data limite obrigatória')
  if (!body.supplierIds || body.supplierIds.length === 0) return err(c, 'Selecione pelo menos um fornecedor')
  if (body.tipo !== 'critico' && (!body.items || body.items.length === 0)) return err(c, 'Adicione pelo menos um produto')
  
  const id = genId('cot')
  // Use D1 last code to avoid UNIQUE collision after deploy/reload
  let cotSeq = tenant.quotations.length + 1
  if (db && userId !== 'demo-tenant') {
    try {
      const maxCot = await db.prepare(
        `SELECT code FROM quotations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`
      ).bind(userId).first() as any
      if (maxCot?.code) {
        const parts = String(maxCot.code).split('-')
        const lastNum = parseInt(parts[parts.length - 1] || '0', 10)
        if (!isNaN(lastNum) && lastNum >= cotSeq) cotSeq = lastNum + 1
      }
    } catch(_) { /* fallback to memory count */ }
  }
  const code = `COT-${new Date().getFullYear()}-${String(cotSeq).padStart(3,'0')}`
  const quotation = {
    id, code,
    descricao: body.descricao || 'Cotação de suprimentos',
    tipo: body.tipo || 'manual',
    items: body.items || [],
    supplierIds: body.supplierIds || [],
    deadline: body.deadline,
    observations: body.observations || '',
    status: 'pending_approval',
    createdBy: userId || 'Admin',
    createdAt: new Date().toISOString(),
    supplierResponses: [],
  }
  
  if (db && userId !== 'demo-tenant') {
    const persistResult = await dbInsertWithRetry(db, 'quotations', {
      id, user_id: userId, empresa_id: empresaId, code: quotation.code,
      tipo: quotation.tipo, creator: quotation.createdBy, status: 'pending_approval',
      deadline: quotation.deadline, notes: JSON.stringify({ items: quotation.items, observations: quotation.observations, descricao: quotation.descricao }),
    })
    if (!persistResult.success) {
      console.error(`[SUPRIMENTOS][COTAÇÃO][CRÍTICO] Falha ao persistir cotação ${id} em D1 após ${persistResult.attempts} tentativas: ${persistResult.error}`)
      return err(c, 'Erro ao salvar cotação no banco de dados', 500)
    }
    console.log(`[SUPRIMENTOS][COTAÇÃO] Cotação ${id} persistida em D1 com sucesso`)
  }
  tenant.quotations.push(quotation)
  markTenantModified(userId)
  return ok(c, { quotation, code })
})

// ── API: POST /suprimentos/api/quotations/:id/approve ────────────────────────
app.post('/api/quotations/:id/approve', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as any
  
  const quotation = tenant.quotations.find((q: any) => q.id === id)
  if (!quotation) return err(c, 'Cotação não encontrada', 404)

  // ✅ Verificar duplicação: não criar pedido se já existe para esta cotação
  if (!tenant.purchaseOrders) tenant.purchaseOrders = []
  const existingOrder = tenant.purchaseOrders.find((po: any) => po.quotationId === id)
  if (existingOrder) {
    quotation.status = 'approved'
    quotation.approvedBy = userId
    quotation.approvedAt = new Date().toISOString()
    markTenantModified(userId)
    if (db && userId !== 'demo-tenant') {
      await dbUpdate(db, 'quotations', id, userId, { status: 'approved' })
    }
    return ok(c, { quotation, purchaseOrder: existingOrder, pcCode: existingOrder.code, duplicate: true })
  }

  quotation.status = 'approved'
  quotation.approvedBy = userId
  quotation.approvedAt = new Date().toISOString()
  markTenantModified(userId)
  
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'quotations', id, userId, { status: 'approved' })
  }
  
  // ✅ Usar melhor resposta para valor e fornecedor
  const bestResponse = (quotation.supplierResponses || []).reduce((best: any, r: any) =>
    (!best || r.totalPrice < best.totalPrice) ? r : best, null)
  const totalValue = bestResponse?.totalPrice ||
    (quotation.items || []).reduce((sum: number, item: any) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0)
  const supplierName = body.supplierName || bestResponse?.supplierName || quotation.supplierResponses?.[0]?.supplierName || 'Fornecedor'

  // ✅ Verificar tipo de fornecedor para is_import
  const suppliers = tenant.suppliers || []
  const supplierObj = suppliers.find((s: any) => s.id === (bestResponse?.supplierId || quotation.supplierIds?.[0]))
  const isImport = supplierObj?.type === 'importado'

  // Gerar Pedido de Compra automaticamente
  const pcId = genId('pc')
  // Gerar código único de PC consultando o maior número já existente no D1
  const pcYear = new Date().getFullYear()
  let pcSeq = (tenant.purchaseOrders || []).length + 1
  if (db && userId !== 'demo-tenant') {
    try {
      // Buscar o maior número de PC do ano corrente para evitar colisão UNIQUE
      const maxRow = await db.prepare(
        `SELECT code FROM purchase_orders WHERE user_id = ? AND code LIKE ? ORDER BY code DESC LIMIT 1`
      ).bind(userId, `PC-${pcYear}-%`).first() as any
      if (maxRow?.code) {
        const parts = String(maxRow.code).split('-')
        const lastNum = parseInt(parts[parts.length - 1] || '0', 10)
        if (!isNaN(lastNum) && lastNum >= pcSeq) pcSeq = lastNum + 1
      }
    } catch(_) { /* fallback to memory count */ }
  }
  // Gerar código; se ainda colidir, adicionar sufixo do pcId
  const pcCode = `PC-${pcYear}-${String(pcSeq).padStart(4,'0')}`
  
  const purchaseOrder = {
    id: pcId,
    code: pcCode,
    quotationId: id,
    quotationCode: quotation.code,
    supplierName,
    items: quotation.items || [],
    totalValue,
    currency: 'BRL',
    status: 'pending_approval',
    isImport,
    createdAt: new Date().toISOString(),
    expectedDelivery: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  }
  
  // D1-first: inserir Pedido de Compra antes de atualizar memória (produção)
  if (db && userId !== 'demo-tenant') {
    const supplierId = bestResponse?.supplierId || quotation.supplierIds?.[0] || 'sem-fornecedor'
    // Tentar inserir; se code já existir (UNIQUE), gerar código com sufixo do pcId
    let finalCode = pcCode
    let persistResult = await dbInsertWithRetry(db, 'purchase_orders', {
      id: pcId, user_id: userId, empresa_id: empresaId, code: finalCode,
      quotation_id: id, quotation_code: quotation.code || '',
      supplier_id: supplierId,
      supplier_name: purchaseOrder.supplierName,
      status: 'pending_approval', total_value: totalValue,
      currency: 'BRL',
      is_import: isImport ? 1 : 0,
      import_flag: isImport ? 1 : 0,
      notes: JSON.stringify({ items: purchaseOrder.items }),
      expected_delivery: purchaseOrder.expectedDelivery,
    })
    // Se falhou (provável UNIQUE em code), tentar com código alternativo único
    if (!persistResult.success && persistResult.error?.includes('UNIQUE')) {
      finalCode = `PC-${pcYear}-${Date.now().toString(36).toUpperCase()}`
      purchaseOrder.code = finalCode
      console.warn(`[SUPRIMENTOS][PC] Colisão de código, tentando com: ${finalCode}`)
      persistResult = await dbInsertWithRetry(db, 'purchase_orders', {
        id: pcId, user_id: userId, empresa_id: empresaId, code: finalCode,
        quotation_id: id, quotation_code: quotation.code || '',
        supplier_id: supplierId,
        supplier_name: purchaseOrder.supplierName,
        status: 'pending_approval', total_value: totalValue,
        currency: 'BRL',
        is_import: isImport ? 1 : 0,
        import_flag: isImport ? 1 : 0,
        notes: JSON.stringify({ items: purchaseOrder.items }),
        expected_delivery: purchaseOrder.expectedDelivery,
      })
    }
    if (!persistResult.success) {
      console.error(`[SUPRIMENTOS][PC][CRÍTICO] Falha ao persistir pedido ${pcId} em D1 após ${persistResult.attempts} tentativas: ${persistResult.error}`)
      return err(c, `Erro ao salvar pedido de compra no banco de dados: ${persistResult.error}`, 500)
    }
    console.log(`[SUPRIMENTOS][PC] Pedido ${pcId} (${finalCode}) persistido em D1 com sucesso`)
  }

  // Atualizar memória apenas após sucesso do D1 (ou modo demo/sem db)
  tenant.purchaseOrders.push(purchaseOrder)
  
  // Garantir que purchaseOrder.code reflita o código final usado
  if (!purchaseOrder.code || purchaseOrder.code !== (typeof finalCode !== 'undefined' ? finalCode : pcCode)) {
    purchaseOrder.code = typeof finalCode !== 'undefined' ? finalCode : pcCode
  }
  return ok(c, { quotation, purchaseOrder, pcCode: purchaseOrder.code })
})

// ── API: POST /suprimentos/api/quotations/:id/reject ───────────────────────────
app.post('/api/quotations/:id/reject', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as any
  
  const quotation = tenant.quotations.find((q: any) => q.id === id)
  if (!quotation) return err(c, 'Cotação não encontrada', 404)
  
  quotation.status = 'rejected'
  quotation.rejectionReason = body.motivo || 'Cotação recusada'
  quotation.rejectedAt = new Date().toISOString()
  quotation.rejectedBy = userId
  markTenantModified(userId)
  
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'quotations', id, userId, { status: 'rejected' })
  }
  
  return ok(c, { quotation })
})
// ── API: POST /suprimentos/api/quotations/:id/resend ─────────────────────────
app.post('/api/quotations/:id/resend', async (c) => {
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
app.post('/api/quotations/:id/negotiate', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as any
  
  const quotation = tenant.quotations.find((q: any) => q.id === id)
  if (!quotation) return err(c, 'Cotação não encontrada', 404)
  
  quotation.status = 'awaiting_negotiation'
  quotation.negotiationObs = body.observations || ''
  quotation.negotiationStartedAt = new Date().toISOString()
  quotation.negotiatedBy = userId
  markTenantModified(userId)
  
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'quotations', id, userId, { status: 'awaiting_negotiation' })
  }
  
  return ok(c, { quotation })
})
// ── API: POST /suprimentos/api/purchase-orders/create ────────────────────────
app.post('/api/purchase-orders/create', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c); const empresaId = getCtxEmpresaId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.quotationId) return err(c, 'Cotação obrigatória', 400)
  const quotIdx = (tenant.quotations || []).findIndex((q: any) => q.id === body.quotationId)
  if (quotIdx === -1) return err(c, 'Cotação não encontrada', 404)
  const quot = tenant.quotations[quotIdx]
  if (quot.status !== 'approved') return err(c, 'Cotação deve estar aprovada', 400)

  // ✅ Verificar duplicação
  if (!tenant.purchaseOrders) (tenant as any).purchaseOrders = []
  const existingOrder = tenant.purchaseOrders.find((po: any) => po.quotationId === body.quotationId)
  if (existingOrder) return err(c, 'Pedido para esta cotação já existe', 409)

  const id = genId('pc')
  const code = `PED-${new Date().getFullYear()}-${String(tenant.purchaseOrders.length + 1).padStart(3,'0')}`
  const bestResponse = (quot.supplierResponses || []).reduce((best: any, r: any) => (!best || r.totalPrice < best.totalPrice) ? r : best, null)

  // ✅ Verificar tipo de fornecedor para is_import
  const suppliers = tenant.suppliers || []
  const supplierObj = suppliers.find((s: any) => s.id === (bestResponse?.supplierId || quot.supplierIds?.[0]))
  const isImport = supplierObj?.type === 'importado'

  const pedido = {
    id, code,
    quotationId: quot.id,
    quotationCode: quot.code,
    supplierName: bestResponse?.supplierName || quot.supplierName || (quot.supplierResponses?.[0]?.supplierName || ''),
    items: quot.items || [],
    totalValue: bestResponse?.totalPrice || quot.totalValue || (quot.supplierResponses?.[0]?.totalPrice || 0),
    pedidoData: body.pedidoData || '',
    dataEntrega: body.dataEntrega || '',
    observacoes: body.observacoes || '',
    status: 'pending_approval',
    isImport,
    createdAt: new Date().toISOString(),
    userId,
    empresaId,
  }
  // D1-first: inserir antes de atualizar memória (produção)
  if (db && userId !== 'demo-tenant') {
    const supplierId2 = bestResponse?.supplierId || quot.supplierIds?.[0] || 'sem-fornecedor'
    const persistResult = await dbInsertWithRetry(db, 'purchase_orders', {
      id, user_id: userId, empresa_id: empresaId, code,
      quotation_id: quot.id, quotation_code: quot.code || '',
      supplier_id: supplierId2,
      supplier_name: pedido.supplierName, status: 'pending_approval',
      total_value: pedido.totalValue, currency: 'BRL',
      is_import: isImport ? 1 : 0, import_flag: isImport ? 1 : 0,
      notes: JSON.stringify({ items: pedido.items, pedidoData: pedido.pedidoData, dataEntrega: pedido.dataEntrega, observacoes: pedido.observacoes }),
    })
    if (!persistResult.success) {
      console.error(`[SUPRIMENTOS][PEDIDO][CRÍTICO] Falha ao persistir pedido ${id} em D1 após ${persistResult.attempts} tentativas: ${persistResult.error}`)
      return err(c, 'Erro ao salvar pedido de compra no banco de dados', 500)
    }
    console.log(`[SUPRIMENTOS][PEDIDO] Pedido ${id} persistido em D1 com sucesso`)
  }
  // Atualizar memória apenas após sucesso do D1 (ou modo demo/sem db)
  tenant.purchaseOrders.push(pedido)
  console.log(`[PEDIDO] ✅ Pedido criado: ${pedido.id}`)
  markTenantModified(userId)
  return ok(c, { purchaseOrder: pedido, message: 'Pedido de compra criado com sucesso' })
})

// ── API: POST /suprimentos/api/purchase-orders/:id/approve ───────────────────
app.post('/api/purchase-orders/:id/approve', async (c) => {
  const pedidoId = c.req.param('id')
  const db = getCtxDB(c)
  const tenant = getCtxTenant(c)
  const userId = getCtxUserId(c)
  const pedidoIdx = (tenant.purchaseOrders || []).findIndex((p: any) => p.id === pedidoId)
  if (pedidoIdx === -1) return err(c, 'Pedido não encontrado', 404)
  const pedido = tenant.purchaseOrders[pedidoIdx]
  if (pedido.status === 'approved') return err(c, 'Pedido já foi aprovado', 409)
  pedido.status = 'approved'
  pedido.approvedAt = new Date().toISOString()
  pedido.approvedBy = userId
  console.log(`[PEDIDO] ✅ Pedido aprovado: ${pedidoId}`)
  markTenantModified(userId)
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'purchase_orders', pedidoId, userId, { status: 'approved', approved_at: pedido.approvedAt, approved_by: userId })
  }
  // Determinar ação com base no tipo do pedido
  const isImport = pedido.isImport === true
  const action = isImport ? 'create_import_draft' : 'generate_pdf'
  const message = isImport
    ? 'Pedido aprovado. Gerando rascunho de importação...'
    : 'Pedido aprovado. PDF disponível para impressão.'
  return ok(c, { purchaseOrder: pedido, action, message })
})

// ── API: POST /suprimentos/api/purchase-orders/:id/reject ────────────────────
app.post('/api/purchase-orders/:id/reject', async (c) => {
  const pedidoId = c.req.param('id')
  const db = getCtxDB(c)
  const tenant = getCtxTenant(c)
  const userId = getCtxUserId(c)
  const body = await c.req.json().catch(() => ({})) as any
  const pedidoIdx = (tenant.purchaseOrders || []).findIndex((p: any) => p.id === pedidoId)
  if (pedidoIdx === -1) return err(c, 'Pedido não encontrado', 404)
  const pedido = tenant.purchaseOrders[pedidoIdx]
  pedido.status = 'rejected'
  pedido.rejectedAt = new Date().toISOString()
  pedido.rejectedBy = userId
  pedido.rejectionReason = body.reason || ''
  console.log(`[PEDIDO] ✅ Pedido recusado: ${pedidoId}`)
  markTenantModified(userId)
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'purchase_orders', pedidoId, userId, { status: 'rejected', rejected_at: pedido.rejectedAt, rejected_by: userId, rejection_reason: pedido.rejectionReason })
  }
  return ok(c, { purchaseOrder: pedido, message: 'Pedido rejeitado' })
})

// ── API: POST /suprimentos/api/purchase-orders/:id/status ────────────────────
// Transição de status: pending_approval → approved → in_transit → delivered → closed
//                                       ↓ rejected
app.post('/api/purchase-orders/:id/status', async (c) => {
  const pedidoId = c.req.param('id')
  const db = getCtxDB(c)
  const tenant = getCtxTenant(c)
  const userId = getCtxUserId(c)
  const body = await c.req.json().catch(() => ({})) as any
  const newStatus = body.newStatus as string

  const validStatuses = ['pending_approval', 'approved', 'in_transit', 'delivered', 'closed', 'rejected', 'in_import_process']
  if (!newStatus || !validStatuses.includes(newStatus)) {
    return err(c, `Status inválido. Permitidos: ${validStatuses.join(', ')}`, 400)
  }

  const allowedTransitions: Record<string, string[]> = {
    pending_approval: ['approved', 'rejected'],
    approved: ['in_transit', 'in_import_process', 'rejected'],
    in_import_process: ['in_transit', 'closed'],
    in_transit: ['delivered'],
    delivered: ['closed'],
    closed: [],
    rejected: [],
  }

  const pedidoIdx = (tenant.purchaseOrders || []).findIndex((p: any) => p.id === pedidoId)
  if (pedidoIdx === -1) return err(c, 'Pedido não encontrado', 404)

  const currentStatus = tenant.purchaseOrders[pedidoIdx].status
  const allowed = allowedTransitions[currentStatus] || []
  if (!allowed.includes(newStatus)) {
    return err(c, `Transição inválida: ${currentStatus} → ${newStatus}`, 400)
  }

  tenant.purchaseOrders[pedidoIdx].status = newStatus
  tenant.purchaseOrders[pedidoIdx].statusUpdatedAt = new Date().toISOString()
  if (body.notes) tenant.purchaseOrders[pedidoIdx].statusNotes = body.notes
  console.log(`[PEDIDO] Status atualizado: ${pedidoId} → ${newStatus}`)
  markTenantModified(userId)

  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'purchase_orders', pedidoId, userId, {
      status: newStatus,
      status_updated_at: tenant.purchaseOrders[pedidoIdx].statusUpdatedAt,
    })
  }

  return ok(c, { purchaseOrder: tenant.purchaseOrders[pedidoIdx] })
})

// ── API: POST /suprimentos/api/imports/from-purchase-order/:pedidoId ─────────
app.post('/api/imports/from-purchase-order/:pedidoId', async (c) => {
  const importBlocked = await requireModuleWriteAccess(c, 'importacao')
  if (importBlocked) return importBlocked
  const pedidoId = c.req.param('pedidoId')
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const pedido = (tenant.purchaseOrders || []).find((p: any) => p.id === pedidoId)
  if (!pedido) return err(c, 'Pedido não encontrado', 404)
  if (!pedido.isImport) return err(c, 'Pedido não é de importação', 400)

  const importId = genId('imp')
  const code = `IMP-${new Date().getFullYear()}-${String((tenant.imports?.length || 0) + 1).padStart(3,'0')}`
  const importDraft: any = {
    id: importId,
    code,
    purchaseOrderId: pedidoId,
    invoiceNumber: '',
    supplierId: pedido.supplierId || pedido.supplier_id || '',
    supplierName: pedido.supplierName || '',
    modality: '',
    status: 'draft',
    items: (pedido.items || []).map((item: any) => ({
      productCode: item.productCode || item.code || '',
      productName: item.productName || item.name || '',
      quantity: item.quantity || 0,
      unitPrice: item.unitPrice || item.unit_price || 0,
      ncm: '',
      descriptionPT: '',
      descriptionEN: '',
    })),
    notes: `Gerado automaticamente a partir do Pedido ${pedido.code}`,
    createdAt: new Date().toISOString(),
  }
  if (db && userId !== 'demo-tenant') {
    const persistResult = await dbInsertWithRetry(db, 'imports', {
      id: importId, user_id: userId, empresa_id: empresaId, code,
      purchase_order_id: pedidoId,
      invoice_number: '',
      supplier_id: importDraft.supplierId,
      supplier_name: importDraft.supplierName,
      modality: '',
      status: 'draft',
      notes: JSON.stringify({ items: importDraft.items, notes: importDraft.notes }),
    })
    if (!persistResult.success) {
      console.warn(`[IMPORT] Falha ao persistir rascunho de importação ${importId} em D1: ${persistResult.error}`)
    }
    await dbUpdate(db, 'purchase_orders', pedidoId, userId, {
      status: 'in_import_process',
      import_process_id: importId,
    })
  }

  if (!tenant.imports) (tenant as any).imports = []
  tenant.imports.push(importDraft)

  // Atualizar status do pedido
  pedido.status = 'in_import_process'
  pedido.importProcessId = importId
  markTenantModified(userId)

  return ok(c, {
    import: importDraft,
    message: 'Rascunho de importação criado com sucesso',
    redirectTo: `/suprimentos?tab=importacao&draft=${importId}`,
  })
})

// ── API: GET /suprimentos/api/purchase-orders/:id/pdf ────────────────────────
app.get('/api/purchase-orders/:id/pdf', async (c) => {
  const tenant = getCtxTenant(c)
  const pedidoId = c.req.param('id')
  const pedido = (tenant.purchaseOrders || []).find((p: any) => p.id === pedidoId)
  if (!pedido) return err(c, 'Pedido não encontrado', 404)

  const itemsHtml = (pedido.items || []).map((item: any) => {
    const total = ((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)
    return `<tr>
      <td style="padding:8px;border:1px solid #ddd;">${escapeJsonString(item.productCode || item.code || '—')}</td>
      <td style="padding:8px;border:1px solid #ddd;">${escapeJsonString(item.productName || item.name || '—')}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center;">${item.quantity || 0}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:right;">R$ ${(item.unitPrice || 0).toFixed(2)}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:right;">R$ ${total}</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Pedido ${escapeJsonString(pedido.code || pedidoId)}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:32px;color:#222;}
    h1{color:#1B4F72;}
    table{width:100%;border-collapse:collapse;margin-top:16px;}
    th{background:#1B4F72;color:#fff;padding:8px;border:1px solid #ddd;text-align:left;}
    .total{font-size:16px;font-weight:bold;text-align:right;margin-top:12px;}
    .footer{margin-top:32px;font-size:12px;color:#666;border-top:1px solid #ddd;padding-top:12px;}
    @media print{button{display:none;}}
  </style></head><body>
  <h1>Pedido de Compra — ${escapeJsonString(pedido.code || pedidoId)}</h1>
  <p><strong>Fornecedor:</strong> ${escapeJsonString(pedido.supplierName || '—')}</p>
  <p><strong>Data:</strong> ${pedido.pedidoData ? new Date(pedido.pedidoData).toLocaleDateString('pt-BR') : pedido.createdAt ? new Date(pedido.createdAt).toLocaleDateString('pt-BR') : '—'}</p>
  <p><strong>Data de Entrega:</strong> ${pedido.dataEntrega ? new Date(pedido.dataEntrega + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</p>
  <table><thead><tr><th>Código</th><th>Descrição</th><th>Qtd</th><th>Preço Unit.</th><th>Total</th></tr></thead>
  <tbody>${itemsHtml}</tbody></table>
  <div class="total">Valor Total: R$ ${(pedido.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
  ${pedido.observacoes ? `<p><strong>Observações:</strong> ${escapeJsonString(pedido.observacoes)}</p>` : ''}
  <div class="footer">Gerado em ${new Date().toLocaleString('pt-BR')} · PCPSyncrus</div>
  <script>window.onload = function(){ window.print(); }</script>
  </body></html>`

  return c.html(html)
})

// ── API: POST /suprimentos/api/imports/create ────────────────────────────────
app.post('/api/imports/create', async (c) => {
  const importBlocked = await requireModuleWriteAccess(c, 'importacao')
  if (importBlocked) return importBlocked
  const db = getCtxDB(c); const userId = getCtxUserId(c); const empresaId = getCtxEmpresaId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.invoiceNumber) return err(c, 'Número da Invoice obrigatório')
  if (!body.supplierId) return err(c, 'Fornecedor obrigatório')
  const id = genId('imp')
  const code = `IMP-${new Date().getFullYear()}-${String((tenant.imports?.length || 0) + 1).padStart(3,'0')}`
  const imp = {
    id, code, invoiceNumber: body.invoiceNumber,
    supplierId: body.supplierId || '', supplierName: body.supplierName || '',
    modality: body.modality || 'maritimo', status: 'waiting_ship',
    createdAt: new Date().toISOString(),
  }
  if (db && userId !== 'demo-tenant') {
    const persistResult = await dbInsertWithRetry(db, 'imports', {
      id, user_id: userId, empresa_id: empresaId, code, invoice_number: imp.invoiceNumber,
      supplier_id: imp.supplierId, supplier_name: imp.supplierName, modality: imp.modality, status: 'waiting_ship',
    })
    if (!persistResult.success) {
      console.warn(`[IMPORT] Falha ao persistir importação ${id} em D1: ${persistResult.error}`)
    }
  }
  if (!tenant.imports) (tenant as any).imports = []
  tenant.imports.push(imp)
  markTenantModified(userId)
  return ok(c, { imp, code })
})

// ── Salvar campo editado inline na tabela de Produtos Importados ──────────
app.post('/api/product-imp-field', async (c) => {
  const tenant = getCtxTenant(c)
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.code || !body.field) return err(c, 'code e field obrigatórios')
  const { code, field, value } = body
  // Campos permitidos para edição inline
  const allowedFields = ['descPT', 'descEN', 'ncm']
  if (!allowedFields.includes(field)) return err(c, 'Campo não permitido')
  // Atualizar em stockItems ou products do tenant (memória)
  const stockItem = (tenant.stockItems || []).find((i: any) => i.code === code)
  const product   = (tenant.products   || []).find((i: any) => i.code === code)
  const item = stockItem || product
  if (item) {
    item[field] = value
  }
  // Atualizar impProdDesc em memória
  if (!tenant.impProdDesc) tenant.impProdDesc = {}
  if (!tenant.impProdDesc[code]) tenant.impProdDesc[code] = {}
  tenant.impProdDesc[code][field] = value

  // Persistir no DB se disponível
  if (db && userId !== 'demo-tenant') {
    // 1. Para produtos cadastrados (tabela products): colunas ncm, desc_pt, desc_en existem
    if (product) {
      try {
        if (field === 'ncm') {
          const res = await db.prepare(
            `UPDATE products SET ncm = ? WHERE user_id = ? AND code = ?`
          ).bind(value, userId, code).run()
          console.log(`[NCM] UPDATE products ncm OK para ${code}, changes=${(res as any).meta?.changes}`)
        } else if (field === 'descPT') {
          // desc_pt pode não existir (adicionado via migration 0043)
          try {
            await db.prepare(
              `UPDATE products SET desc_pt = ? WHERE user_id = ? AND code = ?`
            ).bind(value, userId, code).run()
          } catch(_) { /* coluna pode não existir ainda, salva em imp_prod_desc */ }
        } else if (field === 'descEN') {
          try {
            await db.prepare(
              `UPDATE products SET desc_en = ? WHERE user_id = ? AND code = ?`
            ).bind(value, userId, code).run()
          } catch(_) { /* coluna pode não existir ainda, salva em imp_prod_desc */ }
        }
      } catch(e) {
        console.error(`[NCM] Falha ao UPDATE products para ${code}:`, (e as any).message)
      }
    }
    // 2. Auto-criar tabela imp_prod_desc se não existir (garante funcionamento sem migration manual)
    try {
      await db.prepare(
        `CREATE TABLE IF NOT EXISTS imp_prod_desc (
          id         INTEGER  PRIMARY KEY AUTOINCREMENT,
          user_id    TEXT     NOT NULL,
          empresa_id TEXT     DEFAULT '',
          code       TEXT     NOT NULL,
          field      TEXT     NOT NULL,
          value      TEXT     DEFAULT '',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, code, field)
        )`
      ).run()
    } catch(_) { /* tabela já existe, ok */ }
    // 3. Upsert em imp_prod_desc (salva ncm, descPT, descEN para products E stockItems)
    try {
      await db.prepare(
        `INSERT INTO imp_prod_desc (user_id, empresa_id, code, field, value, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, code, field) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
      ).bind(userId, empresaId || '', code, field, value).run()
      console.log(`[NCM] imp_prod_desc upsert OK: user=${userId} code=${code} field=${field} value=${value}`)
    } catch(e) {
      console.error(`[NCM] imp_prod_desc upsert FALHOU para ${code}:`, (e as any).message)
      return c.json({ ok: false, error: 'Falha ao salvar no banco de dados: ' + (e as any).message }, 500)
    }
  }
  return ok(c, { code, field, value })
})

// ── API: POST /suprimentos/api/product-supplier-links/create ─────────────────
app.post('/api/product-supplier-links/create', async (c) => {
  const db        = getCtxDB(c)
  const userId    = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant    = getCtxTenant(c)
  const body      = await c.req.json().catch(() => null)

  if (!body || !body.product_id)   return err(c, 'product_id é obrigatório', 400)
  if (!body.supplier_id)           return err(c, 'supplier_id é obrigatório', 400)
  if (!body.supplier_name)         return err(c, 'supplier_name é obrigatório', 400)

  const id  = genId('psl')
  const now = new Date().toISOString()
  const link = {
    id,
    product_id:     body.product_id,
    supplier_id:    body.supplier_id,
    supplier_name:  body.supplier_name,
    supplier_email: body.supplier_email  || '',
    supplier_phone: body.supplier_phone  || '',
    status:         'active',
    created_at:     now,
  }

  // D1-first: persist before updating memory
  if (db && userId !== 'demo-tenant') {
    const inserted = await dbInsert(db, 'product_supplier_links', {
      ...link,
      user_id:    userId,
      empresa_id: empresaId || '1',
    })
    if (!inserted) {
      console.error(`[SUPRIMENTOS][PSL][CRÍTICO] Falha ao persistir vínculo ${id} em D1`)
      return err(c, 'Erro ao salvar vínculo fornecedor-produto no banco de dados', 500)
    }
    console.log(`[SUPRIMENTOS][PSL] Vínculo ${id} persistido em D1 com sucesso`)
  }

  if (!tenant.productSupplierLinks) tenant.productSupplierLinks = []
  tenant.productSupplierLinks.push(link)
  markTenantModified(userId)
  return ok(c, { link })
})

export default app
