/**
 * userStore.ts — Multi-tenant in-memory store
 *
 * Each user session has isolated data.
 * Demo accounts share the mockData (read-only copy used as seed).
 * New users start with empty arrays.
 *
 * In production this would be backed by Cloudflare D1.
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
  users: any[]        // sub-users of this account
  // extra fields from mockData
  kpis: any
  chartData: any
  bomItems: any[]
  productSuppliers: any[]
  workOrders: any[]
}

// ── In-memory stores ───────────────────────────────────────────────────────────
// sessions: token → UserSession
export const sessions: Record<string, UserSession> = {}

// tenants: userId → TenantData
export const tenants: Record<string, TenantData> = {}

// registeredUsers: email → { userId, pwdHash, nome, empresa, plano, role, ... }
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
}
export const registeredUsers: Record<string, RegisteredUser> = {}

// ── Demo users (pre-seeded) ────────────────────────────────────────────────────
const demoUserId = 'demo-tenant'

export const DEMO_USERS = [
  { email: 'carlos@empresa.com', pwdHash: '', nome: 'Carlos', sobrenome: 'Silva', role: 'admin' },
  { email: 'ana@empresa.com',    pwdHash: '', nome: 'Ana',    sobrenome: 'Souza', role: 'gestor_pcp' },
  { email: 'joao@empresa.com',   pwdHash: '', nome: 'João',   sobrenome: 'Oliveira', role: 'operador' },
]

// Seed demo tenant once
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

export function getSession(token: string | undefined): UserSession | null {
  if (!token) return null
  const s = sessions[token]
  if (!s) return null
  if (Date.now() > s.expiresAt) { delete sessions[token]; return null }
  return s
}

export function getTenantData(userId: string): TenantData {
  if (!tenants[userId]) {
    // Create empty tenant for new user
    tenants[userId] = {
      plants: [], machines: [], workbenches: [],
      products: [], productionOrders: [], productionEntries: [],
      stockItems: [], nonConformances: [], suppliers: [],
      quotations: [], purchaseOrders: [], imports: [],
      boms: [], instructions: [], qualityChecks: [], users: [],
      kpis: { totalOrders:0, activeOrders:0, plannedOrders:0, completedOrders:0,
               cancelledOrders:0, totalProduced:0, totalRejected:0, totalProducts:0,
               totalMachines:0, totalPlants:0, completionRate:0, qualityRate:100 },
      chartData: { labels:[], planned:[], produced:[], rejected:[] },
      bomItems: [], productSuppliers: [], workOrders: [],
    }
  }
  return tenants[userId]
}

export function getEffectiveTenantId(session: UserSession | null): string {
  if (!session) return demoUserId
  return session.isDemo ? demoUserId : session.userId
}

const SESSION_DURATION = 60 * 60 * 8 * 1000 // 8h in ms

export async function createSession(user: RegisteredUser): Promise<string> {
  const token = await makeToken(user.email)
  sessions[token] = {
    token,
    userId:    user.userId,
    email:     user.email,
    nome:      user.nome + (user.sobrenome ? ' ' + user.sobrenome : ''),
    empresa:   user.empresa,
    plano:     user.plano,
    role:      user.role,
    isDemo:    user.isDemo,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + SESSION_DURATION,
  }
  user.lastLogin = new Date().toISOString()
  return token
}

/** Register a new user (from onboarding) */
export async function registerUser(params: {
  email: string; pwd: string; nome: string; sobrenome: string
  empresa: string; plano: string; tel: string; setor: string; porte: string
}): Promise<{ ok: boolean; error?: string; user?: RegisteredUser }> {
  const emailKey = params.email.toLowerCase().trim()

  // Check demo emails
  if (DEMO_USERS.find(d => d.email === emailKey)) {
    return { ok: false, error: 'Este e-mail é reservado para a conta de demonstração.' }
  }
  if (registeredUsers[emailKey]) {
    return { ok: false, error: 'E-mail já cadastrado.' }
  }

  const pwdHash = await hashPassword(params.pwd)
  const userId  = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  const today   = new Date().toISOString().split('T')[0]
  const trialEnd = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]

  const user: RegisteredUser = {
    userId, email: emailKey,
    pwdHash, nome: params.nome, sobrenome: params.sobrenome,
    empresa: params.empresa, plano: params.plano,
    role: 'admin', tel: params.tel,
    setor: params.setor, porte: params.porte,
    isDemo: false,
    createdAt: today,
    lastLogin: null,
    trialStart: today,
    trialEnd,
  }

  registeredUsers[emailKey] = user

  // Create empty tenant for this user
  getTenantData(userId)

  // Note: masterClients is now populated dynamically in master.ts
  // by reading registeredUsers directly when the master panel is accessed.

  return { ok: true, user }
}

/** Login — returns token or error */
export async function loginUser(email: string, pwd: string): Promise<{ ok: boolean; error?: string; token?: string; session?: UserSession }> {
  const emailKey = email.toLowerCase().trim()

  // Check demo accounts
  const demoUser = DEMO_USERS.find(d => d.email === emailKey)
  if (demoUser) {
    // Demo: any password works (or 'demo123' / 'senha123')
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
    const token = await createSession(demoReg)
    return { ok: true, token, session: sessions[token] }
  }

  const user = registeredUsers[emailKey]
  if (!user) return { ok: false, error: 'E-mail não encontrado.' }

  const hash = await hashPassword(pwd)
  if (hash !== user.pwdHash) return { ok: false, error: 'Senha incorreta.' }

  const token = await createSession(user)
  return { ok: true, token, session: sessions[token] }
}
