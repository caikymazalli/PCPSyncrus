import { Hono } from 'hono'
import { layout } from '../layout'
import { mockData } from '../data'

const app = new Hono()

app.get('/', (c) => {
  const { productionEntries, productionOrders, chartData } = mockData

  const activeOrders = productionOrders.filter(o => o.status === 'in_progress' || o.status === 'planned')

  const content = `
  <!-- Header -->
  <div class="section-header">
    <div style="font-size:14px;color:#6c757d;">Registro de Apontamentos de Produção</div>
    <button class="btn btn-primary" onclick="openModal('novoApontamentoModal')"><i class="fas fa-plus"></i> Novo Apontamento</button>
  </div>

  <!-- Active Orders for tracking -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-bottom:24px;">
    ${activeOrders.slice(0, 4).map(o => {
      const progress = o.quantity > 0 ? Math.round((o.completedQuantity / o.quantity) * 100) : 0
      const priorityColors: Record<string, string> = { urgent: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#65a30d' }
      return `
      <div class="card" style="padding:16px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
          <div>
            <div style="font-size:14px;font-weight:700;color:#1B4F72;">${o.code}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${o.productName}</div>
          </div>
          <span class="badge ${o.status === 'in_progress' ? 'badge-info' : 'badge-primary'}">${o.status === 'in_progress' ? 'Em Progresso' : 'Planejada'}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:12px;color:#6c757d;">Progresso</span>
          <span style="font-size:12px;font-weight:700;color:${progress >= 100 ? '#27AE60' : '#3498DB'};">${o.completedQuantity}/${o.quantity} un • ${progress}%</span>
        </div>
        <div class="progress-bar" style="margin-bottom:12px;">
          <div class="progress-fill" style="width:${progress}%;background:${progress >= 100 ? '#27AE60' : '#3498DB'};"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
          <span style="font-size:11px;color:#9ca3af;">${o.plantName}</span>
          <span style="font-size:11px;font-weight:700;color:${priorityColors[o.priority]};">● ${o.priority === 'urgent' ? 'Urgente' : o.priority === 'high' ? 'Alta' : o.priority === 'medium' ? 'Média' : 'Baixa'}</span>
        </div>
        <button class="btn btn-primary btn-sm" style="width:100%;" onclick="startTracking('${o.id}','${o.code}')">
          <i class="fas fa-check"></i> Realizar Apontamento
        </button>
      </div>`
    }).join('')}
  </div>

  <!-- Apontamentos Table -->
  <div class="card" style="overflow:hidden;">
    <div style="padding:16px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
      <h4 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-history" style="margin-right:8px;"></i>Histórico de Apontamentos</h4>
      <div style="display:flex;gap:8px;">
        <select class="form-control" style="width:auto;font-size:12px;">
          <option>Todos os operadores</option>
          ${mockData.users.filter(u => u.role === 'operador').map(u => `<option>${u.name}</option>`).join('')}
        </select>
        <button class="btn btn-secondary btn-sm" onclick="alert('Exportando...')"><i class="fas fa-download"></i></button>
      </div>
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Ordem</th><th>Etapa</th><th>Qtd Produzida</th><th>Qtd Rejeitada</th><th>Índice Q.</th><th>Tempo (min)</th><th>Operador</th><th>Data</th><th>Ações</th>
        </tr></thead>
        <tbody>
          ${productionEntries.map(e => {
            const quality = e.quantityRejected
              ? Math.round(((e.quantityProduced - e.quantityRejected) / e.quantityProduced) * 100)
              : 100
            return `
            <tr>
              <td style="font-weight:700;color:#1B4F72;">${e.orderCode}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="width:8px;height:8px;border-radius:50%;background:#27AE60;"></div>
                  <span style="font-weight:500;">${e.stepName || 'Produção Geral'}</span>
                </div>
              </td>
              <td style="font-weight:700;color:#27AE60;">${e.quantityProduced.toLocaleString('pt-BR')}</td>
              <td style="font-weight:700;color:${(e.quantityRejected || 0) > 0 ? '#E74C3C' : '#9ca3af'};">${(e.quantityRejected || 0).toLocaleString('pt-BR')}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;">
                  <div class="progress-bar" style="width:60px;">
                    <div class="progress-fill" style="width:${quality}%;background:${quality >= 98 ? '#27AE60' : quality >= 95 ? '#F39C12' : '#E74C3C'};"></div>
                  </div>
                  <span style="font-size:12px;font-weight:700;color:${quality >= 98 ? '#27AE60' : quality >= 95 ? '#F39C12' : '#E74C3C'};">${quality}%</span>
                </div>
              </td>
              <td style="color:#6c757d;">${e.timeSpent || '—'}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <div class="avatar" style="width:28px;height:28px;background:#1B4F72;font-size:10px;">${e.operator.split(' ').map(n => n[0]).slice(0,2).join('')}</div>
                  <span style="font-size:12px;">${e.operator}</span>
                </div>
              </td>
              <td style="font-size:12px;color:#6c757d;">${new Date(e.recordedAt + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
              <td>
                <div style="display:flex;gap:4px;">
                  <button class="btn btn-secondary btn-sm" onclick="openModal('novoApontamentoModal')"><i class="fas fa-edit"></i></button>
                  <button class="btn btn-danger btn-sm" onclick="alert('Confirmar exclusão?')"><i class="fas fa-trash"></i></button>
                </div>
              </td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Quality Chart -->
  <div class="card" style="padding:20px;margin-top:20px;">
    <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0 0 16px;">Índice de Qualidade Semanal</h4>
    <canvas id="qualityChart" style="max-height:180px;"></canvas>
  </div>

  <!-- Novo Apontamento Modal -->
  <div class="modal-overlay" id="novoApontamentoModal">
    <div class="modal" style="max-width:600px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;" id="apontModalTitle"><i class="fas fa-check-square" style="margin-right:8px;"></i>Novo Apontamento de Produção</h3>
        <button onclick="closeModal('novoApontamentoModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <!-- Order selected info -->
        <div id="selectedOrderInfo" style="display:none;background:#e8f4fd;border-radius:8px;padding:12px;margin-bottom:16px;border-left:4px solid #1B4F72;">
          <div style="font-size:12px;color:#6c757d;margin-bottom:2px;">Ordem Selecionada</div>
          <div style="font-size:15px;font-weight:700;color:#1B4F72;" id="selectedOrderCode">—</div>
        </div>

        <div class="form-group">
          <label class="form-label">Ordem de Produção *</label>
          <select class="form-control" id="apontOrderSelect" onchange="updateOrderInfo(this.value)">
            <option value="">Selecione a ordem...</option>
            ${activeOrders.map(o => `<option value="${o.id}" data-code="${o.code}">${o.code} — ${o.productName}</option>`).join('')}
          </select>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">Tipo de Apontamento</label>
            <select class="form-control">
              <option value="step">Por Etapa</option>
              <option value="assembly">Montagem</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Etapa / Operação</label>
            <input class="form-control" type="text" placeholder="Ex: Torneamento">
          </div>
          <div class="form-group">
            <label class="form-label">Qtd Produzida *</label>
            <input class="form-control" type="number" placeholder="0" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Qtd Rejeitada</label>
            <input class="form-control" type="number" placeholder="0" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Tempo Gasto (min)</label>
            <input class="form-control" type="number" placeholder="0" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Operador *</label>
            <select class="form-control">
              <option>Selecione...</option>
              ${mockData.users.map(u => `<option>${u.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Data do Apontamento *</label>
            <input class="form-control" type="date" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" rows="2" placeholder="Ocorrências, observações..."></textarea>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novoApontamentoModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('Apontamento registrado com sucesso!');closeModal('novoApontamentoModal')" class="btn btn-success"><i class="fas fa-check"></i> Registrar</button>
      </div>
    </div>
  </div>

  <script>
  const activeOrdersData = ${JSON.stringify(activeOrders)};

  function startTracking(orderId, code) {
    document.getElementById('apontOrderSelect').value = orderId;
    document.getElementById('selectedOrderInfo').style.display = 'block';
    document.getElementById('selectedOrderCode').textContent = code;
    openModal('novoApontamentoModal');
  }

  function updateOrderInfo(val) {
    const select = document.getElementById('apontOrderSelect');
    const opt = select.options[select.selectedIndex];
    if (val && opt) {
      document.getElementById('selectedOrderInfo').style.display = 'block';
      document.getElementById('selectedOrderCode').textContent = opt.dataset.code || val;
    } else {
      document.getElementById('selectedOrderInfo').style.display = 'none';
    }
  }

  // Quality Chart
  const qCtx = document.getElementById('qualityChart').getContext('2d');
  new Chart(qCtx, {
    type: 'line',
    data: {
      labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
      datasets: [{
        label: 'Índice de Qualidade (%)',
        data: ${JSON.stringify(chartData.qualityPerWeek)},
        borderColor: '#27AE60',
        backgroundColor: 'rgba(39,174,96,0.08)',
        tension: 0.4,
        fill: true,
        pointRadius: 5,
        pointBackgroundColor: '#27AE60',
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 95, max: 100, ticks: { callback: v => v + '%' } },
        x: { grid: { display: false } }
      }
    }
  });
  </script>
  `
  return c.html(layout('Apontamento de Produção', content, 'apontamento'))
})

export default app
