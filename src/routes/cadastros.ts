import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxUserId, getCtxEmpresaId } from '../sessionHelper'
import { genId, dbInsert, dbInsertWithRetry, dbUpdate, dbDelete, ok, err } from '../dbHelpers'
import { markTenantModified } from '../userStore'

const app = new Hono()

// Escapes JSON for safe inline <script> injection (prevents script termination and HTML injection)
function safeJson(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

app.get('/', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const mockData = tenant  // per-session data
  const suppliers = (mockData as any).suppliers || []
  const productSuppliers = (mockData as any).productSuppliers || []
  const stockItems = (mockData as any).stockItems || []
  const products = (mockData as any).products || []
  const supplierCategories: any[] = (mockData as any).supplierCategories || []

  const DEFAULT_CATEGORIES = ['Matéria-Prima', 'Componente', 'Fixador', 'Embalagem', 'Serviço']
  const customCategoryNames = supplierCategories.map((c: any) => c.name)
  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...customCategoryNames])]

  const typeInfo: Record<string, { label: string, color: string, bg: string, icon: string }> = {
    nacional:  { label: 'Nacional',  color: '#16a34a', bg: '#f0fdf4', icon: 'fa-flag' },
    importado: { label: 'Importado', color: '#2980B9', bg: '#e8f4fd', icon: 'fa-globe' },
  }

  // Build product-supplier map (which products each supplier supplies)
  const supplierProductMap: Record<string, string[]> = {}
  for (const ps of productSuppliers) {
    for (const sid of ps.supplierIds) {
      if (!supplierProductMap[sid]) supplierProductMap[sid] = []
      const allItems = [...stockItems, ...products]
      const item = allItems.find((i: any) => i.code === ps.productCode)
      if (item) supplierProductMap[sid].push(item.name || ps.productCode)
    }
  }

  const allItems = [...stockItems, ...products]

  const content = `

  <script src="/static/cadastros-init.js"></script>
  <script>
  var suppliersData = ${safeJson(suppliers)};
  var productSuppliersData = ${safeJson(productSuppliers)};
  var allItemsData = ${safeJson(allItems)};
  var supplierProductMapData = ${safeJson(supplierProductMap)};
  var allCategoriesData = ${safeJson(allCategories)};
  // Fechar alerta crítico após 8s
  setTimeout(function() { var el = document.getElementById('noSupplierAlert'); if (el) el.style.display = 'none'; }, 8000);
</script>
  <!-- Pop-up alerta itens críticos sem fornecedor -->
  ${(() => {
    const criticalNoSupplier = allItems.filter((i: any) =>
      (i.status === 'critical' || i.stockStatus === 'critical') &&
      i.productionType === 'external' &&
      (!i.supplierIds || i.supplierIds.length === 0)
    )
    return criticalNoSupplier.length > 0 ? `
    <div id="noSupplierAlert" style="position:fixed;top:80px;right:20px;z-index:500;width:340px;background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.18);border-top:4px solid #dc2626;animation:slideInRight 0.3s ease;">
      <div style="padding:14px 16px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:32px;height:32px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-exclamation-triangle" style="color:#dc2626;font-size:14px;"></i>
          </div>
          <div>
            <div style="font-size:13px;font-weight:700;color:#dc2626;">Itens Críticos sem Fornecedor!</div>
            <div style="font-size:11px;color:#6c757d;">${criticalNoSupplier.length} item(ns) precisa(m) de fornecedor</div>
          </div>
        </div>
        <button onclick="document.getElementById('noSupplierAlert').style.display='none'" style="background:none;border:none;font-size:18px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:10px 16px 14px;">
        ${criticalNoSupplier.map((i: any) => `<div style="font-size:12px;color:#374151;padding:4px 0;border-bottom:1px solid #f8f9fa;">${i.name} — <span style="color:#dc2626;font-weight:600;">sem fornecedor cadastrado</span></div>`).join('')}
        <button onclick="document.getElementById('noSupplierAlert').style.display='none'" class="btn btn-danger btn-sm" style="width:100%;margin-top:10px;justify-content:center;">Vincular Fornecedores</button>
      </div>
    </div>
    <style>@keyframes slideInRight{from{opacity:0;transform:translateX(40px);}to{opacity:1;transform:translateX(0);}}</style>` : ''
  })()}

  <!-- Header -->
  <div class="section-header">
    <div>
      <div style="font-size:14px;color:#6c757d;">${suppliers.length} fornecedores cadastrados • Nacionais e importados</div>
      <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
        <span class="badge" style="background:#f0fdf4;color:#16a34a;"><i class="fas fa-flag" style="font-size:9px;"></i> ${suppliers.filter((s: any) => !s.type || s.type === 'nacional').length} Nacionais</span>
        <span class="badge" style="background:#e8f4fd;color:#2980B9;"><i class="fas fa-globe" style="font-size:9px;"></i> ${suppliers.filter((s: any) => s.type === 'importado').length} Importados</span>
        <span class="badge" style="background:#f0fdf4;color:#16a34a;">${suppliers.filter((s: any) => s.active !== false).length} Ativos</span>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-secondary" onclick="openModal('vinculacaoModal')" title="Vincular fornecedores a produtos">
        <i class="fas fa-link"></i> Vincular Fornecedor ↔ Produto
      </button>
      <button class="btn btn-primary" onclick="openModal('novoFornecedorModal')" title="Cadastrar novo fornecedor">
        <i class="fas fa-plus"></i> Novo Fornecedor
      </button>
    </div>
  </div>

  <!-- Tabs -->
  <div data-tab-group="cadastros">
    <div class="tab-nav">
      <button class="tab-btn active" onclick="switchTab('tabFornecedores','cadastros')">
        <i class="fas fa-truck" style="margin-right:6px;"></i>Fornecedores
      </button>
      <button class="tab-btn" onclick="switchTab('tabVinculacoes','cadastros')">
        <i class="fas fa-project-diagram" style="margin-right:6px;"></i>Vinculações Produto × Fornecedor
        <span style="background:#2980B9;color:white;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px;margin-left:4px;">${productSuppliers.length}</span>
      </button>
    </div>

    <!-- FORNECEDORES TAB -->
    <div class="tab-content active" id="tabFornecedores">
      <!-- Search -->
      <div class="card" style="padding:12px 16px;margin-bottom:14px;">
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <div class="search-box" style="flex:1;min-width:180px;">
            <i class="fas fa-search icon"></i>
            <input class="form-control" type="text" id="supSearch" placeholder="Nome, CNPJ, contato..." oninput="filterSuppliers()">
          </div>
          <select class="form-control" id="supTypeFilter" style="width:auto;" onchange="filterSuppliers()">
            <option value="">Todos os tipos</option>
            <option value="nacional">Nacional</option>
            <option value="importado">Importado</option>
          </select>
          <select class="form-control" id="supCatFilter" style="width:auto;" onchange="filterSuppliers()">
            <option value="">Todas as categorias</option>
            ${allCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
          </select>
          <select class="form-control" id="supStatusFilter" style="width:auto;" onchange="filterSuppliers()">
            <option value="">Todos os status</option>
            <option value="1">Ativo</option>
            <option value="0">Inativo</option>
          </select>
        </div>
      </div>

      <div id="supGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;">
        ${suppliers.map((s: any) => {
          const ti = typeInfo[s.type] || typeInfo.nacional
          const prods = supplierProductMap[s.id] || []
          const stars = Math.round(s.rating)
          const starsHtml = Array.from({length:5}, (_,i) => `<i class="fas fa-star" style="font-size:11px;color:${i<stars?'#F39C12':'#e9ecef'};"></i>`).join('')
          return `
          <div class="card sup-card" data-type="${s.type}" data-cat="${s.category}" data-active="${s.active !== false ? '1' : '0'}" data-search="${s.name.toLowerCase()} ${(s.cnpj||'').toLowerCase()} ${(s.contact||'').toLowerCase()} ${(s.category||'').toLowerCase()}" style="padding:0;overflow:hidden;border-top:3px solid ${ti.color};">
            <div style="padding:16px;">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
                <div style="flex:1;min-width:0;padding-right:8px;">
                  <div style="font-size:15px;font-weight:700;color:#1B4F72;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${s.name}">${s.name}</div>
                  <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${s.tradeName} ${s.cnpj ? '• CNPJ: ' + s.cnpj : '• ' + s.country}</div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
                  <span class="badge" style="background:${ti.bg};color:${ti.color};">
                    <i class="fas ${ti.icon}" style="font-size:9px;"></i> ${ti.label}
                  </span>
                  ${s.active ? '<span class="badge badge-success" style="font-size:10px;">Ativo</span>' : '<span class="badge badge-secondary" style="font-size:10px;">Inativo</span>'}
                </div>
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
                <div style="background:#f8f9fa;border-radius:8px;padding:8px 10px;">
                  <div style="font-size:10px;color:#9ca3af;font-weight:600;">CONTATO</div>
                  <div style="font-size:12px;color:#374151;margin-top:2px;font-weight:500;">${s.contact}</div>
                  <div style="font-size:11px;color:#6c757d;">${s.phone}</div>
                </div>
                <div style="background:#f8f9fa;border-radius:8px;padding:8px 10px;">
                  <div style="font-size:10px;color:#9ca3af;font-weight:600;">PRAZO ENTREGA</div>
                  <div style="font-size:18px;font-weight:800;color:#1B4F72;margin-top:2px;">${s.deliveryLeadDays} <span style="font-size:11px;font-weight:400;color:#9ca3af;">dias</span></div>
                </div>
                <div style="background:#f8f9fa;border-radius:8px;padding:8px 10px;">
                  <div style="font-size:10px;color:#9ca3af;font-weight:600;">CATEGORIA</div>
                  <div style="font-size:12px;color:#374151;margin-top:2px;">${s.category}</div>
                </div>
                <div style="background:#f8f9fa;border-radius:8px;padding:8px 10px;">
                  <div style="font-size:10px;color:#9ca3af;font-weight:600;">AVALIAÇÃO</div>
                  <div style="margin-top:4px;">${starsHtml} <span style="font-size:11px;color:#6c757d;margin-left:2px;">${s.rating}</span></div>
                </div>
              </div>

              ${prods.length > 0 ? `
              <div style="background:#e8f4fd;border-radius:8px;padding:8px 10px;margin-bottom:10px;">
                <div style="font-size:10px;color:#2980B9;font-weight:600;margin-bottom:4px;"><i class="fas fa-boxes" style="margin-right:4px;"></i>PRODUTOS FORNECIDOS (${prods.length})</div>
                <div style="font-size:12px;color:#374151;">${prods.slice(0,3).join(', ')}${prods.length > 3 ? ` +${prods.length-3} mais` : ''}</div>
              </div>` : ''}

              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div style="font-size:11px;color:#6c757d;"><i class="fas fa-credit-card" style="margin-right:4px;"></i>${s.paymentTerms}</div>
                <div style="font-size:11px;color:#6c757d;"><i class="fas fa-envelope" style="margin-right:4px;"></i>${s.email}</div>
              </div>

              <div style="display:flex;gap:6px;">
                <div class="tooltip-wrap" data-tooltip="Ver detalhes do fornecedor" style="flex:1;">
                  <button class="btn btn-secondary btn-sm" style="width:100%;justify-content:center;" onclick="openSupplierDetail('${s.id}')">
                    <i class="fas fa-eye"></i> Detalhes
                  </button>
                </div>
                <div class="tooltip-wrap" data-tooltip="Editar fornecedor">
                  <button class="btn btn-secondary btn-sm" onclick="openEditSupplier('${s.id}')"><i class="fas fa-edit"></i></button>
                </div>
                <div class="tooltip-wrap" data-tooltip="Solicitar cotação">
                  <button class="btn btn-sm" style="background:#e8f4fd;color:#2980B9;border:1px solid #bee3f8;" onclick="solicitarCotacao('${s.id}')">
                    <i class="fas fa-file-invoice-dollar"></i>
                  </button>
                </div>
                <div class="tooltip-wrap" data-tooltip="${s.active ? 'Inativar fornecedor' : 'Ativar fornecedor'}">
                  <button class="btn btn-sm" style="background:${s.active ? '#fef2f2' : '#f0fdf4'};color:${s.active ? '#dc2626' : '#16a34a'};border:1px solid ${s.active ? '#fecaca' : '#bbf7d0'};" onclick="toggleAtivoFornecedor('${s.id}', ${!s.active})"><i class="fas fa-${s.active ? 'ban' : 'check-circle'}"></i></button>
                </div>
              </div>
            </div>
          </div>`
        }).join('')}
      </div>
    </div>

    <!-- VINCULAÇÕES TAB -->
    <div class="tab-content" id="tabVinculacoes">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
        <div style="font-size:14px;color:#6c757d;">Vincule fornecedores a produtos/matérias-primas com prioridade e prazo de entrega</div>
        <button class="btn btn-primary" onclick="openModal('vinculacaoModal')">
          <i class="fas fa-plus"></i> Nova Vinculação
        </button>
      </div>

      <div class="card" style="overflow:hidden;">
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Produto / Item</th><th>Tipo Produção</th><th>Fornecedores Vinculados</th><th>Prioridade</th><th>Prazo Entrega</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${productSuppliers.map((ps: any) => {
                const allItens = [...stockItems, ...products]
                const item = allItens.find((i: any) => i.code === ps.productCode)
                const linkedSuppliers = ps.supplierIds.map((sid: string) => {
                  const sup = suppliers.find((s: any) => s.id === sid)
                  const priority = ps.priorities[sid] || 1
                  return { sup, priority }
                }).sort((a: any, b: any) => a.priority - b.priority)
                return `
                <tr>
                  <td>
                    <div style="font-weight:600;color:#1B4F72;">${item?.name || ps.productCode}</div>
                    <div style="font-family:monospace;font-size:11px;color:#9ca3af;">${ps.productCode}</div>
                  </td>
                  <td>
                    ${ps.internalProduction ?
                      '<span class="badge" style="background:#f5f3ff;color:#7c3aed;"><i class="fas fa-industry" style="font-size:9px;"></i> Produção Interna</span>' :
                      '<span class="badge" style="background:#e8f4fd;color:#2980B9;"><i class="fas fa-truck" style="font-size:9px;"></i> Compra Externa</span>'
                    }
                  </td>
                  <td>
                    ${ps.internalProduction ? '<span style="color:#9ca3af;font-size:12px;">—</span>' :
                      linkedSuppliers.length > 0 ?
                      linkedSuppliers.map((ls: any) => ls.sup ? `
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                          <span style="font-size:12px;color:#374151;">${ls.sup.name}</span>
                          <span class="badge" style="background:${ls.sup.type==='importado'?'#e8f4fd':'#f0fdf4'};color:${ls.sup.type==='importado'?'#2980B9':'#16a34a'};font-size:9px;">${ls.sup.type==='importado'?'Import.':'Nac.'}</span>
                        </div>` : '').join('') :
                      '<span style="color:#dc2626;font-size:12px;"><i class="fas fa-exclamation-circle" style="margin-right:4px;"></i>Nenhum vinculado</span>'
                    }
                  </td>
                  <td>
                    ${ps.internalProduction ? '<span style="color:#9ca3af;font-size:12px;">—</span>' :
                      linkedSuppliers.length > 0 ?
                      linkedSuppliers.map((ls: any, idx: number) => `
                        <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">
                          <span style="width:20px;height:20px;border-radius:50%;background:${idx===0?'#1B4F72':'#9ca3af'};color:white;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;">${ls.priority}</span>
                          <span style="font-size:11px;color:#6c757d;">${idx===0?'Principal':'Backup'}</span>
                        </div>`).join('') :
                      '—'
                    }
                  </td>
                  <td>
                    ${ps.internalProduction ? `
                      <span style="font-size:12px;color:#7c3aed;font-weight:600;">${item?.leadTimeDays||'?'} dias <span style="font-weight:400;color:#9ca3af;">(produção)</span></span>` :
                      linkedSuppliers.length > 0 ?
                      linkedSuppliers.map((ls: any) => ls.sup ? `
                        <div style="font-size:12px;color:#374151;margin-bottom:3px;">${ls.sup.name}: <strong>${ls.sup.deliveryLeadDays}d</strong></div>` : '').join('') :
                      '—'
                    }
                  </td>
                  <td>
                    <div style="display:flex;gap:4px;">
                      <div class="tooltip-wrap" data-tooltip="Editar vinculação">
                        <button class="btn btn-secondary btn-sm" onclick="openModal('vinculacaoModal')"><i class="fas fa-edit"></i></button>
                      </div>
                      <div class="tooltip-wrap" data-tooltip="Solicitar cotação para este item">
                        <button class="btn btn-sm" style="background:#e8f4fd;color:#2980B9;border:1px solid #bee3f8;"
                          data-product-code="${ps.productCode}" data-product-name="${item?.name||ps.productCode}" data-supplier-id="${linkedSuppliers[0]?.sup?.id||''}"
                          onclick="solicitarCotacaoParaItem(this.dataset.productCode,this.dataset.productName,this.dataset.supplierId)">
                          <i class="fas fa-file-invoice-dollar"></i>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal: Novo Fornecedor -->
  <div class="modal-overlay" id="novoFornecedorModal">
    <div class="modal" style="max-width:680px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;" id="fornModalTitle"><i class="fas fa-truck" style="margin-right:8px;"></i>Cadastrar Fornecedor</h3>
        <button onclick="closeModal('novoFornecedorModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Tipo de Fornecedor *</label>
            <div style="display:flex;gap:12px;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;" id="fType_nac">
                <input type="radio" name="fType" value="nacional" checked onchange="toggleFornType(this.value)">
                <i class="fas fa-flag" style="color:#16a34a;"></i> Nacional
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;" id="fType_imp">
                <input type="radio" name="fType" value="importado" onchange="toggleFornType(this.value)">
                <i class="fas fa-globe" style="color:#2980B9;"></i> Importado
              </label>
            </div>
          </div>
          <input type="hidden" id="sup_id" value="">
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Razão Social *</label><input class="form-control" id="sup_nome" type="text" placeholder="Nome completo da empresa"></div>
          <div class="form-group"><label class="form-label">Nome Fantasia</label><input class="form-control" id="sup_fantasia" type="text" placeholder="Nome comercial"></div>
          <div class="form-group" id="fCnpjGroup"><label class="form-label" id="fCnpjLabel">CNPJ <span style="color:#dc2626;">*</span></label><input class="form-control" id="sup_cnpj" type="text" placeholder="00.000.000/0001-00"></div>
          <div class="form-group"><label class="form-label">E-mail *</label><input class="form-control" id="sup_email" type="email" placeholder="vendas@fornecedor.com"></div>
          <div class="form-group"><label class="form-label">Telefone</label><input class="form-control" id="sup_tel" type="text" placeholder="(11) 9999-9999"></div>
          <div class="form-group"><label class="form-label">Contato Principal</label><input class="form-control" id="sup_contato" type="text" placeholder="Nome do responsável"></div>
          <div class="form-group"><label class="form-label">Categoria</label>
            <div style="display:flex;gap:6px;align-items:center;">
              <select class="form-control" id="sup_categoria" style="flex:1;">
                ${allCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
              </select>
              <button type="button" class="btn btn-secondary btn-sm" onclick="openModal('novaCategoriaModal')" title="Nova categoria" style="padding:6px 10px;flex-shrink:0;"><i class="fas fa-plus"></i></button>
            </div>
          </div>
          <div class="form-group"><label class="form-label">Cidade</label><input class="form-control" id="sup_cidade" type="text" placeholder="Cidade"></div>
          <div class="form-group"><label class="form-label">Estado / País</label><input class="form-control" id="sup_estado" type="text" placeholder="SP / Brasil"></div>
          <div class="form-group">
            <label class="form-label"><i class="fas fa-clock" style="margin-right:4px;color:#2980B9;"></i>Prazo Mínimo de Entrega (dias) *</label>
            <input class="form-control" id="sup_prazo" type="number" min="1" placeholder="Ex: 7">
          </div>
          <div class="form-group"><label class="form-label">Condições de Pagamento</label><input class="form-control" id="sup_pagamento" type="text" placeholder="Ex: 30/60/90 dias"></div>
          <div id="fNcmGroup" style="display:none;" class="form-group"><label class="form-label"><i class="fas fa-info-circle" style="margin-right:4px;color:#2980B9;"></i>Nota: NCM e Descrições PT/EN são cadastrados por produto em <a href="/suprimentos" style="color:#2980B9;font-weight:700;">Suprimentos → Importação</a></label></div>
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Observações</label><textarea class="form-control" id="sup_obs" rows="2" placeholder="Informações adicionais, certificações, condições especiais..."></textarea></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novoFornecedorModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarFornecedor()" class="btn btn-primary"><i class="fas fa-save"></i> Salvar Fornecedor</button>
      </div>
    </div>
  </div>

  <!-- Modal: Vinculação Produto × Fornecedor -->
  <div class="modal-overlay" id="vinculacaoModal">
    <div class="modal" style="max-width:620px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-link" style="margin-right:8px;"></i>Vincular Fornecedor ↔ Produto</h3>
        <button onclick="closeModal('vinculacaoModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div class="form-group">
          <label class="form-label">Produto / Item *</label>
          <select class="form-control" id="vincProduto">
            <option value="">Selecionar produto ou matéria-prima...</option>
            ${allItems.map((i: any) => `<option value="${i.code}">${i.name} (${i.code})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de Fornecimento *</label>
          <div style="display:flex;gap:10px;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 14px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;" id="vincType_ext">
              <input type="radio" name="vincType" value="external" checked onchange="toggleVincType(this.value)">
              <i class="fas fa-truck" style="color:#2980B9;"></i> Compra Externa
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 14px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;" id="vincType_int">
              <input type="radio" name="vincType" value="internal" onchange="toggleVincType(this.value)">
              <i class="fas fa-industry" style="color:#7c3aed;"></i> Produção Interna
            </label>
          </div>
        </div>
        <div id="vincSuppliersSection">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <label class="form-label" style="margin:0;">Fornecedores (arraste para reordenar prioridade)</label>
            <button class="btn btn-secondary btn-sm" onclick="addVincSupplier()"><i class="fas fa-plus"></i> Adicionar</button>
          </div>
          <div id="vincSupplierList">
            <div class="vinc-supplier-row" style="display:grid;grid-template-columns:32px 2fr 80px auto;gap:8px;align-items:center;margin-bottom:8px;background:#f8f9fa;padding:8px;border-radius:8px;">
              <div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:#1B4F72;color:white;border-radius:50%;font-size:11px;font-weight:700;">1</div>
              <select class="form-control" style="font-size:12px;">
                <option value="">Selecionar fornecedor...</option>
                ${suppliers.map((s: any) => `<option value="${s.id}">${s.name} (${s.type})</option>`).join('')}
              </select>
              <select class="form-control" style="font-size:12px;">
                <option value="1">Principal</option>
                <option value="2">Backup</option>
                <option value="3">Terciário</option>
              </select>
              <button class="btn btn-danger btn-sm" onclick="this.closest('.vinc-supplier-row').remove()"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        </div>
        <div id="vincInternalInfo" style="display:none;background:#f5f3ff;border-radius:8px;padding:14px;border-left:3px solid #7c3aed;">
          <div style="font-size:13px;color:#7c3aed;font-weight:600;margin-bottom:8px;"><i class="fas fa-industry" style="margin-right:6px;"></i>Produção Interna</div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Lead Time de Produção (dias)</label>
            <input class="form-control" type="number" min="1" placeholder="Ex: 5">
          </div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('vinculacaoModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarVinculacao()" class="btn btn-primary"><i class="fas fa-save"></i> Salvar Vinculação</button>
      </div>
    </div>
  </div>

  <!-- Modal: Detalhes Fornecedor -->
  <div class="modal-overlay" id="supplierDetailModal">
    <div class="modal" style="max-width:600px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;" id="supDetailTitle"><i class="fas fa-truck" style="margin-right:8px;"></i>Detalhes do Fornecedor</h3>
        <button onclick="closeModal('supplierDetailModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;" id="supDetailBody"></div>
      <div style="padding:14px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;">
        <button onclick="closeModal('supplierDetailModal')" class="btn btn-secondary">Fechar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Nova Categoria -->
  <div class="modal-overlay" id="novaCategoriaModal">
    <div class="modal" style="max-width:400px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:16px;font-weight:700;color:#1B4F72;"><i class="fas fa-tag" style="margin-right:8px;"></i>Nova Categoria</h3>
        <button onclick="closeModal('novaCategoriaModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div class="form-group">
          <label class="form-label">Nome da Categoria *</label>
          <input class="form-control" id="nova_categoria_nome" type="text" placeholder="Ex: Lubrificantes">
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaCategoriaModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarNovaCategoria()" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  `

  return c.html(layout('Cadastros — Fornecedores', content, 'cadastros', userInfo))
})

// ── API: POST /cadastros/api/supplier/create ─────────────────────────────────
app.post('/api/supplier/create', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const empresaId = getCtxEmpresaId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.name) return err(c, 'Nome obrigatório')
  const id = genId('sup')
  const supplier = {
    id, name: body.name, cnpj: body.cnpj || '', email: body.email || '',
    phone: body.phone || '', contact: body.contact || '', city: body.city || '',
    state: body.state || '', category: body.category || '', active: true,
    type: body.type || 'nacional',
    fantasia: body.fantasia || '', tradeName: body.fantasia || '',
    rating: 0, paymentTerms: body.paymentTerms || '', deliveryLeadDays: parseInt(body.deliveryLeadDays) || 0,
    notes: body.notes || '', createdAt: new Date().toISOString(),
  }
  tenant.suppliers.push(supplier)
  if (db && userId !== 'demo-tenant') {
    const persistResult = await dbInsertWithRetry(db, 'suppliers', {
      id, user_id: userId, empresa_id: empresaId, name: supplier.name, cnpj: supplier.cnpj,
      email: supplier.email, phone: supplier.phone, contact: supplier.contact,
      city: supplier.city, state: supplier.state, active: 1,
      type: supplier.type, category: supplier.category,
      trade_name: supplier.tradeName,
      payment_terms: supplier.paymentTerms,
      lead_days: supplier.deliveryLeadDays,
      notes: supplier.notes,
    })
    if (!persistResult.success) {
      console.error(`[ERROR] Falha ao persistir fornecedor ${id} em D1 após ${persistResult.attempts} tentativas: ${persistResult.error}`)
      return ok(c, {
        supplier,
        warning: 'Fornecedor salvo localmente. Falha ao salvar no banco. Sincronizará automaticamente.',
      })
    }
  }
  markTenantModified(userId)
  return ok(c, { supplier })
})

