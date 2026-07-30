import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxUserId, getCtxEmpresaId } from '../sessionHelper'
import { genId, dbInsert, dbUpdate, dbDelete, ok, err } from '../dbHelpers'
import { requireModuleWriteAccess } from '../moduleAccess'
import { generateSerials, SERIAL_STATUS, completeSerialsForOrder } from '../lib/serialNumbering'

const app = new Hono()

app.use('*', async (c, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    const blocked = await requireModuleWriteAccess(c, 'ordens')
    if (blocked) return blocked
  }
  return next()
})

app.get('/', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const mockData = tenant  // per-session data
  const productionOrders = (mockData as any).productionOrders || []

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
  const escA = (s: string) => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const escJs = (s: string) => String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')

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
      <button class="btn btn-primary" onclick="openNovaOrdemModal()" title="Criar nova ordem de produção"><i class="fas fa-plus"></i> Nova Ordem</button>
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
            <tr data-status="${o.status}" data-priority="${o.priority}" data-plant="${escA(o.plantName)}" data-search="${escA(o.code.toLowerCase())} ${escA(o.productName.toLowerCase())} ${escA(pedido.toLowerCase())} ${escA(cliente.toLowerCase())}">
              <td>
                <div style="font-weight:700;color:#1B4F72;">${escA(o.code)}</div>
                ${isLate ? '<div style="font-size:10px;color:#E74C3C;"><i class="fas fa-exclamation-triangle"></i> Atrasada</div>' : ''}
              </td>
              <td>
                ${pedido ? `<div style="font-weight:600;color:#374151;font-size:12px;"><i class="fas fa-file-invoice" style="color:#2980B9;margin-right:4px;"></i>${escA(pedido)}</div>` : '<div style="font-size:11px;color:#9ca3af;">—</div>'}
                ${cliente ? `<div style="font-size:11px;color:#6c757d;margin-top:2px;"><i class="fas fa-building" style="margin-right:4px;"></i>${escA(cliente)}</div>` : ''}
              </td>
              <td>
                <div style="font-weight:500;color:#374151;">${escA(o.productName)}</div>
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
              <td style="font-size:12px;color:#6c757d;">${escA(o.plantName)}</td>
              <td>
                <span style="font-size:12px;font-weight:700;color:${priorityColors[o.priority]};">
                  <i class="fas fa-circle" style="font-size:7px;"></i> ${priorityLabel[o.priority]}
                </span>
              </td>
              <td>${statusBadge(o.status)}</td>
              <td>
                <div style="display:flex;gap:4px;">
                  <div class="tooltip-wrap" data-tooltip="Ver detalhes"><button class="btn btn-secondary btn-sm" onclick="showOrderDetail('${o.id}')"><i class="fas fa-eye"></i></button></div>
                  <div class="tooltip-wrap" data-tooltip="Editar ordem"><button class="btn btn-secondary btn-sm" onclick="editOrdem('${o.id}')"><i class="fas fa-edit"></i></button></div>
                  ${o.status === 'planned' ? `<div class="tooltip-wrap" data-tooltip="Iniciar produção"><button class="btn btn-success btn-sm" onclick="updateOrderStatus('${o.id}','in_progress','${escJs(o.code)}')"><i class="fas fa-play"></i></button></div>` : ''}
                  ${o.status === 'in_progress' ? `<div class="tooltip-wrap" data-tooltip="Concluir ordem"><button class="btn btn-warning btn-sm" onclick="updateOrderStatus('${o.id}','completed','${escJs(o.code)}')"><i class="fas fa-check"></i></button></div>` : ''}
                  ${(o.status === 'planned' || o.status === 'in_progress') ? `<div class="tooltip-wrap" data-tooltip="Cancelar ordem"><button class="btn btn-danger btn-sm" onclick="updateOrderStatus('${o.id}','cancelled','${escJs(o.code)}')"><i class="fas fa-times"></i></button></div>` : ''}
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
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i id="novaOrdemModalIcon" class="fas fa-plus-circle" style="margin-right:8px;"></i><span id="novaOrdemModalTitleText">Nova Ordem de Produção</span></h3>
        <button onclick="closeModal('novaOrdemModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Produto *</label>
            <select class="form-control" id="novaOrdemProduct">
              <option value="">Selecione o produto...</option>
              ${mockData.products.map((p: any) => `<option value="${escA(p.code || '')}" data-name="${escA(p.name || '')}">${escA(p.name)} (${escA(p.code || '')})${p.serialControlled ? ' — série automática' : ''}</option>`).join('')}
            </select>
            <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Selecione um produto cadastrado. Se ele for controlado por série, os números são gerados automaticamente ao criar a ordem.</div>
          </div>
          <div class="form-group">
            <label class="form-label">Código da Ordem *</label>
            <input class="form-control" id="novaOrdemCode" type="text" placeholder="OP-2024-009">
          </div>
          <div class="form-group">
            <label class="form-label">Quantidade *</label>
            <input class="form-control" id="novaOrdemQty" type="number" placeholder="0" min="1">
          </div>
          <!-- Novos campos: Pedido e Cliente -->
          <div class="form-group">
            <label class="form-label"><i class="fas fa-file-invoice" style="margin-right:5px;color:#2980B9;"></i>Pedido de Venda</label>
            <input class="form-control" id="novaOrdemPedido" type="text" placeholder="PV-2024-0XXX">
          </div>
          <div class="form-group">
            <label class="form-label"><i class="fas fa-building" style="margin-right:5px;color:#2980B9;"></i>Nome do Cliente</label>
            <input class="form-control" id="novaOrdemCliente" type="text" placeholder="Razão social do cliente">
          </div>
          <div class="form-group">
            <label class="form-label">Data de Início *</label>
            <input class="form-control" id="novaOrdemStart" type="date">
          </div>
          <div class="form-group">
            <label class="form-label">Data de Entrega *</label>
            <input class="form-control" id="novaOrdemEnd" type="date">
          </div>
          <div class="form-group">
            <label class="form-label">Planta</label>
            <select class="form-control" id="novaOrdemPlant">
              <option value="">Selecione...</option>
              ${mockData.plants.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Prioridade</label>
            <select class="form-control" id="novaOrdemPriority">
              <option value="low">Baixa</option>
              <option value="medium" selected>Média</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-control" id="novaOrdemStatus">
              <option value="planned" selected>Planejada</option>
              <option value="in_progress">Em Progresso</option>
            </select>
          </div>
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Observações</label>
            <textarea class="form-control" id="novaOrdemNotes" rows="3" placeholder="Notas adicionais..."></textarea>
          </div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaOrdemModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarOrdem()" class="btn btn-primary" id="btnCriarOrdem"><i class="fas fa-save"></i> <span id="btnCriarOrdemText">Criar Ordem</span></button>
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

  <!-- Modal: solicitação de impressão de etiqueta de S/N ao concluir a OP -->
  <div class="modal-overlay" id="etiquetaOpModal">
    <div class="modal" style="max-width:520px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-print" style="margin-right:8px;color:#7c3aed;"></i>Imprimir etiquetas de série</h3>
        <button onclick="pularEtiquetasOP()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <p style="font-size:14px;color:#374151;margin-bottom:12px;">A ordem <b id="etiquetaOpOrderCode"></b> foi concluída com <b id="etiquetaOpCount"></b> número(s) de série. Imprima as etiquetas agora antes de enviar para o estoque.</p>
        <div id="etiquetaOpList" style="max-height:180px;overflow:auto;padding:8px;background:#f9fafb;border-radius:8px;margin-bottom:16px;"></div>
        <div style="font-size:12px;color:#9ca3af;background:#eff6ff;border:1px solid #bfdbfe;padding:10px 12px;border-radius:8px;">
          <i class="fas fa-circle-info" style="margin-right:5px;"></i>Após a impressão, os itens já contam como estoque disponível, ficando pendente apenas o <b>endereçamento</b> e a <b>etiqueta do endereço</b> no módulo de Estoque.
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button class="btn btn-secondary" onclick="pularEtiquetasOP()">Pular por agora</button>
        <button class="btn btn-primary" onclick="imprimirEtiquetasOP()"><i class="fas fa-print"></i> Imprimir etiquetas</button>
      </div>
    </div>
  </div>

  <script>
  const orders = ${JSON.stringify(productionOrders).replace(/</g,'\\u003c').replace(/>/g,'\\u003e')};
  let _editOrdemId = null;

  function openNovaOrdemModal() {
    _editOrdemId = null;
    document.getElementById('novaOrdemCode').value = '';
    document.getElementById('novaOrdemProduct').value = '';
    document.getElementById('novaOrdemQty').value = '';
    document.getElementById('novaOrdemStart').value = '';
    document.getElementById('novaOrdemEnd').value = '';
    document.getElementById('novaOrdemPriority').value = 'medium';
    document.getElementById('novaOrdemStatus').value = 'planned';
    document.getElementById('novaOrdemCliente').value = '';
    document.getElementById('novaOrdemPedido').value = '';
    document.getElementById('novaOrdemNotes').value = '';
    document.getElementById('novaOrdemPlant').value = '';
    document.getElementById('novaOrdemModalIcon').className = 'fas fa-plus-circle';
    document.getElementById('novaOrdemModalTitleText').textContent = 'Nova Ordem de Produção';
    document.getElementById('btnCriarOrdemText').textContent = 'Criar Ordem';
    openModal('novaOrdemModal');
  }

  function editOrdem(id) {
    const o = orders.find(x => x.id === id);
    if (!o) { showToast('Ordem não encontrada', 'error'); return; }
    _editOrdemId = id;
    document.getElementById('novaOrdemCode').value = o.code || '';
    const productSel = document.getElementById('novaOrdemProduct');
    if (productSel) {
      // Prioriza o código salvo; ordens antigas (sem productCode) tentam casar pelo nome
      productSel.value = o.productCode || '';
      if (!productSel.value && o.productName) {
        const match = Array.from(productSel.options).find(opt => opt.dataset && opt.dataset.name === o.productName);
        if (match) productSel.value = match.value;
      }
    }
    document.getElementById('novaOrdemQty').value = o.quantity || '';
    document.getElementById('novaOrdemStart').value = o.startDate || '';
    document.getElementById('novaOrdemEnd').value = o.endDate || '';
    document.getElementById('novaOrdemPriority').value = o.priority || 'medium';
    document.getElementById('novaOrdemStatus').value = o.status || 'planned';
    document.getElementById('novaOrdemCliente').value = o.cliente || '';
    document.getElementById('novaOrdemPedido').value = o.pedido || '';
    document.getElementById('novaOrdemNotes').value = o.notes || '';
    document.getElementById('novaOrdemPlant').value = o.plantId || '';
    document.getElementById('novaOrdemModalIcon').className = 'fas fa-edit';
    document.getElementById('novaOrdemModalTitleText').textContent = 'Editar Ordem de Produção';
    document.getElementById('btnCriarOrdemText').textContent = 'Salvar Alterações';
    openModal('novaOrdemModal');
  }

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
      \${(o.serials && o.serials.length) ? (
        '<div style="margin-bottom:16px;padding:12px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;">' +
        '<span style="font-size:11px;color:#7c3aed;font-weight:700;text-transform:uppercase;"><i class="fas fa-barcode" style="margin-right:5px;"></i>Números de série gerados automaticamente (' + o.serials.length + ')</span>' +
        '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">' +
        o.serials.map(s => '<span style="font-family:monospace;font-size:12px;background:#fff;border:1px solid #c4b5fd;color:#5b21b6;padding:3px 8px;border-radius:5px;">' + s + '</span>').join('') +
        '</div></div>'
      ) : ''}
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


  async function updateOrderStatus(id, newStatus, code) {
    const labels = { in_progress: 'iniciada', completed: 'concluída', cancelled: 'cancelada' };
    if (!confirm('Deseja marcar a ordem ' + code + ' como ' + (labels[newStatus] || newStatus) + '?')) return;
    try {
      const res = await fetch('/ordens/api/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('✅ Ordem ' + code + ' ' + (labels[newStatus] || newStatus) + '!');
        if (data.serialsToLabel && data.serialsToLabel.length) {
          promptImprimirEtiquetasSN(data.serialsToLabel, code);
        } else {
          setTimeout(() => location.reload(), 800);
        }
      } else {
        showToast(data.error || 'Erro ao atualizar ordem', 'error');
      }
    } catch(e) {
      showToast('Erro de conexão', 'error');
    }
  }

  // ── Etiqueta de S/N ao concluir a OP ────────────────────────────────────
  // A OP concluída deixa os seriais como 'pendente_enderecamento': o item já
  // conta como estoque, mas falta endereçar fisicamente. Antes disso, pedimos
  // a impressão da etiqueta do número de série (rastreabilidade física do item).
  function promptImprimirEtiquetasSN(serials, orderCode) {
    const modal = document.getElementById('etiquetaOpModal');
    document.getElementById('etiquetaOpCount').textContent = serials.length;
    document.getElementById('etiquetaOpOrderCode').textContent = orderCode;
    document.getElementById('etiquetaOpList').innerHTML = serials.map(s =>
      '<span style="font-family:monospace;font-size:12px;background:#fff;border:1px solid #c4b5fd;color:#5b21b6;padding:3px 8px;border-radius:5px;margin:2px;display:inline-block;">' + s.number + '</span>'
    ).join('');
    window._serialsParaEtiqueta = serials;
    window._orderRecemConcluida = orderCode;
    openModal('etiquetaOpModal');
  }

  function imprimirEtiquetasOP() {
    const serials = window._serialsParaEtiqueta || [];
    if (!serials.length) return;
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) { showToast('Bloqueio de popup — permita popups para imprimir', 'error'); return; }
    const largMm = 60, altMm = 30;
    const etqCss = 'width:' + largMm + 'mm;height:' + altMm + 'mm;border:1px solid #333;padding:3mm 4mm;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;page-break-after:always;page-break-inside:avoid;overflow:hidden;';
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Etiquetas S/N</title>' +
      '<style>@page{size:' + largMm + 'mm ' + altMm + 'mm;margin:0;}body{margin:0;padding:0;}</style></head><body>' +
      serials.map(function(s) {
        return '<div style="' + etqCss + '">' +
          '<div style="font-size:8pt;color:#555;font-family:monospace;">' + (s.itemCode||'') + '</div>' +
          '<div style="font-size:9pt;font-weight:700;color:#1B4F72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (s.itemName||'') + '</div>' +
          '<div style="font-size:11pt;font-weight:800;color:#7c3aed;font-family:monospace;letter-spacing:1px;">' + s.number + '</div>' +
        '</div>';
      }).join('') +
      '<scr' + 'ipt>window.onload=function(){window.print();}<' + '/scr' + 'ipt></body></html>';
    win.document.write(html);
    win.document.close();
    closeModal('etiquetaOpModal');
    showToast('Ordem concluída — pendente apenas endereçamento no Estoque.');
    setTimeout(() => location.reload(), 900);
  }

  function pularEtiquetasOP() {
    closeModal('etiquetaOpModal');
    setTimeout(() => location.reload(), 300);
  }

  async function salvarOrdem() {
    const code = document.getElementById('novaOrdemCode')?.value?.trim() || '';
    const productSel = document.getElementById('novaOrdemProduct');
    const productCode = productSel?.value || '';
    const productName = productSel?.options[productSel.selectedIndex]?.dataset?.name || '';
    const quantity = parseInt(document.getElementById('novaOrdemQty')?.value || '1') || 1;
    const startDate = document.getElementById('novaOrdemStart')?.value || '';
    const endDate = document.getElementById('novaOrdemEnd')?.value || '';
    const priority = document.getElementById('novaOrdemPriority')?.value || 'medium';
    const status = document.getElementById('novaOrdemStatus')?.value || 'planned';
    const cliente = document.getElementById('novaOrdemCliente')?.value?.trim() || '';
    const pedido = document.getElementById('novaOrdemPedido')?.value?.trim() || '';
    const notes = document.getElementById('novaOrdemNotes')?.value?.trim() || '';
    const plantSel = document.getElementById('novaOrdemPlant');
    const plantId = plantSel?.value || '';
    const plantName = plantSel?.options[plantSel.selectedIndex]?.text || '';

    if (!productCode) { showToast('Selecione o produto!', 'error'); return; }

    const payload = { code, productCode, productName, quantity, startDate, endDate, priority, status, cliente, pedido, notes, plantId, plantName };

    try {
      let res;
      if (_editOrdemId) {
        res = await fetch('/ordens/api/' + _editOrdemId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/ordens/api/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      const data = await res.json();
      if (data.ok) {
        const serialMsg = (data.serials && data.serials.length) ? (' — ' + data.serials.length + ' série(s) geradas automaticamente') : '';
        showToast((_editOrdemId ? '✅ Ordem atualizada com sucesso!' : '✅ Ordem criada com sucesso!') + serialMsg);
        closeModal('novaOrdemModal');
        setTimeout(() => location.reload(), 900);
      } else {
        showToast(data.error || 'Erro ao salvar ordem', 'error');
      }
    } catch(e) {
      showToast('Erro de conexão', 'error');
    }
  }

  async function deleteOrdem(id) {
    if (!confirm('Excluir esta ordem?')) return;
    try {
      const res = await fetch('/ordens/api/' + id, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        showToast('Ordem excluída!');
        const row = document.getElementById('order-' + id);
        if (row) row.remove();
      } else {
        showToast(data.error || 'Erro ao excluir', 'error');
      }
    } catch(e) {
      showToast('Erro de conexão', 'error');
    }
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
  return c.html(layout('Ordens de Produção', content, 'ordens', userInfo))
})

// ── API: POST /ordens/api/create ─────────────────────────────────────────────
app.post('/api/create', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body) return err(c, 'Dados inválidos')

  const id = genId('op')
  const productCode = body.productCode || ''
  const order: any = {
    id,
    code: body.code || `OP-${Date.now().toString().slice(-6)}`,
    productName: body.productName || '',
    productId: body.productId || '',
    productCode,
    quantity: parseInt(body.quantity) || 1,
    completedQuantity: 0,
    status: body.status || 'planned',
    priority: body.priority || 'medium',
    startDate: body.startDate || new Date().toISOString().split('T')[0],
    endDate: body.endDate || '',
    plantId: body.plantId || '',
    plantName: body.plantName || '',
    pedido: body.pedido || '',
    cliente: body.cliente || '',
    notes: body.notes || '',
    createdAt: new Date().toISOString(),
  }

  // Persist to D1
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'production_orders', {
      id, user_id: userId, empresa_id: empresaId,
      code: order.code, product_code: order.productCode, product_name: order.productName,
      quantity: order.quantity, quantity_produced: 0, completed_quantity: 0,
      status: order.status, priority: order.priority,
      start_date: order.startDate, end_date: order.endDate,
      plant_id: order.plantId, notes: order.notes,
    })
  }

  // Add to in-memory tenant after D1 (or in demo/no-db mode)
  tenant.productionOrders.push(order)

  // ── Geração automática de número de série ─────────────────────────────────
  // Se o produto da OP for controlado por série, os números "nascem" com a
  // ordem: reservados aqui (status 'em_producao'), rastreáveis pelo order_code.
  // Isso NÃO se aplica à carga em massa via planilha (produtos.ts), que segue
  // com liberação manual — este fluxo é só para OPs criadas após o go-live.
  let generatedSerials: string[] = []
  if (productCode) {
    const product = (tenant.products || []).find((p: any) => p.code === productCode)
    if (product && product.serialControlled && (product.controlType === 'serie')) {
      try {
        const { serials, rule } = await generateSerials(db, empresaId, productCode, order.quantity)
        generatedSerials = serials
        const nowIso = new Date().toISOString()

        for (const number of serials) {
          const serialId = genId('sn')
          const serialRecord = {
            id: serialId, itemCode: productCode, itemName: order.productName,
            number, type: 'serie', quantity: 1, status: SERIAL_STATUS.EM_PRODUCAO,
            origin: 'producao', orderCode: order.code, createdAt: nowIso,
          }
          tenant.serialNumbers.push(serialRecord)

          if (db && userId !== 'demo-tenant') {
            await dbInsert(db, 'serial_numbers', {
              id: serialId, user_id: userId, empresa_id: empresaId,
              item_code: productCode, item_name: order.productName,
              number, type: 'serie', quantity: 1, status: SERIAL_STATUS.EM_PRODUCAO,
              origin: 'producao', order_code: order.code, rule_id: rule.id,
            })
          }
        }
        order.serials = generatedSerials
      } catch (e) {
        console.error('[ordens] Falha ao gerar seriais automáticos para', productCode, e)
        // A ordem já foi criada; a falha na geração de série não deve bloquear o fluxo,
        // mas fica registrada no log para o operador liberar manualmente se preciso.
      }
    }
  }

  return ok(c, { order, serials: generatedSerials })
})

