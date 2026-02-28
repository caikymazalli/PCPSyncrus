import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo } from '../sessionHelper'

const app = new Hono()

app.get('/', (c) => {
  const tenant   = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)

  // Safe data extraction with fallbacks
  const mrpEntries      = (tenant as any).mrpEntries      || []
  const productionOrders = tenant.productionOrders          || []
  const plants           = tenant.plants                    || []
  const chartData        = (tenant as any).chartData        || {}
  const capacityUtil     = chartData.capacityUtilization    || {}
  const ordersPerWeek    = chartData.ordersPerWeek          || [0,0,0,0,0,0,0]
  const products         = tenant.products                  || []

  const shortageAlerts = mrpEntries.filter((m: any) => m.shortfall > 0 && m.shortageDate)
  const isNew = mrpEntries.length === 0 && productionOrders.length === 0

  // ── Empty state for new users ─────────────────────────────────────────────
  if (isNew) {
    const content = `
    <div class="section-header">
      <div style="font-size:14px;color:#6c757d;">MRP, Capacidade e Sequenciamento de Produção</div>
    </div>
    <div class="card" style="padding:60px 40px;text-align:center;max-width:600px;margin:0 auto;">
      <div style="width:80px;height:80px;border-radius:20px;background:#e8f4fd;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
        <i class="fas fa-calendar-alt" style="font-size:36px;color:#2980B9;"></i>
      </div>
      <h2 style="font-size:20px;font-weight:800;color:#1B4F72;margin:0 0 10px;">Planejamento & MRP</h2>
      <p style="color:#6c757d;font-size:14px;line-height:1.6;margin:0 0 24px;">
        O planejamento MRP, capacidade e sequenciamento são gerados automaticamente
        a partir dos seus <strong>produtos</strong>, <strong>ordens de produção</strong> e
        <strong>estruturas de BOM</strong>.<br><br>
        Para começar, cadastre seus produtos e crie as primeiras ordens.
      </p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <a href="/produtos" class="btn btn-primary"><i class="fas fa-box"></i> Cadastrar Produtos</a>
        <a href="/ordens" class="btn btn-secondary"><i class="fas fa-clipboard-list"></i> Criar Ordens</a>
        <a href="/recursos" class="btn btn-secondary"><i class="fas fa-tools"></i> Cadastrar Recursos</a>
      </div>
    </div>
    `
    return c.html(layout('Planejamento & MRP', content, 'planejamento', userInfo))
  }

  // ── Full view (demo or populated accounts) ────────────────────────────────
  const content = `
  ${shortageAlerts.length > 0 ? `
  <div id="mrpAlertPopup" style="position:fixed;top:80px;right:20px;z-index:500;width:360px;background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.18);border-top:4px solid #E74C3C;animation:slideInRight 0.3s ease;">
    <div style="padding:14px 16px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:32px;height:32px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-calendar-times" style="color:#E74C3C;font-size:14px;"></i>
        </div>
        <div>
          <div style="font-size:13px;font-weight:700;color:#dc2626;">Alerta MRP: Falta de Material!</div>
          <div style="font-size:11px;color:#6c757d;">${shortageAlerts.length} item(ns) com data de possível falta</div>
        </div>
      </div>
      <button onclick="document.getElementById('mrpAlertPopup').style.display='none'" style="background:none;border:none;font-size:18px;cursor:pointer;color:#9ca3af;">×</button>
    </div>
    <div style="padding:10px 16px;">
      ${shortageAlerts.slice(0,4).map((m: any) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f8f9fa;">
        <div>
          <div style="font-size:12px;font-weight:700;color:#374151;">${m.componentName}</div>
          <div style="font-size:11px;color:#9ca3af;">${m.productName} · Déficit: ${m.shortfall}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;font-weight:700;color:#dc2626;">Falta em: ${new Date(m.shortageDate+'T12:00:00').toLocaleDateString('pt-BR')}</div>
          <div style="font-size:10px;color:#9ca3af;">${m.leadTimeDays}d prazo entrega</div>
        </div>
      </div>`).join('')}
    </div>
    <div style="padding:10px 16px;">
      <button class="btn btn-danger btn-sm" style="width:100%;justify-content:center;" onclick="document.getElementById('mrpAlertPopup').style.display='none';switchTab('tabMRP','plan')">
        <i class="fas fa-list"></i> Ver MRP Completo
      </button>
    </div>
  </div>
  <style>@keyframes slideInRight{from{opacity:0;transform:translateX(40px);}to{opacity:1;transform:translateX(0);}}</style>` : ''}

  <div class="section-header">
    <div style="font-size:14px;color:#6c757d;">MRP, Capacidade e Sequenciamento de Produção</div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-secondary" onclick="location.reload()"><i class="fas fa-sync-alt"></i> Recalcular</button>
      <button class="btn btn-primary" onclick="exportPlanCSV()"><i class="fas fa-download"></i> Exportar</button>
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
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:20px;">
        <div class="kpi-card">
          <div style="font-size:28px;font-weight:800;color:#E74C3C;">${mrpEntries.filter((m: any) => m.shortfall > 0).length}</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;">Itens em Deficit</div>
        </div>
        <div class="kpi-card">
          <div style="font-size:28px;font-weight:800;color:#27AE60;">${mrpEntries.filter((m: any) => m.shortfall === 0).length}</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;">Itens Suficientes</div>
        </div>
        <div class="kpi-card">
          <div style="font-size:28px;font-weight:800;color:#E67E22;">${mrpEntries.filter((m: any) => m.suggestedAction === 'purchase').length}</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;">Compras Sugeridas</div>
        </div>
        <div class="kpi-card">
          <div style="font-size:28px;font-weight:800;color:#3498DB;">${mrpEntries.filter((m: any) => m.suggestedAction === 'manufacture').length}</div>
          <div style="font-size:12px;color:#6c757d;margin-top:4px;">Manufaturas Sugeridas</div>
        </div>
      </div>

      <div class="card" style="overflow:hidden;">
        <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
          <h4 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-boxes" style="margin-right:8px;"></i>Planejamento de Necessidades de Materiais (MRP)</h4>
        </div>
        ${mrpEntries.length === 0 ? `
        <div style="padding:40px;text-align:center;color:#9ca3af;">
          <i class="fas fa-boxes" style="font-size:32px;color:#d1d5db;display:block;margin-bottom:12px;"></i>
          Nenhuma entrada MRP. Cadastre produtos e ordens de produção para gerar o MRP.
        </div>` : `
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Produto</th><th>Componente</th><th>Qtd Necess.</th><th>Qtd Disponível</th><th>Déficit</th><th>Prazo</th><th>Data Falta</th><th>Status</th><th>Ação</th>
            </tr></thead>
            <tbody>
              ${mrpEntries.map((m: any) => {
                const isUrgent = m.shortfall > 0 && m.shortageDate && new Date(m.shortageDate) <= new Date(Date.now() + 7*24*3600*1000)
                return `<tr style="${isUrgent ? 'background:#fff5f5;' : ''}">
                  <td style="font-size:12px;color:#6c757d;">${m.productName || '—'}</td>
                  <td style="font-weight:600;color:#374151;">${m.componentName || '—'}</td>
                  <td style="font-weight:700;">${(m.requiredQuantity||0).toLocaleString('pt-BR')}</td>
                  <td style="font-weight:700;color:${(m.availableQuantity||0) >= (m.requiredQuantity||0) ? '#27AE60' : '#E74C3C'};">${(m.availableQuantity||0).toLocaleString('pt-BR')}</td>
                  <td>${m.shortfall > 0 ? `<span style="font-weight:700;color:#E74C3C;"><i class="fas fa-exclamation-triangle" style="font-size:11px;"></i> ${m.shortfall}</span>` : `<span style="font-weight:700;color:#27AE60;"><i class="fas fa-check-circle" style="font-size:11px;"></i> OK</span>`}</td>
                  <td style="font-size:12px;font-weight:600;color:${(m.leadTimeDays||0) <= 7 ? '#27AE60' : (m.leadTimeDays||0) <= 14 ? '#d97706' : '#dc2626'};">${m.leadTimeDays ? m.leadTimeDays + 'd' : '—'}</td>
                  <td>${m.shortageDate ? `<span style="font-size:12px;font-weight:700;color:${isUrgent ? '#dc2626' : '#d97706'};">${new Date(m.shortageDate+'T12:00:00').toLocaleDateString('pt-BR')}</span>` : '<span style="color:#27AE60;font-size:12px;"><i class="fas fa-check"></i></span>'}</td>
                  <td>${m.shortfall > 0 ? '<span class="badge badge-danger">Crítico</span>' : '<span class="badge badge-success">Normal</span>'}</td>
                  <td><span class="badge ${m.suggestedAction === 'purchase' ? 'badge-warning' : 'badge-info'}">${m.suggestedAction === 'purchase' ? 'Comprar' : 'Manufaturar'}</span></td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>`}
      </div>
    </div>

    <!-- Capacidade Tab -->
    <div class="tab-content" id="tabCapacidade">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
        <div class="card" style="padding:20px;">
          <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0 0 16px;">Utilização por Planta</h4>
          ${Object.keys(capacityUtil).length > 0 ? `<canvas id="capacityChart" style="max-height:220px;"></canvas>` : `
          <div style="text-align:center;padding:30px;color:#9ca3af;">
            <i class="fas fa-chart-bar" style="font-size:28px;color:#d1d5db;display:block;margin-bottom:8px;"></i>
            Cadastre plantas para ver a utilização.
          </div>`}
        </div>
        <div class="card" style="padding:20px;">
          <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0 0 16px;">Tendência Semanal de Ordens</h4>
          ${productionOrders.length > 0 ? `<canvas id="weeklyChart" style="max-height:220px;"></canvas>` : `
          <div style="text-align:center;padding:30px;color:#9ca3af;">
            <i class="fas fa-chart-line" style="font-size:28px;color:#d1d5db;display:block;margin-bottom:8px;"></i>
            Crie ordens de produção para ver a tendência.
          </div>`}
        </div>
      </div>

      <div class="card" style="padding:20px;">
        <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0 0 16px;">Capacidade das Plantas</h4>
        ${plants.length === 0 ? `
        <div style="text-align:center;padding:30px;color:#9ca3af;">
          <a href="/recursos" class="btn btn-primary"><i class="fas fa-plus"></i> Cadastrar Plantas</a>
        </div>` :
        plants.map((p: any) => {
          const util = capacityUtil[p.name] || 0
          return `
          <div style="margin-bottom:16px;padding:14px;background:#f8f9fa;border-radius:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <div>
                <div style="font-size:14px;font-weight:700;color:#1B4F72;">${p.name}</div>
                <div style="font-size:12px;color:#9ca3af;">${p.location || ''} · Capacidade: ${p.totalCapacity || 0} peças/turno</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:22px;font-weight:800;color:${util > 80 ? '#E74C3C' : util > 60 ? '#F39C12' : '#27AE60'};">${util}%</div>
                <div style="font-size:11px;color:#9ca3af;">utilização</div>
              </div>
            </div>
            <div class="progress-bar" style="height:10px;">
              <div class="progress-fill" style="width:${util}%;background:${util > 80 ? '#E74C3C' : util > 60 ? '#F39C12' : '#27AE60'};"></div>
            </div>
          </div>`
        }).join('')}
      </div>
    </div>

    <!-- Sequenciamento Tab -->
    <div class="tab-content" id="tabSequenciamento">
      <div class="card" style="padding:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0;">Sequenciamento de Ordens</h4>
        </div>
        ${productionOrders.filter((o: any) => o.status !== 'cancelled' && o.status !== 'completed').length === 0 ? `
        <div style="text-align:center;padding:40px;color:#9ca3af;">
          <i class="fas fa-sort-amount-down" style="font-size:32px;color:#d1d5db;display:block;margin-bottom:10px;"></i>
          Nenhuma ordem em aberto. <a href="/ordens" style="color:#2980B9;">Criar uma ordem →</a>
        </div>` : `
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Seq.</th><th>Ordem</th><th>Produto</th><th>Qtd</th><th>Prioridade</th><th>Início</th><th>Fim</th><th>Status</th><th>Planta</th></tr></thead>
            <tbody>
              ${productionOrders
                .filter((o: any) => o.status !== 'cancelled' && o.status !== 'completed')
                .sort((a: any, b: any) => {
                  const pri: any = { urgent: 0, high: 1, medium: 2, low: 3 }
                  return (pri[a.priority] || 3) - (pri[b.priority] || 3)
                })
                .map((o: any, idx: number) => {
                  const pc: any = { urgent: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#65a30d' }
                  const pl: any = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' }
                  return `<tr>
                    <td><div style="width:28px;height:28px;border-radius:50%;background:#1B4F72;color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">${idx+1}</div></td>
                    <td style="font-weight:700;color:#1B4F72;">${o.code || '—'}</td>
                    <td style="font-size:13px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${o.productName || '—'}</td>
                    <td style="font-weight:600;">${(o.quantity||0).toLocaleString('pt-BR')}</td>
                    <td><span style="font-size:12px;font-weight:700;color:${pc[o.priority]||'#374151'};">● ${pl[o.priority]||o.priority}</span></td>
                    <td style="font-size:12px;color:#6c757d;">${o.startDate ? new Date(o.startDate+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                    <td style="font-size:12px;color:#6c757d;">${o.endDate ? new Date(o.endDate+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                    <td><span class="badge ${o.status === 'in_progress' ? 'badge-info' : 'badge-primary'}">${o.status === 'in_progress' ? 'Em Progresso' : 'Planejada'}</span></td>
                    <td style="font-size:12px;color:#9ca3af;">${o.plantName || '—'}</td>
                  </tr>`
                }).join('')}
            </tbody>
          </table>
        </div>`}
      </div>
    </div>

    <!-- Gantt Tab -->
    <div class="tab-content" id="tabGantt">
      <div class="card" style="padding:20px;">
        <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0 0 20px;">Gráfico de Gantt</h4>
        ${productionOrders.filter((o: any) => o.status !== 'cancelled').length === 0 ? `
        <div style="text-align:center;padding:40px;color:#9ca3af;">
          <i class="fas fa-calendar-alt" style="font-size:32px;color:#d1d5db;display:block;margin-bottom:10px;"></i>
          Nenhuma ordem para exibir no Gantt. <a href="/ordens" style="color:#2980B9;">Criar uma ordem →</a>
        </div>` : `
        <div style="display:flex;margin-bottom:8px;">
          <div style="width:180px;flex-shrink:0;"></div>
          <div style="flex:1;display:flex;">
            ${Array.from({length: 28}, (_, i) => i + 1).map(d => `<div style="flex:1;text-align:center;font-size:10px;color:#9ca3af;">${d}</div>`).join('')}
          </div>
        </div>
        ${productionOrders.filter((o: any) => o.status !== 'cancelled').map((o: any) => {
          const start = o.startDate ? new Date(o.startDate+'T12:00:00').getDate() : 1
          const end   = o.endDate   ? new Date(o.endDate+'T12:00:00').getDate()   : start + 3
          const duration = Math.max(1, end - start + 1)
          const left = ((start - 1) / 28) * 100
          const width = (duration / 28) * 100
          const colors: any = { completed: '#27AE60', in_progress: '#3498DB', planned: '#1B4F72', cancelled: '#9ca3af' }
          const progress = o.quantity > 0 ? Math.round(((o.completedQuantity||0) / o.quantity) * 100) : 0
          return `
          <div style="display:flex;align-items:center;margin-bottom:6px;">
            <div style="width:180px;font-size:11px;font-weight:600;color:#374151;flex-shrink:0;padding-right:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${o.code || '—'}</div>
            <div style="flex:1;height:32px;background:#f1f5f9;border-radius:4px;position:relative;">
              <div style="position:absolute;left:${left}%;width:${width}%;height:100%;background:${colors[o.status]||'#1B4F72'};border-radius:4px;display:flex;align-items:center;padding:0 6px;box-sizing:border-box;overflow:hidden;">
                <span style="font-size:10px;font-weight:700;color:white;white-space:nowrap;">${o.code} (${progress}%)</span>
              </div>
            </div>
          </div>`
        }).join('')}
        <div style="display:flex;gap:16px;margin-top:16px;padding-top:16px;border-top:1px solid #f1f3f5;">
          <div style="display:flex;align-items:center;gap:6px;"><div style="width:12px;height:12px;border-radius:3px;background:#27AE60;"></div><span style="font-size:12px;color:#6c757d;">Concluída</span></div>
          <div style="display:flex;align-items:center;gap:6px;"><div style="width:12px;height:12px;border-radius:3px;background:#3498DB;"></div><span style="font-size:12px;color:#6c757d;">Em Progresso</span></div>
          <div style="display:flex;align-items:center;gap:6px;"><div style="width:12px;height:12px;border-radius:3px;background:#1B4F72;"></div><span style="font-size:12px;color:#6c757d;">Planejada</span></div>
        </div>`}
      </div>
    </div>
  </div>

  <script>
  ${Object.keys(capacityUtil).length > 0 ? `
  const capCtx = document.getElementById('capacityChart')?.getContext('2d');
  if (capCtx) new Chart(capCtx, {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(Object.keys(capacityUtil))},
      datasets: [{ label: 'Utilização (%)', data: ${JSON.stringify(Object.values(capacityUtil))},
        backgroundColor: ${JSON.stringify(Object.values(capacityUtil).map((v: any) => v > 80 ? '#E74C3C' : v > 60 ? '#F39C12' : '#27AE60'))},
        borderRadius: 6 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { max: 100, beginAtZero: true, ticks: { callback: v => v + '%' } } } }
  });` : ''}

  ${productionOrders.length > 0 ? `
  const wkCtx = document.getElementById('weeklyChart')?.getContext('2d');
  if (wkCtx) new Chart(wkCtx, {
    type: 'line',
    data: {
      labels: ['Sem 1','Sem 2','Sem 3','Sem 4','Sem 5','Sem 6','Sem 7'],
      datasets: [{ label: 'Ordens', data: ${JSON.stringify(ordersPerWeek)}, borderColor: '#1B4F72', backgroundColor: 'rgba(27,79,114,0.1)', tension: 0.4, fill: true }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });` : ''}

  function exportPlanCSV() {
    const rows = [['Produto','Componente','Qtd Necessária','Qtd Disponível','Déficit','Ação']];
    ${JSON.stringify(mrpEntries)}.forEach(m => {
      rows.push([m.productName,m.componentName,m.requiredQuantity,m.availableQuantity,m.shortfall,m.suggestedAction]);
    });
    const csv = rows.map(r => r.join(',')).join('\\n');
    const a = document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
    a.download='mrp_'+new Date().toISOString().split('T')[0]+'.csv'; a.click();
  }

  ${shortageAlerts.length > 0 ? `setTimeout(() => { const el = document.getElementById('mrpAlertPopup'); if(el) el.style.display='none'; }, 12000);` : ''}
  </script>
  `
  return c.html(layout('Planejamento & MRP', content, 'planejamento', userInfo))
})

export default app