app.put('/api/supplier/:id', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id'); const body = await c.req.json().catch(() => null)
  if (!body) return err(c, 'Dados inválidos')
  const idx = tenant.suppliers.findIndex((s: any) => s.id === id)
  if (idx === -1) return err(c, 'Fornecedor não encontrado', 404)
  // Persistir todos os campos editáveis
  const s = tenant.suppliers[idx]
  s.name = body.name ?? s.name
  s.fantasia = body.fantasia ?? s.fantasia
  s.tradeName = body.fantasia ?? s.tradeName
  s.cnpj = body.cnpj ?? s.cnpj
  s.email = body.email ?? s.email
  s.phone = body.phone ?? s.phone
  s.tel = body.phone ?? s.tel
  s.contact = body.contact ?? s.contact
  s.city = body.city ?? s.city
  s.state = body.state ?? s.state
  s.category = body.category ?? s.category
  s.paymentTerms = body.paymentTerms ?? s.paymentTerms
  s.deliveryLeadDays = body.deliveryLeadDays ?? s.deliveryLeadDays
  s.notes = body.notes ?? s.notes
  s.obs = body.notes ?? s.obs
  s.type = body.type ?? s.type
  if (body.active !== undefined) s.active = body.active === true || body.active === 1
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'suppliers', id, userId, {
      name: s.name, cnpj: s.cnpj, email: s.email, phone: s.phone,
      contact: s.contact, city: s.city, state: s.state,
      category: s.category, payment_terms: s.paymentTerms,
      lead_days: s.deliveryLeadDays, notes: s.notes,
      type: s.type, active: s.active ? 1 : 0,
      trade_name: s.tradeName || s.fantasia || '',
    })
  }
  return ok(c, { supplier: s })
})

