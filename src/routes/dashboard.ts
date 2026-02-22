import { Hono } from 'hono'
import { layout } from '../layout'
import { mockData } from '../data'

const app = new Hono()

app.get('/', (c) => {
  const { kpis, productionOrders, chartData, machines, products, stockItems } = mockData

  const recentOrders = productionOrders.slice(0, 5)

  const priorityColors: Record<string, string> = {
    urgent: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#65a30d'
  }
  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      completed: 'badge-success', in_progress: 'badge-info', planned: 'badge-primary',
      cancelled: 'badge-danger', operational: 'badge-success', maintenance: 'badge-warning',
      offline: 'badge-secondary'
    }
    const label: Record<string, string> = {
      completed: 'Concluída', in_progress: 'Em Progresso', planned: 'Planejada',
      cancelled: 'Cancelada', operational: 'Operacional', maintenance: 'Manutenção',
      offline: 'Offline'
    }
    return `<span class="badge ${map[s] || 'badge-secondary'}">${label[s] || s}</span>`
  }

  // Stock metrics
  const stockStatusSummary = chartData.stockStatus
  const criticalProducts = products.filter(p => p.stockStatus === 'critical').length
  const criticalItems = stockItems.filter(s => s.status === 'critical').length

  const content = `
  <!-- KPIs Row 1 -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:16px;margin-bottom:24px;">
    <div class="kpi-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="kpi-value">${kpis.totalOrders}</div>
          <div class="kpi-label">Ordens do Mês</div>
        </div>
        <div style="width:42px;height:42px;border-radius:10px;background:#e8f4fd;display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-clipboard-list" style="color:#1B4F72;font-size:18px;"></i>
        </div>
      </div>
      <div class="kpi-trend" style="color:#27AE60;"><i class="fas fa-arrow-up"></i> +12% vs mês ant.</div>
    </div>

    <div class="kpi-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="kpi-value" style="color:#3498DB;">${kpis.activeOrders}</div>
          <div class="kpi-label">Em Progresso</div>
        </div>
        <div style="width:42px;height:42px;border-radius:10px;background:#e8f4fd;display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-spinner" style="color:#3498DB;font-size:18px;"></i>
        </div>
      </div>
      <div class="kpi-trend" style="color:#6c757d;">${kpis.plannedOrders} planejadas</div>
    </div>

    <div class="kpi-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="kpi-value" style="color:#27AE60;">${kpis.completionRate}%</div>
          <div class="kpi-label">Taxa de Conclusão</div>
        </div>
        <div style="width:42px;height:42px;border-radius:10px;background:#eafaf1;display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-check-circle" style="color:#27AE60;font-size:18px;"></i>
        </div>
      </div>
      <div style="margin-top:8px;">
        <div class="progress-bar">
          <div class="progress-fill" style="width:${kpis.completionRate}%;background:#27AE60;"></div>
        </div>
      </div>
    </div>

    <div class="kpi-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="kpi-value" style="color:#27AE60;">${kpis.qualityRate}%</div>
          <div class="kpi-label">Índice de Qualidade</div>
        </div>
        <div style="width:42px;height:42px;border-radius:10px;background:#eafaf1;display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-star" style="color:#27AE60;font-size:18px;"></i>
        </div>
      </div>
      <div style="margin-top:8px;">
        <div class="progress-bar">
          <div class="progress-fill" style="width:${kpis.qualityRate}%;background:#27AE60;"></div>
        </div>
      </div>
    </div>

    <div class="kpi-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="kpi-value" style="color:#E67E22;">${kpis.totalProduced.toLocaleString('pt-BR')}</div>
          <div class="kpi-label">Peças Produzidas</div>
        </div>
        <div style="width:42px;height:42px;border-radius:10px;background:#fef3e8;display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-industry" style="color:#E67E22;font-size:18px;"></i>
        </div>
      </div>
      <div class="kpi-trend" style="color:#E74C3C;">${kpis.totalRejected} rejeitadas</div>
    </div>

    <div class="kpi-card ${(criticalProducts + criticalItems) > 0 ? 'stock-critical' : ''}" style="${(criticalProducts + criticalItems) > 0 ? 'border:1px solid #fca5a5;' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="kpi-value" style="color:${(criticalProducts + criticalItems) > 0 ? '#dc2626' : '#16a34a'};">${criticalProducts + criticalItems}</div>
          <div class="kpi-label">Estoques Críticos</div>
        </div>
        <div style="width:42px;height:42px;border-radius:10px;background:${(criticalProducts + criticalItems) > 0 ? '#fef2f2' : '#f0fdf4'};display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-warehouse" style="color:${(criticalProducts + criticalItems) > 0 ? '#dc2626' : '#16a34a'};font-size:18px;"></i>
        </div>
      </div>
      <div class="kpi-trend" style="color:${(criticalProducts + criticalItems) > 0 ? '#dc2626' : '#16a34a'};">
        <a href="/estoque" style="color:inherit;text-decoration:none;">
          ${(criticalProducts + criticalItems) > 0 ? `<i class="fas fa-exclamation-triangle"></i> Atenção necessária` : `<i class="fas fa-check"></i> Estoque OK`}
        </a>
      </div>
    </div>
  </div>

  <!-- Charts Row -->
  <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-bottom:24px;">
    <div class="card" style="padding:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0;">Produção Diária (últimos 7 dias)</h3>
        <span style="font-size:12px;color:#6c757d;">peças/dia</span>
      </div>
      <canvas id="productionChart" style="max-height:200px;"></canvas>
    </div>
    <div class="card" style="padding:20px;">
      <div style="margin-bottom:16px;">
        <h3 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0;">Status das Ordens</h3>
      </div>
      <canvas id="statusChart" style="max-height:200px;"></canvas>
    </div>
  </div>

  <!-- Stock Status Row (NEW) -->
  <div class="card" style="padding:20px;margin-bottom:24px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <h3 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0;"><i class="fas fa-warehouse" style="margin-right:8px;color:#E67E22;"></i>Situação do Estoque</h3>
      <a href="/estoque" class="btn btn-secondary btn-sm" title="Ver estoque completo">Ver Estoque <i class="fas fa-arrow-right"></i></a>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px;">
      ${[
        { key: 'critical',          label: 'Crítico',          color: '#dc2626', bg: '#fef2f2', icon: 'fa-exclamation-circle', count: stockStatusSummary.critical },
        { key: 'normal',            label: 'Normal',           color: '#16a34a', bg: '#f0fdf4', icon: 'fa-check-circle',       count: stockStatusSummary.normal },
        { key: 'purchase_needed',   label: 'Nec. Compra',      color: '#d97706', bg: '#fffbeb', icon: 'fa-shopping-cart',      count: stockStatusSummary.purchase_needed },
        { key: 'manufacture_needed',label: 'Nec. Manufatura',  color: '#7c3aed', bg: '#f5f3ff', icon: 'fa-industry',           count: stockStatusSummary.manufacture_needed },
      ].map(s => `
      <a href="/estoque" style="text-decoration:none;" title="Ver itens ${s.label}">
        <div style="background:${s.bg};border-radius:10px;padding:14px;text-align:center;border:1px solid ${s.color}22;transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
          <div style="font-size:24px;font-weight:800;color:${s.color};">${s.count}</div>
          <div style="margin:4px 0;"><i class="fas ${s.icon}" style="color:${s.color};font-size:16px;"></i></div>
          <div style="font-size:11px;color:${s.color};font-weight:600;">${s.label}</div>
        </div>
      </a>`).join('')}
    </div>
    <!-- Mini stock status chart -->
    <canvas id="stockStatusChart" style="max-height:130px;"></canvas>
  </div>

  <!-- Bottom Row -->
  <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:20px;">
    <!-- Recent Orders -->
    <div class="card" style="padding:0;overflow:hidden;">
      <div style="padding:16px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0;">Ordens Recentes</h3>
        <a href="/ordens" class="btn btn-secondary btn-sm" title="Ver todas as ordens">Ver todas</a>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Código</th><th>Produto</th><th>Cliente</th><th>Prioridade</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${recentOrders.map(o => `
            <tr>
              <td><a href="/ordens" style="color:#2980B9;font-weight:600;text-decoration:none;">${o.code}</a></td>
              <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;">${o.productName}</td>
              <td style="font-size:11px;color:#6c757d;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${(o as any).cliente || '—'}</td>
              <td><span style="font-size:12px;font-weight:700;color:${priorityColors[o.priority] || '#666'};">
                <i class="fas fa-circle" style="font-size:7px;"></i> ${o.priority === 'urgent' ? 'Urgente' : o.priority === 'high' ? 'Alta' : o.priority === 'medium' ? 'Média' : 'Baixa'}
              </span></td>
              <td>${statusBadge(o.status)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Machine Status -->
    <div class="card" style="padding:0;overflow:hidden;">
      <div style="padding:16px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0;">Status das Máquinas</h3>
        <a href="/recursos" class="btn btn-secondary btn-sm" title="Ver todas as máquinas">Ver todas</a>
      </div>
      <div style="padding:8px 0;">
        ${machines.map(m => `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 20px;border-bottom:1px solid #f8f9fa;">
          <div style="width:8px;height:8px;border-radius:50%;background:${m.status === 'operational' ? '#27AE60' : m.status === 'maintenance' ? '#F39C12' : '#E74C3C'};flex-shrink:0;"></div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.name}</div>
            <div style="font-size:11px;color:#9ca3af;">${m.type} • ${m.plantName}</div>
          </div>
          <span class="badge ${m.status === 'operational' ? 'badge-success' : m.status === 'maintenance' ? 'badge-warning' : 'badge-secondary'}" style="font-size:10px;">
            ${m.status === 'operational' ? 'OK' : m.status === 'maintenance' ? 'Mnt' : 'Off'}
          </span>
        </div>`).join('')}
      </div>
    </div>
  </div>

  <!-- Capacity Utilization -->
  <div class="card" style="padding:20px;margin-top:20px;">
    <h3 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0 0 16px;">Utilização de Capacidade por Planta</h3>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;">
      ${Object.entries(chartData.capacityUtilization).map(([plant, val]) => `
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:13px;font-weight:600;color:#374151;">${plant}</span>
          <span style="font-size:13px;font-weight:700;color:${val > 80 ? '#E74C3C' : val > 60 ? '#F39C12' : '#27AE60'};">${val}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${val}%;background:${val > 80 ? '#E74C3C' : val > 60 ? '#F39C12' : '#27AE60'};"></div>
        </div>
      </div>`).join('')}
    </div>
  </div>

  <script>
  // Production Chart
  const prodCtx = document.getElementById('productionChart').getContext('2d');
  new Chart(prodCtx, {
    type: 'bar',
    data: {
      labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
      datasets: [{
        label: 'Produção',
        data: ${JSON.stringify(chartData.productionPerDay)},
        backgroundColor: 'rgba(41,128,185,0.7)',
        borderColor: '#2980B9',
        borderWidth: 1.5,
        borderRadius: 5,
      }, {
        label: 'Meta',
        data: [450,450,450,450,450,200,200],
        type: 'line',
        borderColor: '#E67E22',
        borderWidth: 2,
        borderDash: [5,5],
        pointRadius: 0,
        fill: false,
        tension: 0,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
      scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } }, x: { grid: { display: false } } }
    }
  });

  // Status Donut
  const stCtx = document.getElementById('statusChart').getContext('2d');
  new Chart(stCtx, {
    type: 'doughnut',
    data: {
      labels: ['Planejadas', 'Em Progresso', 'Concluídas', 'Canceladas'],
      datasets: [{
        data: [${chartData.statusDistribution.planned}, ${chartData.statusDistribution.in_progress}, ${chartData.statusDistribution.completed}, ${chartData.statusDistribution.cancelled}],
        backgroundColor: ['#3498DB', '#27AE60', '#1B4F72', '#E74C3C'],
        borderWidth: 3,
        borderColor: '#fff',
      }]
    },
    options: {
      responsive: true,
      cutout: '65%',
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } } }
    }
  });

  // Stock Status Chart (new)
  const ssCtx = document.getElementById('stockStatusChart').getContext('2d');
  new Chart(ssCtx, {
    type: 'bar',
    data: {
      labels: ['Crítico', 'Normal', 'Nec. Compra', 'Nec. Manufatura'],
      datasets: [{
        label: 'Itens',
        data: [${stockStatusSummary.critical}, ${stockStatusSummary.normal}, ${stockStatusSummary.purchase_needed}, ${stockStatusSummary.manufacture_needed}],
        backgroundColor: ['#fca5a5', '#86efac', '#fcd34d', '#c4b5fd'],
        borderColor: ['#dc2626', '#16a34a', '#d97706', '#7c3aed'],
        borderWidth: 1.5,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
  </script>
  `

  return c.html(layout('Dashboard', content, 'dashboard'))
})

export default app
