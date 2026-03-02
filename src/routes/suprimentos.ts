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
 * Serializar quotations com escape seguro usando replacer
 */
function safeStringifyQuotations(quotations: any[]): string {
  try {
    const jsonStr = JSON.stringify(quotations, (key, value) => {
      if (typeof value === 'string') {
        return escapeJsonString(value)
      }
      return value
    })
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
    console.log('[SUPRIMENTOS] quotationsData definido:', Array.isArray(window.quotationsData) ? window.quotationsData.length : 'ERRO');
  </script>

  <!-- ✅ Carregar funções de cotação DEPOIS dos dados -->
  <script src="/static/suprimentos-init.js"></script>

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
        <button class="btn btn-success btn-sm" onclick="approveQuotation('${q.id}','${q.code}','${(q.supplierResponses[0]?.supplierName||'fornecedor')}')">
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
                      <button class="btn btn-secondary btn-sm" onclick="openQuotationDetail('${q.id}')" title="Ver detalhes"><i class="fas fa-eye"></i></button>
                      ${q.status === 'pending_approval' ? `
                      <button class="btn btn-success btn-sm" onclick="approveQuotation('${q.id}','${q.code}','${(q.supplierResponses[0]?.supplierName||'fornecedor')}')" title="Aprovar"><i class="fas fa-check"></i></button>
                      <button class="btn btn-danger btn-sm" onclick="recusarCotacao('${q.id}','${q.code}')" title="Recusar"><i class="fas fa-times"></i></button>` : ''}
                      ${q.status === 'sent' || q.status === 'awaiting_responses' ? `
                      <button class="btn btn-secondary btn-sm" onclick="reenviarCotacao('${q.id}','${q.code}')" title="Reenviar"><i class="fas fa-redo"></i></button>` : ''}
                      <button class="btn btn-sm" style="background:#f5f3ff;color:#7c3aed;border:1px solid #c4b5fd;" onclick="copySupplierLink('${q.id}')" title="Copiar link fornecedor"><i class="fas fa-link"></i></button>
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
                      <button class="btn btn-secondary btn-sm" onclick="abrirModalPedidoCompra('${pc.id}')" title="Ver detalhes"><i class="fas fa-eye"></i></button>
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
                <button class="btn btn-sm" style="background:#F39C12;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;padding:6px 12px;cursor:pointer;" onclick="dispararCotacao('${sid}','${sup.name}','${sup.email}')">
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
            <div style="font-size:20px;font-weight:800;color:#2980B9;">${[...stockItems, ...products].filter((i: any) => (i.supplierIds||[]).some((sid: string) => suppliers.find((s: any) => s.id === sid && s.type === 'importado'))).length}</div>
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
                    const importedItems = [...stockItems, ...products].filter((i: any) =>
                      (i.supplierIds||[]).some((sid: string) => importedSupIds.has(sid))
                    )
                    if (importedItems.length === 0) {
                      return `<tr><td colspan="10" style="padding:28px;text-align:center;color:#9ca3af;"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px;"></i>Nenhum item vinculado a fornecedor importado</td></tr>`
                    }
                    // Calcular preço unit. referência a partir do processo de importação se existir
                    return importedItems.map((item: any) => {
                      const supId = (item.supplierIds||[]).find((sid: string) => importedSupIds.has(sid))
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
                      const ncm = relatedImp?.ncm || sup?.notes?.match(/NCM\s*([\d.]+)/)?.[1] || '—'
                      // Descrição EN: baseada no nome do produto
                      const descEN = item.englishDescription || item.descEN || item.englishDesc || ''
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
                          <div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${item.name}">${item.name}</div>
                          <div style="font-size:10px;color:#9ca3af;">${item.unit}</div>
                        </td>
                        <td style="padding:6px 10px;min-width:160px;" ondblclick="startInlineEdit(this,'impDescPT','${item.code}','descPT')">
                          <div class="imp-inline-view" style="font-size:12px;color:${item.descPT?'#374151':'#dc2626'};cursor:pointer;min-height:24px;padding:3px 6px;border-radius:4px;border:1px solid transparent;" title="Duplo clique para editar" onmouseenter="this.style.borderColor='#bee3f8'" onmouseleave="this.style.borderColor='transparent'">
                            ${item.descPT || '<span style=&quot;font-style:italic;font-size:11px;&quot;>— clique para preencher —</span>'}
                          </div>
                          <input class="form-control imp-inline-input" style="display:none;font-size:12px;" data-field="descPT" data-code="${item.code}" value="${item.descPT||''}" onblur="saveInlineEdit(this)" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')cancelInlineEdit(this)" placeholder="Descrição em português...">
                        </td>
                        <td style="padding:6px 10px;min-width:160px;" ondblclick="startInlineEdit(this,'impDescEN','${item.code}','descEN')">
                          <div class="imp-inline-view" style="font-size:12px;color:${item.descEN||autoDescEN?'#374151':'#dc2626'};cursor:pointer;min-height:24px;padding:3px 6px;border-radius:4px;border:1px solid transparent;font-style:italic;" title="Duplo clique para editar" onmouseenter="this.style.borderColor='#bee3f8'" onmouseleave="this.style.borderColor='transparent'">
                            ${item.descEN || autoDescEN || '<span style=&quot;font-style:italic;font-size:11px;&quot;>— clique para preencher —</span>'}
                          </div>
                          <input class="form-control imp-inline-input" style="display:none;font-size:12px;" data-field="descEN" data-code="${item.code}" value="${item.descEN||autoDescEN||''}" onblur="saveInlineEdit(this)" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')cancelInlineEdit(this)" placeholder="Description in English...">
                        </td>
                        <td style="padding:6px 10px;min-width:100px;" ondblclick="startInlineEdit(this,'impNCM','${item.code}','ncm')">
                          <div class="imp-inline-view" style="font-size:12px;font-weight:700;color:${ncm!=='—'?'#7c3aed':'#dc2626'};cursor:pointer;min-height:24px;padding:3px 6px;border-radius:4px;border:1px solid transparent;font-family:monospace;" title="Duplo clique para editar" onmouseenter="this.style.borderColor='#ddd6fe'" onmouseleave="this.style.borderColor='transparent'">
                            ${ncm !== '—' ? ncm : '<span style=&quot;font-style:italic;font-size:11px;font-family:sans-serif;&quot;>— preencher —</span>'}
                          </div>
                          <input class="form-control imp-inline-input" style="display:none;font-size:12px;font-family:monospace;" data-field="ncm" data-code="${item.code}" value="${ncm!=='—'?ncm:''}" onblur="saveInlineEdit(this)" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')cancelInlineEdit(this)" placeholder="0000.00.00">
                        </td>
                        <td style="padding:8px 12px;max-width:120px;">
                          <div style="font-size:11px;font-weight:600;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${sup?.name||'—'}">${sup?.name||'—'}</div>
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

  <script>
  const quotationsData = ${safeJsonStringify(quotations).replace(/<\//g, '<\\/')};
  const purchaseOrdersData = ${safeJsonStringify(purchaseOrders).replace(/<\//g, '<\\/')};
  const statusInfoData = ${safeJsonStringify(statusInfo).replace(/<\//g, '<\\/')};
  const suppliersData = ${safeJsonStringify(suppliers).replace(/<\//g, '<\\/')};
  const importsData2 = ${safeJsonStringify(importsData).replace(/<\//g, '<\\/')};
  const allItemsData = ${safeJsonStringify([...stockItems, ...products]).replace(/<\//g, '<\\/')};

  function showToastSup(msg, type) {
    type = type || 'success';
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;color:white;box-shadow:0 4px 20px rgba(0,0,0,0.2);transition:opacity 0.3s;display:flex;align-items:center;gap:8px;max-width:380px;';
    t.style.background = type === 'success' ? '#27AE60' : type === 'error' ? '#E74C3C' : '#2980B9';
    t.innerHTML = (type==='success'?'<i class="fas fa-check-circle"></i>':type==='error'?'<i class="fas fa-exclamation-circle"></i>':'<i class="fas fa-info-circle"></i>') + ' ' + msg;
    document.body.appendChild(t);
    setTimeout(function() { t.style.opacity='0'; setTimeout(function() { t.remove(); }, 300); }, 3500);
  }

  function addCotItem() {
    const list = document.getElementById('cotItensList');
    if (!list) return;
    const div = document.createElement('div');
    div.className = 'cot-item';
    div.style.cssText = 'display:grid;grid-template-columns:2fr 80px 60px auto;gap:8px;margin-bottom:8px;align-items:center;';
    div.innerHTML = '<select class="form-control" style="font-size:12px;"><option value="">Selecionar item...</option>' +
      allItemsData.map(function(i) { return '<option value="'+i.code+'">'+i.name+' ('+i.code+')</option>'; }).join('') + '</select>' +
      '<input class="form-control" type="number" placeholder="Qtd" min="1">' +
      '<input class="form-control" type="text" placeholder="Un" value="un">' +
      '<button class="btn btn-danger btn-sm" onclick="this.closest(\\'.cot-item\\').remove()"><i class="fas fa-trash"></i></button>';
    list.appendChild(div);
  }

  function addCotSupplier() {
    const list = document.getElementById('cotSupplierList');
    if (!list) return;
    const div = document.createElement('div');
    div.className = 'cot-sup';
    div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';
    div.innerHTML = '<select class="form-control" style="font-size:12px;flex:1;"><option value="">Selecionar fornecedor...</option>' +
      suppliersData.map(function(s) { return '<option value="'+s.id+'">'+s.name+' ('+s.type+') \u2014 Prazo: '+s.deliveryLeadDays+'d</option>'; }).join('') + '</select>' +
      '<button class="btn btn-danger btn-sm" onclick="this.closest(\\'.cot-sup\\').remove()"><i class="fas fa-trash"></i></button>';
    list.appendChild(div);
  }

  async function salvarCotacao() {
    const tipo = document.getElementById('cotTipo').value;
    const descricao = document.getElementById('cotDescricao')?.value?.trim() || 'Cotação de suprimentos';
    const deadline = document.getElementById('cotDataLimite')?.value || '';
    const obs = document.getElementById('cotObs')?.value?.trim() || '';
    const items = [];
    document.querySelectorAll('.cot-item').forEach(function(row) {
      const sel = row.querySelector('select');
      const inputs = row.querySelectorAll('input');
      if (sel && sel.value) items.push({ productCode: sel.value, productName: sel.options[sel.selectedIndex]?.text || sel.value, quantity: parseInt(inputs[0]?.value||'1')||1, unit: inputs[1]?.value||'un' });
    });
    const supplierIds = [];
    document.querySelectorAll('.cot-sup select').forEach(function(sel) { if (sel.value) supplierIds.push(sel.value); });
    if (items.length === 0 && tipo !== 'critico') { showToastSup('\u26a0\ufe0f Adicione pelo menos 1 item \u00e0 cota\u00e7\u00e3o!', 'error'); return; }
    if (supplierIds.length === 0) { showToastSup('\u26a0\ufe0f Selecione pelo menos 1 fornecedor!', 'error'); return; }
    if (!deadline) { showToastSup('\u26a0\ufe0f Informe a data limite para respostas!', 'error'); return; }
    try {
      const res = await fetch('/suprimentos/api/quotations/create', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ tipo, descricao, items, supplierIds, deadline, observations: obs })
      });
      const data = await res.json();
      if (data.ok) {
        if (data.warning) {
          showToastSup('\u26a0\ufe0f ' + data.warning, 'warning');
          const pendingQuotations = JSON.parse(localStorage.getItem('pending_quotations') || '[]');
          pendingQuotations.push(data.quotation);
          localStorage.setItem('pending_quotations', JSON.stringify(pendingQuotations));
        } else {
          showToastSup('\u2705 Cota\u00e7\u00e3o ' + (data.code||'') + ' criada com sucesso!', 'success');
        }
        closeModal('gerarCotacaoModal');
        setTimeout(function() { location.reload(); }, 1000);
      } else { showToastSup(data.error || 'Erro ao criar cota\u00e7\u00e3o', 'error'); }
    } catch(e) { showToastSup('Erro de conex\u00e3o', 'error'); }
  }

  function onCotTipoChange() {
    const tipo = document.getElementById('cotTipo').value;
    const itensSection = document.getElementById('cotItensSection');
    if (tipo === 'critico') {
      if (itensSection) { itensSection.style.opacity = '0.5'; itensSection.style.pointerEvents = 'none'; }
      preencherItensCriticos();
    } else {
      if (itensSection) { itensSection.style.opacity = '1'; itensSection.style.pointerEvents = ''; }
    }
  }

  function preencherItensCriticos() {
    const criticalItems = allItemsData.filter(function(i) { return i.type === 'external' && i.stockStatus === 'critical'; });
    if (criticalItems.length === 0) {
      showToastSup('\u26a0\ufe0f Nenhum item cr\u00edtico encontrado!', 'warning');
      return;
    }
    const list = document.getElementById('cotItensList');
    if (list) { list.querySelectorAll('.cot-item').forEach(function(item) { item.remove(); }); }
    criticalItems.forEach(function(item) {
      addCotItem();
      const items = document.querySelectorAll('.cot-item');
      const lastItem = items[items.length - 1];
      if (lastItem) {
        const sel = lastItem.querySelector('select');
        if (sel) sel.value = item.code;
        const inputs = lastItem.querySelectorAll('input');
        if (inputs[0]) inputs[0].value = (item.stockMin || 10) * 2;
      }
    });
    showToastSup('\u2705 ' + criticalItems.length + ' itens cr\u00edticos adicionados!', 'success');
  }
  </script>

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
              <button class="btn btn-sm" style="background:#e8f4fd;color:#2980B9;border:1px solid #bee3f8;" onclick="uploadDocSlot(${i},'${doc}')"><i class="fas fa-upload"></i></button>
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
                const totalValue = (q.items || []).reduce((sum: number, item: any) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0)
                return `<option value="${q.id}">${q.code} | ${q.supplierName || q.supplierResponses?.[0]?.supplierName || 'Fornecedor'} | R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</option>`
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

  <!-- Modal: Detalhes Pedido de Compra -->
  <div class="modal-overlay" id="pedidoCompraDetailModal">
    <div class="modal" style="max-width:700px;max-height:80vh;overflow-y:auto;display:flex;flex-direction:column;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;background:white;position:sticky;top:0;z-index:10;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;" id="pedidoDetailTitle">
          <i class="fas fa-shopping-cart" style="margin-right:8px;"></i>Detalhes do Pedido
        </h3>
        <button onclick="closeModal('pedidoCompraDetailModal')" style="background:none;border:none;font-size:24px;cursor:pointer;color:#9ca3af;padding:0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">×</button>
      </div>
      <div style="padding:20px 24px;flex:1;overflow-y:auto;" id="pedidoDetailBody">
        <p style="text-align:center;color:#9ca3af;">Carregando detalhes...</p>
      </div>
    </div>
  </div>

  <script>

  // ── Cotações ──────────────────────────────────────────────────────────────
  async function approveQuotation(id, code, supplierName) {
    if (!confirm('Aprovar cotação ' + code + '?\nUm Pedido de Compra será gerado automaticamente.')) return;
    try {
      const res = await fetch('/suprimentos/api/quotations/' + id + '/approve', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ supplierName })
      });
      const data = await res.json();
      if (data.ok) {
        showToastSup('✅ Cotação ' + code + ' aprovada! PC ' + (data.pcCode||'') + ' gerado.', 'success');
        setTimeout(() => location.reload(), 1000);
      } else { showToastSup(data.error || 'Erro ao aprovar', 'error'); }
    } catch(e) { showToastSup('Erro de conexão', 'error'); }
  }

  async function recusarCotacao(id, code) {
    const motivo = prompt('Motivo da recusa da cotação ' + code + ':');
    if (!motivo) return;
    try {
      const res = await fetch('/suprimentos/api/quotations/' + id + '/reject', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ motivo })
      });
      const data = await res.json();
      if (data.ok) { showToastSup('❌ Cotação ' + code + ' recusada.', 'success'); setTimeout(() => location.reload(), 1000); }
      else { showToastSup(data.error || 'Erro ao recusar', 'error'); }
    } catch(e) { showToastSup('Erro de conexão', 'error'); }
  }

  async function reenviarCotacao(id, code) {
    if (!confirm('Reenviar cotação ' + code + ' para os fornecedores?')) return;
    showToastSup('📧 Reenviando cotação...', 'info');
    try {
      const res = await fetch('/suprimentos/api/quotations/' + id + '/resend', {
        method: 'POST', headers: {'Content-Type':'application/json'}
      });
      const data = await res.json();
      if (data.ok) {
        showToastSup('✅ Cotação ' + code + ' reenviada para os fornecedores!', 'success');
        setTimeout(() => location.reload(), 800);
      } else { showToastSup(data.error || 'Erro ao reenviar', 'error'); }
    } catch(e) { showToastSup('Erro de conexão', 'error'); }
  }

  function dispararCotacao(supId, supName, supEmail) {
    if (!confirm('Disparar cotação individual para ' + supName + '?')) return;
    showToastSup('📧 Cotação enviada para ' + supName + '!', 'success');
  }

  function gerarCotacoesCriticos() {
    showToastSup('✅ Cotações geradas para itens críticos!', 'success');
  }

  function copySupplierLink(quotId) {
    const link = window.location.origin + '/suprimentos/cotacao/' + quotId + '/responder';
    navigator.clipboard?.writeText(link).then(() => {
      showToastSup('🔗 Link copiado: ' + link, 'success');
    }).catch(() => { showToastSup('Link: ' + link, 'success'); });
  }

  function openQuotationDetail(id) {
    // Nível 1: validar parâmetro quotId
    if (!id) { showToastSup('⚠️ ID da cotação inválido', 'error'); return; }
    // Nível 2: validar que quotationsData está definido
    if (typeof quotationsData === 'undefined') { showToastSup('⚠️ Dados de cotações não carregados', 'error'); return; }
    // Nível 3: validar que quotationsData é um array
    if (!Array.isArray(quotationsData)) { showToastSup('⚠️ Estrutura de cotações inválida', 'error'); return; }
    // Nível 4: validar que há cotações
    if (quotationsData.length === 0) { showToastSup('⚠️ Nenhuma cotação disponível', 'error'); return; }
    // Nível 5: buscar cotação
    const found = quotationsData.find(function(x) { return x.id === id; });
    // Nível 6: validar que a cotação foi encontrada
    if (!found) { showToastSup('⚠️ Cotação não encontrada: ' + id, 'error'); return; }
    const q = found;
    // Nível 7: validar que o status existe
    if (!q.status) { showToastSup('⚠️ Status da cotação inválido', 'error'); return; }
    // Nível 8: cotação com status final não permite mais ações (apenas visualização)
    const finalStatuses = ['approved', 'cancelled', 'rejected'];
    const canAct = !finalStatuses.includes(q.status);

    const si = statusInfoData[q.status] || statusInfoData.sent;
    document.getElementById('quotDetailTitle').innerHTML = '<i class="fas fa-file-invoice-dollar" style="margin-right:8px;"></i>' + q.code;
    let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">' +
      detRow('Código', q.code) + detRow('Status', '<span class="badge" style="background:'+si.bg+';color:'+si.color+';">'+si.label+'</span>') +
      detRow('Criado por', q.createdBy || '—') + detRow('Data', new Date((q.createdAt||new Date().toISOString())+'T12:00:00').toLocaleDateString('pt-BR')) +
      (q.approvedBy ? detRow('Aprovado por', q.approvedBy) + detRow('Aprovação', new Date((q.approvedAt||'')+'T12:00:00').toLocaleDateString('pt-BR')) : '') +
      (q.rejectionReason ? detRow('Motivo Negação', q.rejectionReason) : '') +
      (q.negotiationObs ? detRow('Obs. Negociação', q.negotiationObs) : '') +
      '</div>';
    html += '<div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:8px;">Itens Solicitados</div>';
    html += '<div class="table-wrapper" style="margin-bottom:16px;"><table><thead><tr><th>Produto</th><th>Qtd</th><th>Unidade</th></tr></thead><tbody>';
    for (const it of (q.items||[])) html += '<tr><td>'+(it.productName||'')+'</td><td><strong>'+(it.quantity||0)+'</strong></td><td>'+(it.unit||'un')+'</td></tr>';
    html += '</tbody></table></div>';
    if ((q.supplierResponses||[]).length > 0) {
      const best = q.supplierResponses.reduce(function(b, r) { return (!b || r.totalPrice < b.totalPrice) ? r : b; }, null);
      html += '<div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:8px;">Respostas dos Fornecedores</div>';
      html += '<div style="display:flex;flex-direction:column;gap:8px;">';
      for (const r of q.supplierResponses) {
        const isBest = r.supplierName === best.supplierName;
        html += '<div style="background:#f8f9fa;border-radius:8px;padding:12px;border-left:3px solid '+(isBest?'#27AE60':'#d1d5db')+';">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:8px;">' +
          '<div style="font-size:13px;font-weight:700;color:#374151;">' + r.supplierName + '</div>' +
          (isBest ? '<span class="badge" style="background:#f0fdf4;color:#16a34a;"><i class="fas fa-crown" style="font-size:9px;"></i> Melhor Preço</span>' : '') +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
          '<div><div style="font-size:10px;color:#9ca3af;">PREÇO UNIT.</div><div style="font-size:14px;font-weight:800;color:#27AE60;">R$ '+(r.unitPrice||0).toFixed(2)+'</div></div>' +
          '<div><div style="font-size:10px;color:#9ca3af;">TOTAL</div><div style="font-size:14px;font-weight:800;color:#1B4F72;">R$ '+(r.totalPrice||0).toLocaleString('pt-BR',{minimumFractionDigits:2})+'</div></div>' +
          '<div><div style="font-size:10px;color:#9ca3af;">PRAZO</div><div style="font-size:14px;font-weight:800;color:#2980B9;">'+(r.deliveryDays||0)+'d</div></div>' +
          '</div>' + (r.notes ? '<div style="font-size:12px;color:#6c757d;margin-top:6px;">'+r.notes+'</div>' : '') +
          '</div>';
      }
      html += '</div>';
    } else {
      html += '<div style="background:#fffbeb;border-radius:8px;padding:16px;text-align:center;"><i class="fas fa-clock" style="font-size:24px;color:#F39C12;margin-bottom:6px;"></i><div style="font-size:13px;color:#d97706;">Aguardando resposta dos fornecedores...</div></div>';
    }
    document.getElementById('quotDetailBody').innerHTML = html;

    // Ocultar área de negociação
    const negArea = document.getElementById('quotNegotiationArea');
    const negObs = document.getElementById('quotNegotiationObs');
    if (negArea) negArea.style.display = 'none';
    if (negObs) negObs.value = '';

    // Montar botões de ação
    const actDiv = document.getElementById('quotDetailActions');
    let actHtml = '<button onclick="closeModal(&quot;quotationDetailModal&quot;)" class="btn btn-secondary">Fechar</button>';
    if (canAct) {
      const supName = ((q.supplierResponses||[])[0]?.supplierName||'fornecedor').replace(/'/g,"'");
      window._detailQuotId = q.id;
      window._detailQuotCode = q.code;
      window._detailQuotSup = supName;
      actHtml =
        '<button onclick="rejectQuotationFromDetail()" class="btn" style="background:#dc2626;color:white;border:none;border-radius:6px;padding:8px 16px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><i class="fas fa-times"></i> Negar</button>' +
        '<button onclick="negotiateQuotationFromDetail()" class="btn" style="background:#2563eb;color:white;border:none;border-radius:6px;padding:8px 16px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><i class="fas fa-comments"></i> Negociar</button>' +
        '<button onclick="approveQuotationFromDetail()" class="btn btn-success" style="display:inline-flex;align-items:center;gap:6px;"><i class="fas fa-check"></i> Aprovar</button>' +
        actHtml;
    }
    actDiv.innerHTML = actHtml;
    openModal('quotationDetailModal');
  }

  function detRow(label, value) {
    return '<div style="background:#f8f9fa;border-radius:8px;padding:10px 12px;">' +
      '<div style="font-size:10px;color:#9ca3af;font-weight:600;">'+label.toUpperCase()+'</div>' +
      '<div style="font-size:13px;color:#374151;margin-top:3px;">'+value+'</div></div>';
  }

  function approveQuotationFromDetail() {
    approveQuotation(window._detailQuotId, window._detailQuotCode, window._detailQuotSup);
    closeModal('quotationDetailModal');
  }

  function cancelNegotiationFromDetail() {
    const negArea = document.getElementById('quotNegotiationArea');
    if (negArea) negArea.style.display = 'none';
    openQuotationDetail(window._detailQuotId);
  }

  function negotiateQuotationFromDetail() {
    const negArea = document.getElementById('quotNegotiationArea');
    const actDiv = document.getElementById('quotDetailActions');
    if (!negArea) return;
    if (negArea.style.display === 'none') {
      negArea.style.display = 'block';
      // Replace action buttons with Confirmar Negociação
      actDiv.innerHTML =
        '<button onclick="cancelNegotiationFromDetail()" class="btn btn-secondary">Cancelar</button>' +
        '<button onclick="confirmNegotiateQuotation()" class="btn" style="background:#2563eb;color:white;border:none;border-radius:6px;padding:8px 16px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><i class="fas fa-paper-plane"></i> Confirmar Negociação</button>';
    }
  }

  async function confirmNegotiateQuotation() {
    const obs = (document.getElementById('quotNegotiationObs')?.value || '').trim();
    if (!obs) { showToastSup('⚠️ Informe as observações da negociação', 'error'); return; }
    const id = window._detailQuotId;
    const code = window._detailQuotCode;
    if (!id || !code) { showToastSup('⚠️ Cotação inválida', 'error'); return; }
    try {
      const res = await fetch('/suprimentos/api/quotations/' + id + '/negotiate', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ observations: obs })
      });
      const data = await res.json();
      if (data.ok) {
        showToastSup('🤝 Cotação ' + code + ' em negociação!', 'success');
        closeModal('quotationDetailModal');
        setTimeout(() => location.reload(), 1000);
      } else { showToastSup(data.error || 'Erro ao registrar negociação', 'error'); }
    } catch(e) { showToastSup('Erro de conexão', 'error'); }
  }

  async function rejectQuotationFromDetail() {
    const id = window._detailQuotId;
    const code = window._detailQuotCode;
    if (!id || !code) { showToastSup('⚠️ Cotação inválida', 'error'); return; }
    const motivo = prompt('Motivo da negação da cotação ' + code + ':');
    if (!motivo) return;
    try {
      const res = await fetch('/suprimentos/api/quotations/' + id + '/reject', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ motivo })
      });
      const data = await res.json();
      if (data.ok) {
        showToastSup('❌ Cotação ' + code + ' negada.', 'success');
        closeModal('quotationDetailModal');
        setTimeout(() => location.reload(), 1000);
      } else { showToastSup(data.error || 'Erro ao negar cotação', 'error'); }
    } catch(e) { showToastSup('Erro de conexão', 'error'); }
  }

  // ── Importação ────────────────────────────────────────────────────────────
  function openImportDetail(id) {
    const imp = importsData2.find(x => x.id === id);
    if (!imp) return;
    const taxes = imp.taxes || {};
    const num = imp.numerario || {};
    document.getElementById('importDetailTitle').innerHTML = '<i class="fas fa-ship" style="margin-right:8px;"></i>' + imp.code + ' — ' + imp.supplierName;
    let html = '';
    // Seção dados gerais
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">';
    html += detRow('Código Processo', imp.code) + detRow('Fornecedor', imp.supplierName);
    html += detRow('Invoice Nº', imp.invoiceNumber) + detRow('Data Invoice', new Date(imp.invoiceDate+'T12:00:00').toLocaleDateString('pt-BR'));
    html += detRow('Incoterm', imp.incoterm) + detRow('NCM', imp.ncm);
    html += detRow('Porto Origem', imp.portOfOrigin) + detRow('Porto Destino', imp.portOfDestination);
    html += detRow('Peso Líquido', imp.netWeight + ' kg') + detRow('Peso Bruto', imp.grossWeight + ' kg');
    html += detRow('Chegada Prevista', new Date(imp.expectedArrival+'T12:00:00').toLocaleDateString('pt-BR')) + detRow('Descrição', imp.description);
    html += '</div>';
    // Invoice
    html += '<div style="background:#e8f4fd;border-radius:8px;padding:14px;margin-bottom:16px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:10px;"><i class="fas fa-file-invoice-dollar" style="margin-right:6px;"></i>Valores da Invoice</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">';
    html += '<div><div style="font-size:10px;color:#9ca3af;font-weight:700;">VALOR '+(imp.invoiceValueEUR > 0 ? 'EUR':'USD')+'</div><div style="font-size:18px;font-weight:800;color:#2980B9;">'+(imp.invoiceValueEUR > 0 ? '€'+imp.invoiceValueEUR.toLocaleString('pt-BR',{minimumFractionDigits:2}) : 'US$'+imp.invoiceValueUSD.toLocaleString('pt-BR',{minimumFractionDigits:2}))+'</div></div>';
    html += '<div><div style="font-size:10px;color:#9ca3af;font-weight:700;">TAXA CÂMBIO</div><div style="font-size:18px;font-weight:800;color:#374151;">R$ '+imp.exchangeRate+'</div></div>';
    html += '<div><div style="font-size:10px;color:#9ca3af;font-weight:700;">VALOR BRL</div><div style="font-size:18px;font-weight:800;color:#1B4F72;">R$ '+imp.invoiceValueBRL.toLocaleString('pt-BR',{minimumFractionDigits:2})+'</div></div>';
    html += '</div></div>';
    // Impostos
    html += '<div style="background:#fef2f2;border-radius:8px;padding:14px;margin-bottom:16px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:10px;"><i class="fas fa-percent" style="margin-right:6px;"></i>Alíquotas e Impostos</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">II</div><div style="font-size:16px;font-weight:800;color:#dc2626;">' + taxes.ii + '%</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">IPI</div><div style="font-size:16px;font-weight:800;color:#dc2626;">' + taxes.ipi + '%</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">PIS</div><div style="font-size:16px;font-weight:800;color:#d97706;">' + taxes.pis + '%</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">COFINS</div><div style="font-size:16px;font-weight:800;color:#d97706;">' + taxes.cofins + '%</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">ICMS</div><div style="font-size:16px;font-weight:800;color:#7c3aed;">' + taxes.icms + '%</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">AFRMM</div><div style="font-size:16px;font-weight:800;color:#374151;">R$ ' + taxes.afrmm + '</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">SISCOMEX</div><div style="font-size:16px;font-weight:800;color:#374151;">R$ ' + taxes.siscomex + '</div></div>';
    html += '<div style="background:#fef2f2;border-radius:6px;padding:8px;text-align:center;border:2px solid #dc2626;"><div style="font-size:10px;color:#9ca3af;">TOTAL IMPOSTOS</div><div style="font-size:16px;font-weight:800;color:#dc2626;">R$ ' + (taxes.taxBRL||0).toLocaleString('pt-BR',{minimumFractionDigits:2}) + '</div></div>';
    html += '</div></div>';
    // Numerário
    html += '<div style="background:#f5f3ff;border-radius:8px;padding:14px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:10px;"><i class="fas fa-calculator" style="margin-right:6px;"></i>Pré-via de Numerário (Custo Desembaraçado)</div>';
    html += '<div style="display:flex;flex-direction:column;gap:6px;">';
    const numItems = [
      ['Invoice (BRL)', num.invoiceBRL], ['Frete', num.freightBRL], ['Seguro', num.insuranceBRL],
      ['Impostos', num.taxesBRL], ['Despachante', num.brokerageBRL], ['Taxas Porto', num.portFeesBRL], ['Armazenagem', num.storageBRL]
    ];
    for (const [label, val] of numItems) {
      if (!val) continue;
      html += '<div style="display:flex;justify-content:space-between;padding:6px 8px;background:white;border-radius:6px;">' +
        '<span style="font-size:13px;color:#374151;">'+label+'</span>' +
        '<span style="font-size:13px;font-weight:600;color:#374151;">R$ '+val.toLocaleString('pt-BR',{minimumFractionDigits:2})+'</span></div>';
    }
    html += '<div style="display:flex;justify-content:space-between;padding:10px 8px;background:#7c3aed;border-radius:6px;margin-top:4px;">' +
      '<span style="font-size:13px;font-weight:700;color:white;">CUSTO TOTAL DESEMBARAÇADO</span>' +
      '<span style="font-size:15px;font-weight:800;color:white;">R$ '+(num.totalLandedCostBRL||0).toLocaleString('pt-BR',{minimumFractionDigits:2})+'</span></div>';
    html += '<div style="display:flex;justify-content:flex-end;padding:6px 8px;">' +
      '<span style="font-size:12px;color:#7c3aed;font-weight:600;">Custo Unitário: R$ '+(num.unitCostBRL||0).toFixed(2)+' / unidade</span></div>';
    html += '</div></div>';
    document.getElementById('importDetailBody').innerHTML = html;
    openModal('importDetailModal');
  }

  function openNumerario(id) {
    const imp = importsData2.find(x => x.id === id);
    if (!imp) return;
    const num = imp.numerario || {};
    document.getElementById('numerarioTitle').innerHTML = '<i class="fas fa-calculator" style="margin-right:8px;"></i>Pré-via de Numerário — ' + imp.code;
    let html = '<div style="background:#1B4F72;color:white;border-radius:8px;padding:16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">' +
      '<div><div style="font-size:12px;opacity:0.8;">PROCESSO</div><div style="font-size:18px;font-weight:800;">' + imp.code + '</div>' +
      '<div style="font-size:12px;opacity:0.7;">' + imp.supplierName + ' · ' + imp.invoiceNumber + '</div></div>' +
      '<div style="text-align:right;"><div style="font-size:11px;opacity:0.7;">CUSTO TOTAL DESEMBARAÇADO</div><div style="font-size:24px;font-weight:800;">R$ ' + (num.totalLandedCostBRL||0).toLocaleString('pt-BR',{minimumFractionDigits:2}) + '</div></div>' +
      '</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<thead><tr style="background:#f8f9fa;"><th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">Componente</th><th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">Valor (BRL)</th><th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">% do Total</th></tr></thead>';
    html += '<tbody>';
    const rows = [
      { label: 'Valor da Invoice', val: num.invoiceBRL, color: '#1B4F72' },
      { label: 'Frete Internacional', val: num.freightBRL, color: '#374151' },
      { label: 'Seguro', val: num.insuranceBRL, color: '#374151' },
      { label: 'Impostos (II + IPI + PIS/COFINS + ICMS + AFRMM + SISCOMEX)', val: num.taxesBRL, color: '#dc2626' },
      { label: 'Honorários do Despachante', val: num.brokerageBRL, color: '#374151' },
      { label: 'Taxas Portuárias', val: num.portFeesBRL, color: '#374151' },
      { label: 'Armazenagem', val: num.storageBRL, color: '#374151' },
    ];
    const total = num.totalLandedCostBRL || 1;
    for (const row of rows) {
      if (!row.val) continue;
      const pct = ((row.val / total) * 100).toFixed(1);
      html += '<tr style="border-bottom:1px solid #e9ecef;"><td style="padding:10px 12px;color:' + row.color + ';font-weight:600;">' + row.label + '</td>' +
        '<td style="padding:10px 12px;text-align:right;font-weight:700;color:' + row.color + ';">R$ ' + row.val.toLocaleString('pt-BR',{minimumFractionDigits:2}) + '</td>' +
        '<td style="padding:10px 12px;text-align:right;">' +
        '<div style="display:flex;align-items:center;gap:8px;justify-content:flex-end;"><div style="height:6px;background:#e9ecef;border-radius:3px;width:60px;overflow:hidden;"><div style="height:100%;background:' + row.color + ';width:' + pct + '%;"></div></div>' +
        '<span style="font-size:12px;color:#6c757d;min-width:36px;">' + pct + '%</span></div></td></tr>';
    }
    html += '<tr style="background:#1B4F72;"><td colspan="3" style="padding:12px;"><div style="display:flex;justify-content:space-between;"><span style="font-size:14px;font-weight:700;color:white;">CUSTO TOTAL DESEMBARAÇADO</span><span style="font-size:16px;font-weight:800;color:white;">R$ ' + (num.totalLandedCostBRL||0).toLocaleString('pt-BR',{minimumFractionDigits:2}) + '</span></div></td></tr>';
    html += '</tbody></table>';
    html += '<div style="background:#f5f3ff;border-radius:8px;padding:12px;margin-top:14px;display:flex;justify-content:space-between;align-items:center;">' +
      '<div><div style="font-size:12px;color:#7c3aed;font-weight:700;">CUSTO UNITÁRIO DESEMBARAÇADO</div><div style="font-size:11px;color:#9ca3af;margin-top:2px;">Base para formação de preço de custo</div></div>' +
      '<div style="font-size:22px;font-weight:800;color:#7c3aed;">R$ ' + (num.unitCostBRL||0).toFixed(2) + '</div>' +
      '</div>';
    document.getElementById('numerarioBody').innerHTML = html;
    openModal('numerarioModal');
  }

  // ── Nova importação: cálculos inline ─────────────────────────────────────
  function updateImpMoedaLabel() {
    // mantido por compatibilidade
    calcImpBRL();
  }

  // ── Navegação entre abas do modal de nova importação ────────────────────
  function switchImpTab(n) {
    [1,2,3].forEach(i => {
      document.getElementById('impTabContent'+i).style.display = i===n ? 'block':'none';
      const btn = document.getElementById('impTab'+i);
      if (i===n) { btn.style.color='#1B4F72'; btn.style.borderBottom='2px solid #1B4F72'; }
      else { btn.style.color='#6c757d'; btn.style.borderBottom='none'; }
    });
    if (n===3) { calcImpostos(); updateImpResumo(); }
  }

  // ── Seletor de modalidade ──────────────────────────────────────────────
  function selectModalidade(mode) {
    const labels = { aereo:'lblAereo', terrestre:'lblTerrestre', maritimo:'lblMaritimo' };
    const colors = { aereo:'#2980B9', terrestre:'#27AE60', maritimo:'#7c3aed' };
    const origemLabels = { aereo:'Aeroporto de Origem', terrestre:'Cidade de Origem', maritimo:'Porto de Origem' };
    const destLabels = { aereo:'Aeroporto de Destino', terrestre:'Cidade de Destino', maritimo:'Porto de Destino' };
    Object.keys(labels).forEach(m => {
      const el = document.getElementById(labels[m]);
      if (m===mode) { el.style.border='2px solid '+colors[mode]; el.style.background=colors[mode]+'15'; }
      else { el.style.border='2px solid #e9ecef'; el.style.background='white'; }
    });
    document.getElementById('impOrigemLabel').textContent = origemLabels[mode];
    document.getElementById('impDestinoLabel').textContent = destLabels[mode];
  }
  // Inicializa marítimo
  setTimeout(() => selectModalidade('maritimo'), 100);

  // ── Adicionar item à invoice ──────────────────────────────────────────
  let impItemCount = 0;
  function addImpItem() {
    impItemCount++;
    const idx = impItemCount;
    const list = document.getElementById('impItensList');
    const div = document.createElement('div');
    div.id = 'impItem'+idx;
    div.style.cssText = 'background:#f8f9fa;border:1px solid #e9ecef;border-radius:8px;padding:10px;margin-bottom:4px;';
    div.innerHTML = \`
      <div style="display:grid;grid-template-columns:90px 2fr 70px 1fr 90px 90px 80px 36px;gap:6px;align-items:start;">
        <div>
          <label style="font-size:9px;font-weight:700;color:#6c757d;text-transform:uppercase;display:block;margin-bottom:2px;">Cód.</label>
          <select class="form-control" style="font-size:11px;" id="impItemProd\${idx}" onchange="onImpItemChange(\${idx})">
            <option value="">Selecionar...</option>
            \${allItemsData.map(i => '<option value="'+i.code+'">'+i.code+' — '+i.name+'</option>').join('')}
            <option value="__manual__">— Manual —</option>
          </select>
        </div>
        <div>
          <label style="font-size:9px;font-weight:700;color:#6c757d;text-transform:uppercase;display:block;margin-bottom:2px;">Descrição EN *</label>
          <input class="form-control" id="impItemDescEN\${idx}" type="text" placeholder="English description..." style="font-size:12px;" oninput="calcImpTotal()">
        </div>
        <div>
          <label style="font-size:9px;font-weight:700;color:#6c757d;text-transform:uppercase;display:block;margin-bottom:2px;">Qtd</label>
          <input class="form-control" id="impItemQtd\${idx}" type="number" placeholder="Qtd" min="0" step="0.001" style="font-size:12px;" value="1" oninput="recalcImpItem(\${idx})">
        </div>
        <div>
          <label style="font-size:9px;font-weight:700;color:#6c757d;text-transform:uppercase;display:block;margin-bottom:2px;">Observações</label>
          <input class="form-control" id="impItemObs\${idx}" type="text" placeholder="Especificação, uso..." style="font-size:12px;">
        </div>
        <div>
          <label style="font-size:9px;font-weight:700;color:#6c757d;text-transform:uppercase;display:block;margin-bottom:2px;">Val. Unit.</label>
          <input class="form-control" id="impItemVU\${idx}" type="number" placeholder="0.00" min="0" step="0.01" style="font-size:12px;" value="0" oninput="recalcImpItem(\${idx})">
        </div>
        <div>
          <label style="font-size:9px;font-weight:700;color:#6c757d;text-transform:uppercase;display:block;margin-bottom:2px;">Val. Total</label>
          <input class="form-control" id="impItemSub\${idx}" type="text" placeholder="Subtotal" readonly style="font-size:12px;background:#fff;color:#1B4F72;font-weight:700;">
        </div>
        <div>
          <label style="font-size:9px;font-weight:700;color:#6c757d;text-transform:uppercase;display:block;margin-bottom:2px;">NCM</label>
          <input class="form-control" id="impItemNCM\${idx}" type="text" placeholder="0000.00.00" style="font-size:11px;font-family:monospace;" value="">
        </div>
        <div style="padding-top:18px;">
          <button class="btn btn-danger btn-sm" style="padding:6px 8px;" onclick="removeImpItem(\${idx})"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div style="margin-top:6px;">
        <label style="font-size:9px;font-weight:700;color:#6c757d;text-transform:uppercase;">Descrição PT (para LI)</label>
        <input class="form-control" id="impItemDescPT\${idx}" type="text" placeholder="Ex: Chapa de Alumínio Liga 6061 esp. 3mm" style="font-size:12px;margin-top:2px;" oninput="calcImpTotal()">
      </div>\`;
    list.appendChild(div);
    calcImpTotal();
  }

  function removeImpItem(idx) {
    const el = document.getElementById('impItem'+idx);
    if (el) el.remove();
    calcImpTotal();
  }

  function onImpItemChange(idx) {
    const sel = document.getElementById('impItemProd'+idx);
    const code = sel.value;
    if (!code || code==='__manual__') return;
    const item = allItemsData.find(i => i.code===code);
    if (!item) return;
    // Pré-preenche descrição PT e EN dos dados do produto importado
    const impProdEl = document.querySelector('.imp-prod-row[data-code="'+code+'"]');
    const descPT = item.descPT || item.name || '';
    const descEN = item.descEN || item.englishDescription || item.englishDesc || '';
    const ncm = item.ncm || (impProdEl ? (() => {
      const cells = impProdEl.querySelectorAll('td');
      return cells[4]?.textContent?.trim() || '';
    })() : '');
    if (document.getElementById('impItemDescPT'+idx)) document.getElementById('impItemDescPT'+idx).value = descPT;
    if (document.getElementById('impItemDescEN'+idx)) document.getElementById('impItemDescEN'+idx).value = descEN;
    if (document.getElementById('impItemNCM'+idx) && ncm) document.getElementById('impItemNCM'+idx).value = ncm;
    calcImpTotal();
  }

  function recalcImpItem(idx) {
    const qtd = parseFloat(document.getElementById('impItemQtd'+idx)?.value)||0;
    const vu = parseFloat(document.getElementById('impItemVU'+idx)?.value)||0;
    const sub = qtd * vu;
    const moeda = document.getElementById('impMoeda')?.value || 'EUR';
    const sym = moeda==='EUR'?'€':moeda==='USD'?'US$':moeda==='GBP'?'£':'¥';
    const el = document.getElementById('impItemSub'+idx);
    if (el) el.value = sym+' '+sub.toLocaleString('pt-BR',{minimumFractionDigits:2});
    calcImpTotal();
  }

  function calcImpTotal() {
    const moeda = document.getElementById('impMoeda')?.value || 'EUR';
    const fx = parseFloat(document.getElementById('impCambio')?.value)||1;
    const sym = moeda==='EUR'?'€':moeda==='USD'?'US$':moeda==='GBP'?'£':'¥';
    let total = 0;
    let count = 0;
    document.querySelectorAll('[id^="impItemVU"]').forEach(el => {
      const idx = el.id.replace('impItemVU','');
      const qtd = parseFloat(document.getElementById('impItemQtd'+idx)?.value)||0;
      const vu = parseFloat(el.value)||0;
      total += qtd * vu;
      count++;
    });
    const brl = total * fx;
    const tmEl = document.getElementById('impTotalMoeda');
    const tbEl = document.getElementById('impTotalBRL');
    const brlEl = document.getElementById('impBRL');
    if (tmEl) tmEl.textContent = sym+' '+total.toLocaleString('pt-BR',{minimumFractionDigits:2});
    if (tbEl) tbEl.textContent = 'R$ '+brl.toLocaleString('pt-BR',{minimumFractionDigits:2});
    if (brlEl) brlEl.value = brl.toString();
    document.getElementById('impResumoItens') && (document.getElementById('impResumoItens').textContent = count);
    calcImpostos();
  }

  function calcImpBRL() {
    calcImpTotal();
  }

  function calcImpostos() {
    const brl = parseFloat(document.getElementById('impBRL')?.value) || 0;
    const ii = parseFloat(document.getElementById('taxII')?.value) || 0;
    const ipi = parseFloat(document.getElementById('taxIPI')?.value) || 0;
    const pis = parseFloat(document.getElementById('taxPIS')?.value) || 0;
    const cofins = parseFloat(document.getElementById('taxCOFINS')?.value) || 0;
    const icms = parseFloat(document.getElementById('taxICMS')?.value) || 0;
    const afrmm = parseFloat(document.getElementById('taxAFRMM')?.value) || 0;
    const siscomex = parseFloat(document.getElementById('taxSISCOMEX')?.value) || 0;
    const baseII = brl;
    const valII = baseII * ii / 100;
    const valIPI = (baseII + valII) * ipi / 100;
    const valPIS = brl * pis / 100;
    const valCOFINS = brl * cofins / 100;
    const valICMS = (brl + valII + valIPI) / (1 - icms/100) * (icms/100);
    const total = valII + valIPI + valPIS + valCOFINS + valICMS + afrmm + siscomex;
    const el = document.getElementById('taxTotal');
    if (el) el.value = 'R$ ' + total.toLocaleString('pt-BR', {minimumFractionDigits:2});
    calcNumerario(total);
  }

  function calcNumerario(impostos) {
    const brl = parseFloat(document.getElementById('impBRL')?.value) || 0;
    const taxTotal = impostos !== undefined ? impostos : parseFloat((document.getElementById('taxTotal')?.value||'').replace('R$ ','').replace(/\\./g,'').replace(',','.')) || 0;
    const frete = parseFloat(document.getElementById('numFrete')?.value) || 0;
    const seguro = parseFloat(document.getElementById('numSeguro')?.value) || 0;
    const desp = parseFloat(document.getElementById('numDesp')?.value) || 0;
    const porto = parseFloat(document.getElementById('numPorto')?.value) || 0;
    const arm = parseFloat(document.getElementById('numArm')?.value) || 0;
    const total = brl + taxTotal + frete + seguro + desp + porto + arm;
    const el = document.getElementById('numTotal');
    if (el) el.value = 'R$ ' + total.toLocaleString('pt-BR', {minimumFractionDigits:2});
    updateImpResumo(taxTotal, total);
  }

  function updateImpResumo(taxTotalVal, custoTotalVal) {
    const taxStr = document.getElementById('taxTotal')?.value || 'R$ 0,00';
    const custoStr = document.getElementById('numTotal')?.value || 'R$ 0,00';
    if (document.getElementById('impResumoImpostos')) document.getElementById('impResumoImpostos').textContent = taxStr;
    if (document.getElementById('impResumoCusto')) document.getElementById('impResumoCusto').textContent = custoStr;
  }

  async function salvarImportacao() {
    const inv = document.getElementById('impInvoice')?.value?.trim();
    const fornEl = document.getElementById('impFornecedor');
    const fornId = fornEl?.value || '';
    const forn = fornEl?.options[fornEl?.selectedIndex]?.text || '';
    if (!inv) { showToastSup('⚠️ Informe o número da Invoice!', 'error'); switchImpTab(1); return; }
    if (!fornId) { showToastSup('⚠️ Selecione o fornecedor!', 'error'); return; }
    const mod = document.querySelector('input[name="impModalidade"]:checked')?.value || 'maritimo';
    try {
      const res = await fetch('/suprimentos/api/imports/create', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ invoiceNumber: inv, supplierId: fornId, supplierName: forn, modality: mod })
      });
      const data = await res.json();
      if (data.ok) {
        showToastSup('✅ Importação ' + (data.code||'') + ' criada!', 'success');
        closeModal('novaImportacaoModal');
        setTimeout(() => location.reload(), 1000);
      } else { showToastSup(data.error || 'Erro ao criar importação', 'error'); }
    } catch(e) { showToastSup('Erro de conexão', 'error'); }
  }

  function printNumerario() {
    window.print();
  }

  // ── Rascunho de LI ────────────────────────────────────────────────────
  function openRascunhoLI(id) {
    const imp = importsData2.find(x => x.id === id);
    if (!imp) return;
    document.getElementById('liImpCodigo').textContent = imp.code;
    const hoje = new Date().toLocaleDateString('pt-BR');
    let html = \`
    <div style="background:#f5f3ff;border-radius:8px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div style="font-size:16px;font-weight:800;color:#7c3aed;"><i class="fas fa-stamp" style="margin-right:8px;"></i>RASCUNHO DE LICENÇA DE IMPORTAÇÃO</div>
        <span style="background:#fef2f2;color:#dc2626;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;border:1px solid #fecaca;">MINUTA — Não oficial</span>
      </div>
      <div style="font-size:11px;color:#6c757d;">Gerado automaticamente em \${hoje} · Processo: \${imp.code}</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
      \${detRow('IMPORTADOR (CNPJ)', 'Sua Empresa Ltda — 00.000.000/0001-00')}
      \${detRow('FORNECEDOR / EXPORTADOR', imp.supplierName)}
      \${detRow('PAÍS DE ORIGEM', imp.portOfOrigin.includes('Hamburg')||imp.portOfOrigin.includes('München')?'Alemanha':imp.portOfOrigin.includes('Chicago')?'EUA':'—')}
      \${detRow('PAÍS DE PROCEDÊNCIA', imp.portOfOrigin.includes('Hamburg')||imp.portOfOrigin.includes('München')?'Alemanha':imp.portOfOrigin.includes('Chicago')?'EUA':'—')}
      \${detRow('PORTO/AEROPORTO DESCARGA', imp.portOfDestination)}
      \${detRow('VIA DE TRANSPORTE', imp.incoterm.includes('CIF')?'Marítima':'A definir')}
      \${detRow('INCOTERM', imp.incoterm)}
      \${detRow('REGIME ADUANEIRO', 'Importação Comum')}
      \${detRow('ENQUADRAMENTO CAMBIAL', 'SEM COBERTURA CAMBIAL — LUCROS E DIVIDENDOS')}
      \${detRow('MODALIDADE PAGAMENTO', 'Pagamento Antecipado / L/C à vista')}
    </div>

    <div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:8px;"><i class="fas fa-boxes" style="margin-right:6px;"></i>Relação de Mercadorias</div>
    \${(() => {
      // Tentar montar itens a partir dos dados do processo (itens da invoice)
      const liItems = imp.items && imp.items.length > 0 ? imp.items : [{ productCode: imp.code, descPT: imp.description, ncm: imp.ncm, qty: imp.netWeight, totalCIF: imp.invoiceValueEUR || imp.invoiceValueUSD }];
      const moedaSym = imp.invoiceValueEUR > 0 ? '€' : 'US$';
      const liRows = liItems.map((it, i) => {
        const valTotal = it.totalCIF || it.subtotal || ((it.qty||1) * (it.unitPrice||0));
        return '<tr style="background:'+(i%2===0?'#f8f9fa':'white')+';border-bottom:1px solid #e9ecef;">' +
          '<td style="padding:8px 10px;font-family:monospace;font-weight:700;color:#1B4F72;font-size:11px;">'+(it.productCode||'—')+'</td>' +
          '<td style="padding:8px 10px;font-weight:500;color:#374151;">'+(it.descPT||it.description||imp.description||'— preencher —')+'</td>' +
          '<td style="padding:8px 10px;text-align:right;">'+(it.qty||it.quantity||'—')+'</td>' +
          '<td style="padding:8px 10px;font-weight:700;color:#7c3aed;font-family:monospace;">'+(it.ncm||imp.ncm||'—')+'</td>' +
          '<td style="padding:8px 10px;text-align:right;font-weight:700;color:#1B4F72;">'+moedaSym+' '+(valTotal>0?valTotal.toLocaleString('pt-BR',{minimumFractionDigits:2}):'—')+'</td>' +
          '</tr>';
      }).join('');
      const totalCIF = imp.invoiceValueEUR > 0 ? imp.invoiceValueEUR : imp.invoiceValueUSD;
      return '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">' +
        '<thead><tr style="background:#7c3aed;color:white;">' +
        '<th style="padding:8px 10px;text-align:left;">Cód.</th>' +
        '<th style="padding:8px 10px;text-align:left;">Descrição PT</th>' +
        '<th style="padding:8px 10px;text-align:right;">Qtd</th>' +
        '<th style="padding:8px 10px;text-align:left;">NCM</th>' +
        '<th style="padding:8px 10px;text-align:right;">Valor Total CIF</th>' +
        '</tr></thead>' +
        '<tbody>'+liRows+'</tbody>' +
        '<tfoot><tr style="background:#f5f3ff;">' +
        '<td colspan="4" style="padding:8px 10px;font-weight:700;color:#7c3aed;text-align:right;">TOTAL CIF:</td>' +
        '<td style="padding:8px 10px;font-weight:800;color:#7c3aed;text-align:right;">'+moedaSym+' '+totalCIF.toLocaleString('pt-BR',{minimumFractionDigits:2})+'</td>' +
        '</tr></tfoot>' +
        '</table>';
    })()}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
      \${detRow('VALOR TOTAL CIF (USD/EUR)', imp.invoiceValueEUR > 0 ? '€ '+imp.invoiceValueEUR.toLocaleString('pt-BR',{minimumFractionDigits:2}) : 'US$ '+imp.invoiceValueUSD.toLocaleString('pt-BR',{minimumFractionDigits:2}))}
      \${detRow('VALOR TOTAL CIF (BRL)', 'R$ '+imp.invoiceValueBRL.toLocaleString('pt-BR',{minimumFractionDigits:2})+' (câmbio R$ '+imp.exchangeRate+')')}
      \${detRow('PESO LÍQUIDO', imp.netWeight+' kg')}
      \${detRow('PESO BRUTO', imp.grossWeight+' kg')}
    </div>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;font-size:12px;color:#92400e;">
      <i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>
      <strong>Atenção:</strong> Este rascunho deve ser revisado e validado pelo despachante aduaneiro antes de protocolar a LI no SISCOMEX.
      Informações marcadas como "— preencher —" requerem complementação.
    </div>\`;
    document.getElementById('rascunhoLIBody').innerHTML = html;
    openModal('rascunhoLIModal');
  }

  function imprimirLI() {
    window.print();
  }

  // ── Fechamento de Processo ─────────────────────────────────────────────
  let fechCurrentImp = null;
  const fechDocumentos = {}; // simula documentos por processo

  function openFechamento(id) {
    const imp = importsData2.find(x => x.id === id);
    if (!imp) return;
    fechCurrentImp = imp;
    document.getElementById('fechImpCodigo').textContent = imp.code;
    switchFechTab('doc');
    buildFechHistorico(imp);
    buildFechAuditoria(imp);
    openModal('fechamentoProcessoModal');
  }

  function switchFechTab(tab) {
    ['doc','hist','audit'].forEach(t => {
      const btn = document.getElementById('fechTab'+t.charAt(0).toUpperCase()+t.slice(1));
      const content = document.getElementById('fechTabContent'+t.charAt(0).toUpperCase()+t.slice(1));
      if (!btn||!content) return;
      if (t===tab) { btn.style.color='#1B4F72'; btn.style.borderBottom='2px solid #1B4F72'; content.style.display='block'; }
      else { btn.style.color='#6c757d'; btn.style.borderBottom='none'; content.style.display='none'; }
    });
  }

  function uploadDocSlot(idx, docName) {
    // Simula upload
    const inp = document.createElement('input');
    inp.type='file'; inp.accept='.pdf,.xlsx,.docx,.jpg,.png';
    inp.onchange = function(e) {
      const f = e.target.files[0];
      if (!f) return;
      document.getElementById('docSlotStatus'+idx).textContent = f.name+' — '+new Date().toLocaleDateString('pt-BR');
      document.getElementById('docSlotStatus'+idx).style.color = '#16a34a';
      document.getElementById('docSlot'+idx).style.background='#f0fdf4';
      document.getElementById('docSlot'+idx).style.border='1px solid #bbf7d0';
      document.getElementById('docSlotIcon'+idx).style.background='#dcfce7';
      document.getElementById('docSlotIcon'+idx).innerHTML='<i class="fas fa-check-circle" style="color:#16a34a;font-size:14px;"></i>';
      // Registra no histórico
      if (fechCurrentImp) {
        if (!fechDocumentos[fechCurrentImp.id]) fechDocumentos[fechCurrentImp.id] = [];
        fechDocumentos[fechCurrentImp.id].push({ doc:docName, file:f.name, date:new Date().toLocaleString('pt-BR'), user:document.querySelector('[data-user-name]')?.dataset?.userName||'Usuário' });
        buildFechHistorico(fechCurrentImp);
        buildFechAuditoria(fechCurrentImp);
      }
    };
    inp.click();
  }

  function addFechDocuments(files) {
    for (const f of files) {
      if (fechCurrentImp) {
        if (!fechDocumentos[fechCurrentImp.id]) fechDocumentos[fechCurrentImp.id] = [];
        fechDocumentos[fechCurrentImp.id].push({ doc:'Geral', file:f.name, date:new Date().toLocaleString('pt-BR'), user:document.querySelector('[data-user-name]')?.dataset?.userName||'Usuário' });
      }
    }
    if (fechCurrentImp) { buildFechHistorico(fechCurrentImp); buildFechAuditoria(fechCurrentImp); }
    alert('✅ '+files.length+' arquivo(s) adicionado(s) ao processo!');
  }

  function buildFechHistorico(imp) {
    const docs = fechDocumentos[imp.id] || [];
    // Combina timeline + docs
    const events = [
      ...imp.timeline.filter(t=>t.user).map(t=>({ tipo:'timeline', desc:t.event, date:new Date(t.date+'T12:00:00').toLocaleString('pt-BR'), user:t.user })),
      ...docs.map(d=>({ tipo:'doc', desc:'Upload: '+d.doc+' — '+d.file, date:d.date, user:d.user }))
    ].sort((a,b)=>a.date<b.date?-1:1);
    let html = '';
    if (events.length===0) {
      html = '<div style="text-align:center;padding:28px;color:#9ca3af;"><i class="fas fa-history" style="font-size:24px;margin-bottom:8px;display:block;"></i>Nenhum evento registrado</div>';
    } else {
      html = '<div style="display:flex;flex-direction:column;gap:0;">';
      events.forEach((ev,i) => {
        html += '<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #f1f3f5;">' +
          '<div style="width:32px;height:32px;border-radius:50%;background:'+(ev.tipo==='doc'?'#e8f4fd':'#f0fdf4')+';display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
          '<i class="fas '+(ev.tipo==='doc'?'fa-file-upload':'fa-check')+'" style="font-size:12px;color:'+(ev.tipo==='doc'?'#2980B9':'#16a34a')+';"></i></div>' +
          '<div style="flex:1;"><div style="font-size:13px;color:#374151;font-weight:600;">'+ev.desc+'</div>' +
          '<div style="font-size:11px;color:#9ca3af;">'+ev.date+' · '+ev.user+'</div></div></div>';
      });
      html += '</div>';
    }
    const el = document.getElementById('fechHistoricoBody');
    if (el) el.innerHTML = html;
  }

  function buildFechAuditoria(imp) {
    const docs = fechDocumentos[imp.id] || [];
    const auditRows = [
      { acao:'Processo criado', data:imp.timeline[0]?.date||'—', user:imp.timeline[0]?.user||'Usuário', obs:'Abertura do processo de importação' },
      ...imp.timeline.filter(t=>t.user).map(t=>({ acao:t.event, data:t.date, user:t.user, obs:'Atualização de status' })),
      ...docs.map(d=>({ acao:'Upload de documento', data:d.date, user:d.user, obs:d.doc+': '+d.file }))
    ];
    let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="background:#f1f3f5;"><th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Ação</th><th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Data/Hora</th><th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Usuário</th><th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Observação</th></tr></thead><tbody>';
    auditRows.forEach(r => {
      html += '<tr style="border-bottom:1px solid #f1f3f5;"><td style="padding:8px 10px;font-weight:600;color:#374151;">'+r.acao+'</td><td style="padding:8px 10px;color:#6c757d;">'+r.data+'</td><td style="padding:8px 10px;color:#374151;">'+r.user+'</td><td style="padding:8px 10px;color:#6c757d;">'+r.obs+'</td></tr>';
    });
    html += '</tbody></table>';
    const el = document.getElementById('fechAuditoriaBody');
    if (el) el.innerHTML = html;
  }

  // ── Edição Inline — Tabela de Produtos Importados ───────────────────────
  // Mapa em memória dos dados editados pelo usuário (persiste na sessão)
  const impProdEdits = {};

  function startInlineEdit(td, inputId, code, field) {
    const view = td.querySelector('.imp-inline-view');
    const input = td.querySelector('.imp-inline-input');
    if (!view || !input) return;
    view.style.display = 'none';
    input.style.display = 'block';
    input.focus();
    input.select();
  }

  function saveInlineEdit(input) {
    const code = input.dataset.code || '';
    const field = input.dataset.field || '';
    const val = input.value.trim();
    // Persistir no mapa local
    if (!impProdEdits[code]) impProdEdits[code] = {};
    impProdEdits[code][field] = val;
    // Atualizar view
    const td = input.closest('td');
    if (!td) return;
    const view = td.querySelector('.imp-inline-view');
    if (view) {
      view.innerHTML = val || '<span style="font-style:italic;font-size:11px;">— clique para preencher —</span>';
      if (val) {
        view.style.color = '#374151';
      } else {
        view.style.color = '#dc2626';
      }
      view.style.display = 'block';
    }
    input.style.display = 'none';
    // Salvar no servidor via API
    fetch('/suprimentos/api/product-imp-field', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ code, field, value: val })
    }).then(r => r.json()).then(d => {
      if (d.ok) showToastSup('✅ '+field.toUpperCase()+' salvo para '+code, 'success');
    }).catch(() => showToastSup('Salvo localmente (sincronização pendente)', 'info'));
  }

  function cancelInlineEdit(input) {
    const td = input.closest('td');
    if (!td) return;
    const view = td.querySelector('.imp-inline-view');
    if (view) view.style.display = 'block';
    input.style.display = 'none';
  }

  // ── Produtos Importados ───────────────────────────────────────────────────
  let impProdExpanded = false;
  function toggleImpProdSection() {
    impProdExpanded = !impProdExpanded;
    const sec = document.getElementById('impProdTableSection');
    const chev = document.getElementById('impProdChevron');
    const btn = chev?.closest('button');
    if (sec) sec.style.display = impProdExpanded ? 'block' : 'none';
    if (chev) {
      chev.className = impProdExpanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
    }
    if (btn) btn.innerHTML = (impProdExpanded ? '<i class="fas fa-chevron-up" id="impProdChevron"></i> Recolher' : '<i class="fas fa-chevron-down" id="impProdChevron"></i> Expandir');
  }

  function filterImportProducts() {
    const q = (document.getElementById('filterImpProd')?.value || '').toLowerCase();
    document.querySelectorAll('.imp-prod-row').forEach(row => {
      const text = row.textContent?.toLowerCase() || '';
      row.style.display = text.includes(q) ? '' : 'none';
    });
    if (q && !impProdExpanded) toggleImpProdSection();
  }

  // Mapa de descrições EN editadas pelo usuário
  const impProdDescENMap = {};

  function editDescEN(code) {
    const current = impProdDescENMap[code] || '';
    const val = prompt('Descrição em inglês para ' + code + ':\\n(Ex: Aluminum Alloy 6061 Sheet 3mm thickness)', current);
    if (val === null) return;
    impProdDescENMap[code] = val;
    // Atualiza célula na tabela
    const rows = document.querySelectorAll('.imp-prod-row');
    rows.forEach(row => {
      const codeCell = row.querySelector('td:first-child');
      if (codeCell?.textContent?.trim() === code) {
        const descCell = row.querySelectorAll('td')[2];
        if (descCell) {
          const span = descCell.querySelector('span');
          if (span) span.textContent = val || '— preencher —';
        }
      }
    });
    if (val) alert('✅ Descrição EN salva para ' + code + ':\\n' + val + '\\n\\nSalvo localmente. Para persistir, utilize a edição de produtos em Cadastros.');
  }

  function exportImpProdCSV() {
    const rows = document.querySelectorAll('.imp-prod-row');
    if (rows.length === 0) { alert('Nenhum produto para exportar.'); return; }
    let csv = 'Código,Produto (PT),Descrição EN,NCM,Detalhes Técnicos,Qtd Atual,Preço Unit. Ref.,Subtotal Est.,Fornecedor,Status\\n';
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      const vals = Array.from(cells).map(c => '"' + (c.textContent?.trim().replace(/"/g,'""') || '') + '"');
      csv += vals.join(',') + '\\n';
    });
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'produtos_importados.csv'; a.click();
    URL.revokeObjectURL(url);
  }


  // ── Misc ──────────────────────────────────────────────────────────────────
  // Expose purchaseOrdersData for abrirModalPedidoCompra()
  window.purchaseOrdersData = purchaseOrdersData;
  window.quotationsData = quotationsData;
  // Auto close popups after 12s
  setTimeout(() => {
    ['pendingApprovalPopup','criticalQuotPopup'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
  }, 12000);

  // ── URL params: abrir modal de cotação pré-preenchido ─────────────────────
  (function() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'nova_cotacao') {
      const productCode = params.get('product_code') || '';
      const productName = params.get('product_name') || '';
      const supId = params.get('supplier_id') || '';
      const supName = params.get('supplier_name') || '';
      openModal('gerarCotacaoModal');
      if (productCode) {
        setTimeout(function() {
          const firstItemSel = document.querySelector('.cot-item select');
          if (firstItemSel) {
            firstItemSel.value = productCode;
          } else {
            addCotItem();
            setTimeout(function() {
              const sel = document.querySelector('.cot-item select');
              if (sel) sel.value = productCode;
            }, 50);
          }
        }, 100);
        if (productName) {
          showToastSup('\u2709\ufe0f Cota\u00e7\u00e3o para: ' + productName, 'info');
        }
      }
      if (supId) {
        // Selecionar o fornecedor no primeiro select de fornecedor da cotação
        setTimeout(function() {
          const firstSupSel = document.querySelector('#cotSupplierList .cot-sup select');
          if (firstSupSel) {
            firstSupSel.value = supId;
          } else {
            // Adicionar linha de fornecedor se não houver
            addCotSupplier();
            setTimeout(function() {
              const sel = document.querySelector('#cotSupplierList .cot-sup select');
              if (sel) sel.value = supId;
            }, 50);
          }
        }, 100);
      }
      if (supName && !productName) {
        showToastSup('\u2709\ufe0f Cota\u00e7\u00e3o para: ' + supName, 'info');
      }
      // Limpar params da URL sem recarregar
      history.replaceState({}, '', window.location.pathname);
    }
  })();
  </script>
  `

  return c.html(layout('Suprimentos', content, 'suprimentos', userInfo))
})

// ── Interface pública para fornecedor responder cotação ─────────────────────
app.get('/cotacao/:id/responder', (c) => {
  const quotId = c.req.param('id')
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const quotations = tenant.quotations || []
  const suppliers = tenant.suppliers || []
  const productSuppliers = tenant.productSuppliers || []
  const q = quotations.find((x: any) => x.id === quotId)

  if (!q) {
    return c.html(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;">
      <h2 style="color:#dc2626;">Cotação não encontrada</h2><p>O link pode ter expirado ou ser inválido.</p></body></html>`, 404)
  }

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
          <input type="text" id="paymentTerms" class="form-control" placeholder="Ex: 30 dias" value="${supplier?.paymentTerms||''}">
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

  function calcTotal(idx, qty) {
    const price = parseFloat(document.getElementById('unitPrice_' + idx).value) || 0;
    totals[idx] = price * qty;
    document.getElementById('total_' + idx).textContent = 'R$ ' + totals[idx].toLocaleString('pt-BR', {minimumFractionDigits:2});
    const grand = totals.reduce((a, b) => a + b, 0);
    document.getElementById('grandTotal').textContent = 'R$ ' + grand.toLocaleString('pt-BR', {minimumFractionDigits:2});
  }

  function submitQuotation() {
    const days = document.getElementById('deliveryDays').value;
    const allFilled = items.every((_, idx) => parseFloat(document.getElementById('unitPrice_' + idx).value) > 0);
    if (!allFilled) { alert('⚠ Preencha o preço de todos os itens!'); return; }
    if (!days) { alert('⚠ Informe o prazo de entrega!'); return; }
    const grand = totals.reduce((a, b) => a + b, 0);
    document.querySelector('.btn-success').disabled = true;
    document.querySelector('.btn-success').innerHTML = '<i class="fas fa-check"></i> Enviado!';
    document.querySelector('body > div').innerHTML += '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:100;">' +
      '<div style="background:white;border-radius:16px;padding:40px;text-align:center;max-width:400px;">' +
      '<i class="fas fa-check-circle" style="font-size:64px;color:#27AE60;margin-bottom:16px;"></i>' +
      '<h2 style="color:#1B4F72;margin-bottom:8px;">Cotação Enviada!</h2>' +
      '<p style="color:#6c757d;font-size:14px;">Sua cotação foi recebida.<br>Total: <strong>R$ ' + grand.toLocaleString('pt-BR',{minimumFractionDigits:2}) + '</strong><br>Prazo: <strong>' + days + ' dias</strong></p>' +
      '<p style="color:#6c757d;font-size:12px;margin-top:12px;">A equipe de compras será notificada e entrará em contato em caso de aprovação.</p>' +
      '</div></div>';
  }
</script>
</body>
</html>`)
})

// ── Rota pública: GET /suprimentos/quote-response?id=<quotId> ───────────────
app.get('/quote-response', async (c) => {
  const quotId = c.req.query('id')

  if (!quotId) {
    return c.html(`
      <div style="text-align:center;padding:40px;">
        <h2>Erro: Cotação não especificada</h2>
        <p><a href="/">Voltar</a></p>
      </div>
    `)
  }

  console.log('[COTAÇÃO-RESPOSTA] Abrindo formulário para:', quotId)

  // Search for the quotation across all tenants
  let quotCode = quotId
  let quotItems: any[] = []
  let quotDeadline = ''
  const allTenantEntries = Object.entries(tenants)
  for (const [, t] of allTenantEntries) {
    const q = (t.quotations || []).find((q: any) => q.id === quotId)
    if (q) {
      quotCode = q.code || quotId
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
        <div class="form-group">
          <label for="totalPrice">Preço Total (R$) <span class="required">*</span></label>
          <input type="number" id="totalPrice" name="totalPrice" placeholder="0.00" step="0.01" min="0" required>
        </div>
        <div class="form-group">
          <label for="deliveryDays">Prazo de Entrega (dias) <span class="required">*</span></label>
          <input type="number" id="deliveryDays" name="deliveryDays" placeholder="30" min="1" required>
        </div>
        <div class="form-group">
          <label for="paymentTerms">Condições de Pagamento</label>
          <input type="text" id="paymentTerms" name="paymentTerms" placeholder="Ex: 30 dias, À vista, etc">
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

    function showFeedback(message, type) {
      const el = document.getElementById('feedback')
      el.className = type
      el.textContent = message
      el.style.display = 'block'
    }

    document.getElementById('responseForm').addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = document.getElementById('submitBtn')
      btn.disabled = true
      btn.textContent = '⏳ Enviando...'
      const formData = {
        supplierName: document.getElementById('supplierName').value,
        totalPrice: parseFloat(document.getElementById('totalPrice').value),
        deliveryDays: parseInt(document.getElementById('deliveryDays').value),
        paymentTerms: document.getElementById('paymentTerms').value || '',
        notes: document.getElementById('notes').value || '',
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

      // Persist updated status to D1
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


// ── API: POST /suprimentos/api/quotation/create ──────────────────────────────
app.post('/api/quotation/create', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const empresaId = getCtxEmpresaId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.title) return err(c, 'Título obrigatório')
  const id = genId('cot')
  const quotation = {
    id, title: body.title, code: body.code || `COT-${Date.now().toString().slice(-6)}`,
    status: 'draft', suppliersCount: 0, itemsCount: 0,
    deadline: body.deadline || '', notes: body.notes || '',
    createdAt: new Date().toISOString(),
  }
  tenant.quotations.push(quotation)
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'quotations', {
      id, user_id: userId, empresa_id: empresaId, title: quotation.title, status: 'draft',
      deadline: quotation.deadline, notes: quotation.notes,
    })
  }
  return ok(c, { quotation })
})

app.delete('/api/quotation/:id', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const idx = tenant.quotations.findIndex((q: any) => q.id === id)
  if (idx === -1) return err(c, 'Cotação não encontrada', 404)
  tenant.quotations.splice(idx, 1)
  if (db && userId !== 'demo-tenant') await dbDelete(db, 'quotations', id, userId)
  return ok(c)
})

// Purchase Orders
app.post('/api/order/create', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const empresaId = getCtxEmpresaId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.supplierId) return err(c, 'Fornecedor obrigatório')
  const id = genId('oc')
  const order = {
    id, code: body.code || `OC-${Date.now().toString().slice(-6)}`,
    supplierId: body.supplierId, supplierName: body.supplierName || '',
    status: 'draft', totalValue: 0,
    expectedDate: body.expectedDate || '', notes: body.notes || '',
    createdAt: new Date().toISOString(),
  }
  tenant.purchaseOrders.push(order)
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'purchase_orders', {
      id, user_id: userId, empresa_id: empresaId, supplier_id: order.supplierId,
      status: 'draft', total_value: 0,
      expected_date: order.expectedDate, notes: order.notes,
    })
  }
  return ok(c, { order })
})

