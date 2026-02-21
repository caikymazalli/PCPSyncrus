import { Hono } from 'hono'
import { layout } from '../layout'
import { mockData } from '../data'

const app = new Hono()

app.get('/', (c) => {
  const { mrpEntries, productionOrders, chartData, plants } = mockData

  const content = `
  <!-- Header -->
  <div class="section-header">
    <div style="font-size:14px;color:#6c757d;">MRP, Capacidade e Sequenciamento de Produção</div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-secondary" onclick="alert('Atualizando dados...')"><i class="fas fa-sync-alt"></i> Recalcular</button>
      <button class="btn btn-primary" onclick="alert('Exportando relatório...')"><i class="fas fa-download"></i> Exportar</button>
    </div>
  </div>

  <div data-tab-group="plan">
    <div class="tab-nav">
      <button class="tab-btn active" onclick="switchTab('tabMRP','plan')"><i class="fas fa-boxes" style="margin-right:6px;"></i>MRP — Necessidades</button>
      <button class="tab-btn" onclick="switchTab('tabCapacidade','plan')"><i class="fas fa-chart-bar" style="margin-right:6px;"></i>Capacidade</button>
      <button class="tab-btn" onclick="switchTab('tabSequenciamento','plan')"><i class="fas fa-sort-amount-down" style="margin-right:6px;"></i>Sequenciamento</button>
      <button class="tab-btn" onclick="switchTab('tabGantt','plan')"><i class="fas fa-calendar-alt" style="margin-right:6px;"></i>Gráfico de Gantt</button>
    </div>

    <!-- MRP Tab -->
    <div class="tab-content active" id="tabMRP">
      <!-- MRP Summary -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:20px;">
        <div class="kpi-card">
          <div style="font-size:28px;font-weight:800;color:#E74C3C;">${mrpEntries.filter(m => m.shortfall > 0).length}</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;">Itens em Deficit</div>
        </div>
        <div class="kpi-card">
          <div style="font-size:28px;font-weight:800;color:#27AE60;">${mrpEntries.filter(m => m.shortfall === 0).length}</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;">Itens Suficientes</div>
        </div>
        <div class="kpi-card">
          <div style="font-size:28px;font-weight:800;color:#E67E22;">${mrpEntries.filter(m => m.suggestedAction === 'purchase').length}</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;">Compras Sugeridas</div>
        </div>
        <div class="kpi-card">
          <div style="font-size:28px;font-weight:800;color:#3498DB;">${mrpEntries.filter(m => m.suggestedAction === 'manufacture').length}</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;">Manufaturas Sugeridas</div>
        </div>
      </div>

      <div class="card" style="overflow:hidden;">
        <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
          <h4 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-boxes" style="margin-right:8px;"></i>Planejamento de Necessidades de Materiais (MRP)</h4>
          <button class="btn btn-primary btn-sm" onclick="openModal('novoMRPModal')"><i class="fas fa-plus"></i> Adicionar</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Produto</th><th>Componente</th><th>Qtd Necessária</th><th>Qtd Disponível</th><th>Déficit</th><th>Status</th><th>Ação Sugerida</th><th>Gerado em</th>
            </tr></thead>
            <tbody>
              ${mrpEntries.map(m => `
              <tr>
                <td style="font-size:12px;color:#6c757d;">${m.productName}</td>
                <td style="font-weight:600;color:#374151;">${m.componentName}</td>
                <td style="font-weight:700;color:#374151;">${m.requiredQuantity.toLocaleString('pt-BR')}</td>
                <td style="font-weight:700;color:${m.availableQuantity >= m.requiredQuantity ? '#27AE60' : '#E74C3C'};">${m.availableQuantity.toLocaleString('pt-BR')}</td>
                <td>
                  ${m.shortfall > 0
                    ? `<span style="font-weight:700;color:#E74C3C;"><i class="fas fa-exclamation-triangle" style="font-size:11px;"></i> ${m.shortfall.toLocaleString('pt-BR')}</span>`
                    : `<span style="font-weight:700;color:#27AE60;"><i class="fas fa-check-circle" style="font-size:11px;"></i> OK</span>`}
                </td>
                <td>
                  ${m.shortfall > 0
                    ? '<span class="badge badge-danger"><i class="fas fa-exclamation-circle" style="font-size:9px;"></i> Crítico</span>'
                    : '<span class="badge badge-success"><i class="fas fa-check" style="font-size:9px;"></i> Normal</span>'}
                </td>
                <td>
                  <span class="badge ${m.suggestedAction === 'purchase' ? 'badge-warning' : 'badge-info'}">
                    <i class="fas ${m.suggestedAction === 'purchase' ? 'fa-shopping-cart' : 'fa-industry'}" style="font-size:9px;"></i>
                    ${m.suggestedAction === 'purchase' ? 'Comprar' : 'Manufaturar'}
                  </span>
                </td>
                <td style="font-size:12px;color:#9ca3af;">${new Date(m.generatedAt + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Capacidade Tab -->
    <div class="tab-content" id="tabCapacidade">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
        <div class="card" style="padding:20px;">
          <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0 0 16px;">Utilização por Planta</h4>
          <canvas id="capacityChart" style="max-height:220px;"></canvas>
        </div>
        <div class="card" style="padding:20px;">
          <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0 0 16px;">Tendência Semanal de Ordens</h4>
          <canvas id="weeklyChart" style="max-height:220px;"></canvas>
        </div>
      </div>

      <!-- Capacity details table -->
      <div class="card" style="padding:20px;">
        <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0 0 16px;">Detalhamento de Capacidade — Plantas</h4>
        ${plants.map(p => {
          const util = mockData.chartData.capacityUtilization[p.name as keyof typeof mockData.chartData.capacityUtilization] || 0
          return `
          <div style="margin-bottom:16px;padding:14px;background:#f8f9fa;border-radius:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <div>
                <div style="font-size:14px;font-weight:700;color:#1B4F72;">${p.name}</div>
                <div style="font-size:12px;color:#9ca3af;">${p.location} • Capacidade: ${p.totalCapacity} peças/turno</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:22px;font-weight:800;color:${util > 80 ? '#E74C3C' : util > 60 ? '#F39C12' : '#27AE60'};">${util}%</div>
                <div style="font-size:11px;color:#9ca3af;">utilização</div>
              </div>
            </div>
            <div class="progress-bar" style="height:10px;">
              <div class="progress-fill" style="width:${util}%;background:${util > 80 ? '#E74C3C' : util > 60 ? '#F39C12' : '#27AE60'};"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:6px;">
              <span style="font-size:11px;color:#9ca3af;">Utilizado: ${Math.round(p.totalCapacity * util / 100)} peças/turno</span>
              <span style="font-size:11px;color:#9ca3af;">Livre: ${Math.round(p.totalCapacity * (100-util) / 100)} peças/turno</span>
            </div>
          </div>`
        }).join('')}
      </div>
    </div>

    <!-- Sequenciamento Tab -->
    <div class="tab-content" id="tabSequenciamento">
      <div class="card" style="padding:20px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0;">Sequenciamento de Ordens</h4>
          <div style="display:flex;gap:8px;">
            <select class="form-control" style="width:auto;font-size:12px;">
              <option>Ordenar por: Prioridade</option>
              <option>Ordenar por: Data</option>
              <option>Ordenar por: Status</option>
            </select>
            <button class="btn btn-success btn-sm" onclick="alert('Sequenciamento otimizado!')"><i class="fas fa-magic"></i> Otimizar</button>
          </div>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Seq.</th><th>Ordem</th><th>Produto</th><th>Qtd</th><th>Prioridade</th><th>Início</th><th>Fim</th><th>Status</th><th>Planta</th>
            </tr></thead>
            <tbody>
              ${productionOrders
                .filter(o => o.status !== 'cancelled' && o.status !== 'completed')
                .sort((a, b) => {
                  const pri = { urgent: 0, high: 1, medium: 2, low: 3 }
                  return (pri[a.priority as keyof typeof pri] || 3) - (pri[b.priority as keyof typeof pri] || 3)
                })
                .map((o, idx) => {
                  const priorityColors: Record<string, string> = { urgent: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#65a30d' }
                  const priorityLabel: Record<string, string> = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' }
                  return `
                  <tr>
                    <td>
                      <div style="width:28px;height:28px;border-radius:50%;background:#1B4F72;color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">${idx+1}</div>
                    </td>
                    <td style="font-weight:700;color:#1B4F72;">${o.code}</td>
                    <td style="font-size:13px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${o.productName}</td>
                    <td style="font-weight:600;">${o.quantity.toLocaleString('pt-BR')}</td>
                    <td><span style="font-size:12px;font-weight:700;color:${priorityColors[o.priority]};">● ${priorityLabel[o.priority]}</span></td>
                    <td style="font-size:12px;color:#6c757d;">${new Date(o.startDate + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                    <td style="font-size:12px;color:#6c757d;">${new Date(o.endDate + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                    <td><span class="badge ${o.status === 'in_progress' ? 'badge-info' : 'badge-primary'}">${o.status === 'in_progress' ? 'Em Progresso' : 'Planejada'}</span></td>
                    <td style="font-size:12px;color:#9ca3af;">${o.plantName}</td>
                  </tr>`
                }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Gantt Tab -->
    <div class="tab-content" id="tabGantt">
      <div class="card" style="padding:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0;">Gráfico de Gantt — Fevereiro 2024</h4>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary btn-sm"><i class="fas fa-chevron-left"></i> Mês Ant.</button>
            <button class="btn btn-primary btn-sm">Fevereiro 2024</button>
            <button class="btn btn-secondary btn-sm">Próx. Mês <i class="fas fa-chevron-right"></i></button>
          </div>
        </div>
        <!-- Gantt Header (Days) -->
        <div style="display:flex;margin-bottom:8px;">
          <div style="width:180px;flex-shrink:0;"></div>
          <div style="flex:1;display:flex;">
            ${Array.from({length: 28}, (_, i) => i + 1).map(d => `<div style="flex:1;text-align:center;font-size:10px;color:#9ca3af;font-weight:${d === 15 ? '700' : '400'};">${d}</div>`).join('')}
          </div>
        </div>
        <!-- Gantt Rows -->
        ${productionOrders.filter(o => o.status !== 'cancelled').map(o => {
          const start = new Date(o.startDate + 'T12:00:00').getDate()
          const end = new Date(o.endDate + 'T12:00:00').getDate()
          const duration = Math.max(1, end - start + 1)
          const left = ((start - 1) / 28) * 100
          const width = (duration / 28) * 100
          const colors: Record<string, string> = { completed: '#27AE60', in_progress: '#3498DB', planned: '#1B4F72', cancelled: '#9ca3af' }
          const progress = o.quantity > 0 ? Math.round((o.completedQuantity / o.quantity) * 100) : 0
          return `
          <div style="display:flex;align-items:center;margin-bottom:6px;">
            <div style="width:180px;font-size:11px;font-weight:600;color:#374151;flex-shrink:0;padding-right:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${o.code}">${o.code}</div>
            <div style="flex:1;height:32px;background:#f1f5f9;border-radius:4px;position:relative;">
              <div style="position:absolute;left:${left}%;width:${width}%;height:100%;background:${colors[o.status]};border-radius:4px;display:flex;align-items:center;padding:0 6px;box-sizing:border-box;overflow:hidden;">
                <div style="height:100%;background:rgba(255,255,255,0.25);border-radius:3px;width:${progress}%;position:absolute;left:0;top:0;"></div>
                <span style="font-size:10px;font-weight:700;color:white;position:relative;z-index:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${o.code} (${progress}%)</span>
              </div>
            </div>
          </div>`
        }).join('')}
        <div style="display:flex;gap:16px;margin-top:16px;padding-top:16px;border-top:1px solid #f1f3f5;">
          <div style="display:flex;align-items:center;gap:6px;"><div style="width:12px;height:12px;border-radius:3px;background:#27AE60;"></div><span style="font-size:12px;color:#6c757d;">Concluída</span></div>
          <div style="display:flex;align-items:center;gap:6px;"><div style="width:12px;height:12px;border-radius:3px;background:#3498DB;"></div><span style="font-size:12px;color:#6c757d;">Em Progresso</span></div>
          <div style="display:flex;align-items:center;gap:6px;"><div style="width:12px;height:12px;border-radius:3px;background:#1B4F72;"></div><span style="font-size:12px;color:#6c757d;">Planejada</span></div>
        </div>
      </div>
    </div>
  </div>

  <!-- MRP Modal -->
  <div class="modal-overlay" id="novoMRPModal">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;">Adicionar Entrada MRP</h3>
        <button onclick="closeModal('novoMRPModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <div class="form-group"><label class="form-label">Produto</label>
          <select class="form-control">${mockData.products.map(p => `<option>${p.name}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">Componente</label><input class="form-control" type="text" placeholder="Nome do componente"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group"><label class="form-label">Qtd Necessária</label><input class="form-control" type="number" placeholder="0"></div>
          <div class="form-group"><label class="form-label">Qtd Disponível</label><input class="form-control" type="number" placeholder="0"></div>
        </div>
        <div class="form-group"><label class="form-label">Ação Sugerida</label>
          <select class="form-control"><option value="purchase">Comprar</option><option value="manufacture">Manufaturar</option></select>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novoMRPModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('Entrada MRP salva!');closeModal('novoMRPModal')" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <script>
  // Capacity Chart
  const capCtx = document.getElementById('capacityChart')?.getContext('2d');
  if (capCtx) new Chart(capCtx, {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(Object.keys(chartData.capacityUtilization))},
      datasets: [{
        label: 'Utilização (%)',
        data: ${JSON.stringify(Object.values(chartData.capacityUtilization))},
        backgroundColor: ${JSON.stringify(Object.values(chartData.capacityUtilization).map(v => v > 80 ? '#E74C3C' : v > 60 ? '#F39C12' : '#27AE60'))},
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { max: 100, beginAtZero: true, ticks: { callback: v => v + '%' } } }
    }
  });

  // Weekly Chart
  const wkCtx = document.getElementById('weeklyChart')?.getContext('2d');
  if (wkCtx) new Chart(wkCtx, {
    type: 'line',
    data: {
      labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5', 'Sem 6', 'Sem 7'],
      datasets: [{
        label: 'Ordens Abertas',
        data: ${JSON.stringify(chartData.ordersPerWeek)},
        borderColor: '#1B4F72',
        backgroundColor: 'rgba(27,79,114,0.1)',
        tension: 0.4,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
  </script>
  `
  return c.html(layout('Planejamento & MRP', content, 'planejamento'))
})

export default app
