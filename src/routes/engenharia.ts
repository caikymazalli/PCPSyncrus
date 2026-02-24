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
      <div style="display:flex;flex-direction:column;gap:20px;">
        ${routes.map(r => `
        <div class="card" style="overflow:hidden;">
          <div style="padding:16px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(to right,#f8fafc,#fff);">
            <div>
              <div style="font-size:15px;font-weight:700;color:#1B4F72;">${r.name}</div>
              <div style="font-size:12px;color:#9ca3af;margin-top:2px;"><i class="fas fa-box" style="margin-right:4px;"></i>${r.productName} (${r.productCode})</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="font-size:12px;color:#6c757d;">${r.steps.length} operações</span>
              <span style="font-size:12px;color:#27AE60;font-weight:700;"><i class="fas fa-clock" style="margin-right:4px;"></i>${r.steps.reduce((acc, s) => acc + s.standardTime, 0)} min total</span>
              <button class="btn btn-secondary btn-sm" onclick="openModal('novoRoteiroModal')"><i class="fas fa-edit"></i></button>
            </div>
          </div>
          <div style="padding:16px 20px;">
            <div style="display:flex;gap:0;align-items:center;overflow-x:auto;padding-bottom:8px;">
              ${r.steps.map((s, idx) => `
              <div style="display:flex;align-items:center;">
                <div style="min-width:150px;background:#f8f9fa;border-radius:8px;padding:12px;border:1px solid #e9ecef;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <div style="width:22px;height:22px;border-radius:50%;background:#1B4F72;color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${s.order}</div>
                    <div style="font-size:12px;font-weight:700;color:#1B4F72;">${s.operation}</div>
                  </div>
                  <div style="font-size:11px;color:#9ca3af;"><i class="fas fa-clock" style="margin-right:3px;"></i>${s.standardTime} min</div>
                  <div style="font-size:10px;margin-top:4px;">
                    <span class="chip" style="background:#e8f4fd;color:#1B4F72;font-size:10px;">${s.resourceType === 'machine' ? '⚙️ Máquina' : s.resourceType === 'workbench' ? '🔧 Bancada' : '👤 Manual'}</span>
                  </div>
                </div>
                ${idx < r.steps.length - 1 ? '<div style="width:28px;height:2px;background:#d1d5db;flex-shrink:0;"></div><div style="color:#9ca3af;flex-shrink:0;">›</div><div style="width:4px;height:2px;background:#d1d5db;flex-shrink:0;"></div>' : ''}
              </div>`).join('')}
            </div>
          </div>
        </div>`).join('')}
      </div>
    </div>
  </div>

  <!-- Novo Produto Modal -->
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

  <script>
  const allBOM = ${JSON.stringify(bomItems)};
  const allProducts = ${JSON.stringify(products)};

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

export default app
