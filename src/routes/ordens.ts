import { Hono } from 'hono'
import { layout } from '../layout'
// mockData replaced by per-session data
import { getCtxTenant, getCtxUserInfo } from '../sessionHelper'

const app = new Hono()

app.get('/', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const mockData = tenant  // per-session data
  const { productionOrders } = mockData

  const priorityColors: Record<string, string> = {
    urgent: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#65a30d'
  }
  const priorityLabel: Record<string, string> = {
    urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa'
  }
  const statusBadge = (s: string) => {
    const map: Record<string, string> = { completed: 'badge-success', in_progress: 'badge-info', planned: 'badge-primary', cancelled: 'badge-danger' }
    const label: Record<string, string> = { completed: 'Concluída', in_progress: 'Em Progresso', planned: 'Planejada', cancelled: 'Cancelada' }
    return `<span class="badge ${map[s] || 'badge-secondary'}">${label[s] || s}</span>`
  }

  const countByStatus = (s: string) => productionOrders.filter(o => o.status === s).length

  const content = `
  <!-- Header -->
  <div class="section-header">
    <div>
      <div style="font-size:14px;color:#6c757d;margin-bottom:4px;">Gestão de produção</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <span class="badge badge-primary"><i class="fas fa-circle" style="font-size:8px;"></i> ${countByStatus('planned')} Planejadas</span>
        <span class="badge badge-info"><i class="fas fa-circle" style="font-size:8px;"></i> ${countByStatus('in_progress')} Em Progresso</span>
        <span class="badge badge-success"><i class="fas fa-circle" style="font-size:8px;"></i> ${countByStatus('completed')} Concluídas</span>
        <span class="badge badge-danger"><i class="fas fa-circle" style="font-size:8px;"></i> ${countByStatus('cancelled')} Canceladas</span>
      </div>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-secondary" onclick="openModal('filterModal')" title="Filtrar ordens por critérios"><i class="fas fa-filter"></i> Filtrar</button>
      <button class="btn btn-primary" onclick="openModal('novaOrdemModal')" title="Criar nova ordem de produção"><i class="fas fa-plus"></i> Nova Ordem</button>
    </div>
  </div>

  <!-- Search & Filter Bar -->
  <div class="card" style="padding:14px 20px;margin-bottom:16px;">
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
      <div class="search-box" style="flex:1;min-width:200px;">
        <i class="fas fa-search icon"></i>
        <input class="form-control" type="text" id="searchInput" placeholder="Buscar por código, produto, cliente, pedido..." oninput="filterOrders()">
      </div>
      <select class="form-control" id="filterStatus" style="width:auto;" onchange="filterOrders()">
        <option value="">Todos os status</option>
        <option value="planned">Planejada</option>
        <option value="in_progress">Em Progresso</option>
        <option value="completed">Concluída</option>
        <option value="cancelled">Cancelada</option>
      </select>
      <select class="form-control" id="filterPriority" style="width:auto;" onchange="filterOrders()">
        <option value="">Todas as prioridades</option>
        <option value="urgent">Urgente</option>
        <option value="high">Alta</option>
        <option value="medium">Média</option>
        <option value="low">Baixa</option>
      </select>
      <select class="form-control" id="filterPlant" style="width:auto;" onchange="filterOrders()">
        <option value="">Todas as plantas</option>
        <option>Planta Alpha</option>
        <option>Planta Beta</option>
      </select>
    </div>
  </div>

  <!-- Orders Table -->
  <div class="card" style="overflow:hidden;">
    <div class="table-wrapper">
      <table id="ordersTable">
        <thead><tr>
          <th>Código</th>
          <th>Pedido / Cliente</th>
          <th>Produto</th>
          <th>Qtd Plan.</th>
          <th>Qtd Real.</th>
          <th>Progresso</th>
          <th>Início</th>
          <th>Entrega</th>
          <th>Planta</th>
          <th>Prioridade</th>
          <th>Status</th>
          <th>Ações</th>
        </tr></thead>
        <tbody id="ordersBody">
          ${productionOrders.map(o => {
            const progress = o.quantity > 0 ? Math.round(((o as any).completedQuantity / o.quantity) * 100) : 0
            const isLate = new Date(o.endDate) < new Date() && o.status !== 'completed' && o.status !== 'cancelled'
            const pedido = (o as any).pedido || ''
            const cliente = (o as any).cliente || ''
            return `
            <tr data-status="${o.status}" data-priority="${o.priority}" data-plant="${o.plantName}" data-search="${o.code.toLowerCase()} ${o.productName.toLowerCase()} ${pedido.toLowerCase()} ${cliente.toLowerCase()}">
              <td>
                <div style="font-weight:700;color:#1B4F72;">${o.code}</div>
                ${isLate ? '<div style="font-size:10px;color:#E74C3C;"><i class="fas fa-exclamation-triangle"></i> Atrasada</div>' : ''}
              </td>
              <td>
                ${pedido ? `<div style="font-weight:600;color:#374151;font-size:12px;"><i class="fas fa-file-invoice" style="color:#2980B9;margin-right:4px;"></i>${pedido}</div>` : '<div style="font-size:11px;color:#9ca3af;">—</div>'}
                ${cliente ? `<div style="font-size:11px;color:#6c757d;margin-top:2px;"><i class="fas fa-building" style="margin-right:4px;"></i>${cliente}</div>` : ''}
              </td>
              <td>
                <div style="font-weight:500;color:#374151;">${o.productName}</div>
              </td>
              <td style="font-weight:600;">${o.quantity.toLocaleString('pt-BR')}</td>
              <td style="font-weight:600;color:${(o as any).completedQuantity >= o.quantity ? '#27AE60' : '#374151'};">${(o as any).completedQuantity.toLocaleString('pt-BR')}</td>
              <td style="min-width:100px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <div class="progress-bar" style="flex:1;">
                    <div class="progress-fill" style="width:${progress}%;background:${progress >= 100 ? '#27AE60' : progress > 50 ? '#3498DB' : '#E67E22'};"></div>
                  </div>
                  <span style="font-size:11px;font-weight:700;color:#6c757d;width:32px;text-align:right;">${progress}%</span>
                </div>
              </td>
              <td style="color:#6c757d;font-size:12px;">${new Date(o.startDate + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
              <td style="color:${isLate ? '#E74C3C' : '#6c757d'};font-size:12px;font-weight:${isLate ? '700' : '400'};">
                ${new Date(o.endDate + 'T12:00:00').toLocaleDateString('pt-BR')}
              </td>
              <td style="font-size:12px;color:#6c757d;">${o.plantName}</td>
              <td>
                <span style="font-size:12px;font-weight:700;color:${priorityColors[o.priority]};">
                  <i class="fas fa-circle" style="font-size:7px;"></i> ${priorityLabel[o.priority]}
                </span>
              </td>
              <td>${statusBadge(o.status)}</td>
              <td>
                <div style="display:flex;gap:4px;">
                  <div class="tooltip-wrap" data-tooltip="Ver detalhes"><button class="btn btn-secondary btn-sm" onclick="showOrderDetail('${o.id}')"><i class="fas fa-eye"></i></button></div>
                  <div class="tooltip-wrap" data-tooltip="Editar ordem"><button class="btn btn-secondary btn-sm" onclick="openModal('novaOrdemModal')"><i class="fas fa-edit"></i></button></div>
                  ${o.status === 'planned' ? `<div class="tooltip-wrap" data-tooltip="Iniciar produção"><button class="btn btn-success btn-sm" onclick="alert('Ordem ${o.code} iniciada!')"><i class="fas fa-play"></i></button></div>` : ''}
                  ${o.status === 'in_progress' ? `<div class="tooltip-wrap" data-tooltip="Concluir ordem"><button class="btn btn-warning btn-sm" onclick="alert('Ordem ${o.code} concluída!')"><i class="fas fa-check"></i></button></div>` : ''}
                  ${(o.status === 'planned' || o.status === 'in_progress') ? `<div class="tooltip-wrap" data-tooltip="Cancelar ordem"><button class="btn btn-danger btn-sm" onclick="alert('Cancelar ${o.code}?')"><i class="fas fa-times"></i></button></div>` : ''}
                </div>
              </td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
    <!-- Pagination -->
    <div style="padding:14px 20px;border-top:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:13px;color:#6c757d;" id="rowCount">Mostrando ${productionOrders.length} de ${productionOrders.length} ordens</span>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-secondary btn-sm" title="Página anterior"><i class="fas fa-chevron-left"></i></button>
        <button class="btn btn-primary btn-sm">1</button>
        <button class="btn btn-secondary btn-sm">2</button>
        <button class="btn btn-secondary btn-sm" title="Próxima página"><i class="fas fa-chevron-right"></i></button>
      </div>
    </div>
  </div>

  <!-- Nova Ordem Modal -->
  <div class="modal-overlay" id="novaOrdemModal">
    <div class="modal" style="max-width:620px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-plus-circle" style="margin-right:8px;"></i>Nova Ordem de Produção</h3>
        <button onclick="closeModal('novaOrdemModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Produto *</label>
            <select class="form-control">
              <option>Selecione o produto...</option>
              ${mockData.products.map(p => `<option>${p.name} (${p.code})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Código da Ordem *</label>
            <input class="form-control" type="text" placeholder="OP-2024-009" value="OP-2024-009">
          </div>
          <div class="form-group">
            <label class="form-label">Quantidade *</label>
            <input class="form-control" type="number" placeholder="0">
          </div>
          <!-- Novos campos: Pedido e Cliente -->
          <div class="form-group">
            <label class="form-label"><i class="fas fa-file-invoice" style="margin-right:5px;color:#2980B9;"></i>Pedido de Venda</label>
            <input class="form-control" type="text" placeholder="PV-2024-0XXX">
          </div>
          <div class="form-group">
            <label class="form-label"><i class="fas fa-building" style="margin-right:5px;color:#2980B9;"></i>Nome do Cliente</label>
            <input class="form-control" type="text" placeholder="Razão social do cliente">
          </div>
          <div class="form-group">
            <label class="form-label">Data de Início *</label>
            <input class="form-control" type="date">
          </div>
          <div class="form-group">
            <label class="form-label">Data de Entrega *</label>
            <input class="form-control" type="date">
          </div>
          <div class="form-group">
            <label class="form-label">Planta</label>
            <select class="form-control">
              <option>Selecione...</option>
              ${mockData.plants.map(p => `<option>${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Prioridade</label>
            <select class="form-control">
              <option value="low">Baixa</option>
              <option value="medium" selected>Média</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Observações</label>
            <textarea class="form-control" rows="3" placeholder="Notas adicionais..."></textarea>
          </div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaOrdemModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('Ordem criada com sucesso!');closeModal('novaOrdemModal')" class="btn btn-primary"><i class="fas fa-save"></i> Criar Ordem</button>
      </div>
    </div>
  </div>

  <!-- Order Detail Modal -->
  <div class="modal-overlay" id="orderDetailModal">
    <div class="modal" style="max-width:700px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;" id="detailTitle">Detalhes da Ordem</h3>
        <button onclick="closeModal('orderDetailModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;" id="orderDetailContent"></div>
    </div>
  </div>

  <script>
  const orders = ${JSON.stringify(productionOrders)};

  function filterOrders() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const status = document.getElementById('filterStatus').value.toLowerCase();
    const priority = document.getElementById('filterPriority').value.toLowerCase();
    const plant = document.getElementById('filterPlant').value.toLowerCase();
    const rows = document.querySelectorAll('#ordersBody tr');
    let visible = 0;
    rows.forEach(row => {
      const rowSearch = row.dataset.search || '';
      const rowStatus = row.dataset.status || '';
      const rowPriority = row.dataset.priority || '';
      const rowPlant = (row.dataset.plant || '').toLowerCase();
      const matchSearch = !search || rowSearch.includes(search);
      const matchStatus = !status || rowStatus === status;
      const matchPriority = !priority || rowPriority === priority;
      const matchPlant = !plant || rowPlant.includes(plant);
      if (matchSearch && matchStatus && matchPriority && matchPlant) {
        row.style.display = '';
        visible++;
      } else {
        row.style.display = 'none';
      }
    });
    document.getElementById('rowCount').textContent = 'Mostrando ' + visible + ' de ' + rows.length + ' ordens';
  }

  function showOrderDetail(id) {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    const progress = o.quantity > 0 ? Math.round((o.completedQuantity / o.quantity) * 100) : 0;
    document.getElementById('detailTitle').textContent = 'Detalhes — ' + o.code;
    document.getElementById('orderDetailContent').innerHTML = \`
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        <div><span style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Produto</span><div style="font-size:15px;font-weight:700;color:#1B4F72;">\${o.productName}</div></div>
        <div><span style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Planta</span><div style="font-size:15px;font-weight:700;">\${o.plantName}</div></div>
        \${o.pedido ? '<div><span style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Pedido de Venda</span><div style="font-size:15px;font-weight:700;color:#2980B9;"><i class=\\"fas fa-file-invoice\\" style=\\"margin-right:6px;\\"></i>' + o.pedido + '</div></div>' : ''}
        \${o.cliente ? '<div><span style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Cliente</span><div style="font-size:15px;font-weight:700;"><i class=\\"fas fa-building\\" style=\\"margin-right:6px;color:#6c757d;\\"></i>' + o.cliente + '</div></div>' : ''}
        <div><span style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Qtd Planejada</span><div style="font-size:15px;font-weight:700;">\${o.quantity.toLocaleString('pt-BR')} un</div></div>
        <div><span style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Qtd Realizada</span><div style="font-size:15px;font-weight:700;color:\${o.completedQuantity >= o.quantity ? '#27AE60' : '#374151'};">\${o.completedQuantity.toLocaleString('pt-BR')} un</div></div>
        <div><span style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Início</span><div style="font-size:15px;font-weight:700;">\${new Date(o.startDate + 'T12:00:00').toLocaleDateString('pt-BR')}</div></div>
        <div><span style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Entrega</span><div style="font-size:15px;font-weight:700;">\${new Date(o.endDate + 'T12:00:00').toLocaleDateString('pt-BR')}</div></div>
      </div>
      <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:13px;font-weight:600;">Progresso da Ordem</span>
          <span style="font-size:13px;font-weight:700;color:\${progress >= 100 ? '#27AE60' : '#3498DB'};">\${progress}%</span>
        </div>
        <div class="progress-bar" style="height:12px;">
          <div class="progress-fill" style="width:\${progress}%;background:\${progress >= 100 ? '#27AE60' : '#3498DB'};"></div>
        </div>
      </div>
    \`;
    openModal('orderDetailModal');
  }
  </script>
  `
  return c.html(layout('Ordens de Produção', content, 'ordens', userInfo))
})

export default app
