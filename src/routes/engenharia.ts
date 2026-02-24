import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxUserId } from '../sessionHelper'
import { genId, dbInsert, dbUpdate, dbDelete, ok, err } from '../dbHelpers'

const app = new Hono()

app.get('/', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const mockData = tenant  // per-session data
  const products = (mockData as any).products || []
  const bomItems = (mockData as any).bomItems || []
  const routes = (mockData as any).routes || []

  const content = `
  <!-- Header -->
  <div class="section-header">
    <div style="font-size:14px;color:#6c757d;">BOM (Lista de Materiais) e Roteiros de Fabricação</div>
    <button class="btn btn-primary" onclick="openModal('novoProdutoModal')"><i class="fas fa-plus"></i> Novo Produto</button>
  </div>

  <div data-tab-group="eng">
    <div class="tab-nav">
      <button class="tab-btn active" onclick="switchTab('tabProdutos','eng')"><i class="fas fa-box" style="margin-right:6px;"></i>Produtos (${products.length})</button>
      <button class="tab-btn" onclick="switchTab('tabBOM','eng')"><i class="fas fa-list-ul" style="margin-right:6px;"></i>BOM — Lista de Materiais</button>
      <button class="tab-btn" onclick="switchTab('tabRoteiros','eng')"><i class="fas fa-route" style="margin-right:6px;"></i>Roteiros (${routes.length})</button>
    </div>

    <!-- Produtos -->
    <div class="tab-content active" id="tabProdutos">
      <div class="card" style="overflow:hidden;">
        <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
          <div class="search-box" style="flex:1;max-width:320px;">
            <i class="fas fa-search icon"></i>
            <input class="form-control" type="text" placeholder="Buscar produto...">
          </div>
          <button class="btn btn-primary btn-sm" onclick="openModal('novoProdutoModal')"><i class="fas fa-plus"></i> Novo</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Código</th><th>Nome</th><th>Descrição</th><th>Unidade</th><th>BOM</th><th>Roteiros</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${products.map(p => {
                const bomCount = bomItems.filter(b => b.productCode === p.code).length
                const routeCount = routes.filter(r => r.productCode === p.code).length
                return `
                <tr>
                  <td><span style="font-family:monospace;font-size:12px;background:#f1f5f9;padding:2px 8px;border-radius:4px;color:#1B4F72;font-weight:700;">${p.code}</span></td>
                  <td style="font-weight:600;color:#374151;">${p.name}</td>
                  <td style="font-size:12px;color:#6c757d;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.description || '—'}</td>
                  <td><span class="chip" style="background:#f1f5f9;color:#374151;">${p.unit}</span></td>
                  <td>
                    <a href="#" onclick="showBOM('${p.code}');return false;" style="font-size:12px;font-weight:600;color:${bomCount > 0 ? '#2980B9' : '#9ca3af'};">
                      ${bomCount > 0 ? `<i class="fas fa-list"></i> ${bomCount} itens` : '<i class="fas fa-plus"></i> Adicionar'}
                    </a>
                  </td>
                  <td>
                    <a href="#" onclick="showRoteiro('${p.code}');return false;" style="font-size:12px;font-weight:600;color:${routeCount > 0 ? '#27AE60' : '#9ca3af'};">
                      ${routeCount > 0 ? `<i class="fas fa-route"></i> ${routeCount} roteiros` : '<i class="fas fa-plus"></i> Adicionar'}
                    </a>
                  </td>
                  <td>
                    <div style="display:flex;gap:4px;">
                      <button class="btn btn-secondary btn-sm" onclick="openModal('novoProdutoModal')"><i class="fas fa-edit"></i></button>
                      <button class="btn btn-danger btn-sm" onclick="alert('Confirmar?')"><i class="fas fa-trash"></i></button>
                    </div>
                  </td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- BOM Tab -->
    <div class="tab-content" id="tabBOM">
      <div style="display:grid;grid-template-columns:280px 1fr;gap:20px;">
        <!-- Product selector -->
        <div class="card" style="padding:16px;">
          <div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:12px;">Selecionar Produto</div>
          <div style="display:flex;flex-direction:column;gap:2px;">
            ${products.map((p, i) => `
            <button onclick="selectBOMProduct('${p.code}')" id="bomBtn_${p.code}" class="nav-item ${i === 0 ? 'active' : ''}" style="text-align:left;border:none;cursor:pointer;border-radius:6px;padding:8px 10px;">
              <div style="font-size:13px;font-weight:600;">${p.name}</div>
              <div style="font-size:10px;opacity:0.7;">${p.code}</div>
            </button>`).join('')}
          </div>
        </div>

        <!-- BOM content -->
        <div>
          <div class="card" style="overflow:hidden;" id="bomContent">
            <div style="padding:16px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
              <h4 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;" id="bomTitle">BOM — ${products[0]?.name}</h4>
              <button class="btn btn-primary btn-sm" onclick="openModal('novoBOMModal')"><i class="fas fa-plus"></i> Adicionar Componente</button>
            </div>
            <div class="table-wrapper" id="bomTable">
              <table>
                <thead><tr><th>#</th><th>Componente</th><th>Código</th><th>Quantidade</th><th>Unidade</th><th>Notas</th><th>Ações</th></tr></thead>
                <tbody id="bomBody">
                  ${bomItems.filter(b => b.productCode === products[0]?.code).map((b, idx) => `
                  <tr>
                    <td style="color:#9ca3af;font-size:12px;">${idx + 1}</td>
                    <td style="font-weight:600;color:#374151;">${b.componentName}</td>
                    <td><span style="font-family:monospace;font-size:11px;background:#f1f5f9;padding:1px 6px;border-radius:4px;color:#6c757d;">${b.componentCode || '—'}</span></td>
                    <td style="font-weight:700;color:#1B4F72;">${b.quantity}</td>
                    <td><span class="chip" style="background:#f1f5f9;color:#374151;">${b.unit}</span></td>
                    <td style="font-size:12px;color:#9ca3af;">—</td>
                    <td>
                      <div style="display:flex;gap:4px;">
                        <button class="btn btn-secondary btn-sm"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-danger btn-sm"><i class="fas fa-trash"></i></button>
                      </div>
                    </td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Roteiros Tab -->
    <div class="tab-content" id="tabRoteiros">
      <!-- Header da aba -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-size:14px;font-weight:700;color:#1B4F72;">Roteiros de Fabricação</div>
          <div style="font-size:12px;color:#6c757d;margin-top:2px;">Sequência de operações para fabricação de cada produto</div>
        </div>
        <button class="btn btn-primary" onclick="openNovoRoteiro()">
          <i class="fas fa-plus"></i> Novo Roteiro
        </button>
      </div>

      ${routes.length === 0 ? `
      <!-- Estado vazio -->
      <div class="card" style="padding:56px 20px;text-align:center;color:#9ca3af;">
        <i class="fas fa-route" style="font-size:40px;margin-bottom:16px;display:block;opacity:0.2;"></i>
        <div style="font-size:16px;font-weight:600;color:#6c757d;margin-bottom:6px;">Nenhum roteiro cadastrado</div>
        <div style="font-size:13px;margin-bottom:20px;">Crie roteiros para definir a sequência de operações de fabricação de cada produto.</div>
        <button class="btn btn-primary" onclick="openNovoRoteiro()">
          <i class="fas fa-plus"></i> Criar Primeiro Roteiro
        </button>
      </div>` : `
      <!-- Lista de roteiros -->
      <div style="display:flex;flex-direction:column;gap:20px;">
        ${routes.map((r: any) => `
        <div class="card" style="overflow:hidden;">
          <div style="padding:16px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(to right,#f8fafc,#fff);">
            <div>
              <div style="font-size:15px;font-weight:700;color:#1B4F72;">${r.name}</div>
              <div style="font-size:12px;color:#9ca3af;margin-top:2px;"><i class="fas fa-box" style="margin-right:4px;"></i>${r.productName || '—'} ${r.productCode ? '(' + r.productCode + ')' : ''}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="font-size:12px;color:#6c757d;">${(r.steps||[]).length} operação(ões)</span>
              <span style="font-size:12px;color:#27AE60;font-weight:700;"><i class="fas fa-clock" style="margin-right:4px;"></i>${(r.steps||[]).reduce((acc: number, s: any) => acc + (s.standardTime||0), 0)} min total</span>
              <button class="btn btn-danger btn-sm" onclick="deleteRoteiro('${r.id}')" title="Excluir roteiro"><i class="fas fa-trash"></i></button>
            </div>
          </div>
          <div style="padding:16px 20px;">
            ${(r.steps||[]).length === 0 ? `
            <div style="text-align:center;padding:16px;color:#9ca3af;font-size:13px;">
              <i class="fas fa-list-ol" style="margin-right:6px;opacity:0.4;"></i>Nenhuma operação cadastrada neste roteiro.
            </div>` : `
            <div style="display:flex;gap:0;align-items:center;overflow-x:auto;padding-bottom:8px;">
              ${(r.steps||[]).map((s: any, idx: number) => `
              <div style="display:flex;align-items:center;">
                <div style="min-width:155px;background:#f8f9fa;border-radius:8px;padding:12px;border:1px solid #e9ecef;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <div style="width:22px;height:22px;border-radius:50%;background:#1B4F72;color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${s.order}</div>
                    <div style="font-size:12px;font-weight:700;color:#1B4F72;">${s.operation}</div>
                  </div>
                  <div style="font-size:11px;color:#9ca3af;"><i class="fas fa-clock" style="margin-right:3px;"></i>${s.standardTime} min</div>
                  ${s.machine ? `<div style="font-size:10px;color:#2980B9;margin-top:3px;"><i class="fas fa-cog" style="margin-right:3px;"></i>${s.machine}</div>` : ''}
                  <div style="font-size:10px;margin-top:4px;">
                    <span class="chip" style="background:#e8f4fd;color:#1B4F72;font-size:10px;">${s.resourceType === 'machine' ? '⚙️ Máquina' : s.resourceType === 'workbench' ? '🔧 Bancada' : '👤 Manual'}</span>
                  </div>
                </div>
                ${idx < (r.steps||[]).length - 1 ? '<div style="width:24px;height:2px;background:#d1d5db;flex-shrink:0;"></div><div style="color:#9ca3af;flex-shrink:0;font-size:14px;">›</div><div style="width:4px;height:2px;background:#d1d5db;flex-shrink:0;"></div>' : ''}
              </div>`).join('')}
            </div>`}
          </div>
        </div>`).join('')}
      </div>`}
    </div>
  </div>

  <!-- Modal: Novo Produto -->
  <div class="modal-overlay" id="novoProdutoModal">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-box" style="margin-right:8px;"></i>Novo Produto</h3>
        <button onclick="closeModal('novoProdutoModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Nome do Produto *</label><input class="form-control" type="text" placeholder="Ex: Engrenagem Helicoidal EH-60"></div>
          <div class="form-group"><label class="form-label">Código *</label><input class="form-control" type="text" placeholder="ENG-EH60"></div>
          <div class="form-group"><label class="form-label">Unidade de Medida *</label>
            <select class="form-control"><option value="un">un (unidade)</option><option value="kg">kg (quilograma)</option><option value="m">m (metro)</option><option value="l">l (litro)</option></select>
          </div>
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Descrição</label><textarea class="form-control" rows="3" placeholder="Descrição detalhada do produto..."></textarea></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novoProdutoModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('Produto salvo!');closeModal('novoProdutoModal')" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <!-- Novo BOM Modal -->
  <div class="modal-overlay" id="novoBOMModal">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-plus-circle" style="margin-right:8px;"></i>Adicionar Componente BOM</h3>
        <button onclick="closeModal('novoBOMModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <div class="form-group"><label class="form-label">Nome do Componente *</label><input class="form-control" type="text" placeholder="Ex: Rolamento 6205-2RS"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group"><label class="form-label">Código do Componente</label><input class="form-control" type="text" placeholder="ROL-003"></div>
          <div class="form-group"><label class="form-label">Quantidade *</label><input class="form-control" type="number" placeholder="0" step="0.01"></div>
          <div class="form-group"><label class="form-label">Unidade *</label>
            <select class="form-control"><option value="un">un</option><option value="kg">kg</option><option value="m">m</option><option value="l">l</option></select>
          </div>
        </div>
        <div class="form-group"><label class="form-label">Notas</label><input class="form-control" type="text" placeholder="Especificações adicionais..."></div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novoBOMModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('Componente adicionado!');closeModal('novoBOMModal')" class="btn btn-primary"><i class="fas fa-save"></i> Adicionar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Novo Roteiro -->
  <div class="modal-overlay" id="novoRoteiroModal">
    <div class="modal" style="max-width:700px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-route" style="margin-right:8px;color:#27AE60;"></i>Novo Roteiro de Fabricação</h3>
        <button onclick="closeModal('novoRoteiroModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;max-height:70vh;overflow-y:auto;">

        <!-- Dados gerais -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;">
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Nome do Roteiro *</label>
            <input class="form-control" type="text" id="rot_nome" placeholder="Ex: Roteiro Usinagem – Eixo Principal">
          </div>
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Produto *</label>
            <select class="form-control" id="rot_produto">
              <option value="">— Selecione o produto —</option>
              ${products.map((p: any) => `<option value="${p.id || p.code}" data-code="${p.code}" data-name="${p.name}">${p.name} (${p.code})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Versão</label>
            <input class="form-control" type="text" id="rot_versao" placeholder="Ex: 1.0" value="1.0">
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-control" id="rot_status">
              <option value="active">Ativo</option>
              <option value="draft">Rascunho</option>
              <option value="obsolete">Obsoleto</option>
            </select>
          </div>
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Observações</label>
            <textarea class="form-control" id="rot_obs" rows="2" placeholder="Informações adicionais sobre o roteiro..."></textarea>
          </div>
        </div>

        <!-- Operações / Passos -->
        <div style="border-top:1px solid #f1f3f5;padding-top:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="font-size:13px;font-weight:700;color:#1B4F72;"><i class="fas fa-list-ol" style="margin-right:6px;color:#27AE60;"></i>Operações</div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addRoteiroStep()">
              <i class="fas fa-plus"></i> Adicionar Operação
            </button>
          </div>
          <div id="roteiroStepsContainer" style="display:flex;flex-direction:column;gap:8px;">
            <!-- Passos serão adicionados dinamicamente -->
          </div>
          <div id="roteiroStepsEmpty" style="text-align:center;padding:20px;color:#9ca3af;font-size:13px;border:2px dashed #e9ecef;border-radius:8px;">
            <i class="fas fa-plus-circle" style="font-size:22px;margin-bottom:8px;display:block;opacity:0.4;"></i>
            Clique em "Adicionar Operação" para inserir as etapas do roteiro.
          </div>
        </div>

      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:space-between;align-items:center;">
        <span id="rotStepCount" style="font-size:12px;color:#9ca3af;">0 operação(ões)</span>
        <div style="display:flex;gap:10px;">
          <button onclick="closeModal('novoRoteiroModal')" class="btn btn-secondary">Cancelar</button>
          <button onclick="salvarRoteiro()" class="btn btn-primary"><i class="fas fa-save"></i> Salvar Roteiro</button>
        </div>
      </div>
    </div>
  </div>

  <script>
  const allBOM = ${JSON.stringify(bomItems)};
  const allProducts = ${JSON.stringify(products)};

  // ── Roteiro: abrir modal ──────────────────────────────────────────────────────
  function openNovoRoteiro() {
    // Limpar campos
    document.getElementById('rot_nome').value = '';
    document.getElementById('rot_produto').value = '';
    document.getElementById('rot_versao').value = '1.0';
    document.getElementById('rot_status').value = 'active';
    document.getElementById('rot_obs').value = '';
    document.getElementById('roteiroStepsContainer').innerHTML = '';
    document.getElementById('roteiroStepsEmpty').style.display = 'block';
    document.getElementById('rotStepCount').textContent = '0 operação(ões)';
    _roteiroStepCount = 0;
    openModal('novoRoteiroModal');
  }

  let _roteiroStepCount = 0;

  function addRoteiroStep() {
    _roteiroStepCount++;
    const idx = _roteiroStepCount;
    document.getElementById('roteiroStepsEmpty').style.display = 'none';
    document.getElementById('rotStepCount').textContent = idx + ' operação(ões)';
    const container = document.getElementById('roteiroStepsContainer');
    const div = document.createElement('div');
    div.id = 'step_' + idx;
    div.style.cssText = 'background:#f8f9fa;border-radius:8px;padding:12px 14px;border:1px solid #e9ecef;';
    div.innerHTML = \`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <div style="width:24px;height:24px;border-radius:50%;background:#1B4F72;color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">\${idx}</div>
        <span style="font-size:13px;font-weight:700;color:#374151;flex:1;">Operação \${idx}</span>
        <button type="button" onclick="removeStep(\${idx})" style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:14px;" title="Remover operação"><i class="fas fa-times"></i></button>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;margin-bottom:4px;display:block;">Nome da Operação *</label>
          <input class="form-control" id="step_op_\${idx}" type="text" placeholder="Ex: Torneamento, Fresamento..." style="font-size:12px;">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;margin-bottom:4px;display:block;">Tempo (min) *</label>
          <input class="form-control" id="step_time_\${idx}" type="number" placeholder="0" min="0" step="0.5" style="font-size:12px;">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;margin-bottom:4px;display:block;">Tipo de Recurso</label>
          <select class="form-control" id="step_res_\${idx}" style="font-size:12px;">
            <option value="machine">⚙️ Máquina</option>
            <option value="workbench">🔧 Bancada</option>
            <option value="manual">👤 Manual</option>
          </select>
        </div>
        <div style="grid-column:span 3;">
          <label style="font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;margin-bottom:4px;display:block;">Máquina / Centro de Trabalho</label>
          <input class="form-control" id="step_maq_\${idx}" type="text" placeholder="Ex: Torno CNC-01, Fresadora FA-02..." style="font-size:12px;">
        </div>
      </div>
    \`;
    container.appendChild(div);
  }

  function removeStep(idx) {
    const el = document.getElementById('step_' + idx);
    if (el) el.remove();
    const remaining = document.querySelectorAll('[id^="step_"]').length;
    document.getElementById('rotStepCount').textContent = remaining + ' operação(ões)';
    if (remaining === 0) document.getElementById('roteiroStepsEmpty').style.display = 'block';
  }

  async function salvarRoteiro() {
    const nome    = document.getElementById('rot_nome')?.value?.trim() || '';
    const prodEl  = document.getElementById('rot_produto');
    const prodId  = prodEl?.value || '';
    const prodOpt = prodEl?.options[prodEl.selectedIndex];
    const productCode = prodOpt?.dataset?.code || '';
    const productName = prodOpt?.dataset?.name || '';
    const versao  = document.getElementById('rot_versao')?.value?.trim() || '1.0';
    const status  = document.getElementById('rot_status')?.value || 'active';
    const obs     = document.getElementById('rot_obs')?.value?.trim() || '';

    if (!nome)   { showToast('Informe o nome do roteiro!', 'error'); return; }
    if (!prodId) { showToast('Selecione o produto!', 'error'); return; }

    // Coletar passos
    const stepEls = document.querySelectorAll('[id^="step_op_"]');
    const steps = [];
    let valid = true;
    stepEls.forEach((el, i) => {
      const idxStr = el.id.replace('step_op_', '');
      const op    = el.value?.trim() || '';
      const time  = parseFloat(document.getElementById('step_time_' + idxStr)?.value || '0') || 0;
      const res   = document.getElementById('step_res_' + idxStr)?.value || 'manual';
      const maq   = document.getElementById('step_maq_' + idxStr)?.value?.trim() || '';
      if (!op) { showToast('Preencha o nome de todas as operações!', 'error'); valid = false; return; }
      steps.push({ order: i + 1, operation: op, standardTime: time, resourceType: res, machine: maq });
    });
    if (!valid) return;

    try {
      const res = await fetch('/engenharia/api/route/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome, productId: prodId, productCode, productName, version: versao, status, notes: obs, steps })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('✅ Roteiro criado com sucesso!');
        closeModal('novoRoteiroModal');
        setTimeout(() => location.reload(), 800);
      } else {
        showToast(data.error || 'Erro ao salvar roteiro', 'error');
      }
    } catch(e) { showToast('Erro de conexão', 'error'); }
  }

  async function deleteRoteiro(id) {
    if (!confirm('Excluir este roteiro? Esta ação não pode ser desfeita.')) return;
    try {
      const res = await fetch('/engenharia/api/route/' + id, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) { showToast('Roteiro excluído!'); setTimeout(() => location.reload(), 500); }
      else showToast(data.error || 'Erro ao excluir', 'error');
    } catch(e) { showToast('Erro de conexão', 'error'); }
  }

  function selectBOMProduct(code) {
    // Update active button
    document.querySelectorAll('[id^="bomBtn_"]').forEach(b => b.classList.remove('active'));
    document.getElementById('bomBtn_' + code)?.classList.add('active');
    // Filter BOM
    const items = allBOM.filter(b => b.productCode === code);
    const prod = allProducts.find(p => p.code === code);
    document.getElementById('bomTitle').textContent = 'BOM — ' + (prod?.name || code);
    const tbody = document.getElementById('bomBody');
    if (tbody) {
      tbody.innerHTML = items.length === 0
        ? '<tr><td colspan="7" style="text-align:center;padding:40px;color:#9ca3af;"><i class="fas fa-inbox" style="font-size:32px;margin-bottom:8px;"></i><br>Nenhum componente cadastrado para este produto</td></tr>'
        : items.map((b, idx) => \`<tr>
          <td style="color:#9ca3af;font-size:12px;">\${idx+1}</td>
          <td style="font-weight:600;color:#374151;">\${b.componentName}</td>
          <td><span style="font-family:monospace;font-size:11px;background:#f1f5f9;padding:1px 6px;border-radius:4px;color:#6c757d;">\${b.componentCode || '—'}</span></td>
          <td style="font-weight:700;color:#1B4F72;">\${b.quantity}</td>
          <td><span class="chip" style="background:#f1f5f9;color:#374151;">\${b.unit}</span></td>
          <td style="font-size:12px;color:#9ca3af;">—</td>
          <td><div style="display:flex;gap:4px;"><button class="btn btn-secondary btn-sm"><i class="fas fa-edit"></i></button><button class="btn btn-danger btn-sm"><i class="fas fa-trash"></i></button></div></td>
        </tr>\`).join('');
    }
  }

  function showBOM(code) {
    // Switch to BOM tab
    document.querySelectorAll('[data-tab-group="eng"] .tab-btn').forEach((b,i) => i === 1 ? b.classList.add('active') : b.classList.remove('active'));
    document.querySelectorAll('[data-tab-group="eng"] .tab-content').forEach((c,i) => i === 1 ? c.classList.add('active') : c.classList.remove('active'));
    selectBOMProduct(code);
  }

  function showRoteiro(code) {
    document.querySelectorAll('[data-tab-group="eng"] .tab-btn').forEach((b,i) => i === 2 ? b.classList.add('active') : b.classList.remove('active'));
    document.querySelectorAll('[data-tab-group="eng"] .tab-content').forEach((c,i) => i === 2 ? c.classList.add('active') : c.classList.remove('active'));
  }


  async function salvarBomItem() {
    const productId = document.getElementById('bom_produto')?.value || '';
    const productName = document.getElementById('bom_produto_nome')?.value || document.getElementById('bom_produto')?.options[document.getElementById('bom_produto')?.selectedIndex]?.text || '';
    const componentName = document.getElementById('bom_componente')?.value || '';
    const componentCode = document.getElementById('bom_codigo')?.value || '';
    const quantity = document.getElementById('bom_quantidade')?.value || 1;
    const unit = document.getElementById('bom_unidade')?.value || 'un';
    
    if (!productId || !componentName) { showToast('Selecione o produto e informe o componente!', 'error'); return; }
    
    try {
      const res = await fetch('/engenharia/api/bom/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, productName, componentName, componentCode, quantity, unit })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('✅ Componente adicionado à BOM!');
        closeModal('novoBomModal');
        setTimeout(() => location.reload(), 800);
      } else {
        showToast(data.error || 'Erro ao salvar', 'error');
      }
    } catch(e) { showToast('Erro de conexão', 'error'); }
  }

  async function deleteBomItem(id) {
    if (!confirm('Remover este componente da BOM?')) return;
    try {
      const res = await fetch('/engenharia/api/bom/' + id, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) { showToast('Componente removido!'); setTimeout(() => location.reload(), 500); }
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
  return c.html(layout('Engenharia de Produto', content, 'engenharia', userInfo))
})

// ── API: POST /engenharia/api/bom/create ─────────────────────────────────────
app.post('/api/bom/create', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.productId || !body.componentName) return err(c, 'Dados obrigatórios')
  const id = genId('bom')
  const bom = {
    id, productId: body.productId, productName: body.productName || '',
    componentId: body.componentId || '', componentName: body.componentName,
    componentCode: body.componentCode || '', quantity: parseFloat(body.quantity) || 1,
    unit: body.unit || 'un', notes: body.notes || '', createdAt: new Date().toISOString(),
  }
  tenant.bomItems.push(bom)
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'boms', {
      id, user_id: userId, product_id: bom.productId, component_id: bom.componentId,
      component_name: bom.componentName, component_code: bom.componentCode,
      quantity: bom.quantity, unit: bom.unit, notes: bom.notes,
    })
  }
  return ok(c, { bom })
})

app.put('/api/bom/:id', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id'); const body = await c.req.json().catch(() => null)
  if (!body) return err(c, 'Dados inválidos')
  const idx = tenant.bomItems.findIndex((b: any) => b.id === id)
  if (idx === -1) return err(c, 'Item de BOM não encontrado', 404)
  Object.assign(tenant.bomItems[idx], body)
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'boms', id, userId, {
      component_name: body.componentName, quantity: body.quantity, unit: body.unit, notes: body.notes,
    })
  }
  return ok(c, { bom: tenant.bomItems[idx] })
})

app.delete('/api/bom/:id', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const idx = tenant.bomItems.findIndex((b: any) => b.id === id)
  if (idx === -1) return err(c, 'Item não encontrado', 404)
  tenant.bomItems.splice(idx, 1)
  if (db && userId !== 'demo-tenant') await dbDelete(db, 'boms', id, userId)
  return ok(c)
})

app.get('/api/boms', (c) => ok(c, { boms: getCtxTenant(c).bomItems }))

// ── API: Roteiros ─────────────────────────────────────────────────────────────

app.post('/api/route/create', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.name || !body.productId)
    return err(c, 'Nome e produto são obrigatórios')

  const id = genId('rot')
  const now = new Date().toISOString()
  const route = {
    id,
    name:        body.name,
    productId:   body.productId,
    productCode: body.productCode || '',
    productName: body.productName || '',
    version:     body.version     || '1.0',
    status:      body.status      || 'active',
    notes:       body.notes       || '',
    steps:       Array.isArray(body.steps) ? body.steps : [],
    createdAt:   now,
    updatedAt:   now,
  }

  // Persist in tenant memory
  if (!tenant.routes) (tenant as any).routes = []
  tenant.routes.push(route)

  // Persist to D1 if available
  if (db && userId !== 'demo-tenant') {
    try {
      await db.prepare(`
        INSERT INTO work_instructions (id, user_id, title, code, version, status, product_id, operation, estimated_time, steps, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, userId, route.name, route.productCode, route.version, route.status,
        route.productId, 'roteiro', route.steps.reduce((acc: number, s: any) => acc + (s.standardTime || 0), 0),
        JSON.stringify(route.steps), now, now
      ).run()
    } catch {
      // D1 unavailable — kept in memory
    }
  }

  return ok(c, { route })
})

app.delete('/api/route/:id', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const tenant = getCtxTenant(c)
  const id = c.req.param('id')

  const idx = (tenant.routes || []).findIndex((r: any) => r.id === id)
  if (idx === -1) return err(c, 'Roteiro não encontrado', 404)
  tenant.routes.splice(idx, 1)

  if (db && userId !== 'demo-tenant') {
    try {
      await db.prepare('DELETE FROM work_instructions WHERE id = ? AND user_id = ?')
        .bind(id, userId).run()
    } catch {}
  }

  return ok(c)
})

app.get('/api/routes', (c) => ok(c, { routes: getCtxTenant(c).routes || [] }))

export default app
