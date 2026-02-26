import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxUserId } from '../sessionHelper'
import { genId, dbInsert, dbUpdate, dbDelete, ok, err } from '../dbHelpers'

const app = new Hono()

// Produtos page
app.get('/', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const mockData = tenant  // per-session data
  const products = (mockData as any).products || []
  const bomItems = (mockData as any).bomItems || []
  const suppliers = (mockData as any).suppliers || []
  const productSuppliers = (mockData as any).productSuppliers || []

  // Count stock status
  const criticalCount = products.filter(p => p.stockStatus === 'critical').length
  const normalCount = products.filter(p => p.stockStatus === 'normal').length
  const purchaseCount = products.filter(p => p.stockStatus === 'purchase_needed').length
  const manufactureCount = products.filter(p => p.stockStatus === 'manufacture_needed').length

  const stockStatusInfo: Record<string, { label: string, color: string, bg: string, icon: string }> = {
    critical:          { label: 'Crítico',              color: '#dc2626', bg: '#fef2f2', icon: 'fa-exclamation-circle' },
    normal:            { label: 'Normal',               color: '#16a34a', bg: '#f0fdf4', icon: 'fa-check-circle' },
    purchase_needed:   { label: 'Nec. Compra',          color: '#d97706', bg: '#fffbeb', icon: 'fa-shopping-cart' },
    manufacture_needed:{ label: 'Nec. Manufatura',      color: '#7c3aed', bg: '#f5f3ff', icon: 'fa-industry' },
  }

  function buildProdRow(p: any, stockStatusInfo: Record<string, any>): string {
    const si = stockStatusInfo[p.stockStatus] || stockStatusInfo.normal
    const stockPct = p.stockMin > 0 ? Math.min(100, Math.round((p.stockCurrent / p.stockMin) * 100)) : 100
    const _ct = p.controlType === 'serie'
    const serialBadge = p.serialControlled
      ? '<span style="background:' + (_ct ? '#ede9fe' : '#fef3c7') + ';color:' + (_ct ? '#7c3aed' : '#d97706') + ';font-size:9px;padding:1px 5px;border-radius:8px;margin-left:4px;">' + (_ct ? 'Série' : 'Lote') + '</span>'
      : ''
    const descView = p.description
      ? '<span style="font-size:12px;color:#6c757d;">' + p.description + '</span>'
      : '<span style="font-style:italic;color:#ccc;">—</span>'
    const nameEsc = (p.name || '').replace(/"/g, '&quot;')
    const descEsc = (p.description || '').replace(/"/g, '&quot;')
    const codeEsc = (p.code || '').replace(/"/g, '&quot;')
    const unitOptions = ['un','kg','m','l','pc','m2','lt'].map(u =>
      '<option value="' + u + '"' + (p.unit === u ? ' selected' : '') + '>' + (u === 'm2' ? 'm²' : u) + '</option>'
    ).join('')
    return '<tr class="prod-row" data-id="' + p.id + '" data-status="' + p.stockStatus + '"' +
      ' data-search="' + (p.name || '').toLowerCase() + ' ' + (p.code || '').toLowerCase() + '"' +
      ' style="border-bottom:1px solid #f1f3f5;"' +
      ' onmouseenter="this.style.background=\'#f0f9ff\'" onmouseleave="this.style.background=\'white\'">' +
      '<td style="padding:8px 12px;" ondblclick="startProdEdit(this,\'code\',\'' + p.id + '\')">' +
        '<div class="prod-cell-view" style="font-family:monospace;font-size:11px;background:#e8f4fd;padding:3px 8px;border-radius:4px;color:#1B4F72;font-weight:700;display:inline-block;cursor:pointer;" title="Duplo clique para editar">' + codeEsc + '</div>' +
        '<input class="form-control prod-cell-input" style="display:none;font-size:11px;font-family:monospace;width:90px;" data-field="code" data-id="' + p.id + '" value="' + codeEsc + '" onblur="saveProdCell(this)" onkeydown="if(event.key===\'Enter\')this.blur();if(event.key===\'Escape\')cancelProdEdit(this)">' +
      '</td>' +
      '<td style="padding:8px 12px;" ondblclick="startProdEdit(this,\'name\',\'' + p.id + '\')">' +
        '<div class="prod-cell-view" style="font-weight:600;color:#1B4F72;cursor:pointer;" title="Duplo clique para editar">' + (p.name || '') + serialBadge + '</div>' +
        '<input class="form-control prod-cell-input" style="display:none;font-size:13px;min-width:150px;" data-field="name" data-id="' + p.id + '" value="' + nameEsc + '" onblur="saveProdCell(this)" onkeydown="if(event.key===\'Enter\')this.blur();if(event.key===\'Escape\')cancelProdEdit(this)">' +
      '</td>' +
      '<td style="padding:8px 12px;text-align:center;" ondblclick="startProdEdit(this,\'unit\',\'' + p.id + '\')">' +
        '<div class="prod-cell-view" style="background:#f1f5f9;padding:2px 8px;border-radius:12px;font-size:11px;display:inline-block;cursor:pointer;" title="Duplo clique para editar">' + (p.unit || 'un') + '</div>' +
        '<select class="form-control prod-cell-input" style="display:none;font-size:12px;width:65px;" data-field="unit" data-id="' + p.id + '" onblur="saveProdCell(this)" onchange="saveProdCell(this)">' + unitOptions + '</select>' +
      '</td>' +
      '<td style="padding:8px 12px;text-align:center;" ondblclick="startProdEdit(this,\'stockMin\',\'' + p.id + '\')">' +
        '<div class="prod-cell-view" style="color:#6c757d;font-size:13px;cursor:pointer;" title="Duplo clique para editar">' + (p.stockMin || 0) + '</div>' +
        '<input class="form-control prod-cell-input" style="display:none;font-size:12px;width:65px;text-align:center;" type="number" min="0" data-field="stockMin" data-id="' + p.id + '" value="' + (p.stockMin || 0) + '" onblur="saveProdCell(this)" onkeydown="if(event.key===\'Enter\')this.blur();if(event.key===\'Escape\')cancelProdEdit(this)">' +
      '</td>' +
      '<td style="padding:8px 12px;text-align:center;" ondblclick="startProdEdit(this,\'stockCurrent\',\'' + p.id + '\')">' +
        '<div class="prod-cell-view" style="cursor:pointer;" title="Duplo clique para editar">' +
          '<span style="font-size:14px;font-weight:800;color:' + si.color + ';">' + (p.stockCurrent || 0) + '</span>' +
          '<div style="width:40px;height:3px;background:#e9ecef;border-radius:2px;margin:3px auto 0;"><div style="width:' + stockPct + '%;height:100%;background:' + si.color + ';border-radius:2px;"></div></div>' +
        '</div>' +
        '<input class="form-control prod-cell-input" style="display:none;font-size:12px;width:65px;text-align:center;" type="number" min="0" data-field="stockCurrent" data-id="' + p.id + '" value="' + (p.stockCurrent || 0) + '" onblur="saveProdCell(this)" onkeydown="if(event.key===\'Enter\')this.blur();if(event.key===\'Escape\')cancelProdEdit(this)">' +
      '</td>' +
      '<td style="padding:8px 12px;white-space:nowrap;">' +
        '<span class="prod-status-badge" data-id="' + p.id + '" style="background:' + si.bg + ';color:' + si.color + ';padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700;display:inline-flex;align-items:center;gap:4px;">' +
          '<i class="fas ' + si.icon + '" style="font-size:9px;"></i>' + si.label +
        '</span>' +
      '</td>' +
      '<td style="padding:8px 12px;max-width:180px;" ondblclick="startProdEdit(this,\'description\',\'' + p.id + '\')">' +
        '<div class="prod-cell-view" style="font-size:12px;color:#6c757d;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="Duplo clique para editar">' + descView + '</div>' +
        '<input class="form-control prod-cell-input" style="display:none;font-size:12px;min-width:120px;" data-field="description" data-id="' + p.id + '" value="' + descEsc + '" onblur="saveProdCell(this)" onkeydown="if(event.key===\'Enter\')this.blur();if(event.key===\'Escape\')cancelProdEdit(this)" placeholder="Descrição...">' +
      '</td>' +
      '<td style="padding:8px 12px;text-align:center;white-space:nowrap;">' +
        '<a href="/engenharia" class="btn btn-secondary btn-sm" style="padding:4px 7px;" title="Ver BOM"><i class="fas fa-list-ul"></i></a>' +
        '<button class="btn btn-danger btn-sm" style="padding:4px 7px;margin-left:2px;" onclick="deleteProduto(\'' + p.id + '\')" title="Excluir"><i class="fas fa-trash"></i></button>' +
      '</td>' +
    '</tr>'
  }

  const content = `
  <!-- Critical Stock Popup Alert -->
  ${criticalCount > 0 ? `
  <div id="criticalStockPopup" style="position:fixed;top:80px;right:20px;z-index:500;width:320px;background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.18);border-top:4px solid #dc2626;animation:slideIn 0.3s ease;">
    <div style="padding:16px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:32px;height:32px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-exclamation-triangle" style="color:#dc2626;font-size:14px;"></i>
        </div>
        <div>
          <div style="font-size:13px;font-weight:700;color:#dc2626;">Estoque Crítico!</div>
          <div style="font-size:11px;color:#6c757d;">${criticalCount} produto(s) abaixo do mínimo</div>
        </div>
      </div>
      <button onclick="document.getElementById('criticalStockPopup').style.display='none'" style="background:none;border:none;font-size:18px;cursor:pointer;color:#9ca3af;">×</button>
    </div>
    <div style="padding:12px 16px;">
      ${products.filter(p => p.stockStatus === 'critical').map(p => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f8f9fa;">
        <div>
          <div style="font-size:12px;font-weight:600;color:#374151;">${p.name}</div>
          <div style="font-size:11px;color:#dc2626;">Atual: ${p.stockCurrent} • Mín: ${p.stockMin}</div>
        </div>
        <span class="badge" style="background:#fef2f2;color:#dc2626;">Crítico</span>
      </div>`).join('')}
    </div>
    <div style="padding:12px 16px;text-align:center;">
      <button class="btn btn-danger btn-sm" style="width:100%;" onclick="document.getElementById('criticalStockPopup').style.display='none';scrollToSection('stockStatus')">
        <i class="fas fa-eye"></i> Ver todos os críticos
      </button>
    </div>
  </div>
  <style>@keyframes slideIn{from{opacity:0;transform:translateX(40px);}to{opacity:1;transform:translateX(0);}}</style>` : ''}

  <!-- Header -->
  <div class="section-header">
    <div>
      <div style="font-size:14px;color:#6c757d;">${products.length} produtos cadastrados</div>
      <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
        ${criticalCount > 0 ? `<span class="badge" style="background:#fef2f2;color:#dc2626;"><i class="fas fa-exclamation-circle" style="font-size:9px;"></i> ${criticalCount} Crítico</span>` : ''}
        ${normalCount > 0 ? `<span class="badge" style="background:#f0fdf4;color:#16a34a;"><i class="fas fa-check-circle" style="font-size:9px;"></i> ${normalCount} Normal</span>` : ''}
        ${purchaseCount > 0 ? `<span class="badge" style="background:#fffbeb;color:#d97706;"><i class="fas fa-shopping-cart" style="font-size:9px;"></i> ${purchaseCount} Nec. Compra</span>` : ''}
        ${manufactureCount > 0 ? `<span class="badge" style="background:#f5f3ff;color:#7c3aed;"><i class="fas fa-industry" style="font-size:9px;"></i> ${manufactureCount} Nec. Manufatura</span>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-secondary" onclick="openModal('configLimitesModal')" title="Configurar limites de estoque por status">
        <i class="fas fa-sliders-h"></i> Config. Limites
      </button>
      <button class="btn btn-primary" onclick="openModal('novoProdModal')" title="Cadastrar novo produto">
        <i class="fas fa-plus"></i> Novo Produto
      </button>
    </div>
  </div>

  <!-- Stock Status Summary Cards -->
  <div id="stockStatus" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
    ${Object.entries(stockStatusInfo).map(([key, info]) => {
      const count = products.filter(p => p.stockStatus === key).length
      return `
      <div class="card" style="padding:16px;border-left:4px solid ${info.color};cursor:pointer;" onclick="filterByStatus('${key}')">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-size:22px;font-weight:800;color:${info.color};">${count}</div>
            <div style="font-size:12px;color:#6c757d;margin-top:2px;">${info.label}</div>
          </div>
          <div style="width:38px;height:38px;border-radius:10px;background:${info.bg};display:flex;align-items:center;justify-content:center;">
            <i class="fas ${info.icon}" style="color:${info.color};font-size:16px;"></i>
          </div>
        </div>
      </div>`
    }).join('')}
  </div>

  <!-- Search & Filter -->
  <div class="card" style="padding:14px 20px;margin-bottom:16px;">
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
      <div class="search-box" style="flex:1;">
        <i class="fas fa-search icon"></i>
        <input class="form-control" type="text" id="prodSearch" placeholder="Buscar por código ou nome..." oninput="filterProds()">
      </div>
      <select class="form-control" id="prodStatusFilter" style="width:auto;" onchange="filterProds()">
        <option value="">Todos os status</option>
        <option value="critical">Crítico</option>
        <option value="normal">Normal</option>
        <option value="purchase_needed">Nec. Compra</option>
        <option value="manufacture_needed">Nec. Manufatura</option>
      </select>
      <select class="form-control" style="width:auto;">
        <option>Todas as unidades</option>
        <option>un</option><option>kg</option><option>m</option><option>l</option>
      </select>
    </div>
  </div>

  <!-- Tabela de Produtos — edição inline por duplo clique -->
  <div class="card" style="overflow:hidden;border-top:3px solid #1B4F72;">
    <div style="overflow-x:auto;">
      <table id="prodTable" style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#1B4F72;color:white;">
            <th style="padding:10px 12px;text-align:left;width:100px;">Código</th>
            <th style="padding:10px 12px;text-align:left;">Nome <span style="font-size:9px;opacity:0.7;font-weight:400;">(duplo clique p/ editar)</span></th>
            <th style="padding:10px 12px;text-align:center;width:60px;">Un.</th>
            <th style="padding:10px 12px;text-align:center;white-space:nowrap;">Est. Mín</th>
            <th style="padding:10px 12px;text-align:center;white-space:nowrap;">Est. Atual</th>
            <th style="padding:10px 12px;text-align:left;white-space:nowrap;">Status</th>
            <th style="padding:10px 12px;text-align:left;">Descrição <span style="font-size:9px;opacity:0.7;font-weight:400;">(duplo clique)</span></th>
            <th style="padding:10px 12px;text-align:center;width:80px;">Ações</th>
          </tr>
        </thead>
        <tbody id="prodTableBody">
          ${products.map((p) => buildProdRow(p, stockStatusInfo)).join('')}
        </tbody>
      </table>
    </div>
    ${products.length === 0 ? `<div style="padding:40px;text-align:center;color:#9ca3af;"><i class="fas fa-box-open" style="font-size:32px;display:block;margin-bottom:12px;"></i>Nenhum produto cadastrado.</div>` : ''}
  </div>

  <!-- Novo Produto Modal -->
  <div class="modal-overlay" id="novoProdModal">
    <div class="modal" style="max-width:560px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-box" style="margin-right:8px;"></i>Novo Produto</h3>
        <button onclick="closeModal('novoProdModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Nome *</label><input class="form-control" id="newProdName" type="text" placeholder="Nome do produto"></div>
          <div class="form-group"><label class="form-label">Código *</label><input class="form-control" id="newProdCode" type="text" placeholder="ENG-001"></div>
          <div class="form-group"><label class="form-label">Unidade *</label>
            <select class="form-control" id="newProdUnit"><option value="un">un</option><option value="kg">kg</option><option value="m">m</option><option value="l">l</option><option value="pc">pc</option><option value="m2">m²</option><option value="lt">lt</option></select>
          </div>
          <!-- Controle de Série / Lote -->
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label"><i class="fas fa-barcode" style="margin-right:5px;color:#7c3aed;"></i>Controla por Série/Lote?</label>
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;font-weight:500;" id="slCtrl_no">
                <input type="radio" name="newProdSerial" value="none" checked onchange="toggleSerialType(this.value)"> Não controla
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;font-weight:500;" id="slCtrl_serie">
                <input type="radio" name="newProdSerial" value="serie" onchange="toggleSerialType(this.value)">
                <i class="fas fa-barcode" style="color:#7c3aed;"></i> Número de Série
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;font-weight:500;" id="slCtrl_lote">
                <input type="radio" name="newProdSerial" value="lote" onchange="toggleSerialType(this.value)">
                <i class="fas fa-layer-group" style="color:#d97706;"></i> Número de Lote
              </label>
            </div>
            <div id="serialTypeHint" style="display:none;margin-top:8px;font-size:11px;color:#6c757d;background:#f5f3ff;padding:8px 12px;border-radius:6px;border-left:3px solid #7c3aed;">
              <i class="fas fa-info-circle" style="margin-right:4px;color:#7c3aed;"></i>
              <span id="serialTypeHintText"></span>
            </div>
          </div>
          <!-- Estoque mínimo -->
          <div class="form-group">
            <label class="form-label"><i class="fas fa-layer-group" style="margin-right:5px;color:#2980B9;"></i>Estoque Mínimo</label>
            <input class="form-control" type="number" id="newProdStockMin" placeholder="0" min="0" oninput="updateStatusPreview()">
          </div>
          <div class="form-group">
            <label class="form-label">Estoque Atual</label>
            <input class="form-control" type="number" id="newProdStockCurrent" placeholder="0" min="0" oninput="updateStatusPreview()">
          </div>
          <!-- Status preview -->
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Status de Estoque</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:12px;" id="st_critical">
                <input type="radio" name="stockStatus" value="critical" onchange="highlightStatus()"> <span style="color:#dc2626;"><i class="fas fa-exclamation-circle"></i> Crítico</span>
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:12px;" id="st_normal">
                <input type="radio" name="stockStatus" value="normal" checked onchange="highlightStatus()"> <span style="color:#16a34a;"><i class="fas fa-check-circle"></i> Normal</span>
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:12px;" id="st_purchase">
                <input type="radio" name="stockStatus" value="purchase_needed" onchange="highlightStatus()"> <span style="color:#d97706;"><i class="fas fa-shopping-cart"></i> Nec. Compra</span>
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:12px;" id="st_manufacture">
                <input type="radio" name="stockStatus" value="manufacture_needed" onchange="highlightStatus()"> <span style="color:#7c3aed;"><i class="fas fa-industry"></i> Nec. Manufatura</span>
              </label>
            </div>
            <div id="statusAutoHint" style="font-size:11px;color:#6c757d;background:#f8f9fa;padding:8px 12px;border-radius:6px;">
              <i class="fas fa-info-circle" style="margin-right:4px;"></i>Ao informar Estoque Mínimo e Atual, o status será calculado automaticamente (Atual &lt; 50% do mínimo = Crítico).
            </div>
          </div>
          <!-- Tipo de Produto -->
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label"><i class="fas fa-industry" style="margin-right:5px;color:#7c3aed;"></i>Tipo de Produto</label>
            <div style="display:flex;gap:12px;flex-wrap:wrap;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;" id="ptype_ext">
                <input type="radio" name="newProdType" value="external" checked onchange="onProdTypeChange('new',this.value)">
                <i class="fas fa-truck" style="color:#2980B9;"></i> Produto Externo (compra)
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;" id="ptype_int">
                <input type="radio" name="newProdType" value="internal" onchange="onProdTypeChange('new',this.value)">
                <i class="fas fa-cogs" style="color:#7c3aed;"></i> Produto Interno (fabricado)
              </label>
            </div>
          </div>
          <!-- Fornecedores (visível só se externo) -->
          <div class="form-group" style="grid-column:span 2;" id="newProdSupplierSection">
            <label class="form-label"><i class="fas fa-truck" style="margin-right:5px;color:#27AE60;"></i>Fornecedor(es) Principal(is)</label>
            <select class="form-control" id="newProdSupplier1" style="margin-bottom:6px;">
              <option value="">Selecionar fornecedor principal...</option>
              ${suppliers.map((s: any) => `<option value="${s.id}">${s.name} (${s.type}) — Prazo: ${s.deliveryLeadDays}d</option>`).join('')}
            </select>
            <select class="form-control" id="newProdSupplier2">
              <option value="">2º Fornecedor (backup, opcional)...</option>
              ${suppliers.map((s: any) => `<option value="${s.id}">${s.name} (${s.type})</option>`).join('')}
            </select>
            <div style="font-size:11px;color:#6c757d;margin-top:6px;"><i class="fas fa-info-circle" style="margin-right:4px;"></i>Ao atingir estoque crítico, cotação será gerada automaticamente por fornecedor.</div>
          </div>
          <!-- Produção Interna (visível só se interno) -->
          <div class="form-group" style="grid-column:span 2;display:none;" id="newProdInternalSection">
            <div style="background:#f5f3ff;border-radius:8px;padding:14px;border-left:3px solid #7c3aed;">
              <div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:10px;"><i class="fas fa-cogs" style="margin-right:6px;"></i>Configuração de Produto Interno</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group" style="margin:0;">
                  <label class="form-label">Lead Time de Produção (dias)</label>
                  <input class="form-control" type="number" id="newProdLeadTime" value="5" min="1" placeholder="Ex: 5">
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label">% Crítico para gerar OP automática</label>
                  <input class="form-control" type="number" id="newProdCritPct" value="50" min="1" max="100" placeholder="50">
                </div>
              </div>
              <div style="margin-top:10px;font-size:11px;color:#7c3aed;background:white;padding:8px 12px;border-radius:6px;">
                <i class="fas fa-robot" style="margin-right:4px;"></i>
                Quando o estoque atingir esse percentual do mínimo, uma <strong>Ordem de Produção automática</strong> será gerada (status: Pendente Aprovação) e o gestor será notificado.
              </div>
            </div>
          </div>
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Descrição</label><textarea class="form-control" rows="3" placeholder="Descrição detalhada..."></textarea></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novoProdModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarNovoProduto()" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <!-- Edit Produto Modal -->
  <div class="modal-overlay" id="editProdModal">
    <div class="modal" style="max-width:520px;">
      <input type="hidden" id="ep_id">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;" id="editProdTitle"><i class="fas fa-edit" style="margin-right:8px;"></i>Editar Produto</h3>
        <button onclick="closeModal('editProdModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Nome</label><input class="form-control" id="ep_name" type="text"></div>
          <div class="form-group"><label class="form-label">Código</label><input class="form-control" id="ep_code" type="text"></div>
          <div class="form-group"><label class="form-label">Unidade</label>
            <select class="form-control" id="ep_unit"><option>un</option><option>kg</option><option>m</option><option>l</option></select>
          </div>
          <!-- Controle de Série / Lote -->
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label"><i class="fas fa-barcode" style="margin-right:5px;color:#7c3aed;"></i>Controla por Série/Lote?</label>
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;" id="epSlCtrl_no">
                <input type="radio" name="editProdSerial" id="ep_serial_none" value="none" onchange="toggleEditSerialHint(this.value)"> Não controla
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;" id="epSlCtrl_serie">
                <input type="radio" name="editProdSerial" id="ep_serial_serie" value="serie" onchange="toggleEditSerialHint(this.value)">
                <i class="fas fa-barcode" style="color:#7c3aed;"></i> Número de Série
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;" id="epSlCtrl_lote">
                <input type="radio" name="editProdSerial" id="ep_serial_lote" value="lote" onchange="toggleEditSerialHint(this.value)">
                <i class="fas fa-layer-group" style="color:#d97706;"></i> Número de Lote
              </label>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label"><i class="fas fa-layer-group" style="margin-right:5px;color:#2980B9;"></i>Estoque Mínimo</label>
            <input class="form-control" id="ep_stockMin" type="number" min="0" oninput="calcEditStatus()">
          </div>
          <div class="form-group">
            <label class="form-label">Estoque Atual</label>
            <input class="form-control" id="ep_stockCurrent" type="number" min="0" oninput="calcEditStatus()">
          </div>
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Status de Estoque (calculado)</label>
            <div id="editStatusDisplay" style="padding:10px 14px;border-radius:8px;font-size:13px;font-weight:600;background:#f0fdf4;color:#16a34a;">
              <i class="fas fa-check-circle"></i> Normal
            </div>
          </div>
          <!-- Tipo de Produto (edição) -->
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label"><i class="fas fa-industry" style="margin-right:5px;color:#7c3aed;"></i>Tipo de Produto</label>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:12px;" id="ep_ptype_ext">
                <input type="radio" name="editProdType" id="ep_type_ext" value="external" onchange="onProdTypeChange('edit',this.value)">
                <i class="fas fa-truck" style="color:#2980B9;"></i> Externo
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:12px;" id="ep_ptype_int">
                <input type="radio" name="editProdType" id="ep_type_int" value="internal" onchange="onProdTypeChange('edit',this.value)">
                <i class="fas fa-cogs" style="color:#7c3aed;"></i> Interno (fabricado)
              </label>
            </div>
          </div>
          <div class="form-group" style="grid-column:span 2;" id="editProdSupplierSection">
            <label class="form-label"><i class="fas fa-truck" style="margin-right:5px;color:#27AE60;"></i>Fornecedor Principal</label>
            <select class="form-control" id="ep_supplier">
              <option value="">Selecionar fornecedor...</option>
              ${suppliers.map((s: any) => `<option value="${s.id}">${s.name} (${s.type}) — Prazo: ${s.deliveryLeadDays}d</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="grid-column:span 2;display:none;" id="editProdInternalSection">
            <div style="background:#f5f3ff;border-radius:8px;padding:12px;border-left:3px solid #7c3aed;">
              <div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:8px;"><i class="fas fa-cogs" style="margin-right:5px;"></i>Produto Interno</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div><label class="form-label">Lead Time (dias)</label><input class="form-control" type="number" id="ep_leadtime" value="5" min="1"></div>
                <div><label class="form-label">% Crítico → OP auto</label><input class="form-control" type="number" id="ep_critpct" value="50" min="1" max="100"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('editProdModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarEdicaoProduto()" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <!-- Popup: OP Automática para Produto Interno Crítico -->
  <div id="autoOPPopup" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:600;align-items:center;justify-content:center;">
    <div style="background:white;border-radius:16px;padding:32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:slideIn 0.3s ease;">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="width:64px;height:64px;background:#f5f3ff;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
          <i class="fas fa-robot" style="font-size:28px;color:#7c3aed;"></i>
        </div>
        <div style="font-size:18px;font-weight:800;color:#1B4F72;">OP Automática Gerada!</div>
        <div style="font-size:13px;color:#6c757d;margin-top:6px;">Produto interno atingiu estoque crítico</div>
      </div>
      <div style="background:#f5f3ff;border-radius:10px;padding:16px;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:8px;"><i class="fas fa-cogs" style="margin-right:6px;"></i>Produto</div>
        <div style="font-size:15px;font-weight:800;color:#1B4F72;" id="autoOPProdName">Tampa de Alumínio A200</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">
          <div style="background:white;border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:700;">Qtd a Produzir</div>
            <div style="font-size:22px;font-weight:800;color:#7c3aed;" id="autoOPQty">38</div>
          </div>
          <div style="background:white;border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:700;">Status OP</div>
            <div style="font-size:13px;font-weight:700;color:#d97706;">⏳ Pend. Aprovação</div>
          </div>
        </div>
      </div>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;margin-bottom:20px;font-size:12px;color:#92400e;">
        <i class="fas fa-bell" style="margin-right:6px;"></i>
        <strong>Gestor notificado:</strong> O gestor PCP da sua conta foi notificado via e-mail sobre a geração automática desta OP. A aprovação é necessária para iniciar a produção.
      </div>
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('autoOPPopup').style.display='none'" class="btn btn-secondary" style="flex:1;justify-content:center;">Fechar</button>
        <a href="/ordens" class="btn btn-primary" style="flex:1;justify-content:center;text-decoration:none;" onclick="document.getElementById('autoOPPopup').style.display='none'">
          <i class="fas fa-eye"></i> Ver Ordens
        </a>
      </div>
    </div>
  </div>


  <script>
  // ── Edição Inline de Produtos (duplo clique) ─────────────────────────────
  // Mapa local de edições pendentes
  const prodEdits: Record<string, Record<string, any>> = {};

  function startProdEdit(td: HTMLElement, field: string, id: string) {
    // Cancela qualquer edição ativa na mesma coluna/campo
    document.querySelectorAll('.prod-cell-input').forEach((el: any) => {
      if (el.dataset.field === field && el.style.display !== 'none') cancelProdEdit(el);
    });
    const view = td.querySelector('.prod-cell-view') as HTMLElement;
    const input = td.querySelector('.prod-cell-input') as HTMLElement;
    if (!view || !input) return;
    view.style.display = 'none';
    input.style.display = 'inline-block';
    (input as HTMLInputElement).focus();
    if ((input as HTMLInputElement).select) (input as HTMLInputElement).select();
  }

  function cancelProdEdit(input: HTMLInputElement) {
    const td = input.closest('td');
    if (!td) return;
    const view = td.querySelector('.prod-cell-view') as HTMLElement;
    if (view) view.style.display = '';
    input.style.display = 'none';
  }

  async function saveProdCell(input: HTMLInputElement) {
    const id = input.dataset.id || '';
    const field = input.dataset.field || '';
    const val = input.value.trim();
    if (!id || !field) { cancelProdEdit(input); return; }

    // Calcular novo status se campos de estoque mudaram
    const row = input.closest('tr') as HTMLElement;
    let payload: any = { [field]: field === 'stockMin' || field === 'stockCurrent' ? parseInt(val) || 0 : val };

    // Se mudou stockMin ou stockCurrent, recalcular status
    if (field === 'stockMin' || field === 'stockCurrent') {
      let min = 0, curr = 0;
      if (field === 'stockMin') {
        min = parseInt(val) || 0;
        curr = parseInt((row?.querySelector('[data-field="stockCurrent"]') as HTMLInputElement)?.value || '0') || 0;
        // buscar valor atual do view
        const currView = row?.querySelectorAll('td')[4]?.querySelector('.prod-cell-view');
        if (currView) curr = parseInt(currView.textContent?.trim() || '0') || 0;
      } else {
        curr = parseInt(val) || 0;
        const minView = row?.querySelectorAll('td')[3]?.querySelector('.prod-cell-view');
        if (minView) min = parseInt(minView.textContent?.trim() || '0') || 0;
      }
      const newStatus = calcStatus(curr, min);
      payload.stockStatus = newStatus;
    }

    try {
      const res = await fetch('/produtos/api/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        // Atualizar a célula view com o novo valor
        const td = input.closest('td');
        const view = td?.querySelector('.prod-cell-view') as HTMLElement;
        if (view) {
          if (field === 'name') view.textContent = val;
          else if (field === 'code') view.textContent = val;
          else if (field === 'unit') view.textContent = val;
          else if (field === 'stockMin' || field === 'stockCurrent') {
            view.innerHTML = '<span style="font-weight:700;">' + val + '</span>';
          }
          else if (field === 'description') {
            view.textContent = val;
          }
          view.style.display = '';
        }
        input.style.display = 'none';
        // Atualizar status badge se necessário
        if (payload.stockStatus && row) {
          const badge = row.querySelector('.prod-status-badge') as HTMLElement;
          const statusInfo: Record<string, any> = {
            critical: { label:'Crítico', color:'#dc2626', bg:'#fef2f2', icon:'fa-exclamation-circle' },
            normal: { label:'Normal', color:'#16a34a', bg:'#f0fdf4', icon:'fa-check-circle' },
            purchase_needed: { label:'Nec. Compra', color:'#d97706', bg:'#fffbeb', icon:'fa-shopping-cart' },
            manufacture_needed: { label:'Nec. Manufatura', color:'#7c3aed', bg:'#f5f3ff', icon:'fa-industry' },
          };
          const si = statusInfo[payload.stockStatus] || statusInfo.normal;
          if (badge) {
            badge.style.background = si.bg;
            badge.style.color = si.color;
            badge.innerHTML = '<i class="fas ' + si.icon + '" style="font-size:9px;"></i>' + si.label;
            row.dataset.status = payload.stockStatus;
          }
        }
        showToast('✅ ' + field + ' atualizado!', 'success');
      } else {
        showToast(data.error || 'Erro ao atualizar', 'error');
        cancelProdEdit(input);
      }
    } catch(e) {
      showToast('Erro de conexão', 'error');
      cancelProdEdit(input);
    }
  }

  // ── Funções gerais da página de Produtos ─────────────────────────────────
  function filterProds() {
    const search = document.getElementById('prodSearch').value.toLowerCase();
    const status = document.getElementById('prodStatusFilter').value;
    document.querySelectorAll('.prod-row').forEach(row => {
      const matchSearch = !search || (row.dataset.search || '').includes(search);
      const matchStatus = !status || row.dataset.status === status;
      (row as HTMLElement).style.display = (matchSearch && matchStatus) ? '' : 'none';
    });
  }

  function filterByStatus(status) {
    document.getElementById('prodStatusFilter').value = status;
    filterProds();
    document.getElementById('prodTable')?.scrollIntoView({ behavior:'smooth' });
  }

  function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior:'smooth' });
  }

  function calcStatus(current, min) {
    if (min <= 0) return 'normal';
    const pct = (current / min) * 100;
    if (pct < 50) return 'critical';
    if (pct < 80) return 'purchase_needed';
    if (pct < 100) return 'manufacture_needed';
    return 'normal';
  }

  function updateStatusPreview() {
    const min = parseInt(document.getElementById('newProdStockMin').value) || 0;
    const curr = parseInt(document.getElementById('newProdStockCurrent').value) || 0;
    if (min > 0) {
      const status = calcStatus(curr, min);
      const radio = document.querySelector('input[name="stockStatus"][value="' + status + '"]');
      if (radio) { radio.checked = true; highlightStatus(); }
    }
  }

  function highlightStatus() {
    const selected = document.querySelector('input[name="stockStatus"]:checked')?.value;
    ['critical','normal','purchase_needed','manufacture_needed'].forEach(s => {
      const el = document.getElementById('st_' + (s === 'purchase_needed' ? 'purchase' : s === 'manufacture_needed' ? 'manufacture' : s));
      if (el) el.style.borderColor = (selected === s) ? '#2980B9' : '#d1d5db';
    });
  }

  function openEditProd(id, name, code, unit, stockMin, stockCurrent, stockStatus, serialControlled, controlType) {
    document.getElementById('ep_id').value = id;
    document.getElementById('ep_name').value = name;
    document.getElementById('ep_code').value = code;
    document.getElementById('ep_unit').value = unit;
    document.getElementById('ep_stockMin').value = stockMin;
    document.getElementById('ep_stockCurrent').value = stockCurrent;
    // Set serial control
    const serialVal = serialControlled === 'true' ? (controlType || 'serie') : 'none';
    const radio = document.querySelector('input[name="editProdSerial"][value="' + serialVal + '"]');
    if (radio) radio.checked = true;
    toggleEditSerialHint(serialVal);
    calcEditStatus();
    openModal('editProdModal');
  }

  function toggleEditSerialHint(val) {
    ['epSlCtrl_no','epSlCtrl_serie','epSlCtrl_lote'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.borderColor = '#d1d5db';
    });
    if (val === 'serie') document.getElementById('epSlCtrl_serie').style.borderColor = '#7c3aed';
    else if (val === 'lote') document.getElementById('epSlCtrl_lote').style.borderColor = '#d97706';
    else document.getElementById('epSlCtrl_no').style.borderColor = '#16a34a';
  }

  function toggleSerialType(val) {
    const hint = document.getElementById('serialTypeHint');
    const hintText = document.getElementById('serialTypeHintText');
    ['slCtrl_no','slCtrl_serie','slCtrl_lote'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.borderColor = '#d1d5db';
    });
    if (val === 'serie') {
      hint.style.display = 'block';
      hintText.textContent = 'Cada unidade terá um número de série único. O número deve ser informado nos apontamentos e ao importar via planilha.';
      document.getElementById('slCtrl_serie').style.borderColor = '#7c3aed';
    } else if (val === 'lote') {
      hint.style.display = 'block';
      hintText.textContent = 'Peças serão agrupadas por lote. O número do lote deve ser informado nos apontamentos e ao importar via planilha (quantidades somadas por lote).';
      document.getElementById('slCtrl_lote').style.borderColor = '#d97706';
    } else {
      hint.style.display = 'none';
      document.getElementById('slCtrl_no').style.borderColor = '#16a34a';
    }
  }

  function calcEditStatus() {
    const min = parseInt(document.getElementById('ep_stockMin').value) || 0;
    const curr = parseInt(document.getElementById('ep_stockCurrent').value) || 0;
    const status = calcStatus(curr, min);
    const info = {
      critical: { label:'Crítico', color:'#dc2626', bg:'#fef2f2', icon:'fa-exclamation-circle' },
      normal: { label:'Normal', color:'#16a34a', bg:'#f0fdf4', icon:'fa-check-circle' },
      purchase_needed: { label:'Necessidade de Compra', color:'#d97706', bg:'#fffbeb', icon:'fa-shopping-cart' },
      manufacture_needed: { label:'Necessidade de Manufatura', color:'#7c3aed', bg:'#f5f3ff', icon:'fa-industry' },
    };
    const s = info[status] || info.normal;
    const el = document.getElementById('editStatusDisplay');
    el.style.background = s.bg;
    el.style.color = s.color;
    el.innerHTML = '<i class="fas ' + s.icon + '"></i> ' + s.label;
  }

  // ── Tipo de Produto (interno/externo) ────────────────────────────────────
  function onProdTypeChange(ctx, val) {
    const isNew = ctx === 'new';
    const supSect = document.getElementById(isNew ? 'newProdSupplierSection' : 'editProdSupplierSection');
    const intSect = document.getElementById(isNew ? 'newProdInternalSection' : 'editProdInternalSection');
    if (supSect) supSect.style.display = val === 'external' ? '' : 'none';
    if (intSect) intSect.style.display = val === 'internal' ? '' : 'none';
    // Highlight border
    const extLabel = document.getElementById(isNew ? 'ptype_ext' : 'ep_ptype_ext');
    const intLabel = document.getElementById(isNew ? 'ptype_int' : 'ep_ptype_int');
    if (extLabel) extLabel.style.borderColor = val === 'external' ? '#2980B9' : '#d1d5db';
    if (intLabel) intLabel.style.borderColor = val === 'internal' ? '#7c3aed' : '#d1d5db';
  }


  function showAutoOPPopup(prodName, stockCurrent, stockMin) {
    document.getElementById('autoOPPopup').style.display = 'flex';
    document.getElementById('autoOPProdName').textContent = prodName;
    document.getElementById('autoOPQty').textContent = stockMin - stockCurrent;
  }

  // Auto-close popup after 8 seconds
  setTimeout(() => {
    const popup = document.getElementById('criticalStockPopup');
    if (popup) popup.style.display = 'none';
  }, 8000);


  async function salvarNovoProduto() {
    const typeEl = document.querySelector('input[name="newProdType"]:checked');
    const type = typeEl ? typeEl.value : 'external';
    const nome = (document.getElementById('newProdName') as HTMLInputElement)?.value?.trim() || '';
    const code = (document.getElementById('newProdCode') as HTMLInputElement)?.value?.trim() || '';
    const unit = (document.getElementById('newProdUnit') as HTMLSelectElement)?.value || 'un';
    if (!nome) { showToast('⚠ Informe o nome do produto!', 'error'); return; }
    const stockMin = parseInt(document.getElementById('newProdStockMin')?.value) || 0;
    const stockCurrent = parseInt(document.getElementById('newProdStockCurrent')?.value) || 0;
    const critPct = parseInt(document.getElementById('newProdCritPct')?.value) || 50;
    
    try {
      const res = await fetch('/produtos/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome, code, unit, type, stockMin, stockCurrent, criticalPercentage: critPct })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('✅ Produto criado com sucesso!');
        // Limpar campos do modal
        ['newProdName','newProdCode','newProdStockMin','newProdStockCurrent'].forEach(id => {
          const el = document.getElementById(id) as HTMLInputElement;
          if (el) el.value = '';
        });
        const unitEl = document.getElementById('newProdUnit') as HTMLSelectElement;
        if (unitEl) unitEl.value = 'un';
        closeModal('novoProdModal');
        setTimeout(() => location.reload(), 600);
        if (type === 'internal' && stockMin > 0 && stockCurrent < (stockMin * critPct / 100)) {
          setTimeout(() => showAutoOPPopup(nome, stockCurrent, stockMin), 900);
        }
      } else {
        showToast(data.error || 'Erro ao criar produto', 'error');
      }
    } catch(e) {
      showToast('Erro de conexão', 'error');
    }
  }

  async function salvarEdicaoProduto() {
    const id = document.getElementById('ep_id')?.value || '';
    if (!id) { showToast('ID do produto não encontrado', 'error'); return; }
    const name = document.getElementById('ep_name')?.value || '';
    const code = document.getElementById('ep_code')?.value || '';
    const unit = document.getElementById('ep_unit')?.value || 'un';
    const stockMin = parseInt(document.getElementById('ep_stockMin')?.value) || 0;
    const stockCurrent = parseInt(document.getElementById('ep_stockCurrent')?.value) || 0;
    const typeEl = document.querySelector('input[name="editProdType"]:checked');
    const type = typeEl ? typeEl.value : 'external';
    const serialEl = document.querySelector('input[name="editProdSerial"]:checked');
    const serialVal = serialEl ? serialEl.value : 'none';
    const serialControlled = serialVal !== 'none';
    const controlType = serialControlled ? serialVal : '';
    if (!name) { showToast('Informe o nome do produto!', 'error'); return; }
    try {
      const res = await fetch('/produtos/api/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code, unit, type, stockMin, stockCurrent, serialControlled, controlType })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('✅ Produto atualizado!');
        closeModal('editProdModal');
        setTimeout(() => location.reload(), 800);
      } else {
        showToast(data.error || 'Erro ao atualizar', 'error');
      }
    } catch(e) { showToast('Erro de conexão', 'error'); }
  }

  async function deleteProduto(id) {
    if (!confirm('Excluir este produto?')) return;
    try {
      const res = await fetch('/produtos/api/' + id, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) { showToast('Produto excluído!'); setTimeout(() => location.reload(), 500); }
      else showToast(data.error || 'Erro ao excluir', 'error');
    } catch(e) { showToast('Erro de conexão', 'error'); }
  }

  // ── Toast notification ────────────────────────────────────────────────────
  function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;color:white;box-shadow:0 4px 20px rgba(0,0,0,0.2);transition:opacity 0.3s;display:flex;align-items:center;gap:8px;max-width:360px;';
    t.style.background = type === 'success' ? '#27AE60' : type === 'error' ? '#E74C3C' : '#2980B9';
    t.innerHTML = (type === 'success' ? '<i class=\"fas fa-check-circle\"></i>' : type === 'error' ? '<i class=\"fas fa-exclamation-circle\"></i>' : '<i class=\"fas fa-info-circle\"></i>') + ' ' + msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
  }

  </script>
  `
  return c.html(layout('Produtos', content, 'produtos', userInfo))
})

// ── API: POST /produtos/api/create ───────────────────────────────────────────
app.post('/api/create', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.name) return err(c, 'Nome do produto obrigatório')

  const id = genId('prod')
  const product = {
    id, name: body.name, code: body.code || id.slice(-6).toUpperCase(),
    unit: body.unit || 'un', type: body.type || 'external',
    stockMin: parseInt(body.stockMin) || 0,
    stockMax: parseInt(body.stockMax) || 0,
    stockCurrent: parseInt(body.stockCurrent) || 0,
    criticalPercentage: parseInt(body.criticalPercentage) || 50,
    stockStatus: 'normal', supplierId: body.supplierId || '',
    supplierName: body.supplierName || '', price: parseFloat(body.price) || 0,
    notes: body.notes || '', createdAt: new Date().toISOString(),
  }

  tenant.products.push(product)

  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'products', {
      id, user_id: userId, name: product.name, code: product.code,
      unit: product.unit, type: product.type,
      stock_min: product.stockMin, stock_max: product.stockMax,
      stock_current: product.stockCurrent, stock_status: product.stockStatus,
      price: product.price, notes: product.notes,
      critical_percentage: product.criticalPercentage,
    })
  }

  return ok(c, { product })
})

// ── API: PUT /produtos/api/:id ───────────────────────────────────────────────
app.put('/api/:id', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  if (!body) return err(c, 'Dados inválidos')

  const idx = tenant.products.findIndex((p: any) => p.id === id)
  if (idx === -1) return err(c, 'Produto não encontrado', 404)
  Object.assign(tenant.products[idx], body)

  if (db && userId !== 'demo-tenant') {
    const p = tenant.products[idx] as any
    await dbUpdate(db, 'products', id, userId, {
      name: p.name, code: p.code, unit: p.unit, type: p.type,
      stock_min: p.stockMin, stock_max: p.stockMax,
      stock_current: p.stockCurrent, stock_status: p.stockStatus,
      price: p.price, notes: p.notes,
      description: p.description || '',
      serial_controlled: p.serialControlled ? 1 : 0,
      control_type: p.controlType || '',
    })
  }

  return ok(c, { product: tenant.products[idx] })
})

// ── API: DELETE /produtos/api/:id ────────────────────────────────────────────
app.delete('/api/:id', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const tenant = getCtxTenant(c)
  const id = c.req.param('id')

  const idx = tenant.products.findIndex((p: any) => p.id === id)
  if (idx === -1) return err(c, 'Produto não encontrado', 404)
  tenant.products.splice(idx, 1)

  if (db && userId !== 'demo-tenant') {
    await dbDelete(db, 'products', id, userId)
  }

  return ok(c)
})

// ── API: GET /produtos/api/modelo-csv ────────────────────────────────────────
// Serve o arquivo modelo para download direto (resolve problema de Blob no Cloudflare)
app.get('/api/modelo-csv', (c) => {
  const csv = [
    'Nome,Codigo,Unidade,Tipo,EstoqueMinimo,EstoqueAtual,Descricao,Fornecedor,Preco,ControleSerieOuLote',
    'Parafuso M8x30,PARA-M8-30,un,external,100,250,Parafuso sextavado M8x30mm,Fornecedor ABC,0.45,',
    'Chapa de Aco 3mm,CHP-ACO-3,kg,external,50,120,Chapa laminada a frio,Metalurgica XYZ,8.90,',
    'Tampa Plastica A200,TAMP-A200,un,internal,20,5,Tampa para caixa serie A200,,0,serie',
    'Resina Epoxi,RES-EXP-1L,l,external,10,25,Resina epóxi bicomponente,Quimica Beta,35.00,',
    'Motor Servo 5kW,MOT-SRV-5K,un,external,5,12,Motor servo trifásico,Eletro Plus,1250.00,serie',
    'Tinta Primer 18L,TINT-PRM-18,l,external,30,60,Tinta primer anticorrosiva,Tintas Sul,45.00,lote',
  ].join('\r\n')

  // BOM UTF-8 para Excel reconhecer acentos corretamente
  const bom = '\uFEFF'
  return new Response(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="modelo_produtos.csv"',
      'Cache-Control': 'no-store',
    }
  })
})

// ── API: GET /produtos/api/list ──────────────────────────────────────────────
app.get('/api/list', async (c) => {
  const tenant = getCtxTenant(c)
  return ok(c, { products: tenant.products })
})

// ── API: POST /produtos/api/import ────────────────────────────────────────────
// Recebe array de linhas parseadas do CSV, persiste em memória + D1
// Produtos com controlType='serie'|'lote' geram serialPendingItems no tenant
app.post('/api/import', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !Array.isArray(body.rows)) return err(c, 'Dados inválidos')

  const rows: any[] = body.rows
  if (rows.length === 0) return err(c, 'Nenhuma linha para importar')
  if (rows.length > 500) return err(c, 'Limite de 500 linhas por importação')

  let created = 0
  let updated = 0
  let pendingSerial = 0
  const importedAt = new Date().toISOString()

  function calcStockStatus(current: number, min: number): string {
    if (min <= 0) return 'normal'
    const pct = (current / min) * 100
    if (pct < 50)  return 'critical'
    if (pct < 80)  return 'purchase_needed'
    if (pct < 100) return 'manufacture_needed'
    return 'normal'
  }

  // Garantir arrays existem no tenant
  if (!Array.isArray((tenant as any).serialPendingItems)) (tenant as any).serialPendingItems = []
  if (!Array.isArray((tenant as any).serialNumbers))     (tenant as any).serialNumbers = []

  for (const row of rows) {
    const nome = (row.nome || '').trim()
    const codigo = (row.codigo || '').trim()
    if (!nome || !codigo) continue

    const stockMin      = parseInt(row.stockMin)     || 0
    const stockCurrent  = parseInt(row.stockCurrent) || 0
    const stockStatus   = calcStockStatus(stockCurrent, stockMin)
    const unit          = (row.unidade || 'un').trim()
    const type          = (row.tipo === 'internal' ? 'internal' : 'external')
    const price         = parseFloat(row.preco) || 0
    const notes         = (row.descricao || '').trim()
    const controlType   = (row.controlType === 'serie' || row.controlType === 'lote') ? row.controlType : ''
    const serialControlled = !!controlType

    // Check if product with same code already exists
    const existingIdx = (tenant.products as any[]).findIndex((p: any) => p.code === codigo)
    let productId: string

    if (existingIdx >= 0) {
      // Update existing
      const p = tenant.products[existingIdx] as any
      p.name            = nome
      p.unit            = unit
      p.type            = type
      p.stockMin        = stockMin
      p.stockCurrent    = stockCurrent
      p.stockStatus     = stockStatus
      p.price           = price
      p.notes           = notes
      if (serialControlled) { p.serialControlled = true; p.controlType = controlType }
      productId = p.id

      if (db && userId !== 'demo-tenant') {
        await dbUpdate(db, 'products', p.id, userId, {
          name: nome, unit, type,
          stock_min: stockMin, stock_current: stockCurrent, price, notes
        }).catch(() => {})
      }
      updated++
    } else {
      // Create new
      productId = genId('prod')
      const product: any = {
        id: productId, name: nome, code: codigo, unit, type,
        stockMin, stockMax: 0, stockCurrent, stockStatus,
        serialControlled, controlType,
        criticalPercentage: 50, supplierId: '', supplierName: '',
        price, notes, createdAt: importedAt,
      }
      ;(tenant.products as any[]).push(product)

      if (db && userId !== 'demo-tenant') {
        await dbInsert(db, 'products', {
          id: productId, user_id: userId, name: nome, code: codigo, unit, type,
          stock_min: stockMin, stock_max: 0, stock_current: stockCurrent,
          price, notes,
        }).catch(() => {})
      }
      created++
    }

    // ── Gerar item de liberação de série/lote se necessário ──────────────────
    if (serialControlled && stockCurrent > 0) {
      // Checar se já existe pending para este produto nesta importação
      const alreadyPending = (tenant as any).serialPendingItems.find(
        (pi: any) => pi.productCode === codigo && pi.status === 'pending'
      )
      if (!alreadyPending) {
        const pendingId = genId('spi')
        const pendingItem = {
          id: pendingId,
          productId,
          productCode: codigo,
          productName: nome,
          controlType,          // 'serie' | 'lote'
          unit,
          totalQty: stockCurrent,   // quantidade total importada
          identifiedQty: 0,         // já identificados
          status: 'pending',         // pending | partial | complete
          importedAt,
          entries: [] as any[],      // [{ number, qty, obs }]
        }
        ;(tenant as any).serialPendingItems.push(pendingItem)
        pendingSerial++
      }
    }
  }

  return ok(c, { created, updated, total: created + updated, pendingSerial })
})

export default app

