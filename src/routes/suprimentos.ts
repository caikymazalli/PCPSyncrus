import { Hono } from 'hono'
import { layout } from '../layout'
import { mockData } from '../data'

const app = new Hono()

// ── Rota principal do módulo Suprimentos ──────────────────────────────────────
app.get('/', (c) => {
  const { quotations, purchaseOrders, suppliers, stockItems, products, imports } = mockData as any

  const statusInfo: Record<string, { label: string, color: string, bg: string }> = {
    sent:               { label: 'Enviada',            color: '#3498DB', bg: '#d1ecf1' },
    awaiting_responses: { label: 'Aguard. Respostas',  color: '#d97706', bg: '#fffbeb' },
    pending_approval:   { label: 'Pend. Aprovação',    color: '#dc2626', bg: '#fef2f2' },
    approved:           { label: 'Aprovada',           color: '#16a34a', bg: '#f0fdf4' },
    cancelled:          { label: 'Cancelada',          color: '#6c757d', bg: '#e2e3e5' },
  }

  const pcStatusInfo: Record<string, { label: string, badge: string }> = {
    pending:    { label: 'Pendente',     badge: 'badge-warning' },
    confirmed:  { label: 'Confirmado',   badge: 'badge-info' },
    in_transit: { label: 'Em Trânsito',  badge: 'badge-primary' },
    delivered:  { label: 'Entregue',     badge: 'badge-success' },
    cancelled:  { label: 'Cancelado',    badge: 'badge-secondary' },
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

  const content = `
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
      <button class="btn btn-primary" onclick="openModal('novoPCModal')">
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
                      <button class="btn btn-secondary btn-sm" onclick="reenviarCotacao('${q.code}')" title="Reenviar"><i class="fas fa-redo"></i></button>` : ''}
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
                  <td style="font-size:12px;color:#6c757d;">${new Date(pc.expectedDelivery+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                  <td><span class="badge ${si.badge}">${si.label}</span></td>
                  <td>
                    <div style="display:flex;gap:4px;">
                      <button class="btn btn-secondary btn-sm" onclick="alert('Detalhes: ${pc.code}\\nFornecedor: ${pc.supplierName}\\nValor: ${pc.currency} ${pc.totalValue.toLocaleString('pt-BR',{minimumFractionDigits:2})}\\nEntrega: ${new Date(pc.expectedDelivery+'T12:00:00').toLocaleDateString('pt-BR')}')" title="Ver detalhes"><i class="fas fa-eye"></i></button>
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
          <label class="form-label">Validade da Cotação (dias)</label>
          <input class="form-control" type="number" id="cotValidade" value="7" min="1" max="90">
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
      <div style="padding:24px;max-height:70vh;overflow-y:auto;" id="quotDetailBody"></div>
      <div style="padding:14px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;" id="quotDetailActions">
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

  <!-- Modal: Nova Importação -->
  <div class="modal-overlay" id="novaImportacaoModal">
    <div class="modal" style="max-width:700px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-ship" style="margin-right:8px;"></i>Nova Importação</h3>
        <button onclick="closeModal('novaImportacaoModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;max-height:75vh;overflow-y:auto;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Fornecedor *</label>
            <select class="form-control">
              <option value="">Selecionar fornecedor importado...</option>
              ${suppliers.filter((s: any) => s.type === 'importado').map((s: any) => `<option value="${s.id}">${s.name} (${s.country})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Nº Invoice *</label>
            <input class="form-control" type="text" placeholder="Ex: INV-2024-002">
          </div>
          <div class="form-group">
            <label class="form-label">Data Invoice</label>
            <input class="form-control" type="date">
          </div>
          <div class="form-group">
            <label class="form-label">NCM *</label>
            <input class="form-control" type="text" placeholder="Ex: 7604.10.00">
          </div>
          <div class="form-group">
            <label class="form-label">Incoterm</label>
            <select class="form-control">
              <option value="CIF">CIF — Cost, Insurance & Freight</option>
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
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" id="impValorLabel">Valor Invoice (EUR) *</label>
            <input class="form-control" type="number" id="impValor" placeholder="0.00" min="0" step="0.01" oninput="calcImpBRL()">
          </div>
          <div class="form-group">
            <label class="form-label">Taxa de Câmbio (R$)</label>
            <input class="form-control" type="number" id="impCambio" value="5.52" min="0" step="0.01" oninput="calcImpBRL()">
          </div>
          <div class="form-group">
            <label class="form-label">Valor em BRL (automático)</label>
            <input class="form-control" type="text" id="impBRL" placeholder="R$ 0,00" readonly style="background:#f8f9fa;">
          </div>
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Descrição da Mercadoria *</label>
            <input class="form-control" type="text" placeholder="Ex: Chapas de Alumínio Liga 6061 espessura 3mm">
          </div>
          <div class="form-group">
            <label class="form-label">Peso Líquido (kg)</label>
            <input class="form-control" type="number" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">Peso Bruto (kg)</label>
            <input class="form-control" type="number" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">Porto de Origem</label>
            <input class="form-control" type="text" placeholder="Ex: Hamburg, Rotterdam">
          </div>
          <div class="form-group">
            <label class="form-label">Porto de Destino</label>
            <input class="form-control" type="text" value="Santos" placeholder="Santos, Itajaí...">
          </div>
        </div>

        <div style="background:#e8f4fd;border-radius:8px;padding:14px;margin-top:8px;">
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

        <div style="background:#f5f3ff;border-radius:8px;padding:14px;margin-top:12px;">
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
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaImportacaoModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarImportacao()" class="btn btn-primary"><i class="fas fa-save"></i> Criar Processo</button>
      </div>
    </div>
  </div>

  <!-- Modal: Novo Pedido de Compra -->
  <div class="modal-overlay" id="novoPCModal">
    <div class="modal" style="max-width:560px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-shopping-cart" style="margin-right:8px;"></i>Novo Pedido de Compra</h3>
        <button onclick="closeModal('novoPCModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Fornecedor *</label>
            <select class="form-control">
              <option value="">Selecionar fornecedor...</option>
              ${suppliers.map((s: any) => `<option value="${s.id}">${s.name} (${s.type})</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Cotação de Referência</label>
            <select class="form-control">
              <option value="">Nenhuma (compra direta)</option>
              ${quotations.filter((q: any) => q.status==='approved').map((q: any) => `<option value="${q.id}">${q.code}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Data Entrega Prevista *</label><input class="form-control" type="date"></div>
          <div class="form-group"><label class="form-label">Moeda</label>
            <select class="form-control"><option value="BRL">BRL — Real</option><option value="USD">USD — Dólar</option><option value="EUR">EUR — Euro</option></select>
          </div>
          <div class="form-group"><label class="form-label">É Importação?</label>
            <select class="form-control"><option value="0">Não</option><option value="1">Sim — criar processo de importação</option></select>
          </div>
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Observações</label><textarea class="form-control" rows="2" placeholder="NF, condições especiais..."></textarea></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novoPCModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('✅ Pedido de Compra PC-2024-003 gerado!\\n📧 E-mail enviado ao fornecedor com os detalhes do pedido.');closeModal('novoPCModal')" class="btn btn-primary"><i class="fas fa-save"></i> Criar Pedido</button>
      </div>
    </div>
  </div>

  <script>
  const quotationsData = ${JSON.stringify(quotations)};
  const statusInfoData = ${JSON.stringify(statusInfo)};
  const suppliersData = ${JSON.stringify(suppliers)};
  const importsData2 = ${JSON.stringify(importsData)};
  const allItemsData = ${JSON.stringify([...stockItems, ...products])};

  // ── Cotações ──────────────────────────────────────────────────────────────
  function approveQuotation(id, code, supplierName) {
    if (!confirm('Aprovar cotação ' + code + '?\\n\\nApós aprovação:\\n• E-mail de confirmação será enviado a: ' + supplierName + '\\n• Pedido de Compra gerado automaticamente.')) return;
    // Simular envio de email
    setTimeout(() => {
      alert('✅ Cotação ' + code + ' APROVADA!\\n\\n📧 E-mail enviado para: ' + supplierName + '\\n   Assunto: Aprovação de Cotação — ' + code + '\\n\\n📋 Pedido de Compra PC-' + (2024) + '-' + (Math.floor(Math.random()*100)+10) + ' gerado automaticamente.\\n\\nO fornecedor foi notificado sobre a aprovação.');
    }, 300);
  }

  function recusarCotacao(id, code) {
    const motivo = prompt('Motivo da recusa da cotação ' + code + ':');
    if (motivo) alert('❌ Cotação ' + code + ' recusada.\\nMotivo: ' + motivo + '\\n\\nO fornecedor será notificado por e-mail.');
  }

  function reenviarCotacao(code) {
    alert('📧 Cotação ' + code + ' reenviada!\\n\\nLink enviado novamente para todos os fornecedores vinculados.\\nPrazo para resposta: 7 dias.');
  }

  function dispararCotacao(supId, supName, supEmail) {
    if (!confirm('Disparar cotação individual para ' + supName + '?\\n\\nE-mail será enviado para: ' + supEmail)) return;
    alert('📧 Cotação disparada para ' + supName + '!\\n\\nLink de resposta enviado para: ' + supEmail + '\\n\\nVocê será notificado quando a cotação for respondida.');
  }

  function gerarCotacoesCriticos() {
    alert('✅ Cotações geradas para todos os itens críticos!\\n\\n📧 E-mails enviados separadamente por fornecedor.\\n\\nFornecedores notificados:\\n• Aços Nacionais — 2 itens\\n• FastFix Co. — 1 item\\n\\nAcompanhe as respostas na aba Cotações.');
  }

  function salvarCotacao() {
    const tipo = document.getElementById('cotTipo').value;
    const newCode = 'COT-2024-00' + (quotationsData.length + 1);
    if (tipo === 'critico') {
      alert('✅ ' + newCode + ' gerada (automático — itens críticos)!\\n\\n📧 E-mails disparados separadamente para cada fornecedor vinculado.\\n\\nVocê será notificado quando as respostas chegarem.');
    } else {
      alert('✅ ' + newCode + ' gerada!\\n\\n📧 E-mails disparados para os fornecedores selecionados.\\n\\nVocê será notificado quando as respostas chegarem.');
    }
    closeModal('gerarCotacaoModal');
  }

  function onCotTipoChange() {
    const v = document.getElementById('cotTipo').value;
    document.getElementById('cotItensSection').style.opacity = v === 'critico' ? '0.5' : '1';
    document.getElementById('cotItensSection').style.pointerEvents = v === 'critico' ? 'none' : '';
  }

  function copySupplierLink(quotId) {
    const link = window.location.origin + '/suprimentos/cotacao/' + quotId + '/responder';
    navigator.clipboard?.writeText(link).then(() => {
      alert('🔗 Link copiado!\\n\\n' + link + '\\n\\nEnvie este link ao fornecedor para que ele preencha os valores.');
    }).catch(() => alert('Link da cotação:\\n' + link));
  }

  function addCotItem() {
    const list = document.getElementById('cotItensList');
    const div = document.createElement('div');
    div.className = 'cot-item';
    div.style.cssText = 'display:grid;grid-template-columns:2fr 80px 60px auto;gap:8px;margin-bottom:8px;align-items:center;';
    div.innerHTML = '<select class="form-control" style="font-size:12px;"><option value="">Selecionar item...</option>' +
      allItemsData.map(i => '<option value="'+i.code+'">'+i.name+' ('+i.code+')</option>').join('') + '</select>' +
      '<input class="form-control" type="number" placeholder="Qtd" min="1">' +
      '<input class="form-control" type="text" placeholder="Un" value="un">' +
      '<button class="btn btn-danger btn-sm" onclick="this.closest(\\'.cot-item\\').remove()"><i class="fas fa-trash"></i></button>';
    list.appendChild(div);
  }

  function addCotSupplier() {
    const list = document.getElementById('cotSupplierList');
    const div = document.createElement('div');
    div.className = 'cot-sup';
    div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';
    div.innerHTML = '<select class="form-control" style="font-size:12px;flex:1;"><option value="">Selecionar fornecedor...</option>' +
      suppliersData.map(s => '<option value="'+s.id+'">'+s.name+' ('+s.type+') — Prazo: '+s.deliveryLeadDays+'d</option>').join('') + '</select>' +
      '<button class="btn btn-danger btn-sm" onclick="this.closest(\\'.cot-sup\\').remove()"><i class="fas fa-trash"></i></button>';
    list.appendChild(div);
  }

  function openQuotationDetail(id) {
    const q = quotationsData.find(x => x.id === id);
    if (!q) return;
    const si = statusInfoData[q.status] || statusInfoData.sent;
    document.getElementById('quotDetailTitle').innerHTML = '<i class="fas fa-file-invoice-dollar" style="margin-right:8px;"></i>' + q.code;
    let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">' +
      detRow('Código', q.code) + detRow('Status', '<span class="badge" style="background:'+si.bg+';color:'+si.color+';">'+si.label+'</span>') +
      detRow('Criado por', q.createdBy) + detRow('Data', new Date(q.createdAt+'T12:00:00').toLocaleDateString('pt-BR')) +
      (q.approvedBy ? detRow('Aprovado por', q.approvedBy) + detRow('Aprovação', new Date((q.approvedAt||'')+'T12:00:00').toLocaleDateString('pt-BR')) : '') +
      '</div>';
    html += '<div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:8px;">Itens Solicitados</div>';
    html += '<div class="table-wrapper" style="margin-bottom:16px;"><table><thead><tr><th>Produto</th><th>Qtd</th><th>Unidade</th></tr></thead><tbody>';
    for (const it of q.items) html += '<tr><td>'+it.productName+'</td><td><strong>'+it.quantity+'</strong></td><td>'+it.unit+'</td></tr>';
    html += '</tbody></table></div>';
    if (q.supplierResponses.length > 0) {
      const best = q.supplierResponses.reduce((b, r) => (!b || r.totalPrice < b.totalPrice) ? r : b, null);
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
          '<div><div style="font-size:10px;color:#9ca3af;">PREÇO UNIT.</div><div style="font-size:14px;font-weight:800;color:#27AE60;">R$ '+r.unitPrice.toFixed(2)+'</div></div>' +
          '<div><div style="font-size:10px;color:#9ca3af;">TOTAL</div><div style="font-size:14px;font-weight:800;color:#1B4F72;">R$ '+r.totalPrice.toLocaleString('pt-BR',{minimumFractionDigits:2})+'</div></div>' +
          '<div><div style="font-size:10px;color:#9ca3af;">PRAZO</div><div style="font-size:14px;font-weight:800;color:#2980B9;">'+r.deliveryDays+'d</div></div>' +
          '</div>' + (r.notes ? '<div style="font-size:12px;color:#6c757d;margin-top:6px;">'+r.notes+'</div>' : '') +
          '</div>';
      }
      html += '</div>';
    } else {
      html += '<div style="background:#fffbeb;border-radius:8px;padding:16px;text-align:center;"><i class="fas fa-clock" style="font-size:24px;color:#F39C12;margin-bottom:6px;"></i><div style="font-size:13px;color:#d97706;">Aguardando resposta dos fornecedores...</div></div>';
    }
    document.getElementById('quotDetailBody').innerHTML = html;
    // Botão aprovar se pendente
    const actDiv = document.getElementById('quotDetailActions');
    actDiv.innerHTML = '<button onclick="closeModal(&quot;quotationDetailModal&quot;)" class="btn btn-secondary">Fechar</button>';
    if (q.status === 'pending_approval') {
      const supName = (q.supplierResponses[0]?.supplierName||'fornecedor').replace(/'/g,"'");
      actDiv.innerHTML = '<button onclick="approveQuotationFromDetail()" class="btn btn-success"><i class="fas fa-check"></i> Aprovar Cotação</button>' + actDiv.innerHTML;
      window._pendingApprovalId = q.id;
      window._pendingApprovalCode = q.code;
      window._pendingApprovalSup = supName;
    }
    openModal('quotationDetailModal');
  }

  function detRow(label, value) {
    return '<div style="background:#f8f9fa;border-radius:8px;padding:10px 12px;">' +
      '<div style="font-size:10px;color:#9ca3af;font-weight:600;">'+label.toUpperCase()+'</div>' +
      '<div style="font-size:13px;color:#374151;margin-top:3px;">'+value+'</div></div>';
  }

  function approveQuotationFromDetail() {
    approveQuotation(window._pendingApprovalId, window._pendingApprovalCode, window._pendingApprovalSup);
    closeModal('quotationDetailModal');
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
    const m = document.getElementById('impMoeda').value;
    document.getElementById('impValorLabel').textContent = 'Valor Invoice (' + m + ') *';
    calcImpBRL();
  }

  function calcImpBRL() {
    const val = parseFloat(document.getElementById('impValor').value) || 0;
    const fx = parseFloat(document.getElementById('impCambio').value) || 0;
    const brl = val * fx;
    document.getElementById('impBRL').value = 'R$ ' + brl.toLocaleString('pt-BR', {minimumFractionDigits:2});
    calcImpostos();
  }

  function calcImpostos() {
    const brl = parseFloat((document.getElementById('impBRL').value||'').replace('R$ ','').replace('.','').replace(',','.')) || 0;
    const ii = parseFloat(document.getElementById('taxII').value) || 0;
    const ipi = parseFloat(document.getElementById('taxIPI').value) || 0;
    const pis = parseFloat(document.getElementById('taxPIS').value) || 0;
    const cofins = parseFloat(document.getElementById('taxCOFINS').value) || 0;
    const icms = parseFloat(document.getElementById('taxICMS').value) || 0;
    const afrmm = parseFloat(document.getElementById('taxAFRMM').value) || 0;
    const siscomex = parseFloat(document.getElementById('taxSISCOMEX').value) || 0;
    const baseII = brl;
    const valII = baseII * ii / 100;
    const valIPI = (baseII + valII) * ipi / 100;
    const valPIS = brl * pis / 100;
    const valCOFINS = brl * cofins / 100;
    const valICMS = (brl + valII + valIPI) / (1 - icms/100) * (icms/100);
    const total = valII + valIPI + valPIS + valCOFINS + valICMS + afrmm + siscomex;
    document.getElementById('taxTotal').value = 'R$ ' + total.toLocaleString('pt-BR', {minimumFractionDigits:2});
    calcNumerario(total);
  }

  function calcNumerario(impostos) {
    const brlStr = (document.getElementById('impBRL').value||'').replace('R$ ','').replace(/\./g,'').replace(',','.');
    const brl = parseFloat(brlStr) || 0;
    const taxTotal = impostos !== undefined ? impostos : parseFloat((document.getElementById('taxTotal').value||'').replace('R$ ','').replace(/\./g,'').replace(',','.')) || 0;
    const frete = parseFloat(document.getElementById('numFrete').value) || 0;
    const seguro = parseFloat(document.getElementById('numSeguro').value) || 0;
    const desp = parseFloat(document.getElementById('numDesp').value) || 0;
    const porto = parseFloat(document.getElementById('numPorto').value) || 0;
    const arm = parseFloat(document.getElementById('numArm').value) || 0;
    const total = brl + taxTotal + frete + seguro + desp + porto + arm;
    document.getElementById('numTotal').value = 'R$ ' + total.toLocaleString('pt-BR', {minimumFractionDigits:2});
  }

  function salvarImportacao() {
    alert('✅ Processo de importação criado com sucesso!\\n\\nCódigo: IMP-2024-002\\nStatus inicial: Aguardando Embarque\\n\\nVocê pode acompanhar o processo na aba Importação.');
    closeModal('novaImportacaoModal');
  }

  function printNumerario() {
    window.print();
  }

  // ── Misc ──────────────────────────────────────────────────────────────────
  // Auto close popups after 12s
  setTimeout(() => {
    ['pendingApprovalPopup','criticalQuotPopup'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
  }, 12000);
  </script>
  `

  return c.html(layout('Suprimentos', content, 'suprimentos'))
})

// ── Interface pública para fornecedor responder cotação ─────────────────────
app.get('/cotacao/:id/responder', (c) => {
  const quotId = c.req.param('id')
  const { quotations, suppliers, productSuppliers } = mockData as any
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
        <div style="font-size:16px;font-weight:700;color:#1B4F72;">Empresa Alpha — PCP Planner</div>
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

export default app
