import { Hono } from 'hono'
import { layout } from '../layout'
import { mockData } from '../data'

const app = new Hono()

app.get('/', (c) => {
  const { plants, machines, workbenches } = mockData

  const statusMachine = (s: string) => {
    const map: Record<string, string> = { operational: 'badge-success', maintenance: 'badge-warning', offline: 'badge-secondary' }
    const label: Record<string, string> = { operational: 'Operacional', maintenance: 'Manutenção', offline: 'Offline' }
    return `<span class="badge ${map[s] || 'badge-secondary'}">${label[s] || s}</span>`
  }

  const content = `
  <!-- Header -->
  <div class="section-header">
    <div style="font-size:14px;color:#6c757d;">Plantas, Máquinas, Bancadas e Equipamentos</div>
    <button class="btn btn-primary" onclick="openModal('novaPlantaModal')"><i class="fas fa-plus"></i> Novo Cadastro</button>
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
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
        ${plants.map(p => `
        <div class="card" style="padding:20px;">
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
              <div style="font-size:17px;font-weight:800;color:#1B4F72;">${p.totalCapacity}</div>
              <div style="font-size:10px;color:#9ca3af;">peças/turno</div>
            </div>
            <div style="background:#f8f9fa;border-radius:8px;padding:10px;">
              <div style="font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Contato</div>
              <div style="font-size:13px;font-weight:600;color:#374151;">${p.contact}</div>
            </div>
          </div>
          ${p.notes ? `<div style="font-size:12px;color:#6c757d;margin-bottom:12px;"><i class="fas fa-info-circle" style="color:#3498DB;margin-right:4px;"></i>${p.notes}</div>` : ''}
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="openModal('editPlantaModal')"><i class="fas fa-edit"></i> Editar</button>
            <button class="btn btn-danger btn-sm" onclick="alert('Confirmar exclusão?')"><i class="fas fa-trash"></i></button>
          </div>
        </div>`).join('')}
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
            <input class="form-control" type="text" placeholder="Buscar máquina...">
          </div>
          <button class="btn btn-primary btn-sm" onclick="openModal('novaMaquinaModal')"><i class="fas fa-plus"></i> Nova Máquina</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Nome</th><th>Tipo</th><th>Capacidade</th><th>Especificações</th><th>Planta</th><th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${machines.map(m => `
              <tr>
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
                <td style="font-size:12px;color:#6c757d;">${m.capacity}</td>
                <td style="font-size:12px;color:#6c757d;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.specs || '—'}</td>
                <td style="font-size:12px;color:#6c757d;">${m.plantName}</td>
                <td>${statusMachine(m.status)}</td>
                <td>
                  <div style="display:flex;gap:4px;">
                    <button class="btn btn-secondary btn-sm" onclick="openModal('novaMaquinaModal')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="alert('Confirmar exclusão?')"><i class="fas fa-trash"></i></button>
                  </div>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Bancadas Tab -->
    <div class="tab-content" id="tabBancadas">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">
        ${workbenches.map(wb => {
          const statusColor = wb.status === 'available' ? '#27AE60' : wb.status === 'in_use' ? '#3498DB' : '#F39C12'
          const statusLabel = { available: 'Disponível', in_use: 'Em Uso', maintenance: 'Manutenção' }[wb.status] || wb.status
          return `
          <div class="card" style="padding:18px;border-left:4px solid ${statusColor};">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <div style="font-size:15px;font-weight:700;color:#1B4F72;">${wb.name}</div>
              <span class="badge ${wb.status === 'available' ? 'badge-success' : wb.status === 'in_use' ? 'badge-info' : 'badge-warning'}">${statusLabel}</span>
            </div>
            <div style="font-size:12px;color:#6c757d;margin-bottom:6px;"><i class="fas fa-wrench" style="margin-right:6px;"></i>${wb.function}</div>
            <div style="font-size:12px;color:#6c757d;"><i class="fas fa-building" style="margin-right:6px;"></i>${wb.plantName}</div>
            <div style="display:flex;gap:8px;margin-top:12px;">
              <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="openModal('novaPlantaModal')"><i class="fas fa-edit"></i> Editar</button>
              <button class="btn btn-danger btn-sm"><i class="fas fa-trash"></i></button>
            </div>
          </div>`
        }).join('')}
      </div>
    </div>
  </div>

  <!-- Nova Planta Modal -->
  <div class="modal-overlay" id="novaPlantaModal">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-building" style="margin-right:8px;"></i>Nova Planta Fabril</h3>
        <button onclick="closeModal('novaPlantaModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <div class="form-group"><label class="form-label">Nome da Planta *</label><input class="form-control" type="text" placeholder="Ex: Planta Delta"></div>
        <div class="form-group"><label class="form-label">Localização *</label><input class="form-control" type="text" placeholder="Cidade - UF"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group"><label class="form-label">Capacidade Total</label><input class="form-control" type="number" placeholder="0"></div>
          <div class="form-group"><label class="form-label">Contato Responsável</label><input class="form-control" type="text" placeholder="Nome"></div>
        </div>
        <div class="form-group"><label class="form-label">Status</label>
          <select class="form-control"><option value="active">Ativa</option><option value="inactive">Inativa</option></select>
        </div>
        <div class="form-group"><label class="form-label">Observações</label><textarea class="form-control" rows="3" placeholder="Informações adicionais..."></textarea></div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaPlantaModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('Planta salva com sucesso!');closeModal('novaPlantaModal')" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <!-- Nova Máquina Modal -->
  <div class="modal-overlay" id="novaMaquinaModal">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-cog" style="margin-right:8px;"></i>Nova Máquina</h3>
        <button onclick="closeModal('novaMaquinaModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Nome da Máquina *</label><input class="form-control" type="text" placeholder="Ex: Torno CNC-03"></div>
          <div class="form-group"><label class="form-label">Tipo *</label>
            <select class="form-control"><option>CNC</option><option>Fresadora</option><option>Torno</option><option>Prensa</option><option>Robótica</option><option>Injetora</option><option>Outro</option></select>
          </div>
          <div class="form-group"><label class="form-label">Capacidade</label><input class="form-control" type="text" placeholder="Ex: 200 peças/h"></div>
          <div class="form-group"><label class="form-label">Planta *</label>
            <select class="form-control"><option>Selecione...</option>${mockData.plants.map(p => `<option>${p.name}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label class="form-label">Status</label>
            <select class="form-control"><option>Operacional</option><option>Manutenção</option><option>Offline</option></select>
          </div>
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Especificações Técnicas</label><textarea class="form-control" rows="2" placeholder="Modelo, fabricante, características..."></textarea></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaMaquinaModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('Máquina salva!');closeModal('novaMaquinaModal')" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>
  `
  return c.html(layout('Cadastros de Recursos', content, 'recursos'))
})

export default app