app.delete('/api/order/:id', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const idx = tenant.purchaseOrders.findIndex((o: any) => o.id === id)
  if (idx === -1) return err(c, 'Pedido não encontrado', 404)
  tenant.purchaseOrders.splice(idx, 1)
  if (db && userId !== 'demo-tenant') await dbDelete(db, 'purchase_orders', id, userId)
  return ok(c)
})

app.get('/api/list', (c) => {
  const tenant = getCtxTenant(c)
  return ok(c, { quotations: tenant.quotations, orders: tenant.purchaseOrders, imports: tenant.imports })
})

// ── API: POST /suprimentos/api/quotations/create (new format) ─────────────────
app.post('/api/quotations/create', async (c) => {
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
app.post('/api/quotations/:id/approve', async (c) => {
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
  // Auto-create purchase order
  const pcId = genId('pc')
  const pcCode = `PC-${new Date().getFullYear()}-${String(tenant.purchaseOrders.length + 1).padStart(3,'0')}`
  const pc = { id: pcId, code: pcCode, quotationId: id, supplierId: body.supplierName || '', supplierName: body.supplierName || 'Fornecedor', status: 'pending', totalValue: 0, currency: 'BRL', createdAt: now }
  tenant.purchaseOrders.push(pc)
  if (db && userId !== 'demo-tenant') {
    // UPDATE quotations in D1
    const updateOk = await dbUpdate(db, 'quotations', id, userId, { status: 'approved', approved_by: 'Admin', approved_at: now, updated_at: now })
    if (!updateOk) {
      console.error(`[APPROVE] Falha ao atualizar cotação ${id} em D1`)
      return err(c, 'Falha ao persistir aprovação no banco de dados', 500)
    }
    // INSERT audit trail
    await dbInsert(db, 'quotation_statuses', {
      id: genId('qst'), quotation_id: id, user_id: userId, empresa_id: empresaId || '1',
      previous_status: previousStatus, new_status: 'approved', changed_by: 'Admin', notes: `Cotação aprovada. PC: ${pcCode}`, created_at: now,
    })
    // INSERT purchase order
    await dbInsert(db, 'purchase_orders', { id: pcId, user_id: userId, empresa_id: empresaId, supplier_id: pc.supplierId, status: 'pending', total_value: 0, expected_date: '', notes: `Gerado da cotação ${tenant.quotations[idx].code || id}` })
  }
  return ok(c, { pcCode })
})

// ── API: POST /suprimentos/api/quotations/:id/reject ─────────────────────────
app.post('/api/quotations/:id/reject', async (c) => {
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
    // UPDATE quotations in D1
    const updateOk = await dbUpdate(db, 'quotations', id, userId, { status: 'rejected', notes: body.motivo || '', updated_at: now })
    if (!updateOk) {
      console.error(`[REJECT] Falha ao atualizar cotação ${id} em D1`)
      return err(c, 'Falha ao persistir negação no banco de dados', 500)
    }
    // INSERT audit trail
    await dbInsert(db, 'quotation_statuses', {
      id: genId('qst'), quotation_id: id, user_id: userId, empresa_id: empresaId || '1',
      previous_status: previousStatus, new_status: 'rejected', changed_by: 'Admin', notes: body.motivo || '', created_at: now,
    })
  }
  return ok(c)
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
    // UPDATE quotations in D1
    const updateOk = await dbUpdate(db, 'quotations', id, userId, { status: 'awaiting_negotiation', updated_at: now })
    if (!updateOk) {
      console.error(`[NEGOTIATE] Falha ao atualizar cotação ${id} em D1`)
      return err(c, 'Falha ao persistir negociação no banco de dados', 500)
    }
    // INSERT audit trail
    await dbInsert(db, 'quotation_statuses', {
      id: genId('qst'), quotation_id: id, user_id: userId, empresa_id: empresaId || '1',
      previous_status: previousStatus, new_status: 'awaiting_negotiation', changed_by: 'Admin',
      notes: body.observations.trim(), created_at: now,
    })
    // INSERT negotiation record
    await dbInsert(db, 'quotation_negotiations', {
      id: genId('qng'), quotation_id: id, user_id: userId, empresa_id: empresaId || '1',
      observations: body.observations.trim(), created_by: 'Admin', created_at: now,
    })
  }
  return ok(c, { status: 'awaiting_negotiation' })
})

