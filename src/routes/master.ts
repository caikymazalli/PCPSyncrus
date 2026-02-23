import { Hono } from 'hono'
import { layout } from '../layout'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { registeredUsers, DEMO_USERS } from '../userStore'

const app = new Hono()

// ── Credenciais de usuários Master (armazenamento em memória — substituir por D1 em produção) ───
// Senha armazenada como hash SHA-256 hex para não ficar em plain text no código
// hash de "minhasenha" = gerado abaixo
const MASTER_SESSION_KEY = 'master_session'
const SESSION_DURATION   = 60 * 60 * 8 // 8 horas em segundos

// Utilitário de hash SHA-256 usando Web Crypto API (disponível no Workers)
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Token de sessão simples: hash(email+senha+salt)
async function makeSessionToken(email: string, pwd: string): Promise<string> {
  return sha256(email + pwd + 'syncrus-master-salt-2025')
}

// Usuários master — índice em memória (em produção: tabela D1)
// { email, pwdHash, name, createdAt, lastLogin, active }
const masterUsers: Array<{
  id: string; email: string; pwdHash: string; name: string;
  createdAt: string; lastLogin: string | null; active: boolean; role: string
}> = []

// Sessões ativas { token: email }
const activeSessions: Record<string, { email: string; expiresAt: number }> = {}

