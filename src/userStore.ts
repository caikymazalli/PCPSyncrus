/**
 * userStore.ts — Multi-tenant store backed by Cloudflare D1
 *
 * Each user (tenant) has completely isolated data in D1.
 * Sessions are stored in D1 for persistence across worker restarts.
 * Demo accounts use in-memory mock data (read-only).
 *
 * Architecture:
 * - registered_users table: all tenant accounts
 * - sessions table: active sessions (with expiry)
 * - All other tables: per-tenant data with user_id column
 */

import { mockData } from './data'

// ── Types ──────────────────────────────────────────────────────────────────────
export interface UserSession {
  token: string
  userId: string
  email: string
  nome: string
  empresa: string
  plano: string
  role: string        // 'demo' | 'admin' | 'user'
  isDemo: boolean
  createdAt: string
  expiresAt: number
  ownerId?: string | null   // null/undefined = conta principal; preenchido = usuário convidado
  empresaId?: string | null  // ID da empresa ativa na sessão
  grupoId?: string | null    // ID do grupo da empresa
}

export interface TenantData {
  plants: any[]
  machines: any[]
  workbenches: any[]
  products: any[]
  productionOrders: any[]
  productionEntries: any[]
  stockItems: any[]
  nonConformances: any[]
  suppliers: any[]
  quotations: any[]
  purchaseOrders: any[]
  imports: any[]
  boms: any[]
  instructions: any[]
  qualityChecks: any[]
  users: any[]
  kpis: any
  chartData: any
  bomItems: any[]
  productSuppliers: any[]
  workOrders: any[]
  routes: any[]
  serialNumbers: any[]       // Números de série/lote já registrados
  serialPendingItems: any[]  // Fila de liberação: importados aguardando identificação
  warehouses: any[]          // Almoxarifados cadastrados
  separationOrders: any[]    // Ordens de separação
  stockExits: any[]          // Baixas de estoque
  supplierCategories: any[]  // Categorias de fornecedores personalizadas
  quotationNegotiations: any[] // Negociações de cotações
}

export interface RegisteredUser {
  userId: string
  email: string
  pwdHash: string
  nome: string
  sobrenome: string
  empresa: string
  plano: string
  role: string
  tel: string
  setor: string
  porte: string
  isDemo: boolean
  createdAt: string
  lastLogin: string | null
  trialStart: string
  trialEnd: string
  ownerId?: string | null  // null = conta principal; preenchido = usuário convidado
}

// ── In-memory fallback (used when DB is unavailable or for demo) ───────────────
// sessions: token → UserSession (in-memory for fast access + D1 for persistence)
export const sessions: Record<string, UserSession> = {}
// registeredUsers: email → RegisteredUser (in-memory cache)
export const registeredUsers: Record<string, RegisteredUser> = {}
// tenants: userId → TenantData (in-memory for demo only; real tenants use D1)
export const tenants: Record<string, TenantData> = {}

// ── Demo users (pre-seeded) ────────────────────────────────────────────────────
const demoUserId = 'demo-tenant'

export const DEMO_USERS = [
  { email: 'carlos@empresa.com', pwdHash: '', nome: 'Carlos', sobrenome: 'Silva', role: 'admin' },
  { email: 'ana@empresa.com',    pwdHash: '', nome: 'Ana',    sobrenome: 'Souza', role: 'gestor_pcp' },
  { email: 'joao@empresa.com',   pwdHash: '', nome: 'João',   sobrenome: 'Oliveira', role: 'operador' },
]

