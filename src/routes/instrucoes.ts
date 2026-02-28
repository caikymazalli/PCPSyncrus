import { Hono } from 'hono'
import { getCtxTenant, getCtxUserId } from '../sessionHelper'

const app = new Hono()

app.get('/api/instrucoes', (c) => {
  const tenant = getCtxTenant(c)
  const instructions = tenant.instructions || []
  return c.json(instructions)
})

export default appimport { tenant } from '../models';

// ... other code ...

// Updated API endpoint
app.get('/api/instrucoes', (req, res) => {
    // Replace all references to tenant.instructions with tenant.workInstructions
    const instructions = tenant.workInstructions; // updated reference
    // ... further processing ...
    res.json(instructions);
});