app.delete('/api/supplier/:id', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const idx = tenant.suppliers.findIndex((s: any) => s.id === id)
  if (idx === -1) return err(c, 'Fornecedor não encontrado', 404)
  tenant.suppliers.splice(idx, 1)
  if (db && userId !== 'demo-tenant') await dbDelete(db, 'suppliers', id, userId)
  return ok(c)
})

app.get('/api/suppliers', (c) => ok(c, { suppliers: getCtxTenant(c).suppliers }))

// ── API: GET /cadastros/api/categories ───────────────────────────────────────
app.get('/api/categories', (c) => {
  const tenant = getCtxTenant(c)
  const DEFAULT_CATEGORIES = ['Matéria-Prima', 'Componente', 'Fixador', 'Embalagem', 'Serviço']
  const customNames = (tenant.supplierCategories || []).map((c: any) => c.name)
  const all = [...new Set([...DEFAULT_CATEGORIES, ...customNames])]
  return ok(c, { categories: all, custom: tenant.supplierCategories || [] })
})

// ── API: POST /cadastros/api/categories ──────────────────────────────────────
app.post('/api/categories', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const empresaId = getCtxEmpresaId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.name || !body.name.trim()) return err(c, 'Nome obrigatório')
  const name = body.name.trim()
  if (!tenant.supplierCategories) tenant.supplierCategories = []
  // Prevent duplicates (case-insensitive)
  const DEFAULT_CATEGORIES = ['Matéria-Prima', 'Componente', 'Fixador', 'Embalagem', 'Serviço']
  const existing = [...DEFAULT_CATEGORIES, ...tenant.supplierCategories.map((c: any) => c.name)]
  const lowerExisting = new Set(existing.map((n: string) => n.toLowerCase()))
  if (lowerExisting.has(name.toLowerCase())) {
    return err(c, 'Categoria já existe')
  }
  const id = genId('cat')
  const category = { id, name, createdAt: new Date().toISOString() }
  tenant.supplierCategories.push(category)
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'supplier_categories', { id, user_id: userId, empresa_id: empresaId, name })
  }
  return ok(c, { category })
})