// Seed demo tenant in memory
const _md = mockData as any
tenants[demoUserId] = {
  plants:            JSON.parse(JSON.stringify(_md.plants            || [])),
  machines:          JSON.parse(JSON.stringify(_md.machines          || [])),
  workbenches:       JSON.parse(JSON.stringify(_md.workbenches       || [])),
  products:          JSON.parse(JSON.stringify(_md.products          || [])),
  productionOrders:  JSON.parse(JSON.stringify(_md.productionOrders  || [])),
  productionEntries: JSON.parse(JSON.stringify(_md.productionEntries || [])),
  stockItems:        JSON.parse(JSON.stringify(_md.stockItems        || [])),
  nonConformances:   JSON.parse(JSON.stringify(_md.nonConformances   || [])),
  suppliers:         JSON.parse(JSON.stringify(_md.suppliers         || [])),
  quotations:        JSON.parse(JSON.stringify(_md.quotations        || [])),
  purchaseOrders:    JSON.parse(JSON.stringify(_md.purchaseOrders    || [])),
  imports:           JSON.parse(JSON.stringify(_md.imports           || [])),
  boms:              JSON.parse(JSON.stringify(_md.boms              || [])),
  instructions:      JSON.parse(JSON.stringify(_md.instructions      || [])),
  qualityChecks:     JSON.parse(JSON.stringify(_md.qualityChecks     || [])),
  users:             [],
  kpis:              JSON.parse(JSON.stringify(_md.kpis              || {})),
  chartData:         JSON.parse(JSON.stringify(_md.chartData         || {})),
  bomItems:          JSON.parse(JSON.stringify(_md.bomItems          || [])),
  productSuppliers:  JSON.parse(JSON.stringify(_md.productSuppliers  || [])),
  workOrders:        JSON.parse(JSON.stringify(_md.workOrders        || [])),
  routes:            JSON.parse(JSON.stringify(_md.routes            || [])),
  serialNumbers:     JSON.parse(JSON.stringify(_md.serialNumbers     || [])),
  serialPendingItems: JSON.parse(JSON.stringify(_md.serialPendingItems || [])),
  warehouses:        JSON.parse(JSON.stringify(_md.warehouses         || [])),
  separationOrders:  JSON.parse(JSON.stringify(_md.separationOrders   || [])),
  stockExits:        JSON.parse(JSON.stringify(_md.stockExits         || [])),
  supplierCategories: JSON.parse(JSON.stringify(_md.supplierCategories || [])),
}

// ── Helpers ────────────────────────────────────────────────────────────────────
export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

const USER_SALT = 'pcpsyncrus-user-salt-2025'

export async function hashPassword(pwd: string): Promise<string> {
  return sha256(pwd + USER_SALT)
}

export async function makeToken(email: string): Promise<string> {
  return sha256(email + Date.now().toString() + Math.random().toString() + USER_SALT)
}

// ── D1 helpers ─────────────────────────────────────────────────────────────────
export function getDB(c: any): D1Database | null {
  try {
    return c.env?.DB || null
  } catch {
    return null
  }
}

// ── Session management ─────────────────────────────────────────────────────────
export function getSession(token: string | undefined): UserSession | null {
  if (!token) return null
  const s = sessions[token]
  if (!s) return null
  if (Date.now() > s.expiresAt) { delete sessions[token]; return null }
  return s
}

/** Load session from D1 if not in memory */
export async function getSessionAsync(token: string | undefined, db: D1Database | null): Promise<UserSession | null> {
  if (!token) return null
  
  // Check in-memory cache first
  const cached = sessions[token]
  if (cached) {
    if (Date.now() > cached.expiresAt) { delete sessions[token]; return null }
    return cached
  }
  
  // Check D1
  if (!db) return null
  try {
    const row = await db.prepare(
      'SELECT * FROM sessions WHERE token = ? AND expires_at > ?'
    ).bind(token, Date.now()).first() as any
    
    if (!row) return null
    
    const session: UserSession = {
      token: row.token,
      userId: row.user_id,
      email: row.email,
      nome: row.nome,
      empresa: row.empresa,
      plano: row.plano,
      role: row.role,
      isDemo: row.is_demo === 1,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      empresaId: row.empresa_id || null,
      grupoId: row.grupo_id || null,
    }

    // Carregar owner_id do usuário para suportar conta de convidado
    try {
      const userRow = await db.prepare('SELECT owner_id FROM registered_users WHERE id = ?')
        .bind(row.user_id).first() as any
      if (userRow) session.ownerId = userRow.owner_id || null
    } catch {}
    
    // Cache in memory
    sessions[token] = session
    return session
  } catch {
    return null
  }
}

export function getTenantData(userId: string): TenantData {
  if (!tenants[userId]) {
    tenants[userId] = {
      plants: [], machines: [], workbenches: [],
      products: [], productionOrders: [], productionEntries: [],
      stockItems: [], nonConformances: [], suppliers: [],
      quotations: [], purchaseOrders: [], imports: [],
      boms: [], instructions: [], qualityChecks: [], users: [],
      kpis: { totalOrders:0, activeOrders:0, plannedOrders:0, completedOrders:0,
               cancelledOrders:0, totalProduced:0, totalRejected:0, totalProducts:0,
               totalMachines:0, totalPlants:0, completionRate:0, qualityRate:100 },
      chartData: { labels:[], planned:[], produced:[], rejected:[], stockStatus: { critical:0, normal:0, purchase_needed:0, manufacture_needed:0 } },
      bomItems: [], productSuppliers: [], workOrders: [], routes: [],
      serialNumbers: [], serialPendingItems: [],
      warehouses: [], separationOrders: [], stockExits: [],
      supplierCategories: [],
      quotationNegotiations: [],
    }
  }
  return tenants[userId]
}

