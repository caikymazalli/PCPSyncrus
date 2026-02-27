import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxSession, getCtxDB, getCtxUserId } from '../sessionHelper'

const app = new Hono()

// ── Helpers ─────────────────────────────────────────────────────────────────
function statusBadgeMachine(s: string) {
  const map: Record<string, string>   = { operational: 'badge-success', maintenance: 'badge-warning', offline: 'badge-secondary' }
  const label: Record<string, string> = { operational: 'Operacional', maintenance: 'Manutenção', offline: 'Offline' }
  return `<span class="badge ${map[s] || 'badge-secondary'}">${label[s] || s}</span>`
}

// ── GET / ── render page ─────────────────────────────────────────────────────
app.get('/', (c) => {
  const tenant   = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const { plants, machines, workbenches } = tenant

  // Plant options for machine modal
  const plantOptions = plants.length
    ? plants.map(p => `<option value="${p.id}">${p.name}</option>`).join('')
    : '<option value="">— Nenhuma planta cadastrada —</option>'

  // ── Plantas cards ────────────────────────────────────────────────────────
  const plantasHtml = plants.length === 0
    ? `<div style="grid-column:1/-1;text-align:center;padding:40px 0;">
        <i class="fas fa-building" style="font-size:40px;color:#d1d5db;"></i>
        <p style="margin-top:12px;color:#9ca3af;font-size:14px;">Nenhuma planta cadastrada.<br>Clique em <strong>+ Nova Planta</strong> para começar.</p>
      </div>`
    : plants.map((p: any) => `
      <div class="card" style="padding:20px;" id="plant-${p.id}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:44px;height:44px;border-radius:10px;background:#e8f4fd;display:flex;align-items:center;justify-content:center;">
              <i class="fas fa-building" style="color:#1B4F72;font-size:20px;"></i>
            </div>
            <div>
              <div style="font-size:15px;font-weight:700;color:#1B4F72;">${p.name}</div>
              <div style="font-size:12px;color:#9ca3af;"><i class="fas fa-map-marker-alt" style="margin-right:4px;"></i>${p.location}</div>
            </div>
          </div>
          <span class="badge ${p.status === 'active' ? 'badge-success' : 'badge-secondary'}">${p.status === 'active' ? 'Ativa' : 'Inativa'}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
          <div style="background:#f8f9fa;border-radius:8px;padding:10px;">
            <div style="font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Capacidade</div>
            <div style="font-size:17px;font-weight:800;color:#1B4F72;">${p.totalCapacity || 0}</div>
            <div style="font-size:10px;color:#9ca3af;">peças/turno</div>
          </div>
          <div style="background:#f8f9fa;border-radius:8px;padding:10px;">
            <div style="font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Contato</div>
            <div style="font-size:13px;font-weight:600;color:#374151;">${p.contact || '—'}</div>
          </div>
        </div>
        ${p.notes ? `<div style="font-size:12px;color:#6c757d;margin-bottom:12px;"><i class="fas fa-info-circle" style="color:#3498DB;margin-right:4px;"></i>${p.notes}</div>` : ''}
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary btn-sm" style="flex:1;"
            onclick="editPlanta('${p.id}','${p.name.replace(/'/g,"\\'")}','${p.location.replace(/'/g,"\\'")}','${p.totalCapacity||0}','${p.contact||''}','${p.status}','${(p.notes||'').replace(/'/g,"\\'")}')">
            <i class="fas fa-edit"></i> Editar
          </button>
          <button class="btn btn-danger btn-sm" onclick="deletePlanta('${p.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>`).join('')

  // ── Máquinas rows ────────────────────────────────────────────────────────
  const maquinasHtml = machines.length === 0
    ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:#9ca3af;">
        <i class="fas fa-cog" style="font-size:32px;color:#d1d5db;display:block;margin-bottom:10px;"></i>
        Nenhuma máquina cadastrada. Clique em <strong>+ Nova Máquina</strong>.
      </td></tr>`
    : machines.map((m: any) => `
      <tr id="machine-${m.id}">
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:32px;height:32px;border-radius:8px;background:${m.status === 'operational' ? '#eafaf1' : m.status === 'maintenance' ? '#fff8e8' : '#f8f9fa'};display:flex;align-items:center;justify-content:center;">
              <i class="fas fa-cog" style="color:${m.status === 'operational' ? '#27AE60' : m.status === 'maintenance' ? '#F39C12' : '#9ca3af'};font-size:13px;"></i>
            </div>
            <div>
              <div style="font-weight:600;color:#1B4F72;">${m.name}</div>
              <div style="font-size:11px;color:#9ca3af;">ID: ${m.id}</div>
            </div>
          </div>
        </td>
        <td><span class="chip" style="background:#e8f4fd;color:#1B4F72;">${m.type}</span></td>
        <td style="font-size:12px;color:#6c757d;">${m.capacity || '—'}</td>
        <td style="font-size:12px;color:#6c757d;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.specs || '—'}</td>
        <td style="font-size:12px;color:#6c757d;">${m.plantName || '—'}</td>
        <td>${statusBadgeMachine(m.status)}</td>
        <td>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-secondary btn-sm"
              onclick="editMaquina('${m.id}','${m.name.replace(/'/g,"\\'")}','${m.type}','${m.capacity||''}','${m.plantId||''}','${m.status}','${(m.specs||'').replace(/'/g,"\\'")}')">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteMaquina('${m.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`).join('')

  // ── Bancadas cards ───────────────────────────────────────────────────────
  const bancadasHtml = workbenches.length === 0
    ? `<div style="grid-column:1/-1;text-align:center;padding:40px 0;">
        <i class="fas fa-table" style="font-size:40px;color:#d1d5db;"></i>
        <p style="margin-top:12px;color:#9ca3af;font-size:14px;">Nenhuma bancada cadastrada.</p>
      </div>`
    : workbenches.map((wb: any) => {
        const statusColor = wb.status === 'available' ? '#27AE60' : wb.status === 'in_use' ? '#3498DB' : '#F39C12'
        const statusLabel = ({ available: 'Disponível', in_use: 'Em Uso', maintenance: 'Manutenção' } as any)[wb.status] || wb.status
        return `
        <div class="card" style="padding:18px;border-left:4px solid ${statusColor};" id="wb-${wb.id}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="font-size:15px;font-weight:700;color:#1B4F72;">${wb.name}</div>
            <span class="badge ${wb.status === 'available' ? 'badge-success' : wb.status === 'in_use' ? 'badge-info' : 'badge-warning'}">${statusLabel}</span>
          </div>
          <div style="font-size:12px;color:#6c757d;margin-bottom:6px;"><i class="fas fa-wrench" style="margin-right:6px;"></i>${wb.function || '—'}</div>
          <div style="font-size:12px;color:#6c757d;"><i class="fas fa-building" style="margin-right:6px;"></i>${wb.plantName || '—'}</div>
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button class="btn btn-secondary btn-sm" style="flex:1;"
              onclick="editBancada('${wb.id}','${wb.name.replace(/'/g,"\\'")}','${(wb.function||'').replace(/'/g,"\\'")}','${wb.plantId||''}','${wb.status}')">
              <i class="fas fa-edit"></i> Editar
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteBancada('${wb.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>`
      }).join('')

  const content = `
  <!-- Header -->
  <div class="section-header">
    <div style="font-size:14px;color:#6c757d;">Plantas, Máquinas, Bancadas e Equipamentos</div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-secondary" onclick="openModal('novaBancadaModal')"><i class="fas fa-table"></i> Nova Bancada</button>
      <button class="btn btn-secondary" onclick="openModal('novaMaquinaModal')"><i class="fas fa-cog"></i> Nova Máquina</button>
      <button class="btn btn-primary" onclick="openModal('novaPlantaModal')"><i class="fas fa-plus"></i> Nova Planta</button>
    </div>
  </div>

  <!-- Tab Navigation -->
  <div data-tab-group="recursos">
    <div class="tab-nav">
      <button class="tab-btn active" onclick="switchTab('tabPlantas','recursos')"><i class="fas fa-building" style="margin-right:6px;"></i>Plantas (${plants.length})</button>
      <button class="tab-btn" onclick="switchTab('tabMaquinas','recursos')"><i class="fas fa-cog" style="margin-right:6px;"></i>Máquinas (${machines.length})</button>
      <button class="tab-btn" onclick="switchTab('tabBancadas','recursos')"><i class="fas fa-table" style="margin-right:6px;"></i>Bancadas (${workbenches.length})</button>
    </div>

    <!-- Plantas Tab -->
    <div class="tab-content active" id="tabPlantas">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;" id="plantasGrid">
        ${plantasHtml}
        <!-- Add New Card -->
        <div class="card" style="padding:20px;border:2px dashed #d1d5db;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:200px;cursor:pointer;background:transparent;" onclick="openModal('novaPlantaModal')">
          <div style="width:48px;height:48px;border-radius:50%;background:#f1f5f9;display:flex;align-items:center;justify-content:center;margin-bottom:12px;">
            <i class="fas fa-plus" style="color:#9ca3af;font-size:20px;"></i>
          </div>
          <div style="font-size:14px;font-weight:600;color:#9ca3af;">Adicionar Planta</div>
        </div>
      </div>
    </div>

    <!-- Máquinas Tab -->
    <div class="tab-content" id="tabMaquinas">
      <div class="card" style="overflow:hidden;">
        <div style="padding:14px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f1f3f5;">
          <div class="search-box" style="flex:1;max-width:360px;">
            <i class="fas fa-search icon"></i>
            <input class="form-control" type="text" id="searchMaquina" placeholder="Buscar máquina..." oninput="filterMaquinas(this.value)">
          </div>
          <button class="btn btn-primary btn-sm" onclick="openModal('novaMaquinaModal')"><i class="fas fa-plus"></i> Nova Máquina</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Nome</th><th>Tipo</th><th>Capacidade</th><th>Especificações</th><th>Planta</th><th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody id="maquinasBody">
              ${maquinasHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Bancadas Tab -->
    <div class="tab-content" id="tabBancadas">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;" id="bancadasGrid">
        ${bancadasHtml}
      </div>
    </div>
  </div>

  <!-- ══ MODAL: Nova/Editar Planta ══ -->
  <div class="modal-overlay" id="novaPlantaModal">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;" id="modalPlantaTitulo"><i class="fas fa-building" style="margin-right:8px;"></i>Nova Planta Fabril</h3>
        <button onclick="closeModal('novaPlantaModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <input type="hidden" id="pId">
        <div class="form-group"><label class="form-label">Nome da Planta *</label><input class="form-control" id="pNome" type="text" placeholder="Ex: Planta Delta"></div>
        <div class="form-group"><label class="form-label">Localização *</label><input class="form-control" id="pLoc" type="text" placeholder="Cidade - UF"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group"><label class="form-label">Capacidade Total (peças/turno)</label><input class="form-control" id="pCap" type="number" placeholder="0"></div>
          <div class="form-group"><label class="form-label">Contato Responsável</label><input class="form-control" id="pContact" type="text" placeholder="Nome"></div>
        </div>
        <div class="form-group"><label class="form-label">Status</label>
          <select class="form-control" id="pStatus"><option value="active">Ativa</option><option value="inactive">Inativa</option></select>
        </div>
        <div class="form-group"><label class="form-label">Observações</label><textarea class="form-control" id="pNotes" rows="3" placeholder="Informações adicionais..."></textarea></div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaPlantaModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="savePlanta()" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <!-- ══ MODAL: Nova/Editar Máquina ══ -->
  <div class="modal-overlay" id="novaMaquinaModal">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;" id="modalMaqTitulo"><i class="fas fa-cog" style="margin-right:8px;"></i>Nova Máquina</h3>
        <button onclick="closeModal('novaMaquinaModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <input type="hidden" id="mId">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Nome da Máquina *</label><input class="form-control" id="mNome" type="text" placeholder="Ex: Torno CNC-03"></div>
          <div class="form-group"><label class="form-label">Tipo *</label>
            <select class="form-control" id="mTipo"><option value="CNC">CNC</option><option value="Fresadora">Fresadora</option><option value="Torno">Torno</option><option value="Prensa">Prensa</option><option value="Robótica">Robótica</option><option value="Injetora">Injetora</option><option value="Outro">Outro</option></select>
          </div>
          <div class="form-group"><label class="form-label">Capacidade</label><input class="form-control" id="mCap" type="text" placeholder="Ex: 200 peças/h"></div>
          <div class="form-group"><label class="form-label">Planta *</label>
            <select class="form-control" id="mPlanta"><option value="">Selecione...</option>${plantOptions}</select>
          </div>
          <div class="form-group"><label class="form-label">Status</label>
            <select class="form-control" id="mStatus"><option value="operational">Operacional</option><option value="maintenance">Manutenção</option><option value="offline">Offline</option></select>
          </div>
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Especificações Técnicas</label><textarea class="form-control" id="mSpecs" rows="2" placeholder="Modelo, fabricante, características..."></textarea></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaMaquinaModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="saveMaquina()" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <!-- ══ MODAL: Nova/Editar Bancada ══ -->
  <div class="modal-overlay" id="novaBancadaModal">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;" id="modalBancadaTitulo"><i class="fas fa-table" style="margin-right:8px;"></i>Nova Bancada</h3>
        <button onclick="closeModal('novaBancadaModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <input type="hidden" id="wbId">
        <div class="form-group"><label class="form-label">Nome da Bancada *</label><input class="form-control" id="wbNome" type="text" placeholder="Ex: Bancada Montagem A1"></div>
        <div class="form-group"><label class="form-label">Função</label><input class="form-control" id="wbFunc" type="text" placeholder="Ex: Montagem Final, Inspeção, Solda..."></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group"><label class="form-label">Planta</label>
            <select class="form-control" id="wbPlanta"><option value="">Selecione...</option>${plantOptions}</select>
          </div>
          <div class="form-group"><label class="form-label">Status</label>
            <select class="form-control" id="wbStatus"><option value="available">Disponível</option><option value="in_use">Em Uso</option><option value="maintenance">Manutenção</option></select>
          </div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaBancadaModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="saveBancada()" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <script>
  // ── Toast ──────────────────────────────────────────────────────────────────
  function showToast(msg, type='success') {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.15);';
    d.style.background = type === 'success' ? '#27AE60' : '#E74C3C';
    d.style.color = 'white';
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 3000);
  }

  // ── Plantas CRUD ───────────────────────────────────────────────────────────
  function resetPlantaModal() {
    document.getElementById('pId').value = '';
    document.getElementById('pNome').value = '';
    document.getElementById('pLoc').value = '';
    document.getElementById('pCap').value = '';
    document.getElementById('pContact').value = '';
    document.getElementById('pStatus').value = 'active';
    document.getElementById('pNotes').value = '';
    document.getElementById('modalPlantaTitulo').innerHTML = '<i class="fas fa-building" style="margin-right:8px;"></i>Nova Planta Fabril';
    openModal('novaPlantaModal');
  }

  function editPlanta(id, nome, loc, cap, contact, status, notes) {
    document.getElementById('pId').value = id;
    document.getElementById('pNome').value = nome;
    document.getElementById('pLoc').value = loc;
    document.getElementById('pCap').value = cap;
    document.getElementById('pContact').value = contact;
    document.getElementById('pStatus').value = status;
    document.getElementById('pNotes').value = notes;
    document.getElementById('modalPlantaTitulo').innerHTML = '<i class="fas fa-edit" style="margin-right:8px;"></i>Editar Planta';
    openModal('novaPlantaModal');
  }

  async function savePlanta() {
    const id      = document.getElementById('pId').value;
    const nome    = document.getElementById('pNome').value.trim();
    const loc     = document.getElementById('pLoc').value.trim();
    const cap     = document.getElementById('pCap').value;
    const contact = document.getElementById('pContact').value.trim();
    const status  = document.getElementById('pStatus').value;
    const notes   = document.getElementById('pNotes').value.trim();
    if (!nome || !loc) { showToast('Preencha Nome e Localização.', 'error'); return; }
    const method = id ? 'PUT' : 'POST';
    const url    = id ? '/recursos/plantas/' + id : '/recursos/plantas';
    const res = await fetch(url, {
      method, headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ nome, loc, cap: parseInt(cap)||0, contact, status, notes })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(id ? 'Planta atualizada!' : 'Planta cadastrada!');
      closeModal('novaPlantaModal');
      setTimeout(() => location.reload(), 600);
    } else { showToast(data.error || 'Erro ao salvar.', 'error'); }
  }

  async function deletePlanta(id) {
    if (!confirm('Deseja excluir esta planta?')) return;
    const res = await fetch('/recursos/plantas/' + id, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) { showToast('Planta excluída.'); setTimeout(() => location.reload(), 600); }
    else { showToast(data.error || 'Erro.', 'error'); }
  }

  // ── Máquinas CRUD ──────────────────────────────────────────────────────────
  function editMaquina(id, nome, tipo, cap, plantId, status, specs) {
    document.getElementById('mId').value = id;
    document.getElementById('mNome').value = nome;
    document.getElementById('mTipo').value = tipo;
    document.getElementById('mCap').value = cap;
    document.getElementById('mPlanta').value = plantId;
    document.getElementById('mStatus').value = status;
    document.getElementById('mSpecs').value = specs;
    document.getElementById('modalMaqTitulo').innerHTML = '<i class="fas fa-edit" style="margin-right:8px;"></i>Editar Máquina';
    openModal('novaMaquinaModal');
  }

  async function saveMaquina() {
    const id     = document.getElementById('mId').value;
    const nome   = document.getElementById('mNome').value.trim();
    const tipo   = document.getElementById('mTipo').value;
    const cap    = document.getElementById('mCap').value.trim();
    const planta = document.getElementById('mPlanta').value;
    const status = document.getElementById('mStatus').value;
    const specs  = document.getElementById('mSpecs').value.trim();
    if (!nome) { showToast('Preencha o nome da máquina.', 'error'); return; }
    const method = id ? 'PUT' : 'POST';
    const url    = id ? '/recursos/maquinas/' + id : '/recursos/maquinas';
    const res = await fetch(url, {
      method, headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ nome, tipo, cap, plantaId: planta, status, specs })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(id ? 'Máquina atualizada!' : 'Máquina cadastrada!');
      closeModal('novaMaquinaModal');
      setTimeout(() => location.reload(), 600);
    } else { showToast(data.error || 'Erro.', 'error'); }
  }

  async function deleteMaquina(id) {
    if (!confirm('Deseja excluir esta máquina?')) return;
    const res = await fetch('/recursos/maquinas/' + id, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) { showToast('Máquina excluída.'); setTimeout(() => location.reload(), 600); }
    else { showToast(data.error || 'Erro.', 'error'); }
  }

  function filterMaquinas(q) {
    const rows = document.querySelectorAll('#maquinasBody tr');
    rows.forEach(r => {
      r.style.display = r.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
    });
  }

  // ── Bancadas CRUD ──────────────────────────────────────────────────────────
  function editBancada(id, nome, func_, plantId, status) {
    document.getElementById('wbId').value = id;
    document.getElementById('wbNome').value = nome;
    document.getElementById('wbFunc').value = func_;
    document.getElementById('wbPlanta').value = plantId;
    document.getElementById('wbStatus').value = status;
    document.getElementById('modalBancadaTitulo').innerHTML = '<i class="fas fa-edit" style="margin-right:8px;"></i>Editar Bancada';
    openModal('novaBancadaModal');
  }

  async function saveBancada() {
    const id     = document.getElementById('wbId').value;
    const nome   = document.getElementById('wbNome').value.trim();
    const func_  = document.getElementById('wbFunc').value.trim();
    const planta = document.getElementById('wbPlanta').value;
    const status = document.getElementById('wbStatus').value;
    if (!nome) { showToast('Preencha o nome da bancada.', 'error'); return; }
    const method = id ? 'PUT' : 'POST';
    const url    = id ? '/recursos/bancadas/' + id : '/recursos/bancadas';
    const res = await fetch(url, {
      method, headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ nome, func: func_, plantaId: planta, status })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(id ? 'Bancada atualizada!' : 'Bancada cadastrada!');
      closeModal('novaBancadaModal');
      setTimeout(() => location.reload(), 600);
    } else { showToast(data.error || 'Erro.', 'error'); }
  }

  async function deleteBancada(id) {
    if (!confirm('Deseja excluir esta bancada?')) return;
    const res = await fetch('/recursos/bancadas/' + id, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) { showToast('Bancada excluída.'); setTimeout(() => location.reload(), 600); }
    else { showToast(data.error || 'Erro.', 'error'); }
  }
  </script>
  `
  return c.html(layout('Cadastros de Recursos', content, 'recursos', userInfo))
})