// ── API: PUT /ordens/api/:id ─────────────────────────────────────────────────
app.put('/api/:id', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  if (!body) return err(c, 'Dados inválidos')

  const idx = tenant.productionOrders.findIndex((o: any) => o.id === id)
  if (idx === -1) return err(c, 'Ordem não encontrada', 404)

  if (db && userId !== 'demo-tenant') {
    const updateData: Record<string, any> = {}
    if (body.status !== undefined) updateData.status = body.status
    if (body.priority !== undefined) updateData.priority = body.priority
    if (body.completedQuantity !== undefined) updateData.quantity_produced = body.completedQuantity; updateData.completed_quantity = body.completedQuantity
    if (body.code !== undefined) updateData.code = body.code
    if (body.productCode !== undefined) updateData.product_code = body.productCode
    if (body.productName !== undefined) updateData.product_name = body.productName
    if (body.quantity !== undefined) updateData.quantity = body.quantity
    if (body.startDate !== undefined) updateData.start_date = body.startDate
    if (body.endDate !== undefined) updateData.end_date = body.endDate
    if (body.plantId !== undefined) updateData.plant_id = body.plantId
    if (body.notes !== undefined) updateData.notes = body.notes
    if (Object.keys(updateData).length > 0) {
      await dbUpdate(db, 'production_orders', id, userId, updateData)
    }
  }

  Object.assign(tenant.productionOrders[idx], body)
  const updatedOrder = tenant.productionOrders[idx]

  // Se a OP foi (ou já estava) marcada como concluída agora, transiciona os
  // seriais 'em_producao' vinculados para 'pendente_enderecamento' e sinaliza
  // ao front que a etiqueta do número de série deve ser solicitada.
  let serialsToLabel: any[] = []
  if (body.status === 'completed') {
    const empresaId = getCtxEmpresaId(c)
    serialsToLabel = await completeSerialsForOrder(
      db, userId, empresaId, tenant, updatedOrder.code, updatedOrder.productCode || ''
    )
  }

  return ok(c, { order: updatedOrder, serialsToLabel })
})

// ── API: DELETE /ordens/api/:id ──────────────────────────────────────────────
app.delete('/api/:id', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const tenant = getCtxTenant(c)
  const id = c.req.param('id')

  const idx = tenant.productionOrders.findIndex((o: any) => o.id === id)
  if (idx === -1) return err(c, 'Ordem não encontrada', 404)
  if (db && userId !== 'demo-tenant') {
    await dbDelete(db, 'production_orders', id, userId)
  }
  tenant.productionOrders.splice(idx, 1)

  return ok(c)
})

// ── API: GET /ordens/api/list ────────────────────────────────────────────────
app.get('/api/list', async (c) => {
  const tenant = getCtxTenant(c)
  return ok(c, { orders: tenant.productionOrders })
})

// ── API: GET /ordens/api/:id ─────────────────────────────────────────────────
app.get('/api/:id', async (c) => {
  const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const order = tenant.productionOrders.find((o: any) => o.id === id)
  if (!order) return err(c, 'Ordem não encontrada', 404)
  return ok(c, { order })
})

export default app
