import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxUserId, getCtxEmpresaId } from '../sessionHelper'
import { genId, dbInsert, dbInsertWithRetry, dbUpdate, dbDelete, ok, err } from '../dbHelpers'
import { markTenantModified, getTenantData } from '../userStore'

const app = new Hono()

// Produtos page
app.get('/', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const products = tenant.products || []
  const bomItems = tenant.bomItems || []
  const suppliers = tenant.suppliers || []
  const productSuppliers = tenant.productSuppliers || []

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
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Descrição</label><textarea class="form-control" id="newProdDesc" rows="3" placeholder="Descrição detalhada..."></textarea></div>
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
  function startProdEdit(td, field, id) {
    // Cancela qualquer edição ativa no mesmo campo
    document.querySelectorAll('.prod-cell-input').forEach(function(el) {
      if (el.dataset.field === field && el.style.display !== 'none') cancelProdEdit(el);
    });
    var view  = td.querySelector('.prod-cell-view');
    var input = td.querySelector('.prod-cell-input');
    if (!view || !input) return;
    view.style.display  = 'none';
    input.style.display = 'inline-block';
    input.focus();
    if (input.select) input.select();
  }

  function cancelProdEdit(input) {
    var td = input.closest('td');
    if (!td) return;
    var view = td.querySelector('.prod-cell-view');
    if (view) view.style.display = '';
    input.style.display = 'none';
  }

  function calcStatus(current, min, max, criticalPct) {
    if (min <= 0) return 'normal';
    var critPct = criticalPct || 50;
    var criticalThreshold = (min * critPct) / 100;
    if (current <= criticalThreshold) return 'critical';
    if (current < min) return 'purchase_needed';
    var maxVal = max || 0;
    if (maxVal > min && current < min + (maxVal - min) * 0.5) return 'manufacture_needed';
    return 'normal';
  }

  async function saveProdCell(input) {
    var id    = input.dataset.id || '';
    var field = input.dataset.field || '';
    var val   = input.value.trim();
    if (!id || !field) { cancelProdEdit(input); return; }

    var payload = {};
    payload[field] = (field === 'stockMin' || field === 'stockCurrent') ? (parseInt(val) || 0) : val;

    // Recalcular status se campos de estoque mudaram
    if (field === 'stockMin' || field === 'stockCurrent') {
      var row = input.closest('tr');
      var min = 0, curr = 0;
      if (field === 'stockMin') {
        min  = parseInt(val) || 0;
        var currView = row ? row.querySelectorAll('td')[4].querySelector('.prod-cell-view') : null;
        curr = currView ? (parseInt(currView.textContent.trim()) || 0) : 0;
      } else {
        curr = parseInt(val) || 0;
        var minView = row ? row.querySelectorAll('td')[3].querySelector('.prod-cell-view') : null;
        min  = minView ? (parseInt(minView.textContent.trim()) || 0) : 0;
      }
      payload.stockStatus = calcStatus(curr, min);
    }

    try {
      var res  = await fetch('/produtos/api/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      if (data.ok) {
        // Atualizar célula view
        var tdEl  = input.closest('td');
        var view  = tdEl ? tdEl.querySelector('.prod-cell-view') : null;
        if (view) {
          if (field === 'stockMin' || field === 'stockCurrent') {
            view.innerHTML = '<span style="font-weight:700;">' + val + '</span>';
          } else {
            view.textContent = val;
          }
          view.style.display = '';
        }
        input.style.display = 'none';
        // Atualizar badge de status
        if (payload.stockStatus) {
          var row = input.closest('tr');
          var badge = row ? row.querySelector('.prod-status-badge') : null;
          var statusInfo = {
            critical:           { label:'Cr\u00edtico',          color:'#dc2626', bg:'#fef2f2', icon:'fa-exclamation-circle' },
            normal:             { label:'Normal',                color:'#16a34a', bg:'#f0fdf4', icon:'fa-check-circle' },
            purchase_needed:    { label:'Nec. Compra',           color:'#d97706', bg:'#fffbeb', icon:'fa-shopping-cart' },
            manufacture_needed: { label:'Nec. Manufatura',       color:'#7c3aed', bg:'#f5f3ff', icon:'fa-industry' }
          };
          var si = statusInfo[payload.stockStatus] || statusInfo.normal;
          if (badge) {
            badge.style.background = si.bg;
            badge.style.color      = si.color;
            badge.innerHTML = '<i class="fas ' + si.icon + '" style="font-size:9px;"></i>' + si.label;
            if (row) row.dataset.status = payload.stockStatus;
          }
        }
        showToast('\u2705 Salvo!', 'success');
      } else {
        showToast(data.error || 'Erro ao atualizar', 'error');
        cancelProdEdit(input);
      }
    } catch(e) {
      showToast('Erro de conex\u00e3o', 'error');
      cancelProdEdit(input);
    }
  }

  // ── Filtros ──────────────────────────────────────────────────────────────
  function filterProds() {
    var search = document.getElementById('prodSearch').value.toLowerCase();
    var status = document.getElementById('prodStatusFilter').value;
    document.querySelectorAll('.prod-row').forEach(function(row) {
      var matchSearch = !search || (row.dataset.search || '').includes(search);
      var matchStatus = !status || row.dataset.status === status;
      row.style.display = (matchSearch && matchStatus) ? '' : 'none';
    });
  }

  function filterByStatus(status) {
    document.getElementById('prodStatusFilter').value = status;
    filterProds();
    var tbl = document.getElementById('prodTable');
    if (tbl) tbl.scrollIntoView({ behavior:'smooth' });
  }

  function scrollToSection(id) {
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior:'smooth' });
  }

  // ── Preview status no modal Novo Produto ─────────────────────────────────
  function updateStatusPreview() {
    var minEl  = document.getElementById('newProdStockMin');
    var currEl = document.getElementById('newProdStockCurrent');
    var min  = parseInt(minEl ? minEl.value : '0')  || 0;
    var curr = parseInt(currEl ? currEl.value : '0') || 0;
    if (min > 0) {
      var status = calcStatus(curr, min);
      var radio  = document.querySelector('input[name="stockStatus"][value="' + status + '"]');
      if (radio) { radio.checked = true; highlightStatus(); }
    }
  }

  function highlightStatus() {
    var selected = '';
    var selEl = document.querySelector('input[name="stockStatus"]:checked');
    if (selEl) selected = selEl.value;
    ['critical','normal','purchase_needed','manufacture_needed'].forEach(function(s) {
      var key = s === 'purchase_needed' ? 'purchase' : s === 'manufacture_needed' ? 'manufacture' : s;
      var el  = document.getElementById('st_' + key);
      if (el) el.style.borderColor = (selected === s) ? '#2980B9' : '#d1d5db';
    });
  }

  // ── Controle série/lote ──────────────────────────────────────────────────
  function toggleSerialType(val) {
    var hint     = document.getElementById('serialTypeHint');
    var hintText = document.getElementById('serialTypeHintText');
    ['slCtrl_no','slCtrl_serie','slCtrl_lote'].forEach(function(id) {
      var el = document.getElementById(id); if (el) el.style.borderColor = '#d1d5db';
    });
    if (val === 'serie') {
      if (hint) hint.style.display = 'block';
      if (hintText) hintText.textContent = 'Cada unidade ter\u00e1 um n\u00famero de s\u00e9rie \u00fanico.';
      var el = document.getElementById('slCtrl_serie'); if (el) el.style.borderColor = '#7c3aed';
    } else if (val === 'lote') {
      if (hint) hint.style.display = 'block';
      if (hintText) hintText.textContent = 'Pe\u00e7as ser\u00e3o agrupadas por lote.';
      var el2 = document.getElementById('slCtrl_lote'); if (el2) el2.style.borderColor = '#d97706';
    } else {
      if (hint) hint.style.display = 'none';
      var el3 = document.getElementById('slCtrl_no'); if (el3) el3.style.borderColor = '#16a34a';
    }
  }

  function toggleEditSerialHint(val) {
    ['epSlCtrl_no','epSlCtrl_serie','epSlCtrl_lote'].forEach(function(id) {
      var el = document.getElementById(id); if (el) el.style.borderColor = '#d1d5db';
    });
    if (val === 'serie') {
      var e = document.getElementById('epSlCtrl_serie'); if (e) e.style.borderColor = '#7c3aed';
    } else if (val === 'lote') {
      var e2 = document.getElementById('epSlCtrl_lote'); if (e2) e2.style.borderColor = '#d97706';
    } else {
      var e3 = document.getElementById('epSlCtrl_no'); if (e3) e3.style.borderColor = '#16a34a';
    }
  }

  // ── Tipo de Produto (interno/externo) ────────────────────────────────────
  function onProdTypeChange(ctx, val) {
    var isNew   = ctx === 'new';
    var supSect = document.getElementById(isNew ? 'newProdSupplierSection' : 'editProdSupplierSection');
    var intSect = document.getElementById(isNew ? 'newProdInternalSection' : 'editProdInternalSection');
    if (supSect) supSect.style.display = val === 'external' ? '' : 'none';
    if (intSect) intSect.style.display = val === 'internal' ? '' : 'none';
    var extLabel = document.getElementById(isNew ? 'ptype_ext' : 'ep_ptype_ext');
    var intLabel = document.getElementById(isNew ? 'ptype_int' : 'ep_ptype_int');
    if (extLabel) extLabel.style.borderColor = val === 'external' ? '#2980B9' : '#d1d5db';
    if (intLabel) intLabel.style.borderColor = val === 'internal' ? '#7c3aed' : '#d1d5db';
  }

  // ── Status calculado no modal Editar ────────────────────────────────────
  function calcEditStatus() {
    var minEl  = document.getElementById('ep_stockMin');
    var currEl = document.getElementById('ep_stockCurrent');
    var min  = parseInt(minEl  ? minEl.value  : '0') || 0;
    var curr = parseInt(currEl ? currEl.value : '0') || 0;
    var status = calcStatus(curr, min);
    var info = {
      critical:           { label:'Cr\u00edtico',                    color:'#dc2626', bg:'#fef2f2', icon:'fa-exclamation-circle' },
      normal:             { label:'Normal',                          color:'#16a34a', bg:'#f0fdf4', icon:'fa-check-circle' },
      purchase_needed:    { label:'Necessidade de Compra',           color:'#d97706', bg:'#fffbeb', icon:'fa-shopping-cart' },
      manufacture_needed: { label:'Necessidade de Manufatura',       color:'#7c3aed', bg:'#f5f3ff', icon:'fa-industry' }
    };
    var s  = info[status] || info.normal;
    var el = document.getElementById('editStatusDisplay');
    if (el) {
      el.style.background = s.bg;
      el.style.color      = s.color;
      el.innerHTML = '<i class="fas ' + s.icon + '"></i> ' + s.label;
    }
  }

  // ── Abrir modal Editar Produto ───────────────────────────────────────────
  function openEditProd(id, name, code, unit, stockMin, stockCurrent, stockStatus, serialControlled, controlType) {
    var elId = document.getElementById('ep_id');           if (elId) elId.value = id;
    var elNm = document.getElementById('ep_name');         if (elNm) elNm.value = name;
    var elCd = document.getElementById('ep_code');         if (elCd) elCd.value = code;
    var elUn = document.getElementById('ep_unit');         if (elUn) elUn.value = unit;
    var elMn = document.getElementById('ep_stockMin');     if (elMn) elMn.value = stockMin;
    var elCr = document.getElementById('ep_stockCurrent'); if (elCr) elCr.value = stockCurrent;
    var serialVal = (serialControlled === 'true' || serialControlled === true) ? (controlType || 'serie') : 'none';
    var radio = document.querySelector('input[name="editProdSerial"][value="' + serialVal + '"]');
    if (radio) radio.checked = true;
    toggleEditSerialHint(serialVal);
    calcEditStatus();
    openModal('editProdModal');
  }

  function showAutoOPPopup(prodName, stockCurrent, stockMin) {
    var popup = document.getElementById('autoOPPopup');
    if (popup) popup.style.display = 'flex';
    var nameEl = document.getElementById('autoOPProdName'); if (nameEl) nameEl.textContent = prodName;
    var qtyEl  = document.getElementById('autoOPQty');      if (qtyEl) qtyEl.textContent = stockMin - stockCurrent;
  }

  // Auto-close popup after 8s
  setTimeout(function() {
    var popup = document.getElementById('criticalStockPopup');
    if (popup) popup.style.display = 'none';
  }, 8000);

  // ── Salvar Novo Produto ──────────────────────────────────────────────────
  async function salvarNovoProduto() {
    var typeEl    = document.querySelector('input[name="newProdType"]:checked');
    var type      = typeEl ? typeEl.value : 'external';
    var nomeEl    = document.getElementById('newProdName');
    var codeEl    = document.getElementById('newProdCode');
    var unitEl    = document.getElementById('newProdUnit');
    var minEl     = document.getElementById('newProdStockMin');
    var currEl    = document.getElementById('newProdStockCurrent');
    var critEl    = document.getElementById('newProdCritPct');
    var descEl    = document.getElementById('newProdDesc');
    var serialEl  = document.querySelector('input[name="newProdSerial"]:checked');
    var sup1El    = document.getElementById('newProdSupplier1');
    var sup2El    = document.getElementById('newProdSupplier2');

    var nome      = nomeEl  ? nomeEl.value.trim()  : '';
    var code      = codeEl  ? codeEl.value.trim()  : '';
    var unit      = unitEl  ? unitEl.value         : 'un';
    var stockMin  = parseInt(minEl  ? minEl.value  : '0') || 0;
    var stockCurrent = parseInt(currEl ? currEl.value : '0') || 0;
    var critPct   = parseInt(critEl ? critEl.value : '50') || 50;
    var desc      = descEl  ? descEl.value.trim()  : '';
    var serialVal = serialEl ? serialEl.value : 'none';
    var serialControlled = serialVal !== 'none';
    var controlType      = serialControlled ? serialVal : '';
    var supplierId  = sup1El ? sup1El.value : '';
    var supplierId2 = sup2El ? sup2El.value : '';

    if (!nome) { showToast('\u26a0 Informe o nome do produto!', 'error'); return; }
    if (!code) { showToast('\u26a0 Informe o c\u00f3digo do produto!', 'error'); return; }

    var stockStatus = calcStatus(stockCurrent, stockMin);

    try {
      var res = await fetch('/produtos/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nome, code: code, unit: unit, type: type,
          stockMin: stockMin, stockCurrent: stockCurrent,
          stockStatus: stockStatus,
          criticalPercentage: critPct,
          description: desc,
          serialControlled: serialControlled,
          controlType: controlType,
          supplierId: supplierId,
          supplierId2: supplierId2
        })
      });
      var data = await res.json();
      if (data.ok) {
        if (data.warning) {
          showToast('\u26a0\ufe0f ' + data.warning, 'warning');
          var pendingProducts = JSON.parse(localStorage.getItem('pending_products') || '[]');
          pendingProducts.push(data.product);
          localStorage.setItem('pending_products', JSON.stringify(pendingProducts));
        } else {
          showToast('\u2705 Produto criado com sucesso!');
        }
        // Limpar campos
        if (nomeEl) nomeEl.value = '';
        if (codeEl) codeEl.value = '';
        if (minEl)  minEl.value  = '';
        if (currEl) currEl.value = '';
        if (unitEl) unitEl.value = 'un';
        if (descEl) descEl.value = '';
        closeModal('novoProdModal');
        setTimeout(function() { location.reload(); }, 600);
        if (type === 'internal' && stockMin > 0 && stockCurrent < (stockMin * critPct / 100)) {
          setTimeout(function() { showAutoOPPopup(nome, stockCurrent, stockMin); }, 900);
        }
      } else {
        showToast(data.error || 'Erro ao criar produto', 'error');
      }
    } catch(e) {
      showToast('Erro de conex\u00e3o', 'error');
    }
  }

  // ── Salvar Edição Produto (modal) ────────────────────────────────────────
  async function salvarEdicaoProduto() {
    var idEl   = document.getElementById('ep_id');
    var id     = idEl ? idEl.value : '';
    if (!id) { showToast('ID do produto n\u00e3o encontrado', 'error'); return; }

    var nameEl  = document.getElementById('ep_name');
    var codeEl  = document.getElementById('ep_code');
    var unitEl  = document.getElementById('ep_unit');
    var minEl   = document.getElementById('ep_stockMin');
    var currEl  = document.getElementById('ep_stockCurrent');
    var typeEl  = document.querySelector('input[name="editProdType"]:checked');
    var serEl   = document.querySelector('input[name="editProdSerial"]:checked');

    var name         = nameEl  ? nameEl.value.trim()  : '';
    var code         = codeEl  ? codeEl.value.trim()  : '';
    var unit         = unitEl  ? unitEl.value          : 'un';
    var stockMin     = parseInt(minEl  ? minEl.value  : '0') || 0;
    var stockCurrent = parseInt(currEl ? currEl.value : '0') || 0;
    var type         = typeEl  ? typeEl.value          : 'external';
    var serialVal    = serEl   ? serEl.value           : 'none';
    var serialControlled = serialVal !== 'none';
    var controlType      = serialControlled ? serialVal : '';
    var stockStatus      = calcStatus(stockCurrent, stockMin);

    if (!name) { showToast('Informe o nome do produto!', 'error'); return; }

    try {
      var res = await fetch('/produtos/api/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name, code: code, unit: unit, type: type,
          stockMin: stockMin, stockCurrent: stockCurrent,
          stockStatus: stockStatus,
          serialControlled: serialControlled, controlType: controlType
        })
      });
      var data = await res.json();
      if (data.ok) {
        showToast('\u2705 Produto atualizado!');
        closeModal('editProdModal');
        setTimeout(function() { location.reload(); }, 800);
      } else {
        showToast(data.error || 'Erro ao atualizar', 'error');
      }
    } catch(e) { showToast('Erro de conex\u00e3o', 'error'); }
  }

  // ── Excluir Produto ──────────────────────────────────────────────────────
  async function deleteProduto(id) {
    if (!confirm('Excluir este produto?')) return;
    try {
      var res  = await fetch('/produtos/api/' + id, { method: 'DELETE' });
      var data = await res.json();
      if (data.ok) { showToast('Produto exclu\u00eddo!'); setTimeout(function() { location.reload(); }, 500); }
      else showToast(data.error || 'Erro ao excluir', 'error');
    } catch(e) { showToast('Erro de conex\u00e3o', 'error'); }
  }

  // ── Toast ────────────────────────────────────────────────────────────────
  function showToast(msg, type) {
    if (!type) type = 'success';
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;color:white;box-shadow:0 4px 20px rgba(0,0,0,0.2);transition:opacity 0.3s;display:flex;align-items:center;gap:8px;max-width:360px;';
    t.style.background = type === 'success' ? '#27AE60' : type === 'error' ? '#E74C3C' : '#2980B9';
    var icon = type === 'success' ? '<i class="fas fa-check-circle"></i>' : type === 'error' ? '<i class="fas fa-exclamation-circle"></i>' : '<i class="fas fa-info-circle"></i>';
    t.innerHTML = icon + ' ' + msg;
    document.body.appendChild(t);
    setTimeout(function() {
      t.style.opacity = '0';
      setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, 3500);
  }

  </script>
  `
  return c.html(layout('Produtos', content, 'produtos', userInfo))
})

// ── API: POST /produtos/api/create ───────────────────────────────────────────
app.post('/api/create', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.name) return err(c, 'Nome do produto obrigatório')

  console.log('[PRODUTOS][POST /api/create] INICIANDO', { userId, empresaId, hasDB: !!db, productName: body.name })

  const id = genId('prod')
  // Calcular stockStatus baseado nos valores informados
  function calcStockStatusCreate(current: number, min: number, max: number = 0, criticalPct: number = 50): string {
    if (min <= 0) return 'normal'
    const criticalThreshold = (min * criticalPct) / 100
    if (current <= criticalThreshold) return 'critical'
    if (current < min) return 'purchase_needed'
    if (max > min && current < min + (max - min) * 0.5) return 'manufacture_needed'
    return 'normal'
  }
  const stockMin     = parseInt(body.stockMin) || 0
  const stockMax     = parseInt(body.stockMax) || 0
  const stockCurrent = parseInt(body.stockCurrent) || 0
  const criticalPct  = parseInt(body.criticalPercentage) || 50
  const stockStatus  = (body.stockStatus && body.stockStatus !== 'normal')
    ? body.stockStatus
    : calcStockStatusCreate(stockCurrent, stockMin, stockMax, criticalPct)

  const product = {
    id, name: body.name, code: body.code || id.slice(-6).toUpperCase(),
    unit: body.unit || 'un', type: body.type || 'external',
    stockMin, stockMax, stockCurrent,
    criticalPercentage: criticalPct,
    stockStatus, supplierId: body.supplierId || '',
    supplierName: body.supplierName || '', price: parseFloat(body.price) || 0,
    description: body.description || '',
    serialControlled: !!body.serialControlled,
    controlType: body.controlType || '',
    notes: body.notes || '', createdAt: new Date().toISOString(),
  }

  // Modo demo: persistência em memória é aceitável
  if (!db || userId === 'demo-tenant') {
    console.log('[PRODUTOS] Modo DEMO - salvar apenas em memória')
    tenant.products.push(product)
    markTenantModified(userId)
    return ok(c, { product, warning: 'Modo demo - dados não persistidos' })
  }

  // Produção: OBRIGATÓRIO persistir em D1 antes de confirmar ao usuário
  console.log(`[PRODUTOS] Modo PRODUÇÃO - persistindo produto ${id} em D1...`)
  const persistResult = await dbInsertWithRetry(db, 'products', {
    id, user_id: userId, empresa_id: empresaId, name: product.name, code: product.code,
    unit: product.unit, type: product.type,
    stock_min: product.stockMin, stock_max: product.stockMax,
    stock_current: product.stockCurrent, stock_status: product.stockStatus,
    price: product.price, notes: product.notes,
    description: product.description,
    serial_controlled: product.serialControlled ? 1 : 0,
    control_type: product.controlType,
    critical_percentage: product.criticalPercentage,
  })

  if (!persistResult.success) {
    console.error(`[CRÍTICO] Falha ao persistir produto ${id} em D1 após ${persistResult.attempts} tentativas: ${persistResult.error}`)
    return err(c,
      `Falha crítica ao salvar produto no banco de dados. O produto NÃO foi salvo. Por favor, tente novamente. Erro: ${persistResult.error}`,
      500
    )
  }

  console.log(`[PRODUTOS][SUCCESS] Produto ${id} persistido em D1 após ${persistResult.attempts} tentativa(s)`)

  // Só adicionar em memória DEPOIS que D1 confirmar sucesso
  tenant.products.push(product)
  markTenantModified(userId)
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

  console.log(`[PRODUTOS][PUT /${id}] ATUALIZANDO`, { userId, hasDB: !!db })

  // Se não é demo, OBRIGATÓRIO atualizar em D1 antes de modificar memória
  if (db && userId !== 'demo-tenant') {
    const currentProduct = tenant.products[idx] as any
    const merged = { ...currentProduct, ...body }
    console.log(`[PRODUTOS] Atualizando produto ${id} em D1...`)
    const updated = await dbUpdate(db, 'products', id, userId, {
      name: merged.name, code: merged.code, unit: merged.unit, type: merged.type,
      stock_min: merged.stockMin, stock_max: merged.stockMax,
      stock_current: merged.stockCurrent, stock_status: merged.stockStatus,
      price: merged.price, notes: merged.notes,
      description: merged.description || '',
      serial_controlled: merged.serialControlled ? 1 : 0,
      control_type: merged.controlType || '',
    })

    if (!updated) {
      console.error(`[CRÍTICO] Falha ao atualizar produto ${id} em D1`)
      return err(c, 'Falha ao persistir produto no banco de dados. As alterações NÃO foram salvas. Tente novamente.', 500)
    }

    console.log(`[PRODUTOS][SUCCESS] Produto ${id} atualizado em D1`)
  }

  // Atualizar em memória após confirmação do D1 (ou imediatamente para demo)
  Object.assign(tenant.products[idx], body)
  markTenantModified(userId)
  return ok(c, { product: tenant.products[idx] })
})

// ── API: GET /produtos/api/debug/check-d1 ────────────────────────────────────
// DEBUG - Verificar exatamente o que está salvo em D1 vs memória
app.get('/api/debug/check-d1', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)

  if (!db || userId === 'demo-tenant') {
    const memProducts = getTenantData(userId).products || []
    return ok(c, {
      message: 'Modo demo - sem acesso a D1',
      count: 0,
      products: [],
      memory_count: memProducts.length,
      memory_products: memProducts.map((p: any) => ({ id: p.id, name: p.name, code: p.code })),
    })
  }

  console.log(`[DEBUG] Verificando produtos em D1 para usuário ${userId}`)

  try {
    const count = await db.prepare(`SELECT COUNT(*) as cnt FROM products WHERE user_id = ?`)
      .bind(userId).first() as any

    const rows = await db.prepare(`SELECT id, name, code, created_at FROM products WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`)
      .bind(userId).all()

    console.log(`[DEBUG] D1 tem ${count?.cnt || 0} produtos para ${userId}`)

    const memProducts = getTenantData(userId).products || []
    return ok(c, {
      message: `${count?.cnt || 0} produtos encontrados em D1`,
      count: count?.cnt || 0,
      products: rows.results || [],
      memory_count: memProducts.length,
      memory_products: memProducts.map((p: any) => ({ id: p.id, name: p.name, code: p.code })),
    })
  } catch (e) {
    console.error(`[DEBUG][ERROR] Falha ao verificar D1:`, e)
    return err(c, `Erro ao verificar D1: ${(e as any)?.message}`, 500)
  }
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
  const empresaId = getCtxEmpresaId(c)
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

  function calcStockStatus(current: number, min: number, max: number = 0, criticalPct: number = 50): string {
    if (min <= 0) return 'normal'
    const criticalThreshold = (min * criticalPct) / 100
    if (current <= criticalThreshold) return 'critical'
    if (current < min) return 'purchase_needed'
    if (max > min && current < min + (max - min) * 0.5) return 'manufacture_needed'
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
          id: productId, user_id: userId, empresa_id: empresaId, name: nome, code: codigo, unit, type,
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