// ── API: POST /cadastros/api/supplier/vinc ───────────────────────────────────
app.post('/api/supplier/vinc', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const empresaId = getCtxEmpresaId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.productCode) return err(c, 'Produto obrigatório')
  // Guardar vinculação na lista de productSuppliers do tenant
  if (!tenant.productSuppliers) tenant.productSuppliers = []
  // Remove vinculações anteriores do mesmo produto
  tenant.productSuppliers = tenant.productSuppliers.filter((v: any) => v.productCode !== body.productCode)
  if (body.type === 'external' && Array.isArray(body.suppliers)) {
    const supplierIds = body.suppliers.map((s: any) => s.supplierId).filter(Boolean)
    const priorities: Record<string, number> = {}
    body.suppliers.forEach((s: any) => { if (s.supplierId) priorities[s.supplierId] = s.priority || 1 })
    tenant.productSuppliers.push({ id: genId('vinc'), productCode: body.productCode, supplierIds, priorities, internalProduction: false })
  } else if (body.type === 'internal') {
    tenant.productSuppliers.push({ id: genId('vinc'), productCode: body.productCode, supplierIds: [], priorities: {}, internalProduction: true })
  }
  // Atualizar supplier_id_2/3/4 no produto em memória
  const product = tenant.products?.find((p: any) => p.code === body.productCode)
  if (product && body.type === 'external' && Array.isArray(body.suppliers)) {
    const sortedIds = body.suppliers
      .sort((a: any, b: any) => (a.priority || 1) - (b.priority || 1))
      .map((s: any) => s.supplierId)
      .filter(Boolean)
    product.supplier_id_2 = sortedIds[0] || ''
    product.supplier_id_3 = sortedIds[1] || ''
    product.supplier_id_4 = sortedIds[2] || ''
  }
  // Persistir em D1
  if (db && userId !== 'demo-tenant') {
    try {
      // Migração de schema: garantir que colunas supplier_id_1/2/3/4 existam em products
      const prodTableInfo = await db.prepare('PRAGMA table_info(products)').all()
      const prodColumns = (prodTableInfo.results ?? []).map((col: any) => col.name)
      const hasSupplier1 = prodColumns.includes('supplier_id_1')
      const hasSupplier2 = prodColumns.includes('supplier_id_2')
      const hasSupplier3 = prodColumns.includes('supplier_id_3')
      const hasSupplier4 = prodColumns.includes('supplier_id_4')
      const hasLegacySupplier = prodColumns.includes('supplier_id') && !hasSupplier1
      if (hasLegacySupplier) {
        try {
          await db.prepare('ALTER TABLE products RENAME COLUMN supplier_id TO supplier_id_1').run()
          console.log('[VINCULAÇÃO] ✅ products: supplier_id renomeada para supplier_id_1')
        } catch {
          try {
            await db.prepare('ALTER TABLE products ADD COLUMN supplier_id_1 TEXT').run()
            await db.prepare('UPDATE products SET supplier_id_1 = supplier_id WHERE supplier_id_1 IS NULL').run()
          } catch (fallbackError: any) {
            if (!fallbackError.message?.includes('duplicate column')) console.warn('[VINCULAÇÃO] Aviso ao migrar supplier_id:', fallbackError.message)
          }
        }
      }
      if (!hasSupplier1 && !hasLegacySupplier) {
        try { await db.prepare('ALTER TABLE products ADD COLUMN supplier_id_1 TEXT').run() } catch (e: any) { if (!e.message?.includes('duplicate column')) throw e }
      }
      if (!hasSupplier2) {
        try { await db.prepare('ALTER TABLE products ADD COLUMN supplier_id_2 TEXT').run() } catch (e: any) { if (!e.message?.includes('duplicate column')) throw e }
      }
      if (!hasSupplier3) {
        try { await db.prepare('ALTER TABLE products ADD COLUMN supplier_id_3 TEXT').run() } catch (e: any) { if (!e.message?.includes('duplicate column')) throw e }
      }
      if (!hasSupplier4) {
        try { await db.prepare('ALTER TABLE products ADD COLUMN supplier_id_4 TEXT').run() } catch (e: any) { if (!e.message?.includes('duplicate column')) throw e }
      }
      console.log('[VINCULAÇÃO] ✅ Schema de products verificado')
    } catch (migError: any) {
      console.error('[VINCULAÇÃO] Erro na migração de schema de products:', migError.message)
      return err(c, `Erro na migração: ${migError.message}`, 500)
    }
    try {
      // Verificar e corrigir schema automaticamente antes de persistir
      const tableInfo = await db.prepare('PRAGMA table_info(product_suppliers)').all()
      const columns = tableInfo.results ?? []
      const hasProductCode = columns.some((col: any) => col.name === 'product_code')
      const hasCode = columns.some((col: any) => col.name === 'code')
      const hasUserId = columns.some((col: any) => col.name === 'user_id')
      const hasEmpresaId = columns.some((col: any) => col.name === 'empresa_id')
      if (!hasProductCode && hasCode) {
        console.log('[VINCULAÇÃO] ⚠️ Migrando: code → product_code')
        try {
          await db.prepare('ALTER TABLE product_suppliers RENAME COLUMN code TO product_code').run()
          console.log('[VINCULAÇÃO] ✅ Coluna renomeada')
        } catch (renameError: any) {
          console.log('[VINCULAÇÃO] Fallback: criando product_code', renameError?.message)
          await db.prepare('ALTER TABLE product_suppliers ADD COLUMN product_code TEXT').run()
          await db.prepare('UPDATE product_suppliers SET product_code = code WHERE product_code IS NULL').run()
        }
      } else if (!hasProductCode) {
        console.log('[VINCULAÇÃO] Criando coluna product_code')
        await db.prepare('ALTER TABLE product_suppliers ADD COLUMN product_code TEXT').run()
      }
      if (!hasUserId) {
        console.log('[VINCULAÇÃO] Adicionando coluna user_id...')
        try {
          await db.prepare("ALTER TABLE product_suppliers ADD COLUMN user_id TEXT NOT NULL DEFAULT ''").run()
          console.log('[VINCULAÇÃO] ✅ Coluna user_id adicionada')
        } catch (e: any) {
          if (!e.message?.includes('duplicate column')) throw e
          console.log('[VINCULAÇÃO] Coluna user_id já existe')
        }
      }
      if (!hasEmpresaId) {
        console.log('[VINCULAÇÃO] Adicionando coluna empresa_id...')
        try {
          await db.prepare('ALTER TABLE product_suppliers ADD COLUMN empresa_id TEXT').run()
          console.log('[VINCULAÇÃO] ✅ Coluna empresa_id adicionada')
        } catch (e: any) {
          if (!e.message?.includes('duplicate column')) throw e
          console.log('[VINCULAÇÃO] Coluna empresa_id já existe')
        }
      }
      // Criar índices para performance
      try {
        await db.prepare('CREATE INDEX IF NOT EXISTS idx_ps_user_id ON product_suppliers(user_id)').run()
        await db.prepare('CREATE INDEX IF NOT EXISTS idx_ps_product_code ON product_suppliers(product_code)').run()
        await db.prepare('CREATE INDEX IF NOT EXISTS idx_ps_product_id ON product_suppliers(product_id)').run()
      } catch (e: any) {
        console.warn('[VINCULAÇÃO] Aviso ao criar índices:', e.message)
      }
      await db.prepare('DELETE FROM product_suppliers WHERE product_code = ? AND user_id = ?')
        .bind(body.productCode, userId).run()
      if (body.type === 'external' && Array.isArray(body.suppliers)) {
        for (const sup of body.suppliers) {
          if (!sup.supplierId) continue
          const persistResult = await dbInsertWithRetry(db, 'product_suppliers', {
            id: genId('ps'),
            user_id: userId,
            empresa_id: empresaId,
            product_id: product?.id || '',
            product_code: body.productCode,
            supplier_id: sup.supplierId,
            priority: sup.priority || 1,
            internal_production: 0,
          })
          if (!persistResult.success) {
            console.error(`[VINCULAÇÃO] Falha ao persistir ${body.productCode} x ${sup.supplierId}: ${persistResult.error}`)
            return err(c, `Falha ao persistir vinculação em D1: ${persistResult.error}`, 500)
          }
        }
        // Atualizar colunas supplier_id_2/3/4 no produto em D1
        const sortedIds = body.suppliers
          .sort((a: any, b: any) => (a.priority || 1) - (b.priority || 1))
          .map((s: any) => s.supplierId)
          .filter(Boolean)
        await db.prepare(
          `UPDATE products SET supplier_id_2 = ?, supplier_id_3 = ?, supplier_id_4 = ? WHERE user_id = ? AND code = ?`
        ).bind(sortedIds[0] || null, sortedIds[1] || null, sortedIds[2] || null, userId, body.productCode).run()
        console.log(`[VINCULAÇÃO] Fornecedores 2/3/4 atualizados em D1 para ${body.productCode}`)
      } else if (body.type === 'internal') {
        await dbInsertWithRetry(db, 'product_suppliers', {
          id: genId('ps'),
          user_id: userId,
          empresa_id: empresaId,
          product_id: product?.id || '',
          product_code: body.productCode,
          supplier_id: '',
          priority: 1,
          internal_production: 1,
        })
      }
    } catch (e) {
      console.error('[VINCULAÇÃO] Erro ao persistir em D1:', e)
      return err(c, `Erro ao persistir vinculação: ${(e as any).message}`, 500)
    }
  }
  markTenantModified(userId)
  return ok(c, { saved: true })
})

