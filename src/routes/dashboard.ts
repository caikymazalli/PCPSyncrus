import { Hono } from 'hono'
import { getCtxTenant } from '../sessionHelper'

const app = new Hono()

app.get('/api/dashboard', (c) => {
  const tenant = getCtxTenant(c)
  
  const kpis = tenant.kpis
  const productionOrders = tenant.productionOrders
  const chartData = tenant.chartData
  const machines = tenant.machines
  const products = tenant.products
  const stockItems = tenant.stockItems
  const mrpEntries = tenant.mrpEntries || []
  
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