// ── API: Plantas ─────────────────────────────────────────────────────────────
app.post('/plantas', async (c) => {
  const tenant = getCtxTenant(c)
  const db     = getCtxDB(c)
  const userId = getCtxUserId(c)
  const body   = await c.req.json()
  const id = 'p_' + Date.now()
  const planta = {
    id, name: body.nome, location: body.loc,
    totalCapacity: body.cap || 0, contact: body.contact || '',
    status: body.status || 'active', notes: body.notes || ''
  }
  tenant.plants.push(planta)
  // Persist to D1
  if (db && userId !== 'demo-tenant') {
    try {
      await db.prepare(
        `INSERT INTO plants (id, user_id, name, location, total_capacity, contact, status, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(id, userId, planta.name, planta.location, planta.totalCapacity, planta.contact, planta.status, planta.notes).run()
    } catch (e) { console.error('plants insert error:', e) }
  }
  return c.json({ ok: true, id })
})

app.put('/plantas/:id', async (c) => {
  const tenant = getCtxTenant(c)
  const db     = getCtxDB(c)
  const userId = getCtxUserId(c)
  const id     = c.req.param('id')
  const body   = await c.req.json()
  const idx    = tenant.plants.findIndex((p: any) => p.id === id)
  if (idx === -1) return c.json({ ok: false, error: 'Planta não encontrada.' }, 404)
  tenant.plants[idx] = {
    ...tenant.plants[idx],
    name: body.nome, location: body.loc,
    totalCapacity: body.cap || 0, contact: body.contact || '',
    status: body.status || 'active', notes: body.notes || ''
  }
  // Persist to D1
  if (db && userId !== 'demo-tenant') {
    try {
      await db.prepare(
        `UPDATE plants SET name=?, location=?, total_capacity=?, contact=?, status=?, notes=? WHERE id=? AND user_id=?`
      ).bind(body.nome, body.loc, body.cap||0, body.contact||'', body.status||'active', body.notes||'', id, userId).run()
    } catch (e) { console.error('plants update error:', e) }
  }
  return c.json({ ok: true })
})

app.delete('/plantas/:id', async (c) => {
  const tenant = getCtxTenant(c)
  const db     = getCtxDB(c)
  const userId = getCtxUserId(c)
  const id     = c.req.param('id')
  const before = tenant.plants.length
  tenant.plants = tenant.plants.filter((p: any) => p.id !== id)
  // Persist to D1
  if (db && userId !== 'demo-tenant') {
    try {
      await db.prepare('DELETE FROM plants WHERE id=? AND user_id=?').bind(id, userId).run()
    } catch (e) { console.error('plants delete error:', e) }
  }
  return c.json({ ok: tenant.plants.length < before })
})

// ── API: Máquinas ─────────────────────────────────────────────────────────────
app.post('/maquinas', async (c) => {
  const tenant = getCtxTenant(c)
  const db     = getCtxDB(c)
  const userId = getCtxUserId(c)
  const body   = await c.req.json()
  const id = 'm_' + Date.now()
  const planta = tenant.plants.find((p: any) => p.id === body.plantaId)
  const maquina = {
    id, name: body.nome, type: body.tipo,
    capacity: body.cap || '', plantId: body.plantaId || '',
    plantName: planta?.name || '',
    status: body.status || 'operational', specs: body.specs || ''
  }
  tenant.machines.push(maquina)
  // Persist to D1
  if (db && userId !== 'demo-tenant') {
    try {
      await db.prepare(
        `INSERT INTO machines (id, user_id, name, type, capacity, plant_id, plant_name, status, specs, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(id, userId, maquina.name, maquina.type, maquina.capacity, maquina.plantId, maquina.plantName, maquina.status, maquina.specs).run()
    } catch (e) { console.error('machines insert error:', e) }
  }
  return c.json({ ok: true, id })
})

app.put('/maquinas/:id', async (c) => {
  const tenant = getCtxTenant(c)
  const db     = getCtxDB(c)
  const userId = getCtxUserId(c)
  const id     = c.req.param('id')
  const body   = await c.req.json()
  const idx    = tenant.machines.findIndex((m: any) => m.id === id)
  if (idx === -1) return c.json({ ok: false, error: 'Máquina não encontrada.' }, 404)
  const planta = tenant.plants.find((p: any) => p.id === body.plantaId)
  tenant.machines[idx] = {
    ...tenant.machines[idx],
    name: body.nome, type: body.tipo,
    capacity: body.cap || '', plantId: body.plantaId || '',
    plantName: planta?.name || '',
    status: body.status || 'operational', specs: body.specs || ''
  }
  // Persist to D1
  if (db && userId !== 'demo-tenant') {
    try {
      const p2 = tenant.plants.find((p: any) => p.id === body.plantaId)
      await db.prepare(
        `UPDATE machines SET name=?, type=?, capacity=?, plant_id=?, plant_name=?, status=?, specs=? WHERE id=? AND user_id=?`
      ).bind(body.nome, body.tipo, body.cap||'', body.plantaId||'', p2?.name||'', body.status||'operational', body.specs||'', id, userId).run()
    } catch (e) { console.error('machines update error:', e) }
  }
  return c.json({ ok: true })
})

app.delete('/maquinas/:id', async (c) => {
  const tenant = getCtxTenant(c)
  const db     = getCtxDB(c)
  const userId = getCtxUserId(c)
  const id     = c.req.param('id')
  tenant.machines = tenant.machines.filter((m: any) => m.id !== id)
  // Persist to D1
  if (db && userId !== 'demo-tenant') {
    try {
      await db.prepare('DELETE FROM machines WHERE id=? AND user_id=?').bind(id, userId).run()
    } catch (e) { console.error('machines delete error:', e) }
  }
  return c.json({ ok: true })
})

// ── API: Bancadas ─────────────────────────────────────────────────────────────
app.post('/bancadas', async (c) => {
  const tenant = getCtxTenant(c)
  const db     = getCtxDB(c)
  const userId = getCtxUserId(c)
  const body   = await c.req.json()
  const id = 'wb_' + Date.now()
  const planta = tenant.plants.find((p: any) => p.id === body.plantaId)
  const bancada = {
    id, name: body.nome, function: body.func || '',
    plantId: body.plantaId || '', plantName: planta?.name || '',
    status: body.status || 'available'
  }
  tenant.workbenches.push(bancada)
  // Persist to D1
  if (db && userId !== 'demo-tenant') {
    try {
      await db.prepare(
        `INSERT INTO workbenches (id, user_id, name, function, plant_id, plant_name, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(id, userId, bancada.name, bancada.function, bancada.plantId, bancada.plantName, bancada.status).run()
    } catch (e) { console.error('workbenches insert error:', e) }
  }
  return c.json({ ok: true, id })
})

app.put('/bancadas/:id', async (c) => {
  const tenant = getCtxTenant(c)
  const db     = getCtxDB(c)
  const userId = getCtxUserId(c)
  const id     = c.req.param('id')
  const body   = await c.req.json()
  const idx    = tenant.workbenches.findIndex((wb: any) => wb.id === id)
  if (idx === -1) return c.json({ ok: false, error: 'Bancada não encontrada.' }, 404)
  const planta = tenant.plants.find((p: any) => p.id === body.plantaId)
  tenant.workbenches[idx] = {
    ...tenant.workbenches[idx],
    name: body.nome, function: body.func || '',
    plantId: body.plantaId || '', plantName: planta?.name || '',
    status: body.status || 'available'
  }
  // Persist to D1
  if (db && userId !== 'demo-tenant') {
    try {
      const p2 = tenant.plants.find((p: any) => p.id === body.plantaId)
      await db.prepare(
        `UPDATE workbenches SET name=?, function=?, plant_id=?, plant_name=?, status=? WHERE id=? AND user_id=?`
      ).bind(body.nome, body.func||'', body.plantaId||'', p2?.name||'', body.status||'available', id, userId).run()
    } catch (e) { console.error('workbenches update error:', e) }
  }
  return c.json({ ok: true })
})

app.delete('/bancadas/:id', async (c) => {
  const tenant = getCtxTenant(c)
  const db     = getCtxDB(c)
  const userId = getCtxUserId(c)
  const id     = c.req.param('id')
  tenant.workbenches = tenant.workbenches.filter((wb: any) => wb.id !== id)
  // Persist to D1
  if (db && userId !== 'demo-tenant') {
    try {
      await db.prepare('DELETE FROM workbenches WHERE id=? AND user_id=?').bind(id, userId).run()
    } catch (e) { console.error('workbenches delete error:', e) }
  }
  return c.json({ ok: true })
})

export default app
