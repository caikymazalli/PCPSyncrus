import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxUserId } from '../sessionHelper'
import { genId, dbInsert, dbUpdate, dbDelete, ok, err } from '../dbHelpers'

const app = new Hono()

app.get('/', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const mockData = tenant  // per-session data
  const stockItems       = (mockData as any).stockItems        || []
  const separationOrders = (mockData as any).separationOrders  || []
  const stockExits       = (mockData as any).stockExits        || []
  const products         = (mockData as any).products          || []
  const serialNumbers    = (mockData as any).serialNumbers     || []
  const kardexMovements  = (mockData as any).kardexMovements   || []

  const stockStatusInfo: Record<string, { label: string, color: string, bg: string, icon: string }> = {
    critical:          { label: 'Crítico',         color: '#dc2626', bg: '#fef2f2', icon: 'fa-exclamation-circle' },
    normal:            { label: 'Normal',           color: '#16a34a', bg: '#f0fdf4', icon: 'fa-check-circle' },
    purchase_needed:   { label: 'Nec. Compra',      color: '#d97706', bg: '#fffbeb', icon: 'fa-shopping-cart' },
    manufacture_needed:{ label: 'Nec. Manufatura',  color: '#7c3aed', bg: '#f5f3ff', icon: 'fa-industry' },
  }

  const sepStatusInfo: Record<string, { label: string, badge: string }> = {
    pending:   { label: 'Pendente',  badge: 'badge-warning' },
    completed: { label: 'Concluída', badge: 'badge-success' },
    cancelled: { label: 'Cancelada', badge: 'badge-danger' },
  }

  const exitTypeInfo: Record<string, { label: string, icon: string, color: string }> = {
    faturamento: { label: 'Faturamento',  icon: 'fa-file-invoice-dollar', color: '#27AE60' },
    requisicao:  { label: 'Requisição',   icon: 'fa-exchange-alt',        color: '#3498DB' },
    descarte:    { label: 'Descarte',     icon: 'fa-trash-alt',           color: '#E74C3C' },
  }

  const critCount = stockItems.filter((s: any) => s.status === 'critical').length
  const normalCount = stockItems.filter((s: any) => s.status === 'normal').length
  const purchaseCount = stockItems.filter((s: any) => s.status === 'purchase_needed').length

  // Merge all items (stockItems + products) for serial number lookup
  const allSerialItems = [
    ...stockItems.map((s: any) => ({ code: s.code, name: s.name, serialControlled: s.serialControlled, controlType: s.controlType })),
    ...products.map((p: any) => ({ code: p.code, name: p.name, serialControlled: p.serialControlled, controlType: p.controlType }))
  ]

  // Kardex: sort by date desc
  const sortedKardex = [...kardexMovements].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Items that have serials
  const serialItemCodes = [...new Set(serialNumbers.map((sn: any) => sn.itemCode))]

  const content = `
  <!-- Modal: Lista de Números de Série/Lote -->
  <div class="modal-overlay" id="serialListModal">
    <div class="modal" style="max-width:700px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;" id="serialListTitle">
          <i class="fas fa-barcode" style="margin-right:8px;color:#7c3aed;"></i>Lista de Números de Série/Lote
        </h3>
        <button onclick="closeModal('serialListModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:16px 24px;">
        <div id="serialListSubtitle" style="font-size:13px;color:#6c757d;margin-bottom:14px;"></div>
        <div class="table-wrapper" style="max-height:380px;overflow-y:auto;">
          <table id="serialListTable">
            <thead><tr>
              <th>Número</th><th>Tipo</th><th>Qtd</th><th>Status</th><th>Origem</th><th>OP / Ref.</th><th>Criado em</th><th>Usuário</th>
            </tr></thead>
            <tbody id="serialListBody"></tbody>
          </table>
        </div>
        <div id="serialListEmpty" style="display:none;text-align:center;padding:32px;color:#9ca3af;">
          <i class="fas fa-barcode" style="font-size:32px;margin-bottom:8px;"></i><div>Nenhum número de série/lote cadastrado para este item.</div>
        </div>
      </div>
      <div style="padding:14px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;">
        <button onclick="closeModal('serialListModal')" class="btn btn-secondary">Fechar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Detalhe Kardex -->
  <div class="modal-overlay" id="kardexDetailModal">
    <div class="modal" style="max-width:520px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;">
          <i class="fas fa-history" style="margin-right:8px;color:#2980B9;"></i>Detalhe da Movimentação
        </h3>
        <button onclick="closeModal('kardexDetailModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;" id="kardexDetailBody"></div>
      <div style="padding:14px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;">
        <button onclick="closeModal('kardexDetailModal')" class="btn btn-secondary">Fechar</button>
      </div>
    </div>
  </div>

  <!-- Header -->
  <div class="section-header">
    <div>
      <div style="font-size:14px;color:#6c757d;">Gestão de Estoque — Materiais e Produtos Acabados</div>
      <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
        ${critCount > 0 ? `<span class="badge" style="background:#fef2f2;color:#dc2626;"><i class="fas fa-exclamation-circle" style="font-size:9px;"></i> ${critCount} Crítico</span>` : ''}
        <span class="badge" style="background:#f0fdf4;color:#16a34a;"><i class="fas fa-check-circle" style="font-size:9px;"></i> ${normalCount} Normal</span>
        ${purchaseCount > 0 ? `<span class="badge" style="background:#fffbeb;color:#d97706;"><i class="fas fa-shopping-cart" style="font-size:9px;"></i> ${purchaseCount} Nec. Compra</span>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-secondary" onclick="openModal('uploadPlanilhaModal')" title="Importar estoque via planilha Excel/CSV">
        <i class="fas fa-file-upload"></i> Import. Planilha
      </button>
      <button class="btn btn-secondary" onclick="alert('Exportando relatório de estoque...')" title="Exportar relatório">
        <i class="fas fa-download"></i> Exportar
      </button>
      <button class="btn btn-primary" onclick="openModal('novoItemModal')" title="Adicionar novo item de estoque">
        <i class="fas fa-plus"></i> Novo Item
      </button>
    </div>
  </div>

  <!-- Tabs -->
  <div data-tab-group="estoque">
    <div class="tab-nav">
      <button class="tab-btn active" onclick="switchTab('tabEstoqueGeral','estoque')"><i class="fas fa-warehouse" style="margin-right:6px;"></i>Estoque Geral</button>
      <button class="tab-btn" onclick="switchTab('tabProdutosAcabados','estoque')"><i class="fas fa-box-open" style="margin-right:6px;"></i>Produtos Acabados</button>
      <button class="tab-btn" onclick="switchTab('tabSeparacao','estoque')"><i class="fas fa-dolly" style="margin-right:6px;"></i>Separação
        <span style="background:#E67E22;color:white;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px;margin-left:4px;">${separationOrders.filter((s: any) => s.status === 'pending').length}</span>
      </button>
      <button class="tab-btn" onclick="switchTab('tabBaixas','estoque')"><i class="fas fa-minus-circle" style="margin-right:6px;"></i>Baixas</button>
      <button class="tab-btn" onclick="switchTab('tabKardex','estoque')"><i class="fas fa-history" style="margin-right:6px;"></i>Kardex
        <span style="background:#2980B9;color:white;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px;margin-left:4px;">${kardexMovements.length}</span>
      </button>
      <button class="tab-btn" onclick="switchTab('tabAlmoxarifados','estoque')"><i class="fas fa-warehouse" style="margin-right:6px;"></i>Almoxarifados</button>
      <button class="tab-btn" onclick="switchTab('tabTransferencias','estoque')"><i class="fas fa-exchange-alt" style="margin-right:6px;"></i>Transferências
        <span style="background:#7c3aed;color:white;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px;margin-left:4px;">2</span>
      </button>
    </div>

    <!-- ESTOQUE GERAL TAB -->
    <div class="tab-content active" id="tabEstoqueGeral">
      <!-- KPIs -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
        <div class="kpi-card">
          <div style="font-size:24px;font-weight:800;color:#1B4F72;">${stockItems.length}</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;">Total de Itens</div>
        </div>
        <div class="kpi-card" style="border-left:3px solid #dc2626;">
          <div style="font-size:24px;font-weight:800;color:#dc2626;">${critCount}</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;"><i class="fas fa-exclamation-circle" style="color:#dc2626;"></i> Críticos</div>
        </div>
        <div class="kpi-card" style="border-left:3px solid #d97706;">
          <div style="font-size:24px;font-weight:800;color:#d97706;">${purchaseCount}</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;"><i class="fas fa-shopping-cart" style="color:#d97706;"></i> Nec. Compra</div>
        </div>
        <div class="kpi-card" style="border-left:3px solid #16a34a;">
          <div style="font-size:24px;font-weight:800;color:#16a34a;">${normalCount}</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;"><i class="fas fa-check-circle" style="color:#16a34a;"></i> Normais</div>
        </div>
      </div>

      <!-- Search -->
      <div class="card" style="padding:12px 16px;margin-bottom:14px;">
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <div class="search-box" style="flex:1;min-width:180px;">
            <i class="fas fa-search icon"></i>
            <input class="form-control" type="text" id="estoqueSearch" placeholder="Código, nome, localização..." oninput="filterEstoque()">
          </div>
          <select class="form-control" id="estoqueStatusFilter" style="width:auto;" onchange="filterEstoque()">
            <option value="">Todos os status</option>
            <option value="critical">Crítico</option>
            <option value="normal">Normal</option>
            <option value="purchase_needed">Nec. Compra</option>
          </select>
          <select class="form-control" style="width:auto;">
            <option>Todas as categorias</option>
            <option>Matéria-Prima</option>
            <option>Componente</option>
            <option>Fixador</option>
          </select>
        </div>
      </div>

      <div class="card" style="overflow:hidden;">
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Código</th><th>Item</th><th>Categoria</th><th>Qtd Atual</th><th>Qtd Mínima</th><th>% Cobertura</th><th>Localização</th><th>Última Atualiz.</th><th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody id="estoqueBody">
              ${stockItems.map((s: any) => {
                const si = stockStatusInfo[s.status] || stockStatusInfo.normal
                const pct = s.minQuantity > 0 ? Math.min(100, Math.round((s.quantity / s.minQuantity) * 100)) : 100
                const hasSerial = s.serialControlled === true
                const snCount = serialNumbers.filter((sn: any) => sn.itemCode === s.code).length
                return `
                <tr data-status="${s.status}" data-search="${s.code.toLowerCase()} ${s.name.toLowerCase()} ${s.location.toLowerCase()}">
                  <td>
                    <div style="display:flex;align-items:center;gap:6px;">
                      <span style="font-family:monospace;font-size:11px;background:#e8f4fd;padding:2px 8px;border-radius:4px;color:#1B4F72;font-weight:700;">${s.code}</span>
                      ${hasSerial ? `<span class="badge" style="background:${s.controlType==='serie'?'#ede9fe':'#fef3c7'};color:${s.controlType==='serie'?'#7c3aed':'#d97706'};font-size:9px;padding:2px 5px;">
                        <i class="fas ${s.controlType==='serie'?'fa-barcode':'fa-layer-group'}" style="font-size:8px;"></i> ${s.controlType==='serie'?'S/N':'Lote'}
                      </span>` : ''}
                    </div>
                  </td>
                  <td>
                    <div style="font-weight:600;color:#374151;">${s.name}</div>
                    <div style="font-size:11px;color:#9ca3af;">${s.unit}</div>
                  </td>
                  <td><span class="chip" style="background:#f1f5f9;color:#374151;">${s.category}</span></td>
                  <td style="font-weight:700;color:${si.color};">${s.quantity.toLocaleString('pt-BR')}</td>
                  <td style="color:#6c757d;">${s.minQuantity.toLocaleString('pt-BR')}</td>
                  <td style="min-width:100px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                      <div class="progress-bar" style="flex:1;height:6px;">
                        <div class="progress-fill" style="width:${pct}%;background:${si.color};"></div>
                      </div>
                      <span style="font-size:11px;font-weight:700;color:${si.color};width:36px;text-align:right;">${pct}%</span>
                    </div>
                  </td>
                  <td style="font-size:12px;color:#6c757d;">${s.location}</td>
                  <td style="font-size:12px;color:#9ca3af;">${new Date(s.lastUpdate + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                  <td><span class="badge" style="background:${si.bg};color:${si.color};"><i class="fas ${si.icon}" style="font-size:9px;"></i> ${si.label}</span></td>
                  <td>
                    <div style="display:flex;gap:4px;">
                      ${hasSerial ? `<div class="tooltip-wrap" data-tooltip="Ver lista de Nº de Série/Lote (${snCount})">
                        <button class="btn btn-sm" style="background:#ede9fe;color:#7c3aed;border:1px solid #c4b5fd;" onclick="openSerialList('${s.code}','${s.name}','${s.controlType||'serie'}')">
                          <i class="fas ${s.controlType==='lote'?'fa-layer-group':'fa-barcode'}"></i> ${snCount}
                        </button>
                      </div>` : ''}
                      <div class="tooltip-wrap" data-tooltip="Ajustar quantidade"><button class="btn btn-secondary btn-sm" onclick="openModal('ajusteModal')"><i class="fas fa-edit"></i></button></div>
                      <div class="tooltip-wrap" data-tooltip="Registrar baixa"><button class="btn btn-warning btn-sm" onclick="openBaixaModal('${s.code}','${s.name}')"><i class="fas fa-minus"></i></button></div>
                      <div class="tooltip-wrap" data-tooltip="Ver Kardex deste item"><button class="btn btn-secondary btn-sm" onclick="filterKardexByItem('${s.code}','${s.name}')"><i class="fas fa-history"></i></button></div>
                    </div>
                  </td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- PRODUTOS ACABADOS TAB -->
    <div class="tab-content" id="tabProdutosAcabados">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">
        ${products.map((p: any) => {
          const si = stockStatusInfo[p.stockStatus] || stockStatusInfo.normal
          const pct = p.stockMin > 0 ? Math.min(100, Math.round((p.stockCurrent / p.stockMin) * 100)) : 100
          const hasSerial = p.serialControlled === true
          const snCount = serialNumbers.filter((sn: any) => sn.itemCode === p.code).length
          return `
          <div class="card" style="padding:16px;border-top:3px solid ${si.color};">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
              <div style="flex:1;padding-right:8px;">
                <div style="font-size:14px;font-weight:700;color:#1B4F72;">${p.name}</div>
                <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap;">
                  <span style="font-family:monospace;font-size:11px;color:#9ca3af;">${p.code}</span>
                  ${hasSerial ? `<span class="badge" style="background:${p.controlType==='serie'?'#ede9fe':'#fef3c7'};color:${p.controlType==='serie'?'#7c3aed':'#d97706'};font-size:9px;">
                    <i class="fas ${p.controlType==='serie'?'fa-barcode':'fa-layer-group'}" style="font-size:8px;"></i> ${p.controlType==='serie'?'Série':'Lote'}
                  </span>` : ''}
                </div>
              </div>
              <span class="badge" style="background:${si.bg};color:${si.color};white-space:nowrap;">
                <i class="fas ${si.icon}" style="font-size:9px;"></i> ${si.label}
              </span>
            </div>
            <div style="background:#f8f9fa;border-radius:8px;padding:10px;margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <span style="font-size:11px;color:#6c757d;">Estoque Atual</span>
                <span style="font-size:11px;color:#6c757d;">Mínimo: ${p.stockMin} ${p.unit}</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <div class="progress-bar" style="flex:1;height:6px;">
                  <div class="progress-fill" style="width:${pct}%;background:${si.color};"></div>
                </div>
                <span style="font-size:16px;font-weight:800;color:${si.color};">${p.stockCurrent} <span style="font-size:10px;font-weight:400;color:#9ca3af;">${p.unit}</span></span>
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="btn btn-success btn-sm" style="flex:1;" onclick="openSeparacaoModal('${p.code}','${p.name}','${p.unit}')" title="Criar ordem de separação">
                <i class="fas fa-dolly"></i> Separar
              </button>
              ${hasSerial ? `<div class="tooltip-wrap" data-tooltip="Ver lista de Série/Lote (${snCount})"><button class="btn btn-sm" style="background:#ede9fe;color:#7c3aed;border:1px solid #c4b5fd;" onclick="openSerialList('${p.code}','${p.name}','${p.controlType||'serie'}')"><i class="fas fa-barcode"></i> ${snCount}</button></div>` : ''}
              <div class="tooltip-wrap" data-tooltip="Registrar baixa"><button class="btn btn-warning btn-sm" onclick="openBaixaModal('${p.code}','${p.name}')"><i class="fas fa-minus"></i></button></div>
            </div>
          </div>`
        }).join('')}
      </div>
    </div>

    <!-- SEPARAÇÃO TAB -->
    <div class="tab-content" id="tabSeparacao">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
        <div style="font-size:14px;color:#6c757d;">Ordens de separação de produtos acabados</div>
        <button class="btn btn-primary" onclick="openModal('novaSeparacaoModal')" title="Nova ordem de separação">
          <i class="fas fa-plus"></i> Nova Separação
        </button>
      </div>

      <div class="card" style="overflow:hidden;">
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Código OS</th><th>Pedido Venda</th><th>Cliente</th><th>Produtos</th><th>Nº Série/Lote</th><th>Data Sep.</th><th>Responsável</th><th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${separationOrders.map((so: any) => {
                const si = sepStatusInfo[so.status]
                return `
                <tr>
                  <td style="font-weight:700;color:#1B4F72;">${so.code}</td>
                  <td>
                    <div style="font-size:12px;font-weight:600;color:#2980B9;">${so.pedido}</div>
                  </td>
                  <td style="font-size:12px;color:#374151;">${so.cliente}</td>
                  <td>
                    ${so.items.map((it: any) => `
                    <div style="font-size:12px;"><span style="font-family:monospace;font-size:10px;background:#e8f4fd;padding:1px 5px;border-radius:3px;color:#1B4F72;">${it.productCode}</span> ${it.productName} <strong style="color:#374151;">(${it.quantity} un)</strong></div>`).join('')}
                  </td>
                  <td>
                    ${so.items.map((it: any) => `<div style="font-family:monospace;font-size:11px;color:#7c3aed;font-weight:600;">${it.serialNumber || '—'}</div>`).join('')}
                  </td>
                  <td style="font-size:12px;color:#6c757d;">${new Date(so.dataSeparacao + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                  <td style="font-size:12px;color:#6c757d;">${so.responsavel}</td>
                  <td><span class="badge ${si.badge}">${si.label}</span></td>
                  <td>
                    <div style="display:flex;gap:4px;">
                      <div class="tooltip-wrap" data-tooltip="Ver detalhes"><button class="btn btn-secondary btn-sm" onclick="alert('Detalhes da OS: ${so.code}')"><i class="fas fa-eye"></i></button></div>
                      ${so.status === 'pending' ? `
                      <div class="tooltip-wrap" data-tooltip="Confirmar separação"><button class="btn btn-success btn-sm" onclick="alert('Separação ${so.code} confirmada!')"><i class="fas fa-check"></i></button></div>
                      <div class="tooltip-wrap" data-tooltip="Cancelar separação"><button class="btn btn-danger btn-sm" onclick="alert('Cancelar ${so.code}?')"><i class="fas fa-times"></i></button></div>` : ''}
                      <div class="tooltip-wrap" data-tooltip="Imprimir romaneio"><button class="btn btn-secondary btn-sm" onclick="alert('Imprimindo romaneio...')"><i class="fas fa-print"></i></button></div>
                    </div>
                  </td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- BAIXAS TAB -->
    <div class="tab-content" id="tabBaixas">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
        <div style="font-size:14px;color:#6c757d;">Registro de baixas de itens do estoque</div>
        <button class="btn btn-primary" onclick="openModal('novaBaixaModal')" title="Registrar nova baixa">
          <i class="fas fa-minus-circle"></i> Nova Baixa
        </button>
      </div>

      <div class="card" style="overflow:hidden;">
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Código</th><th>Tipo</th><th>Pedido/Ref.</th><th>Itens</th><th>Data</th><th>Responsável</th><th>Observações</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${stockExits.map((ex: any) => {
                const ti = exitTypeInfo[ex.type] || exitTypeInfo.requisicao
                return `
                <tr>
                  <td style="font-weight:700;color:#1B4F72;">${ex.code}</td>
                  <td>
                    <span class="badge" style="background:${ti.color}18;color:${ti.color};">
                      <i class="fas ${ti.icon}" style="font-size:9px;"></i> ${ti.label}
                    </span>
                  </td>
                  <td>
                    <div style="font-size:12px;font-weight:600;color:#2980B9;">${ex.pedido}</div>
                  </td>
                  <td>
                    ${ex.items.map((it: any) => `<div style="font-size:12px;"><span style="font-family:monospace;font-size:10px;background:#e8f4fd;padding:1px 5px;border-radius:3px;">${it.code}</span> ${it.name} <strong>(${it.quantity})</strong></div>`).join('')}
                  </td>
                  <td style="font-size:12px;color:#6c757d;">${new Date(ex.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                  <td style="font-size:12px;color:#6c757d;">${ex.responsavel}</td>
                  <td style="font-size:12px;color:#6c757d;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${ex.notes}">${ex.notes}</td>
                  <td>
                    <div class="tooltip-wrap" data-tooltip="Ver comprovante"><button class="btn btn-secondary btn-sm" onclick="alert('Comprovante da baixa ${ex.code}')"><i class="fas fa-eye"></i></button></div>
                  </td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- KARDEX TAB -->
    <div class="tab-content" id="tabKardex">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-history" style="margin-right:8px;color:#2980B9;"></i>Kardex — Rastreabilidade de Série/Lote</div>
          <div style="font-size:13px;color:#6c757d;margin-top:3px;">Registro completo de todas as movimentações por número de série ou lote</div>
        </div>
      </div>

      <!-- KPIs Kardex -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
        <div class="kpi-card">
          <div style="font-size:24px;font-weight:800;color:#2980B9;">${kardexMovements.length}</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;">Total Movimentações</div>
        </div>
        <div class="kpi-card" style="border-left:3px solid #27AE60;">
          <div style="font-size:24px;font-weight:800;color:#27AE60;">${kardexMovements.filter((k: any) => k.movType === 'entrada').length}</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;"><i class="fas fa-arrow-down" style="color:#27AE60;"></i> Entradas</div>
        </div>
        <div class="kpi-card" style="border-left:3px solid #E74C3C;">
          <div style="font-size:24px;font-weight:800;color:#E74C3C;">${kardexMovements.filter((k: any) => k.movType === 'saida').length}</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;"><i class="fas fa-arrow-up" style="color:#E74C3C;"></i> Saídas</div>
        </div>
        <div class="kpi-card" style="border-left:3px solid #7c3aed;">
          <div style="font-size:24px;font-weight:800;color:#7c3aed;">${serialItemCodes.length}</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;"><i class="fas fa-barcode" style="color:#7c3aed;"></i> Itens Rastreados</div>
        </div>
      </div>

      <!-- Filtros Kardex -->
      <div class="card" style="padding:12px 16px;margin-bottom:14px;">
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <div class="search-box" style="flex:1;min-width:180px;">
            <i class="fas fa-search icon"></i>
            <input class="form-control" type="text" id="kardexSearch" placeholder="Nº de série, código do item, pedido..." oninput="filterKardex()">
          </div>
          <select class="form-control" id="kardexTypeFilter" style="width:auto;" onchange="filterKardex()">
            <option value="">Todos os tipos</option>
            <option value="entrada">Entradas</option>
            <option value="saida">Saídas</option>
          </select>
          <select class="form-control" id="kardexItemFilter" style="width:auto;" onchange="filterKardex()">
            <option value="">Todos os itens</option>
            ${[...new Set([...stockItems, ...products].map((i: any) => i.code))].map((code: any) => {
              const item = [...stockItems, ...products].find((i: any) => i.code === code)
              return `<option value="${code}">${code} — ${item?.name||''}</option>`
            }).join('')}
          </select>
          <button class="btn btn-secondary btn-sm" onclick="clearKardexFilters()">
            <i class="fas fa-times"></i> Limpar
          </button>
        </div>
      </div>

      <!-- Tabela Kardex -->
      <div class="card" id="kardexFilterBanner" style="display:none;padding:10px 16px;margin-bottom:10px;background:#e8f4fd;border-left:4px solid #2980B9;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:13px;color:#1B4F72;"><i class="fas fa-filter" style="margin-right:6px;"></i>Filtrando por item: <strong id="kardexFilterLabel"></strong></span>
          <button class="btn btn-secondary btn-sm" onclick="clearKardexFilters()"><i class="fas fa-times"></i> Remover filtro</button>
        </div>
      </div>

      <div class="card" style="overflow:hidden;">
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Data/Hora</th><th>Nº Série / Lote</th><th>Item</th><th>Tipo</th><th>Qtd</th><th>Descrição</th><th>OP / Referência</th><th>Pedido</th><th>NF</th><th>Usuário</th><th>Ações</th>
            </tr></thead>
            <tbody id="kardexBody">
              ${sortedKardex.map((k: any) => {
                const isEntrada = k.movType === 'entrada'
                const dt = new Date(k.date)
                const dtStr = dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                return `
                <tr data-movtype="${k.movType}" data-itemcode="${k.itemCode}" data-search="${k.serialNumber.toLowerCase()} ${k.itemCode.toLowerCase()} ${(k.pedido||'').toLowerCase()} ${(k.orderCode||'').toLowerCase()}">
                  <td style="font-size:12px;color:#6c757d;white-space:nowrap;">${dtStr}</td>
                  <td>
                    <span style="font-family:monospace;font-size:12px;font-weight:700;color:#7c3aed;background:#f5f3ff;padding:2px 8px;border-radius:4px;">${k.serialNumber}</span>
                  </td>
                  <td>
                    <div style="font-size:12px;font-weight:600;color:#374151;">${k.itemName}</div>
                    <div style="font-family:monospace;font-size:10px;color:#9ca3af;">${k.itemCode}</div>
                  </td>
                  <td>
                    <span class="badge" style="background:${isEntrada?'#f0fdf4':'#fef2f2'};color:${isEntrada?'#16a34a':'#dc2626'};">
                      <i class="fas ${isEntrada?'fa-arrow-down':'fa-arrow-up'}" style="font-size:9px;"></i> ${isEntrada?'Entrada':'Saída'}
                    </span>
                  </td>
                  <td style="font-weight:700;color:${isEntrada?'#16a34a':'#dc2626'};">${isEntrada?'+':'−'}${k.quantity}</td>
                  <td style="font-size:12px;color:#374151;max-width:160px;">${k.description}</td>
                  <td style="font-size:12px;">
                    ${k.orderCode ? `<span style="font-family:monospace;font-size:11px;background:#e8f4fd;padding:1px 6px;border-radius:3px;color:#1B4F72;">${k.orderCode}</span>` : '<span style="color:#9ca3af;">—</span>'}
                  </td>
                  <td style="font-size:12px;">
                    ${k.pedido ? `<span style="font-weight:600;color:#2980B9;">${k.pedido}</span>` : '<span style="color:#9ca3af;">—</span>'}
                  </td>
                  <td style="font-size:12px;">
                    ${k.nf ? `<span style="font-weight:600;color:#27AE60;">${k.nf}</span>` : '<span style="color:#9ca3af;">—</span>'}
                  </td>
                  <td style="font-size:12px;color:#6c757d;">${k.user}</td>
                  <td>
                    <div class="tooltip-wrap" data-tooltip="Ver detalhes da movimentação">
                      <button class="btn btn-secondary btn-sm" onclick="openKardexDetail(${JSON.stringify(JSON.stringify(k)).replace(/</g,'\\u003c')})">
                        <i class="fas fa-eye"></i>
                      </button>
                    </div>
                  </td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ALMOXARIFADOS TAB -->
    <div class="tab-content" id="tabAlmoxarifados">
      <!-- KPIs Almoxarifados -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
        <div class="kpi-card" style="border-left:3px solid #1B4F72;">
          <div style="font-size:24px;font-weight:800;color:#1B4F72;">3</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;"><i class="fas fa-warehouse" style="color:#1B4F72;"></i> Almoxarifados</div>
        </div>
        <div class="kpi-card" style="border-left:3px solid #27AE60;">
          <div style="font-size:24px;font-weight:800;color:#27AE60;">2</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;"><i class="fas fa-check-circle" style="color:#27AE60;"></i> Ativos</div>
        </div>
        <div class="kpi-card" style="border-left:3px solid #E67E22;">
          <div style="font-size:24px;font-weight:800;color:#E67E22;">1</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;"><i class="fas fa-tools" style="color:#E67E22;"></i> Em Manutenção</div>
        </div>
        <div class="kpi-card" style="border-left:3px solid #7c3aed;">
          <div style="font-size:24px;font-weight:800;color:#7c3aed;">R$ 0,00</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;"><i class="fas fa-box" style="color:#7c3aed;"></i> Valor Total em Estoque</div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
        <button class="btn btn-primary" onclick="openModal('novoAlmoxarifadoModal')"><i class="fas fa-plus"></i> Novo Almoxarifado</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;">
        ${[
          { id: 'alm1', name: 'Almoxarifado Principal', code: 'ALM-001', empresa: userInfo.empresa, city: '', state: '', responsavel: userInfo.nome, custodio: userInfo.nome, items: stockItems ? stockItems.length : 0, status: 'ativo', color: '#27AE60' },
        ].map(alm => `
        <div class="card" style="padding:0;overflow:hidden;border-left:4px solid ${alm.color};">
          <div style="padding:16px 20px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:44px;height:44px;border-radius:10px;background:${alm.status==='ativo'?'#f0fdf4':'#fffbeb'};display:flex;align-items:center;justify-content:center;">
                  <i class="fas fa-warehouse" style="color:${alm.color};font-size:18px;"></i>
                </div>
                <div>
                  <div style="font-size:14px;font-weight:800;color:#1B4F72;">${alm.name}</div>
                  <div style="font-size:11px;color:#9ca3af;">${alm.code} · ${alm.city}/${alm.state}</div>
                </div>
              </div>
              <span class="badge" style="background:${alm.status==='ativo'?'#f0fdf4':'#fffbeb'};color:${alm.color};">${alm.status==='ativo'?'Ativo':'Manutenção'}</span>
            </div>
            <div style="font-size:12px;color:#6c757d;margin-bottom:10px;"><i class="fas fa-building" style="margin-right:4px;"></i>${alm.empresa}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
              <div style="background:#f8f9fa;border-radius:8px;padding:8px;">
                <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:700;">Responsável</div>
                <div style="font-size:12px;font-weight:600;color:#374151;margin-top:2px;">${alm.responsavel}</div>
              </div>
              <div style="background:#f8f9fa;border-radius:8px;padding:8px;">
                <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:700;">Custodiante</div>
                <div style="font-size:12px;font-weight:600;color:#374151;margin-top:2px;">${alm.custodio}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:13px;font-weight:700;color:#1B4F72;"><i class="fas fa-boxes" style="margin-right:6px;"></i>${alm.items} itens</span>
              <div style="display:flex;gap:6px;">
                <button class="btn btn-secondary btn-sm" onclick="alert('Ver estoque de ${alm.name}')"><i class="fas fa-eye"></i> Estoque</button>
                <button class="btn btn-secondary btn-sm" onclick="openModal('editAlmoxarifadoModal')"><i class="fas fa-edit"></i></button>
              </div>
            </div>
          </div>
        </div>`).join('')}
      </div>
    </div>

    <!-- TRANSFERÊNCIAS TAB -->
    <div class="tab-content" id="tabTransferencias">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:14px;font-weight:700;color:#1B4F72;">Transferências entre Almoxarifados / Filiais</div>
          <div style="font-size:12px;color:#6c757d;margin-top:2px;">Movimentações internas de materiais entre unidades do grupo</div>
        </div>
        <button class="btn btn-primary" onclick="openModal('novaTransferenciaModal')"><i class="fas fa-exchange-alt"></i> Nova Transferência</button>
      </div>

      <!-- KPIs Transferências -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px;">
        <div class="kpi-card" style="border-left:3px solid #E67E22;">
          <div style="font-size:24px;font-weight:800;color:#E67E22;">2</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;">Pendentes</div>
        </div>
        <div class="kpi-card" style="border-left:3px solid #2980B9;">
          <div style="font-size:24px;font-weight:800;color:#2980B9;">1</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;">Em Trânsito</div>
        </div>
        <div class="kpi-card" style="border-left:3px solid #27AE60;">
          <div style="font-size:24px;font-weight:800;color:#27AE60;">5</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;">Concluídas</div>
        </div>
      </div>

      <div class="card" style="overflow:hidden;">
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Nº Transfer.</th><th>Item</th><th>Qtd</th><th>Origem</th><th>Destino</th><th>Solicitante</th><th>Separador</th><th>Custodiante</th><th>Data</th><th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${[
                // Transferências serão geradas dinamicamente quando houver filiais cadastradas
              ].map(t => `
              <tr>
                <td><span style="font-family:monospace;font-size:11px;background:#e8f4fd;padding:2px 8px;border-radius:4px;color:#1B4F72;font-weight:700;">${t.id}</span></td>
                <td>
                  <div style="font-weight:600;font-size:13px;color:#374151;">${t.item}</div>
                  <div style="font-size:11px;color:#9ca3af;font-family:monospace;">${t.code}</div>
                </td>
                <td style="font-weight:700;color:#1B4F72;">${t.qty.toLocaleString('pt-BR')} ${t.unit}</td>
                <td style="font-size:12px;"><i class="fas fa-arrow-right" style="color:#6c757d;margin-right:4px;"></i>${t.origem}</td>
                <td style="font-size:12px;"><i class="fas fa-map-marker-alt" style="color:#27AE60;margin-right:4px;"></i>${t.destino}</td>
                <td style="font-size:12px;color:#374151;"><i class="fas fa-user" style="color:#9ca3af;margin-right:4px;"></i>${t.solicitante}</td>
                <td style="font-size:12px;color:#374151;"><i class="fas fa-user-cog" style="color:#9ca3af;margin-right:4px;"></i>${t.separador}</td>
                <td style="font-size:12px;color:#374151;"><i class="fas fa-shield-alt" style="color:#9ca3af;margin-right:4px;"></i>${t.custodio}</td>
                <td style="font-size:12px;color:#9ca3af;">${new Date(t.date+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td><span class="badge" style="background:${t.sb};color:${t.sc};">${t.status==='pendente'?'Pendente':t.status==='em_transito'?'Em Trânsito':'Concluída'}</span></td>
                <td>
                  <div style="display:flex;gap:4px;">
                    <button class="btn btn-secondary btn-sm" onclick="openTransfDetail('${t.id}')"><i class="fas fa-eye"></i></button>
                    ${t.status==='pendente'?`<button class="btn btn-success btn-sm" onclick="alert('Transferência ${t.id} confirmada!')"><i class="fas fa-check"></i></button>`:''}
                  </div>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

  </div>

  <!-- Modal: Novo Almoxarifado -->
  <div class="modal-overlay" id="novoAlmoxarifadoModal">
    <div class="modal" style="max-width:560px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-warehouse" style="margin-right:8px;"></i>Novo Almoxarifado</h3>
        <button onclick="closeModal('novoAlmoxarifadoModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Nome do Almoxarifado *</label><input class="form-control" type="text" placeholder="Ex: Almoxarifado Filial Sul"></div>
          <div class="form-group"><label class="form-label">Código *</label><input class="form-control" type="text" placeholder="Ex: ALM-004"></div>
          <div class="form-group"><label class="form-label">Empresa / Filial *</label>
            <select class="form-control">
              <option>${userInfo.empresa}</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Cidade</label><input class="form-control" type="text" placeholder="Ex: Curitiba"></div>
          <div class="form-group"><label class="form-label">Estado</label><input class="form-control" type="text" placeholder="Ex: PR"></div>
          <div class="form-group"><label class="form-label">Responsável *</label>
            <select class="form-control">
              ${mockData.users.map((u: any) => `<option>${u.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Custodiante *</label>
            <select class="form-control">
              ${mockData.users.map((u: any) => `<option>${u.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Observações</label><textarea class="form-control" rows="2" placeholder="Instruções especiais, localização física, etc."></textarea></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novoAlmoxarifadoModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('✅ Almoxarifado criado com sucesso!');closeModal('novoAlmoxarifadoModal')" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Nova Transferência -->
  <div class="modal-overlay" id="novaTransferenciaModal">
    <div class="modal" style="max-width:620px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-exchange-alt" style="margin-right:8px;"></i>Nova Transferência entre Almoxarifados</h3>
        <button onclick="closeModal('novaTransferenciaModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="form-group"><label class="form-label">Almoxarifado Origem *</label>
            <select class="form-control">
              <option value="">Selecionar...</option>
              <option value="alm1">ALM-001 — Almoxarifado Central (Alpha)</option>
              <option value="alm2">ALM-002 — Almoxarifado Nordeste</option>
              <option value="alm3">ALM-003 — Almoxarifado Sul</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Almoxarifado Destino *</label>
            <select class="form-control">
              <option value="">Selecionar...</option>
              <option value="alm1">ALM-001 — Almoxarifado Central (Alpha)</option>
              <option value="alm2">ALM-002 — Almoxarifado Nordeste</option>
              <option value="alm3">ALM-003 — Almoxarifado Sul</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Solicitante *</label>
            <select class="form-control" id="trfSolicitante">
              ${mockData.users.map((u: any) => `<option>${u.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Separador *</label>
            <select class="form-control" id="trfSeparador">
              ${mockData.users.map((u: any) => `<option>${u.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Custodiante (Destino) *</label>
            <select class="form-control" id="trfCustodio">
              ${mockData.users.map((u: any) => `<option>${u.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Data Prevista</label>
            <input class="form-control" type="date" value="2024-02-15">
          </div>
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Observações</label><input class="form-control" type="text" placeholder="Motivo da transferência, urgência, etc."></div>
        </div>

        <!-- Itens a transferir -->
        <div style="border-top:1px solid #f1f3f5;padding-top:16px;margin-top:4px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <label class="form-label" style="margin:0;font-size:14px;font-weight:700;">Itens a Transferir *</label>
            <button class="btn btn-secondary btn-sm" onclick="addTrfItem()"><i class="fas fa-plus"></i> Adicionar Item</button>
          </div>
          <div id="trfItemsList">
            <div class="trf-item" style="display:grid;grid-template-columns:3fr 1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:center;">
              <select class="form-control" style="font-size:12px;">
                <option value="">Selecionar item...</option>
                ${mockData.stockItems.map((s: any) => `<option value="${s.code}">${s.name} (${s.code}) — Qtd: ${s.quantity} ${s.unit}</option>`).join('')}
              </select>
              <input class="form-control" type="number" placeholder="Qtd" min="1">
              <input class="form-control" type="text" placeholder="Nº Série / Lote">
              <button class="btn btn-danger btn-sm" onclick="this.closest('.trf-item').remove()"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaTransferenciaModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="saveTransferencia()" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Solicitar Transferência</button>
      </div>
    </div>
  </div>

  <!-- Modal: Editar Almoxarifado -->
  <div class="modal-overlay" id="editAlmoxarifadoModal">
    <div class="modal" style="max-width:480px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-edit" style="margin-right:8px;"></i>Editar Almoxarifado</h3>
        <button onclick="closeModal('editAlmoxarifadoModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div class="form-group"><label class="form-label">Nome</label><input class="form-control" type="text" value="Almoxarifado Central"></div>
        <div class="form-group"><label class="form-label">Responsável</label>
          <select class="form-control">${mockData.users.map((u: any) => `<option>${u.name}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">Custodiante</label>
          <select class="form-control">${mockData.users.map((u: any) => `<option>${u.name}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">Status</label>
          <select class="form-control"><option>Ativo</option><option>Manutenção</option><option>Inativo</option></select>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('editAlmoxarifadoModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('✅ Almoxarifado atualizado!');closeModal('editAlmoxarifadoModal')" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <!-- Upload Planilha Modal -->
  <div class="modal-overlay" id="uploadPlanilhaModal">
    <div class="modal" style="max-width:580px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-file-upload" style="margin-right:8px;"></i>Importar Planilha de Estoque</h3>
        <button onclick="closeModal('uploadPlanilhaModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div style="background:#e8f4fd;border-radius:8px;padding:14px;margin-bottom:20px;">
          <div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:8px;"><i class="fas fa-info-circle" style="margin-right:6px;"></i>Formato da Planilha Padrão</div>
          <div style="font-size:12px;color:#374151;line-height:1.6;">A planilha deve ter as colunas na seguinte ordem:<br>
            <code style="background:#fff;padding:2px 6px;border-radius:4px;font-size:11px;">Código | Nome | Categoria | Unidade | Qtd Atual | Qtd Mínima | Localização | Nº Série/Lote (opcional)</code>
          </div>
          <div style="font-size:11px;color:#374151;margin-top:8px;background:#fff;border-radius:6px;padding:8px;border-left:3px solid #7c3aed;">
            <i class="fas fa-barcode" style="color:#7c3aed;margin-right:4px;"></i>
            <strong>Itens com controle de série/lote:</strong> Inclua uma linha por série ou uma linha por lote com a respectiva quantidade. As quantidades do mesmo código serão somadas automaticamente.
          </div>
          <button class="btn btn-secondary btn-sm" style="margin-top:10px;" onclick="alert('Download do modelo...')">
            <i class="fas fa-download"></i> Baixar Planilha Modelo (.xlsx)
          </button>
        </div>

        <div class="form-group">
          <label class="form-label">Tipo de Importação</label>
          <select class="form-control" id="importType">
            <option value="update">Atualizar existentes + Incluir novos</option>
            <option value="replace">Substituir estoque completamente</option>
            <option value="new_only">Apenas incluir novos itens</option>
          </select>
        </div>

        <div id="uploadArea" style="border:2px dashed #d1d5db;border-radius:10px;padding:32px;text-align:center;cursor:pointer;transition:all 0.2s;margin-bottom:16px;"
             onclick="document.getElementById('planilhaFile').click()"
             ondragover="event.preventDefault();this.style.borderColor='#2980B9';this.style.background='#f0f7ff';"
             ondragleave="this.style.borderColor='#d1d5db';this.style.background='white';"
             ondrop="handlePlanilhaDrop(event)">
          <i class="fas fa-cloud-upload-alt" style="font-size:40px;color:#9ca3af;margin-bottom:10px;"></i>
          <div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:4px;">Clique ou arraste sua planilha aqui</div>
          <div style="font-size:12px;color:#9ca3af;">Suporta .xlsx, .xls e .csv • Máx. 10MB</div>
          <input type="file" id="planilhaFile" accept=".xlsx,.xls,.csv" style="display:none;" onchange="handlePlanilhaSelect(event)">
        </div>

        <div id="fileSelectedInfo" style="display:none;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <i class="fas fa-file-excel" style="color:#16a34a;font-size:20px;"></i>
            <div>
              <div id="fileName" style="font-size:13px;font-weight:700;color:#374151;"></div>
              <div style="font-size:11px;color:#6c757d;">Pronto para importação</div>
            </div>
          </div>
        </div>

        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;">
          <div style="font-size:12px;color:#92400e;"><i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>
          <strong>Atenção:</strong> Após a importação, o estoque será atualizado automaticamente no MRP. Para itens controlados por série/lote, cada linha da planilha gerará um registro no Kardex.</div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('uploadPlanilhaModal')" class="btn btn-secondary">Cancelar</button>
        <button id="importBtn" onclick="importarPlanilha()" class="btn btn-primary" disabled style="opacity:0.5;">
          <i class="fas fa-upload"></i> Importar
        </button>
      </div>
    </div>
  </div>

  <!-- Nova Separação Modal -->
  <div class="modal-overlay" id="novaSeparacaoModal">
    <div class="modal" style="max-width:640px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-dolly" style="margin-right:8px;"></i>Nova Ordem de Separação</h3>
        <button onclick="closeModal('novaSeparacaoModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label"><i class="fas fa-file-invoice" style="margin-right:5px;color:#2980B9;"></i>Pedido de Venda *</label>
            <input class="form-control" type="text" placeholder="PV-2024-XXXX" id="sep_pedido">
          </div>
          <div class="form-group">
            <label class="form-label"><i class="fas fa-calendar" style="margin-right:5px;color:#2980B9;"></i>Data de Separação *</label>
            <input class="form-control" type="date" id="sep_data">
          </div>
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label"><i class="fas fa-building" style="margin-right:5px;color:#2980B9;"></i>Nome do Cliente *</label>
            <input class="form-control" type="text" placeholder="Razão social do cliente" id="sep_cliente">
          </div>
          <div class="form-group">
            <label class="form-label">Responsável pela Separação</label>
            <select class="form-control" id="sep_responsavel">
              ${mockData.users.map(u => `<option>${u.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Código da OS</label>
            <input class="form-control" type="text" value="OS-2024-003" readonly style="background:#f8f9fa;">
          </div>
        </div>

        <!-- Itens de separação -->
        <div style="border-top:1px solid #f1f3f5;padding-top:16px;margin-top:4px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <label class="form-label" style="margin:0;">Produtos a Separar *</label>
            <button class="btn btn-secondary btn-sm" onclick="addSepItem()" title="Adicionar produto"><i class="fas fa-plus"></i> Adicionar</button>
          </div>
          <div id="sepItemsList">
            <div class="sep-item" style="display:grid;grid-template-columns:2fr 1fr 2fr auto;gap:8px;margin-bottom:8px;align-items:center;">
              <select class="form-control" style="font-size:12px;">
                <option value="">Selecionar produto...</option>
                ${products.map((p: any) => `<option value="${p.code}">${p.name} (${p.code})</option>`).join('')}
              </select>
              <input class="form-control" type="number" placeholder="Qtd" min="1">
              <input class="form-control" type="text" placeholder="Nº Série / Lote (obrig. se controlado)">
              <button class="btn btn-danger btn-sm" onclick="this.closest('.sep-item').remove()" title="Remover item"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaSeparacaoModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="saveSeparacao()" class="btn btn-primary"><i class="fas fa-save"></i> Criar Separação</button>
      </div>
    </div>
  </div>

  <!-- Nova Baixa Modal -->
  <div class="modal-overlay" id="novaBaixaModal">
    <div class="modal" style="max-width:520px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-minus-circle" style="margin-right:8px;"></i>Registrar Baixa de Estoque</h3>
        <button onclick="closeModal('novaBaixaModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div class="form-group">
          <label class="form-label">Tipo de Baixa *</label>
          <select class="form-control" id="baixa_tipo">
            <option value="faturamento">Faturamento (saída com NF-e)</option>
            <option value="requisicao">Requisição Interna (outra área)</option>
            <option value="descarte">Descarte / Perda</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Pedido / Referência</label>
          <input class="form-control" id="baixa_pedido" type="text" placeholder="PV-2024-XXXX ou REQ-ENG-XXX">
        </div>
        <div class="form-group">
          <label class="form-label">Número NF-e (quando faturamento)</label>
          <input class="form-control" id="baixa_nf" type="text" placeholder="NF-00000">
        </div>
        <div class="form-group">
          <label class="form-label">Item *</label>
          <select class="form-control" id="baixa_item">
            <option value="">Selecionar item...</option>
            ${stockItems.map((s: any) => `<option value="${s.code}">${s.name} (${s.code}) — Disponível: ${s.quantity} ${s.unit}</option>`).join('')}
            ${products.map((p: any) => `<option value="${p.code}">${p.name} (${p.code}) — Disponível: ${p.stockCurrent} ${p.unit}</option>`).join('')}
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Quantidade *</label>
            <input class="form-control" id="baixa_qty" type="number" min="1" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">Data</label>
            <input class="form-control" id="baixa_data" type="date">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Responsável</label>
          <select class="form-control" id="baixa_responsavel">
            ${mockData.users.map(u => `<option>${u.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="baixa_obs" rows="2" placeholder="NF-e, número de documento, justificativa..."></textarea>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaBaixaModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="saveBaixa()" class="btn btn-warning" style="color:white;"><i class="fas fa-minus-circle"></i> Registrar Baixa</button>
      </div>
    </div>
  </div>

  <!-- Ajuste Modal -->
  <div class="modal-overlay" id="ajusteModal">
    <div class="modal" style="max-width:440px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-balance-scale" style="margin-right:8px;"></i>Ajuste de Estoque</h3>
        <button onclick="closeModal('ajusteModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div class="form-group"><label class="form-label">Tipo de Ajuste</label>
          <select class="form-control"><option>Entrada (aumentar)</option><option>Saída (diminuir)</option><option>Acerto de inventário</option></select>
        </div>
        <div class="form-group"><label class="form-label">Quantidade</label>
          <input class="form-control" type="number" min="0" placeholder="0">
        </div>
        <div class="form-group"><label class="form-label">Motivo *</label>
          <textarea class="form-control" rows="2" placeholder="Descreva o motivo do ajuste..."></textarea>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('ajusteModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('Ajuste aplicado!');closeModal('ajusteModal')" class="btn btn-primary"><i class="fas fa-save"></i> Aplicar</button>
      </div>
    </div>
  </div>

  <!-- Serial Numbers Data (JSON for JS) -->
  <script>
  const serialNumbersData = ${JSON.stringify(serialNumbers)};
  const kardexData = ${JSON.stringify(kardexMovements)};

  // Filter estoque table
  function filterEstoque() {
    const search = document.getElementById('estoqueSearch').value.toLowerCase();
    const status = document.getElementById('estoqueStatusFilter').value;
    document.querySelectorAll('#estoqueBody tr').forEach(row => {
      const matchSearch = !search || (row.dataset.search || '').includes(search);
      const matchStatus = !status || row.dataset.status === status;
      row.style.display = (matchSearch && matchStatus) ? '' : 'none';
    });
  }

  function openBaixaModal(code, name) {
    const sel = document.getElementById('baixa_item');
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === code) { sel.selectedIndex = i; break; }
    }
    openModal('novaBaixaModal');
  }

  function openSeparacaoModal(code, name, unit) {
    openModal('novaSeparacaoModal');
    const sel = document.querySelector('#sepItemsList select');
    if (sel) {
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === code) { sel.selectedIndex = i; break; }
      }
    }
    document.querySelectorAll('[data-tab-group="estoque"] .tab-btn').forEach((b, i) => b.classList.toggle('active', i === 2));
    document.querySelectorAll('[data-tab-group="estoque"] .tab-content').forEach((c, i) => c.classList.toggle('active', i === 2));
  }

  function addSepItem() {
    const container = document.getElementById('sepItemsList');
    const div = document.createElement('div');
    div.className = 'sep-item';
    div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 2fr auto;gap:8px;margin-bottom:8px;align-items:center;';
    div.innerHTML = '<select class="form-control" style="font-size:12px;"><option value="">Selecionar produto...</option></select>' +
      '<input class="form-control" type="number" placeholder="Qtd" min="1">' +
      '<input class="form-control" type="text" placeholder="Nº Série / Lote">' +
      '<button class="btn btn-danger btn-sm" onclick="this.closest(\\'.sep-item\\').remove()" title="Remover"><i class="fas fa-trash"></i></button>';
    container.appendChild(div);
  }

  function saveSeparacao() {
    const pedido = document.getElementById('sep_pedido').value;
    const cliente = document.getElementById('sep_cliente').value;
    if (!pedido || !cliente) { alert('Preencha o Pedido de Venda e o Cliente!'); return; }
    alert('✅ Ordem de Separação OS-2024-003 criada!\\n\\nPedido: ' + pedido + '\\nCliente: ' + cliente + '\\n\\nA movimentação será registrada no Kardex automaticamente.');
    closeModal('novaSeparacaoModal');
  }

  function saveBaixa() {
    const item = document.getElementById('baixa_item').value;
    const qty = document.getElementById('baixa_qty').value;
    if (!item || !qty) { alert('Selecione o item e informe a quantidade!'); return; }
    const tipo = document.getElementById('baixa_tipo').value;
    const tipoLabel = { faturamento:'Faturamento', requisicao:'Requisição', descarte:'Descarte' }[tipo] || tipo;
    alert('✅ Baixa registrada!\\n\\nTipo: ' + tipoLabel + '\\nItem: ' + item + '\\nQuantidade: ' + qty);
    closeModal('novaBaixaModal');
  }

  function handlePlanilhaDrop(event) {
    event.preventDefault();
    document.getElementById('uploadArea').style.borderColor = '#d1d5db';
    document.getElementById('uploadArea').style.background = 'white';
    const file = event.dataTransfer.files[0];
    if (file) showFileSelected(file);
  }

  function handlePlanilhaSelect(event) {
    const file = event.target.files[0];
    if (file) showFileSelected(file);
  }

  function showFileSelected(file) {
    document.getElementById('fileName').textContent = file.name + ' (' + (file.size/1024).toFixed(1) + ' KB)';
    document.getElementById('fileSelectedInfo').style.display = 'block';
    document.getElementById('uploadArea').style.borderColor = '#16a34a';
    document.getElementById('importBtn').disabled = false;
    document.getElementById('importBtn').style.opacity = '1';
  }

  function importarPlanilha() {
    alert('✅ Planilha importada com sucesso!\\n\\n7 itens atualizados\\n2 itens novos adicionados\\n3 números de série/lote registrados no Kardex\\n\\nO MRP será recalculado automaticamente.');
    closeModal('uploadPlanilhaModal');
  }

  // ---- SERIAL LIST ----
  function openSerialList(itemCode, itemName, controlType) {
    const serials = serialNumbersData.filter(sn => sn.itemCode === itemCode);
    document.getElementById('serialListTitle').innerHTML =
      '<i class="fas ' + (controlType==='lote'?'fa-layer-group':'fa-barcode') + '" style="margin-right:8px;color:#7c3aed;"></i>' +
      'Lista de ' + (controlType==='lote'?'Números de Lote':'Números de Série');
    document.getElementById('serialListSubtitle').textContent = itemName + ' (' + itemCode + ') — ' + serials.length + ' registro(s)';

    const tbody = document.getElementById('serialListBody');
    const empty = document.getElementById('serialListEmpty');

    if (serials.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';
      const statusLabel = { em_estoque: '<span class="badge badge-success">Em Estoque</span>', separado: '<span class="badge badge-warning">Separado</span>', baixado: '<span class="badge badge-danger">Baixado</span>' };
      const originLabel = { apontamento: '🔧 Apontamento', planilha: '📋 Planilha' };
      tbody.innerHTML = serials.map(sn => {
        const dt = new Date(sn.createdAt + 'T00:00:00').toLocaleDateString('pt-BR');
        return '<tr>' +
          '<td style="font-family:monospace;font-size:12px;font-weight:700;color:#7c3aed;">' + sn.number + '</td>' +
          '<td><span class="badge" style="background:' + (sn.type==='serie'?'#ede9fe':'#fef3c7') + ';color:' + (sn.type==='serie'?'#7c3aed':'#d97706') + ';">' + (sn.type==='serie'?'Série':'Lote') + '</span></td>' +
          '<td style="font-weight:700;color:#374151;">' + sn.quantity + '</td>' +
          '<td>' + (statusLabel[sn.status] || sn.status) + '</td>' +
          '<td style="font-size:12px;color:#6c757d;">' + (originLabel[sn.origin] || sn.origin) + '</td>' +
          '<td style="font-family:monospace;font-size:11px;color:#1B4F72;">' + (sn.orderCode || '—') + '</td>' +
          '<td style="font-size:12px;color:#6c757d;">' + dt + '</td>' +
          '<td style="font-size:12px;color:#6c757d;">' + sn.createdBy + '</td>' +
          '</tr>';
      }).join('');
    }
    openModal('serialListModal');
  }

  // ---- KARDEX ----
  function filterKardex() {
    const search = document.getElementById('kardexSearch').value.toLowerCase();
    const movType = document.getElementById('kardexTypeFilter').value;
    const itemCode = document.getElementById('kardexItemFilter').value;
    document.querySelectorAll('#kardexBody tr').forEach(row => {
      const matchSearch = !search || (row.dataset.search || '').includes(search);
      const matchType = !movType || row.dataset.movtype === movType;
      const matchItem = !itemCode || row.dataset.itemcode === itemCode;
      row.style.display = (matchSearch && matchType && matchItem) ? '' : 'none';
    });
  }

  function filterKardexByItem(itemCode, itemName) {
    // Switch to kardex tab
    document.querySelectorAll('[data-tab-group="estoque"] .tab-btn').forEach((b, i) => b.classList.toggle('active', i === 4));
    document.querySelectorAll('[data-tab-group="estoque"] .tab-content').forEach((c, i) => c.classList.toggle('active', i === 4));
    // Set filter
    const sel = document.getElementById('kardexItemFilter');
    if (sel) { for (let i=0; i<sel.options.length; i++) { if (sel.options[i].value===itemCode) { sel.selectedIndex=i; break; } } }
    // Show banner
    document.getElementById('kardexFilterBanner').style.display = 'block';
    document.getElementById('kardexFilterLabel').textContent = itemName + ' (' + itemCode + ')';
    filterKardex();
    document.getElementById('tabKardex')?.scrollIntoView({ behavior:'smooth' });
  }

  function clearKardexFilters() {
    document.getElementById('kardexSearch').value = '';
    document.getElementById('kardexTypeFilter').value = '';
    document.getElementById('kardexItemFilter').value = '';
    document.getElementById('kardexFilterBanner').style.display = 'none';
    filterKardex();
  }

  function openKardexDetail(jsonStr) {
    let k;
    try { k = JSON.parse(jsonStr); } catch(e) { return; }
    const isEntrada = k.movType === 'entrada';
    const dt = new Date(k.date);
    const dtStr = dt.toLocaleDateString('pt-BR') + ' às ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const body = document.getElementById('kardexDetailBody');
    body.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
      '<div style="grid-column:span 2;background:' + (isEntrada?'#f0fdf4':'#fef2f2') + ';border-radius:8px;padding:12px;text-align:center;border-left:4px solid ' + (isEntrada?'#16a34a':'#dc2626') + ';">' +
        '<div style="font-size:28px;font-weight:800;color:' + (isEntrada?'#16a34a':'#dc2626') + ';">' + (isEntrada?'+':'-') + k.quantity + '</div>' +
        '<div style="font-size:13px;color:' + (isEntrada?'#16a34a':'#dc2626') + ';font-weight:600;">' + (isEntrada?'ENTRADA':'SAÍDA') + '</div>' +
      '</div>' +
      row('Nº Série / Lote', '<span style="font-family:monospace;font-weight:700;color:#7c3aed;">' + k.serialNumber + '</span>') +
      row('Item', k.itemName + ' <span style="font-family:monospace;font-size:11px;color:#9ca3af;">(' + k.itemCode + ')</span>') +
      row('Data / Hora', dtStr) +
      row('Usuário', '<i class="fas fa-user" style="margin-right:4px;color:#6c757d;"></i>' + k.user) +
      row('Descrição', k.description) +
      (k.orderCode ? row('Ordem de Produção', '<span style="font-family:monospace;font-size:12px;background:#e8f4fd;padding:2px 8px;border-radius:4px;color:#1B4F72;">' + k.orderCode + '</span>') : '') +
      (k.pedido ? row('Pedido de Venda', '<span style="font-weight:600;color:#2980B9;">' + k.pedido + '</span>') : '') +
      (k.nf ? row('Nota Fiscal', '<span style="font-weight:600;color:#27AE60;">' + k.nf + '</span>') : '') +
      '</div>';
    openModal('kardexDetailModal');
  }

  function row(label, value) {
    return '<div style="background:#f8f9fa;border-radius:8px;padding:10px 12px;">' +
      '<div style="font-size:11px;color:#9ca3af;font-weight:600;margin-bottom:3px;">' + label.toUpperCase() + '</div>' +
      '<div style="font-size:13px;color:#374151;">' + value + '</div>' +
    '</div>';
  }

  // ---- TRANSFERÊNCIAS ----
  function addTrfItem() {
    const list = document.getElementById('trfItemsList');
    const div = document.createElement('div');
    div.className = 'trf-item';
    div.style.cssText = 'display:grid;grid-template-columns:3fr 1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:center;';
    div.innerHTML = '<select class="form-control" style="font-size:12px;">' +
      '<option value="">Selecionar item...</option>' +
      '</select>' +
      '<input class="form-control" type="number" placeholder="Qtd" min="1">' +
      '<input class="form-control" type="text" placeholder="Nº Série / Lote">' +
      '<button class="btn btn-danger btn-sm" onclick="this.closest(\'.trf-item\').remove()"><i class="fas fa-trash"></i></button>';
    list.appendChild(div);
  }

  function saveTransferencia() {
    alert('✅ Solicitação de transferência criada com sucesso!\\n\\nO separador responsável será notificado por e-mail.\\nA transferência ficará com status "Pendente" até a confirmação.');
    closeModal('novaTransferenciaModal');
  }

  function openTransfDetail(id) {
    alert('Detalhes da transferência ' + id + '\\n\\nEm uma implementação completa, abrirá um modal com:\\n- Itens detalhados\\n- Histórico de status\\n- Documentos anexos\\n- Assinatura digital do custodiante');
  }


  async function salvarItemEstoque() {
    const name = document.getElementById('item_nome')?.value || '';
    const code = document.getElementById('item_codigo')?.value || '';
    const unit = document.getElementById('item_unidade')?.value || 'un';
    const category = document.getElementById('item_categoria')?.value || '';
    const currentQty = document.getElementById('item_qty_atual')?.value || 0;
    const minQty = document.getElementById('item_qty_min')?.value || 0;
    const location = document.getElementById('item_localizacao')?.value || '';
    if (!name) { showToast('Informe o nome!', 'error'); return; }
    try {
      const res = await fetch('/estoque/api/item/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code, unit, category, currentQty, minQty, location })
      });
      const data = await res.json();
      if (data.ok) { showToast('✅ Item cadastrado!'); closeModal('novoItemModal'); setTimeout(() => location.reload(), 800); }
      else showToast(data.error || 'Erro ao cadastrar', 'error');
    } catch(e) { showToast('Erro de conexão', 'error'); }
  }
  async function deleteItemEstoque(id) {
    if (!confirm('Excluir este item do estoque?')) return;
    try {
      const res = await fetch('/estoque/api/item/' + id, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) { showToast('Item excluído!'); setTimeout(() => location.reload(), 500); }
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
  return c.html(layout('Estoque', content, 'estoque', userInfo))
})


// ── API: POST /estoque/api/item/create ───────────────────────────────────────
app.post('/api/item/create', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.name) return err(c, 'Nome obrigatório')
  const id = genId('stk')
  const item = {
    id, name: body.name, code: body.code || id.slice(-6).toUpperCase(),
    unit: body.unit || 'un', category: body.category || '',
    currentQty: parseFloat(body.currentQty) || 0,
    minQty: parseFloat(body.minQty) || 0,
    maxQty: parseFloat(body.maxQty) || 0,
    location: body.location || '', stockStatus: 'normal',
    almoxarifadoId: body.almoxarifadoId || '',
    createdAt: new Date().toISOString(),
  }
  tenant.stockItems.push(item)
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'stock_items', {
      id, user_id: userId, name: item.name, code: item.code,
      unit: item.unit, category: item.category,
      current_qty: item.currentQty, min_qty: item.minQty, max_qty: item.maxQty,
      location: item.location,
    })
  }
  return ok(c, { item })
})

app.put('/api/item/:id', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id'); const body = await c.req.json().catch(() => null)
  if (!body) return err(c, 'Dados inválidos')
  const idx = tenant.stockItems.findIndex((s: any) => s.id === id)
  if (idx === -1) return err(c, 'Item não encontrado', 404)
  Object.assign(tenant.stockItems[idx], body)
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'stock_items', id, userId, {
      name: body.name, current_qty: body.currentQty,
      min_qty: body.minQty, max_qty: body.maxQty, location: body.location,
    })
  }
  return ok(c, { item: tenant.stockItems[idx] })
})

app.delete('/api/item/:id', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const idx = tenant.stockItems.findIndex((s: any) => s.id === id)
  if (idx === -1) return err(c, 'Item não encontrado', 404)
  tenant.stockItems.splice(idx, 1)
  if (db && userId !== 'demo-tenant') await dbDelete(db, 'stock_items', id, userId)
  return ok(c)
})

app.get('/api/items', (c) => ok(c, { items: getCtxTenant(c).stockItems }))

// Kardex / Movimentação
app.post('/api/movement', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.itemId) return err(c, 'Dados inválidos')
  const item = tenant.stockItems.find((s: any) => s.id === body.itemId)
  if (!item) return err(c, 'Item não encontrado', 404)
  const qty = parseFloat(body.qty) || 0
  if (body.type === 'entrada') { item.currentQty = (item.currentQty || 0) + qty }
  else if (body.type === 'saida') { item.currentQty = Math.max(0, (item.currentQty || 0) - qty) }
  const movement = {
    id: genId('mv'), itemId: body.itemId, itemName: item.name,
    type: body.type, qty, reason: body.reason || '', user: body.user || '',
    createdAt: new Date().toISOString(),
  }
  if (!tenant.stockMovements) (tenant as any).stockMovements = []
  ;(tenant as any).stockMovements.push(movement)
  return ok(c, { movement, newQty: item.currentQty })
})

export default app