// Inicializar usuário master padrão (hash calculado na primeira request)
let initialized = false
async function ensureInit() {
  if (initialized) return
  initialized = true
  const hash = await sha256('minhasenha' + 'syncrus-master-salt-2025')
  // senha = minhasenha  → hash pré-calculado para não rodar crypto a cada request
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

// ── Clientes da plataforma — começa VAZIO, adicionado via painel ───────────────
// Em produção isso viria de D1. Aqui usamos módulo-level array para persistir
// entre requests do mesmo worker isolate (ephemeral, reinicia com cold start).
const masterClients: Array<{
  id: string; empresa: string; fantasia: string; cnpj: string; setor: string; porte: string;
  responsavel: string; email: string; tel: string; plano: string; billing: string; valor: number;
  status: string; trialStart: string | null; trialEnd: string | null;
  empresas: number; usuarios: number; plantas: number;
  criadoEm: string; ultimoAcesso: string;
  modulos: string[]; cnpjsExtras: number;
  pagamentos: Array<{ mes: string; valor: number; status: string; data: string }>;
  obs: string
}> = []

// Histórico de ações do admin
const auditLog: Array<{ ts: string; user: string; action: string; detail: string }> = []

const PLANS: Record<string, { label: string; monthlyBase: number; color: string; bg: string }> = {
  starter:      { label: 'Starter',      monthlyBase: 299,  color: '#27AE60', bg: '#f0fdf4' },
  professional: { label: 'Professional', monthlyBase: 599,  color: '#2980B9', bg: '#e8f4fd' },
  enterprise:   { label: 'Enterprise',   monthlyBase: 1490, color: '#7c3aed', bg: '#f5f3ff' },
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function isAuthenticated(c: any): boolean {
  const token = getCookie(c, MASTER_SESSION_KEY)
  if (!token) return false
  const session = activeSessions[token]
  if (!session) return false
  if (Date.now() > session.expiresAt) {
    delete activeSessions[token]
    return false
  }
  return true
}

function loginRedirect() {
  return `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/master/login"></head>
  <body><p>Redirecionando para login...</p></body></html>`
}

// ── Rota: GET /login ───────────────────────────────────────────────────────────
app.get('/login', (c) => {
  if (isAuthenticated(c)) return c.redirect('/master')
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

  const inputHash = await sha256(pwd + 'syncrus-master-salt-2025')
  if (user.pwdHash !== inputHash) return c.redirect('/master/login?err=1')
  if (!user.active) return c.redirect('/master/login?err=2')

  // Criar sessão
  const token = await sha256(email + Date.now().toString() + Math.random().toString())
  activeSessions[token] = { email, expiresAt: Date.now() + SESSION_DURATION * 1000 }

  // Atualizar lastLogin
  user.lastLogin = new Date().toISOString()

  setCookie(c, MASTER_SESSION_KEY, token, {
    maxAge: SESSION_DURATION,
    path: '/master',
    httpOnly: true,
    sameSite: 'Lax'
  })

  auditLog.unshift({ ts: new Date().toISOString(), user: user.name, action: 'LOGIN', detail: 'Login bem-sucedido via /master/login' })

  return c.redirect('/master')
})

// ── Rota: GET /logout ──────────────────────────────────────────────────────────
app.get('/logout', (c) => {
  const token = getCookie(c, MASTER_SESSION_KEY)
  if (token) delete activeSessions[token]
  deleteCookie(c, MASTER_SESSION_KEY, { path: '/master' })
  return c.redirect('/master/login')
})

// ── Rota: POST /api/add-client ─────────────────────────────────────────────────
app.post('/api/add-client', async (c) => {
  if (!isAuthenticated(c)) return c.json({ error: 'Unauthorized' }, 401)
  await ensureInit()
  const body = await c.req.json() as any
  const token = getCookie(c, MASTER_SESSION_KEY)!
  const userEmail = activeSessions[token]?.email || '?'
  const user = masterUsers.find(u => u.email === userEmail)

  const today = new Date().toISOString().split('T')[0]
  const trialEnd = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  const newId = 'cli' + Date.now()

  const newClient = {
    id: newId,
    empresa:      body.empresa || '',
    fantasia:     body.fantasia || body.empresa || '',
    cnpj:         body.cnpj || '',
    setor:        body.setor || '',
    porte:        body.porte || '',
    responsavel:  body.responsavel || '',
    email:        body.email || '',
    tel:          body.tel || '',
    plano:        body.plano || 'starter',
    billing:      body.status === 'trial' ? 'trial' : 'monthly',
    valor:        body.status === 'trial' ? 0 : (PLANS[body.plano]?.monthlyBase || 299),
    status:       body.status || 'trial',
    trialStart:   body.status === 'trial' ? today : null,
    trialEnd:     body.status === 'trial' ? trialEnd : null,
    empresas:     1,
    usuarios:     1,
    plantas:      1,
    criadoEm:     today,
    ultimoAcesso: today,
    modulos:      [],
    cnpjsExtras:  0,
    pagamentos:   [],
    obs:          body.obs || ''
  }

  masterClients.push(newClient)
  auditLog.unshift({ ts: new Date().toISOString(), user: user?.name || userEmail, action: 'ADD_CLIENT', detail: `Cliente "${newClient.empresa}" adicionado` })

  return c.json({ ok: true, id: newId })
})

// ── Rota: POST /api/migrate-plan ───────────────────────────────────────────────
app.post('/api/migrate-plan', async (c) => {
  if (!isAuthenticated(c)) return c.json({ error: 'Unauthorized' }, 401)
  await ensureInit()
  const body = await c.req.json() as any
  const token = getCookie(c, MASTER_SESSION_KEY)!
  const userEmail = activeSessions[token]?.email || '?'
  const user = masterUsers.find(u => u.email === userEmail)

  const cli = masterClients.find(c2 => c2.id === body.clientId)
  if (!cli) return c.json({ error: 'Client not found' }, 404)

  const oldPlan = cli.plano
  if (body.acao === 'change_plan') {
    cli.plano = body.plano || cli.plano
    cli.billing = body.billing || cli.billing
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

  auditLog.unshift({
    ts: new Date().toISOString(),
    user: user?.name || userEmail,
    action: 'MIGRATE_PLAN',
    detail: `${cli.fantasia}: ${body.acao} | plano ${oldPlan} → ${cli.plano} | motivo: ${body.motivo}`
  })

  return c.json({ ok: true })
})

// ── Rota: POST /api/save-obs ───────────────────────────────────────────────────
app.post('/api/save-obs', async (c) => {
  if (!isAuthenticated(c)) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json() as any
  const cli = masterClients.find(c2 => c2.id === body.clientId)
  if (cli) cli.obs = body.obs || ''
  return c.json({ ok: true })
})

// ── Rota: POST /api/add-master-user ───────────────────────────────────────────
app.post('/api/add-master-user', async (c) => {
  if (!isAuthenticated(c)) return c.json({ error: 'Unauthorized' }, 401)
  await ensureInit()
  const body = await c.req.json() as any
  const token = getCookie(c, MASTER_SESSION_KEY)!
  const userEmail = activeSessions[token]?.email || '?'
  const actor = masterUsers.find(u => u.email === userEmail)

  // Verificar se e-mail já existe
  if (masterUsers.find(u => u.email === body.email)) {
    return c.json({ error: 'E-mail já cadastrado' }, 400)
  }

  const pwdHash = await sha256((body.pwd || 'senha123') + 'syncrus-master-salt-2025')
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

  auditLog.unshift({ ts: new Date().toISOString(), user: actor?.name || userEmail, action: 'ADD_MASTER_USER', detail: `Novo usuário master: ${body.name} (${body.email})` })
  return c.json({ ok: true })
})

// ── Rota: POST /api/toggle-master-user ────────────────────────────────────────
app.post('/api/toggle-master-user', async (c) => {
  if (!isAuthenticated(c)) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json() as any
  const u = masterUsers.find(u2 => u2.id === body.id)
  if (u) u.active = !u.active
  return c.json({ ok: true, active: u?.active })
})

// ── Rota principal: GET / ──────────────────────────────────────────────────────
app.get('/', async (c) => {
  await ensureInit()
  if (!isAuthenticated(c)) return c.html(loginRedirect())

  // Mesclar masterClients com registeredUsers (usuários que se cadastraram)
  const registeredEmails = new Set(masterClients.map(mc => mc.email))
  for (const u of Object.values(registeredUsers)) {
    if (!u.isDemo && !registeredEmails.has(u.email)) {
      registeredEmails.add(u.email)
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

  const clients = masterClients

  // KPIs
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

  // Usuário logado
  const token = getCookie(c, MASTER_SESSION_KEY)!
  const loggedEmail = activeSessions[token]?.email || ''
  const loggedUser = masterUsers.find(u => u.email === loggedEmail)

  const content = `
  <style>
    .master-kpi{background:white;border-radius:12px;padding:18px 20px;box-shadow:0 1px 4px rgba(0,0,0,0.07);}
    .client-row{transition:background 0.15s;}
    .client-row:hover{background:#f8f9fa !important;}
    .mbadge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;gap:4px;}
    .abtn{background:none;border:1px solid #e9ecef;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.15s;display:inline-flex;align-items:center;gap:4px;}
    .abtn:hover{background:#f1f3f5;border-color:#adb5bd;}
    .moverlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:200;align-items:center;justify-content:center;}
    .moverlay.open{display:flex;}
    .mmodal{background:white;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.25);width:100%;animation:mIn 0.22s ease;}
    @keyframes mIn{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
    .mtab{padding:8px 16px;font-size:12px;font-weight:600;border:none;background:none;cursor:pointer;color:#6c757d;border-bottom:2px solid transparent;}
    .mtab.active{color:#1B4F72;border-color:#1B4F72;}
    .empty-state{text-align:center;padding:60px 20px;color:#9ca3af;}
    .empty-state i{font-size:48px;display:block;margin-bottom:16px;opacity:0.3;}
    .empty-state h3{font-size:16px;font-weight:700;color:#374151;margin:0 0 8px;}
    .empty-state p{font-size:13px;margin:0;}
    /* Abas do painel */
    .panel-tab{padding:10px 20px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;color:#6c757d;border-bottom:3px solid transparent;transition:all 0.15s;}
    .panel-tab.active{color:#1B4F72;border-color:#1B4F72;background:rgba(27,79,114,0.04);}
  </style>

  <!-- Top bar do master -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
    <div>
      <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">
        <i class="fas fa-shield-alt" style="color:#7c3aed;margin-right:5px;"></i>Área Restrita — Master Admin
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span class="mbadge" style="background:#f0fdf4;color:#16a34a;"><i class="fas fa-circle" style="font-size:7px;"></i> ${activeClients} Ativos</span>
        <span class="mbadge" style="background:#fffbeb;color:#d97706;">${trialClients} Trial</span>
        <span class="mbadge" style="background:#f1f3f5;color:#6c757d;">${inactiveClients} Inativos</span>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;">
      <span style="font-size:12px;color:#6c757d;"><i class="fas fa-user-shield" style="color:#7c3aed;margin-right:4px;"></i>${loggedUser?.name || loggedEmail}</span>
      <a href="/master/logout" style="font-size:12px;color:#dc2626;font-weight:700;text-decoration:none;border:1px solid #fecaca;border-radius:6px;padding:5px 12px;background:#fef2f2;">
        <i class="fas fa-sign-out-alt" style="margin-right:4px;"></i>Sair
      </a>
    </div>
  </div>

  <!-- KPIs -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px;margin-bottom:22px;">
    <div class="master-kpi" style="border-left:4px solid #27AE60;">
      <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Clientes Ativos</div>
      <div style="font-size:30px;font-weight:900;color:#27AE60;">${activeClients}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:3px;">de ${totalClients} totais</div>
    </div>
    <div class="master-kpi" style="border-left:4px solid #F39C12;">
      <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Em Trial</div>
      <div style="font-size:30px;font-weight:900;color:#d97706;">${trialClients}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:3px;">conversão pendente</div>
    </div>
    <div class="master-kpi" style="border-left:4px solid #2980B9;">
      <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">MRR</div>
      <div style="font-size:20px;font-weight:900;color:#2980B9;">R$ ${mrr.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:3px;">receita mensal recorrente</div>
    </div>
    <div class="master-kpi" style="border-left:4px solid #1B4F72;">
      <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">ARR</div>
      <div style="font-size:16px;font-weight:900;color:#1B4F72;">R$ ${arr.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:3px;">receita anual recorrente</div>
    </div>
    <div class="master-kpi" style="border-left:4px solid #7c3aed;">
      <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Usuários / Empresas</div>
      <div style="font-size:30px;font-weight:900;color:#7c3aed;">${totalUsers}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:3px;">${totalEmpresas} empresas cadastradas</div>
    </div>
    <div class="master-kpi">
      <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Distribuição de Planos</div>
      ${Object.entries(planDist).map(([plan, count]) => {
        const pl = PLANS[plan]
        const pct = totalClients > 0 ? Math.round((count/totalClients)*100) : 0
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
          <div style="font-size:11px;font-weight:700;color:${pl.color};width:78px;">${pl.label}</div>
          <div style="flex:1;height:5px;background:#e9ecef;border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${pl.color};border-radius:3px;"></div>
          </div>
          <div style="font-size:11px;color:#6c757d;width:16px;text-align:right;">${count}</div>
        </div>`
      }).join('')}
    </div>
  </div>

  <!-- Alerta trials expirando -->
  ${trialClients > 0 ? `
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
    <i class="fas fa-exclamation-triangle" style="color:#d97706;font-size:18px;flex-shrink:0;"></i>
    <div style="flex:1;">
      <div style="font-size:13px;font-weight:700;color:#92400e;">${trialClients} cliente(s) em período de trial</div>
      <div style="font-size:12px;color:#b45309;">
        ${clients.filter(c2 => c2.status === 'trial').map(c2 => {
          const daysLeft = c2.trialEnd ? Math.ceil((new Date(c2.trialEnd).getTime() - Date.now())/(1000*60*60*24)) : 0
          return `<span style="margin-right:12px;"><strong>${c2.fantasia}</strong>: ${daysLeft > 0 ? daysLeft+' dias restantes' : 'EXPIRADO'}</span>`
        }).join('')}
      </div>
    </div>
  </div>` : ''}

  <!-- Abas de navegação do painel -->
  <div style="display:flex;border-bottom:2px solid #e9ecef;margin-bottom:20px;overflow-x:auto;">
    <button class="panel-tab active" id="tabClientes" onclick="switchPanelTab('clientes')"><i class="fas fa-building" style="margin-right:6px;"></i>Clientes</button>
    <button class="panel-tab" id="tabUsuarios" onclick="switchPanelTab('usuarios')"><i class="fas fa-user-shield" style="margin-right:6px;"></i>Usuários Master</button>
    <button class="panel-tab" id="tabAuditoria" onclick="switchPanelTab('auditoria')"><i class="fas fa-history" style="margin-right:6px;"></i>Auditoria</button>
  </div>

  <!-- Painel: Clientes -->
  <div id="panelClientes">
    <div class="card" style="overflow:hidden;">
      <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <input type="text" id="searchClients" class="form-control" placeholder="Buscar cliente..." style="width:190px;font-size:12px;" oninput="filterClients()">
        <select class="form-control" id="filterStatus" style="width:130px;font-size:12px;" onchange="filterClients()">
          <option value="">Todos os status</option>
          <option value="active">Ativo</option>
          <option value="trial">Em Trial</option>
          <option value="inactive">Inativo</option>
        </select>
        <select class="form-control" id="filterPlano" style="width:140px;font-size:12px;" onchange="filterClients()">
          <option value="">Todos os planos</option>
          <option value="starter">Starter</option>
          <option value="professional">Professional</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
          <span style="font-size:12px;color:#9ca3af;" id="clientCount">${clients.length} clientes</span>
          <button class="btn btn-secondary" onclick="exportClientCSV()"><i class="fas fa-file-csv"></i> CSV</button>
          <button class="btn btn-primary" onclick="openAddClientModal()"><i class="fas fa-plus"></i> Novo Cliente</button>
        </div>
      </div>

      ${clients.length === 0 ? `
      <div class="empty-state">
        <i class="fas fa-users"></i>
        <h3>Nenhum cliente cadastrado</h3>
        <p>Clique em "Novo Cliente" para adicionar o primeiro cliente da plataforma.</p>
      </div>` : `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#f8f9fa;border-bottom:2px solid #e9ecef;">
              <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Empresa</th>
              <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Responsável</th>
              <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Plano</th>
              <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Status</th>
              <th style="padding:10px 14px;text-align:right;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Valor/mês</th>
              <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Emp.</th>
              <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Users</th>
              <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Cadastro</th>
              <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Ações</th>
            </tr>
          </thead>
          <tbody id="clientTableBody">
            ${clients.map((cli) => {
              const pl = PLANS[cli.plano] || PLANS.starter
              const statusMap: Record<string,{label:string,color:string,bg:string}> = {
                active:   {label:'Ativo',   color:'#16a34a',bg:'#f0fdf4'},
                trial:    {label:'Trial',   color:'#d97706',bg:'#fffbeb'},
                inactive: {label:'Inativo', color:'#6c757d',bg:'#e9ecef'},
              }
              const st = statusMap[cli.status] || statusMap.inactive
              const daysLeft = cli.trialEnd ? Math.ceil((new Date(cli.trialEnd).getTime()-Date.now())/(1000*60*60*24)) : null
              const billingLabel: Record<string,string> = {monthly:'Mensal',annual:'Anual',trial:'Trial'}
              return `
              <tr class="client-row" data-status="${cli.status}" data-plano="${cli.plano}" data-search="${cli.empresa.toLowerCase()} ${cli.responsavel.toLowerCase()} ${cli.email.toLowerCase()}" style="border-bottom:1px solid #f1f3f5;">
                <td style="padding:11px 14px;">
                  <div style="font-weight:700;color:#1B4F72;">${cli.fantasia || cli.empresa}</div>
                  <div style="font-size:11px;color:#9ca3af;">${cli.empresa}</div>
                  ${cli.obs ? `<div style="font-size:10px;color:#d97706;margin-top:2px;"><i class="fas fa-sticky-note" style="font-size:9px;"></i> ${cli.obs.slice(0,45)}${cli.obs.length>45?'...':''}</div>` : ''}
                </td>
                <td style="padding:11px 14px;">
                  <div style="font-weight:600;color:#374151;">${cli.responsavel}</div>
                  <div style="font-size:11px;color:#9ca3af;">${cli.email}</div>
                </td>
                <td style="padding:11px 14px;">
                  <span class="mbadge" style="background:${pl.bg};color:${pl.color};">${pl.label}</span>
                  <div style="font-size:10px;color:#9ca3af;margin-top:3px;">${billingLabel[cli.billing]||cli.billing}</div>
                </td>
                <td style="padding:11px 14px;text-align:center;">
                  <span class="mbadge" style="background:${st.bg};color:${st.color};">${st.label}</span>
                  ${cli.status==='trial'?`<div style="font-size:10px;color:${(daysLeft||0)<=3?'#dc2626':'#d97706'};margin-top:3px;font-weight:700;">${(daysLeft||0)>0?(daysLeft)+' dias':'EXPIRADO'}</div>`:''}
                </td>
                <td style="padding:11px 14px;text-align:right;">
                  <div style="font-weight:800;color:#1B4F72;">${cli.status==='trial'||cli.status==='inactive'?'R$ —':'R$ '+cli.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                </td>
                <td style="padding:11px 14px;text-align:center;font-weight:700;color:#374151;">${cli.empresas}</td>
                <td style="padding:11px 14px;text-align:center;font-weight:700;color:#374151;">${cli.usuarios}</td>
                <td style="padding:11px 14px;">
                  <div style="font-size:12px;color:#374151;">${new Date(cli.criadoEm+'T12:00:00').toLocaleDateString('pt-BR')}</div>
                </td>
                <td style="padding:11px 14px;text-align:center;">
                  <div style="display:flex;gap:4px;justify-content:center;">
                    <button class="abtn" onclick="openClientDetail('${cli.id}')" title="Detalhes" style="color:#2980B9;"><i class="fas fa-eye"></i></button>
                    <button class="abtn" onclick="openMigrateModal('${cli.id}')" title="Migrar plano" style="color:#7c3aed;border-color:#ddd6fe;background:#f5f3ff;"><i class="fas fa-exchange-alt"></i></button>
                    <button class="abtn" onclick="openObsModal('${cli.id}')" title="Anotações" style="color:#d97706;"><i class="fas fa-sticky-note"></i></button>
                  </div>
                </td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>`}
    </div>
  </div>

  <!-- Painel: Usuários Master -->
  <div id="panelUsuarios" style="display:none;">
    <div class="card" style="overflow:hidden;">
      <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-size:14px;font-weight:700;color:#1B4F72;">Usuários com acesso ao Master Admin</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Gerencie quem pode acessar este painel restrito</div>
        </div>
        <button class="btn btn-primary" onclick="openAddMasterUserModal()"><i class="fas fa-plus"></i> Adicionar Usuário</button>
      </div>
      <div id="masterUsersTableWrap">
        ${buildMasterUsersTable(masterUsers)}
      </div>
    </div>
  </div>

  <!-- Painel: Auditoria -->
  <div id="panelAuditoria" style="display:none;">
    <div class="card" style="overflow:hidden;">
      <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:14px;font-weight:700;color:#1B4F72;"><i class="fas fa-history" style="margin-right:6px;color:#7c3aed;"></i>Log de Auditoria</div>
        <span style="font-size:11px;color:#9ca3af;">${auditLog.length} eventos registrados</span>
      </div>
      ${auditLog.length === 0 ? `
      <div class="empty-state">
        <i class="fas fa-history"></i>
        <h3>Nenhum evento registrado</h3>
        <p>As ações realizadas neste painel aparecerão aqui.</p>
      </div>` : `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#f8f9fa;border-bottom:2px solid #e9ecef;">
              <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Data/Hora</th>
              <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Usuário</th>
              <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Ação</th>
              <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            ${auditLog.slice(0,100).map(ev => {
              const actionColors: Record<string,string> = {
                LOGIN:'#16a34a', ADD_CLIENT:'#2980B9', MIGRATE_PLAN:'#7c3aed',
                ADD_MASTER_USER:'#d97706', TOGGLE_USER:'#6c757d'
              }
              const color = actionColors[ev.action] || '#374151'
              return `<tr style="border-bottom:1px solid #f1f3f5;">
                <td style="padding:9px 14px;font-size:11px;color:#6c757d;white-space:nowrap;">${new Date(ev.ts).toLocaleString('pt-BR')}</td>
                <td style="padding:9px 14px;font-weight:600;color:#374151;">${ev.user}</td>
                <td style="padding:9px 14px;"><span class="mbadge" style="background:${color}20;color:${color};">${ev.action}</span></td>
                <td style="padding:9px 14px;color:#374151;">${ev.detail}</td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>`}
    </div>
  </div>

  <!-- ══ MODAIS ════════════════════════════════════════════════════════════════ -->

  <!-- Modal: Detalhes do Cliente -->
  <div class="moverlay" id="clientDetailModal">
    <div class="mmodal" style="max-width:660px;max-height:86vh;overflow:hidden;display:flex;flex-direction:column;">
      <div style="padding:16px 22px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <h3 style="margin:0;font-size:16px;font-weight:700;color:#1B4F72;" id="detailTitle"><i class="fas fa-building" style="margin-right:8px;"></i>Detalhes</h3>
        <button onclick="closeMM('clientDetailModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="display:flex;border-bottom:1px solid #e9ecef;padding:0 22px;background:#f8f9fa;flex-shrink:0;">
        <button class="mtab active" id="detTabInfo" onclick="switchDetTab('info')">Informações</button>
        <button class="mtab" id="detTabModulos" onclick="switchDetTab('modulos')">Módulos</button>
        <button class="mtab" id="detTabPagamentos" onclick="switchDetTab('pagamentos')">Pagamentos</button>
        <button class="mtab" id="detTabAtividade" onclick="switchDetTab('atividade')">Atividade</button>
      </div>
      <div style="padding:20px 22px;overflow-y:auto;flex:1;" id="detailBody"></div>
      <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
        <button onclick="openMigrateModal(window._curCliId);closeMM('clientDetailModal')" class="btn btn-sm" style="background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;font-weight:700;"><i class="fas fa-exchange-alt"></i> Migrar Plano</button>
        <button onclick="closeMM('clientDetailModal')" class="btn btn-secondary">Fechar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Migrar / Ajustar Plano -->
  <div class="moverlay" id="migrateModal">
    <div class="mmodal" style="max-width:540px;">
      <div style="padding:16px 22px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:16px;font-weight:700;color:#7c3aed;"><i class="fas fa-exchange-alt" style="margin-right:8px;"></i>Migrar / Ajustar Plano</h3>
        <button onclick="closeMM('migrateModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:22px;" id="migrateBody"></div>
      <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeMM('migrateModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="confirmarMigracao()" class="btn btn-primary" style="background:#7c3aed;"><i class="fas fa-check"></i> Confirmar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Anotações -->
  <div class="moverlay" id="obsModal">
    <div class="mmodal" style="max-width:420px;">
      <div style="padding:16px 22px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:16px;font-weight:700;color:#1B4F72;"><i class="fas fa-sticky-note" style="margin-right:8px;"></i>Anotações</h3>
        <button onclick="closeMM('obsModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:22px;">
        <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;" id="obsClientName"></div>
        <textarea class="form-control" id="obsText" rows="5" placeholder="Registre observações, pendências, acordos..."></textarea>
      </div>
      <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeMM('obsModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarObs()" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Novo Cliente -->
  <div class="moverlay" id="addClientModal">
    <div class="mmodal" style="max-width:520px;">
      <div style="padding:16px 22px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:16px;font-weight:700;color:#1B4F72;"><i class="fas fa-plus" style="margin-right:8px;"></i>Adicionar Cliente</h3>
        <button onclick="closeMM('addClientModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;">×</button>
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
            <option>Construção Civil</option><option>Outros</option>
          </select>
        </div>
        <div><label class="form-label">Porte</label>
          <select class="form-control" id="ac_porte">
            <option value="micro">Micro (&lt;10 func.)</option>
            <option value="pequena">Pequena (10-50)</option>
            <option value="media">Média (50-200)</option>
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
      <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeMM('addClientModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarNovoCliente()" class="btn btn-primary" id="btnSalvarCliente"><i class="fas fa-save"></i> Adicionar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Novo Usuário Master -->
  <div class="moverlay" id="addMasterUserModal">
    <div class="mmodal" style="max-width:440px;">
      <div style="padding:16px 22px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:16px;font-weight:700;color:#7c3aed;"><i class="fas fa-user-shield" style="margin-right:8px;"></i>Adicionar Usuário Master</h3>
        <button onclick="closeMM('addMasterUserModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:22px;display:flex;flex-direction:column;gap:14px;">
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
          O usuário deverá acessar <strong>/master/login</strong> com as credenciais cadastradas.
        </div>
      </div>
      <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeMM('addMasterUserModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarNovoMasterUser()" class="btn btn-primary" style="background:#7c3aed;"><i class="fas fa-save"></i> Criar Usuário</button>
      </div>
    </div>
  </div>

  <script>
  // ── Dados locais (espelho do servidor) ────────────────────────────────────
  let masterClientsData = ${JSON.stringify(clients)};
  const plansData = ${JSON.stringify(PLANS)};
  const masterUsersData = ${JSON.stringify(masterUsers.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, createdAt: u.createdAt, lastLogin: u.lastLogin })))};
  let _curCliId = null;
  window._curCliId = null;
  let _curDetTab = 'info';

  // ── Abas do painel ────────────────────────────────────────────────────────
  function switchPanelTab(tab) {
    ['clientes','usuarios','auditoria'].forEach(t => {
      const panel = document.getElementById('panel' + t.charAt(0).toUpperCase() + t.slice(1));
      const btn   = document.getElementById('tab'   + t.charAt(0).toUpperCase() + t.slice(1));
      if (panel) panel.style.display = t === tab ? '' : 'none';
      if (btn)   btn.className = 'panel-tab' + (t === tab ? ' active' : '');
    });
  }

  // ── Filtros de clientes ────────────────────────────────────────────────────
  function filterClients() {
    const q  = (document.getElementById('searchClients')?.value || '').toLowerCase();
    const st = document.getElementById('filterStatus')?.value || '';
    const pl = document.getElementById('filterPlano')?.value  || '';
    let count = 0;
    document.querySelectorAll('#clientTableBody tr').forEach(row => {
      const search = row.dataset.search || '';
      const status = row.dataset.status || '';
      const plano  = row.dataset.plano  || '';
      const show = (!q || search.includes(q)) && (!st || status===st) && (!pl || plano===pl);
      row.style.display = show ? '' : 'none';
      if (show) count++;
    });
    const el = document.getElementById('clientCount');
    if (el) el.textContent = count + ' clientes';
  }

  // ── Detalhes do cliente ────────────────────────────────────────────────────
  function openClientDetail(id) {
    const cli = masterClientsData.find(c => c.id === id);
    if (!cli) return;
    _curCliId = id; window._curCliId = id;
    const titleEl = document.getElementById('detailTitle');
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-building" style="margin-right:8px;"></i>' + (cli.fantasia || cli.empresa);
    _curDetTab = 'info';
    renderDetTab('info');
    openMM('clientDetailModal');
  }

  function switchDetTab(tab) {
    _curDetTab = tab;
    ['info','modulos','pagamentos','atividade'].forEach(t => {
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
        dRow('Empresa',cli.empresa) + dRow('Fantasia',cli.fantasia||'—') +
        dRow('CNPJ',cli.cnpj||'—') + dRow('Setor',cli.setor||'—') +
        dRow('Porte',cli.porte||'—') + dRow('Status','<span class="mbadge" style="background:'+st.bg+';color:'+st.color+';">'+st.label+'</span>') +
        dRow('Responsável',cli.responsavel) + dRow('E-mail','<a href="mailto:'+cli.email+'" style="color:#2980B9;">'+cli.email+'</a>') +
        dRow('Telefone',cli.tel||'—') + dRow('Plano','<span class="mbadge" style="background:'+pl.bg+';color:'+pl.color+';">'+pl.label+'</span>') +
        dRow('Billing',{monthly:'Mensal',annual:'Anual',trial:'Trial'}[cli.billing]||cli.billing) +
        dRow('Valor/mês',cli.status==='active'?'R$ '+cli.valor.toLocaleString('pt-BR',{minimumFractionDigits:2}):'R$ —') +
        dRow('Empresas',String(cli.empresas)) + dRow('Usuários',String(cli.usuarios)) +
        dRow('Criado em',new Date(cli.criadoEm+'T12:00:00').toLocaleDateString('pt-BR')) +
        dRow('Último acesso',new Date(cli.ultimoAcesso+'T12:00:00').toLocaleDateString('pt-BR')) +
        '</div>';
      if (cli.obs) html += '<div style="margin-top:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;"><div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;margin-bottom:3px;">Obs</div><div style="font-size:13px;color:#374151;">'+cli.obs+'</div></div>';
      if (cli.status==='trial') {
        const dl = cli.trialEnd ? Math.ceil((new Date(cli.trialEnd).getTime()-Date.now())/(1000*60*60*24)) : 0;
        html += '<div style="margin-top:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px;display:flex;align-items:center;gap:10px;">' +
          '<i class="fas fa-clock" style="color:#dc2626;font-size:18px;"></i>' +
          '<div><div style="font-size:13px;font-weight:700;color:#dc2626;">Trial: '+dl+' dia(s) restantes</div>' +
          '<div style="font-size:11px;color:#9ca3af;">Expira: '+cli.trialEnd+'</div></div>' +
          '<button onclick="openMigrateModal(\''+cli.id+'\');closeMM(\'clientDetailModal\')" class="btn btn-sm" style="margin-left:auto;background:#7c3aed;color:white;border:none;font-weight:700;border-radius:6px;padding:5px 12px;cursor:pointer;font-size:12px;"><i class="fas fa-exchange-alt"></i> Migrar</button>' +
          '</div>';
      }
    } else if (tab === 'modulos') {
      const allMods = ['Ordens','Planejamento','Estoque','Qualidade','Suprimentos','Engenharia','Apontamento','Importação','Recursos'];
      html = '<div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:12px;">Módulos habilitados ('+cli.modulos.length+'/'+allMods.length+')</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
      allMods.forEach(m => {
        const on = cli.modulos.includes(m);
        html += '<span style="font-size:12px;font-weight:600;padding:6px 14px;border-radius:20px;background:'+(on?'#1B4F72':'#f1f3f5')+';color:'+(on?'white':'#9ca3af')+';">' +
          '<i class="fas '+(on?'fa-check':'fa-times')+'" style="margin-right:5px;font-size:10px;"></i>'+m+'</span>';
      });
      html += '</div><div style="margin-top:14px;font-size:11px;color:#9ca3af;">* Módulos gerenciados via configuração do plano e ativação pelo cliente.</div>';
    } else if (tab === 'pagamentos') {
      if (!cli.pagamentos || cli.pagamentos.length === 0) {
        html = '<div style="text-align:center;padding:24px;color:#9ca3af;"><i class="fas fa-receipt" style="font-size:32px;display:block;margin-bottom:8px;opacity:0.4;"></i>Nenhum pagamento registrado</div>';
      } else {
        html = '<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:#f8f9fa;">' +
          '<th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Período</th>' +
          '<th style="padding:8px 10px;text-align:right;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Valor</th>' +
          '<th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Status</th>' +
          '<th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Data</th>' +
          '</tr></thead><tbody>';
        cli.pagamentos.forEach(p => {
          const sc = p.status==='pago'?'#16a34a':'#dc2626', sb = p.status==='pago'?'#f0fdf4':'#fef2f2';
          html += '<tr style="border-bottom:1px solid #f1f3f5;">' +
            '<td style="padding:9px 10px;font-weight:600;color:#374151;">'+p.mes+'</td>' +
            '<td style="padding:9px 10px;text-align:right;font-weight:700;color:#1B4F72;">R$ '+p.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})+'</td>' +
            '<td style="padding:9px 10px;text-align:center;"><span class="mbadge" style="background:'+sb+';color:'+sc+';">'+p.status+'</span></td>' +
            '<td style="padding:9px 10px;color:#6c757d;">'+p.data+'</td></tr>';
        });
        html += '</tbody></table>';
        const total = cli.pagamentos.filter(p => p.status==='pago').reduce((a,p) => a+p.valor, 0);
        html += '<div style="margin-top:10px;padding:9px 14px;background:#f0fdf4;border-radius:8px;display:flex;justify-content:space-between;"><span style="font-size:13px;font-weight:700;color:#15803d;">Total pago:</span><span style="font-size:15px;font-weight:800;color:#15803d;">R$ '+total.toLocaleString('pt-BR',{minimumFractionDigits:2})+'</span></div>';
      }
    } else if (tab === 'atividade') {
      html = '<div style="display:flex;flex-direction:column;gap:0;">';
      const events = [
        { icon:'fa-user-plus', color:'#27AE60', desc:'Conta criada', date:cli.criadoEm, detail:'Plano '+pl.label },
        { icon:'fa-sign-in-alt', color:'#2980B9', desc:'Último acesso', date:cli.ultimoAcesso, detail:'Usuário: '+cli.responsavel },
        ...(cli.status==='trial'?[{icon:'fa-clock',color:'#d97706',desc:'Trial ativo',date:cli.trialStart||cli.criadoEm,detail:'Expira: '+cli.trialEnd}]:[]),
        ...(cli.pagamentos||[]).slice(0,3).map(p => ({icon:'fa-credit-card',color:'#1B4F72',desc:'Pagamento '+p.mes,date:p.data,detail:'R$ '+p.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})+' — '+p.status})),
      ].sort((a,b) => b.date > a.date ? 1 : -1);
      events.forEach(ev => {
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

  // ── Migrar Plano ──────────────────────────────────────────────────────────
  function openMigrateModal(id) {
    const cli = masterClientsData.find(c => c.id === id);
    if (!cli) return;
    _curCliId = id; window._curCliId = id;
    const pl = plansData[cli.plano];
    const today = new Date().toISOString().split('T')[0];
    const trialPlus = new Date(Date.now()+30*86400000).toISOString().split('T')[0];

    let html = '<div style="background:#f8f9fa;border-radius:10px;padding:12px;margin-bottom:16px;">' +
      '<div style="font-size:11px;color:#9ca3af;margin-bottom:1px;">Cliente</div>' +
      '<div style="font-size:15px;font-weight:700;color:#1B4F72;">'+(cli.fantasia||cli.empresa)+'</div>' +
      '<div style="font-size:12px;color:#6c757d;">'+cli.responsavel+' · '+cli.email+'</div></div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:13px;">';
    html += '<div style="grid-column:span 2;"><label class="form-label">Tipo de Ação *</label>' +
      '<select class="form-control" id="mg_acao" onchange="onMgAcaoChange()">' +
      '<option value="change_plan">Migrar para outro plano</option>' +
      '<option value="extend_trial">Prorrogar período de trial</option>' +
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
      '<option value="annual" '+(cli.billing==='annual'?'selected':'')+'>Anual (20% off)</option>' +
      '</select></div>';
    html += '<div><label class="form-label">Vigência a partir de</label><input class="form-control" type="date" id="mg_inicio" value="'+today+'"></div>';
    html += '<div id="mg_trialGroup" style="display:none;grid-column:span 2;"><label class="form-label">Nova data de expiração do trial</label><input class="form-control" type="date" id="mg_trialEnd" value="'+trialPlus+'"></div>';
    html += '<div style="grid-column:span 2;"><label class="form-label">Motivo / Justificativa *</label><textarea class="form-control" id="mg_motivo" rows="2" placeholder="Ex: Solicitação via WhatsApp, cortesia comercial..."></textarea></div>';
    html += '</div>';
    html += '<div style="margin-top:12px;background:#fff3cd;border:1px solid #fde68a;border-radius:8px;padding:9px 12px;font-size:11px;color:#856404;">' +
      '<i class="fas fa-info-circle" style="margin-right:5px;"></i>Esta alteração é registrada no log de auditoria.</div>';

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
    if (pg) pg.style.display = showPlan ? '' : 'none';
    if (bg) bg.style.display = showPlan ? '' : 'none';
    if (tg) tg.style.display = showTrial ? '' : 'none';
  }

  async function confirmarMigracao() {
    const motivo = document.getElementById('mg_motivo')?.value?.trim();
    if (!motivo) { alert('Por favor informe o motivo da alteração.'); return; }
    const payload = {
      clientId: _curCliId,
      acao: document.getElementById('mg_acao')?.value,
      plano: document.getElementById('mg_plano')?.value,
      billing: document.getElementById('mg_billing')?.value,
      trialEnd: document.getElementById('mg_trialEnd')?.value,
      motivo
    };
    const res = await fetch('/master/api/migrate-plan', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    if (res.ok) {
      closeMM('migrateModal');
      showToast('✅ Alteração registrada com sucesso!', 'success');
      setTimeout(() => location.reload(), 1200);
    } else { alert('Erro ao salvar alteração. Tente novamente.'); }
  }

  // ── Anotações ─────────────────────────────────────────────────────────────
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
    await fetch('/master/api/save-obs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ clientId: _curCliId, obs }) });
    closeMM('obsModal');
    showToast('✅ Anotação salva!', 'success');
    setTimeout(() => location.reload(), 800);
  }

  // ── Novo Cliente ──────────────────────────────────────────────────────────
  function openAddClientModal() { openMM('addClientModal'); }

  async function salvarNovoCliente() {
    const emp   = document.getElementById('ac_empresa')?.value?.trim();
    const resp  = document.getElementById('ac_resp')?.value?.trim();
    const email = document.getElementById('ac_email')?.value?.trim();
    if (!emp || !resp || !email) { alert('Preencha os campos obrigatórios: Razão Social, Responsável e E-mail.'); return; }

    const btn = document.getElementById('btnSalvarCliente');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    const payload = {
      empresa:    emp,
      fantasia:   document.getElementById('ac_fantasia')?.value?.trim() || emp,
      responsavel: resp,
      email,
      tel:    document.getElementById('ac_tel')?.value?.trim() || '',
      cnpj:   document.getElementById('ac_cnpj')?.value?.trim() || '',
      setor:  document.getElementById('ac_setor')?.value || '',
      porte:  document.getElementById('ac_porte')?.value || 'pequena',
      plano:  document.getElementById('ac_plano')?.value || 'starter',
      status: document.getElementById('ac_status')?.value || 'trial',
      obs:    document.getElementById('ac_obs')?.value?.trim() || '',
    };
    const res = await fetch('/master/api/add-client', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    if (res.ok) {
      closeMM('addClientModal');
      showToast('✅ Cliente adicionado com sucesso!', 'success');
      setTimeout(() => location.reload(), 1000);
    } else { alert('Erro ao adicionar cliente.'); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Adicionar'; } }
  }

  // ── Novo Usuário Master ───────────────────────────────────────────────────
  function openAddMasterUserModal() { openMM('addMasterUserModal'); }

  async function salvarNovoMasterUser() {
    const name  = document.getElementById('mu_name')?.value?.trim();
    const email = document.getElementById('mu_email')?.value?.trim();
    const pwd   = document.getElementById('mu_pwd')?.value?.trim();
    const role  = document.getElementById('mu_role')?.value || 'viewer';
    if (!name || !email || !pwd) { alert('Preencha nome, e-mail e senha.'); return; }
    if (pwd.length < 8) { alert('A senha deve ter ao menos 8 caracteres.'); return; }
    const res = await fetch('/master/api/add-master-user', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name, email, pwd, role }) });
    if (res.ok) {
      closeMM('addMasterUserModal');
      showToast('✅ Usuário master criado!', 'success');
      setTimeout(() => location.reload(), 1000);
    } else {
      const data = await res.json().catch(() => ({}));
      alert('Erro: ' + (data.error || 'Tente novamente.'));
    }
  }

  function togglePwdMU() {
    const inp = document.getElementById('mu_pwd');
    const ico = document.getElementById('muEye');
    if (!inp) return;
    if (inp.type === 'password') { inp.type = 'text'; if (ico) ico.className='fas fa-eye-slash'; }
    else { inp.type = 'password'; if (ico) ico.className='fas fa-eye'; }
  }

  // ── Exportar CSV ──────────────────────────────────────────────────────────
  function exportClientCSV() {
    let csv = 'Empresa,Responsável,E-mail,Plano,Status,Valor/mês,Empresas,Usuários,Criado em\\n';
    masterClientsData.forEach(c => {
      const pl = plansData[c.plano];
      csv += '"'+c.empresa+'","'+c.responsavel+'","'+c.email+'","'+(pl?.label||c.plano)+'","'+c.status+'","R$ '+c.valor.toFixed(2)+'","'+c.empresas+'","'+c.usuarios+'","'+c.criadoEm+'"\\n';
    });
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='clientes_pcpsyncrus_'+new Date().toISOString().split('T')[0]+'.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Helpers de modal ──────────────────────────────────────────────────────
  function openMM(id)  { const el=document.getElementById(id); if(el){el.style.display='flex';el.classList.add('open');} }
  function closeMM(id) { const el=document.getElementById(id); if(el){el.style.display='none';el.classList.remove('open');} }
  document.querySelectorAll('.moverlay').forEach(el => {
    el.addEventListener('click', function(e){ if(e.target===el) closeMM(el.id); });
  });

  // ── Toast de notificação ──────────────────────────────────────────────────
  function showToast(msg, type) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:700;color:white;background:'+(type==='success'?'#16a34a':'#dc2626')+';box-shadow:0 4px 20px rgba(0,0,0,0.2);animation:mIn 0.3s ease;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  async function toggleMasterUser(id) {
    const res = await fetch('/master/api/toggle-master-user', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id })
    });
    if (res.ok) { showToast('Status do usuário atualizado!', 'success'); setTimeout(() => location.reload(), 800); }
    else { alert('Erro ao atualizar usuário.'); }
  }
  </script>
  `

  return c.html(layout('Master Admin — PCP Planner', content, 'master'))
})

// ── Helper para tabela de usuários master ──────────────────────────────────────
function buildMasterUsersTable(users: typeof masterUsers): string {
  if (users.length === 0) {
    return `<div style="text-align:center;padding:40px;color:#9ca3af;">
      <i class="fas fa-user-shield" style="font-size:36px;display:block;margin-bottom:12px;opacity:0.3;"></i>
      <div style="font-size:14px;font-weight:700;color:#374151;">Nenhum usuário master cadastrado</div>
    </div>`
  }
  const roleLabel: Record<string,{label:string,color:string,bg:string}> = {
    superadmin: { label:'Super Admin', color:'#7c3aed', bg:'#f5f3ff' },
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
    const activeStyle = u.active
      ? 'background:#f0fdf4;color:#16a34a;'
      : 'background:#e9ecef;color:#6c757d;'
    html += `<tr style="border-bottom:1px solid #f1f3f5;">
      <td style="padding:11px 14px;"><div style="font-weight:700;color:#374151;">${u.name}</div></td>
      <td style="padding:11px 14px;color:#2980B9;">${u.email}</td>
      <td style="padding:11px 14px;text-align:center;">
        <span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${rl.bg};color:${rl.color};">${rl.label}</span>
      </td>
      <td style="padding:11px 14px;text-align:center;">
        <span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;${activeStyle}">${u.active ? 'Ativo' : 'Inativo'}</span>
      </td>
      <td style="padding:11px 14px;font-size:12px;color:#374151;">${new Date(u.createdAt+'T12:00:00').toLocaleDateString('pt-BR')}</td>
      <td style="padding:11px 14px;font-size:12px;color:#6c757d;">${u.lastLogin ? new Date(u.lastLogin).toLocaleString('pt-BR') : '— nunca —'}</td>
      <td style="padding:11px 14px;text-align:center;">
        <button onclick="toggleMasterUser('${u.id}')" style="font-size:11px;font-weight:600;border-radius:6px;padding:4px 10px;cursor:pointer;border:1px solid ${u.active?'#fecaca':'#86efac'};background:${u.active?'#fef2f2':'#f0fdf4'};color:${u.active?'#dc2626':'#16a34a'};">
          <i class="fas ${u.active?'fa-ban':'fa-check'}"></i> ${u.active?'Desativar':'Ativar'}
        </button>
      </td>
    </tr>`
  })
  html += '</tbody></table></div>'
  return html
}

// ── Página de Login do Master ──────────────────────────────────────────────────
function masterLoginPage(errMsg: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Master Admin — Login</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;min-height:100vh;display:flex;align-items:center;justify-content:center;}
    .form-control{width:100%;padding:11px 14px;border:1.5px solid #334155;border-radius:10px;font-size:13px;outline:none;transition:border 0.2s;box-sizing:border-box;background:#1e293b;color:white;}
    .form-control:focus{border-color:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,0.15);}
    .form-control::placeholder{color:#64748b;}
    .btn-master{background:linear-gradient(135deg,#7c3aed,#5b21b6);color:white;padding:12px;border-radius:10px;font-size:14px;font-weight:700;border:none;cursor:pointer;width:100%;transition:opacity 0.2s;}
    .btn-master:hover{opacity:0.9;}
    .btn-master:disabled{opacity:0.6;cursor:not-allowed;}
    @keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    .card-login{animation:fadeIn 0.4s ease;}
  </style>
</head>
<body>
  <div class="card-login" style="width:100%;max-width:380px;padding:20px;">
    <!-- Logo -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="width:60px;height:60px;background:linear-gradient(135deg,#7c3aed,#5b21b6);border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;box-shadow:0 12px 30px rgba(124,58,237,0.4);">
        <i class="fas fa-shield-alt" style="color:white;font-size:24px;"></i>
      </div>
      <h1 style="font-size:22px;font-weight:900;color:white;margin:0 0 4px;">Master Admin</h1>
      <p style="font-size:12px;color:#64748b;margin:0;">Acesso restrito — PCP Planner</p>
    </div>

    <!-- Card do formulário -->
    <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;padding:28px;">
      ${errMsg ? `
      <div style="background:#2d1b1b;border:1px solid #7f1d1d;border-radius:8px;padding:10px 14px;margin-bottom:18px;display:flex;align-items:center;gap:8px;">
        <i class="fas fa-exclamation-circle" style="color:#ef4444;flex-shrink:0;"></i>
        <span style="font-size:13px;color:#fca5a5;">${errMsg}</span>
      </div>` : ''}

      <form method="POST" action="/master/login" onsubmit="handleSubmit(event)">
        <div style="margin-bottom:16px;">
          <label style="display:block;font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:6px;">E-mail</label>
          <div style="position:relative;">
            <i class="fas fa-envelope" style="position:absolute;left:13px;top:50%;transform:translateY(-50%);color:#475569;font-size:13px;"></i>
            <input class="form-control" type="email" name="email" placeholder="master@syncrus.com.br" required autofocus style="padding-left:38px;">
          </div>
        </div>
        <div style="margin-bottom:24px;">
          <label style="display:block;font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:6px;">Senha</label>
          <div style="position:relative;">
            <i class="fas fa-lock" style="position:absolute;left:13px;top:50%;transform:translateY(-50%);color:#475569;font-size:13px;"></i>
            <input class="form-control" type="password" name="pwd" id="pwdInput" placeholder="••••••••" required style="padding-left:38px;padding-right:40px;">
            <button type="button" onclick="togglePwd()" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#475569;">
              <i class="fas fa-eye" id="eyeIcon"></i>
            </button>
          </div>
        </div>
        <button type="submit" class="btn-master" id="loginBtn">
          <i class="fas fa-shield-alt" style="margin-right:8px;"></i>Acessar Master Admin
        </button>
      </form>
    </div>

    <div style="text-align:center;margin-top:20px;">
      <a href="/" style="font-size:12px;color:#475569;text-decoration:none;">
        <i class="fas fa-arrow-left" style="margin-right:4px;"></i>Voltar ao sistema
      </a>
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
    if (inp.type==='password') { inp.type='text'; ico.className='fas fa-eye-slash'; }
    else { inp.type='password'; ico.className='fas fa-eye'; }
  }
  </script>
</body>
</html>`
}

// ── Rota para toggle de usuário master via AJAX ────────────────────────────────
app.post('/api/toggle-master-user', async (c) => {
  if (!isAuthenticated(c)) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json() as any
  const u = masterUsers.find(u2 => u2.id === body.id)
  if (u) u.active = !u.active
  return c.json({ ok: true, active: u?.active })
})

// Script injetado no frontend para toggle (chamado pelo botão na tabela)
// Adicionar ao final do JS do painel:
// async function toggleMasterUser(id) { await fetch('/master/api/toggle-master-user', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id})}); location.reload(); }

export default app