// ── API: GET /cadastros/api/check-schema ─────────────────────────────────────
app.get('/api/check-schema', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  if (!db || userId === 'demo-tenant') {
    return ok(c, { message: 'Modo demo - sem D1' })
  }
  try {
    const psInfo = await db.prepare('PRAGMA table_info(product_suppliers)').all()
    const psColumns = psInfo.results?.map((col: any) => ({ name: col.name, type: col.type, notnull: col.notnull, pk: col.pk })) || []
    const prodInfo = await db.prepare('PRAGMA table_info(products)').all()
    const prodColumns = prodInfo.results?.map((col: any) => ({ name: col.name, type: col.type, notnull: col.notnull, pk: col.pk })) || []
    return ok(c, {
      status: 'ok',
      product_suppliers: {
        columns: psColumns,
        has_user_id: psColumns.some((col: any) => col.name === 'user_id'),
        has_empresa_id: psColumns.some((col: any) => col.name === 'empresa_id'),
        has_product_id: psColumns.some((col: any) => col.name === 'product_id'),
        has_product_code: psColumns.some((col: any) => col.name === 'product_code'),
      },
      products: {
        has_supplier_id_1: prodColumns.some((col: any) => col.name === 'supplier_id_1'),
        has_supplier_id_2: prodColumns.some((col: any) => col.name === 'supplier_id_2'),
        has_supplier_id_3: prodColumns.some((col: any) => col.name === 'supplier_id_3'),
        has_supplier_id_4: prodColumns.some((col: any) => col.name === 'supplier_id_4'),
      },
    })
  } catch (e) {
    return err(c, `Erro ao verificar schema: ${(e as any).message}`, 500)
  }
})

// ── API: GET /cadastros/api/check-migrations ─────────────────────────────────
app.get('/api/check-migrations', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  if (!db || userId === 'demo-tenant') {
    return ok(c, { message: 'Modo demo - sem D1' })
  }
  try {
    console.log('[MIGRATIONS] Verificando estrutura de tabelas...')
    const psInfo = await db.prepare('PRAGMA table_info(product_suppliers)').all()
    const psColumns = psInfo.results?.map((col: any) => col.name) ?? []
    console.log('[MIGRATIONS] product_suppliers columns:', psColumns)
    return ok(c, {
      status: 'ok',
      product_suppliers: {
        exists: psColumns.length > 0,
        has_product_code: psColumns.includes('product_code'),
        has_code: psColumns.includes('code'),
        columns: psColumns,
      },
    })
  } catch (e) {
    return err(c, `Erro ao verificar: ${(e as any).message}`, 500)
  }
})

export default app
