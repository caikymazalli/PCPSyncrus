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
                  <td>${pc.items.map((it: any) => `<div style="font-size:12px;"><span style="font-family:monospace;font-size:10px;background:#e8f4fd;padding:1px 4px;border-radius:3px;color:#1B4F72;">${it.productCode}</span> ${it.productName}</div>`).join('')}</td>
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
                <div style="font-size:13px;color:#374151;font-weight:600;">${imp.invoiceValueEUR > 0 ? '€ '+imp.invoiceValueEUR.toLocaleString('pt-BR',{minimumFractionDigits:2}) : 'US$ '+imp.invoiceValueUSD.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
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
                      // Preço unit referência a partir do pedido de compra
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
                            ${item.descPT || '<span style="font-style:italic;font-size:11px;">— clique para preencher —</span>'}
                          </div>
                          <input class="form-control imp-inline-input" style="display:none;font-size:12px;" data-field="descPT" data-code="${item.code}" value="${item.descPT||''}" onblur="saveInlineEdit(this)" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')cancelInlineEdit(this)" placeholder="Descrição em português...">
                        </td>
                        <td style="padding:6px 10px;min-width:160px;" ondblclick="startInlineEdit(this,'impDescEN','${item.code}','descEN')">
                          <div class="imp-inline-view" style="font-size:12px;color:${item.descEN||autoDescEN?'#374151':'#dc2626'};cursor:pointer;min-height:24px;padding:3px 6px;border-radius:4px;border:1px solid transparent;font-style:italic;" title="Duplo clique para editar" onmouseenter="this.style.borderColor='#bee3f8'" onmouseleave="this.style.borderColor='transparent'">
                            ${item.descEN || autoDescEN || '<span style="font-style:italic;font-size:11px;">— clique para preencher —</span>'}
                          </div>
                          <input class="form-control imp-inline-input" style="display:none;font-size:12px;" data-field="descEN" data-code="${item.code}" value="${item.descEN||autoDescEN||''}" onblur="saveInlineEdit(this)" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')cancelInlineEdit(this)" placeholder="Description in English...">
                        </td>
                        <td style="padding:6px 10px;min-width:100px;" ondblclick="startInlineEdit(this,'impNCM','${item.code}','ncm')">
                          <div class="imp-inline-view" style="font-size:12px;font-weight:700;color:${ncm!=='—'?'#7c3aed':'#dc2626'};cursor:pointer;min-height:24px;padding:3px 6px;border-radius:4px;border:1px solid transparent;font-family:monospace;" title="Duplo clique para editar" onmouseenter="this.style.borderColor='#ddd6fe'" onmouseleave="this.style.borderColor='transparent'">
                            ${ncm !== '—' ? ncm : '<span style="font-style:italic;font-size:11px;font-family:sans-serif;">— preencher —</span>'}
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
              <div style="font-size:12px;color:#
