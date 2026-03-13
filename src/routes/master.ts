import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { registeredUsers, DEMO_USERS, loadAllUsersFromDB } from '../userStore'
import { ALL_MODULES, MODULE_LABELS } from '../modules'
import { getEmpresaModuleAccess } from '../moduleAccess'
import type { AccessLevel, ModuleKey } from '../modules'

const app = new Hono<{ Bindings: { DB: D1Database } }>()

// ── Constantes ─────────────────────────────────────────────────────────────────
const MASTER_SESSION_KEY = 'master_session'
const SESSION_DURATION   = 60 * 60 * 8 // 8h em segundos
const MASTER_JWT_SECRET  = 'syncrus-master-jwt-secret-2025-xK9pLmN3'
const MASTER_PWD_SALT    = 'syncrus-master-salt-2025'

// ── Escape para uso seguro em HTML e atributos HTML ────────────────────────────
function escapeHtml(str: any): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Serializa um valor como JSON seguro para injeção dentro de uma tag <script>.
 * Escapa `</` para evitar terminação prematura da tag, e os separadores de linha
 * Unicode U+2028/U+2029 que são inválidos em string literals JavaScript.
 */
function safeJsonForScriptTag(value: unknown): string {
  // JSON.stringify(undefined) returns undefined (not a string); coerce to null for safety
  return JSON.stringify(value ?? null)
    .replace(/<\//g, '<\\/')      // prevent premature </script> tag termination
    .replace(/\u2028/g, '\\u2028') // U+2028 Line Separator invalid in JS string literals (ES2018-)
    .replace(/\u2029/g, '\\u2029') // U+2029 Paragraph Separator same
}

// ── Utilidades ─────────────────────────────────────────────────────────────────
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── JWT simples baseado em HMAC-SHA256 (stateless, funciona em Workers) ────────
async function signToken(payload: Record<string, any>): Promise<string> {
  const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body    = btoa(JSON.stringify(payload))
  const sigData = new TextEncoder().encode(header + '.' + body)
  const keyData = new TextEncoder().encode(MASTER_JWT_SECRET)
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigBuf  = await crypto.subtle.sign('HMAC', key, sigData)
  const sig     = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
  return header + '.' + body + '.' + sig
}

async function verifyToken(token: string): Promise<Record<string, any> | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const sigData = new TextEncoder().encode(header + '.' + body)
    const keyData = new TextEncoder().encode(MASTER_JWT_SECRET)
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const sigBuf = Uint8Array.from(atob(sig), c => c.charCodeAt(0))
    const valid  = await crypto.subtle.verify('HMAC', key, sigBuf, sigData)
    if (!valid) return null
    const payload = JSON.parse(atob(body))
    if (payload.exp && Date.now() / 1000 > payload.exp) return null
    return payload
  } catch { return null }
}

// ── Usuários master (em memória — cold start recria o default) ─────────────────
const masterUsers: Array<{
  id: string; email: string; pwdHash: string; name: string;
  createdAt: string; lastLogin: string | null; active: boolean; role: string
}> = []

let initialized = false
async function ensureInit() {
  if (initialized) return
  initialized = true
  const hash = await sha256('minhasenha' + MASTER_PWD_SALT)
  masterUsers.push({
    id: 'master1',
    email: 'master@syncrus.com.br',
    pwdHash: hash,
    name: 'Master Admin',
    createdAt: new Date().toISOString().split('T')[0],
    lastLogin: null,
    active: true,
    role: 'superadmin'
  })
}

// ── Tipo de cliente master ─────────────────────────────────────────────────────
type MasterClient = {
  id: string; empresa: string; fantasia: string; cnpj: string; setor: string; porte: string;
  responsavel: string; email: string; tel: string; plano: string; billing: string; valor: number;
  status: string; trialStart: string | null; trialEnd: string | null;
  empresas: number; usuarios: number; plantas: number;
  criadoEm: string; ultimoAcesso: string;
  modulos: string[]; cnpjsExtras: number;
  pagamentos: Array<{ mes: string; valor: number; status: string; data: string }>;
  obs: string
}

// Cache de clientes — limpo e reconstruído a cada GET / a partir do D1
// Mantido globalmente apenas para que as routes de API (migrate-plan, save-obs, etc.)
// possam ler/escrever dados temporários de configuração entre requests
const masterClients: MasterClient[] = []

const auditLog: Array<{ ts: string; user: string; action: string; detail: string }> = []

const PLANS: Record<string, { label: string; monthlyBase: number; color: string; bg: string }> = {
  starter:      { label: 'Starter',      monthlyBase: 299,  color: '#27AE60', bg: '#f0fdf4' },
  professional: { label: 'Professional', monthlyBase: 599,  color: '#2980B9', bg: '#e8f4fd' },
  enterprise:   { label: 'Enterprise',   monthlyBase: 1490, color: '#7c3aed', bg: '#f5f3ff' },
}

// ── Auth helpers ───────────────────────────────────────────────────────────────
async function isAuthenticated(c: any): Promise<{ email: string; name: string } | null> {
  const token = getCookie(c, MASTER_SESSION_KEY)
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return { email: payload.email, name: payload.name }
}

function loginRedirect() {
  return `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/master/login"></head>
  <body style="background:#0f172a;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;">Redirecionando...</body></html>`
}