// ── API: POST /suprimentos/api/purchase-orders/create ────────────────────────
app.post('/api/purchase-orders/create', async (c) => {
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
app.post('/api/purchase-orders/:id/approve', async (c) => {
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
app.post('/api/purchase-orders/:id/reject', async (c) => {
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
app.post('/api/imports/create', async (c) => {
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

// ── Salvar campo editado inline na tabela de Produtos Importados ──────────
app.post('/api/product-imp-field', async (c) => {
  const tenant = getCtxTenant(c)
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.code || !body.field) return err(c, 'code e field obrigatórios')
  const { code, field, value } = body
  // Campos permitidos para edição inline
  const allowedFields = ['descPT', 'descEN', 'ncm']
  if (!allowedFields.includes(field)) return err(c, 'Campo não permitido')
  // Atualizar em stockItems ou products do tenant
  const allItems: any[] = [...(tenant.stockItems || []), ...(tenant.products || [])]
  const item = allItems.find((i: any) => i.code === code)
  if (item) {
    item[field] = value
  } else {
    // Criar entrada no mapa de descrições importadas se não existir
    if (!tenant.impProdDesc) (tenant as any).impProdDesc = {}
    if (!tenant.impProdDesc[code]) tenant.impProdDesc[code] = {}
    tenant.impProdDesc[code][field] = value
  }
  // Persistir no DB se disponível
  if (db && userId !== 'demo-tenant') {
    try {
      await db.prepare(
        `UPDATE products SET ${field} = ? WHERE user_id = ? AND code = ?`
      ).bind(value, userId, code).run()
    } catch(_) { /* tabela pode não ter coluna ainda */ }
    // Salvar em tabela auxiliar de descrições de importação
    try {
      await db.prepare(
        `INSERT INTO imp_prod_desc (user_id, code, field, value, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, code, field) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
      ).bind(userId, code, field, value).run()
    } catch(_) { /* ignora se tabela não existir */ }
  }
  return ok(c, { code, field, value })
})

export default app
