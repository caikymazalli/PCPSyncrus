import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo } from '../sessionHelper'

const app = new Hono()

app.get('/', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)

  const kpis = tenant.kpis || {}
  const productionOrders = tenant.productionOrders || []
  const machines = tenant.machines || []
  const products = tenant.products || []
  const stockItems = tenant.stockItems || []

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { completed: 'badge-success', in_progress: 'badge-info', planned: 'badge-primary', cancelled: 'badge-danger' }
    const label: Record<string, string> = { completed: 'Concluída', in_progress: 'Em Progresso', planned: 'Planejada', cancelled: 'Cancelada' }
    return `<span class="badge ${map[s] || 'badge-secondary'}">${label[s] || s}</span>`
  }

  const machineStatusBadge = (s: string) => {
    const map: Record<string, string> = { operational: 'badge-success', maintenance: 'badge-warning', offline: 'badge-danger' }
    const label: Record<string, string> = { operational: 'Operacional', maintenance: 'Manutenção', offline: 'Offline' }
    return `<span class="badge ${map[s] || 'badge-secondary'}">${label[s] || s}</span>`
  }

  const stockStatusBadge = (s: string) => {
    const map: Record<string, string> = { critical: 'badge-danger', normal: 'badge-success', purchase_needed: 'badge-warning', manufacture_needed: 'badge-info' }
    const label: Record<string, string> = { critical: 'Crítico', normal: 'Normal', purchase_needed: 'Comprar', manufacture_needed: 'Produzir' }
    return `<span class="badge ${map[s] || 'badge-secondary'}">${label[s] || s}</span>`
  }

  const recentOrders = productionOrders.slice(0, 5)

  const content = `
  <!-- KPIs -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:24px;">
    <div class="kpi-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="width:40px;height:40px;border-radius:10px;background:rgba(27,79,114,0.1);display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-clipboard-list" style="color:#1B4F72;font-size:18px;"></i>
        </div>
      </div>
      <div class="kpi-value">${kpis.totalOrders ?? 0}</div>
      <div class="kpi-label">Total de Ordens</div>
    </div>
    <div class="kpi-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="width:40px;height:40px;border-radius:10px;background:rgba(52,152,219,0.1);display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-play-circle" style="color:#3498DB;font-size:18px;"></i>
        </div>
      </div>
      <div class="kpi-value" style="color:#3498DB;">${kpis.activeOrders ?? 0}</div>
      <div class="kpi-label">Ordens Ativas</div>
    </div>
    <div class="kpi-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="width:40px;height:40px;border-radius:10px;background:rgba(39,174,96,0.1);display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-check-circle" style="color:#27AE60;font-size:18px;"></i>
        </div>
      </div>
      <div class="kpi-value" style="color:#27AE60;">${kpis.completedOrders ?? 0}</div>
      <div class="kpi-label">Concluídas</div>
    </div>
    <div class="kpi-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="width:40px;height:40px;border-radius:10px;background:rgba(230,126,34,0.1);display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-industry" style="color:#E67E22;font-size:18px;"></i>
        </div>
      </div>
      <div class="kpi-value" style="color:#E67E22;">${(kpis.totalProduced ?? 0).toLocaleString('pt-BR')}</div>
      <div class="kpi-label">Peças Produzidas</div>
    </div>
    <div class="kpi-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="width:40px;height:40px;border-radius:10px;background:rgba(39,174,96,0.1);display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-star" style="color:#27AE60;font-size:18px;"></i>
        </div>
      </div>
      <div class="kpi-value" style="color:#27AE60;">${kpis.qualityRate ?? 0}%</div>
      <div class="kpi-label">Qualidade</div>
    </div>
    <div class="kpi-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="width:40px;height:40px;border-radius:10px;background:rgba(231,76,60,0.1);display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-tools" style="color:#E74C3C;font-size:18px;"></i>
        </div>
      </div>
      <div class="kpi-value" style="color:#E74C3C;">${kpis.totalMachines ?? 0}</div>
      <div class="kpi-label">Máquinas</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
    <!-- Recent Orders -->
    <div class="card" style="overflow:hidden;">
      <div style="padding:16px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-clipboard-list" style="margin-right:8px;"></i>Ordens Recentes</div>
        <a href="/ordens" class="btn btn-secondary btn-sm">Ver todas</a>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Código</th><th>Produto</th><th>Progresso</th><th>Status</th></tr></thead>
          <tbody>
            ${recentOrders.map(o => {
              const progress = o.quantity > 0 ? Math.round(((o as any).completedQuantity / o.quantity) * 100) : 0
              return `
              <tr>
                <td style="font-weight:700;color:#1B4F72;font-size:12px;">${o.code}</td>
                <td style="font-size:12px;color:#374151;">${o.productName}</td>
                <td style="min-width:80px;">
                  <div style="display:flex;align-items:center;gap:6px;">
                    <div class="progress-bar" style="flex:1;">
                      <div class="progress-fill" style="width:${progress}%;background:${progress >= 100 ? '#27AE60' : '#3498DB'};"></div>
                    </div>
                    <span style="font-size:10px;font-weight:700;color:#6c757d;">${progress}%</span>
                  </div>
                </td>
                <td>${statusBadge(o.status)}</td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Machines -->
    <div class="card" style="overflow:hidden;">
      <div style="padding:16px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-tools" style="margin-right:8px;"></i>Máquinas</div>
        <a href="/recursos" class="btn btn-secondary btn-sm">Ver todas</a>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Máquina</th><th>Planta</th><th>Status</th></tr></thead>
          <tbody>
            ${machines.slice(0, 5).map(m => `
            <tr>
              <td style="font-weight:600;font-size:12px;">${m.name}</td>
              <td style="font-size:12px;color:#6c757d;">${m.plantName}</td>
              <td>${machineStatusBadge(m.status)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
    <!-- Products -->
    <div class="card" style="overflow:hidden;">
      <div style="padding:16px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-box" style="margin-right:8px;"></i>Produtos</div>
        <a href="/produtos" class="btn btn-secondary btn-sm">Ver todos</a>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Produto</th><th>Código</th><th>Estoque</th></tr></thead>
          <tbody>
            ${products.slice(0, 5).map(p => `
            <tr>
              <td style="font-size:12px;font-weight:600;">${p.name}</td>
              <td><span style="font-family:monospace;font-size:11px;background:#f1f5f9;padding:2px 6px;border-radius:4px;">${p.code}</span></td>
              <td style="font-size:12px;">${p.stockCurrent ?? 0} ${p.unit ?? 'un'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Stock -->
    <div class="card" style="overflow:hidden;">
      <div style="padding:16px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-warehouse" style="margin-right:8px;"></i>Estoque</div>
        <a href="/estoque" class="btn btn-secondary btn-sm">Ver tudo</a>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Item</th><th>Qtd</th><th>Status</th></tr></thead>
          <tbody>
            ${stockItems.slice(0, 5).map(s => `
            <tr>
              <td style="font-size:12px;font-weight:600;">${s.productName ?? s.name ?? '—'}</td>
              <td style="font-size:12px;">${s.quantity ?? s.currentStock ?? 0}</td>
              <td>${stockStatusBadge(s.status ?? s.stockStatus ?? 'normal')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  `

  return c.html(layout('Dashboard', content, 'dashboard', userInfo))
})

app.get('/api/dashboard', (c) => {
  const tenant = getCtxTenant(c)

  const kpis = tenant.kpis
  const productionOrders = tenant.productionOrders
  const chartData = tenant.chartData
  const machines = tenant.machines
  const products = tenant.products
  const stockItems = tenant.stockItems
  const mrpEntries = (tenant as any).mrpEntries || []

  return c.json({
    kpis,
    productionOrders,
    chartData,
    machines,
    products,
    stockItems,
    mrpEntries
  })
})

export default app
