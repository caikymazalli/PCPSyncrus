import { Hono } from 'hono'
import { getCtxTenant } from '../sessionHelper'

const app = new Hono()

app.get('/api/instrucoes', (c) => {
  const tenant = getCtxTenant(c)
  const instructions = tenant.instructions || []
  return c.json(instructions)
})

export default app