// ── Layout exclusivo Master (SEM sidebar da plataforma) ───────────────────────
function masterLayout(title: string, content: string, loggedName: string = ''): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Master Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f3f5; margin: 0; padding: 0; }
    .master-topbar { background: linear-gradient(135deg, #1a1035, #2d1b69); border-bottom: 1px solid rgba(124,58,237,0.3); padding: 0 24px; height: 56px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 12px rgba(0,0,0,0.25); }
    .master-main { max-width: 1400px; margin: 0 auto; padding: 24px; }
    .card { background: white; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
    .form-control { width: 100%; padding: 9px 12px; border: 1.5px solid #d1d5db; border-radius: 8px; font-size: 13px; outline: none; transition: border 0.2s; }
    .form-control:focus { border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124,58,237,0.1); }
    .form-label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 5px; }
    .btn { display: inline-flex; align-items: center; gap: 5px; padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: none; transition: all 0.15s; }
    .btn-primary { background: #1B4F72; color: white; }
    .btn-primary:hover { background: #154360; }
    .btn-secondary { background: #f1f3f5; color: #374151; border: 1px solid #e9ecef; }
    .btn-secondary:hover { background: #e9ecef; }
    .btn-sm { padding: 5px 10px; font-size: 11px; }
    .mbadge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; gap: 4px; }
    .moverlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 500; align-items: center; justify-content: center; padding: 20px; }
    .moverlay.open { display: flex; }
    .mmodal { background: white; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); width: 100%; animation: mIn 0.22s ease; }
    @keyframes mIn { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
    .mtab { padding: 8px 16px; font-size: 12px; font-weight: 600; border: none; background: none; cursor: pointer; color: #6c757d; border-bottom: 2px solid transparent; }
    .mtab.active { color: #7c3aed; border-color: #7c3aed; }
    .panel-tab { padding: 10px 20px; font-size: 13px; font-weight: 600; border: none; background: none; cursor: pointer; color: #6c757d; border-bottom: 3px solid transparent; transition: all 0.15s; white-space: nowrap; }
    .panel-tab.active { color: #7c3aed; border-color: #7c3aed; background: rgba(124,58,237,0.04); }
    .abtn { background: none; border: 1px solid #e9ecef; border-radius: 6px; padding: 5px 8px; font-size: 11px; cursor: pointer; transition: all 0.15s; display: inline-flex; align-items: center; gap: 3px; position: relative; }
    .abtn:hover { background: #f1f3f5; border-color: #adb5bd; }
    /* Tooltip nativo via title — e tooltip customizado */
    .abtn .tooltip-text { visibility: hidden; opacity: 0; background: #1a1a2e; color: white; font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 5px; position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); white-space: nowrap; transition: opacity 0.15s; pointer-events: none; z-index: 999; }
    .abtn .tooltip-text::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 4px solid transparent; border-top-color: #1a1a2e; }
    .abtn:hover .tooltip-text { visibility: visible; opacity: 1; }
    .client-row { transition: background 0.1s; }
    .client-row:hover { background: #f8f9fa !important; }
    .master-kpi { background: white; border-radius: 12px; padding: 18px 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
    .empty-state { text-align: center; padding: 60px 20px; color: #9ca3af; }
    .empty-state i { font-size: 48px; display: block; margin-bottom: 16px; opacity: 0.3; }
    .empty-state h3 { font-size: 16px; font-weight: 700; color: #374151; margin: 0 0 8px; }
    .empty-state p { font-size: 13px; margin: 0; }
  </style>
</head>
<body>
  <!-- Topbar própria do Master (sem sidebar) -->
  <div class="master-topbar">
    <div style="display:flex;align-items:center;gap:14px;">
      <div style="width:32px;height:32px;background:linear-gradient(135deg,#7c3aed,#5b21b6);border-radius:9px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(124,58,237,0.4);">
        <i class="fas fa-shield-alt" style="color:white;font-size:14px;"></i>
      </div>
      <div>
        <div style="font-size:14px;font-weight:800;color:white;letter-spacing:-0.3px;">Master Admin</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.45);font-weight:500;">PCP Planner — Painel Restrito</div>
      </div>
      <div style="margin-left:16px;display:flex;align-items:center;gap:6px;background:rgba(124,58,237,0.2);border:1px solid rgba(124,58,237,0.35);border-radius:20px;padding:3px 12px;">
        <div style="width:6px;height:6px;background:#4ade80;border-radius:50%;"></div>
        <span style="font-size:11px;color:rgba(255,255,255,0.8);font-weight:600;">AMBIENTE DE CONTROLE</span>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;">
      ${loggedName ? `<span style="font-size:12px;color:rgba(255,255,255,0.6);"><i class="fas fa-user-circle" style="margin-right:5px;color:#a78bfa;"></i>${loggedName}</span>` : ''}
      <a href="/" style="font-size:12px;color:rgba(255,255,255,0.5);text-decoration:none;padding:5px 10px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;transition:all 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">
        <i class="fas fa-external-link-alt" style="margin-right:4px;font-size:10px;"></i>Plataforma
      </a>
      <a href="/master/logout" style="font-size:12px;color:#fca5a5;text-decoration:none;padding:5px 12px;border:1px solid rgba(239,68,68,0.3);border-radius:6px;background:rgba(239,68,68,0.1);transition:all 0.15s;" onmouseover="this.style.background='rgba(239,68,68,0.2)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">
        <i class="fas fa-sign-out-alt" style="margin-right:4px;"></i>Sair
      </a>
    </div>
  </div>

  <!-- Conteúdo principal -->
  <div class="master-main">
    ${content}
  </div>

  <!-- Toast container -->
  <div id="toastContainer" style="position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;"></div>

  <script>
  function showToast(msg, type) {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.style.cssText = 'padding:12px 20px;border-radius:10px;font-size:13px;font-weight:700;color:white;background:'+(type==='success'?'#16a34a':'#dc2626')+';box-shadow:0 4px 20px rgba(0,0,0,0.25);animation:mIn 0.3s ease;pointer-events:auto;display:flex;align-items:center;gap:8px;';
    t.innerHTML = '<i class="fas '+(type==='success'?'fa-check-circle':'fa-exclamation-circle')+'"></i> '+msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }
  </script>
</body>
</html>`
}

// ── Rota: GET /login ───────────────────────────────────────────────────────────
app.get('/login', async (c) => {
  if (await isAuthenticated(c)) return c.redirect('/master')
  const err = c.req.query('err') || ''
  const errMsg = err === '1' ? 'E-mail ou senha incorretos.' :
                 err === '2' ? 'Usuário inativo. Contate o administrador.' :
                 err === '3' ? 'Sessão expirada. Faça login novamente.' : ''
  return c.html(masterLoginPage(errMsg))
})

// ── Rota: POST /login ──────────────────────────────────────────────────────────
app.post('/login', async (c) => {
  await ensureInit()
  const body = await c.req.parseBody()
  const email = (body['email'] as string || '').trim().toLowerCase()
  const pwd   = (body['pwd']   as string || '').trim()

  const user = masterUsers.find(u => u.email === email)
  if (!user) return c.redirect('/master/login?err=1')

  const inputHash = await sha256(pwd + MASTER_PWD_SALT)
  if (user.pwdHash !== inputHash) return c.redirect('/master/login?err=1')
  if (!user.active) return c.redirect('/master/login?err=2')

  // Gera JWT stateless (funciona em Cloudflare Workers multi-isolate)
  const jwt = await signToken({
    email: user.email,
    name: user.name,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION
  })

  user.lastLogin = new Date().toISOString()
  auditLog.unshift({ ts: new Date().toISOString(), user: user.name, action: 'LOGIN', detail: 'Login bem-sucedido' })

  setCookie(c, MASTER_SESSION_KEY, jwt, {
    maxAge: SESSION_DURATION, path: '/master', httpOnly: true, sameSite: 'Lax'
  })

  return c.redirect('/master')
})

// ── Rota: GET /logout ──────────────────────────────────────────────────────────
app.get('/logout', (c) => {
  deleteCookie(c, MASTER_SESSION_KEY, { path: '/master' })
  return c.redirect('/master/login')
})

// ── API: POST /api/add-client ──────────────────────────────────────────────────
app.post('/api/add-client', async (c) => {
  const auth = await isAuthenticated(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  await ensureInit()
  const body = await c.req.json() as any
  const actor = masterUsers.find(u => u.email === auth.email) || { name: auth.name }

  const today = new Date().toISOString().split('T')[0]
  const trialEnd = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  const newId = 'cli' + Date.now()

  const nc = {
    id: newId,
    empresa:     body.empresa || '',
    fantasia:    body.fantasia || body.empresa || '',
    cnpj:        body.cnpj || '',
    setor:       body.setor || '',
    porte:       body.porte || '',
    responsavel: body.responsavel || '',
    email:       body.email || '',
    tel:         body.tel || '',
    plano:       body.plano || 'starter',
    billing:     body.status === 'active' ? 'monthly' : 'trial',
    valor:       body.status === 'active' ? (PLANS[body.plano]?.monthlyBase || 299) : 0,
    status:      body.status || 'trial',
    trialStart:  body.status === 'trial' ? today : null,
    trialEnd:    body.status === 'trial' ? trialEnd : null,
    empresas: 1, usuarios: 1, plantas: 0,
    criadoEm: today, ultimoAcesso: today,
    modulos: [], cnpjsExtras: 0, pagamentos: [],
    obs: body.obs || ''
  }

  masterClients.push(nc)
  auditLog.unshift({ ts: new Date().toISOString(), user: actor?.name || auth.name, action: 'ADD_CLIENT', detail: `Cliente "${nc.empresa}" adicionado` })
  return c.json({ ok: true, id: newId })
})

// ── API: POST /api/migrate-plan ────────────────────────────────────────────────
app.post('/api/migrate-plan', async (c) => {
  const auth = await isAuthenticated(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  await ensureInit()
  const body = await c.req.json() as any
  const actor = masterUsers.find(u => u.email === auth.email) || { name: auth.name }

  const cli = masterClients.find(c2 => c2.id === body.clientId)
  if (!cli) return c.json({ error: 'Client not found' }, 404)

  const oldPlan = cli.plano
  if (body.acao === 'change_plan') {
    cli.plano = body.plano || cli.plano
    cli.billing = body.billing || 'monthly'
    cli.status = 'active'
    cli.valor = PLANS[cli.plano]?.monthlyBase || 299
    cli.trialEnd = null
  } else if (body.acao === 'extend_trial') {
    cli.trialEnd = body.trialEnd
    cli.status = 'trial'
  } else if (body.acao === 'activate') {
    cli.status = 'active'
    cli.plano = body.plano || cli.plano
    cli.billing = body.billing || 'monthly'
    cli.valor = PLANS[cli.plano]?.monthlyBase || 299
    cli.trialEnd = null
  } else if (body.acao === 'suspend') {
    cli.status = 'inactive'
  } else if (body.acao === 'reactivate') {
    cli.status = 'active'
  }

  auditLog.unshift({ ts: new Date().toISOString(), user: actor?.name || auth.name, action: 'MIGRATE_PLAN', detail: `${cli.fantasia}: ${body.acao} | ${oldPlan} → ${cli.plano} | ${body.motivo}` })
  return c.json({ ok: true })
})

// ── API: POST /api/save-obs ────────────────────────────────────────────────────
app.post('/api/save-obs', async (c) => {
  if (!await isAuthenticated(c)) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json() as any
  const cli = masterClients.find(c2 => c2.id === body.clientId)
  if (cli) cli.obs = body.obs || ''
  return c.json({ ok: true })
})

// ── API: POST /api/add-master-user ─────────────────────────────────────────────
app.post('/api/add-master-user', async (c) => {
  const auth = await isAuthenticated(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  await ensureInit()
  const body = await c.req.json() as any
  const actor = masterUsers.find(u => u.email === auth.email) || { name: auth.name }

  if (masterUsers.find(u => u.email === body.email)) {
    return c.json({ error: 'E-mail já cadastrado' }, 400)
  }

  const pwdHash = await sha256((body.pwd || 'senha123') + MASTER_PWD_SALT)
  masterUsers.push({
    id: 'mu' + Date.now(),
    email: body.email,
    pwdHash,
    name: body.name,
    createdAt: new Date().toISOString().split('T')[0],
    lastLogin: null,
    active: true,
    role: body.role || 'viewer'
  })

  auditLog.unshift({ ts: new Date().toISOString(), user: actor?.name || auth.name, action: 'ADD_MASTER_USER', detail: `Novo usuário: ${body.name} (${body.email})` })
  return c.json({ ok: true })
})

// ── API: POST /api/toggle-master-user ─────────────────────────────────────────
app.post('/api/toggle-master-user', async (c) => {
  if (!await isAuthenticated(c)) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json() as any
  const u = masterUsers.find(u2 => u2.id === body.id)
  if (u) u.active = !u.active
  return c.json({ ok: true, active: u?.active })
})

// ── API: GET /api/backup ───────────────────────────────────────────────────────
// Exports all tenant data from D1 (protected: master admin only).
app.get('/api/backup', async (c) => {
  if (!await isAuthenticated(c)) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env?.DB || null
  if (!db) return c.json({ error: 'Database not available' }, 503)

  // Explicitly allowlisted table names — never sourced from user input
  const ALLOWED_TABLES = [
    'registered_users', 'sessions', 'products', 'suppliers', 'stock_items',
    'plants', 'machines', 'workbenches', 'supplier_categories',
    'separation_orders', 'stock_exits',
  ] as const

  const backup: Record<string, any[]> = {}
  for (const table of ALLOWED_TABLES) {
    try {
      const res = await db.prepare(`SELECT * FROM ${table}`).all()
      backup[table] = res.results || []
    } catch (e) {
      console.error(`[BACKUP] Failed to export table ${table}:`, e)
      backup[table] = []
    }
  }

  return c.json({
    ok: true,
    exportedAt: new Date().toISOString(),
    tables: backup,
  })
})

// ── API: GET /api/client/:clientId/modules ────────────────────────────────────
app.get('/api/client/:clientId/modules', async (c) => {
  const auth = await isAuthenticated(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env?.DB || null
  const clientId = c.req.param('clientId')

  const states: Record<string, AccessLevel> = {}
  for (const mod of ALL_MODULES) {
    states[mod] = await getEmpresaModuleAccess(db, clientId, mod)
  }
  return c.json({ ok: true, modules: states })
})

// ── API: POST /api/client/:clientId/modules ───────────────────────────────────
app.post('/api/client/:clientId/modules', async (c) => {
  const auth = await isAuthenticated(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env?.DB || null
  if (!db) return c.json({ error: 'Database not available' }, 503)
  const clientId = c.req.param('clientId')
  const body = await c.req.json() as Record<string, string>

  const now = new Date().toISOString()
  const allowed: AccessLevel[] = ['allowed', 'read_only', 'denied']

  for (const mod of ALL_MODULES) {
    const level = (body[mod] || 'allowed') as AccessLevel
    if (!allowed.includes(level)) continue
    const id = `em_${clientId}_${mod}`
    try {
      await db.prepare(`
        INSERT INTO empresa_modules (id, empresa_id, module_key, access_level, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(empresa_id, module_key) DO UPDATE SET
          access_level = excluded.access_level,
          updated_at   = excluded.updated_at,
          updated_by   = excluded.updated_by
      `).bind(id, clientId, mod, level, now, auth.email).run()
    } catch (e) {
      console.error(`[MASTER][MODULES] Falha ao salvar módulo ${mod} para ${clientId}:`, e)
      return c.json({ ok: false, error: 'Erro ao salvar módulos.' }, 500)
    }
  }

  auditLog.unshift({ ts: now, user: auth.name, action: 'SET_MODULES', detail: `Módulos atualizados para cliente ${clientId}` })
  return c.json({ ok: true })
})

// ── Rota: GET /client/:clientId ────────────────────────────────────────────────
app.get('/client/:clientId', async (c) => {
  await ensureInit()
  const auth = await isAuthenticated(c)
  if (!auth) return c.html(loginRedirect())
  const db = c.env?.DB || null
  const clientId = c.req.param('clientId')

  // Find client in masterClients (may be empty after cold start; refresh from DB)
  if (masterClients.length === 0 && db) {
    try {
      const dbUsers = await loadAllUsersFromDB(db)
      const ownerUsers = dbUsers.filter(u => !u.ownerId)
      const memberCount: Record<string, number> = {}
      for (const m of dbUsers.filter(u => u.ownerId)) {
        if (m.ownerId) memberCount[m.ownerId] = (memberCount[m.ownerId] || 0) + 1
      }
      for (const u of ownerUsers) {
        if (u.isDemo) continue
        masterClients.push({
          id: u.userId, empresa: u.empresa, fantasia: u.empresa,
          cnpj: '', setor: u.setor, porte: u.porte,
          responsavel: u.nome + (u.sobrenome ? ' ' + u.sobrenome : ''),
          email: u.email, tel: u.tel,
          plano: u.plano, billing: 'trial', valor: 0, status: 'trial',
          trialStart: u.trialStart, trialEnd: u.trialEnd,
          empresas: 1, usuarios: 1 + (memberCount[u.userId] || 0), plantas: 0,
          criadoEm: u.createdAt, ultimoAcesso: u.lastLogin || u.createdAt,
          modulos: [], cnpjsExtras: 0, pagamentos: [], obs: ''
        })
      }
    } catch {}
  }

  const cli = masterClients.find(c2 => c2.id === clientId)
  if (!cli) {
    return c.html(masterLayout('Cliente não encontrado',
      `<div class="empty-state"><i class="fas fa-building"></i><h3>Cliente não encontrado</h3><p>ID: ${clientId}</p><a href="/master" class="btn btn-secondary" style="margin-top:16px;"><i class="fas fa-arrow-left"></i> Voltar</a></div>`,
      auth.name))
  }

  // Load current module states
  const moduleStates: Record<string, AccessLevel> = {}
  for (const mod of ALL_MODULES) {
    moduleStates[mod] = await getEmpresaModuleAccess(db, clientId, mod)
  }

  const pl = PLANS[cli.plano] || PLANS.starter
  const statusMap: Record<string, { label: string; color: string; bg: string }> = {
    active:   { label: 'Ativo',   color: '#16a34a', bg: '#f0fdf4' },
    trial:    { label: 'Trial',   color: '#d97706', bg: '#fffbeb' },
    inactive: { label: 'Inativo', color: '#6c757d', bg: '#e9ecef' },
  }
  const st = statusMap[cli.status] || statusMap.inactive

  const accessColors: Record<AccessLevel, { color: string; bg: string; label: string }> = {
    allowed:   { color: '#16a34a', bg: '#f0fdf4', label: 'Liberado' },
    read_only: { color: '#d97706', bg: '#fffbeb', label: 'Somente Leitura' },
    denied:    { color: '#dc2626', bg: '#fef2f2', label: 'Negado' },
  }

  const content = `
  <!-- Cabeçalho do cliente -->
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;flex-wrap:wrap;">
    <a href="/master" style="display:flex;align-items:center;gap:6px;font-size:12px;color:#6c757d;text-decoration:none;padding:6px 12px;border:1px solid #e9ecef;border-radius:8px;background:white;transition:all 0.15s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
      <i class="fas fa-arrow-left"></i> Voltar
    </a>
    <div>
      <div style="font-size:20px;font-weight:800;color:#1B4F72;">${cli.fantasia || cli.empresa}</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${cli.email} · ID: <code style="font-size:11px;background:#f1f3f5;padding:1px 5px;border-radius:4px;">${cli.id}</code></div>
    </div>
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <span class="mbadge" style="background:${pl.bg};color:${pl.color};">${pl.label}</span>
      <span class="mbadge" style="background:${st.bg};color:${st.color};">${st.label}</span>
    </div>
  </div>

  <!-- Abas -->
  <div style="display:flex;border-bottom:2px solid #e9ecef;margin-bottom:20px;overflow-x:auto;background:white;border-radius:12px 12px 0 0;padding:0 8px;">
    <button class="panel-tab active" id="tabInfo" data-ptab="info"><i class="fas fa-info-circle" style="margin-right:6px;"></i>Informações</button>
    <button class="panel-tab" id="tabMod" data-ptab="modulos"><i class="fas fa-th-large" style="margin-right:6px;"></i>Módulos</button>
    <button class="panel-tab" id="tabPag" data-ptab="pagamentos"><i class="fas fa-receipt" style="margin-right:6px;"></i>Pagamentos</button>
    <button class="panel-tab" id="tabAtiv" data-ptab="atividade"><i class="fas fa-history" style="margin-right:6px;"></i>Atividade</button>
  </div>

  <!-- Painel: Informações -->
  <div id="panelInfo" class="card" style="padding:22px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">
      ${[
        ['Empresa',     cli.empresa],
        ['Fantasia',    cli.fantasia || '—'],
        ['CNPJ',        cli.cnpj    || '—'],
        ['Setor',       cli.setor   || '—'],
        ['Porte',       cli.porte   || '—'],
        ['Responsável', cli.responsavel],
        ['E-mail',      `<a href="mailto:${cli.email}" style="color:#2980B9;">${cli.email}</a>`],
        ['Telefone',    cli.tel || '—'],
        ['Plano',       `<span class="mbadge" style="background:${pl.bg};color:${pl.color};">${pl.label}</span>`],
        ['Status',      `<span class="mbadge" style="background:${st.bg};color:${st.color};">${st.label}</span>`],
        ['Criado em',   new Date(cli.criadoEm + 'T12:00:00').toLocaleDateString('pt-BR')],
        ['Último acesso', new Date(cli.ultimoAcesso + 'T12:00:00').toLocaleDateString('pt-BR')],
      ].map(([label, val]) =>
        `<div style="background:#f8f9fa;border-radius:8px;padding:9px 11px;">
          <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:2px;">${label}</div>
          <div style="font-size:13px;color:#374151;font-weight:500;">${val}</div>
        </div>`
      ).join('')}
    </div>
    ${cli.obs ? `<div style="margin-top:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;"><div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;margin-bottom:3px;">Observações</div><div style="font-size:13px;color:#374151;">${escapeHtml(cli.obs)}</div></div>` : ''}
  </div>

  <!-- Painel: Módulos -->
  <div id="panelMod" class="card" style="padding:22px;display:none;">
    <div style="font-size:14px;font-weight:700;color:#1B4F72;margin-bottom:16px;">
      <i class="fas fa-th-large" style="margin-right:8px;color:#7c3aed;"></i>Controle de Acesso por Módulo
    </div>
    <div style="font-size:12px;color:#6c757d;margin-bottom:20px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 14px;">
      <i class="fas fa-info-circle" style="color:#0284c7;margin-right:6px;"></i>
      <strong>Liberado</strong>: acesso total &nbsp;·&nbsp; <strong>Somente Leitura</strong>: cliente pode visualizar mas não editar &nbsp;·&nbsp; <strong>Negado</strong>: cliente não pode editar (writes bloqueados pelo servidor)
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;" id="modulesGrid">
      ${ALL_MODULES.map(mod => {
        const level = moduleStates[mod] || 'allowed'
        const ac = accessColors[level]
        return `<div style="background:#f8f9fa;border-radius:10px;padding:14px;border:1px solid #e9ecef;">
          <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:10px;">
            <i class="fas fa-cube" style="color:#7c3aed;margin-right:7px;font-size:11px;"></i>${MODULE_LABELS[mod]}
          </div>
          <select class="form-control module-select" data-mod="${mod}" style="font-size:12px;padding:7px 10px;">
            <option value="allowed"   ${level === 'allowed'   ? 'selected' : ''}>✅ Liberado</option>
            <option value="read_only" ${level === 'read_only' ? 'selected' : ''}>👁️ Somente Leitura</option>
            <option value="denied"    ${level === 'denied'    ? 'selected' : ''}>🚫 Negado</option>
          </select>
          <div class="mod-badge" style="margin-top:8px;display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:${ac.bg};color:${ac.color};">${ac.label}</div>
        </div>`
      }).join('')}
    </div>
    <div style="margin-top:20px;display:flex;gap:10px;align-items:center;">
      <button id="btnSalvarModulos" class="btn btn-primary" style="background:#7c3aed;">
        <i class="fas fa-save"></i> Salvar Módulos
      </button>
      <span id="modSaveStatus" style="font-size:12px;color:#6c757d;"></span>
    </div>
  </div>

  <!-- Painel: Pagamentos -->
  <div id="panelPag" class="card" style="padding:22px;display:none;">
    ${cli.pagamentos && cli.pagamentos.length > 0
      ? `<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:#f8f9fa;">
          <th style="padding:8px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Período</th>
          <th style="padding:8px;text-align:right;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Valor</th>
          <th style="padding:8px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Status</th>
          <th style="padding:8px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Data</th>
        </tr></thead><tbody>${cli.pagamentos.map(p => {
          const sc = p.status === 'pago' ? '#16a34a' : '#dc2626', sb = p.status === 'pago' ? '#f0fdf4' : '#fef2f2'
          return `<tr style="border-bottom:1px solid #f1f3f5;">
            <td style="padding:8px;font-weight:600;color:#374151;">${p.mes}</td>
            <td style="padding:8px;text-align:right;font-weight:700;color:#1B4F72;">R$ ${p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td style="padding:8px;text-align:center;"><span class="mbadge" style="background:${sb};color:${sc};">${p.status}</span></td>
            <td style="padding:8px;color:#6c757d;">${p.data}</td></tr>`
        }).join('')}</tbody></table>`
      : `<div class="empty-state"><i class="fas fa-receipt"></i><h3>Nenhum pagamento registrado</h3></div>`
    }
  </div>

  <!-- Painel: Atividade -->
  <div id="panelAtiv" class="card" style="padding:22px;display:none;">
    <div style="display:flex;flex-direction:column;gap:0;">
      ${[
        { icon: 'fa-user-plus', color: '#27AE60', desc: 'Conta criada', date: cli.criadoEm, detail: 'Plano ' + (PLANS[cli.plano]?.label || cli.plano) },
        { icon: 'fa-sign-in-alt', color: '#2980B9', desc: 'Último acesso', date: cli.ultimoAcesso, detail: 'Usuário: ' + cli.responsavel },
        ...(cli.status === 'trial' ? [{ icon: 'fa-clock', color: '#d97706', desc: 'Trial ativo', date: cli.trialStart || cli.criadoEm, detail: 'Expira: ' + cli.trialEnd }] : []),
      ].map(ev => `<div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #f1f3f5;">
        <div style="width:32px;height:32px;border-radius:50%;background:#f1f3f5;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <i class="fas ${ev.icon}" style="font-size:11px;color:${ev.color};"></i></div>
        <div><div style="font-size:13px;font-weight:600;color:#374151;">${ev.desc}</div>
        <div style="font-size:11px;color:#9ca3af;">${new Date(ev.date + 'T12:00:00').toLocaleDateString('pt-BR')} · ${ev.detail}</div></div></div>`
      ).join('')}
    </div>
  </div>

  <script>
  const CLIENT_ID = ${safeJsonForScriptTag(clientId)};

  // Aba switching
  document.addEventListener('click', function(e) {
    const tabBtn = e.target.closest('[data-ptab]');
    if (tabBtn) {
      const tab = tabBtn.dataset.ptab;
      ['info','modulos','pagamentos','atividade'].forEach(t => {
        const panel = document.getElementById('panel' + t.charAt(0).toUpperCase() + t.slice(1));
        const btn   = document.getElementById('tab' + ({ info:'Info', modulos:'Mod', pagamentos:'Pag', atividade:'Ativ' })[t]);
        if (panel) panel.style.display = (t === tab) ? '' : 'none';
        if (btn)   btn.className = 'panel-tab' + (t === tab ? ' active' : '');
      });
    }
  });

  // Atualizar badge ao mudar select
  document.querySelectorAll('.module-select').forEach(function(sel) {
    sel.addEventListener('change', function() {
      const colors = {
        allowed:   { color: '#16a34a', bg: '#f0fdf4', label: 'Liberado' },
        read_only: { color: '#d97706', bg: '#fffbeb', label: 'Somente Leitura' },
        denied:    { color: '#dc2626', bg: '#fef2f2', label: 'Negado' },
      };
      const badge = sel.parentElement.querySelector('.mod-badge');
      const ac = colors[sel.value] || colors.allowed;
      if (badge) {
        badge.style.background = ac.bg;
        badge.style.color = ac.color;
        badge.textContent = ac.label;
      }
    });
  });

  // Salvar módulos
  document.getElementById('btnSalvarModulos').addEventListener('click', async function() {
    const btn = this;
    const status = document.getElementById('modSaveStatus');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    if (status) status.textContent = '';

    const payload = {};
    document.querySelectorAll('.module-select').forEach(function(sel) {
      payload[sel.dataset.mod] = sel.value;
    });

    try {
      const res = await fetch('/master/api/client/' + CLIENT_ID + '/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        showToast('✅ Módulos salvos com sucesso!', 'success');
        if (status) status.textContent = 'Salvo às ' + new Date().toLocaleTimeString('pt-BR');
      } else {
        showToast('Erro ao salvar módulos.', 'error');
      }
    } catch {
      showToast('Erro de conexão.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Salvar Módulos';
    }
  });
  </script>
  `

  return c.html(masterLayout(`Cliente: ${cli.fantasia || cli.empresa}`, content, auth.name))
})

// ── Rota principal: GET / ──────────────────────────────────────────────────────
app.get('/', async (c) => {
  await ensureInit()
  const auth = await isAuthenticated(c)
  if (!auth) return c.html(loginRedirect())
  const db = c.env?.DB || null

  // Limpar e reconstruir masterClients a cada request a partir do D1
  // Isto evita acúmulo de duplicatas entre requests no mesmo isolate
  masterClients.length = 0

  // Carregar usuários do D1 (garante lista sempre atualizada após deploy/cold-start)
  // IMPORTANTE: owner_id = NULL → conta principal (empresa)
  //             owner_id != NULL → membro convidado (pertence à empresa do owner)
  if (db) {
    try {
      const dbUsers = await loadAllUsersFromDB(db)

      // Separa donos (owner_id = null) de membros convidados
      const ownerUsers  = dbUsers.filter(u => !u.ownerId)
      const memberUsers = dbUsers.filter(u =>  u.ownerId)

      // Mapa: ownerId → count de membros convidados
      const memberCount: Record<string, number> = {}
      for (const m of memberUsers) {
        if (m.ownerId) memberCount[m.ownerId] = (memberCount[m.ownerId] || 0) + 1
      }

      for (const u of ownerUsers) {
        if (u.isDemo) continue
        const extraMembers = memberCount[u.userId] || 0
        masterClients.push({
          id: u.userId,
          empresa: u.empresa, fantasia: u.empresa,
          cnpj: '', setor: u.setor, porte: u.porte,
          responsavel: u.nome + (u.sobrenome ? ' ' + u.sobrenome : ''),
          email: u.email, tel: u.tel,
          plano: u.plano, billing: 'trial', valor: 0,
          status: 'trial',
          trialStart: u.trialStart, trialEnd: u.trialEnd,
          empresas: 1,
          usuarios: 1 + extraMembers,  // dono + membros convidados
          plantas: 0,
          criadoEm: u.createdAt,
          ultimoAcesso: u.lastLogin || u.createdAt,
          modulos: [], cnpjsExtras: 0, pagamentos: [], obs: ''
        })
      }
    } catch {}
  } else {
    // Fallback: usar memória (dev local sem D1)
    for (const u of Object.values(registeredUsers)) {
      if (!u.isDemo && !u.ownerId) {
        masterClients.push({
          id: u.userId,
          empresa: u.empresa, fantasia: u.empresa,
          cnpj: '', setor: u.setor, porte: u.porte,
          responsavel: u.nome + (u.sobrenome ? ' ' + u.sobrenome : ''),
          email: u.email, tel: u.tel,
          plano: u.plano, billing: 'trial', valor: 0,
          status: 'trial',
          trialStart: u.trialStart, trialEnd: u.trialEnd,
          empresas: 1, usuarios: 1, plantas: 0,
          criadoEm: u.createdAt,
          ultimoAcesso: u.lastLogin || u.createdAt,
          modulos: [], cnpjsExtras: 0, pagamentos: [], obs: ''
        })
      }
    }
  }

  const clients = masterClients
  const totalClients    = clients.length
  const activeClients   = clients.filter(c2 => c2.status === 'active').length
  const trialClients    = clients.filter(c2 => c2.status === 'trial').length
  const inactiveClients = clients.filter(c2 => c2.status === 'inactive').length
  const totalUsers      = clients.reduce((a, c2) => a + c2.usuarios, 0)
  const totalEmpresas   = clients.reduce((a, c2) => a + c2.empresas, 0)
  const mrr = clients.filter(c2 => c2.status === 'active').reduce((acc, c2) => acc + c2.valor, 0)
  const arr = mrr * 12
  const planDist: Record<string, number> = { starter: 0, professional: 0, enterprise: 0 }
  clients.forEach(c2 => { if (planDist[c2.plano] !== undefined) planDist[c2.plano]++ })

  const loggedUser = masterUsers.find(u => u.email === auth.email)

  // ── Tabela de clientes ──────────────────────────────────────────────────────
  const clientRowsHtml = clients.length === 0
    ? `<div class="empty-state"><i class="fas fa-users"></i><h3>Nenhum cliente cadastrado</h3><p>Clique em "Novo Cliente" para adicionar o primeiro cliente da plataforma.</p></div>`
    : `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#f8f9fa;border-bottom:2px solid #e9ecef;">
          <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Empresa</th>
          <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Responsável</th>
          <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Plano</th>
          <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Status</th>
          <th style="padding:10px 14px;text-align:right;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Valor/mês</th>
          <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Emp.</th>
          <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Users</th>
          <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Cadastro</th>
          <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Ações</th>
        </tr></thead>
        <tbody id="clientTableBody">
          ${clients.map((cli) => {
            const pl = PLANS[cli.plano] || PLANS.starter
            const statusMap: Record<string,{label:string,color:string,bg:string}> = {
              active:   {label:'Ativo',   color:'#16a34a', bg:'#f0fdf4'},
              trial:    {label:'Trial',   color:'#d97706', bg:'#fffbeb'},
              inactive: {label:'Inativo', color:'#6c757d', bg:'#e9ecef'},
            }
            const st = statusMap[cli.status] || statusMap.inactive
            const daysLeft = cli.trialEnd ? Math.ceil((new Date(cli.trialEnd).getTime()-Date.now())/(1000*60*60*24)) : null
            const billingLabel: Record<string,string> = { monthly:'Mensal', annual:'Anual', trial:'Trial' }
            return `<tr class="client-row" data-status="${cli.status}" data-plano="${cli.plano}" data-search="${cli.empresa.toLowerCase()} ${cli.responsavel.toLowerCase()} ${cli.email.toLowerCase()}" style="border-bottom:1px solid #f1f3f5;">
              <td style="padding:10px 14px;">
                <div style="font-weight:700;color:#1B4F72;">${cli.fantasia || cli.empresa}</div>
                <div style="font-size:11px;color:#9ca3af;">${cli.email}</div>
                ${cli.obs ? `<div style="font-size:10px;color:#d97706;margin-top:2px;"><i class="fas fa-sticky-note" style="font-size:9px;"></i> ${escapeHtml(cli.obs.slice(0,40))}${cli.obs.length>40?'...':''}</div>` : ''}
              </td>
              <td style="padding:10px 14px;"><div style="font-weight:600;color:#374151;">${cli.responsavel}</div><div style="font-size:11px;color:#9ca3af;">${cli.tel||'—'}</div></td>
              <td style="padding:10px 14px;"><span class="mbadge" style="background:${pl.bg};color:${pl.color};">${pl.label}</span><div style="font-size:10px;color:#9ca3af;margin-top:3px;">${billingLabel[cli.billing]||cli.billing}</div></td>
              <td style="padding:10px 14px;text-align:center;">
                <span class="mbadge" style="background:${st.bg};color:${st.color};">${st.label}</span>
                ${cli.status==='trial' ? `<div style="font-size:10px;color:${(daysLeft||0)<=3?'#dc2626':'#d97706'};margin-top:2px;font-weight:700;">${(daysLeft||0)>0?(daysLeft)+' dias':'EXPIRADO'}</div>` : ''}
              </td>
              <td style="padding:10px 14px;text-align:right;font-weight:800;color:#1B4F72;">${cli.status==='active'?'R$ '+cli.valor.toLocaleString('pt-BR',{minimumFractionDigits:2}):'R$ —'}</td>
              <td style="padding:10px 14px;text-align:center;font-weight:700;color:#374151;">${cli.empresas}</td>
              <td style="padding:10px 14px;text-align:center;font-weight:700;color:#374151;">${cli.usuarios}</td>
              <td style="padding:10px 14px;font-size:11px;color:#374151;">${new Date(cli.criadoEm+'T12:00:00').toLocaleDateString('pt-BR')}</td>
              <td style="padding:10px 14px;text-align:center;">
                <div style="display:flex;gap:4px;justify-content:center;">
                  <a class="abtn" href="/master/client/${cli.id}" style="color:#2980B9;text-decoration:none;">
                    <i class="fas fa-external-link-alt"></i>
                    <span class="tooltip-text">Abrir página</span>
                  </a>
                  <button class="abtn" data-action="detail" data-id="${cli.id}" style="color:#2980B9;">
                    <i class="fas fa-eye"></i>
                    <span class="tooltip-text">Ver detalhes</span>
                  </button>
                  <button class="abtn" data-action="migrate" data-id="${cli.id}" style="color:#7c3aed;border-color:#ddd6fe;background:#f5f3ff;">
                    <i class="fas fa-exchange-alt"></i>
                    <span class="tooltip-text">Migrar plano</span>
                  </button>
                  <button class="abtn" data-action="obs" data-id="${cli.id}" style="color:#d97706;">
                    <i class="fas fa-sticky-note"></i>
                    <span class="tooltip-text">Anotações</span>
                  </button>
                  ${cli.status === 'active' ? '<button class="abtn" data-action="suspend" data-id="' + cli.id + '" style="color:#dc2626;border-color:#fecaca;"><i class="fas fa-ban"></i><span class="tooltip-text">Suspender</span></button>' : ''}
                  ${cli.status === 'inactive' ? '<button class="abtn" data-action="reactivate" data-id="' + cli.id + '" style="color:#16a34a;border-color:#86efac;"><i class="fas fa-check-circle"></i><span class="tooltip-text">Reativar</span></button>' : ''}
                </div>
              </td>
            </tr>`
          }).join('')}
        </tbody>
      </table></div>`

  const content = `
  <!-- KPIs -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px;margin-bottom:22px;">
    <div class="master-kpi" style="border-left:4px solid #27AE60;">
      <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Ativos</div>
      <div style="font-size:30px;font-weight:900;color:#27AE60;">${activeClients}</div>
      <div style="font-size:11px;color:#9ca3af;">de ${totalClients} totais</div>
    </div>
    <div class="master-kpi" style="border-left:4px solid #F39C12;">
      <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Em Trial</div>
      <div style="font-size:30px;font-weight:900;color:#d97706;">${trialClients}</div>
      <div style="font-size:11px;color:#9ca3af;">conversão pendente</div>
    </div>
    <div class="master-kpi" style="border-left:4px solid #2980B9;">
      <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">MRR</div>
      <div style="font-size:18px;font-weight:900;color:#2980B9;">R$ ${mrr.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
      <div style="font-size:11px;color:#9ca3af;">receita mensal</div>
    </div>
    <div class="master-kpi" style="border-left:4px solid #1B4F72;">
      <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">ARR</div>
      <div style="font-size:16px;font-weight:900;color:#1B4F72;">R$ ${arr.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
      <div style="font-size:11px;color:#9ca3af;">receita anual</div>
    </div>
    <div class="master-kpi" style="border-left:4px solid #7c3aed;">
      <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Usuários / Emp.</div>
      <div style="font-size:30px;font-weight:900;color:#7c3aed;">${totalUsers}</div>
      <div style="font-size:11px;color:#9ca3af;">${totalEmpresas} empresas</div>
    </div>
    <div class="master-kpi">
      <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Planos</div>
      ${Object.entries(planDist).map(([plan, count]) => {
        const pl = PLANS[plan]
        const pct = totalClients > 0 ? Math.round((count/totalClients)*100) : 0
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
          <div style="font-size:11px;font-weight:700;color:${pl.color};width:78px;">${pl.label}</div>
          <div style="flex:1;height:5px;background:#e9ecef;border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${pl.color};border-radius:3px;"></div>
          </div>
          <div style="font-size:11px;color:#6c757d;width:18px;text-align:right;">${count}</div>
        </div>`
      }).join('')}
    </div>
  </div>

  ${trialClients > 0 ? `
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
    <i class="fas fa-exclamation-triangle" style="color:#d97706;font-size:18px;flex-shrink:0;"></i>
    <div style="flex:1;">
      <div style="font-size:13px;font-weight:700;color:#92400e;">${trialClients} cliente(s) em trial</div>
      <div style="font-size:12px;color:#b45309;">
        ${clients.filter(c2 => c2.status === 'trial').map(c2 => {
          const dl = c2.trialEnd ? Math.ceil((new Date(c2.trialEnd).getTime()-Date.now())/(1000*60*60*24)) : 0
          return `<span style="margin-right:12px;"><strong>${c2.fantasia}</strong>: ${dl>0?dl+' dias':'EXPIRADO'}</span>`
        }).join('')}
      </div>
    </div>
  </div>` : ''}

  <!-- Abas de navegação -->
  <div style="display:flex;border-bottom:2px solid #e9ecef;margin-bottom:20px;overflow-x:auto;background:white;border-radius:12px 12px 0 0;padding:0 8px;">
    <button class="panel-tab active" id="tabClientes" data-tab="clientes">
      <i class="fas fa-building" style="margin-right:6px;"></i>Clientes <span id="badgeClientes" style="background:#e9ecef;color:#374151;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:4px;">${clients.length}</span>
    </button>
    <button class="panel-tab" id="tabSuporte" data-tab="suporte">
      <i class="fas fa-headset" style="margin-right:6px;"></i>Suporte
    </button>
    <button class="panel-tab" id="tabUsuarios" data-tab="usuarios">
      <i class="fas fa-user-shield" style="margin-right:6px;"></i>Usuários Master <span id="badgeUsuarios" style="background:#e9ecef;color:#374151;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:4px;">${masterUsers.length}</span>
    </button>
    <button class="panel-tab" id="tabAuditoria" data-tab="auditoria">
      <i class="fas fa-history" style="margin-right:6px;"></i>Auditoria <span id="badgeAuditoria" style="background:#e9ecef;color:#374151;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:4px;">${auditLog.length}</span>
    </button>
  </div>

  <!-- Painel: Clientes -->
  <div id="panelClientes" class="card" style="overflow:hidden;">
    <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <input type="text" id="searchClients" class="form-control" placeholder="🔍 Buscar cliente..." style="width:200px;" oninput="filterClients()">
      <select class="form-control" id="filterStatus" style="width:130px;" onchange="filterClients()">
        <option value="">Todos status</option>
        <option value="active">Ativo</option>
        <option value="trial">Trial</option>
        <option value="inactive">Inativo</option>
      </select>
      <select class="form-control" id="filterPlano" style="width:140px;" onchange="filterClients()">
        <option value="">Todos planos</option>
        <option value="starter">Starter</option>
        <option value="professional">Professional</option>
        <option value="enterprise">Enterprise</option>
      </select>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
        <span style="font-size:12px;color:#9ca3af;" id="clientCount">${clients.length} clientes</span>
        <button class="btn btn-secondary" id="btnExportCSV">
          <i class="fas fa-file-csv" style="color:#27AE60;"></i> Exportar CSV
        </button>
        <button class="btn btn-primary" id="btnNovoCliente">
          <i class="fas fa-plus"></i> Novo Cliente
        </button>
      </div>
    </div>
    ${clientRowsHtml}
  </div>

  <!-- Painel: Suporte -->
  <div id="panelSuporte" class="card" style="padding:20px;display:none;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
      <div>
        <div style="font-size:14px;font-weight:700;color:#1B4F72;"><i class="fas fa-headset" style="margin-right:8px;color:#7c3aed;"></i>Dashboard de Suporte</div>
        <div style="font-size:12px;color:#6c757d;margin-top:2px;">Chamados abertos por clientes da plataforma</div>
      </div>
      <button class="btn btn-primary" style="background:#7c3aed;" id="btnNovoTicketMaster">
        <i class="fas fa-plus"></i> Novo Chamado
      </button>
    </div>
    <!-- Filtros opcionais de gestão (por padrão exibe tudo globalmente) -->
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:16px;padding:12px 14px;background:#f8f9fa;border-radius:8px;border:1px solid #e9ecef;">
      <div style="display:flex;flex-direction:column;gap:4px;min-width:160px;">
        <label style="font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">Empresa</label>
        <select id="supportFilterEmpresa" class="form-control" style="font-size:12px;padding:5px 8px;">
          <option value="">— Todas —</option>
          ${clients.map((cl: any) => `<option value="${escapeHtml(cl.id)}">${escapeHtml(cl.fantasia || cl.empresa || cl.id)}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;min-width:130px;">
        <label style="font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">Status</label>
        <select id="supportFilterStatus" class="form-control" style="font-size:12px;padding:5px 8px;">
          <option value="">— Todos —</option>
          <option value="Criada">Criada</option><option value="Analisando">Analisando</option>
          <option value="N1">N1</option><option value="N2">N2</option><option value="N3">N3</option>
          <option value="Resolvendo">Resolvendo</option><option value="Resolvida">Resolvida</option>
        </select>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;min-width:120px;">
        <label style="font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">Prioridade</label>
        <select id="supportFilterPriority" class="form-control" style="font-size:12px;padding:5px 8px;">
          <option value="">— Todas —</option>
          <option value="critical">Crítica</option><option value="high">Alta</option>
          <option value="medium">Média</option><option value="low">Baixa</option>
        </select>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">SLA</label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;padding:6px 0;">
          <input type="checkbox" id="supportFilterOverdue" style="accent-color:#dc2626;"> Apenas vencidos
        </label>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;min-width:90px;">
        <label style="font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">Limite</label>
        <input type="number" id="supportFilterLimit" class="form-control" style="font-size:12px;padding:5px 8px;" value="200" min="1" max="500">
      </div>
      <button onclick="applySupportFilters()" class="btn btn-primary" style="font-size:12px;padding:6px 14px;align-self:flex-end;">
        <i class="fas fa-search"></i> Filtrar
      </button>
      <button onclick="clearSupportFilters()" class="btn btn-secondary" style="font-size:12px;padding:6px 14px;align-self:flex-end;">
        <i class="fas fa-times"></i> Limpar
      </button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:20px;" id="supportKPIs">
      <div class="master-kpi" style="border-left:4px solid #2980B9;">
        <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Abertos</div>
        <div style="font-size:28px;font-weight:900;color:#2980B9;" id="kpiOpen">—</div>
      </div>
      <div class="master-kpi" style="border-left:4px solid #16a34a;">
        <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Resolvidos</div>
        <div style="font-size:28px;font-weight:900;color:#16a34a;" id="kpiResolved">—</div>
      </div>
      <div class="master-kpi" style="border-left:4px solid #dc2626;">
        <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">SLA Vencido</div>
        <div style="font-size:28px;font-weight:900;color:#dc2626;" id="kpiBreached">—</div>
      </div>
      <div class="master-kpi" style="border-left:4px solid #d97706;">
        <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Críticos</div>
        <div style="font-size:28px;font-weight:900;color:#d97706;" id="kpiCritical">—</div>
      </div>
    </div>
    <!-- Kanban board -->
    <div id="supportKanban" style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;min-height:200px;">
      <div style="text-align:center;padding:40px;color:#9ca3af;width:100%;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i><div style="margin-top:8px;">Carregando chamados...</div></div>
    </div>
  </div>

  <!-- Painel: Usuários Master -->
  <div id="panelUsuarios" class="card" style="overflow:hidden;display:none;">
    <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div>
        <div style="font-size:14px;font-weight:700;color:#1B4F72;">Usuários com acesso ao Master Admin</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Gerencie quem pode acessar este painel restrito</div>
      </div>
      <button class="btn btn-primary" style="background:#7c3aed;" id="btnNovoMasterUser">
        <i class="fas fa-plus"></i> Adicionar Usuário
      </button>
    </div>
    <div id="masterUsersTableWrap">${buildMasterUsersTable(masterUsers)}</div>
  </div>

  <!-- Painel: Auditoria -->
  <div id="panelAuditoria" class="card" style="overflow:hidden;display:none;">
    <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
      <div style="font-size:14px;font-weight:700;color:#1B4F72;"><i class="fas fa-history" style="margin-right:6px;color:#7c3aed;"></i>Log de Auditoria</div>
      <span style="font-size:11px;color:#9ca3af;">${auditLog.length} eventos registrados</span>
    </div>
    ${auditLog.length === 0
      ? `<div class="empty-state"><i class="fas fa-history"></i><h3>Nenhum evento registrado</h3><p>As ações realizadas neste painel aparecerão aqui.</p></div>`
      : `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f8f9fa;border-bottom:2px solid #e9ecef;">
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Data/Hora</th>
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Usuário</th>
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Ação</th>
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Detalhe</th>
          </tr></thead>
          <tbody>
            ${auditLog.slice(0,100).map(ev => {
              const ac: Record<string,string> = { LOGIN:'#16a34a', ADD_CLIENT:'#2980B9', MIGRATE_PLAN:'#7c3aed', ADD_MASTER_USER:'#d97706', TOGGLE_USER:'#6c757d' }
              const col = ac[ev.action] || '#374151'
              return `<tr style="border-bottom:1px solid #f1f3f5;">
                <td style="padding:9px 14px;font-size:11px;color:#6c757d;white-space:nowrap;">${new Date(ev.ts).toLocaleString('pt-BR')}</td>
                <td style="padding:9px 14px;font-weight:600;color:#374151;">${ev.user}</td>
                <td style="padding:9px 14px;"><span class="mbadge" style="background:${col}20;color:${col};">${ev.action}</span></td>
                <td style="padding:9px 14px;color:#374151;">${ev.detail}</td>
              </tr>`
            }).join('')}
          </tbody>
        </table></div>`
    }
  </div>

  <!-- ══ MODAIS ══════════════════════════════════════════════════════════════════ -->

  <!-- Modal: Detalhes do Cliente -->
  <div class="moverlay" id="clientDetailModal">
    <div class="mmodal" style="max-width:660px;max-height:88vh;display:flex;flex-direction:column;">
      <div style="padding:16px 22px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <h3 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;" id="detailTitle"><i class="fas fa-building" style="margin-right:8px;"></i>Detalhes</h3>
        <button onclick="closeMM('clientDetailModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;line-height:1;">&#215;</button>
      </div>
      <div style="display:flex;border-bottom:1px solid #e9ecef;padding:0 22px;background:#f8f9fa;flex-shrink:0;overflow-x:auto;">
        <button class="mtab active" id="detTabInfo"       data-det-tab="info">Informações</button>
        <button class="mtab"        id="detTabModulos"    data-det-tab="modulos">Módulos</button>
        <button class="mtab"        id="detTabSuporte"    data-det-tab="suporte">Suporte</button>
        <button class="mtab"        id="detTabPagamentos" data-det-tab="pagamentos">Pagamentos</button>
        <button class="mtab"        id="detTabAtividade"  data-det-tab="atividade">Atividade</button>
      </div>
      <div style="padding:20px 22px;overflow-y:auto;flex:1;" id="detailBody"></div>
      <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
        <button id="btnMigrarDetalhe" class="btn btn-sm" style="background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;font-weight:700;">
          <i class="fas fa-exchange-alt"></i> Migrar Plano
        </button>
        <button id="btnFecharDetalhe" class="btn btn-secondary">Fechar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Migrar Plano -->
  <div class="moverlay" id="migrateModal">
    <div class="mmodal" style="max-width:540px;">
      <div style="padding:16px 22px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:15px;font-weight:700;color:#7c3aed;"><i class="fas fa-exchange-alt" style="margin-right:8px;"></i>Migrar / Ajustar Plano</h3>
        <button onclick="closeMM('migrateModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;line-height:1;">&#215;</button>
      </div>
      <div style="padding:22px;" id="migrateBody"></div>
      <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button id="btnFecharMigracao" class="btn btn-secondary">Cancelar</button>
        <button id="btnConfirmarMigracao" class="btn btn-primary" style="background:#7c3aed;"><i class="fas fa-check"></i> Confirmar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Anotações -->
  <div class="moverlay" id="obsModal">
    <div class="mmodal" style="max-width:420px;">
      <div style="padding:16px 22px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-sticky-note" style="margin-right:8px;"></i>Anotações</h3>
        <button onclick="closeMM('obsModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;line-height:1;">&#215;</button>
      </div>
      <div style="padding:22px;">
        <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;" id="obsClientName"></div>
        <textarea class="form-control" id="obsText" rows="5" placeholder="Registre observações, pendências, acordos..."></textarea>
      </div>
      <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button id="btnFecharObs" class="btn btn-secondary">Cancelar</button>
        <button id="btnSalvarObs" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Novo Cliente -->
  <div class="moverlay" id="addClientModal">
    <div class="mmodal" style="max-width:540px;max-height:90vh;overflow-y:auto;">
      <div style="padding:16px 22px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:white;z-index:1;">
        <h3 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-user-plus" style="margin-right:8px;color:#7c3aed;"></i>Adicionar Cliente</h3>
        <button onclick="closeMM('addClientModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;line-height:1;">&#215;</button>
      </div>
      <div style="padding:22px;display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div style="grid-column:span 2;"><label class="form-label">Razão Social *</label><input class="form-control" id="ac_empresa" placeholder="Nome da empresa"></div>
        <div style="grid-column:span 2;"><label class="form-label">Nome Fantasia</label><input class="form-control" id="ac_fantasia" placeholder="Nome curto / fantasia"></div>
        <div><label class="form-label">Responsável *</label><input class="form-control" id="ac_resp" placeholder="Nome completo"></div>
        <div><label class="form-label">E-mail *</label><input class="form-control" id="ac_email" type="email" placeholder="email@empresa.com"></div>
        <div><label class="form-label">Telefone</label><input class="form-control" id="ac_tel" placeholder="(00) 00000-0000"></div>
        <div><label class="form-label">CNPJ</label><input class="form-control" id="ac_cnpj" placeholder="00.000.000/0001-00"></div>
        <div><label class="form-label">Setor</label>
          <select class="form-control" id="ac_setor">
            <option value="">Selecione...</option>
            <option>Metalúrgica / Siderurgia</option><option>Automotivo</option>
            <option>Alimentos e Bebidas</option><option>Eletroeletrônico</option>
            <option>Construção Civil</option><option>Têxtil / Confecção</option><option>Outros</option>
          </select>
        </div>
        <div><label class="form-label">Porte</label>
          <select class="form-control" id="ac_porte">
            <option value="micro">Micro (&lt;10 func.)</option>
            <option value="pequena">Pequena (10–50)</option>
            <option value="media">Média (50–200)</option>
            <option value="grande">Grande (&gt;200)</option>
          </select>
        </div>
        <div><label class="form-label">Plano</label>
          <select class="form-control" id="ac_plano">
            <option value="starter">Starter — R$ 299/mês</option>
            <option value="professional">Professional — R$ 599/mês</option>
            <option value="enterprise">Enterprise — R$ 1.490/mês</option>
          </select>
        </div>
        <div><label class="form-label">Status inicial</label>
          <select class="form-control" id="ac_status">
            <option value="trial">Trial (14 dias)</option>
            <option value="active">Ativo (já pago)</option>
          </select>
        </div>
        <div style="grid-column:span 2;"><label class="form-label">Observações</label><textarea class="form-control" id="ac_obs" rows="2" placeholder="Contexto, acordos, observações..."></textarea></div>
      </div>
      <div id="addClientError" style="display:none;margin:0 22px 14px;padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:13px;color:#dc2626;"></div>
      <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button id="btnFecharAddClient" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarNovoCliente()" class="btn btn-primary" id="btnSalvarCliente"><i class="fas fa-save"></i> Adicionar Cliente</button>
      </div>
    </div>
  </div>

  <!-- Modal: Novo Usuário Master -->
  <div class="moverlay" id="addMasterUserModal">
    <div class="mmodal" style="max-width:440px;">
      <div style="padding:16px 22px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:15px;font-weight:700;color:#7c3aed;"><i class="fas fa-user-shield" style="margin-right:8px;"></i>Adicionar Usuário Master</h3>
        <button onclick="closeMM('addMasterUserModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;line-height:1;">&#215;</button>
      </div>
      <form onsubmit="salvarNovoMasterUser();return false;" style="padding:22px;display:flex;flex-direction:column;gap:14px;">
        <div><label class="form-label">Nome completo *</label><input class="form-control" id="mu_name" placeholder="Nome do usuário"></div>
        <div><label class="form-label">E-mail *</label><input class="form-control" id="mu_email" type="email" placeholder="usuario@syncrus.com.br"></div>
        <div><label class="form-label">Senha inicial *</label>
          <div style="position:relative;">
            <input class="form-control" id="mu_pwd" type="password" placeholder="Mínimo 8 caracteres" style="padding-right:42px;">
            <button type="button" onclick="togglePwdMU()" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#9ca3af;"><i class="fas fa-eye" id="muEye"></i></button>
          </div>
        </div>
        <div><label class="form-label">Perfil de acesso</label>
          <select class="form-control" id="mu_role">
            <option value="superadmin">Super Admin (acesso total)</option>
            <option value="viewer">Visualizador (somente leitura)</option>
          </select>
        </div>
        <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:10px 14px;font-size:12px;color:#7c3aed;">
          <i class="fas fa-info-circle" style="margin-right:6px;"></i>
          Acesso via <strong>/master/login</strong> com as credenciais cadastradas.
        </div>
      </form>
      <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button id="btnFecharAddMasterUser" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarNovoMasterUser()" class="btn btn-primary" style="background:#7c3aed;"><i class="fas fa-save"></i> Criar Usuário</button>
      </div>
    </div>
  </div>

  <!-- Modal: Novo Chamado de Suporte (Master) -->
  <div class="moverlay" id="novoTicketMasterModal">
    <div class="mmodal" style="max-width:500px;">
      <div style="padding:16px 22px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:15px;font-weight:700;color:#7c3aed;"><i class="fas fa-ticket-alt" style="margin-right:8px;"></i>Novo Chamado de Suporte</h3>
        <button onclick="closeMM('novoTicketMasterModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;line-height:1;">&#215;</button>
      </div>
      <div style="padding:22px;display:flex;flex-direction:column;gap:14px;">
        <div>
          <label class="form-label">Cliente</label>
          <select class="form-control" id="mtEmpresa">
            <option value="">— Selecione o cliente —</option>
            ${clients.map((cli) => `<option value="${escapeHtml(cli.id)}">${escapeHtml(cli.fantasia || cli.empresa)}</option>`).join('')}
          </select>
        </div>
        <div><label class="form-label">Título *</label><input class="form-control" id="mtTitle" placeholder="Título do chamado..."></div>
        <div><label class="form-label">Descrição *</label><textarea class="form-control" id="mtDescription" rows="3" placeholder="Descreva o problema..."></textarea></div>
        <div><label class="form-label">Prioridade</label>
          <select class="form-control" id="mtPriority">
            <option value="low">🟢 Baixa</option>
            <option value="medium" selected>🟡 Média</option>
            <option value="high">🟠 Alta</option>
            <option value="critical">🔴 Crítica</option>
          </select>
        </div>
      </div>
      <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeMM('novoTicketMasterModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarTicketMaster()" class="btn btn-primary" id="btnSalvarTicketMaster" style="background:#7c3aed;">
          <i class="fas fa-paper-plane"></i> Criar
        </button>
      </div>
    </div>
  </div>

  <!-- Modal: Detalhe / Edição de Chamado (Master) -->
  <div class="moverlay" id="ticketDetailModal">
    <div class="mmodal" style="max-width:560px;max-height:92vh;display:flex;flex-direction:column;">
      <div style="padding:16px 22px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <h3 id="tdModalTitle" style="margin:0;font-size:15px;font-weight:700;color:#7c3aed;"><i class="fas fa-ticket-alt" style="margin-right:8px;"></i>Chamado</h3>
        <button onclick="closeMM('ticketDetailModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;line-height:1;">&#215;</button>
      </div>

      <!-- View Section -->
      <div id="tdViewSection" style="overflow-y:auto;flex:1;">
        <div style="padding:22px;display:flex;flex-direction:column;gap:12px;">
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Título</div>
            <div id="tdvTitle" style="font-size:14px;font-weight:700;color:#1B4F72;"></div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Descrição</div>
            <div id="tdvDescription" style="font-size:13px;color:#374151;white-space:pre-wrap;background:#f8f9fa;border-radius:6px;padding:10px 12px;"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Cliente / Empresa</div>
              <div id="tdvCliente" style="font-size:12px;font-weight:600;color:#374151;"></div>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Solicitante</div>
              <div id="tdvSolicitante" style="font-size:12px;color:#374151;"></div>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Atendente</div>
              <div id="tdvAtendente" style="font-size:12px;color:#374151;"></div>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Prioridade</div>
              <div id="tdvPriority" style="font-size:12px;"></div>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Status / Etapa</div>
              <div id="tdvStatus" style="font-size:12px;"></div>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Prazo SLA</div>
              <div id="tdvDueAt" style="font-size:12px;"></div>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Aberto em</div>
              <div id="tdvCreatedAt" style="font-size:12px;color:#6c757d;"></div>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Atualizado em</div>
              <div id="tdvUpdatedAt" style="font-size:12px;color:#6c757d;"></div>
            </div>
          </div>
        </div>
        <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">
          <button onclick="closeMM('ticketDetailModal')" class="btn btn-secondary">Fechar</button>
          <button onclick="switchToEditMode()" class="btn btn-primary" style="background:#7c3aed;"><i class="fas fa-edit" style="margin-right:6px;"></i>Editar</button>
        </div>
      </div>

      <!-- Edit Section -->
      <div id="tdEditSection" style="display:none;overflow-y:auto;flex:1;">
        <div style="padding:22px;display:flex;flex-direction:column;gap:14px;">
          <div>
            <label class="form-label">Título <span style="color:#dc2626;">*</span></label>
            <input class="form-control" id="tdeTitle" placeholder="Título do chamado...">
          </div>
          <div>
            <label class="form-label">Descrição</label>
            <textarea class="form-control" id="tdeDescription" rows="4" placeholder="Descrição do chamado..."></textarea>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label class="form-label">Prioridade</label>
              <select class="form-control" id="tdePriority">
                <option value="low">🟢 Baixa</option>
                <option value="medium">🟡 Média</option>
                <option value="high">🟠 Alta</option>
                <option value="critical">🔴 Crítica</option>
              </select>
            </div>
            <div>
              <label class="form-label">Etapa / Status</label>
              <select class="form-control" id="tdeStatus">
                <option value="Criada">Criada</option>
                <option value="Analisando">Analisando</option>
                <option value="N1">N1</option>
                <option value="N2">N2</option>
                <option value="N3">N3</option>
                <option value="Resolvendo">Resolvendo</option>
                <option value="Resolvida">Resolvida</option>
              </select>
            </div>
          </div>
          <div>
            <label class="form-label">Atendente (nome do operador)</label>
            <input class="form-control" id="tdeAtendente" placeholder="Nome do atendente...">
          </div>
        </div>
        <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">
          <button onclick="switchToViewMode()" class="btn btn-secondary">Cancelar</button>
          <button onclick="saveTicketEdit()" class="btn btn-primary" id="btnSaveTicketEdit" style="background:#7c3aed;"><i class="fas fa-save" style="margin-right:6px;"></i>Salvar</button>
        </div>
      </div>
    </div>
  </div>

  <script>
  // ── Dados locais ──────────────────────────────────────────────────────────────
  let masterClientsData = ${safeJsonForScriptTag(clients)};
  const plansData = ${safeJsonForScriptTag(PLANS)};
  let _curCliId = null;
  window._curCliId = null;
  let _curDetTab = 'info';
  let _viewingTicketId = null;
  let _editingTicketId = null;

  // ── Escape seguro para construção dinâmica de HTML no cliente ─────────────────
  /** Escapa caracteres especiais HTML para uso seguro em innerHTML via concatenação de strings. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Event delegation central (resolve todos os onclick com aspas simples) ─────
  document.addEventListener('click', function(e) {
    const el = e.target;

    // data-action → botões de linha da tabela de clientes e usuários master
    const actionBtn = el.closest('[data-action]');
    if (actionBtn) {
      const action = actionBtn.dataset.action;
      const id     = actionBtn.dataset.ticketId || actionBtn.dataset.id;
      if (action === 'detail')                  openClientDetail(id);
      else if (action === 'migrate')            openMigrateModal(id);
      else if (action === 'obs')                openObsModal(id);
      else if (action === 'suspend')            suspenderCliente(id);
      else if (action === 'reactivate')         reativarCliente(id);
      else if (action === 'toggle-master-user') toggleMasterUser(id);
      else if (action === 'migrate-from-detail') { openMigrateModal(id); closeMM('clientDetailModal'); }
      else if (action === 'new-ticket-for-client') openNovoTicketMasterForClient(id || _curCliId);
      else if (action === 'ticket-view')        viewTicket(id);
      else if (action === 'ticket-edit')        editTicket(id);
      return;
    }

    // data-tab → abas do painel principal
    const tabBtn = el.closest('[data-tab]');
    if (tabBtn) { switchPanelTab(tabBtn.dataset.tab); return; }

    // data-det-tab → abas do modal de detalhes do cliente
    const detTabBtn = el.closest('[data-det-tab]');
    if (detTabBtn) { switchDetTab(detTabBtn.dataset.detTab); return; }

    // Fechar overlay ao clicar fora do modal
    if (el.classList && el.classList.contains('moverlay')) {
      el.style.display = 'none'; el.classList.remove('open'); return;
    }

    // Botões com ID fixo
    const btn = el.closest('button');
    if (!btn) return;
    switch (btn.id) {
      case 'btnNovoCliente':         openMM('addClientModal'); break;
      case 'btnNovoTicketMaster':    openNovoTicketMasterModal(); break;
      case 'btnExportCSV':           exportClientCSV(); break;
      case 'btnNovoMasterUser':      openMM('addMasterUserModal'); break;
      case 'btnMigrarDetalhe':       openMigrateModal(window._curCliId); closeMM('clientDetailModal'); break;
      case 'btnFecharDetalhe':       closeMM('clientDetailModal'); break;
      case 'btnFecharMigracao':      closeMM('migrateModal'); break;
      case 'btnConfirmarMigracao':   confirmarMigracao(); break;
      case 'btnFecharObs':           closeMM('obsModal'); break;
      case 'btnSalvarObs':           salvarObs(); break;
      case 'btnSalvarCliente':       salvarNovoCliente(); break;
      case 'btnFecharAddClient':     closeMM('addClientModal'); break;
      case 'btnFecharAddMasterUser': closeMM('addMasterUserModal'); break;
    }
  });

  // ── Event delegation: Kanban select de status ─────────────────────────────
  document.addEventListener('change', function(e) {
    const sel = e.target && e.target.closest ? e.target.closest('select[data-action="ticket-status"]') : null;
    if (!sel) return;
    const ticketId = sel.dataset.ticketId;
    if (!ticketId) return;
    updateTicketStatus(ticketId, sel.value);
  });

  // ── Abas do painel ────────────────────────────────────────────────────────────
  function switchPanelTab(tab) {
    const panels = { clientes: 'panelClientes', suporte: 'panelSuporte', usuarios: 'panelUsuarios', auditoria: 'panelAuditoria' };
    const tabs   = { clientes: 'tabClientes',   suporte: 'tabSuporte',   usuarios: 'tabUsuarios',   auditoria: 'tabAuditoria'   };

    Object.keys(panels).forEach(key => {
      const panel = document.getElementById(panels[key]);
      const btn   = document.getElementById(tabs[key]);
      if (panel) panel.style.display = (key === tab) ? '' : 'none';
      if (btn)   btn.className = 'panel-tab' + (key === tab ? ' active' : '');
    });

    if (tab === 'suporte') loadSupportTickets();
  }

  // ── Filtros ───────────────────────────────────────────────────────────────────
  function filterClients() {
    const q  = (document.getElementById('searchClients')?.value || '').toLowerCase();
    const st = document.getElementById('filterStatus')?.value  || '';
    const pl = document.getElementById('filterPlano')?.value   || '';
    let count = 0;
    document.querySelectorAll('#clientTableBody tr').forEach(row => {
      const search = row.dataset.search || '';
      const status = row.dataset.status || '';
      const plano  = row.dataset.plano  || '';
      const show   = (!q || search.includes(q)) && (!st || status===st) && (!pl || plano===pl);
      row.style.display = show ? '' : 'none';
      if (show) count++;
    });
    const el = document.getElementById('clientCount');
    if (el) el.textContent = count + ' clientes';
  }

  // ── Detalhes ──────────────────────────────────────────────────────────────────
  function openClientDetail(id) {
    const cli = masterClientsData.find(c => c.id === id);
    if (!cli) { showToast('Cliente não encontrado', 'error'); return; }
    _curCliId = id; window._curCliId = id;
    const titleEl = document.getElementById('detailTitle');
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-building" style="margin-right:8px;"></i>' + esc(cli.fantasia || cli.empresa);
    _curDetTab = 'info';
    ['info','modulos','suporte','pagamentos','atividade'].forEach(t => {
      const btn = document.getElementById('detTab' + t.charAt(0).toUpperCase() + t.slice(1));
      if (btn) btn.className = 'mtab' + (t==='info'?' active':'');
    });
    renderDetTab('info');
    openMM('clientDetailModal');
  }

  function switchDetTab(tab) {
    _curDetTab = tab;
    ['info','modulos','suporte','pagamentos','atividade'].forEach(t => {
      const btn = document.getElementById('detTab' + t.charAt(0).toUpperCase() + t.slice(1));
      if (btn) btn.className = 'mtab' + (t===tab?' active':'');
    });
    renderDetTab(tab);
  }

  function renderDetTab(tab) {
    const cli = masterClientsData.find(c => c.id === _curCliId);
    if (!cli) return;
    const pl = plansData[cli.plano] || plansData.starter;
    const statusMap = { active:{label:'Ativo',color:'#16a34a',bg:'#f0fdf4'}, trial:{label:'Trial',color:'#d97706',bg:'#fffbeb'}, inactive:{label:'Inativo',color:'#6c757d',bg:'#e9ecef'} };
    const st = statusMap[cli.status] || statusMap.inactive;
    let html = '';

    if (tab === 'info') {
      html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">' +
        dRow('Empresa', cli.empresa) + dRow('Fantasia', cli.fantasia||'—') +
        dRow('CNPJ', cli.cnpj||'—') + dRow('Setor', cli.setor||'—') +
        dRow('Porte', cli.porte||'—') + dRow('Status', '<span class="mbadge" style="background:'+st.bg+';color:'+st.color+';">'+st.label+'</span>') +
        dRow('Responsável', cli.responsavel) + dRow('E-mail', '<a href="mailto:'+cli.email+'" style="color:#2980B9;">'+cli.email+'</a>') +
        dRow('Telefone', cli.tel||'—') + dRow('Plano', '<span class="mbadge" style="background:'+pl.bg+';color:'+pl.color+';">'+pl.label+'</span>') +
        dRow('Billing', {monthly:'Mensal',annual:'Anual',trial:'Trial'}[cli.billing]||cli.billing) +
        dRow('Valor/mês', cli.status==='active'?'R$ '+cli.valor.toLocaleString('pt-BR',{minimumFractionDigits:2}):'R$ —') +
        dRow('Empresas', String(cli.empresas)) + dRow('Usuários', String(cli.usuarios)) +
        dRow('Criado em', new Date(cli.criadoEm+'T12:00:00').toLocaleDateString('pt-BR')) +
        dRow('Último acesso', new Date(cli.ultimoAcesso+'T12:00:00').toLocaleDateString('pt-BR')) +
        '</div>';
      if (cli.obs) html += '<div style="margin-top:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;"><div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;margin-bottom:3px;">Observações</div><div style="font-size:13px;color:#374151;">'+esc(cli.obs)+'</div></div>';
      if (cli.status==='trial') {
        const dl = cli.trialEnd ? Math.ceil((new Date(cli.trialEnd).getTime()-Date.now())/(1000*60*60*24)) : 0;
        html += '<div style="margin-top:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px;display:flex;align-items:center;gap:10px;">' +
          '<i class="fas fa-clock" style="color:#dc2626;font-size:18px;"></i>' +
          '<div><div style="font-size:13px;font-weight:700;color:#dc2626;">Trial: '+dl+' dia(s) restantes</div>' +
          '<div style="font-size:11px;color:#9ca3af;">Expira: '+cli.trialEnd+'</div></div>' +
          '<button data-action="migrate-from-detail" data-id="'+cli.id+'" class="btn btn-sm" style="margin-left:auto;background:#7c3aed;color:white;border:none;"><i class="fas fa-exchange-alt"></i> Migrar</button></div>';
      }
    } else if (tab === 'modulos') {
      const allMods = ['Ordens','Planejamento','Estoque','Qualidade','Suprimentos','Engenharia','Apontamento','Importação','Recursos'];
      html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
        '<div style="font-size:13px;font-weight:700;color:#374151;">Módulos habilitados ('+cli.modulos.length+'/'+allMods.length+')</div>' +
        '<a href="/master/client/'+cli.id+'" target="_blank" style="font-size:11px;font-weight:700;color:#7c3aed;text-decoration:none;padding:4px 10px;border:1px solid #ddd6fe;border-radius:6px;background:#f5f3ff;" title="Abrir página de detalhes">' +
        '<i class="fas fa-external-link-alt" style="margin-right:5px;font-size:10px;"></i>Gerenciar Acesso</a></div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
      allMods.forEach(m => {
        const on = cli.modulos.includes(m);
        html += '<span style="font-size:12px;font-weight:600;padding:6px 14px;border-radius:20px;background:'+(on?'#1B4F72':'#f1f3f5')+';color:'+(on?'white':'#9ca3af')+';">' +
          '<i class="fas '+(on?'fa-check':'fa-times')+'" style="margin-right:5px;font-size:10px;"></i>'+m+'</span>';
      });
      html += '</div>';
    } else if (tab === 'suporte') {
      html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
        '<div style="font-size:13px;font-weight:700;color:#374151;">Chamados de Suporte</div>' +
        '<button class="btn btn-sm" style="background:#7c3aed;color:white;border:none;" data-action="new-ticket-for-client" data-id="' + (id || '') + '">' +
        '<i class="fas fa-plus"></i> Novo Chamado</button></div>';
      html += '<div id="detSupportTickets" style="min-height:80px;"><div style="text-align:center;padding:20px;color:#9ca3af;"><i class="fas fa-spinner fa-spin"></i></div></div>';
      setTimeout(function() { loadClientSupportTickets(_curCliId); }, 100);
    } else if (tab === 'pagamentos') {
      if (!cli.pagamentos || cli.pagamentos.length === 0) {
        html = '<div style="text-align:center;padding:24px;color:#9ca3af;"><i class="fas fa-receipt" style="font-size:32px;display:block;margin-bottom:8px;opacity:0.4;"></i>Nenhum pagamento registrado</div>';
      } else {
        html = '<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:#f8f9fa;">' +
          '<th style="padding:8px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Período</th>' +
          '<th style="padding:8px;text-align:right;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Valor</th>' +
          '<th style="padding:8px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Status</th>' +
          '<th style="padding:8px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Data</th>' +
          '</tr></thead><tbody>';
        cli.pagamentos.forEach(p => {
          const sc = p.status==='pago'?'#16a34a':'#dc2626', sb = p.status==='pago'?'#f0fdf4':'#fef2f2';
          html += '<tr style="border-bottom:1px solid #f1f3f5;">' +
            '<td style="padding:8px;font-weight:600;color:#374151;">'+p.mes+'</td>' +
            '<td style="padding:8px;text-align:right;font-weight:700;color:#1B4F72;">R$ '+p.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})+'</td>' +
            '<td style="padding:8px;text-align:center;"><span class="mbadge" style="background:'+sb+';color:'+sc+';">'+p.status+'</span></td>' +
            '<td style="padding:8px;color:#6c757d;">'+p.data+'</td></tr>';
        });
        html += '</tbody></table>';
      }
    } else if (tab === 'atividade') {
      html = '<div style="display:flex;flex-direction:column;gap:0;">';
      const pl2 = plansData[cli.plano] || plansData.starter;
      [
        { icon:'fa-user-plus', color:'#27AE60', desc:'Conta criada', date:cli.criadoEm, detail:'Plano '+pl2.label },
        { icon:'fa-sign-in-alt', color:'#2980B9', desc:'Último acesso', date:cli.ultimoAcesso, detail:'Usuário: '+cli.responsavel },
        ...(cli.status==='trial'?[{icon:'fa-clock',color:'#d97706',desc:'Trial ativo',date:cli.trialStart||cli.criadoEm,detail:'Expira: '+cli.trialEnd}]:[]),
      ].forEach(ev => {
        html += '<div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #f1f3f5;">' +
          '<div style="width:32px;height:32px;border-radius:50%;background:#f1f3f5;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
          '<i class="fas '+ev.icon+'" style="font-size:11px;color:'+ev.color+';"></i></div>' +
          '<div><div style="font-size:13px;font-weight:600;color:#374151;">'+ev.desc+'</div>' +
          '<div style="font-size:11px;color:#9ca3af;">'+new Date(ev.date+'T12:00:00').toLocaleDateString('pt-BR')+' · '+ev.detail+'</div></div></div>';
      });
      html += '</div>';
    }
    const body = document.getElementById('detailBody');
    if (body) body.innerHTML = html;
  }

  function dRow(label, val) {
    return '<div style="background:#f8f9fa;border-radius:8px;padding:9px 11px;"><div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:2px;">'+label+'</div><div style="font-size:13px;color:#374151;font-weight:500;">'+val+'</div></div>';
  }

  // ── Migrar Plano ──────────────────────────────────────────────────────────────
  function openMigrateModal(id) {
    const cli = masterClientsData.find(c => c.id === id);
    if (!cli) { showToast('Cliente não encontrado', 'error'); return; }
    _curCliId = id; window._curCliId = id;
    const today = new Date().toISOString().split('T')[0];
    const trialPlus = new Date(Date.now()+30*86400000).toISOString().split('T')[0];
    let html = '<div style="background:#f8f9fa;border-radius:10px;padding:12px;margin-bottom:16px;">' +
      '<div style="font-size:11px;color:#9ca3af;margin-bottom:1px;">Cliente selecionado</div>' +
      '<div style="font-size:15px;font-weight:700;color:#1B4F72;">'+(cli.fantasia||cli.empresa)+'</div>' +
      '<div style="font-size:12px;color:#6c757d;">'+cli.responsavel+' · '+cli.email+'</div></div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:13px;">';
    html += '<div style="grid-column:span 2;"><label class="form-label">Tipo de Ação *</label>' +
      '<select class="form-control" id="mg_acao" onchange="onMgAcaoChange()">' +
      '<option value="change_plan">Migrar para outro plano</option>' +
      '<option value="extend_trial">Prorrogar trial</option>' +
      '<option value="activate">Ativar conta manualmente</option>' +
      '<option value="suspend">Suspender conta</option>' +
      '<option value="reactivate">Reativar conta suspensa</option>' +
      '</select></div>';
    html += '<div id="mg_planGroup"><label class="form-label">Novo Plano</label>' +
      '<select class="form-control" id="mg_plano">' +
      Object.entries(plansData).map(([k,v]) => '<option value="'+k+'" '+(k===cli.plano?'selected':'')+'>'+v.label+' — R$ '+v.monthlyBase+'/mês</option>').join('') +
      '</select></div>';
    html += '<div id="mg_billingGroup"><label class="form-label">Cobrança</label>' +
      '<select class="form-control" id="mg_billing">' +
      '<option value="monthly" '+(cli.billing==='monthly'?'selected':'')+'>Mensal</option>' +
      '<option value="annual">Anual (20% off)</option>' +
      '</select></div>';
    html += '<div id="mg_trialGroup" style="display:none;grid-column:span 2;"><label class="form-label">Nova data de expiração do trial</label><input class="form-control" type="date" id="mg_trialEnd" value="'+trialPlus+'"></div>';
    html += '<div style="grid-column:span 2;"><label class="form-label">Motivo / Justificativa *</label><textarea class="form-control" id="mg_motivo" rows="2" placeholder="Ex: Solicitação via WhatsApp, cortesia comercial..."></textarea></div>';
    html += '</div>';
    html += '<div style="margin-top:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:9px 12px;font-size:11px;color:#856404;"><i class="fas fa-info-circle" style="margin-right:5px;"></i>Alteração registrada no log de auditoria.</div>';
    const body = document.getElementById('migrateBody');
    if (body) body.innerHTML = html;
    openMM('migrateModal');
  }

  function onMgAcaoChange() {
    const acao = document.getElementById('mg_acao')?.value;
    const showPlan  = acao==='change_plan'||acao==='activate';
    const showTrial = acao==='extend_trial';
    const pg = document.getElementById('mg_planGroup');
    const bg = document.getElementById('mg_billingGroup');
    const tg = document.getElementById('mg_trialGroup');
    if (pg) pg.style.display = showPlan  ? '' : 'none';
    if (bg) bg.style.display = showPlan  ? '' : 'none';
    if (tg) tg.style.display = showTrial ? '' : 'none';
  }

  async function confirmarMigracao() {
    const motivo = document.getElementById('mg_motivo')?.value?.trim();
    if (!motivo) { showToast('Informe o motivo da alteração.', 'error'); return; }
    const payload = {
      clientId: _curCliId,
      acao: document.getElementById('mg_acao')?.value,
      plano: document.getElementById('mg_plano')?.value,
      billing: document.getElementById('mg_billing')?.value,
      trialEnd: document.getElementById('mg_trialEnd')?.value,
      motivo
    };
    try {
      const res = await fetch('/master/api/migrate-plan', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      if (res.ok) {
        closeMM('migrateModal');
        showToast('✅ Alteração registrada com sucesso!', 'success');
        setTimeout(() => location.reload(), 1200);
      } else { showToast('Erro ao salvar alteração.', 'error'); }
    } catch { showToast('Erro de conexão.', 'error'); }
  }

  // ── Ações rápidas de cliente ──────────────────────────────────────────────────
  async function suspenderCliente(id) {
    if (!confirm('Suspender este cliente? O acesso será bloqueado.')) return;
    try {
      const res = await fetch('/master/api/migrate-plan', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ clientId:id, acao:'suspend', motivo:'Suspensão via painel master' }) });
      if (res.ok) { showToast('Cliente suspenso.', 'success'); setTimeout(() => location.reload(), 1000); }
      else { showToast('Erro ao suspender cliente.', 'error'); }
    } catch { showToast('Erro de conexão.', 'error'); }
  }

  async function reativarCliente(id) {
    if (!confirm('Reativar este cliente?')) return;
    try {
      const res = await fetch('/master/api/migrate-plan', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ clientId:id, acao:'reactivate', motivo:'Reativação via painel master' }) });
      if (res.ok) { showToast('Cliente reativado!', 'success'); setTimeout(() => location.reload(), 1000); }
      else { showToast('Erro ao reativar cliente.', 'error'); }
    } catch { showToast('Erro de conexão.', 'error'); }
  }

  // ── Anotações ─────────────────────────────────────────────────────────────────
  function openObsModal(id) {
    const cli = masterClientsData.find(c => c.id === id);
    if (!cli) return;
    _curCliId = id;
    const nameEl = document.getElementById('obsClientName');
    if (nameEl) nameEl.textContent = (cli.fantasia||cli.empresa) + ' — ' + cli.responsavel;
    const textEl = document.getElementById('obsText');
    if (textEl) textEl.value = cli.obs || '';
    openMM('obsModal');
  }

  async function salvarObs() {
    const obs = document.getElementById('obsText')?.value?.trim() || '';
    try {
      await fetch('/master/api/save-obs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ clientId: _curCliId, obs }) });
      closeMM('obsModal');
      showToast('✅ Anotação salva!', 'success');
      setTimeout(() => location.reload(), 800);
    } catch { showToast('Erro ao salvar anotação.', 'error'); }
  }

  // ── Novo Cliente ──────────────────────────────────────────────────────────────
  async function salvarNovoCliente() {
    const emp   = document.getElementById('ac_empresa')?.value?.trim();
    const resp  = document.getElementById('ac_resp')?.value?.trim();
    const email = document.getElementById('ac_email')?.value?.trim();

    const errDiv = document.getElementById('addClientError');
    if (!emp || !resp || !email) {
      if (errDiv) { errDiv.textContent = 'Preencha os campos obrigatórios: Razão Social, Responsável e E-mail.'; errDiv.style.display = 'block'; }
      return;
    }
    if (errDiv) errDiv.style.display = 'none';

    const btn = document.getElementById('btnSalvarCliente');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

    const payload = {
      empresa:    emp,
      fantasia:   document.getElementById('ac_fantasia')?.value?.trim() || emp,
      responsavel: resp,
      email,
      tel:    document.getElementById('ac_tel')?.value?.trim()   || '',
      cnpj:   document.getElementById('ac_cnpj')?.value?.trim()  || '',
      setor:  document.getElementById('ac_setor')?.value         || '',
      porte:  document.getElementById('ac_porte')?.value         || 'pequena',
      plano:  document.getElementById('ac_plano')?.value         || 'starter',
      status: document.getElementById('ac_status')?.value        || 'trial',
      obs:    document.getElementById('ac_obs')?.value?.trim()   || '',
    };

    try {
      const res = await fetch('/master/api/add-client', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        closeMM('addClientModal');
        showToast('✅ Cliente "' + payload.empresa + '" adicionado com sucesso!', 'success');
        setTimeout(() => location.reload(), 1200);
      } else {
        if (errDiv) { errDiv.textContent = data.error || 'Erro ao adicionar cliente. Tente novamente.'; errDiv.style.display = 'block'; }
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Adicionar Cliente'; }
      }
    } catch {
      if (errDiv) { errDiv.textContent = 'Erro de conexão. Verifique e tente novamente.'; errDiv.style.display = 'block'; }
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Adicionar Cliente'; }
    }
  }

  // ── Novo Usuário Master ───────────────────────────────────────────────────────
  async function salvarNovoMasterUser() {
    const name  = document.getElementById('mu_name')?.value?.trim();
    const email = document.getElementById('mu_email')?.value?.trim();
    const pwd   = document.getElementById('mu_pwd')?.value?.trim();
    const role  = document.getElementById('mu_role')?.value || 'viewer';
    if (!name || !email || !pwd) { showToast('Preencha nome, e-mail e senha.', 'error'); return; }
    if (pwd.length < 8) { showToast('A senha deve ter ao menos 8 caracteres.', 'error'); return; }
    try {
      const res = await fetch('/master/api/add-master-user', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name, email, pwd, role }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        closeMM('addMasterUserModal');
        showToast('✅ Usuário master "' + name + '" criado!', 'success');
        setTimeout(() => location.reload(), 1000);
      } else { showToast('Erro: ' + (data.error || 'Tente novamente.'), 'error'); }
    } catch { showToast('Erro de conexão.', 'error'); }
  }

  function togglePwdMU() {
    const inp = document.getElementById('mu_pwd');
    const ico = document.getElementById('muEye');
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    if (ico) ico.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
  }

  // ── Exportar CSV ──────────────────────────────────────────────────────────────
  function exportClientCSV() {
    if (masterClientsData.length === 0) { showToast('Nenhum cliente para exportar.', 'error'); return; }
    var NL = String.fromCharCode(13, 10);
    var rows = ['Empresa;Responsavel;E-mail;Telefone;Plano;Status;Valor/mes;Empresas;Usuarios;Criado em;Trial Expira'];
    masterClientsData.forEach(function(c) {
      var pl = plansData[c.plano];
      var v = [
        c.empresa, c.responsavel||'', c.email||'', c.tel||'',
        pl ? pl.label : c.plano, c.status,
        'R$ '+(c.valor||0).toFixed(2), c.empresas, c.usuarios,
        c.criadoEm, c.trialEnd||'sem trial'
      ].map(function(x) { return '"'+String(x).replace(/"/g,'""')+'"'; });
      rows.push(v.join(';'));
    });
    var BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);
    var blob = new Blob([BOM, rows.join(NL) + NL], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'clientes_pcpsyncrus_' + new Date().toISOString().split('T')[0] + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('CSV exportado com sucesso!', 'success');
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────────
  function openMM(id)  { const el = document.getElementById(id); if (el) { el.style.display = 'flex'; el.classList.add('open'); } }
  function closeMM(id) { const el = document.getElementById(id); if (el) { el.style.display = 'none'; el.classList.remove('open'); } }

  // ── Toggle usuário master ─────────────────────────────────────────────────────
  async function toggleMasterUser(id) {
    try {
      const res = await fetch('/master/api/toggle-master-user', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id }) });
      if (res.ok) { showToast('Status do usuário atualizado!', 'success'); setTimeout(() => location.reload(), 800); }
      else { showToast('Erro ao atualizar usuário.', 'error'); }
    } catch { showToast('Erro de conexão.', 'error'); }
  }

  // ── Suporte: funções ──────────────────────────────────────────────────────────
  const SUPPORT_STATUS_ORDER = ['Criada','Analisando','N1','N2','N3','Resolvendo','Resolvida'];
  const PRIORITY_COLORS = { critical:'#dc2626', high:'#ea580c', medium:'#d97706', low:'#16a34a' };
  const PRIORITY_LABELS_PT = { critical:'Crítica', high:'Alta', medium:'Média', low:'Baixa' };

  let _masterTickets = [];
  let _newTicketCliId = null;

  async function loadSupportTickets(params) {
    try {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      const res = await fetch('/master/api/support/tickets' + qs);
      if (!res.ok) { renderKanban([]); return; }
      const data = await res.json().catch(() => ({ tickets: [] }));
      _masterTickets = data.tickets || [];
      const now = Date.now();
      const open     = _masterTickets.filter(t => t.status !== 'Resolvida').length;
      const resolved = _masterTickets.filter(t => t.status === 'Resolvida').length;
      const breached = _masterTickets.filter(t => t.status !== 'Resolvida' && t.due_at && new Date(t.due_at).getTime() < now).length;
      const critical = _masterTickets.filter(t => t.priority === 'critical' && t.status !== 'Resolvida').length;
      const kpiOpen     = document.getElementById('kpiOpen');
      const kpiResolved = document.getElementById('kpiResolved');
      const kpiBreached = document.getElementById('kpiBreached');
      const kpiCritical = document.getElementById('kpiCritical');
      if (kpiOpen)     kpiOpen.textContent     = open;
      if (kpiResolved) kpiResolved.textContent = resolved;
      if (kpiBreached) kpiBreached.textContent = breached;
      if (kpiCritical) kpiCritical.textContent = critical;
      renderKanban(_masterTickets);
    } catch(e) {
      renderKanban([]);
    }
  }

  function applySupportFilters() {
    const params = {};
    const empresa  = document.getElementById('supportFilterEmpresa')?.value;
    const status   = document.getElementById('supportFilterStatus')?.value;
    const priority = document.getElementById('supportFilterPriority')?.value;
    const overdue  = document.getElementById('supportFilterOverdue')?.checked;
    const limit    = document.getElementById('supportFilterLimit')?.value;
    if (empresa)  params.empresa_id   = empresa;
    if (status)   params.status       = status;
    if (priority) params.priority     = priority;
    if (overdue)  params.only_overdue = '1';
    if (limit && parseInt(limit) !== 200) params.limit = limit;
    loadSupportTickets(Object.keys(params).length ? params : null);
  }

  function clearSupportFilters() {
    const el = (id) => document.getElementById(id);
    if (el('supportFilterEmpresa'))  el('supportFilterEmpresa').value   = '';
    if (el('supportFilterStatus'))   el('supportFilterStatus').value    = '';
    if (el('supportFilterPriority')) el('supportFilterPriority').value  = '';
    if (el('supportFilterOverdue'))  el('supportFilterOverdue').checked = false;
    if (el('supportFilterLimit'))    el('supportFilterLimit').value     = '200';
    loadSupportTickets(null);
  }

  function renderKanban(tickets) {
    const kanban = document.getElementById('supportKanban');
    if (!kanban) return;
    const now = Date.now();
    const cols = SUPPORT_STATUS_ORDER.map(function(status) {
      const colTickets = tickets.filter(function(t) { return t.status === status; });
      const cards = colTickets.map(function(t) {
        const pc = PRIORITY_COLORS[t.priority] || '#6c757d';
        const pl = PRIORITY_LABELS_PT[t.priority] || t.priority;
        const overdue = t.due_at && new Date(t.due_at).getTime() < now && t.status !== 'Resolvida';
        // Prefer stored empresa_name; fall back to masterClientsData lookup then raw id
        const cliName = (t.empresa_name && t.empresa_name !== '') ? t.empresa_name :
          ((masterClientsData.find(function(c) { return c.id === t.empresa_id; }) || {}).fantasia || t.empresa_id || '—');
        // Stringify ticket id for data attribute (HTML-escape only for the attribute context, no JS context)
        const tid = String(t.id == null ? '' : t.id);
        return '<div style="background:white;border-radius:8px;border:1px solid #e9ecef;padding:10px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">' +
          '<div style="font-size:12px;font-weight:700;color:#1B4F72;margin-bottom:2px;line-height:1.3;">' + esc(t.title || '—') + '</div>' +
          '<div style="font-size:10px;color:#6c757d;margin-bottom:2px;">' + esc(cliName) + '</div>' +
          (t.created_by_name ? '<div style="font-size:9px;color:#9ca3af;margin-bottom:2px;"><i class="fas fa-user" style="margin-right:3px;opacity:0.6;"></i>' + esc(t.created_by_name) + '</div>' : '') +
          (t.atendente_name ? '<div style="font-size:9px;color:#7c3aed;margin-bottom:4px;"><i class="fas fa-headset" style="margin-right:3px;"></i>' + esc(t.atendente_name) + '</div>' : '') +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;">' +
          '<span style="font-size:10px;font-weight:700;color:' + pc + ';background:' + pc + '18;padding:1px 6px;border-radius:4px;">' + pl + '</span>' +
          (overdue ? '<span style="font-size:9px;font-weight:700;color:#dc2626;"><i class="fas fa-exclamation-triangle"></i> SLA</span>' : '') +
          '</div>' +
          (t.due_at ? '<div style="font-size:9px;color:' + (overdue?'#dc2626':'#9ca3af') + ';margin-top:4px;">Prazo: ' + new Date(t.due_at).toLocaleDateString('pt-BR') + '</div>' : '') +
          '<select data-action="ticket-status" data-ticket-id="' + esc(tid) + '" style="width:100%;margin-top:8px;font-size:10px;border:1px solid #e9ecef;border-radius:4px;padding:2px 4px;background:white;cursor:pointer;">' +
          SUPPORT_STATUS_ORDER.map(function(s) { return '<option value="' + s + '" ' + (s===t.status?'selected':'') + '>' + s + '</option>'; }).join('') +
          '</select>' +
          '<div style="display:flex;gap:4px;margin-top:6px;">' +
          '<button data-action="ticket-view" data-ticket-id="' + esc(tid) + '" style="flex:1;font-size:10px;font-weight:600;padding:4px 0;border-radius:4px;border:1px solid #e9ecef;background:#f8f9fa;color:#374151;cursor:pointer;"><i class="fas fa-eye" style="margin-right:3px;"></i>Ver</button>' +
          '<button data-action="ticket-edit" data-ticket-id="' + esc(tid) + '" style="flex:1;font-size:10px;font-weight:600;padding:4px 0;border-radius:4px;border:1px solid #ddd6fe;background:#f5f3ff;color:#7c3aed;cursor:pointer;"><i class="fas fa-edit" style="margin-right:3px;"></i>Editar</button>' +
          '</div>' +
          '</div>';
      }).join('');
      return '<div style="min-width:160px;flex:1;max-width:200px;">' +
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6c757d;margin-bottom:10px;padding:6px 10px;background:#f8f9fa;border-radius:6px;display:flex;align-items:center;justify-content:space-between;">' +
        status + '<span style="background:#e9ecef;color:#374151;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;">' + colTickets.length + '</span></div>' +
        (cards || '<div style="text-align:center;padding:16px;color:#d1d5db;font-size:11px;">—</div>') +
        '</div>';
    }).join('');
    kanban.innerHTML = cols;
  }

  async function updateTicketStatus(ticketId, newStatus) {
    try {
      await fetch('/master/api/support/tickets/' + ticketId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const ticket = _masterTickets.find(function(t) { return t.id === ticketId; });
      if (ticket) { ticket.status = newStatus; renderKanban(_masterTickets); }
      showToast('Status atualizado!', 'success');
    } catch { showToast('Erro ao atualizar status.', 'error'); }
  }

  function viewTicket(ticketId) {
    const t = _masterTickets.find(function(x) { return x.id === ticketId; });
    if (!t) return;
    _viewingTicketId = ticketId;
    const cliName = (t.empresa_name && t.empresa_name !== '') ? t.empresa_name :
      ((masterClientsData.find(function(c) { return c.id === t.empresa_id; }) || {}).fantasia || t.empresa_id || '—');
    const pc = PRIORITY_COLORS[t.priority] || '#6c757d';
    const pl = PRIORITY_LABELS_PT[t.priority] || t.priority;
    const now = Date.now();
    const overdue = t.due_at && new Date(t.due_at).getTime() < now && t.status !== 'Resolvida';

    var title = document.getElementById('tdModalTitle');
    var tdvTitle = document.getElementById('tdvTitle');
    var tdvDescription = document.getElementById('tdvDescription');
    var tdvCliente = document.getElementById('tdvCliente');
    var tdvSolicitante = document.getElementById('tdvSolicitante');
    var tdvAtendente = document.getElementById('tdvAtendente');
    var tdvPriority = document.getElementById('tdvPriority');
    var tdvStatus = document.getElementById('tdvStatus');
    var tdvDueAt = document.getElementById('tdvDueAt');
    var tdvCreatedAt = document.getElementById('tdvCreatedAt');
    var tdvUpdatedAt = document.getElementById('tdvUpdatedAt');

    if (title) title.innerHTML = '<i class="fas fa-ticket-alt" style="margin-right:8px;"></i>' + esc(t.title || 'Chamado');
    if (tdvTitle) tdvTitle.textContent = t.title || '—';
    if (tdvDescription) tdvDescription.textContent = t.description || '—';
    if (tdvCliente) tdvCliente.textContent = cliName;
    if (tdvSolicitante) tdvSolicitante.textContent = t.created_by_name || '—';
    if (tdvAtendente) {
      tdvAtendente.innerHTML = t.atendente_name
        ? '<span style="color:#7c3aed;font-weight:600;">' + esc(t.atendente_name) + '</span>'
        : '<span style="color:#9ca3af;font-style:italic;">Não atribuído</span>';
    }
    if (tdvPriority) tdvPriority.innerHTML = '<span style="font-size:11px;font-weight:700;color:' + pc + ';background:' + pc + '18;padding:2px 8px;border-radius:4px;">' + pl + '</span>';
    if (tdvStatus) tdvStatus.innerHTML = '<span style="font-size:11px;background:#e9ecef;color:#374151;padding:2px 8px;border-radius:10px;font-weight:600;">' + esc(t.status) + '</span>' +
      (overdue ? ' <span style="color:#dc2626;font-size:10px;font-weight:700;"><i class="fas fa-exclamation-triangle"></i> SLA vencido</span>' : '');
    if (tdvDueAt) tdvDueAt.textContent = t.due_at ? new Date(t.due_at).toLocaleString('pt-BR') : '—';
    if (tdvCreatedAt) tdvCreatedAt.textContent = t.created_at ? new Date(t.created_at).toLocaleString('pt-BR') : '—';
    if (tdvUpdatedAt) tdvUpdatedAt.textContent = t.updated_at ? new Date(t.updated_at).toLocaleString('pt-BR') : '—';

    var viewSec = document.getElementById('tdViewSection');
    var editSec = document.getElementById('tdEditSection');
    if (viewSec) viewSec.style.display = '';
    if (editSec) editSec.style.display = 'none';
    openMM('ticketDetailModal');
  }

  function switchToViewMode() {
    var viewSec = document.getElementById('tdViewSection');
    var editSec = document.getElementById('tdEditSection');
    if (viewSec) viewSec.style.display = '';
    if (editSec) editSec.style.display = 'none';
  }

  function switchToEditMode() {
    var t = _viewingTicketId ? _masterTickets.find(function(x) { return x.id === _viewingTicketId; }) : null;
    if (t) {
      var f = document.getElementById('tdeTitle');
      var d = document.getElementById('tdeDescription');
      var p = document.getElementById('tdePriority');
      var s = document.getElementById('tdeStatus');
      var a = document.getElementById('tdeAtendente');
      if (f) f.value = t.title || '';
      if (d) d.value = t.description || '';
      if (p) p.value = t.priority || 'medium';
      if (s) s.value = t.status || 'Criada';
      if (a) a.value = t.atendente_name || '';
      _editingTicketId = _viewingTicketId;
    }
    var viewSec = document.getElementById('tdViewSection');
    var editSec = document.getElementById('tdEditSection');
    if (viewSec) viewSec.style.display = 'none';
    if (editSec) editSec.style.display = '';
  }

  function editTicket(ticketId) {
    var t = _masterTickets.find(function(x) { return x.id === ticketId; });
    if (!t) return;
    _editingTicketId = ticketId;
    _viewingTicketId = ticketId;
    var title = document.getElementById('tdModalTitle');
    if (title) title.innerHTML = '<i class="fas fa-edit" style="margin-right:8px;"></i>' + esc(t.title || 'Editar Chamado');
    var f = document.getElementById('tdeTitle');
    var d = document.getElementById('tdeDescription');
    var p = document.getElementById('tdePriority');
    var s = document.getElementById('tdeStatus');
    var a = document.getElementById('tdeAtendente');
    if (f) f.value = t.title || '';
    if (d) d.value = t.description || '';
    if (p) p.value = t.priority || 'medium';
    if (s) s.value = t.status || 'Criada';
    if (a) a.value = t.atendente_name || '';
    var viewSec = document.getElementById('tdViewSection');
    var editSec = document.getElementById('tdEditSection');
    if (viewSec) viewSec.style.display = 'none';
    if (editSec) editSec.style.display = '';
    openMM('ticketDetailModal');
  }

  async function saveTicketEdit() {
    var id = _editingTicketId;
    if (!id) return;
    var titleEl = document.getElementById('tdeTitle');
    var descEl  = document.getElementById('tdeDescription');
    var priEl   = document.getElementById('tdePriority');
    var statEl  = document.getElementById('tdeStatus');
    var ateEl   = document.getElementById('tdeAtendente');
    var title       = titleEl ? titleEl.value.trim() : '';
    var description = descEl  ? descEl.value : '';
    var priority    = priEl   ? priEl.value  : 'medium';
    var status      = statEl  ? statEl.value : 'Criada';
    var atendente_name = ateEl ? ateEl.value.trim() : '';

    if (!title) { showToast('Informe o título do chamado.', 'error'); return; }

    var btn = document.getElementById('btnSaveTicketEdit');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

    try {
      var res = await fetch('/master/api/support/tickets/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, priority, status, atendente_name }),
      });
      var data = await res.json().catch(function() { return {}; });
      if (res.ok && data.ok) {
        var ticket = _masterTickets.find(function(x) { return x.id === id; });
        if (ticket) {
          ticket.title = title;
          ticket.description = description;
          ticket.priority = priority;
          ticket.status = status;
          ticket.atendente_name = atendente_name || null;
          ticket.updated_at = new Date().toISOString();
        }
        closeMM('ticketDetailModal');
        renderKanban(_masterTickets);
        showToast('✅ Chamado atualizado!', 'success');
      } else {
        showToast('Erro: ' + (data.error || 'Falha ao salvar.'), 'error');
      }
    } catch(e) {
      showToast('Erro de conexão.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save" style="margin-right:6px;"></i>Salvar'; }
    }
  }

  async function loadClientSupportTickets(empresaId) {
    const container = document.getElementById('detSupportTickets');
    if (!container) return;
    try {
      const res = await fetch('/master/api/support/tickets?empresa_id=' + encodeURIComponent(empresaId));
      const data = await res.json().catch(() => ({ tickets: [] }));
      const tickets = data.tickets || [];
      if (tickets.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:24px;color:#9ca3af;font-size:13px;"><i class="fas fa-ticket-alt" style="font-size:24px;display:block;margin-bottom:8px;opacity:0.3;"></i>Nenhum chamado para este cliente</div>';
        return;
      }
      const now = Date.now();
      container.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;">' +
        tickets.sort(function(a,b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); }).map(function(t) {
          const pc = PRIORITY_COLORS[t.priority] || '#6c757d';
          const pl = PRIORITY_LABELS_PT[t.priority] || t.priority;
          const overdue = t.due_at && new Date(t.due_at).getTime() < now && t.status !== 'Resolvida';
          return '<div style="padding:10px 12px;background:#f8f9fa;border-radius:8px;border:1px solid #e9ecef;">' +
            '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">' +
            '<div style="font-size:12px;font-weight:700;color:#1B4F72;">' + esc(t.title || '—') + '</div>' +
            '<span style="font-size:10px;font-weight:700;color:' + pc + ';white-space:nowrap;">' + pl + '</span></div>' +
            '<div style="display:flex;gap:8px;margin-top:6px;align-items:center;">' +
            '<span style="font-size:10px;background:#e9ecef;color:#374151;padding:1px 7px;border-radius:10px;font-weight:600;">' + esc(t.status) + '</span>' +
            (overdue ? '<span style="font-size:10px;color:#dc2626;font-weight:700;"><i class="fas fa-exclamation-triangle"></i> SLA vencido</span>' : '') +
            '<span style="font-size:10px;color:#9ca3af;margin-left:auto;">' + new Date(t.created_at).toLocaleDateString('pt-BR') + '</span></div></div>';
        }).join('') + '</div>';
    } catch {
      container.innerHTML = '<div style="text-align:center;padding:16px;color:#9ca3af;font-size:12px;">Erro ao carregar chamados</div>';
    }
  }

  function openNovoTicketMasterModal(cliId) {
    _newTicketCliId = cliId || _curCliId || null;
    const modal = document.getElementById('novoTicketMasterModal');
    if (modal) { modal.style.display = 'flex'; modal.classList.add('open'); }
  }

  function openNovoTicketMasterForClient(cliId) {
    openNovoTicketMasterModal(cliId === '_curCliId' ? _curCliId : cliId);
  }

  async function salvarTicketMaster() {
    const title       = document.getElementById('mtTitle')?.value?.trim();
    const description = document.getElementById('mtDescription')?.value?.trim();
    const priority    = document.getElementById('mtPriority')?.value || 'medium';
    const empresaId   = document.getElementById('mtEmpresa')?.value || _newTicketCliId || '';
    // Resolve company name to always show fantasia/empresa, not the ID code
    const cliRecord   = masterClientsData.find(function(c) { return c.id === empresaId; });
    const empresaName = cliRecord ? (cliRecord.fantasia || cliRecord.empresa || '') : '';
    if (!title)       { showToast('Informe o título do chamado.', 'error'); return; }
    if (!description) { showToast('Informe a descrição.', 'error'); return; }
    const btn = document.getElementById('btnSalvarTicketMaster');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      const res = await fetch('/master/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, priority, empresa_id: empresaId, empresa_name: empresaName || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        const modal = document.getElementById('novoTicketMasterModal');
        if (modal) { modal.style.display = 'none'; modal.classList.remove('open'); }
        showToast('✅ Chamado criado!', 'success');
        loadSupportTickets();
        if (_curDetTab === 'suporte') loadClientSupportTickets(_curCliId);
      } else {
        showToast('Erro ao criar chamado: ' + (data.error || ''), 'error');
      }
    } catch { showToast('Erro de conexão.', 'error'); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Criar'; } }
  }
  </script>
  `

  return c.html(masterLayout(`${totalClients} Clientes`, content, loggedUser?.name || auth.name))
})

// ── API: GET /api/support/tickets ─────────────────────────────────────────────
// Default: returns ALL tickets (global, no filter).
// Optional management filters via query params:
//   empresa_id, status, priority, only_overdue=1, limit (max 500, default 200)
app.get('/api/support/tickets', async (c) => {
  if (!await isAuthenticated(c)) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env?.DB || null

  const empresaId  = c.req.query('empresa_id')  || ''
  const status     = c.req.query('status')       || ''
  const priority   = c.req.query('priority')     || ''
  const onlyOverdue = c.req.query('only_overdue') === '1'
  const limitRaw   = parseInt(c.req.query('limit') || '200', 10)
  const limit      = isNaN(limitRaw) || limitRaw < 1 ? 200 : Math.min(limitRaw, 500)

  // Try D1 first, fall back to empty list (no per-master-session tenant store)
  if (db) {
    try {
      const conditions: string[] = []
      const bindings:   any[]    = []

      if (empresaId) { conditions.push('empresa_id = ?');  bindings.push(empresaId) }
      if (status)    { conditions.push('status = ?');      bindings.push(status) }
      if (priority)  { conditions.push('priority = ?');    bindings.push(priority) }
      if (onlyOverdue) {
        conditions.push("status != 'Resolvida' AND due_at IS NOT NULL AND due_at < datetime('now')")
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
      bindings.push(limit)
      const stmt = db.prepare(`SELECT * FROM support_tickets ${where} ORDER BY updated_at DESC LIMIT ?`)
      const res = bindings.length > 0 ? await stmt.bind(...bindings).all() : await stmt.all()
      const tickets: any[] = res.results || []
      // Back-fill empresa_name for legacy rows (created before migration 0032)
      await fillMissingEmpresaNames(db, tickets)
      return c.json({ ok: true, tickets })
    } catch {
      return c.json({ ok: true, tickets: [] })
    }
  }
  return c.json({ ok: true, tickets: [] })
})

// ── API: GET /api/support/tickets/:id ────────────────────────────────────────
app.get('/api/support/tickets/:id', async (c) => {
  if (!await isAuthenticated(c)) return c.json({ error: 'Unauthorized' }, 401)
  const db       = c.env?.DB || null
  const ticketId = c.req.param('id')

  if (db) {
    try {
      const row: any = await db.prepare('SELECT * FROM support_tickets WHERE id = ?').bind(ticketId).first()
      if (!row) return c.json({ ok: false, error: 'Chamado não encontrado' }, 404)
      await fillMissingEmpresaNames(db, [row])
      return c.json({ ok: true, ticket: row })
    } catch {
      return c.json({ ok: false, error: 'Erro ao buscar chamado' }, 500)
    }
  }
  return c.json({ ok: false, error: 'Banco de dados indisponível' }, 503)
})

/**
 * Back-fills empresa_name in-place for rows that were created before
 * migration 0032 (i.e., empresa_name is NULL or empty).
 * Uses a single query to resolve all missing IDs at once.
 */
async function fillMissingEmpresaNames(db: D1Database, tickets: any[]): Promise<void> {
  const missing = tickets.filter(t => !t.empresa_name)
  if (missing.length === 0) return
  const ids = [...new Set(missing.map((t: any) => t.empresa_id as string))]
  try {
    // Monta a lista de placeholders (?,?,…) para query parametrizada segura.
    // `ids` provém de resultados D1 (não de entrada do usuário); os valores
    // são vinculados via .bind(...ids) evitando injeção SQL.
    const placeholders = ids.map(() => '?').join(',')
    const usersRes = await db.prepare(
      `SELECT id, empresa FROM registered_users WHERE id IN (${placeholders}) AND (owner_id IS NULL OR owner_id = '')`
    ).bind(...ids).all()
    const nameMap: Record<string, string> = {}
    for (const u of (usersRes.results || []) as any[]) {
      nameMap[u.id] = u.empresa
    }
    for (const t of missing) {
      t.empresa_name = nameMap[t.empresa_id] || t.empresa_id || ''
    }
  } catch {
    // Non-fatal: empresa_name will remain null; frontend falls back to masterClientsData lookup
  }
}

// ── API: POST /api/support/tickets ────────────────────────────────────────────
app.post('/api/support/tickets', async (c) => {
  const auth = await isAuthenticated(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const db   = c.env?.DB || null
  const body = await c.req.json().catch(() => null) as any
  if (!body || !body.title) return c.json({ ok: false, error: 'Título é obrigatório' }, 400)

  const masterUser = masterUsers.find(u => u.email === auth.email)
  const actorId   = masterUser?.id   || null
  const actorName = masterUser?.name || auth.name

  const SLA_MS: Record<string, number> = {
    critical: 4  * 60 * 60 * 1000,
    high:     24 * 60 * 60 * 1000,
    medium:   72 * 60 * 60 * 1000,
    low:      7  * 24 * 60 * 60 * 1000,
  }
  const priority   = ['low','medium','high','critical'].includes(body.priority) ? body.priority : 'medium'
  const id         = 'tkt_' + Date.now() + '_' + Math.random().toString(36).slice(2,7)
  const now        = new Date().toISOString()
  const dueAt      = new Date(Date.now() + (SLA_MS[priority] || SLA_MS.medium)).toISOString()
  const empresaId  = body.empresa_id || ''
  // Resolve company name from masterClients list (already rebuilt on page load)
  const cliRecord  = masterClients.find(cl => cl.id === empresaId)
  const empresaName = body.empresa_name || (cliRecord ? (cliRecord.fantasia || cliRecord.empresa) : null) || empresaId || null

  const ticket = {
    id,
    empresa_id:          empresaId,
    empresa_name:        empresaName,
    user_id:             actorId || 'master',
    created_by_name:     actorName,
    created_by_email:    auth.email,
    assigned_to_user_id: null,
    atendente_id:        actorId,
    atendente_name:      actorName || null,
    title:               body.title,
    description:         body.description || '',
    priority, status: 'Criada',
    created_at: now, updated_at: now, resolved_at: null,
    due_at: dueAt, last_activity_at: now,
  }

  if (db) {
    try {
      const keys = Object.keys(ticket)
      const vals = Object.values(ticket)
      await db.prepare(
        `INSERT INTO support_tickets (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
      ).bind(...vals).run()
    } catch (e: any) {
      console.error(`[MASTER][SUPPORT][CRÍTICO] Falha ao persistir ticket ${id}: ${e?.message}`)
      return c.json({ ok: false, error: 'Erro ao salvar chamado no banco de dados' }, 500)
    }
  }

  return c.json({ ok: true, ticket })
})

// ── API: PATCH /api/support/tickets/:id ───────────────────────────────────────
app.patch('/api/support/tickets/:id', async (c) => {
  if (!await isAuthenticated(c)) return c.json({ error: 'Unauthorized' }, 401)
  const db       = c.env?.DB || null
  const ticketId = c.req.param('id')
  const body     = await c.req.json().catch(() => null) as any
  if (!body) return c.json({ ok: false, error: 'Dados inválidos' }, 400)

  const now = new Date().toISOString()
  const updates: Record<string, any> = { updated_at: now, last_activity_at: now }
  if (body.status) {
    const validStatuses = ['Criada','Analisando','N1','N2','N3','Resolvendo','Resolvida']
    if (!validStatuses.includes(body.status)) return c.json({ ok: false, error: 'Status inválido' }, 400)
    updates.status = body.status
    if (body.status === 'Resolvida') updates.resolved_at = now
  }
  if (body.priority) {
    const validPriorities = ['low','medium','high','critical']
    if (!validPriorities.includes(body.priority)) return c.json({ ok: false, error: 'Prioridade inválida' }, 400)
    updates.priority = body.priority
  }
  if (body.title !== undefined)              updates.title              = String(body.title).trim()
  if (body.description !== undefined)        updates.description        = String(body.description)
  if (body.atendente_id !== undefined)       updates.atendente_id       = body.atendente_id
  if (body.atendente_name !== undefined)     updates.atendente_name     = body.atendente_name
  if (body.assigned_to_user_id !== undefined) updates.assigned_to_user_id = body.assigned_to_user_id

  if (db) {
    try {
      const keys = Object.keys(updates)
      const vals = Object.values(updates)
      const setClause = keys.map(k => `${k} = ?`).join(', ')
      await db.prepare(`UPDATE support_tickets SET ${setClause} WHERE id = ?`).bind(...vals, ticketId).run()
    } catch (e: any) {
      console.error(`[MASTER][SUPPORT][CRÍTICO] Falha ao atualizar ticket ${ticketId}: ${e?.message}`)
      return c.json({ ok: false, error: 'Erro ao atualizar chamado' }, 500)
    }
  }

  return c.json({ ok: true })
})

// ── Helper: tabela de usuários master ─────────────────────────────────────────
function buildMasterUsersTable(users: typeof masterUsers): string {
  if (users.length === 0) {
    return `<div style="text-align:center;padding:40px;color:#9ca3af;">
      <i class="fas fa-user-shield" style="font-size:36px;display:block;margin-bottom:12px;opacity:0.3;"></i>
      <div style="font-size:14px;font-weight:700;color:#374151;">Nenhum usuário master cadastrado</div>
      <div style="font-size:12px;margin-top:6px;">Clique em "Adicionar Usuário" para criar o primeiro acesso.</div>
    </div>`
  }
  const roleLabel: Record<string,{label:string,color:string,bg:string}> = {
    superadmin: { label:'Super Admin',  color:'#7c3aed', bg:'#f5f3ff' },
    viewer:     { label:'Visualizador', color:'#2980B9', bg:'#e8f4fd' },
  }
  let html = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr style="background:#f8f9fa;border-bottom:2px solid #e9ecef;">
      <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Nome</th>
      <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">E-mail</th>
      <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Perfil</th>
      <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Status</th>
      <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Criado em</th>
      <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Último login</th>
      <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Ação</th>
    </tr></thead><tbody>`

  users.forEach(u => {
    const rl = roleLabel[u.role] || roleLabel.viewer
    html += `<tr style="border-bottom:1px solid #f1f3f5;">
      <td style="padding:11px 14px;"><div style="font-weight:700;color:#374151;">${u.name}</div></td>
      <td style="padding:11px 14px;color:#2980B9;font-size:12px;">${u.email}</td>
      <td style="padding:11px 14px;text-align:center;"><span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${rl.bg};color:${rl.color};">${rl.label}</span></td>
      <td style="padding:11px 14px;text-align:center;"><span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${u.active?'#f0fdf4':'#e9ecef'};color:${u.active?'#16a34a':'#6c757d'};">${u.active?'Ativo':'Inativo'}</span></td>
      <td style="padding:11px 14px;font-size:12px;color:#374151;">${new Date(u.createdAt+'T12:00:00').toLocaleDateString('pt-BR')}</td>
      <td style="padding:11px 14px;font-size:12px;color:#6c757d;">${u.lastLogin ? new Date(u.lastLogin).toLocaleString('pt-BR') : '— nunca —'}</td>
      <td style="padding:11px 14px;text-align:center;">
        <button data-action="toggle-master-user" data-id="${u.id}" style="font-size:11px;font-weight:600;border-radius:6px;padding:5px 12px;cursor:pointer;border:1px solid ${u.active?'#fecaca':'#86efac'};background:${u.active?'#fef2f2':'#f0fdf4'};color:${u.active?'#dc2626':'#16a34a'};">
          <i class="fas ${u.active?'fa-ban':'fa-check'}"></i> ${u.active?'Desativar':'Ativar'}
        </button>
      </td>
    </tr>`
  })
  html += '</tbody></table></div>'
  return html
}

// ── Página de Login ────────────────────────────────────────────────────────────
function masterLoginPage(errMsg: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Master Admin — Login</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
  <style>
    *{box-sizing:border-box;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#0f0a2e,#1a0f3d,#0d1b2a);min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;}
    .form-control{width:100%;padding:11px 14px;border:1.5px solid #334155;border-radius:10px;font-size:13px;outline:none;transition:border 0.2s;box-sizing:border-box;background:#1e293b;color:white;}
    .form-control:focus{border-color:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,0.2);}
    .form-control::placeholder{color:#64748b;}
    .btn-master{background:linear-gradient(135deg,#7c3aed,#5b21b6);color:white;padding:13px;border-radius:10px;font-size:14px;font-weight:700;border:none;cursor:pointer;width:100%;transition:opacity 0.2s;letter-spacing:0.3px;}
    .btn-master:hover{opacity:0.9;}
    .btn-master:disabled{opacity:0.6;cursor:not-allowed;}
    @keyframes fadeIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    .card-login{animation:fadeIn 0.4s ease;}
  </style>
</head>
<body>
  <div class="card-login" style="width:100%;max-width:380px;padding:20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="width:64px;height:64px;background:linear-gradient(135deg,#7c3aed,#5b21b6);border-radius:18px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;box-shadow:0 12px 36px rgba(124,58,237,0.5);">
        <i class="fas fa-shield-alt" style="color:white;font-size:26px;"></i>
      </div>
      <h1 style="font-size:22px;font-weight:900;color:white;margin:0 0 4px;">Master Admin</h1>
      <p style="font-size:12px;color:#64748b;margin:0;">Acesso restrito — PCP Planner</p>
    </div>

    <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;padding:28px;">
      ${errMsg ? `<div style="background:#2d1515;border:1px solid #7f1d1d;border-radius:8px;padding:10px 14px;margin-bottom:18px;display:flex;align-items:center;gap:8px;"><i class="fas fa-exclamation-circle" style="color:#ef4444;flex-shrink:0;"></i><span style="font-size:13px;color:#fca5a5;">${errMsg}</span></div>` : ''}

      <form method="POST" action="/master/login" onsubmit="handleSubmit(event)">
        <div style="margin-bottom:16px;">
          <label style="display:block;font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:6px;">E-mail</label>
          <div style="position:relative;">
            <i class="fas fa-envelope" style="position:absolute;left:13px;top:50%;transform:translateY(-50%);color:#475569;font-size:12px;"></i>
            <input class="form-control" type="email" name="email" placeholder="master@syncrus.com.br" required autofocus style="padding-left:38px;">
          </div>
        </div>
        <div style="margin-bottom:24px;">
          <label style="display:block;font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:6px;">Senha</label>
          <div style="position:relative;">
            <i class="fas fa-lock" style="position:absolute;left:13px;top:50%;transform:translateY(-50%);color:#475569;font-size:12px;"></i>
            <input class="form-control" type="password" name="pwd" id="pwdInput" placeholder="••••••••" required style="padding-left:38px;padding-right:42px;">
            <button type="button" onclick="togglePwd()" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#475569;"><i class="fas fa-eye" id="eyeIcon"></i></button>
          </div>
        </div>
        <button type="submit" class="btn-master" id="loginBtn">
          <i class="fas fa-shield-alt" style="margin-right:8px;"></i>Acessar Master Admin
        </button>
      </form>
    </div>

    <div style="text-align:center;margin-top:20px;">
      <a href="/" style="font-size:12px;color:#475569;text-decoration:none;"><i class="fas fa-arrow-left" style="margin-right:4px;"></i>Voltar ao sistema</a>
    </div>
  </div>
  <script>
  function handleSubmit(e) {
    const btn = document.getElementById('loginBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Verificando...';
    btn.disabled = true;
  }
  function togglePwd() {
    const inp = document.getElementById('pwdInput');
    const ico = document.getElementById('eyeIcon');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    ico.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
  }
  </script>
</body>
</html>`
}

export default app
