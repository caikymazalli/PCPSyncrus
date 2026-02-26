import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxUserId } from '../sessionHelper'
import { genId, dbInsert, dbUpdate, dbDelete, ok, err } from '../dbHelpers'

const app = new Hono()

app.get('/', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const mockData = tenant  // per-session data
  const suppliers = (mockData as any).suppliers || []
  const productSuppliers = (mockData as any).productSuppliers || []
  const stockItems = (mockData as any).stockItems || []
  const products = (mockData as any).products || []

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
            <option value="Matéria-Prima">Matéria-Prima</option>
            <option value="Componente">Componente</option>
            <option value="Fixador">Fixador</option>
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
          <div class="card sup-card" data-type="${s.type}" data-cat="${s.category}" data-search="${s.name.toLowerCase()} ${(s.cnpj||'').toLowerCase()} ${s.contact.toLowerCase()} ${s.category.toLowerCase()}" style="padding:0;overflow:hidden;border-top:3px solid ${ti.color};">
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
                  <button class="btn btn-sm" style="background:#e8f4fd;color:#2980B9;border:1px solid #bee3f8;" onclick="alert('Abrindo solicitação de cotação para ${s.name}...')">
                    <i class="fas fa-file-invoice-dollar"></i>
                  </button>
                </div>
                <div class="tooltip-wrap" data-tooltip="Inativar fornecedor">
                  <button class="btn btn-danger btn-sm" onclick="if(confirm('Inativar ${s.name}?')) alert('Fornecedor inativado.')"><i class="fas fa-ban"></i></button>
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
                        <button class="btn btn-sm" style="background:#e8f4fd;color:#2980B9;border:1px solid #bee3f8;" onclick="alert('Cotação solicitada para ${item?.name||ps.productCode}')">
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
          <div class="form-group" id="fCnpjGroup"><label class="form-label">CNPJ *</label><input class="form-control" id="sup_cnpj" type="text" placeholder="00.000.000/0001-00"></div>
          <div class="form-group"><label class="form-label">E-mail *</label><input class="form-control" id="sup_email" type="email" placeholder="vendas@fornecedor.com"></div>
          <div class="form-group"><label class="form-label">Telefone</label><input class="form-control" id="sup_tel" type="text" placeholder="(11) 9999-9999"></div>
          <div class="form-group"><label class="form-label">Contato Principal</label><input class="form-control" id="sup_contato" type="text" placeholder="Nome do responsável"></div>
          <div class="form-group"><label class="form-label">Categoria</label>
            <select class="form-control" id="sup_categoria">
              <option value="materia_prima">Matéria-Prima</option><option value="componente">Componente</option><option value="fixador">Fixador</option><option value="embalagem">Embalagem</option><option value="servico">Serviço</option>
            </select>
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

  <script>
  const suppliersData = ${JSON.stringify(suppliers)};
  const productSuppliersData = ${JSON.stringify(productSuppliers)};
  const allItemsData = ${JSON.stringify(allItems)};
  const supplierProductMapData = ${JSON.stringify(supplierProductMap)};

  function filterSuppliers() {
    const search = document.getElementById('supSearch').value.toLowerCase();
    const type = document.getElementById('supTypeFilter').value;
    const cat = document.getElementById('supCatFilter').value;
    document.querySelectorAll('.sup-card').forEach(card => {
      const matchSearch = !search || (card.dataset.search || '').includes(search);
      const matchType = !type || card.dataset.type === type;
      const matchCat = !cat || card.dataset.cat === cat;
      card.parentElement.style.display = (matchSearch && matchType && matchCat) ? '' : 'none';
    });
  }

  function toggleFornType(val) {
    const nac = document.getElementById('fType_nac');
    const imp = document.getElementById('fType_imp');
    if (nac) nac.style.borderColor = val==='nacional'?'#16a34a':'#d1d5db';
    if (imp) imp.style.borderColor = val==='importado'?'#2980B9':'#d1d5db';
    const cnpjLabel = document.getElementById('fCnpjGroup')?.querySelector('label');
    if (cnpjLabel) cnpjLabel.textContent = val==='importado'?'Tax ID / Registration':'CNPJ';
    const ncmGroup = document.getElementById('fNcmGroup');
    if (ncmGroup) ncmGroup.style.display = val==='importado'?'block':'none';
    const descGroup = document.getElementById('fDescImpGroup');
    if (descGroup) descGroup.style.display = val==='importado'?'grid':'none';
  }

  function toggleVincType(val) {
    document.getElementById('vincType_ext').style.borderColor = val==='external'?'#2980B9':'#d1d5db';
    document.getElementById('vincType_int').style.borderColor = val==='internal'?'#7c3aed':'#d1d5db';
    document.getElementById('vincSuppliersSection').style.display = val==='external'?'block':'none';
    document.getElementById('vincInternalInfo').style.display = val==='internal'?'block':'none';
  }

  function addVincSupplier() {
    const list = document.getElementById('vincSupplierList');
    const count = list.children.length + 1;
    const div = document.createElement('div');
    div.className = 'vinc-supplier-row';
    div.style.cssText = 'display:grid;grid-template-columns:32px 2fr 80px auto;gap:8px;align-items:center;margin-bottom:8px;background:#f8f9fa;padding:8px;border-radius:8px;';
    const bgColors = ['#1B4F72','#9ca3af','#d1d5db'];
    div.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:' + (bgColors[count-1]||'#d1d5db') + ';color:white;border-radius:50%;font-size:11px;font-weight:700;">' + count + '</div>' +
      '<select class="form-control" style="font-size:12px;"><option value="">Selecionar fornecedor...</option>' +
      suppliersData.map(s => '<option value="'+s.id+'">'+s.name+'</option>').join('') +
      '</select>' +
      '<select class="form-control" style="font-size:12px;"><option value="1">Principal</option><option value="2">Backup</option><option value="3">Terciário</option></select>' +
      '<button class="btn btn-danger btn-sm" onclick="this.closest(\\'.vinc-supplier-row\\').remove()"><i class="fas fa-trash"></i></button>';
    list.appendChild(div);
  }

  function openSupplierDetail(id) {
    const s = suppliersData.find(x => x.id === id);
    if (!s) return;
    const prods = supplierProductMapData[id] || [];
    const ti = s.type === 'importado' ? { label:'Importado', color:'#2980B9', bg:'#e8f4fd' } : { label:'Nacional', color:'#16a34a', bg:'#f0fdf4' };
    const stars = Array.from({length:5}, (_,i) => '<i class="fas fa-star" style="font-size:14px;color:'+(i<Math.round(s.rating)?'#F39C12':'#e9ecef')+'"></i>').join('');
    document.getElementById('supDetailTitle').innerHTML = '<i class="fas fa-truck" style="margin-right:8px;"></i>' + s.name;
    document.getElementById('supDetailBody').innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
      row2('Razão Social', s.name) +
      row2('Nome Fantasia', s.tradeName) +
      row2('CNPJ / Tax ID', s.cnpj || '—') +
      row2('Tipo', '<span class="badge" style="background:'+ti.bg+';color:'+ti.color+';">'+ti.label+'</span>') +
      row2('Contato', s.contact) +
      row2('E-mail', '<a href="mailto:'+s.email+'" style="color:#2980B9;">'+s.email+'</a>') +
      row2('Telefone', s.phone) +
      row2('Cidade / Estado', s.city + ' — ' + s.state) +
      row2('País', s.country) +
      row2('Categoria', s.category) +
      row2('Prazo Entrega', '<strong>'+s.deliveryLeadDays+' dias</strong>') +
      row2('Pgto', s.paymentTerms) +
      row2('Avaliação', stars + ' <span style="font-size:13px;font-weight:600;color:#374151;">'+s.rating+'/5</span>') +
      row2('Status', s.active?'<span class="badge badge-success">Ativo</span>':'<span class="badge badge-secondary">Inativo</span>') +
      (prods.length > 0 ? '<div style="grid-column:span 2;background:#e8f4fd;border-radius:8px;padding:10px;"><div style="font-size:11px;font-weight:700;color:#2980B9;margin-bottom:6px;">PRODUTOS FORNECIDOS</div><div style="font-size:13px;color:#374151;">'+prods.join(', ')+'</div></div>' : '') +
      (s.notes ? '<div style="grid-column:span 2;background:#f8f9fa;border-radius:8px;padding:10px;"><div style="font-size:11px;font-weight:700;color:#9ca3af;margin-bottom:4px;">OBSERVAÇÕES</div><div style="font-size:13px;color:#374151;">'+s.notes+'</div></div>' : '') +
      '</div>';
    openModal('supplierDetailModal');
  }

  function row2(label, value) {
    return '<div style="background:#f8f9fa;border-radius:8px;padding:10px 12px;">' +
      '<div style="font-size:10px;color:#9ca3af;font-weight:600;">'+label.toUpperCase()+'</div>' +
      '<div style="font-size:13px;color:#374151;margin-top:3px;">'+value+'</div>' +
    '</div>';
  }

  function openEditSupplier(id) {
    const s = suppliersData.find(x => x.id === id);
    if (!s) { showToast('Fornecedor não encontrado', 'error'); return; }
    // Resetar campos antes de preencher (evita valores residuais)
    const fields = ['sup_id','sup_nome','sup_fantasia','sup_cnpj','sup_email','sup_tel','sup_contato','sup_cidade','sup_estado','sup_pagamento','sup_obs'];
    fields.forEach(fid => { const el = document.getElementById(fid); if(el) (el as HTMLInputElement).value = ''; });
    // Preencher todos os campos com dados do fornecedor
    const set = (fid: string, val: any) => { const el = document.getElementById(fid); if(el) (el as HTMLInputElement).value = val || ''; };
    set('sup_id', s.id);
    set('sup_nome', s.name);
    set('sup_fantasia', s.fantasia || s.tradeName);
    set('sup_cnpj', s.cnpj);
    set('sup_email', s.email);
    set('sup_tel', s.phone || s.tel);
    set('sup_contato', s.contact);
    set('sup_cidade', s.city);
    set('sup_estado', s.state);
    set('sup_pagamento', s.paymentTerms);
    set('sup_prazo', s.deliveryLeadDays);
    set('sup_obs', s.notes || s.obs);
    // Categoria
    const catEl = document.getElementById('sup_categoria') as HTMLSelectElement;
    if (catEl) catEl.value = s.category || 'materia_prima';
    // Tipo nacional/importado
    const tipo = s.type || 'nacional';
    document.querySelectorAll('input[name="fType"]').forEach((r: any) => { r.checked = (r.value === tipo); });
    toggleFornType(tipo);
    // Título do modal
    document.getElementById('fornModalTitle').innerHTML = '<i class="fas fa-edit" style="margin-right:8px;"></i>Editar Fornecedor: ' + (s.name || '');
    openModal('novoFornecedorModal');
  }

  async function salvarVinculacao() {
    const prod = document.getElementById('vincProduto')?.value || '';
    if (!prod) { showToast('Selecione um produto!', 'error'); return; }
    const vincType = document.querySelector('input[name="vincType"]:checked')?.value || 'external';
    const rows = document.querySelectorAll('.vinc-supplier-row');
    const suppliers_vinc = [];
    rows.forEach((row, idx) => {
      const sel = row.querySelector('select');
      const priSel = row.querySelectorAll('select')[1];
      if (sel?.value) suppliers_vinc.push({ supplierId: sel.value, priority: parseInt(priSel?.value || '1') });
    });
    if (vincType === 'external' && suppliers_vinc.length === 0) { showToast('Adicione ao menos um fornecedor!', 'error'); return; }
    try {
      const res = await fetch('/cadastros/api/supplier/vinc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productCode: prod, type: vincType, suppliers: suppliers_vinc })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('✅ Vinculação salva!');
        closeModal('vinculacaoModal');
        setTimeout(() => location.reload(), 800);
      } else {
        showToast(data.error || 'Erro ao salvar vinculação', 'error');
      }
    } catch(e) { showToast('Erro de conexão', 'error'); }
  }

  // Auto close alert after 8s
  setTimeout(() => { const el = document.getElementById('noSupplierAlert'); if(el) el.style.display='none'; }, 8000);
  

  async function salvarFornecedor() {
    const editId = document.getElementById('sup_id')?.value || '';
    const name = document.getElementById('sup_nome')?.value || '';
    const cnpj = document.getElementById('sup_cnpj')?.value || '';
    const email = document.getElementById('sup_email')?.value || '';
    const phone = document.getElementById('sup_tel')?.value || '';
    const contact = document.getElementById('sup_contato')?.value || '';
    const city = document.getElementById('sup_cidade')?.value || '';
    const state = document.getElementById('sup_estado')?.value || '';
    const category = document.getElementById('sup_categoria')?.value || '';
    const paymentTerms = document.getElementById('sup_pagamento')?.value || '';
    const deliveryLeadDays = document.getElementById('sup_prazo')?.value || 0;
    const notes = document.getElementById('sup_obs')?.value || '';
    const type = document.querySelector('input[name="fType"]:checked')?.value || 'nacional';
    const fantasia = document.getElementById('sup_fantasia')?.value || '';
    
    if (!name) { showToast('Informe o nome!', 'error'); return; }
    
    const payload = { name, fantasia, cnpj, email, phone, contact, city, state, category, paymentTerms, deliveryLeadDays, notes, type };
    
    try {
      let res;
      if (editId) {
        res = await fetch('/cadastros/api/supplier/' + editId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/cadastros/api/supplier/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      const data = await res.json();
      if (data.ok) {
        showToast(editId ? '✅ Fornecedor atualizado!' : '✅ Fornecedor cadastrado!');
        document.getElementById('sup_id').value = '';
        document.getElementById('fornModalTitle').innerHTML = '<i class="fas fa-truck" style="margin-right:8px;"></i>Cadastrar Fornecedor';
        closeModal('novoFornecedorModal');
        setTimeout(() => location.reload(), 800);
      } else {
        showToast(data.error || 'Erro ao salvar', 'error');
      }
    } catch(e) { showToast('Erro de conexão', 'error'); }
  }

  async function deleteFornecedor(id) {
    if (!confirm('Excluir este fornecedor?')) return;
    try {
      const res = await fetch('/cadastros/api/supplier/' + id, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) { showToast('Fornecedor excluído!'); setTimeout(() => location.reload(), 500); }
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

  return c.html(layout('Cadastros — Fornecedores', content, 'cadastros', userInfo))
})

// ── API: POST /cadastros/api/supplier/create ─────────────────────────────────
app.post('/api/supplier/create', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
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
    await dbInsert(db, 'suppliers', {
      id, user_id: userId, name: supplier.name, cnpj: supplier.cnpj,
      email: supplier.email, phone: supplier.phone, contact: supplier.contact,
      city: supplier.city, state: supplier.state, active: 1,
    })
  }
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
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'suppliers', id, userId, {
      name: s.name, cnpj: s.cnpj, email: s.email, phone: s.phone,
      contact: s.contact, city: s.city, state: s.state,
      category: s.category, paymentTerms: s.paymentTerms,
      deliveryLeadDays: s.deliveryLeadDays, notes: s.notes,
      type: s.type, active: s.active ? 1 : 0,
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

// ── API: POST /cadastros/api/supplier/vinc ───────────────────────────────────
app.post('/api/supplier/vinc', async (c) => {
  const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.productCode) return err(c, 'Produto obrigatório')
  // Guardar vinculação na lista de productSuppliers do tenant
  if (!tenant.productSuppliers) tenant.productSuppliers = []
  // Remove vinculações anteriores do mesmo produto
  tenant.productSuppliers = tenant.productSuppliers.filter((v: any) => v.productCode !== body.productCode)
  if (body.type === 'external' && Array.isArray(body.suppliers)) {
    body.suppliers.forEach((s: any) => {
      tenant.productSuppliers.push({ id: genId('vinc'), productCode: body.productCode, supplierId: s.supplierId, priority: s.priority, type: 'external' })
    })
  } else if (body.type === 'internal') {
    tenant.productSuppliers.push({ id: genId('vinc'), productCode: body.productCode, type: 'internal' })
  }
  return ok(c, { saved: true })
})

export default app
