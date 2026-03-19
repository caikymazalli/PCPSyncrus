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
  productSupplierLinks: any[] // Vínculos fornecedor-produto persistidos em D1
  quotationNegotiations: any[] // Negociações de cotações
  impProdDesc?: Record<string, Record<string, string>> // Mapa de descrições de produtos importados
  workInstructions: any[]           // Instruções raiz
  workInstructionVersions: any[]    // Versões
  workInstructionSteps: any[]       // Etapas
  workInstructionPhotos: any[]      // Fotos
  workInstructionAuditLog: any[]    // Histórico auditoria
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
  productSupplierLinks: JSON.parse(JSON.stringify(_md.productSupplierLinks || [])),
  quotationNegotiations: [],
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

    // Lookup registered_users to:
    //   1. Resolve owner_id (supports guest accounts)
    //   2. Resolve empresa_id / grupo_id when absent in session row
    //      (sessions created before migration 0010 or stored with NULL values)
    try {
      const userRow = await db.prepare('SELECT owner_id, empresa_id, grupo_id FROM registered_users WHERE id = ?')
        .bind(row.user_id).first() as any
      if (userRow) {
        session.ownerId = userRow.owner_id || null
        if (!session.empresaId && userRow.empresa_id) {
          session.empresaId = userRow.empresa_id
        }
        if (!session.grupoId && userRow.grupo_id) {
          session.grupoId = userRow.grupo_id
        }
      }
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
      productSupplierLinks: [],
      quotationNegotiations: [],
      workInstructions: [],
      workInstructionVersions: [],
      workInstructionSteps: [],
      workInstructionPhotos: [],
      workInstructionAuditLog: [],
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

  // Resolve empresa_id and grupo_id from registered_users (source of truth)
  // NOTE: user_empresa table does not exist in production D1 — use registered_users.empresa_id
  let empresaId: string | null = null
  let grupoId: string | null = null
  if (db && !user.isDemo) {
    try {
      const uRow = await db.prepare(
        'SELECT empresa_id FROM registered_users WHERE id = ?'
      ).bind(user.userId).first() as any
      empresaId = uRow?.empresa_id || null
      if (empresaId) {
        const eRow = await db.prepare(
          'SELECT grupo_id FROM empresas WHERE id = ?'
        ).bind(empresaId).first() as any
        grupoId = eRow?.grupo_id || null
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
const HYDRATION_TTL = 10 * 1000 // 10 seconds TTL

/** Mark tenant in-memory data as modified (call after any write to memory) */
export function markTenantModified(userId: string): void {
  if (userId && userId !== 'demo-tenant') {
    tenantLastWriteAt[userId] = Date.now()
  }
}

/**
 * Reset hydration cache for a tenant, forcing a full re-load from D1 on the
 * next call to loadTenantFromDB.  Call this at worker startup (middleware) so
 * that a fresh deploy always re-reads the authoritative D1 state.
 */
export function resetTenantHydrationCache(userId: string): void {
  tenantHydratedAt[userId] = 0
  tenantLastWriteAt[userId] = 0
  console.log(`[HYDRATION] Cache limpo para ${userId} - forçará re-load de D1`)
}

/**
 * Log a work instruction audit event to D1 and in-memory.
 * Always updates in-memory (including demo mode); only writes to D1 for real tenants.
 */
export async function logWorkInstructionEvent(
  db: D1Database | null,
  userId: string,
  empresaId: string,
  instructionId: string,
  action: string,
  details: any,
  tenant: TenantData
): Promise<void> {
  const auditId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const auditEntry = {
    id: auditId,
    user_id: userId,
    empresa_id: empresaId || '1',
    instruction_id: instructionId,
    action,
    details: JSON.stringify(details),
    changed_by: userId,
    changed_at: new Date().toISOString(),
    ip_address: '',
  }

  if (db && userId !== 'demo-tenant') {
    try {
      const keys = Object.keys(auditEntry)
      const vals = Object.values(auditEntry)
      const placeholders = keys.map(() => '?').join(', ')
      await db.prepare(`INSERT INTO work_instruction_audit_log (${keys.join(', ')}) VALUES (${placeholders})`)
        .bind(...vals).run()
    } catch (e) {
      console.error('[AUDIT] Erro ao inserir log de auditoria:', (e as any).message)
    }
  }

  if (!tenant.workInstructionAuditLog) tenant.workInstructionAuditLog = []
  tenant.workInstructionAuditLog.push(auditEntry)
  markTenantModified(userId)
}

/**
 * Sync supplier priority columns (supplier_id_1/2/3/4) on a product in memory.
 * Call after creating or updating product-supplier links.
 * The D1 update must be performed separately in the route.
 */
export function syncSupplierPrioritiesToProduct(
  tenant: TenantData,
  productCode: string,
  suppliers: Array<{ supplierId: string; priority: number }>
): void {
  const product = (tenant.products || []).find((p: any) => p.code === productCode)
  if (!product) return
  const sortedIds = suppliers
    .sort((a, b) => (a.priority || 1) - (b.priority || 1))
    .map(s => s.supplierId)
    .filter(Boolean)
  product.supplier_id_1 = sortedIds[0] || ''
  product.supplier_id_2 = sortedIds[1] || ''
  product.supplier_id_3 = sortedIds[2] || ''
  product.supplier_id_4 = sortedIds[3] || ''
  // supplierId is the legacy single-supplier field kept in sync with the primary supplier
  product.supplierId = sortedIds[0] || ''
}

/** Load a tenant's data from D1 into memory. Cached for 30s per worker instance. */
export async function loadTenantFromDB(userId: string, db: D1Database, empresaId?: string | null): Promise<void> {
  if (!userId || userId === 'demo-tenant') return
  const now = Date.now()
  if (tenantHydratedAt[userId] && now - tenantHydratedAt[userId] < HYDRATION_TTL) return

  // Skip re-hydration only when a write happened very recently (< 2s) to avoid
  // overwriting data that may not have propagated to D1 yet.  Longer windows
  // are no longer skipped so that D1 remains the authoritative source of truth
  // and new worker instances (after a deploy) always load fresh data.
  const lastWrite = tenantLastWriteAt[userId] || 0
  if (lastWrite && now - lastWrite < 2000) {
    console.log(`[HYDRATION] Skipping re-hydration for ${userId}: recent write ${now - lastWrite}ms ago, will retry after 2s`)
    return
  }

  tenantHydratedAt[userId] = now

  // Resolve empresa_id: if not provided, fall back to registered_users to ensure
  // tenant-scoped data (product_supplier_links, work_instructions, etc.) is always
  // filtered correctly even after a cold start where the session row has NULL empresa_id.
  let resolvedEmpresaId = empresaId || null
  if (!resolvedEmpresaId) {
    try {
      const userRow = await db.prepare('SELECT empresa_id FROM registered_users WHERE id = ?')
        .bind(userId).first() as any
      if (userRow?.empresa_id) {
        resolvedEmpresaId = userRow.empresa_id
        console.log(`[HYDRATION] Resolved empresaId=${resolvedEmpresaId} from registered_users for ${userId}`)
      }
    } catch {}
  }

  // Build empresa_id filter clause for tables that support it
  const byEmpresa = resolvedEmpresaId ? ' AND empresa_id = ?' : ''
  const bindEmpresa = (base: any[]) => resolvedEmpresaId ? [...base, resolvedEmpresaId] : base

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
        ncm: r.ncm || '',
        descPT: r.desc_pt || '',
        descEN: r.desc_en || '',
        serialControlled: r.serial_controlled === 1,
        controlType: r.control_type || '',
        supplierId: r.supplier_id_1 || r.supplier_id || '',
        supplier_id_1: r.supplier_id_1 || r.supplier_id || '',
        supplier_id_2: r.supplier_id_2 || '',
        supplier_id_3: r.supplier_id_3 || '',
        supplier_id_4: r.supplier_id_4 || '',
        criticalPercentage: r.critical_percentage || 50,
        grossWeight: r.gross_weight || 0,
        netWeight:   r.net_weight   || 0,
        cbm:         r.cbm          || 0,
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
      console.log(`[HYDRATION] ✅ ${tenant.suppliers.length} fornecedores carregados`)
    } else {
      console.log(`[HYDRATION] ⚠️ Nenhum fornecedor encontrado em D1 para ${userId}`)
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
        ncm: r.ncm || '',
        descPT: r.desc_pt || '',
        descEN: r.desc_en || '',
        grossWeight: r.gross_weight || 0,
        netWeight:   r.net_weight   || 0,
        cbm:         r.cbm          || 0,
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
    // Load serial pending items (release queue)
    try {
      const spi = await db.prepare('SELECT * FROM serial_pending_items WHERE user_id = ? ORDER BY imported_at DESC').bind(userId).all()
      if (spi.results && spi.results.length > 0) {
        tenant.serialPendingItems = (spi.results as any[]).map(r => {
          let entries: any[] = []
          try { entries = JSON.parse(r.entries_json || '[]') } catch { entries = [] }
          return {
            id: r.id,
            productCode: r.product_code,
            productName: r.product_name,
            totalQty: r.total_qty || 1,
            identifiedQty: r.identified_qty || 0,
            unit: r.unit || 'un',
            controlType: r.control_type || 'serie',
            status: r.status || 'pending',
            entries,
            importedAt: r.imported_at || r.created_at || new Date().toISOString(),
          }
        })
        console.log(`[HYDRATION] ✅ ${tenant.serialPendingItems.length} itens de liberação de série carregados`)
      }
    } catch (e) {
      console.warn('[HYDRATION] ⚠️ Não foi possível carregar serial_pending_items:', (e as any).message)
      if (!tenant.serialPendingItems) tenant.serialPendingItems = []
    }
    // Load released serial/lot numbers
    try {
      const snRes = await db.prepare(`SELECT * FROM serial_numbers WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`)
        .bind(...bindEmpresa([userId])).all()
      if (snRes.results && snRes.results.length > 0) {
        tenant.serialNumbers = (snRes.results as any[]).map(r => ({
          id: r.id,
          itemCode: r.item_code,
          number: r.number,
          qty: r.quantity || 1,
          controlType: r.type || 'serie',
          status: r.status || 'em_estoque',
          origin: r.origin || 'manual',
          createdAt: r.created_at || new Date().toISOString(),
          userId: r.user_id,
          empresaId: r.empresa_id,
          almoxarifadoId: r.almoxarifado_id || 'alm1',
          location: r.location || '',
        }))
        console.log(`[HYDRATION] ✅ ${tenant.serialNumbers.length} números de série/lote carregados`)
      } else {
        if (!tenant.serialNumbers) tenant.serialNumbers = []
      }
    } catch (e) {
      console.warn('[HYDRATION] ⚠️ Não foi possível carregar serial_numbers:', (e as any).message)
      if (!tenant.serialNumbers) tenant.serialNumbers = []
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
      console.log(`[HYDRATION] ✅ ${tenant.plants.length} plantas carregadas`)
    } else {
      console.log(`[HYDRATION] ⚠️ Nenhuma planta encontrada em D1 para ${userId}`)
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
      console.log(`[HYDRATION] ✅ ${tenant.machines.length} máquinas carregadas`)
    } else {
      console.log(`[HYDRATION] ⚠️ Nenhuma máquina encontrada em D1 para ${userId}`)
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
      console.log(`[HYDRATION] ✅ ${tenant.workbenches.length} bancadas carregadas`)
    } else {
      console.log(`[HYDRATION] ⚠️ Nenhuma bancada encontrada em D1 para ${userId}`)
    }
    // Load supplier categories
    const cats = await db.prepare('SELECT * FROM supplier_categories WHERE user_id = ? ORDER BY created_at ASC').bind(userId).all()
    if (cats.results) {
      tenant.supplierCategories = (cats.results as any[]).map(r => ({
        id: r.id, name: r.name, createdAt: r.created_at || new Date().toISOString(),
      }))
    }
    // Load product-supplier linkages
    try {
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
        const dbEntries = Object.values(grouped).map((g: any) => {
          const { supplierIdSet: _, ...rest } = g
          return rest
        })
        // D1 é a fonte de verdade em produção: substitui memória pelo estado do D1.
        // Entradas apenas em memória (nunca persistidas) são descartadas para evitar
        // divergência após deploy/cold-start.
        tenant.productSuppliers = dbEntries
      }
    } catch (e) {
      console.warn('[HYDRATION] ⚠️ Não foi possível carregar product_suppliers:', (e as any).message)
      if (!tenant.productSuppliers) tenant.productSuppliers = []
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
              id: r.id, code: r.code || r.id, descricao: notes.descricao || '',
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
    // Load quotation_responses and merge into quotations' supplierResponses
    try {
      const qresps = await db.prepare(`SELECT * FROM quotation_responses WHERE user_id = ?${byEmpresa} ORDER BY responded_at DESC`)
        .bind(...bindEmpresa([userId])).all()
      if (qresps.results && qresps.results.length > 0) {
        // Group responses by quotation_id
        const byQuotId: Record<string, any[]> = {}
        for (const r of qresps.results as any[]) {
          if (!byQuotId[r.quotation_id]) byQuotId[r.quotation_id] = []
          let items: any[] = []
          try { items = JSON.parse(r.notes || '[]') } catch { items = [] }
          byQuotId[r.quotation_id].push({
            id: r.id,
            supplierId: r.supplier_id || '',
            supplierName: r.supplier_name || '',
            totalPrice: r.total_price || 0,
            unitPrice: r.unit_price || 0,
            deliveryDays: r.delivery_days || 0,
            paymentTerms: r.payment_terms || '',
            notes: '',
            respondedAt: r.responded_at || r.created_at || '',
            items,
          })
        }
        // Merge into in-memory quotations
        if (tenant.quotations) {
          for (const q of tenant.quotations) {
            if (byQuotId[q.id] && byQuotId[q.id].length > 0) {
              // Replace if in-memory has empty supplierResponses (fresh instance after deploy)
              if (!q.supplierResponses || q.supplierResponses.length === 0) {
                q.supplierResponses = byQuotId[q.id]
                if (q.supplierResponses.length > 0 && q.status === 'sent') {
                  q.status = 'with_responses'
                }
              }
            }
          }
        }
        console.log(`[HYDRATION] ✅ ${qresps.results.length} respostas de cotação carregadas de D1 para ${userId}`)
      }
    } catch (e) {
      console.warn(`[HYDRATION] ⚠️ Não foi possível carregar quotation_responses:`, (e as any).message)
    }
    // Load imports (processos de importação) do D1
    try {
      // Auto-migration: garantir colunas adicionadas por 0045 (idempotente)
      try {
        await db.batch([
          db.prepare("ALTER TABLE imports ADD COLUMN code TEXT DEFAULT ''"),
          db.prepare("ALTER TABLE imports ADD COLUMN supplier_name TEXT DEFAULT ''"),
          db.prepare("ALTER TABLE imports ADD COLUMN modality TEXT DEFAULT 'maritimo'"),
        ])
      } catch (_) { /* colunas já existem */ }
      const imps = await db.prepare(`SELECT * FROM imports WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`)
        .bind(...bindEmpresa([userId])).all()
      if (imps.results && imps.results.length > 0) {
        const existingImpIds = new Set((tenant.imports || []).map((i: any) => i.id))
        const newImps: any[] = []
        for (const r of imps.results as any[]) {
          if (!existingImpIds.has(r.id)) {
            let items: any[] = []
            let taxes: any = {}
            let numerario: any = {}
            try { const n = JSON.parse(r.notes || '{}'); items = n.items || []; taxes = n.taxes || {}; numerario = n.numerario || {} } catch {}
            newImps.push({
              id: r.id,
              // code/supplier_name/modality podem estar nas notes se migration 0045 ainda não foi aplicada
              code: r.code || (() => { try { return JSON.parse(r.notes||'{}').code || r.id } catch{ return r.id } })(),
              invoiceNumber: r.invoice_number || '',
              supplierId: r.supplier_id || '',
              supplierName: r.supplier_name || (() => { try { return JSON.parse(r.notes||'{}').supplier_name || '' } catch{ return '' } })(),
              modality: r.modality || r.modalidade || (() => { try { return JSON.parse(r.notes||'{}').modality || 'maritimo' } catch{ return 'maritimo' } })(),
              status: r.status || 'waiting_ship',
              invoiceDate: r.invoice_date || '',
              incoterm: r.incoterm || 'FOB',
              currency: r.currency || 'USD',
              exchangeRate: r.exchange_rate || 5.52,
              portOfOrigin: r.port_origin || '',
              portOfDestination: r.port_dest || 'Santos',
              expectedArrival: r.expected_arrival || '',
              grossWeight: r.weight_gross || 0,
              netWeight: r.weight_net || 0,
              invoiceValueEUR: r.value_eur || 0,
              invoiceValueUSD: r.value_usd || 0,
              invoiceValueBRL: r.value_brl || 0,
              description: r.description || '',
              ncm: r.ncm || '',
              taxes: {
                ii:       r.tax_ii       ?? taxes.ii       ?? 0,
                ipi:      r.tax_ipi      ?? taxes.ipi      ?? 0,
                pis:      r.tax_pis      ?? taxes.pis      ?? 0,
                cofins:   r.tax_cofins   ?? taxes.cofins   ?? 0,
                icms:     r.tax_icms     ?? taxes.icms     ?? 0,
                afrmm:    r.tax_afrmm    ?? taxes.afrmm    ?? 0,
                siscomex: r.tax_siscomex ?? taxes.siscomex ?? 0,
              },
              numerario: {
                frete:  numerario.frete  || 0,
                seguro: numerario.seguro || 0,
                desp:   numerario.desp   || 0,
                porto:  numerario.porto  || 0,
                arm:    numerario.arm    || 0,
                totalLandedCostBRL: numerario.totalLandedCostBRL || 0,
                unitCostBRL:        numerario.unitCostBRL        || 0,
              },
              createdAt: r.created_at || new Date().toISOString(),
              items, timeline: [],
            })
          }
        }
        if (newImps.length > 0) {
          if (!tenant.imports) tenant.imports = []
          tenant.imports.push(...newImps)
          console.log(`[HYDRATION] ✅ ${newImps.length} importações carregadas de D1 para ${userId}`)
        }
      }
    } catch (e) {
      console.warn('[HYDRATION] ⚠️ Não foi possível carregar imports:', (e as any).message)
    }



    // Load product_supplier_links
    try {
      console.log('[HYDRATION] Carregando product_supplier_links...')
      const links = await db.prepare(
        `SELECT * FROM product_supplier_links WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`
      ).bind(...bindEmpresa([userId])).all()
      tenant.productSupplierLinks = (links.results as any[]).map((r: any) => ({
        id: r.id,
        product_id: r.product_id,
        supplier_id: r.supplier_id,
        supplier_name: r.supplier_name,
        supplier_email: r.supplier_email || '',
        supplier_phone: r.supplier_phone || '',
        status: r.status || 'active',
        created_at: r.created_at,
      }))
      console.log(`[HYDRATION] ✅ ${tenant.productSupplierLinks.length} vínculos product_supplier_links carregados`)
    } catch (e) {
      console.warn('[HYDRATION] ⚠️ Não foi possível carregar product_supplier_links:', (e as any).message)
      tenant.productSupplierLinks = []
    }
    // Load imp_prod_desc (NCM, descPT, descEN per product code)
    try {
      const ipdRows = await db.prepare(
        `SELECT * FROM imp_prod_desc WHERE user_id = ?${byEmpresa} ORDER BY updated_at DESC`
      ).bind(...bindEmpresa([userId])).all()
      if (ipdRows.results && ipdRows.results.length > 0) {
        if (!tenant.impProdDesc) tenant.impProdDesc = {}
        for (const r of ipdRows.results as any[]) {
          if (!tenant.impProdDesc[r.code]) tenant.impProdDesc[r.code] = {}
          tenant.impProdDesc[r.code][r.field] = r.value || ''
        }
        // Aplicar em products E em stockItems (ncm, descPT, descEN)
        const allowedFields = ['ncm', 'descPT', 'descEN']
        const allTenantItems = [...(tenant.products || []), ...(tenant.stockItems || [])]
        for (const prod of allTenantItems) {
          const desc = tenant.impProdDesc[prod.code]
          if (desc) {
            for (const f of allowedFields) {
              if (desc[f] !== undefined && !prod[f]) prod[f] = desc[f]
            }
          }
        }
        console.log(`[HYDRATION] ✅ ${ipdRows.results.length} entradas imp_prod_desc carregadas para ${userId}`)
      }
    } catch(e) {
      console.warn('[HYDRATION] ⚠️ imp_prod_desc não disponível (tabela pode não existir):', (e as any).message)
      if (!tenant.impProdDesc) tenant.impProdDesc = {}
    }

    // Load purchase_orders
    try {
      const orders = await db.prepare(
        `SELECT * FROM purchase_orders WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`
      ).bind(...bindEmpresa([userId])).all()
      if (orders.results && orders.results.length > 0) {
        const existingIds = new Set((tenant.purchaseOrders || []).map((o: any) => o.id))
        const fromDb: any[] = (orders.results as any[])
          .filter((r: any) => !existingIds.has(r.id))
          .map((r: any) => {
            let notes: any = {}
            try { notes = JSON.parse(r.notes || '{}') } catch { notes = {} }
            return {
              id: r.id,
              code: r.code,
              quotationId: r.quotation_id,
              supplierName: r.supplier_name,
              status: r.status,
              totalValue: r.total_value,
              items: notes.items || [],
              pedidoData: notes.pedidoData || '',
              dataEntrega: notes.dataEntrega || '',
              observacoes: notes.observacoes || '',
              createdAt: r.created_at,
              approvedAt: r.approved_at || '',
              approvedBy: r.approved_by || '',
            }
          })
        tenant.purchaseOrders = [...(tenant.purchaseOrders || []), ...fromDb]
        console.log(`[HYDRATION] ✅ ${tenant.purchaseOrders.length} purchase orders carregados de D1 para ${userId}`)
      }
    } catch (e) {
      console.warn('[HYDRATION] ⚠️ Não foi possível carregar purchase_orders:', (e as any).message)
      if (!tenant.purchaseOrders) tenant.purchaseOrders = []
    }

    // Load work instructions
    try {
      const instrs = await db.prepare(`SELECT * FROM work_instructions WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`)
        .bind(...bindEmpresa([userId])).all()
      if (instrs.results && instrs.results.length > 0) {
        tenant.workInstructions = (instrs.results as any[]).map(r => ({
          id: r.id,
          code: r.code,
          title: r.title,
          description: '',        // filled from work_instruction_versions after load
          current_version: '',    // filled from work_instruction_versions after load
          status: r.status || 'draft',
          created_at: r.created_at,
          created_by: '',         // filled from work_instruction_versions after load
          updated_at: r.updated_at,
        }))
        console.log(`[HYDRATION] ✅ ${tenant.workInstructions.length} instruções de trabalho carregadas`)
      } else if (!tenant.workInstructions) {
        tenant.workInstructions = []
      }
    } catch (e) {
      const msg = (e as any).message || ''
      if (msg.includes('no such column: empresa_id')) {
        // Legacy schema fallback: work_instructions table exists but lacks empresa_id column
        console.warn('[HYDRATION] ⚠️ [LEGACY] Coluna empresa_id ausente em work_instructions — usando fallback sem filtro de empresa. Execute: npm run d1:migrate-work-instructions')
        try {
          const instrs = await db.prepare('SELECT * FROM work_instructions WHERE user_id = ? ORDER BY created_at DESC')
            .bind(userId).all()
          if (instrs.results && instrs.results.length > 0) {
            tenant.workInstructions = (instrs.results as any[]).map(r => ({
              id: r.id,
              code: r.code,
              title: r.title,
              description: '',        // filled from work_instruction_versions after load
              current_version: '',    // filled from work_instruction_versions after load
              status: r.status || 'draft',
              created_at: r.created_at,
              created_by: '',         // filled from work_instruction_versions after load
              updated_at: r.updated_at,
            }))
            console.log(`[HYDRATION] ✅ [LEGACY] ${tenant.workInstructions.length} instruções carregadas via fallback sem empresa_id`)
          } else if (!tenant.workInstructions) {
            tenant.workInstructions = []
          }
        } catch (e2) {
          console.warn('[HYDRATION] ⚠️ Não foi possível carregar work_instructions (legacy fallback):', (e2 as any).message)
          if (!tenant.workInstructions) tenant.workInstructions = []
        }
      } else {
        console.warn('[HYDRATION] ⚠️ Não foi possível carregar work_instructions:', msg)
        if (!tenant.workInstructions) tenant.workInstructions = []
      }
    }

    // Load work instruction versions
    try {
      const versions = await db.prepare(`SELECT * FROM work_instruction_versions WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`)
        .bind(...bindEmpresa([userId])).all()
      if (versions.results && versions.results.length > 0) {
        tenant.workInstructionVersions = (versions.results as any[]).map(r => ({
          id: r.id,
          instruction_id: r.instruction_id,
          version: r.version,
          title: r.title,
          description: r.description || '',
          is_current: r.is_current === 1,
          status: r.status || 'draft',
          created_at: r.created_at,
          created_by: r.created_by,
        }))
        console.log(`[HYDRATION] ✅ ${tenant.workInstructionVersions.length} versões carregadas`)
      } else if (!tenant.workInstructionVersions) {
        tenant.workInstructionVersions = []
      }
    } catch (e) {
      const msg = (e as any).message || ''
      if (msg.includes('no such table')) {
        console.warn('[HYDRATION] ⚠️ [LEGACY] Tabela work_instruction_versions não existe — schema legado. Execute migrations/0027 e scripts/d1-migrate-work-instructions.ts')
      } else {
        console.warn('[HYDRATION] ⚠️ Não foi possível carregar work_instruction_versions:', msg)
      }
      if (!tenant.workInstructionVersions) tenant.workInstructionVersions = []
    }

    // Enrich work instructions with metadata from current version
    if (tenant.workInstructions && tenant.workInstructionVersions) {
      for (const instr of tenant.workInstructions as any[]) {
        const currentVer = (tenant.workInstructionVersions as any[]).find(
          (v: any) => v.instruction_id === instr.id && v.is_current
        )
        if (currentVer) {
          instr.description = currentVer.description || ''
          instr.current_version = currentVer.version || ''
          instr.created_by = currentVer.created_by || ''
        }
      }
    }

    // Load work instruction steps
    try {
      const steps = await db.prepare(`SELECT * FROM work_instruction_steps WHERE user_id = ?${byEmpresa} ORDER BY step_number ASC`)
        .bind(...bindEmpresa([userId])).all()
      if (steps.results && steps.results.length > 0) {
        tenant.workInstructionSteps = (steps.results as any[]).map(r => ({
          id: r.id,
          version_id: r.version_id,
          step_number: r.step_number,
          title: r.title,
          description: r.description || '',
          observation: r.observation || '',
          created_at: r.created_at,
          created_by: r.created_by,
        }))
        console.log(`[HYDRATION] ✅ ${tenant.workInstructionSteps.length} etapas carregadas`)
      } else if (!tenant.workInstructionSteps) {
        tenant.workInstructionSteps = []
      }
    } catch (e) {
      const msg = (e as any).message || ''
      if (msg.includes('no such table')) {
        console.warn('[HYDRATION] ⚠️ [LEGACY] Tabela work_instruction_steps não existe — schema legado. Execute migrations/0027 e scripts/d1-migrate-work-instructions.ts')
      } else {
        console.warn('[HYDRATION] ⚠️ Não foi possível carregar work_instruction_steps:', msg)
      }
      if (!tenant.workInstructionSteps) tenant.workInstructionSteps = []
    }

    // Load work instruction photos
    try {
      const photos = await db.prepare(`SELECT * FROM work_instruction_photos WHERE user_id = ?${byEmpresa} ORDER BY uploaded_at DESC`)
        .bind(...bindEmpresa([userId])).all()
      if (photos.results && photos.results.length > 0) {
        tenant.workInstructionPhotos = (photos.results as any[]).map(r => ({
          id: r.id,
          step_id: r.step_id,
          photo_url: r.photo_url,
          file_name: r.file_name,
          uploaded_at: r.uploaded_at,
          uploaded_by: r.uploaded_by,
          object_key: r.object_key || '',
          content_type: r.content_type || '',
        }))
        console.log(`[HYDRATION] ✅ ${tenant.workInstructionPhotos.length} fotos carregadas`)
      } else if (!tenant.workInstructionPhotos) {
        tenant.workInstructionPhotos = []
      }
    } catch (e) {
      const msg = (e as any).message || ''
      if (msg.includes('no such table')) {
        console.warn('[HYDRATION] ⚠️ [LEGACY] Tabela work_instruction_photos não existe — schema legado.')
      } else {
        console.warn('[HYDRATION] ⚠️ Não foi possível carregar work_instruction_photos:', msg)
      }
      if (!tenant.workInstructionPhotos) tenant.workInstructionPhotos = []
    }

    // Load work instruction audit log
    try {
      const auditLog = await db.prepare(`SELECT * FROM work_instruction_audit_log WHERE user_id = ?${byEmpresa} ORDER BY changed_at DESC`)
        .bind(...bindEmpresa([userId])).all()
      if (auditLog.results && auditLog.results.length > 0) {
        tenant.workInstructionAuditLog = (auditLog.results as any[]).map(r => ({
          id: r.id,
          instruction_id: r.instruction_id,
          action: r.action,
          details: r.details,
          changed_by: r.changed_by,
          changed_at: r.changed_at,
          ip_address: r.ip_address,
        }))
        console.log(`[HYDRATION] ✅ ${tenant.workInstructionAuditLog.length} registros de auditoria carregados`)
      } else if (!tenant.workInstructionAuditLog) {
        tenant.workInstructionAuditLog = []
      }
    } catch (e) {
      const msg = (e as any).message || ''
      if (msg.includes('no such table')) {
        console.warn('[HYDRATION] ⚠️ [LEGACY] Tabela work_instruction_audit_log não existe — schema legado.')
      } else {
        console.warn('[HYDRATION] ⚠️ Não foi possível carregar work_instruction_audit_log:', msg)
      }
      if (!tenant.workInstructionAuditLog) tenant.workInstructionAuditLog = []
    }
    // Load almoxarifado locations
    try {
      const locsRes = await db.prepare(`SELECT * FROM almoxarifado_locations WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`)
        .bind(...bindEmpresa([userId])).all()
      if (locsRes.results && locsRes.results.length > 0) {
        ;(tenant as any).almoxarifadoLocations = (locsRes.results as any[]).map(r => ({
          id: r.id,
          almoxarifadoId: r.almoxarifado_id,
          code: r.code,
          description: r.description || '',
          status: r.status || 'active',
          createdAt: r.created_at || new Date().toISOString(),
        }))
        console.log(`[HYDRATION] ✅ ${(tenant as any).almoxarifadoLocations.length} endereços de almoxarifado carregados`)
      } else if (!(tenant as any).almoxarifadoLocations) {
        ;(tenant as any).almoxarifadoLocations = []
      }
    } catch (e) {
      const msg = (e as any).message || ''
      if (msg.includes('no such table')) {
        console.warn('[HYDRATION] ⚠️ Tabela almoxarifado_locations não existe — execute a migration almoxarifado_locations.')
      } else {
        console.warn('[HYDRATION] ⚠️ Não foi possível carregar almoxarifado_locations:', msg)
      }
      if (!(tenant as any).almoxarifadoLocations) (tenant as any).almoxarifadoLocations = []
    }

    // Load production_orders
    try {
      const ordersRes = await db.prepare(`SELECT * FROM production_orders WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`)
        .bind(...bindEmpresa([userId])).all()
      if (ordersRes.results && ordersRes.results.length > 0) {
        const existingIds = new Set((tenant.productionOrders || []).map((o: any) => o.id))
        const fromDb = (ordersRes.results as any[])
          .filter(r => !existingIds.has(r.id))
          .map(r => ({
            id: r.id,
            code: r.code || '',
            productName: r.product_name || '',
            productId: r.product_code || '',
            quantity: r.quantity || 1,
            completedQuantity: r.completed_quantity ?? r.quantity_produced ?? 0,
            status: r.status || 'planned',
            priority: r.priority || 'medium',
            startDate: r.start_date || '',
            endDate: r.end_date || '',
            plantId: r.plant_id || '',
            plantName: r.plant_name || '',
            pedido: r.pedido || '',
            cliente: r.cliente || '',
            notes: r.notes || '',
            createdAt: r.created_at || new Date().toISOString(),
          }))
        tenant.productionOrders = [...(tenant.productionOrders || []), ...fromDb]
        console.log(`[HYDRATION] ✅ ${tenant.productionOrders.length} ordens de produção carregadas de D1 para ${userId}`)
      } else {
        if (!tenant.productionOrders) tenant.productionOrders = []
        console.log(`[HYDRATION] ⚠️ Nenhuma ordem de produção encontrada em D1 para ${userId}`)
      }
    } catch (e) {
      console.warn('[HYDRATION] ⚠️ Não foi possível carregar production_orders:', (e as any).message)
      if (!tenant.productionOrders) tenant.productionOrders = []
    }

    // Load apontamentos
    try {
      const aptRes = await db.prepare(`SELECT * FROM apontamentos WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`)
        .bind(...bindEmpresa([userId])).all()
      if (aptRes.results && aptRes.results.length > 0) {
        const existingIds = new Set((tenant.productionEntries || []).map((e: any) => e.id))
        const fromDb = (aptRes.results as any[])
          .filter(r => !existingIds.has(r.id))
          .map(r => ({
            id: r.id,
            orderId: r.order_id || '',
            orderCode: r.order_code || '',
            productName: r.product_name || '',
            operator: r.operator || '',
            stepName: r.step_name || '',
            machine: r.machine || '',
            startTime: r.start_time || '',
            endTime: r.end_time || '',
            produced: r.produced || 0,
            rejected: r.rejected || 0,
            timeSpent: r.time_spent || 0,
            reason: r.reason || '',
            notes: r.notes || '',
            shift: r.shift || 'manha',
            imageIds: [], // image links are stored in apontamento_images, not in the apontamentos row
            createdAt: r.created_at || new Date().toISOString(),
          }))
        tenant.productionEntries = [...(tenant.productionEntries || []), ...fromDb]
        console.log(`[HYDRATION] ✅ ${tenant.productionEntries.length} apontamentos carregados de D1 para ${userId}`)
      } else {
        if (!tenant.productionEntries) tenant.productionEntries = []
        console.log(`[HYDRATION] ⚠️ Nenhum apontamento encontrado em D1 para ${userId}`)
      }
    } catch (e) {
      console.warn('[HYDRATION] ⚠️ Não foi possível carregar apontamentos:', (e as any).message)
      if (!tenant.productionEntries) tenant.productionEntries = []
    }

    // Load roteiros (active only) + their operations
    try {
      const roteirosRes = await db.prepare(
        `SELECT * FROM roteiros WHERE user_id = ?${byEmpresa} AND is_active = 1 ORDER BY created_at DESC`
      ).bind(...bindEmpresa([userId])).all()
      if (roteirosRes.results && roteirosRes.results.length > 0) {
        const roteiroIds = (roteirosRes.results as any[]).map((r: any) => r.id)
        let opsByRoteiro: Record<string, any[]> = {}
        try {
          const placeholders = roteiroIds.map(() => '?').join(',')
          const opsQuery = resolvedEmpresaId
            ? `SELECT * FROM roteiro_operacoes WHERE user_id = ? AND empresa_id = ? AND roteiro_id IN (${placeholders}) ORDER BY order_index ASC`
            : `SELECT * FROM roteiro_operacoes WHERE user_id = ? AND roteiro_id IN (${placeholders}) ORDER BY order_index ASC`
          const opsBindArgs = resolvedEmpresaId
            ? [userId, resolvedEmpresaId, ...roteiroIds]
            : [userId, ...roteiroIds]
          const opsRes = await db.prepare(opsQuery).bind(...opsBindArgs).all()
          for (const op of (opsRes.results || []) as any[]) {
            if (!opsByRoteiro[op.roteiro_id]) opsByRoteiro[op.roteiro_id] = []
            opsByRoteiro[op.roteiro_id].push({
              order: op.order_index,
              operation: op.operation || '',
              standardTime: op.standard_time || 0,
              resourceType: op.resource_type || 'manual',
              machine: op.machine || '',
            })
          }
        } catch {}
        tenant.routes = (roteirosRes.results as any[]).map((r: any) => ({
          id: r.id,
          name: r.name,
          productId: r.product_id || '',
          productCode: r.product_code || '',
          productName: r.product_name || '',
          version: r.version || '1.0',
          status: r.status || 'active',
          notes: r.observacoes || '',
          steps: opsByRoteiro[r.id] || [],
          isActive: 1,
          parentId: r.parent_id || null,
          createdAt: r.created_at || new Date().toISOString(),
          updatedAt: r.updated_at || new Date().toISOString(),
        }))
        console.log(`[HYDRATION] ✅ ${tenant.routes.length} roteiros carregados de D1 para ${userId}`)
      } else {
        if (!tenant.routes) tenant.routes = []
        console.log(`[HYDRATION] ⚠️ Nenhum roteiro ativo encontrado em D1 para ${userId}`)
      }
    } catch (e) {
      console.warn('[HYDRATION] ⚠️ Não foi possível carregar roteiros:', (e as any).message)
      if (!tenant.routes) tenant.routes = []
    }
    // Load non_conformances
    try {
      const ncRes = await db.prepare(
        `SELECT * FROM non_conformances WHERE user_id = ?${byEmpresa} ORDER BY created_at DESC`
      ).bind(...bindEmpresa([userId])).all()
      if (ncRes.results && ncRes.results.length > 0) {
        const existingIds = new Set((tenant.nonConformances || []).map((n: any) => n.id))
        const fromDb = (ncRes.results as any[])
          .filter(r => !existingIds.has(r.id))
          .map(r => ({
            id: r.id,
            code: r.code || r.id,
            title: r.title || r.description || '',
            type: r.type || 'processo',
            severity: r.severity || 'medium',
            status: r.status || 'open',
            product: r.product || '',
            description: r.description || '',
            responsible: r.responsible || '',
            dueDate: r.due_date || '',
            openedAt: r.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
            orderCode: r.order_code || r.order_id || '—',
            stepName: r.step_name || r.step || '—',
            quantityRejected: r.quantity_rejected || 0,
            operator: r.operator || r.responsible || '—',
            images: [],
            createdAt: r.created_at || new Date().toISOString(),
          }))
        tenant.nonConformances = [...(tenant.nonConformances || []), ...fromDb]
        console.log(`[HYDRATION] ✅ ${tenant.nonConformances.length} não conformidades carregadas de D1 para ${userId}`)
      } else {
        if (!tenant.nonConformances) tenant.nonConformances = []
        console.log(`[HYDRATION] ⚠️ Nenhuma não conformidade encontrada em D1 para ${userId}`)
      }
    } catch (e) {
      console.warn('[HYDRATION] ⚠️ Não foi possível carregar non_conformances:', (e as any).message)
      if (!tenant.nonConformances) tenant.nonConformances = []
    }
  } catch (e) {
    console.error(`[HYDRATION][ERROR] loadTenantFromDB failed for ${userId}:`, e)
    // Reset the hydration timestamp so the next request retries loading from D1.
    // Crucially, we do NOT overwrite in-memory data — whatever is in memory is kept.
    tenantHydratedAt[userId] = 0
  }
}
