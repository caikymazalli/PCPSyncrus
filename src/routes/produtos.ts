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
      <button class="btn btn-secondary" onclick="openModal('importPlanilhaModal')" title="Importar produtos via planilha">
        <i class="fas fa-file-upload"></i> Importar
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

  <div id="prodGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
    ${products.map(p => {
      const bomCount = bomItems.filter(b => b.productCode === p.code).length
      const si = stockStatusInfo[p.stockStatus] || stockStatusInfo.normal
      const stockPct = p.stockMin > 0 ? Math.min(100, Math.round((p.stockCurrent / p.stockMin) * 100)) : 100
      return `
      <div class="card prod-card" data-status="${p.stockStatus}" data-search="${p.name.toLowerCase()} ${p.code.toLowerCase()}" style="padding:0;overflow:hidden;border-top:3px solid ${si.color};">
        <div style="padding:16px 16px 12px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
            <div style="flex:1;min-width:0;padding-right:8px;">
              <div style="font-size:15px;font-weight:700;color:#1B4F72;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p.name}">${p.name}</div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;">
                <span style="font-family:monospace;font-size:11px;background:#e8f4fd;padding:2px 8px;border-radius:4px;color:#1B4F72;font-weight:700;">${p.code}</span>
                <span class="chip" style="background:#f1f5f9;color:#374151;">${p.unit}</span>
                ${(p as any).serialControlled ? `<span class="badge" style="background:${(p as any).controlType==='serie'?'#ede9fe':'#fef3c7'};color:${(p as any).controlType==='serie'?'#7c3aed':'#d97706'};font-size:10px;"><i class="fas ${(p as any).controlType==='serie'?'fa-barcode':'fa-layer-group'}" style="font-size:9px;"></i> ${(p as any).controlType==='serie'?'Série':'Lote'}</span>` : ''}
              </div>
            </div>
            <span class="badge" style="background:${si.bg};color:${si.color};white-space:nowrap;flex-shrink:0;">
              <i class="fas ${si.icon}" style="font-size:9px;"></i> ${si.label}
            </span>
          </div>

          ${p.description ? `<div style="font-size:12px;color:#6c757d;margin-bottom:12px;line-height:1.5;">${p.description}</div>` : ''}

          <!-- Stock Progress -->
          <div style="background:#f8f9fa;border-radius:8px;padding:10px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <span style="font-size:11px;color:#6c757d;font-weight:600;">Estoque Atual</span>
              <span style="font-size:11px;color:#6c757d;">Mín: <strong>${p.stockMin} ${p.unit}</strong></span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="progress-bar" style="flex:1;height:6px;">
                <div class="progress-fill" style="width:${stockPct}%;background:${si.color};"></div>
              </div>
              <span style="font-size:14px;font-weight:800;color:${si.color};">${p.stockCurrent}</span>
              <span style="font-size:10px;color:#9ca3af;">${p.unit}</span>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
            <div style="background:#f8f9fa;border-radius:8px;padding:10px;text-align:center;">
              <div style="font-size:18px;font-weight:800;color:${bomCount > 0 ? '#1B4F72' : '#9ca3af'};">${bomCount}</div>
              <div style="font-size:10px;color:#9ca3af;margin-top:2px;">Comp. BOM</div>
            </div>
            <div style="background:${si.bg};border-radius:8px;padding:10px;text-align:center;">
              <div style="font-size:13px;font-weight:800;color:${si.color};"><i class="fas ${si.icon}"></i></div>
              <div style="font-size:10px;color:${si.color};font-weight:600;margin-top:3px;">${si.label}</div>
            </div>
          </div>

          <div style="display:flex;gap:6px;">
            <a href="/engenharia" class="btn btn-secondary btn-sm" style="flex:1;justify-content:center;" title="Ver lista de materiais BOM"><i class="fas fa-list-ul"></i> Ver BOM</a>
            <div class="tooltip-wrap" data-tooltip="Editar produto"><button class="btn btn-secondary btn-sm" onclick="openEditProd('${p.id}','${p.name}','${p.code}','${p.unit}',${p.stockMin},${p.stockCurrent},'${p.stockStatus}','${(p as any).serialControlled}','${(p as any).controlType||''}')"><i class="fas fa-edit"></i></button></div>
            <div class="tooltip-wrap" data-tooltip="Excluir produto"><button class="btn btn-danger btn-sm" onclick="if(confirm('Excluir ${p.name}?')) alert('Produto removido.')"><i class="fas fa-trash"></i></button></div>
          </div>
        </div>
      </div>`
    }).join('')}
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
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Nome *</label><input class="form-control" type="text" placeholder="Nome do produto"></div>
          <div class="form-group"><label class="form-label">Código *</label><input class="form-control" type="text" placeholder="ENG-001"></div>
          <div class="form-group"><label class="form-label">Unidade *</label>
            <select class="form-control"><option value="un">un</option><option value="kg">kg</option><option value="m">m</option><option value="l">l</option></select>
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
        <button onclick="alert('Produto atualizado!');closeModal('editProdModal')" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
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

  <!-- ═══════════════════════════════════════════════════════════════════════
       Modal: Importar Planilha de Produtos
  ══════════════════════════════════════════════════════════════════════════ -->
  <div class="modal-overlay" id="importPlanilhaModal">
    <div class="modal" style="max-width:660px;width:96%;">

      <!-- Header -->
      <div style="padding:18px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;">
          <i class="fas fa-file-upload" style="margin-right:8px;color:#2980B9;"></i>
          Importar Planilha de Produtos
        </h3>
        <button onclick="impFechar()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;line-height:1;">×</button>
      </div>

      <!-- STEP 1: Upload -->
      <div id="imp_step1" style="padding:20px 24px;">
        <div style="background:#e8f4fd;border-radius:8px;padding:11px 14px;margin-bottom:14px;font-size:12px;color:#1B4F72;line-height:1.6;">
          <i class="fas fa-info-circle" style="margin-right:5px;"></i>
          Obrigatórias: <strong>Nome</strong> e <strong>Codigo</strong>. &nbsp;
          Opcionais: Unidade · Tipo · EstoqueMinimo · EstoqueAtual · Descricao · Fornecedor · Preco · <strong>ControleSerieOuLote</strong> (serie / lote)
        </div>

        <!-- Baixar modelo -->
        <a href="/produtos/api/modelo-csv" download="modelo_produtos.csv"
           style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:10px;margin-bottom:14px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;color:#15803d;font-size:13px;font-weight:600;text-decoration:none;cursor:pointer;">
          <i class="fas fa-download"></i> Baixar Planilha Modelo (.csv)
        </a>

        <!-- Drop zone — eventos inline para garantir funcionamento -->
        <div id="imp_zona"
          ondragover="event.preventDefault(); this.style.borderColor='#2980B9'; this.style.background='#e8f4fd';"
          ondragleave="this.style.borderColor=impArq?'#27AE60':'#d1d5db'; this.style.background=impArq?'#f0fdf4':'#f8f9fa';"
          ondrop="event.preventDefault(); this.style.borderColor='#d1d5db'; this.style.background='#f8f9fa'; impDefinirArquivo(event.dataTransfer.files[0]);"
          onclick="document.getElementById('imp_input').click();"
          style="border:2px dashed #d1d5db;border-radius:12px;background:#f8f9fa;padding:34px 20px;text-align:center;cursor:pointer;transition:all 0.2s;user-select:none;">
          <i class="fas fa-cloud-upload-alt" id="imp_icone" style="font-size:38px;color:#9ca3af;margin-bottom:10px;display:block;"></i>
          <div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:4px;">Arraste o arquivo aqui ou clique para buscar</div>
          <div style="font-size:12px;color:#9ca3af;">Formatos: .csv · .xlsx · .xls &nbsp;|&nbsp; Máx. 5 MB</div>
        </div>

        <!-- Input file real — fora da zona para evitar conflito de click -->
        <input type="file" id="imp_input" accept=".csv,.xlsx,.xls" style="display:none;"
               onchange="impDefinirArquivo(this.files[0]);">

        <!-- Info do arquivo selecionado -->
        <div id="imp_arqinfo" style="display:none;margin-top:10px;padding:10px 14px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;align-items:center;gap:10px;">
          <i class="fas fa-file-alt" style="color:#16a34a;font-size:20px;flex-shrink:0;"></i>
          <div style="flex:1;min-width:0;">
            <div id="imp_fname" style="font-size:13px;font-weight:700;color:#15803d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
            <div id="imp_fsize" style="font-size:11px;color:#6c757d;"></div>
          </div>
          <button onclick="impLimpar(); event.stopPropagation();" style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:18px;padding:2px 6px;">×</button>
        </div>

        <div style="margin-top:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:9px 13px;font-size:12px;color:#92400e;">
          <i class="fas fa-exclamation-triangle" style="margin-right:5px;"></i>
          Produtos com mesmo <strong>Código</strong> serão <strong>atualizados</strong>. Novos códigos serão criados.
        </div>
      </div>

      <!-- STEP 2: Preview -->
      <div id="imp_step2" style="display:none;padding:20px 24px;">
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
          <span id="imp_badge_ok" style="padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:#f0fdf4;color:#16a34a;"></span>
          <span id="imp_badge_err" style="display:none;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:#fef2f2;color:#dc2626;"></span>
          <span id="imp_badge_sn" style="display:none;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:#f5f3ff;color:#7c3aed;"></span>
        </div>
        <div style="max-height:300px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:10px;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr style="background:#f8f9fa;">
              <th style="padding:7px 8px;text-align:left;border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#f8f9fa;">#</th>
              <th style="padding:7px 8px;text-align:left;border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#f8f9fa;">Nome</th>
              <th style="padding:7px 8px;text-align:left;border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#f8f9fa;">Código</th>
              <th style="padding:7px 8px;text-align:left;border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#f8f9fa;">Un.</th>
              <th style="padding:7px 8px;text-align:left;border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#f8f9fa;">E.Min</th>
              <th style="padding:7px 8px;text-align:left;border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#f8f9fa;">E.Atual</th>
              <th style="padding:7px 8px;text-align:left;border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#f8f9fa;">Status</th>
              <th style="padding:7px 8px;text-align:left;border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#f8f9fa;">S/N</th>
            </tr></thead>
            <tbody id="imp_tbody"></tbody>
          </table>
        </div>
        <div id="imp_errs" style="display:none;margin-top:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px;font-size:12px;color:#dc2626;line-height:1.7;"></div>
      </div>

      <!-- STEP 3: Progresso -->
      <div id="imp_step3" style="display:none;padding:28px 24px;text-align:center;">
        <div id="imp_prog_label" style="font-size:15px;font-weight:700;color:#1B4F72;margin-bottom:18px;">Importando produtos...</div>
        <div style="background:#f1f5f9;border-radius:999px;height:16px;overflow:hidden;margin-bottom:10px;">
          <div id="imp_prog_bar" style="height:100%;width:0%;background:linear-gradient(90deg,#2980B9,#27AE60);border-radius:999px;transition:width 0.25s ease;"></div>
        </div>
        <div style="font-size:13px;color:#6c757d;margin-bottom:4px;">
          <span id="imp_prog_count">0</span> / <span id="imp_prog_total">0</span> produtos
          &nbsp;·&nbsp;<span id="imp_prog_pct" style="font-weight:700;color:#2980B9;">0%</span>
        </div>
        <div id="imp_prog_sub" style="font-size:11px;color:#9ca3af;margin-top:4px;">Aguarde...</div>
      </div>

      <!-- Footer -->
      <div style="padding:14px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;align-items:center;gap:10px;">
        <button id="imp_btn_back" onclick="impVoltar();" class="btn btn-secondary" style="display:none;margin-right:auto;">
          <i class="fas fa-arrow-left"></i> Voltar
        </button>
        <button id="imp_btn_cancel" onclick="impFechar();" class="btn btn-secondary">Cancelar</button>
        <button id="imp_btn_preview" onclick="impVisualizar();" class="btn btn-primary"
                style="opacity:0.5;cursor:not-allowed;" disabled>
          <i class="fas fa-eye"></i> Visualizar Dados
        </button>
        <button id="imp_btn_confirm" onclick="impConfirmar();" class="btn btn-primary"
                style="display:none;background:#27AE60;border-color:#27AE60;">
          <i class="fas fa-check"></i> Confirmar Importação
        </button>
      </div>
    </div>
  </div>

  <!-- Config Limites Modal -->
  <div class="modal-overlay" id="configLimitesModal">
    <div class="modal" style="max-width:540px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-sliders-h" style="margin-right:8px;"></i>Configurador de Limites de Estoque</h3>
        <button onclick="closeModal('configLimitesModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <div style="background:#e8f4fd;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;color:#1B4F72;">
          <i class="fas fa-info-circle" style="margin-right:6px;"></i>Defina os percentuais do estoque mínimo que determinam o status de cada produto. Esses valores são usados pelo MRP automaticamente.
        </div>
        <div style="display:flex;flex-direction:column;gap:14px;">
          ${[
            { key: 'critical', label: 'Crítico', color: '#dc2626', bg: '#fef2f2', icon: 'fa-exclamation-circle', desc: 'Abaixo de X% do estoque mínimo', default: 50 },
            { key: 'purchase_needed', label: 'Necessidade de Compra', color: '#d97706', bg: '#fffbeb', icon: 'fa-shopping-cart', desc: 'Entre X% e 100% do estoque mínimo (compra externa)', default: 100 },
            { key: 'manufacture_needed', label: 'Necessidade de Manufatura', color: '#7c3aed', bg: '#f5f3ff', icon: 'fa-industry', desc: 'Produção interna necessária para repor estoque', default: 120 },
            { key: 'normal', label: 'Normal', color: '#16a34a', bg: '#f0fdf4', icon: 'fa-check-circle', desc: 'Acima de X% do estoque mínimo', default: 120 },
          ].map(l => `
          <div style="display:flex;align-items:center;gap:12px;padding:12px;background:${l.bg};border-radius:8px;border-left:3px solid ${l.color};">
            <i class="fas ${l.icon}" style="color:${l.color};font-size:18px;width:24px;text-align:center;"></i>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:700;color:${l.color};">${l.label}</div>
              <div style="font-size:11px;color:#6c757d;">${l.desc}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <input type="number" value="${l.default}" min="0" max="999" style="width:64px;padding:6px 8px;border:1.5px solid #d1d5db;border-radius:6px;font-size:13px;text-align:center;font-weight:700;">
              <span style="font-size:12px;color:#6c757d;">%</span>
            </div>
          </div>`).join('')}
        </div>
        <div style="margin-top:16px;background:#f8f9fa;border-radius:8px;padding:12px;">
          <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;"><i class="fas fa-link" style="margin-right:6px;color:#2980B9;"></i>Integração com MRP</div>
          <div style="font-size:12px;color:#6c757d;">Produtos com status "Crítico" e "Necessidade de Compra" são automaticamente incluídos no cálculo MRP como itens prioritários para reposição.</div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('configLimitesModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('Configuração de limites salva com sucesso! O MRP será recalculado automaticamente.');closeModal('configLimitesModal')" class="btn btn-primary"><i class="fas fa-save"></i> Salvar Config.</button>
      </div>
    </div>
  </div>

  <script>
  function filterProds() {
    const search = document.getElementById('prodSearch').value.toLowerCase();
    const status = document.getElementById('prodStatusFilter').value;
    document.querySelectorAll('.prod-card').forEach(card => {
      const matchSearch = !search || (card.dataset.search || '').includes(search);
      const matchStatus = !status || card.dataset.status === status;
      card.parentElement.style.display = (matchSearch && matchStatus) ? '' : 'none';
    });
  }

  function filterByStatus(status) {
    document.getElementById('prodStatusFilter').value = status;
    filterProds();
    document.getElementById('prodGrid').scrollIntoView({ behavior:'smooth' });
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

  function salvarNovoProduto() {
    const type = document.querySelector('input[name="newProdType"]:checked')?.value || 'external';
    const nome = document.querySelector('#novoProdModal input[placeholder="Nome do produto"]')?.value;
    if (!nome) { alert('⚠ Informe o nome do produto!'); return; }
    const stockMin = parseInt(document.getElementById('newProdStockMin')?.value) || 0;
    const stockCurrent = parseInt(document.getElementById('newProdStockCurrent')?.value) || 0;
    const critPct = parseInt(document.getElementById('newProdCritPct')?.value) || 50;
    closeModal('novoProdModal');
    // Verificar se já é crítico ao criar
    if (type === 'internal' && stockMin > 0 && stockCurrent < (stockMin * critPct / 100)) {
      setTimeout(() => showAutoOPPopup(nome || 'Novo Produto', stockCurrent, stockMin), 400);
    } else {
      alert('✅ Produto criado com sucesso!');
    }
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
    const nome = document.querySelector('#novoProdModal input[placeholder="Nome do produto"]')?.value || '';
    const code = document.querySelector('#novoProdModal input[placeholder="Código"]')?.value || '';
    const unit = document.querySelector('#novoProdModal select')?.value || 'un';
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
        closeModal('novoProdModal');
        setTimeout(() => location.reload(), 800);
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
  // ── Importação de planilha ─────────────────────────────────────────────────
  // Estado global do módulo de importação
  var impArq  = null;   // arquivo selecionado
  var impLinhas = [];   // linhas parseadas

  // Normaliza string para comparação de headers
  function impNorm(s) {
    return (s || '').toString().trim().toLowerCase()
      .replace(/\s+/g,'').replace(/[áàãâä]/g,'a').replace(/[éèêë]/g,'e')
      .replace(/[íìîï]/g,'i').replace(/[óòõôö]/g,'o').replace(/[úùûü]/g,'u')
      .replace(/[ç]/g,'c').replace(/[^a-z0-9]/g,'');
  }

  // Fecha e limpa o modal
  function impFechar() {
    document.getElementById('importPlanilhaModal').classList.remove('open');
    setTimeout(function(){ impLimpar(); impTela(1); }, 280);
  }

  // Volta para step 1
  function impVoltar() { impTela(1); }

  // Limpa o estado de arquivo
  function impLimpar() {
    impArq = null;
    impLinhas = [];
    var inp = document.getElementById('imp_input');
    if (inp) inp.value = '';
    var ai = document.getElementById('imp_arqinfo');
    if (ai) ai.style.display = 'none';
    var zona = document.getElementById('imp_zona');
    if (zona) { zona.style.borderColor = '#d1d5db'; zona.style.background = '#f8f9fa'; }
    var ic = document.getElementById('imp_icone');
    if (ic) ic.style.color = '#9ca3af';
    impBotaoPreview(false);
  }

  // Liga/desliga botão Visualizar
  function impBotaoPreview(on) {
    var b = document.getElementById('imp_btn_preview');
    if (!b) return;
    if (on) {
      b.removeAttribute('disabled');
      b.style.opacity = '1';
      b.style.cursor  = 'pointer';
    } else {
      b.setAttribute('disabled', 'disabled');
      b.style.opacity = '0.5';
      b.style.cursor  = 'not-allowed';
    }
  }

  // Controla qual step está visível
  function impTela(step) {
    document.getElementById('imp_step1').style.display = step === 1 ? '' : 'none';
    document.getElementById('imp_step2').style.display = step === 2 ? '' : 'none';
    document.getElementById('imp_step3').style.display = step === 3 ? '' : 'none';
    var bBack    = document.getElementById('imp_btn_back');
    var bCancel  = document.getElementById('imp_btn_cancel');
    var bPreview = document.getElementById('imp_btn_preview');
    var bConfirm = document.getElementById('imp_btn_confirm');
    if (bBack)    bBack.style.display    = step === 2 ? '' : 'none';
    if (bCancel)  bCancel.style.display  = step === 3 ? 'none' : '';
    if (bPreview) bPreview.style.display = step === 1 ? '' : 'none';
    if (bConfirm) bConfirm.style.display = step === 2 ? '' : 'none';
  }

  // Recebe um arquivo e valida
  function impDefinirArquivo(file) {
    if (!file) return;
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['csv','xlsx','xls'].indexOf(ext) === -1) {
      showToast('Formato inválido. Use .csv, .xlsx ou .xls', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Arquivo muito grande. Máx. 5 MB', 'error');
      return;
    }
    impArq = file;
    var fn = document.getElementById('imp_fname');
    var fs = document.getElementById('imp_fsize');
    var ai = document.getElementById('imp_arqinfo');
    if (fn) fn.textContent = file.name;
    if (fs) fs.textContent = (file.size / 1024).toFixed(1) + ' KB';
    if (ai) ai.style.display = 'flex';
    var zona = document.getElementById('imp_zona');
    if (zona) { zona.style.borderColor = '#27AE60'; zona.style.background = '#f0fdf4'; }
    var ic = document.getElementById('imp_icone');
    if (ic) ic.style.color = '#27AE60';
    impBotaoPreview(true);
  }

  // Encontra índice de coluna por lista de nomes normalizados
  function impAcharCol(hdrs, nomes) {
    for (var n = 0; n < nomes.length; n++) {
      for (var j = 0; j < hdrs.length; j++) {
        if (hdrs[j] === nomes[n] || hdrs[j].indexOf(nomes[n]) === 0) return j;
      }
    }
    return -1;
  }

  // Parse CSV
  function impParsearCSV(texto) {
    var limpo = texto.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    var linhas = limpo.split('\n');
    if (linhas.length < 2) return [];
    var hdrs = linhas[0].split(',').map(impNorm);
    var ci = {
      nome:     impAcharCol(hdrs, ['nome']),
      codigo:   impAcharCol(hdrs, ['codigo','cod']),
      unidade:  impAcharCol(hdrs, ['unidade','unid']),
      tipo:     impAcharCol(hdrs, ['tipo']),
      emin:     impAcharCol(hdrs, ['estoqueminimo','estoquemin','min']),
      eatual:   impAcharCol(hdrs, ['estoqueatual','atual']),
      desc:     impAcharCol(hdrs, ['descricao','desc']),
      forn:     impAcharCol(hdrs, ['fornecedor','forn']),
      preco:    impAcharCol(hdrs, ['preco','valor','price']),
      ctrl:     impAcharCol(hdrs, ['controleserieoulate','controleserieoulote','controleserielote','controle','sn']),
    };
    var rows = [];
    for (var i = 1; i < linhas.length; i++) {
      var ln = linhas[i]; if (!ln.trim()) continue;
      var partes = []; var cur = ''; var inQ = false;
      for (var k = 0; k < ln.length; k++) {
        var ch = ln[k];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { partes.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      partes.push(cur.trim());
      var g = function(idx) {
        if (idx < 0 || idx >= partes.length) return '';
        return partes[idx].replace(/^"|"$/g,'').trim();
      };
      var ctrlRaw = impNorm(g(ci.ctrl));
      var ct = ctrlRaw.indexOf('serie') >= 0 ? 'serie' : ctrlRaw.indexOf('lote') >= 0 ? 'lote' : '';
      rows.push({
        _linha: i + 1,
        nome:         g(ci.nome),
        codigo:       g(ci.codigo),
        unidade:      g(ci.unidade) || 'un',
        tipo:         g(ci.tipo) === 'internal' ? 'internal' : 'external',
        stockMin:     parseInt(g(ci.emin))   || 0,
        stockCurrent: parseInt(g(ci.eatual)) || 0,
        descricao:    g(ci.desc),
        fornecedor:   g(ci.forn),
        preco:        parseFloat((g(ci.preco)||'0').replace(',','.')) || 0,
        controlType:  ct,
        serialControlled: ct !== '',
      });
    }
    return rows;
  }

  // Parse XLSX usando SheetJS
  function impParsearXLSX(wb) {
    if (typeof XLSX === 'undefined') return [];
    var ws = wb.Sheets[wb.SheetNames[0]];
    var json = XLSX.utils.sheet_to_json(ws, { defval: '' });
    return json.map(function(r, i) {
      var colKeys = Object.keys(r).map(function(k){ return { k: k, n: impNorm(k) }; });
      var g = function(nomes) {
        var idx = -1;
        for (var n = 0; n < nomes.length && idx < 0; n++) {
          for (var j = 0; j < colKeys.length; j++) {
            if (colKeys[j].n === nomes[n] || colKeys[j].n.indexOf(nomes[n]) === 0) { idx = j; break; }
          }
        }
        if (idx < 0) return '';
        return String(r[colKeys[idx].k] || '').trim();
      };
      var ctrlRaw = impNorm(g(['controleserieoulate','controleserieoulote','controleserielote','controle','sn']));
      var ct = ctrlRaw.indexOf('serie') >= 0 ? 'serie' : ctrlRaw.indexOf('lote') >= 0 ? 'lote' : '';
      return {
        _linha: i + 2,
        nome:         g(['nome']),
        codigo:       g(['codigo','cod']),
        unidade:      g(['unidade','unid']) || 'un',
        tipo:         g(['tipo']) === 'internal' ? 'internal' : 'external',
        stockMin:     parseInt(g(['estoqueminimo','estoquemin','min'])) || 0,
        stockCurrent: parseInt(g(['estoqueatual','atual'])) || 0,
        descricao:    g(['descricao','desc']),
        fornecedor:   g(['fornecedor','forn']),
        preco:        parseFloat((g(['preco','valor','price'])||'0').replace(',','.')) || 0,
        controlType:  ct,
        serialControlled: ct !== '',
      };
    });
  }

  // Calcula status local para preview
  function impStatus(cur, min) {
    if (min <= 0) return { l:'Normal',    c:'#16a34a', b:'#f0fdf4' };
    var p = (cur/min)*100;
    if (p < 50)  return { l:'Crítico',   c:'#dc2626', b:'#fef2f2' };
    if (p < 80)  return { l:'Nec.Compra',c:'#d97706', b:'#fffbeb' };
    if (p < 100) return { l:'Nec.Manuf.',c:'#7c3aed', b:'#f5f3ff' };
    return { l:'Normal', c:'#16a34a', b:'#f0fdf4' };
  }

  // Renderiza preview na tabela
  function impRenderizarPreview(rows) {
    var erros = []; var snQt = 0; var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var ruim = !r.nome || !r.codigo;
      if (!r.nome)   erros.push('Linha ' + r._linha + ': Nome vazio');
      if (!r.codigo) erros.push('Linha ' + r._linha + ': Código vazio');
      if (r.controlType) snQt++;
      var st = impStatus(r.stockCurrent, r.stockMin);
      var bg = ruim ? '#fef2f2' : (i % 2 === 0 ? '#fff' : '#f9fafb');
      var snB = r.controlType === 'serie'
        ? '<span style="background:#ede9fe;color:#7c3aed;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700;">Série</span>'
        : r.controlType === 'lote'
        ? '<span style="background:#fef3c7;color:#d97706;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700;">Lote</span>'
        : '<span style="color:#d1d5db;">—</span>';
      html += '<tr style="background:' + bg + ';">'
        + '<td style="padding:6px 8px;color:#9ca3af;">' + (i+1) + '</td>'
        + '<td style="padding:6px 8px;font-weight:600;color:' + (ruim?'#dc2626':'#374151') + ';">' + (r.nome || '<em style="color:#dc2626">⚠ vazio</em>') + '</td>'
        + '<td style="padding:6px 8px;"><span style="font-family:monospace;background:#e8f4fd;padding:1px 5px;border-radius:4px;font-size:11px;">' + (r.codigo || '<em style="color:#dc2626">⚠</em>') + '</span></td>'
        + '<td style="padding:6px 8px;color:#6c757d;">' + r.unidade + '</td>'
        + '<td style="padding:6px 8px;">' + r.stockMin + '</td>'
        + '<td style="padding:6px 8px;">' + r.stockCurrent + '</td>'
        + '<td style="padding:6px 8px;"><span style="background:' + st.b + ';color:' + st.c + ';padding:2px 6px;border-radius:10px;font-size:10px;font-weight:700;">' + st.l + '</span></td>'
        + '<td style="padding:6px 8px;">' + snB + '</td>'
        + '</tr>';
    }
    var tb = document.getElementById('imp_tbody'); if (tb) tb.innerHTML = html;
    var bOk = document.getElementById('imp_badge_ok'); if (bOk) bOk.textContent = rows.length + ' linha(s)';
    var bErr = document.getElementById('imp_badge_err');
    var erEl = document.getElementById('imp_errs');
    var bConf = document.getElementById('imp_btn_confirm');
    if (erros.length > 0) {
      if (bErr) { bErr.textContent = erros.length + ' erro(s)'; bErr.style.display = ''; }
      if (erEl) { erEl.style.display = ''; erEl.innerHTML = '<strong>⚠ Erros encontrados:</strong><br>' + erros.map(function(x){ return '• '+x; }).join('<br>'); }
      if (bConf) { bConf.setAttribute('disabled','disabled'); bConf.style.opacity='0.5'; bConf.style.cursor='not-allowed'; }
    } else {
      if (bErr) bErr.style.display = 'none';
      if (erEl) erEl.style.display = 'none';
      if (bConf) { bConf.removeAttribute('disabled'); bConf.style.opacity='1'; bConf.style.cursor='pointer'; }
    }
    var bSn = document.getElementById('imp_badge_sn');
    if (bSn) { bSn.textContent = snQt + ' c/ Série/Lote'; bSn.style.display = snQt > 0 ? '' : 'none'; }
    impTela(2);
  }

  // Clique em "Visualizar Dados"
  function impVisualizar() {
    if (!impArq) { showToast('Selecione um arquivo primeiro', 'error'); return; }
    var btn = document.getElementById('imp_btn_preview');
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';
    var ext = (impArq.name.split('.').pop() || '').toLowerCase();
    if (ext === 'csv') {
      var reader = new FileReader();
      reader.onerror = function() {
        showToast('Erro ao ler arquivo CSV', 'error');
        if (btn) btn.innerHTML = '<i class="fas fa-eye"></i> Visualizar Dados';
      };
      reader.onload = function(ev) {
        if (btn) btn.innerHTML = '<i class="fas fa-eye"></i> Visualizar Dados';
        impLinhas = impParsearCSV(ev.target.result);
        if (impLinhas.length === 0) { showToast('Nenhuma linha encontrada no arquivo', 'error'); return; }
        impRenderizarPreview(impLinhas);
      };
      reader.readAsText(impArq, 'UTF-8');
    } else {
      if (typeof XLSX === 'undefined') {
        showToast('SheetJS não carregado. Recarregue a página.', 'error');
        if (btn) btn.innerHTML = '<i class="fas fa-eye"></i> Visualizar Dados';
        return;
      }
      var rdr = new FileReader();
      rdr.onerror = function() {
        showToast('Erro ao ler arquivo Excel', 'error');
        if (btn) btn.innerHTML = '<i class="fas fa-eye"></i> Visualizar Dados';
      };
      rdr.onload = function(ev) {
        if (btn) btn.innerHTML = '<i class="fas fa-eye"></i> Visualizar Dados';
        try {
          var wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
          impLinhas = impParsearXLSX(wb);
          if (impLinhas.length === 0) { showToast('Nenhuma linha encontrada no arquivo', 'error'); return; }
          impRenderizarPreview(impLinhas);
        } catch(err) {
          showToast('Erro ao processar Excel: ' + err.message, 'error');
        }
      };
      rdr.readAsArrayBuffer(impArq);
    }
  }

  // Clique em "Confirmar Importação"
  function impConfirmar() {
    var validas = impLinhas.filter(function(r){ return r.nome && r.codigo; });
    if (validas.length === 0) { showToast('Nenhum dado válido para importar', 'error'); return; }
    impTela(3);
    var total = validas.length;
    var pLabel = document.getElementById('imp_prog_label');
    var pBar   = document.getElementById('imp_prog_bar');
    var pPct   = document.getElementById('imp_prog_pct');
    var pCount = document.getElementById('imp_prog_count');
    var pTotal = document.getElementById('imp_prog_total');
    var pSub   = document.getElementById('imp_prog_sub');
    if (pLabel) pLabel.textContent = 'Importando ' + total + ' produto(s)...';
    if (pTotal) pTotal.textContent = total;
    // Barra animada de 0% a ~88% enquanto aguarda resposta
    var sim = 0;
    var timer = setInterval(function() {
      sim = Math.min(sim + (88 - sim) * 0.1, 87);
      var p = Math.round(sim);
      if (pBar)   pBar.style.width = sim.toFixed(1) + '%';
      if (pPct)   pPct.textContent = p + '%';
      var done = Math.round((sim / 100) * total);
      if (pCount) pCount.textContent = done;
      if (pSub)   pSub.textContent = done < total ? 'Processando ' + (done+1) + ' de ' + total + '...' : 'Finalizando...';
    }, 150);
    fetch('/produtos/api/import', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ rows: validas }),
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      clearInterval(timer);
      if (pBar)   { pBar.style.width = '100%'; pBar.style.background = data.ok ? '#27AE60' : '#dc2626'; }
      if (pPct)   pPct.textContent = '100%';
      if (pCount) pCount.textContent = total;
      if (pSub)   pSub.textContent = '';
      if (data.ok) {
        if (pLabel) pLabel.innerHTML = '<i class="fas fa-check-circle" style="color:#27AE60;margin-right:6px;"></i>Importação concluída!';
        var msg = '✅ ' + (data.created||0) + ' criado(s), ' + (data.updated||0) + ' atualizado(s).';
        if (data.pendingSerial > 0) msg += ' • ' + data.pendingSerial + ' aguardando Liberação S/N.';
        setTimeout(function() {
          impFechar();
          showToast(msg, data.pendingSerial > 0 ? 'info' : 'success');
          setTimeout(function(){ location.reload(); }, 1200);
        }, 1000);
      } else {
        if (pLabel) pLabel.innerHTML = '<i class="fas fa-times-circle" style="color:#dc2626;margin-right:6px;"></i>' + (data.error || 'Erro na importação');
        var bCan = document.getElementById('imp_btn_cancel');
        if (bCan) bCan.style.display = '';
        showToast(data.error || 'Erro ao importar', 'error');
      }
    })
    .catch(function(e) {
      clearInterval(timer);
      if (pBar)   pBar.style.background = '#dc2626';
      if (pLabel) pLabel.innerHTML = '<i class="fas fa-times-circle" style="color:#dc2626;margin-right:6px;"></i>Erro de conexão';
      var bCan2 = document.getElementById('imp_btn_cancel');
      if (bCan2) bCan2.style.display = '';
      showToast('Erro de conexão: ' + e.message, 'error');
    });
  }
  // ── /Importação de planilha ───────────────────────────────────────────────  </script>
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
      stock_current: product.stockCurrent, price: product.price,
      notes: product.notes,
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
    await dbUpdate(db, 'products', id, userId, {
      name: body.name, code: body.code, unit: body.unit,
      stock_min: body.stockMin, stock_max: body.stockMax,
      stock_current: body.stockCurrent, price: body.price, notes: body.notes,
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