export function getEffectiveTenantId(session: UserSession | null): string {
  if (!session) return demoUserId
  return session.isDemo ? demoUserId : session.userId
}

const SESSION_DURATION = 60 * 60 * 8 * 1000 // 8h in ms

export async function createSession(user: RegisteredUser, db?: D1Database | null, empresaId?: string | null, grupoId?: string | null): Promise<string> {
  const token = await makeToken(user.email)
  const expiresAt = Date.now() + SESSION_DURATION
  const createdAt = new Date().toISOString()
  
  const session: UserSession = {
    token,
    userId:    user.userId,
    email:     user.email,
    nome:      user.nome + (user.sobrenome ? ' ' + user.sobrenome : ''),
    empresa:   user.empresa,
    plano:     user.plano,
    role:      user.role,
    isDemo:    user.isDemo,
    createdAt,
    expiresAt,
    ownerId:   user.ownerId || null,   // ← propaga owner_id na sessão
    empresaId: empresaId || null,
    grupoId:   grupoId || null,
  }
  
  // Store in memory
  sessions[token] = session
  user.lastLogin = createdAt
  
  // Persist session to D1 if available (both demo and real users need this for stateless Workers)
  if (db) {
    try {
      await db.prepare(`
        INSERT OR REPLACE INTO sessions (token, user_id, email, nome, empresa, plano, role, is_demo, created_at, expires_at, empresa_id, grupo_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(token, user.userId, user.email, session.nome, user.empresa, user.plano, user.role, user.isDemo ? 1 : 0, createdAt, expiresAt, empresaId || null, grupoId || null).run()
      
      // Update last_login (non-demo only)
      if (!user.isDemo) {
        await db.prepare('UPDATE registered_users SET last_login = ? WHERE id = ?')
          .bind(createdAt, user.userId).run()
      }
    } catch (e) {
      // D1 unavailable — continue with in-memory session
    }
  }
  
  return token
}

/** Register a new user — persists to D1 */
export async function registerUser(params: {
  email: string; pwd: string; nome: string; sobrenome: string
  empresa: string; plano: string; tel: string; setor: string; porte: string
  ownerId?: string | null   // id do admin da empresa (para convidados)
  role?: string             // papel do usuário (default: 'admin')
}, db?: D1Database | null): Promise<{ ok: boolean; error?: string; user?: RegisteredUser }> {
  const emailKey = params.email.toLowerCase().trim()

  if (DEMO_USERS.find(d => d.email === emailKey)) {
    return { ok: false, error: 'Este e-mail é reservado para a conta de demonstração.' }
  }

  // Check in-memory cache
  if (registeredUsers[emailKey]) {
    return { ok: false, error: 'E-mail já cadastrado.' }
  }

  // Check D1 if available
  if (db) {
    try {
      const existing = await db.prepare('SELECT id FROM registered_users WHERE email = ?').bind(emailKey).first()
      if (existing) {
        return { ok: false, error: 'E-mail já cadastrado.' }
      }
    } catch {}
  }

  const pwdHash = await hashPassword(params.pwd)
  const userId  = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  const today   = new Date().toISOString().split('T')[0]
  const trialEnd = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]

  const effectiveRole = params.ownerId ? (params.role || 'user') : 'admin'

  const user: RegisteredUser = {
    userId, email: emailKey,
    pwdHash, nome: params.nome, sobrenome: params.sobrenome,
    empresa: params.empresa, plano: params.plano,
    role: effectiveRole, tel: params.tel,
    setor: params.setor, porte: params.porte,
    isDemo: false,
    createdAt: today,
    lastLogin: null,
    trialStart: today,
    trialEnd,
    ownerId: params.ownerId || null,
  }

  // Store in memory cache
  registeredUsers[emailKey] = user
  getTenantData(userId)

  // Persist to D1 if available
  if (db) {
    try {
      await db.prepare(`
        INSERT INTO registered_users (id, email, pwd_hash, nome, sobrenome, empresa, plano, role, tel, setor, porte, is_demo, created_at, trial_start, trial_end, owner_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      `).bind(userId, emailKey, pwdHash, params.nome, params.sobrenome, params.empresa, params.plano, effectiveRole, params.tel, params.setor, params.porte, today, today, trialEnd, params.ownerId || null).run()
    } catch (e) {
      // Continue with in-memory only
    }
  }

  return { ok: true, user }
}

/** Login — checks D1 first, then in-memory */
export async function loginUser(email: string, pwd: string, db?: D1Database | null): Promise<{ ok: boolean; error?: string; token?: string; session?: UserSession; isNewUser?: boolean }> {
  const emailKey = email.toLowerCase().trim()

  // Check demo accounts (in-memory only)
  const demoUser = DEMO_USERS.find(d => d.email === emailKey)
  if (demoUser) {
    const demoReg: RegisteredUser = {
      userId: demoUserId,
      email: emailKey,
      pwdHash: '',
      nome: demoUser.nome,
      sobrenome: demoUser.sobrenome,
      empresa: 'Metalúrgica Demo Ltda',
      plano: 'professional',
      role: demoUser.role,
      tel: '', setor: '', porte: '',
      isDemo: true,
      createdAt: '2024-01-01',
      lastLogin: null,
      trialStart: '2024-01-01',
      trialEnd: '2099-12-31',
    }
    const token = await createSession(demoReg, db)  // persist demo session in D1 if available
    return { ok: true, token, session: sessions[token], isNewUser: false }
  }

  // Try D1 first
  let user: RegisteredUser | null = null
  if (db) {
    try {
      const row = await db.prepare('SELECT * FROM registered_users WHERE email = ?').bind(emailKey).first() as any
      if (row) {
        user = {
          userId: row.id,
          email: row.email,
          pwdHash: row.pwd_hash,
          nome: row.nome,
          sobrenome: row.sobrenome || '',
          empresa: row.empresa,
          plano: row.plano,
          role: row.role,
          tel: row.tel || '',
          setor: row.setor || '',
          porte: row.porte || '',
          isDemo: row.is_demo === 1,
          createdAt: row.created_at,
          lastLogin: row.last_login,
          trialStart: row.trial_start,
          trialEnd: row.trial_end,
          ownerId: row.owner_id || null,
        }
        // Update in-memory cache
        registeredUsers[emailKey] = user
        getTenantData(user.userId)
      }
    } catch {}
  }

  // Fallback to in-memory
  if (!user) {
    user = registeredUsers[emailKey] || null
  }

  if (!user) return { ok: false, error: 'E-mail não encontrado.' }

  const hash = await hashPassword(pwd)
  if (hash !== user.pwdHash) return { ok: false, error: 'Senha incorreta.' }

  // Capture lastLogin BEFORE createSession updates it
  const hadPreviousLogin = !!user.lastLogin

  // Look up empresa and grupo from user_empresa table
  let empresaId: string | null = null
  let grupoId: string | null = null
  if (db && !user.isDemo) {
    try {
      const ue = await db.prepare(
        'SELECT ue.empresa_id, e.grupo_id FROM user_empresa ue JOIN empresas e ON ue.empresa_id = e.id WHERE ue.user_id = ? LIMIT 1'
      ).bind(user.userId).first() as any
      if (ue) {
        empresaId = ue.empresa_id || null
        grupoId = ue.grupo_id || null
      }
    } catch {}
  }

  const token = await createSession(user, db, empresaId, grupoId)
  return { ok: true, token, session: sessions[token], isNewUser: !hadPreviousLogin }
}

/** Load all registered users from D1 into memory (for admin panel) */
export async function loadAllUsersFromDB(db: D1Database): Promise<RegisteredUser[]> {
  try {
    const rows = await db.prepare('SELECT * FROM registered_users WHERE is_demo = 0 ORDER BY created_at DESC').all()
    const users: RegisteredUser[] = (rows.results || []).map((row: any) => ({
      userId: row.id,
      email: row.email,
      pwdHash: row.pwd_hash,
      nome: row.nome,
      sobrenome: row.sobrenome || '',
      empresa: row.empresa,
      plano: row.plano,
      role: row.role,
      tel: row.tel || '',
      setor: row.setor || '',
      porte: row.porte || '',
      isDemo: row.is_demo === 1,
      createdAt: row.created_at,
      lastLogin: row.last_login,
      trialStart: row.trial_start,
      trialEnd: row.trial_end,
      ownerId: row.owner_id || null,
    }))
    // Update in-memory cache
    users.forEach(u => { registeredUsers[u.email] = u; getTenantData(u.userId) })
    return users
  } catch {
    return Object.values(registeredUsers).filter(u => !u.isDemo)
  }
}

/** Clean expired sessions from D1 */
export async function cleanExpiredSessions(db: D1Database): Promise<void> {
  try {
    await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run()
  } catch {}
}

// ── Tenant hydration tracking ──────────────────────────────────────────────────
// Track which tenants have been loaded from D1 to avoid repeated loads
const tenantHydratedAt: Record<string, number> = {}
// Track when in-memory data was last written (to avoid re-hydration overwriting newer data)
export const tenantLastWriteAt: Record<string, number> = {}
const HYDRATION_TTL = 30 * 1000 // 30 seconds TTL

/** Mark tenant in-memory data as modified (call after any write to memory) */
export function markTenantModified(userId: string): void {
  if (userId && userId !== 'demo-tenant') {
    tenantLastWriteAt[userId] = Date.now()
  }
}

/** Load a tenant's data from D1 into memory. Cached for 30s per worker instance. */
export async function loadTenantFromDB(userId: string, db: D1Database, empresaId?: string | null): Promise<void> {
  if (!userId || userId === 'demo-tenant') return
  const now = Date.now()
  if (tenantHydratedAt[userId] && now - tenantHydratedAt[userId] < HYDRATION_TTL) return

  // Skip re-hydration if in-memory data was modified after the last hydration.
  // This prevents D1 (which may lack a recent failed insert) from overwriting
  // newer in-memory data within the same worker instance.
  const lastWrite = tenantLastWriteAt[userId] || 0
  const lastHydration = tenantHydratedAt[userId] || 0
  if (lastWrite > lastHydration) {
  console.log(`[HYDRATION] Skipping re-hydration for ${userId}: in-memory data is more recent (written ${Math.round((lastWrite - lastHydration) / 1000)}s after last hydration)`)
    tenantHydratedAt[userId] = now
    return
  }

  tenantHydratedAt[userId] = now

  // Build empresa_id filter clause for tables that support it
  const byEmpresa = empresaId ? ' AND empresa_id = ?' : ''
  const bindEmpresa = (base: any[]) => empresaId ? [...base, empresaId] : base

  const tenant = getTenantData(userId)
  console.log(`[HYDRATION] Loading tenant ${userId} from D1`)
  try {
    // Load products
    const prods = await db.prepare(`SELECT * FROM products WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`)
      .bind(...bindEmpresa([userId])).all()
    console.log(`[HYDRATION] Carregando ${prods.results?.length || 0} produtos do D1 para ${userId}`)
    if (prods.results && prods.results.length > 0) {
      tenant.products = (prods.results as any[]).map(r => ({
        id: r.id, name: r.name, code: r.code, unit: r.unit || 'un',
        type: r.type || 'external', stockMin: r.stock_min || 0,
        stockMax: r.stock_max || 0, stockCurrent: r.stock_current || 0,
        stockStatus: r.stock_status || 'normal', price: r.price || 0,
        notes: r.notes || '', description: r.description || '',
        serialControlled: r.serial_controlled === 1,
        controlType: r.control_type || '',
        supplierId: r.supplier_id_1 || r.supplier_id || '',
        supplier_id_1: r.supplier_id_1 || r.supplier_id || '',
        supplier_id_2: r.supplier_id_2 || '',
        supplier_id_3: r.supplier_id_3 || '',
        supplier_id_4: r.supplier_id_4 || '',
        criticalPercentage: r.critical_percentage || 50,
        createdAt: r.created_at || new Date().toISOString(),
      }))
      console.log(`[HYDRATION] ✅ ${tenant.products.length} produtos carregados com multi-fornecedores`)
    } else {
      console.log(`[HYDRATION] ⚠️ Nenhum produto encontrado em D1 para ${userId}`)
    }
    // Load suppliers
    const sups = await db.prepare(`SELECT * FROM suppliers WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`)
      .bind(...bindEmpresa([userId])).all()
    if (sups.results && sups.results.length > 0) {
      tenant.suppliers = (sups.results as any[]).map(r => ({
        id: r.id, name: r.name, fantasia: r.trade_name || '', tradeName: r.trade_name || '',
        cnpj: r.cnpj || '', email: r.email || '', phone: r.phone || '', tel: r.phone || '',
        contact: r.contact || '', city: r.city || '', state: r.state || '',
        category: r.category || '', type: r.type || 'nacional',
        paymentTerms: r.payment_terms || '', deliveryLeadDays: r.lead_days || 0,
        notes: r.notes || '', active: r.active !== 0, rating: r.rating || 0,
        createdAt: r.created_at || new Date().toISOString(),
      }))
    }
    // Load stock items
    const items = await db.prepare(`SELECT * FROM stock_items WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`)
      .bind(...bindEmpresa([userId])).all()
    if (items.results && items.results.length > 0) {
      tenant.stockItems = (items.results as any[]).map(r => ({
        id: r.id, name: r.name, code: r.code || r.id, unit: r.unit || 'un',
        category: r.category || '', quantity: r.quantity || 0, minQuantity: r.min_qty || 0,
        location: r.location || '', notes: r.notes || '',
        serialControlled: r.serial_controlled === 1,
        controlType: r.control_type || 'serie',
        stockStatus: r.stock_status || 'normal',
        createdAt: r.created_at || new Date().toISOString(),
      }))
    }
    // Load separation orders
    const seps = await db.prepare('SELECT * FROM separation_orders WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all()
    if (seps.results && seps.results.length > 0) {
      tenant.separationOrders = (seps.results as any[]).map(r => ({
        id: r.id, code: r.code, pedido: r.pedido || '', cliente: r.cliente || '',
        dataSeparacao: r.data_separacao || '', responsavel: r.responsavel || '',
        status: r.status || 'pending', items: [],
        createdAt: r.created_at || new Date().toISOString(),
      }))
    }
    // Load stock exits
    const exits = await db.prepare('SELECT * FROM stock_exits WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all()
    if (exits.results && exits.results.length > 0) {
      tenant.stockExits = (exits.results as any[]).map(r => ({
        id: r.id, code: r.code, type: r.type || 'requisicao',
        pedido: r.pedido || '', nf: r.nf || '', date: r.date || '',
        responsavel: r.responsavel || '', notes: r.notes || '', items: [],
        createdAt: r.created_at || new Date().toISOString(),
      }))
    }
    // Load plants
    const plantsRes = await db.prepare(`SELECT * FROM plants WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`)
      .bind(...bindEmpresa([userId])).all()
    if (plantsRes.results && plantsRes.results.length > 0) {
      tenant.plants = (plantsRes.results as any[]).map(r => ({
        id: r.id, name: r.name, location: r.location || '',
        totalCapacity: r.total_capacity || 0, contact: r.contact || '',
        status: r.status || 'active', notes: r.notes || '',
        createdAt: r.created_at || new Date().toISOString(),
      }))
    }
    // Load machines
    const machinesRes = await db.prepare(`SELECT * FROM machines WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`)
      .bind(...bindEmpresa([userId])).all()
    if (machinesRes.results && machinesRes.results.length > 0) {
      tenant.machines = (machinesRes.results as any[]).map(r => ({
        id: r.id, name: r.name, type: r.type || '',
        capacity: r.capacity || '', plantId: r.plant_id || '',
        plantName: r.plant_name || '', status: r.status || 'operational',
        specs: r.specs || '',
        createdAt: r.created_at || new Date().toISOString(),
      }))
    }
    // Load workbenches
    const wbRes = await db.prepare(`SELECT * FROM workbenches WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`)
      .bind(...bindEmpresa([userId])).all()
    if (wbRes.results && wbRes.results.length > 0) {
      tenant.workbenches = (wbRes.results as any[]).map(r => ({
        id: r.id, name: r.name, function: r.function || '',
        plantId: r.plant_id || '', plantName: r.plant_name || '',
        status: r.status || 'available',
        createdAt: r.created_at || new Date().toISOString(),
      }))
    }
    // Load supplier categories
    const cats = await db.prepare('SELECT * FROM supplier_categories WHERE user_id = ? ORDER BY created_at ASC').bind(userId).all()
    if (cats.results) {
      tenant.supplierCategories = (cats.results as any[]).map(r => ({
        id: r.id, name: r.name, createdAt: r.created_at || new Date().toISOString(),
      }))
    }
    // Load product-supplier linkages
    const prodSupp = await db.prepare(
      `SELECT id, product_id, product_code, supplier_id, priority, internal_production FROM product_suppliers WHERE user_id = ?${byEmpresa} ORDER BY product_code ASC`
    ).bind(...bindEmpresa([userId])).all()
    if (prodSupp.results && prodSupp.results.length > 0) {
      const grouped: Record<string, any> = {}
      for (const row of prodSupp.results as any[]) {
        const code = row.product_code
        if (!code) continue
        if (!grouped[code]) {
          grouped[code] = {
            id: row.id,
            productCode: code,
            productId: row.product_id || '',
            supplierIds: [],
            supplierIdSet: new Set<string>(),
            priorities: {},
            type: row.internal_production ? 'internal' : 'external',
            internalProduction: row.internal_production === 1,
          }
        }
        if (row.supplier_id && !grouped[code].supplierIdSet.has(row.supplier_id)) {
          grouped[code].supplierIdSet.add(row.supplier_id)
          grouped[code].supplierIds.push(row.supplier_id)
          grouped[code].priorities[row.supplier_id] = row.priority || 1
        }
      }
      tenant.productSuppliers = Object.values(grouped).map((g: any) => {
        const { supplierIdSet: _, ...rest } = g
        return rest
      })
    }
    // Load quotations
    try {
      const quots = await db.prepare(`SELECT * FROM quotations WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`)
        .bind(...bindEmpresa([userId])).all()
      if (quots.results && quots.results.length > 0) {
        // Merge: update existing in-memory quotations from D1 (preserving supplierResponses/items from memory)
        const dbById: Record<string, any> = {}
        for (const r of quots.results as any[]) {
          dbById[r.id] = r
        }
        const existingIds = new Set((tenant.quotations || []).map((q: any) => q.id))
        const updated: any[] = []
        for (const q of (tenant.quotations || [])) {
          const dbRow = dbById[q.id]
          if (dbRow) {
            updated.push({ ...q, status: dbRow.status || q.status, quotationReason: dbRow.quotation_reason || q.quotationReason || '' })
          } else {
            updated.push(q)
          }
        }
        // Add quotations from D1 that aren't in memory yet
        for (const r of quots.results as any[]) {
          if (!existingIds.has(r.id)) {
            let notes: any = {}
            try { notes = JSON.parse(r.notes || '{}') } catch { notes = {} }
            updated.push({
              id: r.id, code: r.code || r.id, descricao: r.title || '',
              status: r.status || 'sent', tipo: r.tipo || 'manual',
              createdBy: r.creator || '', createdAt: r.created_at || new Date().toISOString(),
              deadline: r.deadline || '', observations: notes.observations || '',
              items: notes.items || [], supplierIds: [], supplierResponses: [],
              approvedBy: r.approved_by || '', approvedAt: r.approved_at || '',
              quotationReason: r.quotation_reason || '',
            })
          }
        }
        if (updated.length > 0) {
          tenant.quotations = updated
          console.log(`[HYDRATION] ✅ ${updated.length} cotações carregadas/atualizadas de D1 para ${userId}`)
        }
      }
    } catch (e) {
      console.warn(`[HYDRATION] ⚠️ Não foi possível carregar cotações de D1 (tabela pode não ter user_id):`, (e as any).message)
    }
    // Load quotation negotiations
    try {
      const negs = await db.prepare(`SELECT * FROM quotation_negotiations WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`)
        .bind(...bindEmpresa([userId])).all()
      if (negs.results) {
        tenant.quotationNegotiations = (negs.results as any[]).map(r => ({
          id: r.id, quotationId: r.quotation_id,
          observations: r.observations || '', createdAt: r.created_at || '',
        }))
        console.log(`[HYDRATION] ✅ ${tenant.quotationNegotiations.length} negociações carregadas de D1 para ${userId}`)
      }
    } catch (e) {
      console.warn(`[HYDRATION] ⚠️ Não foi possível carregar quotation_negotiations de D1:`, (e as any).message)
    }
  } catch (e) {
    console.error(`[HYDRATION][ERROR] loadTenantFromDB failed for ${userId}:`, e)
    // Reset the hydration timestamp so the next request retries loading from D1.
    // Crucially, we do NOT overwrite in-memory data — whatever is in memory is kept.
    tenantHydratedAt[userId] = 0
  }
}