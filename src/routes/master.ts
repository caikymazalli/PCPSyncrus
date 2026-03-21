import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { registeredUsers, DEMO_USERS, loadAllUsersFromDB } from '../userStore'
import { ALL_MODULES, MODULE_LABELS } from '../modules'
import { getEmpresaModuleAccess } from '../moduleAccess'
import type { AccessLevel, ModuleKey } from '../modules'
import { createOmieClient, OmieClient } from '../lib/omie'

const app = new Hono<{ Bindings: { DB: D1Database; OMIE_APP_KEY?: string; OMIE_APP_SECRET?: string } }>()

// ── Constantes ─────────────────────────────────────────────────────────────────
const MASTER_SESSION_KEY = 'master_session'
const SESSION_DURATION   = 60 * 60 * 8
const MASTER_JWT_SECRET  = 'syncrus-master-jwt-secret-2025-xK9pLmN3'
const MASTER_PWD_SALT    = 'syncrus-master-salt-2025'

function escapeHtml(str: any): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeJsonForScriptTag(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/`/g, '\\`')
    .replace(/\${/g, '\\${')
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

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

const masterClients: MasterClient[] = []
const auditLog: Array<{ ts: string; user: string; action: string; detail: string }> = []

const PLANS: Record<string, { label: string; monthlyBase: number; color: string; bg: string }> = {
  starter:      { label: 'Starter',      monthlyBase: 299,  color: '#27AE60', bg: '#f0fdf4' },
  professional: { label: 'Professional', monthlyBase: 599,  color: '#2980B9', bg: '#e8f4fd' },
  enterprise:   { label: 'Enterprise',   monthlyBase: 1490, color: '#7c3aed', bg: '#f5f3ff' },
}

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

function masterLoginPage(errMsg: string = ''): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login — Master Admin</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
  <style>
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:linear-gradient(135deg,#0f172a,#1e1b4b); display:flex; align-items:center; justify-content:center; padding:24px; }
    .login-card { width:100%; max-width:420px; background:white; border-radius:18px; box-shadow:0 25px 80px rgba(0,0,0,0.35); overflow:hidden; }
    .login-head { padding:28px 28px 20px; background:linear-gradient(135deg,#1a1035,#2d1b69); color:white; }
    .login-badge { display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.18); border-radius:999px; padding:6px 12px; font-size:11px; font-weight:700; letter-spacing:0.3px; text-transform:uppercase; }
    .login-body { padding:28px; }
    .form-label { display:block; font-size:12px; font-weight:700; color:#374151; margin-bottom:6px; }
    .form-control { width:100%; padding:12px 14px; border:1.5px solid #d1d5db; border-radius:10px; font-size:14px; outline:none; transition:border 0.2s, box-shadow 0.2s; }
    .form-control:focus { border-color:#7c3aed; box-shadow:0 0 0 4px rgba(124,58,237,0.12); }
    .btn-login { width:100%; border:none; border-radius:10px; background:#7c3aed; color:white; font-size:14px; font-weight:800; padding:12px 16px; cursor:pointer; transition:transform 0.06s, background 0.15s; }
    .btn-login:hover { background:#6d28d9; }
    .btn-login:active { transform:translateY(1px); }
    .error-box { margin-bottom:16px; padding:12px 14px; border-radius:10px; background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; font-size:13px; font-weight:600; }
    .hint { margin-top:14px; font-size:12px; color:#6b7280; text-align:center; }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="login-head">
      <div class="login-badge"><i class="fas fa-shield-alt"></i> Área restrita</div>
      <h1 style="margin:16px 0 6px;font-size:24px;line-height:1.1;">Master Admin</h1>
      <div style="font-size:13px;color:rgba(255,255,255,0.72);">Acesso administrativo da plataforma PCP Planner</div>
    </div>
    <div class="login-body">
      ${errMsg ? `<div class="error-box"><i class="fas fa-exclamation-circle" style="margin-right:8px;"></i>${escapeHtml(errMsg)}</div>` : ''}
      <form method="post" action="/master/login">
        <div style="margin-bottom:14px;">
          <label class="form-label" for="email">E-mail</label>
          <input id="email" name="email" type="email" class="form-control" placeholder="master@syncrus.com.br" autocomplete="username" required>
        </div>
        <div style="margin-bottom:18px;">
          <label class="form-label" for="pwd">Senha</label>
          <input id="pwd" name="pwd" type="password" class="form-control" placeholder="Digite sua senha" autocomplete="current-password" required>
        </div>
        <button type="submit" class="btn-login"><i class="fas fa-sign-in-alt" style="margin-right:8px;"></i>Entrar no painel</button>
      </form>
      <div class="hint">Use suas credenciais de administrador para continuar.</div>
    </div>
  </div>
</body>
</html>`
}

function buildMasterUsersTable(users: Array<{
  id: string; email: string; pwdHash: string; name: string;
  createdAt: string; lastLogin: string | null; active: boolean; role: string
}>): string {
  if (users.length === 0) {
    return `<div class="empty-state"><i class="fas fa-user-shield"></i><h3>Nenhum usuário master cadastrado</h3><p>Adicione o primeiro usuário com acesso ao painel.</p></div>`
  }

  return `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr style="background:#f8f9fa;border-bottom:2px solid #e9ecef;">
      <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Nome</th>
      <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">E-mail</th>
      <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Perfil</th>
      <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Status</th>
      <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Criado em</th>
      <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Último login</th>
      <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Ações</th>
    </tr></thead>
    <tbody>
      ${users.map((u) => {
        const activeBadge = u.active
          ? '<span class="mbadge" style="background:#dcfce7;color:#16a34a;">Ativo</span>'
          : '<span class="mbadge" style="background:#fee2e2;color:#dc2626;">Inativo</span>'
        const roleColors: Record<string, { bg: string; color: string; label: string }> = {
          superadmin: { bg: '#ede9fe', color: '#7c3aed', label: 'Super Admin' },
          admin: { bg: '#dbeafe', color: '#2563eb', label: 'Admin' },
          viewer: { bg: '#f3f4f6', color: '#4b5563', label: 'Viewer' },
        }
        const roleMeta = roleColors[u.role] || { bg: '#f3f4f6', color: '#4b5563', label: u.role || 'Usuário' }
        return `<tr style="border-bottom:1px solid #f1f3f5;">
          <td style="padding:10px 14px;"><div style="font-weight:700;color:#1B4F72;">${escapeHtml(u.name)}</div></td>
          <td style="padding:10px 14px;color:#374151;">${escapeHtml(u.email)}</td>
          <td style="padding:10px 14px;"><span class="mbadge" style="background:${roleMeta.bg};color:${roleMeta.color};">${escapeHtml(roleMeta.label)}</span></td>
          <td style="padding:10px 14px;text-align:center;">${activeBadge}</td>
          <td style="padding:10px 14px;color:#374151;">${u.createdAt ? new Date(u.createdAt + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
          <td style="padding:10px 14px;color:#374151;">${u.lastLogin ? new Date(u.lastLogin).toLocaleString('pt-BR') : 'Nunca acessou'}</td>
          <td style="padding:10px 14px;text-align:center;">
            <button class="abtn" data-action="toggle-master-user" data-id="${escapeHtml(u.id)}" style="color:${u.active ? '#dc2626' : '#16a34a'};${u.active ? 'border-color:#fecaca;background:#fff5f5;' : 'border-color:#bbf7d0;background:#f0fdf4;'}">
              <i class="fas ${u.active ? 'fa-user-slash' : 'fa-user-check'}"></i>
              <span class="tooltip-text">${u.active ? 'Desativar usuário' : 'Reativar usuário'}</span>
            </button>
          </td>
        </tr>`
      }).join('')}
    </tbody>
  </table></div>`
}

function masterLayout(title: string, content: string, loggedName: string = ''): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Master Admin</title>
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
    .abtn .tooltip-text { visibility: hidden; opacity: 0; background: #1a1a2e; color: white; font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 5px; position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); white-space: nowrap; transition: opacity 0.15s; pointer-events: none; z-index: 999; }
    .abtn .tooltip-text::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 4px solid transparent; border-top-color: #1a1a2e; }
    .abtn:hover .tooltip-text { visibility: visible; opacity: 1; }
    .client-row { transition: background 0.1s; }
    .client-row:hover { background: #f8f9fa !important; }
    .master-kpi { background: white; border-radius: 12px; padding: 18px 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
    .fin-kpi { background:white;border-radius:10px;padding:14px 18px;border:1px solid #e9ecef;transition:box-shadow 0.15s; }
    .fin-kpi:hover { box-shadow:0 2px 8px rgba(0,0,0,0.08); }
    .fin-kpi-label { font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;display:flex;align-items:center;gap:5px; }
    .fin-kpi-value { font-size:22px;font-weight:800;color:#1B4F72;line-height:1; }
    .fin-kpi-sub { font-size:10px;color:#9ca3af;margin-top:3px; }
    .fin-th { padding:9px 12px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:0.3px;cursor:pointer;white-space:nowrap;user-select:none; }
    .fin-th:hover { color:#374151; }
    .fin-tr { border-bottom:1px solid #f1f3f5;transition:background 0.1s; }
    .fin-tr:hover { background:#f8f9fa; }
    .fin-td { padding:9px 12px;font-size:12px;color:#374151;vertical-align:middle;white-space:nowrap; }
    .fin-badge-paid      { background:#dcfce7;color:#16a34a;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px; }
    .fin-badge-pending   { background:#fef9c3;color:#d97706;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px; }
    .fin-badge-overdue   { background:#fee2e2;color:#dc2626;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px; }
    .fin-badge-cancelled { background:#f3f4f6;color:#6c757d;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px; }
    .fin-badge-refunded  { background:#ede9fe;color:#7c3aed;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px; }
    .fin-badge-failed    { background:#fee2e2;color:#dc2626;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px; }
    .omie-badge { display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:#fff3e8;color:#c2410c;text-decoration:none; }
    .omie-badge.omie-boleto { background:#eff6ff;color:#1d4ed8;cursor:pointer; }
    .omie-badge.omie-nfse { background:#f5f3ff;color:#6d28d9; }
    .fin-bar { border-radius:4px 4px 0 0;min-width:28px;position:relative;cursor:pointer;transition:opacity 0.15s; }
    .fin-bar:hover { opacity:0.85; }
    .fin-bar-label { font-size:9px;color:#6c757d;text-align:center;margin-top:4px;white-space:nowrap; }
    .cfg-tab { padding:9px 18px;font-size:12px;font-weight:600;border:none;background:none;cursor:pointer;color:#6c757d;border-bottom:3px solid transparent;transition:all 0.15s;white-space:nowrap; }
    .cfg-tab.active { color:#7c3aed;border-color:#7c3aed;background:rgba(124,58,237,0.04); }
    .cfg-label { display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px; }
    .cfg-input { width:100%;padding:8px 10px;border:1px solid #dee2e6;border-radius:6px;font-size:13px;color:#374151;background:white;box-sizing:border-box;transition:border 0.15s; }
    .cfg-input:focus { outline:none;border-color:#7c3aed;box-shadow:0 0 0 2px rgba(124,58,237,0.1); }
    .cfg-save-btn { background:#7c3aed;color:white;border:none;border-radius:8px;padding:9px 20px;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s; }
    .cfg-save-btn:hover { background:#6d28d9; }
    .cfg-section { animation:fadeInUp 0.2s ease; }
    @keyframes fadeInUp { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
    :root {
      --brand-primary: #7c3aed;
      --brand-secondary: #2980B9;
      --brand-accent: #16a34a;
      --brand-sidebar: #1B4F72;
    }
    .empty-state { text-align: center; padding: 60px 20px; color: #9ca3af; }
    .empty-state i { font-size: 48px; display: block; margin-bottom: 16px; opacity: 0.3; }
    .empty-state h3 { font-size: 16px; font-weight: 700; color: #374151; margin: 0 0 8px; }
    .empty-state p { font-size: 13px; margin: 0; }
  </style>
</head>
<body>
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
  <div class="master-main">
    ${content}
  </div>
  <div id="toastContainer" style="position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;"></div>
  <script>
  function showToast(msg, type) {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.style.cssText = 'padding:12px 20px;border-radius:10px;font-size:13px;font-weight:700;color:white;background:'+(type==='success'?'#16a34a':type==='info'?'#2980B9':'#dc2626')+';box-shadow:0 4px 20px rgba(0,0,0,0.25);animation:mIn 0.3s ease;pointer-events:auto;display:flex;align-items:center;gap:8px;';
    t.innerHTML = '<i class="fas '+(type==='success'?'fa-check-circle':type==='info'?'fa-info-circle':'fa-exclamation-circle')+'"></i> '+msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }
  </script>
</body>
</html>`
}

// ── Rotas de autenticação ──────────────────────────────────────────────────────
app.get('/login', async (c) => {
  if (await isAuthenticated(c)) return c.redirect('/master')
  const err = c.req.query('err') || ''
  const errMsg = err === '1' ? 'E-mail ou senha incorretos.' :
                 err === '2' ? 'Usuário inativo. Contate o administrador.' :
                 err === '3' ? 'Sessão expirada. Faça login novamente.' : ''
  return c.html(masterLoginPage(errMsg))
})

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
  const jwt = await signToken({
    email: user.email, name: user.name, role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION
  })
  user.lastLogin = new Date().toISOString()
  auditLog.unshift({ ts: new Date().toISOString(), user: user.name, action: 'LOGIN', detail: 'Login bem-sucedido' })
  setCookie(c, MASTER_SESSION_KEY, jwt, {
    maxAge: SESSION_DURATION, path: '/master', httpOnly: true, sameSite: 'Lax'
  })
  return c.redirect('/master')
})

app.get('/logout', (c) => {
  deleteCookie(c, MASTER_SESSION_KEY, { path: '/master' })
  return c.redirect('/master/login')
})

// ── APIs ───────────────────────────────────────────────────────────────────────
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
    id: newId, empresa: body.empresa || '', fantasia: body.fantasia || body.empresa || '',
    cnpj: body.cnpj || '', setor: body.setor || '', porte: body.porte || '',
    responsavel: body.responsavel || '', email: body.email || '', tel: body.tel || '',
    plano: body.plano || 'starter',
    billing: body.status === 'active' ? 'monthly' : 'trial',
    valor: body.status === 'active' ? (PLANS[body.plano]?.monthlyBase || 299) : 0,
    status: body.status || 'trial',
    trialStart: body.status === 'trial' ? today : null,
    trialEnd: body.status === 'trial' ? trialEnd : null,
    empresas: 1, usuarios: 1, plantas: 0,
    criadoEm: today, ultimoAcesso: today,
    modulos: [], cnpjsExtras: 0, pagamentos: [], obs: body.obs || ''
  }
  masterClients.push(nc)
  auditLog.unshift({ ts: new Date().toISOString(), user: actor?.name || auth.name, action: 'ADD_CLIENT', detail: `Cliente "${nc.empresa}" adicionado` })
  return c.json({ ok: true, id: newId })
})

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
    cli.plano = body.plano || cli.plano; cli.billing = body.billing || 'monthly'
    cli.status = 'active'; cli.valor = PLANS[cli.plano]?.monthlyBase || 299; cli.trialEnd = null
  } else if (body.acao === 'extend_trial') {
    cli.trialEnd = body.trialEnd; cli.status = 'trial'
  } else if (body.acao === 'activate') {
    cli.status = 'active'; cli.plano = body.plano || cli.plano
    cli.billing = body.billing || 'monthly'; cli.valor = PLANS[cli.plano]?.monthlyBase || 299; cli.trialEnd = null
  } else if (body.acao === 'suspend') {
    cli.status = 'inactive'
  } else if (body.acao === 'reactivate') {
    cli.status = 'active'
  }
  auditLog.unshift({ ts: new Date().toISOString(), user: actor?.name || auth.name, action: 'MIGRATE_PLAN', detail: `${cli.fantasia}: ${body.acao} | ${oldPlan} → ${cli.plano} | ${body.motivo}` })
  return c.json({ ok: true })
})

app.post('/api/save-obs', async (c) => {
  if (!await isAuthenticated(c)) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json() as any
  const cli = masterClients.find(c2 => c2.id === body.clientId)
  if (cli) cli.obs = body.obs || ''
  return c.json({ ok: true })
})

app.post('/api/add-master-user', async (c) => {
  const auth = await isAuthenticated(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  await ensureInit()
  const body = await c.req.json() as any
  const actor = masterUsers.find(u => u.email === auth.email) || { name: auth.name }
  if (masterUsers.find(u => u.email === body.email)) return c.json({ error: 'E-mail já cadastrado' }, 400)
  const pwdHash = await sha256((body.pwd || 'senha123') + MASTER_PWD_SALT)
  masterUsers.push({
    id: 'mu' + Date.now(), email: body.email, pwdHash, name: body.name,
    createdAt: new Date().toISOString().split('T')[0], lastLogin: null,
    active: true, role: body.role || 'viewer'
  })
  auditLog.unshift({ ts: new Date().toISOString(), user: actor?.name || auth.name, action: 'ADD_MASTER_USER', detail: `Novo usuário: ${body.name} (${body.email})` })
  return c.json({ ok: true })
})

app.post('/api/toggle-master-user', async (c) => {
  if (!await isAuthenticated(c)) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json() as any
  const u = masterUsers.find(u2 => u2.id === body.id)
  if (u) u.active = !u.active
  return c.json({ ok: true, active: u?.active })
})

app.get('/api/backup', async (c) => {
  if (!await isAuthenticated(c)) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env?.DB || null
  if (!db) return c.json({ error: 'Database not available' }, 503)
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
      backup[table] = []
    }
  }
  return c.json({ ok: true, exportedAt: new Date().toISOString(), tables: backup })
})

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
      return c.json({ ok: false, error: 'Erro ao salvar módulos.' }, 500)
    }
  }
  auditLog.unshift({ ts: now, user: auth.name, action: 'SET_MODULES', detail: `Módulos atualizados para cliente ${clientId}` })
  return c.json({ ok: true })
})

// ── Rotas de Financeiro ──────────────────────────────────────────────────────
app.get('/api/financeiro', async (c) => {
  const auth = await isAuthenticated(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  // Gerar faturas a partir dos clientes em memória
  const invoices = masterClients.map(cli => ({
    id: `inv_${cli.id}`,
    user_id: cli.id,
    empresa_name: cli.fantasia || cli.empresa,
    user_email: cli.email,
    plan: cli.plano,
    type: cli.billing === 'annual' ? 'annual' : 'monthly',
    amount: cli.valor || 0,
    due_date: cli.trialEnd || new Date().toISOString().split('T')[0],
    paid_at: cli.status === 'active' ? new Date().toISOString().split('T')[0] : null,
    status: cli.status === 'active' ? 'paid' : cli.status === 'trial' ? 'pending' : 'cancelled',
    omie_codigo_lancamento: null,
    omie_boleto_url: null,
    omie_nfse_numero: null,
  }))

  // Filtros básicos (opcionais)
  const status = c.req.query('status')
  const periodo = c.req.query('periodo')
  const plan = c.req.query('plan')
  let filtered = invoices
  if (status) filtered = filtered.filter(i => i.status === status)
  if (plan) filtered = filtered.filter(i => i.plan === plan)
  // período pode ser tratado conforme necessidade

  return c.json({ ok: true, invoices: filtered })
})

app.post('/api/financeiro', async (c) => {
  const auth = await isAuthenticated(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json()
  if (!body.user_id || !body.amount || !body.due_date) {
    return c.json({ error: 'Campos obrigatórios: user_id, amount, due_date' }, 400)
  }
  const cli = masterClients.find(c => c.id === body.user_id)
  if (!cli) return c.json({ error: 'Cliente não encontrado' }, 404)
  // Adiciona pagamento fictício (apenas para demo)
  if (!cli.pagamentos) cli.pagamentos = []
  cli.pagamentos.push({
    mes: new Date(body.due_date).toLocaleString('pt-BR', { month: 'long', year: 'numeric' }),
    valor: body.amount,
    status: body.status === 'paid' ? 'pago' : 'pendente',
    data: body.due_date
  })
  return c.json({ ok: true, id: `inv_${Date.now()}` })
})

app.put('/api/financeiro/:id', async (c) => {
  const auth = await isAuthenticated(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const id = c.req.param('id')
  const body = await c.req.json()
  // Implementar atualização no banco se necessário
  return c.json({ ok: true })
})

app.post('/api/financeiro/:id/status', async (c) => {
  const auth = await isAuthenticated(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const id = c.req.param('id')
  const { status } = await c.req.json()
  // Atualizar status no banco
  return c.json({ ok: true })
})

// ── Rotas Omie (usando credenciais do ambiente) ──────────────────────────────────
app.post('/api/omie/test', async (c) => {
  const auth = await isAuthenticated(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const app_key = c.env.OMIE_APP_KEY
  const app_secret = c.env.OMIE_APP_SECRET
  if (!app_key || !app_secret) {
    return c.json({ error: 'Credenciais Omie não configuradas no servidor' }, 500)
  }

  try {
    const response = await fetch('https://app.omie.com.br/api/v1/geral/empresas/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        call: 'ListarEmpresas',
        app_key,
        app_secret,
        param: [{ pagina: 1, registros_por_pagina: 1 }]
      })
    })
    const data = await response.json()
    if (data.faultstring) throw new Error(data.faultstring)

    const nomeEmpresa = data.empresa_cadastro?.[0]?.nome_fantasia || 'Empresa não identificada'
    return c.json({ ok: true, empresa: nomeEmpresa })
  } catch (err: any) {
    console.error('Erro Omie test:', err)
    return c.json({ error: err.message || 'Falha na conexão' }, 500)
  }
})

app.post('/api/omie/push/:invoiceId', async (c) => {
  const auth = await isAuthenticated(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const app_key = c.env.OMIE_APP_KEY
  const app_secret = c.env.OMIE_APP_SECRET
  if (!app_key || !app_secret) {
    return c.json({ error: 'Credenciais Omie não configuradas' }, 500)
  }

  const invoiceId = c.req.param('invoiceId')
  // Buscar a fatura (exemplo: do array masterClients)
  const client = masterClients.find(c => `inv_${c.id}` === invoiceId)
  if (!client) return c.json({ error: 'Fatura não encontrada' }, 404)

  // Mapear para o formato Omie
  const payload = {
    call: 'IncluirLancamento',
    app_key,
    app_secret,
    param: [{
      codigo_cliente_fornecedor: client.id, // ID do cliente no Omie (precisa estar cadastrado)
      data_vencimento: client.trialEnd || new Date().toISOString().split('T')[0],
      valor_documento: client.valor || 0,
      // outros campos conforme documentação
      codigo_banco: '001', // exemplo
    }]
  }

  try {
    const response = await fetch('https://app.omie.com.br/api/v1/financas/contasreceber/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await response.json()
    if (data.faultstring) throw new Error(data.faultstring)
    return c.json({ ok: true, omie_codigo: data.codigo_lancamento })
  } catch (err: any) {
    console.error('Erro Omie push:', err)
    return c.json({ error: err.message }, 500)
  }
})

app.post('/api/omie/boleto/:invoiceId', async (c) => {
  const auth = await isAuthenticated(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const app_key = c.env.OMIE_APP_KEY
  const app_secret = c.env.OMIE_APP_SECRET
  if (!app_key || !app_secret) {
    return c.json({ error: 'Credenciais Omie não configuradas' }, 500)
  }

  const invoiceId = c.req.param('invoiceId')
  const { omie_codigo_lancamento } = await c.req.json()

  const payload = {
    call: 'GerarBoleto',
    app_key,
    app_secret,
    param: [{
      codigo_lancamento_omie: omie_codigo_lancamento
    }]
  }

  try {
    const response = await fetch('https://app.omie.com.br/api/v1/financas/contasreceber/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await response.json()
    if (data.faultstring) throw new Error(data.faultstring)
    return c.json({ ok: true, boleto_url: data.url_boleto })
  } catch (err: any) {
    console.error('Erro Omie boleto:', err)
    return c.json({ error: err.message }, 500)
  }
})

app.post('/api/omie/nfse/:invoiceId', async (c) => {
  const auth = await isAuthenticated(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const app_key = c.env.OMIE_APP_KEY
  const app_secret = c.env.OMIE_APP_SECRET
  if (!app_key || !app_secret) {
    return c.json({ error: 'Credenciais Omie não configuradas' }, 500)
  }

  const invoiceId = c.req.param('invoiceId')
  const { omie_codigo_lancamento } = await c.req.json()

  // Exemplo de chamada para emitir NFS-e – ajuste conforme documentação
  const payload = {
    call: 'EmitirNFS',
    app_key,
    app_secret,
    param: [{
      codigo_lancamento_omie: omie_codigo_lancamento
    }]
  }

  try {
    const response = await fetch('https://app.omie.com.br/api/v1/servicos/nfse/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await response.json()
    if (data.faultstring) throw new Error(data.faultstring)
    return c.json({ ok: true, nfse_numero: data.numero_nfse, nfse_pdf: data.link_pdf })
  } catch (err: any) {
    console.error('Erro Omie NFS-e:', err)
    return c.json({ error: err.message }, 500)
  }
})

app.post('/api/omie/sync', async (c) => {
  const auth = await isAuthenticated(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const app_key = c.env.OMIE_APP_KEY
  const app_secret = c.env.OMIE_APP_SECRET
  if (!app_key || !app_secret) {
    return c.json({ error: 'Credenciais Omie não configuradas' }, 500)
  }

  const payload = {
    call: 'PesquisarTitulos',
    app_key,
    app_secret,
    param: [{
      pagina: 1,
      registros_por_pagina: 100,
      // filtros opcionais: status, data_inicial, etc.
    }]
  }

  try {
    const response = await fetch('https://app.omie.com.br/api/v1/geral/financas/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await response.json()
    if (data.faultstring) throw new Error(data.faultstring)
    // Processar os títulos retornados (data.titulos) e atualizar o sistema local
    return c.json({ ok: true, titulos: data.titulos })
  } catch (err: any) {
    console.error('Erro Omie sync:', err)
    return c.json({ error: err.message }, 500)
  }
})

// ── Rota: GET /client/:clientId ────────────────────────────────────────────────
app.get('/client/:clientId', async (c) => {
  await ensureInit()
  const auth = await isAuthenticated(c)
  if (!auth) return c.html(loginRedirect())
  const db = c.env?.DB || null
  const clientId = c.req.param('clientId')

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
          email: u.email, tel: u.tel, plano: u.plano, billing: 'trial', valor: 0,
          status: 'trial', trialStart: u.trialStart, trialEnd: u.trialEnd,
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

  // Conteúdo da página de detalhe do cliente (gerado dinamicamente)
  const content = `
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;flex-wrap:wrap;">
    <a href="/master" style="display:flex;align-items:center;gap:6px;font-size:12px;color:#6c757d;text-decoration:none;padding:6px 12px;border:1px solid #e9ecef;border-radius:8px;background:white;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
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

  <div style="display:flex;border-bottom:2px solid #e9ecef;margin-bottom:20px;overflow-x:auto;background:white;border-radius:12px 12px 0 0;padding:0 8px;">
    <button class="panel-tab active" id="tabInfo" data-ptab="info"><i class="fas fa-info-circle" style="margin-right:6px;"></i>Informações</button>
    <button class="panel-tab" id="tabMod" data-ptab="modulos"><i class="fas fa-th-large" style="margin-right:6px;"></i>Módulos</button>
    <button class="panel-tab" id="tabPag" data-ptab="pagamentos"><i class="fas fa-receipt" style="margin-right:6px;"></i>Pagamentos</button>
    <button class="panel-tab" id="tabAtiv" data-ptab="atividade"><i class="fas fa-history" style="margin-right:6px;"></i>Atividade</button>
  </div>

  <div id="panelInfo" class="card" style="padding:22px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">
      ${[
        ['Empresa', cli.empresa], ['Fantasia', cli.fantasia || '—'], ['CNPJ', cli.cnpj || '—'],
        ['Setor', cli.setor || '—'], ['Porte', cli.porte || '—'], ['Responsável', cli.responsavel],
        ['E-mail', `<a href="mailto:${cli.email}" style="color:#2980B9;">${cli.email}</a>`],
        ['Telefone', cli.tel || '—'],
        ['Plano', `<span class="mbadge" style="background:${pl.bg};color:${pl.color};">${pl.label}</span>`],
        ['Status', `<span class="mbadge" style="background:${st.bg};color:${st.color};">${st.label}</span>`],
        ['Criado em', new Date(cli.criadoEm + 'T12:00:00').toLocaleDateString('pt-BR')],
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

  <div id="panelMod" class="card" style="padding:22px;display:none;">
    <div style="font-size:14px;font-weight:700;color:#1B4F72;margin-bottom:16px;">
      <i class="fas fa-th-large" style="margin-right:8px;color:#7c3aed;"></i>Controle de Acesso por Módulo
    </div>
    <div style="font-size:12px;color:#6c757d;margin-bottom:20px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 14px;">
      <i class="fas fa-info-circle" style="color:#0284c7;margin-right:6px;"></i>
      <strong>Liberado</strong>: acesso total &nbsp;·&nbsp; <strong>Somente Leitura</strong>: visualizar sem editar &nbsp;·&nbsp; <strong>Negado</strong>: acesso bloqueado
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

  <div id="panelPag" class="card" style="padding:22px;display:none;">
    ${cli.pagamentos && cli.pagamentos.length > 0
      ? `<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:#f8f9fa;">
          <th style="padding:8px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Período</th>
          <th style="padding:8px;text-align:right;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Valor</th>
          <th style="padding:8px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Status</th>
          <th style="padding:8px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Data</th>
         </thead><tbody>${cli.pagamentos.map(p => {
          const sc = p.status === 'pago' ? '#16a34a' : '#dc2626'
          const sb = p.status === 'pago' ? '#f0fdf4' : '#fef2f2'
          return `<tr style="border-bottom:1px solid #f1f3f5;">
            <td style="padding:8px;font-weight:600;color:#374151;">${p.mes}<\/td>
            <td style="padding:8px;text-align:right;font-weight:700;color:#1B4F72;">R$ ${p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}<\/td>
            <td style="padding:8px;text-align:center;"><span class="mbadge" style="background:${sb};color:${sc};">${p.status}</span><\/td>
            <td style="padding:8px;color:#6c757d;">${p.data}<\/td>
           <\/tr>`
        }).join('')}</tbody><\/table>`
      : `<div class="empty-state"><i class="fas fa-receipt"></i><h3>Nenhum pagamento registrado</h3></div>`
    }
  </div>

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
  document.querySelectorAll('.module-select').forEach(function(sel) {
    sel.addEventListener('change', function() {
      const colors = {
        allowed:   { color: '#16a34a', bg: '#f0fdf4', label: 'Liberado' },
        read_only: { color: '#d97706', bg: '#fffbeb', label: 'Somente Leitura' },
        denied:    { color: '#dc2626', bg: '#fef2f2', label: 'Negado' },
      };
      const badge = sel.parentElement.querySelector('.mod-badge');
      const ac = colors[sel.value] || colors.allowed;
      if (badge) { badge.style.background = ac.bg; badge.style.color = ac.color; badge.textContent = ac.label; }
    });
  });
  document.getElementById('btnSalvarModulos').addEventListener('click', async function() {
    const btn = this;
    const status = document.getElementById('modSaveStatus');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    if (status) status.textContent = '';
    const payload = {};
    document.querySelectorAll('.module-select').forEach(function(sel) { payload[sel.dataset.mod] = sel.value; });
    try {
      const res = await fetch('/master/api/client/' + CLIENT_ID + '/modules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        showToast('Módulos salvos com sucesso!', 'success');
        if (status) status.textContent = 'Salvo às ' + new Date().toLocaleTimeString('pt-BR');
      } else { showToast('Erro ao salvar módulos.', 'error'); }
    } catch { showToast('Erro de conexão.', 'error'); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Salvar Módulos'; }
  });
  </script>`

  return c.html(masterLayout(`Cliente: ${cli.fantasia || cli.empresa}`, content, auth.name))
})

// ── Rota principal GET / ───────────────────────────────────────────────────────
app.get('/', async (c) => {
  try {
    await ensureInit()
    const auth = await isAuthenticated(c)
    if (!auth) return c.html(loginRedirect())

    const db = c.env?.DB || null

    masterClients.length = 0

    if (db) {
      try {
        const dbUsers = await loadAllUsersFromDB(db)
        const ownerUsers = dbUsers.filter(u => !u.ownerId)
        const memberUsers = dbUsers.filter(u => u.ownerId)
        const memberCount: Record<string, number> = {}
        for (const m of memberUsers) {
          if (m.ownerId) memberCount[m.ownerId] = (memberCount[m.ownerId] || 0) + 1
        }
        for (const u of ownerUsers) {
          if (u.isDemo) continue
          masterClients.push({
            id: u.userId, empresa: u.empresa, fantasia: u.empresa,
            cnpj: '', setor: u.setor, porte: u.porte,
            responsavel: u.nome + (u.sobrenome ? ' ' + u.sobrenome : ''),
            email: u.email, tel: u.tel, plano: u.plano, billing: 'trial', valor: 0,
            status: 'trial', trialStart: u.trialStart, trialEnd: u.trialEnd,
            empresas: 1, usuarios: 1 + (memberCount[u.userId] || 0), plantas: 0,
            criadoEm: u.createdAt, ultimoAcesso: u.lastLogin || u.createdAt,
            modulos: [], cnpjsExtras: 0, pagamentos: [], obs: ''
          })
        }
      } catch (err) {
        console.error('Erro ao carregar clientes do DB:', err)
      }
    } else {
      for (const u of Object.values(registeredUsers)) {
        if (!u.isDemo && !u.ownerId) {
          masterClients.push({
            id: u.userId, empresa: u.empresa, fantasia: u.empresa,
            cnpj: '', setor: u.setor, porte: u.porte,
            responsavel: u.nome + (u.sobrenome ? ' ' + u.sobrenome : ''),
            email: u.email, tel: u.tel, plano: u.plano, billing: 'trial', valor: 0,
            status: 'trial', trialStart: u.trialStart, trialEnd: u.trialEnd,
            empresas: 1, usuarios: 1, plantas: 0,
            criadoEm: u.createdAt, ultimoAcesso: u.lastLogin || u.createdAt,
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

    const clientRowsHtml = clients.length === 0
      ? `<div class="empty-state"><i class="fas fa-users"></i><h3>Nenhum cliente cadastrado</h3><p>Clique em "Novo Cliente" para adicionar o primeiro cliente.</p></div>`
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
           </thead>
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
              const safeId = escapeHtml(cli.id)
              return `<tr class="client-row" data-status="${cli.status}" data-plano="${cli.plano}" data-search="${cli.empresa.toLowerCase()} ${cli.responsavel.toLowerCase()} ${cli.email.toLowerCase()}" style="border-bottom:1px solid #f1f3f5;">
                <td style="padding:10px 14px;">
                  <div style="font-weight:700;color:#1B4F72;">${cli.fantasia || cli.empresa}</div>
                  <div style="font-size:11px;color:#9ca3af;">${cli.email}</div>
                  ${cli.obs ? `<div style="font-size:10px;color:#d97706;margin-top:2px;"><i class="fas fa-sticky-note" style="font-size:9px;"></i> ${escapeHtml(cli.obs.slice(0,40))}${cli.obs.length>40?'...':''}</div>` : ''}
                  <\/td>
                <td style="padding:10px 14px;"><div style="font-weight:600;color:#374151;">${cli.responsavel}</div><div style="font-size:11px;color:#9ca3af;">${cli.tel||'—'}</div><\/td>
                <td style="padding:10px 14px;"><span class="mbadge" style="background:${pl.bg};color:${pl.color};">${pl.label}</span><div style="font-size:10px;color:#9ca3af;margin-top:3px;">${billingLabel[cli.billing]||cli.billing}</div><\/td>
                <td style="padding:10px 14px;text-align:center;">
                  <span class="mbadge" style="background:${st.bg};color:${st.color};">${st.label}</span>
                  ${cli.status==='trial' ? `<div style="font-size:10px;color:${(daysLeft||0)<=3?'#dc2626':'#d97706'};margin-top:2px;font-weight:700;">${(daysLeft||0)>0?(daysLeft)+' dias':'EXPIRADO'}</div>` : ''}
                  <\/td>
                <td style="padding:10px 14px;text-align:right;font-weight:800;color:#1B4F72;">${cli.status==='active'?'R$ '+cli.valor.toLocaleString('pt-BR',{minimumFractionDigits:2}):'R$ —'}<\/td>
                <td style="padding:10px 14px;text-align:center;font-weight:700;color:#374151;">${cli.empresas}<\/td>
                <td style="padding:10px 14px;text-align:center;font-weight:700;color:#374151;">${cli.usuarios}<\/td>
                <td style="padding:10px 14px;font-size:11px;color:#374151;">${new Date(cli.criadoEm+'T12:00:00').toLocaleDateString('pt-BR')}<\/td>
                <td style="padding:10px 14px;text-align:center;">
                  <div style="display:flex;gap:4px;justify-content:center;">
                    <a class="abtn" href="/master/client/${safeId}" style="color:#2980B9;text-decoration:none;">
                      <i class="fas fa-external-link-alt"></i>
                      <span class="tooltip-text">Abrir página</span>
                    </a>
                    <button class="abtn" data-action="detail" data-id="${safeId}" style="color:#2980B9;">
                      <i class="fas fa-eye"></i>
                      <span class="tooltip-text">Ver detalhes</span>
                    </button>
                    <button class="abtn" data-action="migrate" data-id="${safeId}" style="color:#7c3aed;border-color:#ddd6fe;background:#f5f3ff;">
                      <i class="fas fa-exchange-alt"></i>
                      <span class="tooltip-text">Migrar plano</span>
                    </button>
                    <button class="abtn" data-action="obs" data-id="${safeId}" style="color:#d97706;">
                      <i class="fas fa-sticky-note"></i>
                      <span class="tooltip-text">Anotações</span>
                    </button>
                    ${cli.status === 'active' ? `<button class="abtn" data-action="suspend" data-id="${safeId}" style="color:#dc2626;border-color:#fecaca;"><i class="fas fa-ban"></i><span class="tooltip-text">Suspender</span></button>` : ''}
                    ${cli.status === 'inactive' ? `<button class="abtn" data-action="reactivate" data-id="${safeId}" style="color:#16a34a;border-color:#86efac;"><i class="fas fa-check-circle"></i><span class="tooltip-text">Reativar</span></button>` : ''}
                  </div>
                  <\/td>
                <\/tr>`
            }).join('')}
          </tbody>
        <\/table><\/div>`

    // Conteúdo HTML completo do painel principal (dashboard)
    const content = `
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

  <div style="display:flex;border-bottom:2px solid #e9ecef;margin-bottom:20px;overflow-x:auto;background:white;border-radius:12px 12px 0 0;padding:0 8px;">
    <button class="panel-tab active" id="tabClientes" data-tab="clientes"><i class="fas fa-building" style="margin-right:6px;"></i>Clientes <span style="background:#e9ecef;color:#374151;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:4px;">${clients.length}</span></button>
    <button class="panel-tab" id="tabSuporte" data-tab="suporte"><i class="fas fa-headset" style="margin-right:6px;"></i>Suporte</button>
    <button class="panel-tab" id="tabUsuarios" data-tab="usuarios"><i class="fas fa-user-shield" style="margin-right:6px;"></i>Usuários Master <span style="background:#e9ecef;color:#374151;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:4px;">${masterUsers.length}</span></button>
    <button class="panel-tab" id="tabAuditoria" data-tab="auditoria"><i class="fas fa-history" style="margin-right:6px;"></i>Auditoria <span style="background:#e9ecef;color:#374151;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:4px;">${auditLog.length}</span></button>
    <button class="panel-tab" id="tabFinanceiro" data-tab="financeiro"><i class="fas fa-dollar-sign" style="margin-right:6px;"></i>Financeiro</button>
    <button class="panel-tab" id="tabConfiguracoes" data-tab="configuracoes" style="margin-left:auto;"><i class="fas fa-cog" style="margin-right:6px;"></i>Configurações</button>
  </div>

  <!-- Painel Clientes -->
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
        <button class="btn btn-secondary" id="btnExportCSV"><i class="fas fa-file-csv" style="color:#27AE60;"></i> Exportar CSV</button>
        <button class="btn btn-primary" id="btnNovoCliente"><i class="fas fa-plus"></i> Novo Cliente</button>
      </div>
    </div>
    ${clientRowsHtml}
  </div>

  <!-- Painel Suporte -->
  <div id="panelSuporte" class="card" style="padding:20px;display:none;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
      <div>
        <div style="font-size:14px;font-weight:700;color:#1B4F72;"><i class="fas fa-headset" style="margin-right:8px;color:#7c3aed;"></i>Dashboard de Suporte</div>
        <div style="font-size:12px;color:#6c757d;margin-top:2px;">Chamados abertos por clientes da plataforma</div>
      </div>
      <button class="btn btn-primary" style="background:#7c3aed;" id="btnNovoTicketMaster"><i class="fas fa-plus"></i> Novo Chamado</button>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:16px;padding:12px 14px;background:#f8f9fa;border-radius:8px;border:1px solid #e9ecef;">
      <div style="display:flex;flex-direction:column;gap:4px;min-width:160px;">
        <label style="font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">Empresa</label>
        <select id="supportFilterEmpresa" class="form-control" style="font-size:12px;padding:5px 8px;">
          <option value="">— Todas —</option>
          ${clients.map((cl) => `<option value="${escapeHtml(cl.id)}">${escapeHtml(cl.fantasia || cl.empresa)}</option>`).join('')}
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
      <button onclick="applySupportFilters()" class="btn btn-primary" style="font-size:12px;padding:6px 14px;align-self:flex-end;"><i class="fas fa-search"></i> Filtrar</button>
      <button onclick="clearSupportFilters()" class="btn btn-secondary" style="font-size:12px;padding:6px 14px;align-self:flex-end;"><i class="fas fa-times"></i> Limpar</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:20px;">
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
    <div id="supportKanban" style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;min-height:200px;">
      <div style="text-align:center;padding:40px;color:#9ca3af;width:100%;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i><div style="margin-top:8px;">Carregando chamados...</div></div>
    </div>
  </div>

  <!-- Painel Usuários Master -->
  <div id="panelUsuarios" class="card" style="overflow:hidden;display:none;">
    <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div>
        <div style="font-size:14px;font-weight:700;color:#1B4F72;">Usuários com acesso ao Master Admin</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Gerencie quem pode acessar este painel restrito</div>
      </div>
      <button class="btn btn-primary" style="background:#7c3aed;" id="btnNovoMasterUser"><i class="fas fa-plus"></i> Adicionar Usuário</button>
    </div>
    <div id="masterUsersTableWrap">${buildMasterUsersTable(masterUsers)}</div>
  </div>

  <!-- Painel Auditoria -->
  <div id="panelAuditoria" class="card" style="overflow:hidden;display:none;">
    <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
      <div style="font-size:14px;font-weight:700;color:#1B4F72;"><i class="fas fa-history" style="margin-right:6px;color:#7c3aed;"></i>Log de Auditoria</div>
      <span style="font-size:11px;color:#9ca3af;">${auditLog.length} eventos registrados</span>
    </div>
    ${auditLog.length === 0
      ? `<div class="empty-state"><i class="fas fa-history"></i><h3>Nenhum evento registrado</h3></div>`
      : `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f8f9fa;border-bottom:2px solid #e9ecef;">
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Data/Hora</th>
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Usuário</th>
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Ação</th>
            <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Detalhe</th>
           </thead>
          <tbody>
            ${auditLog.slice(0,100).map(ev => {
              const ac: Record<string,string> = { LOGIN:'#16a34a', ADD_CLIENT:'#2980B9', MIGRATE_PLAN:'#7c3aed', ADD_MASTER_USER:'#d97706' }
              const col = ac[ev.action] || '#374151'
              return `<tr style="border-bottom:1px solid #f1f3f5;">
                <td style="padding:9px 14px;font-size:11px;color:#6c757d;white-space:nowrap;">${new Date(ev.ts).toLocaleString('pt-BR')}<\/td>
                <td style="padding:9px 14px;font-weight:600;color:#374151;">${ev.user}<\/td>
                <td style="padding:9px 14px;"><span class="mbadge" style="background:${col}20;color:${col};">${ev.action}</span><\/td>
                <td style="padding:9px 14px;color:#374151;">${ev.detail}<\/td>
               <\/tr>`
            }).join('')}
          </tbody>
        <\/table><\/div>`
    }
  </div>

  <!-- Painel Financeiro -->
  <div id="panelFinanceiro" style="display:none;padding:20px;">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:20px;">
      <div class="fin-kpi"><div class="fin-kpi-label">MRR</div><div class="fin-kpi-value" id="kpiMRRVal">—</div><div class="fin-kpi-sub" id="kpiMRRSub"></div></div>
      <div class="fin-kpi"><div class="fin-kpi-label">ARR</div><div class="fin-kpi-value" id="kpiARRVal">—</div></div>
      <div class="fin-kpi"><div class="fin-kpi-label">A Receber</div><div class="fin-kpi-value" style="color:#d97706;" id="kpiPendenteVal">—</div><div class="fin-kpi-sub" id="kpiPendenteSub"></div></div>
      <div class="fin-kpi"><div class="fin-kpi-label">Vencido</div><div class="fin-kpi-value" style="color:#dc2626;" id="kpiVencidoVal">—</div><div class="fin-kpi-sub" id="kpiVencidoSub"></div></div>
      <div class="fin-kpi"><div class="fin-kpi-label">Pago (mês)</div><div class="fin-kpi-value" style="color:#16a34a;" id="kpiPagoVal">—</div><div class="fin-kpi-sub" id="kpiPagoSub"></div></div>
      <div class="fin-kpi"><div class="fin-kpi-label">Assinantes</div><div class="fin-kpi-value" style="font-size:16px;" id="kpiAssinantesVal">—</div></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px;">
      <select id="finFiltroStatus" onchange="loadFinanceiro()" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;background:#fff;">
        <option value="">Todos os status</option>
        <option value="pending">Pendente</option><option value="paid">Pago</option>
        <option value="overdue">Vencido</option><option value="cancelled">Cancelado</option>
      </select>
      <select id="finFiltroPeriodo" onchange="loadFinanceiro()" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;background:#fff;">
        <option value="all">Todos os períodos</option>
        <option value="current_month">Mês atual</option><option value="last_month">Mês anterior</option>
        <option value="last_3months">Últimos 3 meses</option><option value="last_6months">Últimos 6 meses</option>
        <option value="this_year">Este ano</option>
      </select>
      <select id="finFiltroPlan" onchange="loadFinanceiro()" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;background:#fff;">
        <option value="">Todos os planos</option>
        <option value="starter">Starter</option><option value="professional">Professional</option>
        <option value="enterprise">Enterprise</option>
      </select>
      <input id="finFiltroSearch" type="text" placeholder="Buscar empresa / e-mail..." oninput="filterFinTable()" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;flex:1;min-width:180px;">
      <button onclick="loadFinanceiro()" style="padding:7px 14px;background:#1B4F72;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;"><i class="fas fa-sync-alt"></i> Atualizar</button>
      <button onclick="exportFinCSV()" style="padding:7px 14px;background:#16a34a;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;"><i class="fas fa-file-csv"></i> CSV</button>
      <button id="btnNovoLancamento" style="padding:7px 14px;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;"><i class="fas fa-plus"></i> Novo Lançamento</button>
      <button id="btnSyncOmie" onclick="syncOmie()" style="padding:7px 14px;background:#e06619;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;display:none;"><i class="fas fa-link"></i> Sync Omie</button>
    </div>
    <div style="overflow-x:auto;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.07);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f8fafc;border-bottom:2px solid #e5e7eb;">
            <th class="fin-th">Empresa</th>
            <th class="fin-th">Plano</th>
            <th class="fin-th">Tipo</th>
            <th class="fin-th" style="text-align:right;">Valor</th>
            <th class="fin-th">Vencimento</th>
            <th class="fin-th">Pago em</th>
            <th class="fin-th">Status</th>
            <th class="fin-th" style="text-align:center;">Omie</th>
            <th class="fin-th" style="text-align:center;">Ações</th>
            <\/tr>
        </thead>
        <tbody id="finTableBody">
          <tr><td colspan="9" style="text-align:center;padding:40px;color:#9ca3af;">Carregando...<\/td><\/tr>
        </tbody>
      <\/table>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
      <div style="font-size:12px;color:#9ca3af;" id="finCount"></div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:12px;color:#9ca3af;" id="finPagInfo"></span>
        <div style="display:flex;gap:6px;" id="finPagBtns"></div>
      </div>
    </div>
  </div>

  <!-- Painel Configurações -->
  <div id="panelConfiguracoes" class="card" style="overflow:hidden;display:none;">
    <div style="display:flex;border-bottom:2px solid #e9ecef;padding:0 8px;background:#f8f9fa;overflow-x:auto;">
      <button class="cfg-tab active" data-cfg="geral"><i class="fas fa-sliders-h" style="margin-right:5px;"></i>Geral</button>
      <button class="cfg-tab" data-cfg="branding"><i class="fas fa-paint-brush" style="margin-right:5px;"></i>Branding</button>
      <button class="cfg-tab" data-cfg="notificacoes"><i class="fas fa-bell" style="margin-right:5px;"></i>Notificações</button>
      <button class="cfg-tab" data-cfg="backup"><i class="fas fa-database" style="margin-right:5px;"></i>Backup</button>
      <button class="cfg-tab" data-cfg="seguranca"><i class="fas fa-shield-alt" style="margin-right:5px;"></i>Segurança</button>
      <button class="cfg-tab" data-cfg="api"><i class="fas fa-plug" style="margin-right:5px;"></i>API</button>
      <button class="cfg-tab" data-cfg="omie"><i class="fas fa-link" style="margin-right:5px;"></i>Omie ERP</button>
    </div>
    <div id="cfgContent" style="padding:24px;">
      <div id="cfgGeral" class="cfg-section">
        <h3 style="margin:0 0 20px;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-sliders-h" style="margin-right:8px;color:#7c3aed;"></i>Configurações Gerais</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:800px;">
          <div><label class="cfg-label">Nome da Plataforma</label><input id="cfg_platform_name" class="cfg-input" type="text" value="PCPSyncrus"></div>
          <div><label class="cfg-label">E-mail de Suporte</label><input id="cfg_support_email" class="cfg-input" type="email" value="suporte@pcpsyncrus.com.br"></div>
          <div><label class="cfg-label">Telefone de Suporte</label><input id="cfg_support_phone" class="cfg-input" type="text" placeholder="(11) 99999-9999"></div>
          <div><label class="cfg-label">Idioma Padrão</label>
            <select id="cfg_default_language" class="cfg-input">
              <option value="pt-BR" selected>Português (Brasil)</option>
              <option value="en-US">English (US)</option>
            </select>
          </div>
          <div><label class="cfg-label">Fuso Horário</label>
            <select id="cfg_default_timezone" class="cfg-input">
              <option value="America/Sao_Paulo" selected>America/São_Paulo</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
          <div><label class="cfg-label">Formato de Data</label>
            <select id="cfg_date_format" class="cfg-input">
              <option value="DD/MM/YYYY" selected>DD/MM/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>
          <div><label class="cfg-label">URL Política de Privacidade</label><input id="cfg_privacy_policy_url" class="cfg-input" type="url" placeholder="https://"></div>
          <div><label class="cfg-label">URL Termos de Uso</label><input id="cfg_terms_url" class="cfg-input" type="url" placeholder="https://"></div>
        </div>
        <div style="margin-top:16px;padding:16px;background:#fff3cd;border-radius:8px;border:1px solid #ffc107;max-width:800px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600;color:#856404;">
            <input id="cfg_maintenance_mode" type="checkbox" style="width:16px;height:16px;">
            <i class="fas fa-tools"></i> Modo Manutenção
          </label>
          <input id="cfg_maintenance_message" class="cfg-input" type="text" value="Sistema em manutenção. Voltamos em breve." style="margin-top:10px;">
        </div>
        <div style="margin-top:20px;"><button onclick="saveCfgSection('geral')" class="cfg-save-btn"><i class="fas fa-save" style="margin-right:6px;"></i>Salvar</button></div>
      </div>

      <div id="cfgBranding" class="cfg-section" style="display:none;">
        <h3 style="margin:0 0 20px;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-paint-brush" style="margin-right:8px;color:#7c3aed;"></i>Identidade Visual</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:880px;">
          <div><label class="cfg-label">Nome da Plataforma</label><input id="brand_platform_name" class="cfg-input" type="text" value="PCPSyncrus" oninput="updateBrandingPreview()"></div>
          <div><label class="cfg-label">Logo URL</label><input id="brand_logo" class="cfg-input" type="url" placeholder="https://" oninput="updateBrandingPreview()"></div>
          <div><label class="cfg-label">Favicon URL</label><input id="brand_favicon" class="cfg-input" type="url" placeholder="https://" oninput="updateBrandingPreview()"></div>
          <div><label class="cfg-label">Cor Primária</label>
            <div style="display:flex;gap:8px;align-items:center;">
              <input id="brand_primary_color" type="color" value="#7c3aed" oninput="updateBrandingPreview()" style="width:44px;height:38px;border:1px solid #dee2e6;border-radius:6px;cursor:pointer;padding:2px;">
              <input id="brand_primary_color_hex" class="cfg-input" type="text" value="#7c3aed" oninput="syncColorFromHex('primary')" style="flex:1;font-family:monospace;">
            </div>
          </div>
          <div><label class="cfg-label">Cor Secundária</label>
            <div style="display:flex;gap:8px;align-items:center;">
              <input id="brand_secondary_color" type="color" value="#2980B9" oninput="updateBrandingPreview()" style="width:44px;height:38px;border:1px solid #dee2e6;border-radius:6px;cursor:pointer;padding:2px;">
              <input id="brand_secondary_color_hex" class="cfg-input" type="text" value="#2980B9" oninput="syncColorFromHex('secondary')" style="flex:1;font-family:monospace;">
            </div>
          </div>
          <div><label class="cfg-label">Cor Sidebar</label>
            <div style="display:flex;gap:8px;align-items:center;">
              <input id="brand_sidebar_color" type="color" value="#1B4F72" oninput="updateBrandingPreview()" style="width:44px;height:38px;border:1px solid #dee2e6;border-radius:6px;cursor:pointer;padding:2px;">
              <input id="brand_sidebar_color_hex" class="cfg-input" type="text" value="#1B4F72" oninput="syncColorFromHex('sidebar')" style="flex:1;font-family:monospace;">
            </div>
          </div>
        </div>
        <div style="margin-top:20px;display:flex;gap:10px;">
          <button onclick="saveCfgSection('branding')" class="cfg-save-btn"><i class="fas fa-save" style="margin-right:6px;"></i>Salvar Branding</button>
          <button onclick="resetBranding()" style="background:#f8f9fa;border:1px solid #dee2e6;border-radius:8px;padding:9px 18px;font-size:13px;font-weight:600;cursor:pointer;color:#6c757d;"><i class="fas fa-undo" style="margin-right:5px;"></i>Restaurar</button>
        </div>
      </div>

      <div id="cfgNotificacoes" class="cfg-section" style="display:none;">
        <h3 style="margin:0 0 20px;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-bell" style="margin-right:8px;color:#7c3aed;"></i>Notificações</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:800px;">
          <div><label class="cfg-label">Alertar Trial expirando (dias antes)</label><input id="cfg_notify_trial_expiry_days" class="cfg-input" type="number" min="1" max="30" value="7"></div>
          <div><label class="cfg-label">E-mail remetente</label><input id="cfg_notify_email_sender" class="cfg-input" type="email" value="noreply@pcpsyncrus.com.br"></div>
          <div><label class="cfg-label">Rodapé dos e-mails</label><input id="cfg_notify_email_footer" class="cfg-input" type="text" placeholder="© 2025 PCPSyncrus."></div>
        </div>
        <div style="margin-top:16px;max-width:800px;">
          <div style="background:#f8f9fa;border-radius:10px;padding:16px;border:1px solid #e9ecef;">
            <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:12px;"><i class="fas fa-slack" style="margin-right:6px;color:#4A154B;"></i>Slack</div>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;margin-bottom:10px;">
              <input id="cfg_alert_slack_enabled" type="checkbox" style="width:15px;height:15px;"> Ativar notificações via Slack
            </label>
            <input id="cfg_alert_slack_webhook" class="cfg-input" type="url" placeholder="https://hooks.slack.com/services/...">
            <button onclick="testSlackWebhook()" style="margin-top:8px;background:#4A154B;color:white;border:none;border-radius:6px;padding:7px 16px;font-size:12px;font-weight:600;cursor:pointer;"><i class="fas fa-paper-plane" style="margin-right:5px;"></i>Testar</button>
          </div>
        </div>
        <div style="margin-top:20px;"><button onclick="saveCfgSection('notificacoes')" class="cfg-save-btn"><i class="fas fa-save" style="margin-right:6px;"></i>Salvar</button></div>
      </div>

      <div id="cfgBackup" class="cfg-section" style="display:none;">
        <h3 style="margin:0 0 20px;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-database" style="margin-right:8px;color:#7c3aed;"></i>Backup</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:800px;">
          <div style="grid-column:1/-1;"><label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;"><input id="cfg_backup_enabled" type="checkbox" checked style="width:16px;height:16px;"> Backup automático habilitado</label></div>
          <div><label class="cfg-label">Frequência</label>
            <select id="cfg_backup_frequency" class="cfg-input">
              <option value="daily" selected>Diário</option><option value="weekly">Semanal</option>
            </select>
          </div>
          <div><label class="cfg-label">Retenção (dias)</label><input id="cfg_backup_retention_days" class="cfg-input" type="number" min="1" max="365" value="30"></div>
          <div><label class="cfg-label">Bucket</label><input id="cfg_backup_storage_bucket" class="cfg-input" type="text" placeholder="meu-bucket-backup"></div>
        </div>
        <div style="margin-top:16px;background:#e8f5e9;border-radius:8px;padding:14px;border:1px solid #a5d6a7;max-width:800px;">
          <div style="font-size:12px;font-weight:700;color:#2e7d32;margin-bottom:6px;">Último Backup</div>
          <div id="backupLastRun" style="font-size:12px;color:#374151;">Nenhum backup realizado ainda</div>
          <button onclick="runManualBackup()" style="margin-top:8px;background:#2e7d32;color:white;border:none;border-radius:6px;padding:7px 16px;font-size:12px;font-weight:600;cursor:pointer;"><i class="fas fa-play" style="margin-right:5px;"></i>Executar Agora</button>
        </div>
        <div style="margin-top:20px;"><button onclick="saveCfgSection('backup')" class="cfg-save-btn"><i class="fas fa-save" style="margin-right:6px;"></i>Salvar</button></div>
      </div>

      <div id="cfgSeguranca" class="cfg-section" style="display:none;">
        <h3 style="margin:0 0 20px;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-shield-alt" style="margin-right:8px;color:#7c3aed;"></i>Segurança</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:800px;">
          <div><label class="cfg-label">Tamanho mínimo da senha</label><input id="cfg_password_min_length" class="cfg-input" type="number" min="6" max="32" value="8"></div>
          <div><label class="cfg-label">Expiração de senha (dias, 0=nunca)</label><input id="cfg_password_expiry_days" class="cfg-input" type="number" min="0" max="365" value="0"></div>
          <div><label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;"><input id="cfg_password_require_uppercase" type="checkbox" checked style="width:15px;height:15px;"> Exigir maiúscula</label></div>
          <div><label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;"><input id="cfg_password_require_number" type="checkbox" checked style="width:15px;height:15px;"> Exigir número</label></div>
          <div><label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;"><input id="cfg_password_require_symbol" type="checkbox" style="width:15px;height:15px;"> Exigir símbolo</label></div>
          <div><label class="cfg-label">Timeout de sessão (horas)</label><input id="cfg_session_timeout_hours" class="cfg-input" type="number" min="1" max="72" value="8"></div>
          <div><label class="cfg-label">Máx. tentativas de login</label><input id="cfg_max_login_attempts" class="cfg-input" type="number" min="3" max="20" value="5"></div>
          <div><label class="cfg-label">Bloqueio após falhas (min)</label><input id="cfg_lockout_duration_minutes" class="cfg-input" type="number" min="5" max="1440" value="30"></div>
          <div><label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;"><input id="cfg_mfa_enabled" type="checkbox" style="width:15px;height:15px;"> MFA habilitado</label></div>
          <div style="grid-column:1/-1;"><label class="cfg-label">IP Whitelist (separados por vírgula)</label><input id="cfg_ip_whitelist" class="cfg-input" type="text" placeholder="192.168.1.1, 10.0.0.0/24"></div>
        </div>
        <div style="margin-top:20px;"><button onclick="saveCfgSection('seguranca')" class="cfg-save-btn"><i class="fas fa-save" style="margin-right:6px;"></i>Salvar</button></div>
      </div>

      <div id="cfgApi" class="cfg-section" style="display:none;">
        <h3 style="margin:0 0 20px;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-plug" style="margin-right:8px;color:#7c3aed;"></i>API</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:800px;">
          <div style="grid-column:1/-1;"><label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;"><input id="cfg_api_enabled" type="checkbox" checked style="width:16px;height:16px;"> API pública habilitada</label></div>
          <div><label class="cfg-label">Rate Limit (req/min)</label><input id="cfg_api_rate_limit" class="cfg-input" type="number" min="10" max="1000" value="60"></div>
          <div><label class="cfg-label">Expiração JWT (horas)</label><input id="cfg_api_jwt_expiry" class="cfg-input" type="number" min="1" max="168" value="24"></div>
          <div style="grid-column:1/-1;"><label class="cfg-label">Origins CORS</label><input id="cfg_api_allowed_origins" class="cfg-input" type="text" value="*"></div>
          <div style="grid-column:1/-1;"><label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;"><input id="cfg_api_log_requests" type="checkbox" checked style="width:15px;height:15px;"> Registrar logs de requisições</label></div>
        </div>
        <div style="margin-top:20px;"><button onclick="saveCfgSection('api')" class="cfg-save-btn"><i class="fas fa-save" style="margin-right:6px;"></i>Salvar</button></div>
      </div>

      <div id="cfgOmie" class="cfg-section" style="display:none;">
        <h3 style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-link" style="margin-right:8px;color:#e06619;"></i>Omie ERP</h3>
        <p style="margin:0 0 20px;font-size:12px;color:#6b7280;">Conecte o Painel Financeiro ao Omie para sincronizar contas a receber.</p>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding:14px 18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:700;color:#c2410c;">
            <input id="cfg_omie_enabled" type="checkbox" style="width:16px;height:16px;accent-color:#e06619;"> Habilitar integração Omie ERP
          </label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:800px;margin-bottom:20px;">
          <div><label class="cfg-label">App Key <span style="color:#dc2626;">*</span></label><input id="cfg_omie_app_key" class="cfg-input" type="text" placeholder="Ex: 1234567890123"></div>
          <div><label class="cfg-label">App Secret <span style="color:#dc2626;">*</span></label><input id="cfg_omie_app_secret" class="cfg-input" type="password" placeholder="Ex: abcdef1234..."></div>
          <div><label class="cfg-label">ID Conta Corrente</label><input id="cfg_omie_conta_corrente" class="cfg-input" type="text" placeholder="Ex: 4243124"></div>
          <div><label class="cfg-label">Código Categoria</label><input id="cfg_omie_codigo_categoria" class="cfg-input" type="text" placeholder="Ex: 1.01.02" value="1.01.02"></div>
          <div><label class="cfg-label">Código Serviço (NFS-e)</label><input id="cfg_omie_codigo_servico" class="cfg-input" type="text" placeholder="Ex: 7003"></div>
          <div><label class="cfg-label">Sincronização Automática</label>
            <select id="cfg_omie_sync_auto" class="cfg-input">
              <option value="0">Desativada (manual)</option>
              <option value="1">Ativada</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:20px;">
          <button onclick="testarConexaoOmie()" style="padding:9px 18px;background:#e06619;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;"><i class="fas fa-plug" style="margin-right:6px;"></i>Testar Conexão</button>
          <span id="omieTestResult" style="font-size:13px;display:none;"></span>
        </div>
        <div id="omieLastSyncInfo" style="display:none;padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:20px;font-size:12px;color:#166534;">
          <i class="fas fa-check-circle" style="margin-right:6px;"></i><span id="omieLastSyncText">Última sincronização: —</span>
        </div>
        <div style="margin-top:20px;"><button onclick="saveCfgSection('omie')" class="cfg-save-btn"><i class="fas fa-save" style="margin-right:6px;"></i>Salvar Omie</button></div>
      </div>
    </div>
  </div>

  <!-- ══ MODAIS ══════════════════════════════════════════════════════════════ -->

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
        <button id="btnMigrarDetalhe" class="btn btn-sm" style="background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;font-weight:700;"><i class="fas fa-exchange-alt"></i> Migrar Plano</button>
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
        <button id="btnSalvarCliente" class="btn btn-primary"><i class="fas fa-save"></i> Adicionar Cliente</button>
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
      </div>
      <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button id="btnFecharAddMasterUser" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarNovoMasterUser()" class="btn btn-primary" style="background:#7c3aed;"><i class="fas fa-save"></i> Criar Usuário</button>
      </div>
    </div>
  </div>

  <!-- Modal: Novo Chamado de Suporte -->
  <div class="moverlay" id="novoTicketMasterModal">
    <div class="mmodal" style="max-width:500px;">
      <div style="padding:16px 22px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:15px;font-weight:700;color:#7c3aed;"><i class="fas fa-ticket-alt" style="margin-right:8px;"></i>Novo Chamado</h3>
        <button onclick="closeMM('novoTicketMasterModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;line-height:1;">&#215;</button>
      </div>
      <div style="padding:22px;display:flex;flex-direction:column;gap:14px;">
        <div><label class="form-label">Cliente</label>
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
        <button id="btnSalvarTicketMaster" class="btn btn-primary" style="background:#7c3aed;"><i class="fas fa-paper-plane"></i> Criar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Detalhe / Edição de Chamado -->
  <div class="moverlay" id="ticketDetailModal">
    <div class="mmodal" style="max-width:560px;max-height:92vh;display:flex;flex-direction:column;">
      <div style="padding:16px 22px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <h3 id="tdModalTitle" style="margin:0;font-size:15px;font-weight:700;color:#7c3aed;"><i class="fas fa-ticket-alt" style="margin-right:8px;"></i>Chamado</h3>
        <button onclick="closeMM('ticketDetailModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;line-height:1;">&#215;</button>
      </div>
      <div id="tdViewSection" style="overflow-y:auto;flex:1;">
        <div style="padding:22px;display:flex;flex-direction:column;gap:12px;">
          <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Título</div><div id="tdvTitle" style="font-size:14px;font-weight:700;color:#1B4F72;"></div></div>
          <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Descrição</div><div id="tdvDescription" style="font-size:13px;color:#374151;white-space:pre-wrap;background:#f8f9fa;border-radius:6px;padding:10px 12px;"></div></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Cliente</div><div id="tdvCliente" style="font-size:12px;font-weight:600;color:#374151;"></div></div>
            <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Solicitante</div><div id="tdvSolicitante" style="font-size:12px;color:#374151;"></div></div>
            <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Atendente</div><div id="tdvAtendente" style="font-size:12px;color:#374151;"></div></div>
            <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Prioridade</div><div id="tdvPriority" style="font-size:12px;"></div></div>
            <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Status</div><div id="tdvStatus" style="font-size:12px;"></div></div>
            <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Prazo SLA</div><div id="tdvDueAt" style="font-size:12px;"></div></div>
            <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Aberto em</div><div id="tdvCreatedAt" style="font-size:12px;color:#6c757d;"></div></div>
            <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Atualizado em</div><div id="tdvUpdatedAt" style="font-size:12px;color:#6c757d;"></div></div>
          </div>
        </div>
        <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">
          <button onclick="closeMM('ticketDetailModal')" class="btn btn-secondary">Fechar</button>
          <button onclick="switchToEditMode()" class="btn btn-primary" style="background:#7c3aed;"><i class="fas fa-edit" style="margin-right:6px;"></i>Editar</button>
        </div>
      </div>
      <div id="tdEditSection" style="display:none;overflow-y:auto;flex:1;">
        <div style="padding:22px;display:flex;flex-direction:column;gap:14px;">
          <div><label class="form-label">Título *</label><input class="form-control" id="tdeTitle" placeholder="Título do chamado..."></div>
          <div><label class="form-label">Descrição</label><textarea class="form-control" id="tdeDescription" rows="4" placeholder="Descrição..."></textarea></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div><label class="form-label">Prioridade</label>
              <select class="form-control" id="tdePriority">
                <option value="low">🟢 Baixa</option><option value="medium">🟡 Média</option>
                <option value="high">🟠 Alta</option><option value="critical">🔴 Crítica</option>
              </select>
            </div>
            <div><label class="form-label">Status</label>
              <select class="form-control" id="tdeStatus">
                <option value="Criada">Criada</option><option value="Analisando">Analisando</option>
                <option value="N1">N1</option><option value="N2">N2</option><option value="N3">N3</option>
                <option value="Resolvendo">Resolvendo</option><option value="Resolvida">Resolvida</option>
              </select>
            </div>
          </div>
          <div><label class="form-label">Atendente</label><input class="form-control" id="tdeAtendente" placeholder="Nome do atendente..."></div>
        </div>
        <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">
          <button onclick="switchToViewMode()" class="btn btn-secondary">Cancelar</button>
          <button id="btnSaveTicketEdit" class="btn btn-primary" style="background:#7c3aed;"><i class="fas fa-save" style="margin-right:6px;"></i>Salvar</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal: Novo Lançamento Financeiro -->
  <div class="moverlay" id="lancamentoModal">
    <div class="mmodal" style="max-width:480px;">
      <div style="padding:16px 22px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-file-invoice-dollar" style="margin-right:8px;"></i>Novo Lançamento</h3>
        <button id="btnFecharLanc" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;line-height:1;">&#215;</button>
      </div>
      <div style="padding:22px;display:grid;gap:12px;">
        <div><label class="form-label">Empresa (user_id)</label><input id="lanEmpresa" type="text" class="form-control" placeholder="user_id do cliente"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div><label class="form-label">Plano</label>
            <select id="lanPlano" class="form-control">
              <option value="starter">Starter</option>
              <option value="professional">Professional</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div><label class="form-label">Valor (R$)</label><input id="lanValor" type="number" step="0.01" class="form-control" placeholder="0.00"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div><label class="form-label">Vencimento</label><input id="lanVencimento" type="date" class="form-control"></div>
          <div><label class="form-label">Status</label>
            <select id="lanStatus" class="form-control">
              <option value="pending">Pendente</option>
              <option value="paid">Pago</option>
              <option value="overdue">Vencido</option>
            </select>
          </div>
        </div>
        <div><label class="form-label">Observação</label><textarea id="lanObs" rows="2" class="form-control"></textarea></div>
      </div>
      <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button id="btnFecharLanc" class="btn btn-secondary">Cancelar</button>
        <button id="btnSalvarLanc" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Detalhe da Fatura -->
  <div class="moverlay" id="finDetalheModal">
    <div class="mmodal" style="max-width:560px;">
      <div style="padding:16px 22px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-file-invoice-dollar" style="margin-right:8px;color:#7c3aed;"></i>Detalhe da Fatura</h3>
        <button id="btnFecharFinDetalhe" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;line-height:1;">&#215;</button>
      </div>
      <div style="padding:22px;" id="finDetalheBody"></div>
      <div style="padding:12px 22px;border-top:1px solid #f1f3f5;display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="btnFinMarcarPago" style="padding:7px 14px;background:#16a34a;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;"><i class="fas fa-check" style="margin-right:5px;"></i>Marcar Pago</button>
          <button id="btnFinMarcarVencido" style="padding:7px 14px;background:#d97706;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;"><i class="fas fa-clock" style="margin-right:5px;"></i>Marcar Vencido</button>
          <button id="btnFinCancelar" style="padding:7px 14px;background:#dc2626;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;"><i class="fas fa-ban" style="margin-right:5px;"></i>Cancelar</button>
        </div>
        <button id="btnFecharFinDetalhe2" style="padding:7px 14px;background:#f1f3f5;color:#374151;border:1px solid #e9ecef;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Fechar</button>
      </div>
    </div>
  </div>

  <!-- ══ JAVASCRIPT COMPLETO ══════════════════════════════════════ -->
  <script>
  // ── Dados e estado global ─────────────────────────────────────────────────
  let masterClientsData = ${safeJsonForScriptTag(clients)};
  const plansData       = ${safeJsonForScriptTag(PLANS)};
  let _curCliId         = null;
  window._curCliId      = null;
  let _curDetTab        = 'info';
  let _viewingTicketId  = null;
  let _editingTicketId  = null;
  let _newTicketCliId   = null;
  let _finCurrentId     = null;

  // Financeiro
  let _finData     = [];
  let _finFiltered = [];
  let _finPage     = 1;
  const _finPageSize = 20;
  let _finSortKey  = 'due_date';
  let _finSortDir  = -1;

  const FIN_STATUS_LABEL = { pending:'Pendente', paid:'Pago', overdue:'Vencido', cancelled:'Cancelado', refunded:'Reembolsado', failed:'Falhou' };
  const FIN_TYPE_LABEL   = { monthly:'Mensalidade', setup:'Setup', upgrade:'Upgrade', manual:'Manual', refund:'Reembolso', annual:'Anual' };
  const PLAN_COLOR       = { starter:'#27AE60', professional:'#2980B9', enterprise:'#7c3aed' };
  const SUPPORT_STATUS_ORDER = ['Criada','Analisando','N1','N2','N3','Resolvendo','Resolvida'];
  const PRIORITY_COLORS  = { critical:'#dc2626', high:'#ea580c', medium:'#d97706', low:'#16a34a' };
  const PRIORITY_LABELS_PT = { critical:'Crítica', high:'Alta', medium:'Média', low:'Baixa' };
  let _masterTickets = [];

  const FMT_BRL  = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2});
  const FMT_DATE = s => s ? new Date(s+'T12:00:00').toLocaleDateString('pt-BR') : '—';

  // ── Escape seguro para innerHTML dinâmico ─────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────
  function openMM(id)  { const el=document.getElementById(id); if(el){el.style.display='flex';el.classList.add('open');} }
  function closeMM(id) { const el=document.getElementById(id); if(el){el.style.display='none';el.classList.remove('open');} }

  // ── Event delegation central ──────────────────────────────────────────────
  document.addEventListener('click', function(e) {
    const el = e.target;

    // data-action
    const actionBtn = el.closest('[data-action]');
    if (actionBtn) {
      const action = actionBtn.dataset.action;
      const id     = actionBtn.dataset.ticketId || actionBtn.dataset.id;

      // Clientes
      if      (action === 'detail')               openClientDetail(id);
      else if (action === 'migrate')              openMigrateModal(id);
      else if (action === 'obs')                  openObsModal(id);
      else if (action === 'suspend')              suspenderCliente(id);
      else if (action === 'reactivate')           reativarCliente(id);
      else if (action === 'toggle-master-user')   toggleMasterUser(id);
      else if (action === 'migrate-from-detail')  { openMigrateModal(id); closeMM('clientDetailModal'); }
      else if (action === 'new-ticket-for-client') openNovoTicketMasterForClient(id || _curCliId);

      // Suporte
      else if (action === 'ticket-view')          viewTicket(id);
      else if (action === 'ticket-edit')          editTicket(id);

      // Financeiro — SEM onclick inline, tudo via data-action
      else if (action === 'fin-detalhe')          openFinDetalhe(id);
      else if (action === 'fin-edit')             openEditLancamento(id);
      else if (action === 'omie-push')            pushParaOmie(id);
      else if (action === 'omie-boleto-gerar')    gerarBoletoOmie(id, actionBtn.dataset.omieId);
      else if (action === 'omie-nfse-emitir')     emitirNFSeOmie(id, actionBtn.dataset.omieId);

      return;
    }

    // data-tab → abas principais
    const tabBtn = el.closest('[data-tab]');
    if (tabBtn) { switchPanelTab(tabBtn.dataset.tab); return; }

    // data-ptab → abas da página de cliente
    const ptabBtn = el.closest('[data-ptab]');
    if (ptabBtn) {
      const tab = ptabBtn.dataset.ptab;
      ['info','modulos','pagamentos','atividade'].forEach(t => {
        const panel = document.getElementById('panel' + t.charAt(0).toUpperCase() + t.slice(1));
        const btn   = document.getElementById('tab' + ({info:'Info',modulos:'Mod',pagamentos:'Pag',atividade:'Ativ'})[t]);
        if (panel) panel.style.display = (t===tab) ? '' : 'none';
        if (btn)   btn.className = 'panel-tab' + (t===tab?' active':'');
      });
      return;
    }

    // data-det-tab → abas do modal de detalhes
    const detTabBtn = el.closest('[data-det-tab]');
    if (detTabBtn) { switchDetTab(detTabBtn.dataset.detTab); return; }

    // data-cfg → sub-abas de configurações
    const cfgTabBtn = el.closest('[data-cfg]');
    if (cfgTabBtn) {
      const cfg = cfgTabBtn.dataset.cfg;
      document.querySelectorAll('.cfg-tab').forEach(b => b.classList.remove('active'));
      cfgTabBtn.classList.add('active');
      ['geral','branding','notificacoes','backup','seguranca','api','omie'].forEach(s => {
        const sec = document.getElementById('cfg' + s.charAt(0).toUpperCase() + s.slice(1));
        if (sec) sec.style.display = (s===cfg) ? '' : 'none';
      });
      return;
    }

    // Fechar overlay ao clicar fora
    if (el.classList && el.classList.contains('moverlay')) {
      el.style.display='none'; el.classList.remove('open'); return;
    }

    // Botões com ID fixo
    const btn = el.closest('button');
    if (!btn) return;
    switch (btn.id) {
      case 'btnNovoCliente':          openMM('addClientModal');       break;
      case 'btnNovoTicketMaster':     openNovoTicketMasterModal();    break;
      case      'btnExportCSV':           exportClientCSV();              break;
      case 'btnNovoMasterUser':      openMM('addMasterUserModal');   break;
      case 'btnMigrarDetalhe':       openMigrateModal(window._curCliId); closeMM('clientDetailModal'); break;
      case 'btnFecharDetalhe':       closeMM('clientDetailModal');   break;
      case 'btnFecharMigracao':      closeMM('migrateModal');        break;
      case 'btnConfirmarMigracao':   confirmarMigracao();            break;
      case 'btnFecharObs':           closeMM('obsModal');            break;
      case 'btnSalvarObs':           salvarObs();                    break;
      case 'btnSalvarCliente':       salvarNovoCliente();            break;
      case 'btnFecharAddClient':     closeMM('addClientModal');      break;
      case 'btnFecharAddMasterUser': closeMM('addMasterUserModal');  break;
      case 'btnNovoLancamento':      openNovoLancamento();           break;
      case 'btnSalvarLanc':          salvarLancamento();             break;
      case 'btnFecharLanc':          closeMM('lancamentoModal');     break;
      case 'btnFecharFinDetalhe':    closeMM('finDetalheModal');     break;
      case 'btnFecharFinDetalhe2':   closeMM('finDetalheModal');     break;
      case 'btnFinMarcarPago':       finMarkAs('paid');              break;
      case 'btnFinMarcarVencido':    finMarkAs('overdue');           break;
      case 'btnFinCancelar':         finMarkAs('cancelled');         break;
      case 'btnSalvarTicketMaster':  salvarTicketMaster();           break;
      case 'btnSaveTicketEdit':      saveTicketEdit();               break;
    }
  });

  // ── Event delegation: select de status do kanban ──────────────────────────
  document.addEventListener('change', function(e) {
    const sel = e.target && e.target.closest ? e.target.closest('select[data-action="ticket-status"]') : null;
    if (!sel) return;
    const ticketId = sel.dataset.ticketId;
    if (ticketId) updateTicketStatus(ticketId, sel.value);
  });

  // ── Abas do painel principal ──────────────────────────────────────────────
  function switchPanelTab(tab) {
    const panels = {
      clientes:'panelClientes', suporte:'panelSuporte', usuarios:'panelUsuarios',
      auditoria:'panelAuditoria', financeiro:'panelFinanceiro', configuracoes:'panelConfiguracoes'
    };
    const tabs = {
      clientes:'tabClientes', suporte:'tabSuporte', usuarios:'tabUsuarios',
      auditoria:'tabAuditoria', financeiro:'tabFinanceiro', configuracoes:'tabConfiguracoes'
    };
    Object.keys(panels).forEach(key => {
      const panel = document.getElementById(panels[key]);
      const btn   = document.getElementById(tabs[key]);
      if (panel) panel.style.display = (key===tab) ? '' : 'none';
      if (btn)   btn.className = 'panel-tab' + (key===tab?' active':'');
    });
    if (tab === 'suporte')       loadSupportTickets();
    if (tab === 'financeiro')    loadFinanceiro();
    if (tab === 'configuracoes') loadPlatformSettings();
  }

  // ── Filtros de clientes ───────────────────────────────────────────────────
  function filterClients() {
    const q  = (document.getElementById('searchClients')?.value||'').toLowerCase();
    const st = document.getElementById('filterStatus')?.value||'';
    const pl = document.getElementById('filterPlano')?.value||'';
    let count = 0;
    document.querySelectorAll('#clientTableBody tr').forEach(row => {
      const show = (!q||( row.dataset.search||'').includes(q)) && (!st||(row.dataset.status||'')===st) && (!pl||(row.dataset.plano||'')===pl);
      row.style.display = show ? '' : 'none';
      if (show) count++;
    });
    const el = document.getElementById('clientCount');
    if (el) el.textContent = count + ' clientes';
  }

  // ── Detalhes do cliente ───────────────────────────────────────────────────
  function openClientDetail(id) {
    const cli = masterClientsData.find(c => c.id === id);
    if (!cli) { showToast('Cliente não encontrado', 'error'); return; }
    _curCliId = id; window._curCliId = id;
    const titleEl = document.getElementById('detailTitle');
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-building" style="margin-right:8px;"></i>' + esc(cli.fantasia||cli.empresa);
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

  function dRow(label, val) {
    return '<div style="background:#f8f9fa;border-radius:8px;padding:9px 11px;">' +
      '<div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:2px;">' + label + '</div>' +
      '<div style="font-size:13px;color:#374151;font-weight:500;">' + val + '</div></div>';
  }

  function renderDetTab(tab) {
    const cli = masterClientsData.find(c => c.id === _curCliId);
    if (!cli) return;
    const pl = plansData[cli.plano] || plansData.starter;
    const statusMap = {
      active:  {label:'Ativo',   color:'#16a34a', bg:'#f0fdf4'},
      trial:   {label:'Trial',   color:'#d97706', bg:'#fffbeb'},
      inactive:{label:'Inativo', color:'#6c757d', bg:'#e9ecef'}
    };
    const st = statusMap[cli.status] || statusMap.inactive;
    let html = '';

    if (tab === 'info') {
      html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">' +
        dRow('Empresa', esc(cli.empresa)) +
        dRow('Fantasia', esc(cli.fantasia||'—')) +
        dRow('CNPJ', esc(cli.cnpj||'—')) +
        dRow('Setor', esc(cli.setor||'—')) +
        dRow('Porte', esc(cli.porte||'—')) +
        dRow('Status', '<span class="mbadge" style="background:'+st.bg+';color:'+st.color+';">'+st.label+'</span>') +
        dRow('Responsável', esc(cli.responsavel)) +
        dRow('E-mail', '<a href="mailto:'+esc(cli.email)+'" style="color:#2980B9;">'+esc(cli.email)+'</a>') +
        dRow('Telefone', esc(cli.tel||'—')) +
        dRow('Plano', '<span class="mbadge" style="background:'+pl.bg+';color:'+pl.color+';">'+pl.label+'</span>') +
        dRow('Billing', esc({monthly:'Mensal',annual:'Anual',trial:'Trial'}[cli.billing]||cli.billing)) +
        dRow('Valor/mês', cli.status==='active'?FMT_BRL(cli.valor):'R$ —') +
        dRow('Empresas', String(cli.empresas)) +
        dRow('Usuários', String(cli.usuarios)) +
        dRow('Criado em', FMT_DATE(cli.criadoEm)) +
        dRow('Último acesso', FMT_DATE(cli.ultimoAcesso)) +
        '</div>';
      if (cli.obs) {
        html += '<div style="margin-top:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;">' +
          '<div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;margin-bottom:3px;">Observações</div>' +
          '<div style="font-size:13px;color:#374151;">'+esc(cli.obs)+'</div></div>';
      }
      if (cli.status === 'trial') {
        const dl = cli.trialEnd ? Math.ceil((new Date(cli.trialEnd).getTime()-Date.now())/(1000*60*60*24)) : 0;
        html += '<div style="margin-top:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px;display:flex;align-items:center;gap:10px;">' +
          '<i class="fas fa-clock" style="color:#dc2626;font-size:18px;"></i>' +
          '<div><div style="font-size:13px;font-weight:700;color:#dc2626;">Trial: '+dl+' dia(s) restantes</div>' +
          '<div style="font-size:11px;color:#9ca3af;">Expira: '+esc(cli.trialEnd||'')+'</div></div>' +
          '<button data-action="migrate-from-detail" data-id="'+esc(cli.id)+'" class="btn btn-sm" style="margin-left:auto;background:#7c3aed;color:white;border:none;">' +
          '<i class="fas fa-exchange-alt"></i> Migrar</button></div>';
      }
    } else if (tab === 'modulos') {
      html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
        '<div style="font-size:13px;font-weight:700;color:#374151;">Módulos ('+cli.modulos.length+')</div>' +
        '<a href="/master/client/'+esc(cli.id)+'" target="_blank" style="font-size:11px;font-weight:700;color:#7c3aed;text-decoration:none;padding:4px 10px;border:1px solid #ddd6fe;border-radius:6px;background:#f5f3ff;">' +
        '<i class="fas fa-external-link-alt" style="margin-right:5px;font-size:10px;"></i>Gerenciar Acesso</a></div>';
      const allMods = ['Ordens','Planejamento','Estoque','Qualidade','Suprimentos','Engenharia','Apontamento','Importação','Recursos'];
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
      allMods.forEach(m => {
        const on = cli.modulos.includes(m);
        html += '<span style="font-size:12px;font-weight:600;padding:6px 14px;border-radius:20px;background:'+(on?'#1B4F72':'#f1f3f5')+';color:'+(on?'white':'#9ca3af')+';">' +
          '<i class="fas '+(on?'fa-check':'fa-times')+'" style="margin-right:5px;font-size:10px;"></i>'+esc(m)+'</span>';
      });
      html += '</div>';
    } else if (tab === 'suporte') {
      html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
        '<div style="font-size:13px;font-weight:700;color:#374151;">Chamados de Suporte</div>' +
        '<button class="btn btn-sm" style="background:#7c3aed;color:white;border:none;" data-action="new-ticket-for-client" data-id="'+esc(cli.id)+'">' +
        '<i class="fas fa-plus"></i> Novo Chamado</button></div>' +
        '<div id="detSupportTickets" style="min-height:80px;"><div style="text-align:center;padding:20px;color:#9ca3af;"><i class="fas fa-spinner fa-spin"></i></div></div>';
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
          ' <\/thead><tbody>';
        cli.pagamentos.forEach(p => {
          const sc = p.status==='pago'?'#16a34a':'#dc2626';
          const sb = p.status==='pago'?'#f0fdf4':'#fef2f2';
          html += '<tr style="border-bottom:1px solid #f1f3f5;">' +
            '<td style="padding:8px;font-weight:600;color:#374151;">'+esc(p.mes)+'<\/td>' +
            '<td style="padding:8px;text-align:right;font-weight:700;color:#1B4F72;">'+FMT_BRL(p.valor)+'<\/td>' +
            '<td style="padding:8px;text-align:center;"><span class="mbadge" style="background:'+sb+';color:'+sc+';">'+esc(p.status)+'</span><\/td>' +
            '<td style="padding:8px;color:#6c757d;">'+esc(p.data)+'<\/td>' +
            '<\/tr>';
        });
        html += '<\/tbody><\/table>';
      }
    } else if (tab === 'atividade') {
      html = '<div style="display:flex;flex-direction:column;gap:0;">';
      const pl2 = plansData[cli.plano] || plansData.starter;
      const events = [
        { icon:'fa-user-plus',   color:'#27AE60', desc:'Conta criada',    date:cli.criadoEm,              detail:'Plano '+pl2.label },
        { icon:'fa-sign-in-alt', color:'#2980B9', desc:'Último acesso',   date:cli.ultimoAcesso,          detail:'Usuário: '+cli.responsavel },
        ...(cli.status==='trial'?[{icon:'fa-clock',color:'#d97706',desc:'Trial ativo',date:cli.trialStart||cli.criadoEm,detail:'Expira: '+cli.trialEnd}]:[]),
      ];
      events.forEach(ev => {
        html += '<div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #f1f3f5;">' +
          '<div style="width:32px;height:32px;border-radius:50%;background:#f1f3f5;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
          '<i class="fas '+ev.icon+'" style="font-size:11px;color:'+ev.color+';"></i></div>' +
          '<div><div style="font-size:13px;font-weight:600;color:#374151;">'+esc(ev.desc)+'</div>' +
          '<div style="font-size:11px;color:#9ca3af;">'+FMT_DATE(ev.date)+' · '+esc(ev.detail)+'</div></div></div>';
      });
      html += '</div>';
    }

    const body = document.getElementById('detailBody');
    if (body) body.innerHTML = html;
  }

  // ── Migrar Plano ──────────────────────────────────────────────────────────
  function openMigrateModal(id) {
    const cli = masterClientsData.find(c => c.id === id);
    if (!cli) { showToast('Cliente não encontrado', 'error'); return; }
    _curCliId = id; window._curCliId = id;
    const trialPlus = new Date(Date.now()+30*86400000).toISOString().split('T')[0];
    let html = '<div style="background:#f8f9fa;border-radius:10px;padding:12px;margin-bottom:16px;">' +
      '<div style="font-size:11px;color:#9ca3af;margin-bottom:1px;">Cliente selecionado</div>' +
      '<div style="font-size:15px;font-weight:700;color:#1B4F72;">'+esc(cli.fantasia||cli.empresa)+'</div>' +
      '<div style="font-size:12px;color:#6c757d;">'+esc(cli.responsavel)+' · '+esc(cli.email)+'</div></div>';
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
      Object.entries(plansData).map(([k,v]) =>
        '<option value="'+esc(k)+'" '+(k===cli.plano?'selected':'')+'>'+esc(v.label)+' — R$ '+v.monthlyBase+'/mês</option>'
      ).join('') + '</select></div>';
    html += '<div id="mg_billingGroup"><label class="form-label">Cobrança</label>' +
      '<select class="form-control" id="mg_billing">' +
      '<option value="monthly" '+(cli.billing==='monthly'?'selected':'')+'>Mensal</option>' +
      '<option value="annual">Anual (20% off)</option>' +
      '</select></div>';
    html += '<div id="mg_trialGroup" style="display:none;grid-column:span 2;">' +
      '<label class="form-label">Nova data de expiração do trial</label>' +
      '<input class="form-control" type="date" id="mg_trialEnd" value="'+trialPlus+'"></div>';
    html += '<div style="grid-column:span 2;"><label class="form-label">Motivo / Justificativa *</label>' +
      '<textarea class="form-control" id="mg_motivo" rows="2" placeholder="Ex: Solicitação via WhatsApp..."></textarea></div>';
    html += '</div>';
    html += '<div style="margin-top:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:9px 12px;font-size:11px;color:#856404;">' +
      '<i class="fas fa-info-circle" style="margin-right:5px;"></i>Alteração registrada no log de auditoria.</div>';
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
      acao:     document.getElementById('mg_acao')?.value,
      plano:    document.getElementById('mg_plano')?.value,
      billing:  document.getElementById('mg_billing')?.value,
      trialEnd: document.getElementById('mg_trialEnd')?.value,
      motivo
    };
    try {
      const res = await fetch('/master/api/migrate-plan', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
      });
      if (res.ok) { closeMM('migrateModal'); showToast('Alteração registrada!', 'success'); setTimeout(()=>location.reload(),1200); }
      else { showToast('Erro ao salvar alteração.', 'error'); }
    } catch { showToast('Erro de conexão.', 'error'); }
  }

  // ── Ações rápidas ─────────────────────────────────────────────────────────
  async function suspenderCliente(id) {
    if (!confirm('Suspender este cliente? O acesso será bloqueado.')) return;
    try {
      const res = await fetch('/master/api/migrate-plan', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ clientId:id, acao:'suspend', motivo:'Suspensão via painel master' })
      });
      if (res.ok) { showToast('Cliente suspenso.', 'success'); setTimeout(()=>location.reload(),1000); }
      else { showToast('Erro ao suspender.', 'error'); }
    } catch { showToast('Erro de conexão.', 'error'); }
  }

  async function reativarCliente(id) {
    if (!confirm('Reativar este cliente?')) return;
    try {
      const res = await fetch('/master/api/migrate-plan', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ clientId:id, acao:'reactivate', motivo:'Reativação via painel master' })
      });
      if (res.ok) { showToast('Cliente reativado!', 'success'); setTimeout(()=>location.reload(),1000); }
      else { showToast('Erro ao reativar.', 'error'); }
    } catch { showToast('Erro de conexão.', 'error'); }
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
    try {
      await fetch('/master/api/save-obs', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ clientId:_curCliId, obs })
      });
      closeMM('obsModal');
      showToast('Anotação salva!', 'success');
      setTimeout(()=>location.reload(), 800);
    } catch { showToast('Erro ao salvar anotação.', 'error'); }
  }

  // ── Novo Cliente ──────────────────────────────────────────────────────────
  async function salvarNovoCliente() {
    const emp   = document.getElementById('ac_empresa')?.value?.trim();
    const resp  = document.getElementById('ac_resp')?.value?.trim();
    const email = document.getElementById('ac_email')?.value?.trim();
    const errDiv = document.getElementById('addClientError');
    if (!emp || !resp || !email) {
      if (errDiv) { errDiv.textContent='Preencha Razão Social, Responsável e E-mail.'; errDiv.style.display='block'; }
      return;
    }
    if (errDiv) errDiv.style.display='none';
    const btn = document.getElementById('btnSalvarCliente');
    if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvando...'; }
    const payload = {
      empresa:    emp,
      fantasia:   document.getElementById('ac_fantasia')?.value?.trim()||emp,
      responsavel:resp, email,
      tel:        document.getElementById('ac_tel')?.value?.trim()||'',
      cnpj:       document.getElementById('ac_cnpj')?.value?.trim()||'',
      setor:      document.getElementById('ac_setor')?.value||'',
      porte:      document.getElementById('ac_porte')?.value||'pequena',
      plano:      document.getElementById('ac_plano')?.value||'starter',
      status:     document.getElementById('ac_status')?.value||'trial',
      obs:        document.getElementById('ac_obs')?.value?.trim()||'',
    };
    try {
      const res  = await fetch('/master/api/add-client', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
      });
      const data = await res.json().catch(()=>({}));
      if (res.ok && data.ok) {
        closeMM('addClientModal');
        showToast('Cliente "'+payload.empresa+'" adicionado!', 'success');
        setTimeout(()=>location.reload(), 1200);
      } else {
        if (errDiv) { errDiv.textContent=data.error||'Erro ao adicionar cliente.'; errDiv.style.display='block'; }
        if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Adicionar Cliente'; }
      }
    } catch {
      if (errDiv) { errDiv.textContent='Erro de conexão.'; errDiv.style.display='block'; }
      if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Adicionar Cliente'; }
    }
  }

  // ── Novo Usuário Master ───────────────────────────────────────────────────
  async function salvarNovoMasterUser() {
    const name  = document.getElementById('mu_name')?.value?.trim();
    const email = document.getElementById('mu_email')?.value?.trim();
    const pwd   = document.getElementById('mu_pwd')?.value?.trim();
    const role  = document.getElementById('mu_role')?.value||'viewer';
    if (!name||!email||!pwd) { showToast('Preencha nome, e-mail e senha.','error'); return; }
    if (pwd.length < 8) { showToast('Senha deve ter ao menos 8 caracteres.','error'); return; }
    try {
      const res  = await fetch('/master/api/add-master-user', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,email,pwd,role})
      });
      const data = await res.json().catch(()=>({}));
      if (res.ok) { closeMM('addMasterUserModal'); showToast('Usuário "'+name+'" criado!','success'); setTimeout(()=>location.reload(),1000); }
      else { showToast('Erro: '+(data.error||'Tente novamente.'),'error'); }
    } catch { showToast('Erro de conexão.','error'); }
  }

  function togglePwdMU() {
    const inp = document.getElementById('mu_pwd');
    const ico = document.getElementById('muEye');
    if (!inp) return;
    inp.type = inp.type==='password' ? 'text' : 'password';
    if (ico) ico.className = inp.type==='password' ? 'fas fa-eye' : 'fas fa-eye-slash';
  }

  async function toggleMasterUser(id) {
    try {
      const res = await fetch('/master/api/toggle-master-user', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id})
      });
      if (res.ok) { showToast('Status atualizado!','success'); setTimeout(()=>location.reload(),800); }
      else { showToast('Erro ao atualizar.','error'); }
    } catch { showToast('Erro de conexão.','error'); }
  }

  // ── Exportar CSV de clientes ──────────────────────────────────────────────
  function exportClientCSV() {
    const rows = [['Empresa','Fantasia','Responsável','E-mail','Telefone','Plano','Status','Valor/mês','Criado em']];
    masterClientsData.forEach(c => {
      rows.push([c.empresa,c.fantasia,c.responsavel,c.email,c.tel||'',c.plano,c.status,c.valor,c.criadoEm]);
    });
    const csv = rows.map(r => r.map(v => '"'+String(v||'').replace(/"/g,'""')+'"').join(',')).join('\\n');
    const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'clientes_'+new Date().toISOString().split('T')[0]+'.csv';
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Financeiro ────────────────────────────────────────────────────────────
  async function loadFinanceiro() {
    const tbody = document.getElementById('finTableBody');
    if (tbody) tbody.innerHTML = '编码<td colspan="9" style="text-align:center;padding:40px;color:#9ca3af;"><i class="fas fa-spinner fa-spin" style="font-size:20px;"></i><\/td><\/tr>';

    const status  = document.getElementById('finFiltroStatus')?.value  || '';
    const periodo = document.getElementById('finFiltroPeriodo')?.value || 'all';
    const plan    = document.getElementById('finFiltroPlan')?.value    || '';

    try {
      let url = '/master/api/financeiro?';
      if (status)  url += 'status='  + encodeURIComponent(status)  + '&';
      if (periodo) url += 'periodo=' + encodeURIComponent(periodo) + '&';
      if (plan)    url += 'plan='    + encodeURIComponent(plan)    + '&';

      const res  = await fetch(url);
      const data = await res.json().catch(()=>({ok:false}));

      if (!res.ok || !data.ok) {
        _finData = buildFinDataFromClients();
      } else {
        _finData = data.invoices || [];
      }
    } catch {
      _finData = buildFinDataFromClients();
    }

    updateFinKPIs();
    _finFiltered = [..._finData];
    filterFinTable();
  }

  function buildFinDataFromClients() {
    const today = new Date().toISOString().split('T')[0];
    return masterClientsData.map((cli, i) => ({
      id:           'inv_' + cli.id,
      user_id:      cli.id,
      empresa_name: cli.fantasia || cli.empresa,
      user_email:   cli.email,
      plan:         cli.plano,
      type:         cli.billing === 'annual' ? 'annual' : 'monthly',
      amount:       cli.valor || 0,
      due_date:     cli.trialEnd || today,
      paid_at:      cli.status === 'active' ? today : null,
      status:       cli.status === 'active' ? 'paid' : cli.status === 'trial' ? 'pending' : 'cancelled',
      omie_codigo_lancamento: null,
      omie_boleto_url:        null,
      omie_nfse_numero:       null,
    }));
  }

  function updateFinKPIs() {
    const now   = new Date();
    const month = now.getMonth();
    const year  = now.getFullYear();

    const active   = _finData.filter(r => r.status === 'paid');
    const pending  = _finData.filter(r => r.status === 'pending');
    const overdue  = _finData.filter(r => r.status === 'overdue' || (r.status==='pending' && r.due_date && new Date(r.due_date) < now));
    const paidMonth= _finData.filter(r => r.status==='paid' && r.paid_at && new Date(r.paid_at).getMonth()===month && new Date(r.paid_at).getFullYear()===year);

    const mrr = active.reduce((s,r)=>s+(r.amount||0),0);
    const arr = mrr * 12;
    const pendVal  = pending.reduce((s,r)=>s+(r.amount||0),0);
    const overdueVal = overdue.reduce((s,r)=>s+(r.amount||0),0);
    const paidVal  = paidMonth.reduce((s,r)=>s+(r.amount||0),0);

    const set = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
    set('kpiMRRVal',    FMT_BRL(mrr));
    set('kpiARRVal',    FMT_BRL(arr));
    set('kpiPendenteVal', FMT_BRL(pendVal));
    set('kpiPendenteSub', pending.length + ' faturas');
    set('kpiVencidoVal',  FMT_BRL(overdueVal));
    set('kpiVencidoSub',  overdue.length + ' faturas');
    set('kpiPagoVal',     FMT_BRL(paidVal));
    set('kpiPagoSub',     paidMonth.length + ' faturas no mês');
    set('kpiAssinantesVal', active.length + ' ativos / ' + masterClientsData.filter(c=>c.status==='trial').length + ' trial');
  }

  function filterFinTable() {
    const q = (document.getElementById('finFiltroSearch')?.value||'').toLowerCase();
    _finFiltered = _finData.filter(r => {
      if (!q) return true;
      return (r.empresa_name||'').toLowerCase().includes(q) || (r.user_email||'').toLowerCase().includes(q);
    });
    _finPage = 1;
    renderFinTable();
  }

  function finChangePage(dir) {
    const totalPgs = Math.ceil(_finFiltered.length / _finPageSize);
    _finPage = Math.max(1, Math.min(totalPgs, _finPage + dir));
    renderFinTable();
  }

  function renderFinTable() {
    const tbody = document.getElementById('finTableBody');
    if (!tbody) return;
    const start = (_finPage - 1) * _finPageSize;
    const page  = _finFiltered.slice(start, start + _finPageSize);

    if (_finFiltered.length === 0) {
      tbody.innerHTML = '编码<td colspan="9" style="text-align:center;padding:40px;color:#9ca3af;">' +
        '<i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px;"></i>Nenhum registro encontrado<\/td><\/tr>';
      const cc = document.getElementById('finCount');    if(cc) cc.textContent = '0 registros';
      const pi = document.getElementById('finPagInfo');  if(pi) pi.textContent = '';
      const pb = document.getElementById('finPagBtns');  if(pb) pb.innerHTML   = '';
      return;
    }

    const totalPgs = Math.ceil(_finFiltered.length / _finPageSize);
    const cc = document.getElementById('finCount');
    const pi = document.getElementById('finPagInfo');
    const pb = document.getElementById('finPagBtns');
    if(cc) cc.textContent = _finFiltered.length + ' registros';
    if(pi) pi.textContent = 'Página ' + _finPage + ' de ' + totalPgs;
    if(pb) pb.innerHTML =
      '<button onclick="finChangePage(-1)" ' + (_finPage<=1?'disabled':'') +
        ' style="padding:5px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;cursor:pointer;font-size:12px;">' +
        '<i class="fas fa-chevron-left"></i></button>' +
      '<button onclick="finChangePage(1)" '  + (_finPage>=totalPgs?'disabled':'') +
        ' style="padding:5px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;cursor:pointer;font-size:12px;">' +
        '<i class="fas fa-chevron-right"></i></button>';

    const planLabel = { starter:'Starter', professional:'Professional', enterprise:'Enterprise' };

    tbody.innerHTML = page.map(function(row) {
      const badge     = 'fin-badge-' + (row.status||'pending');
      const pc        = PLAN_COLOR[row.plan] || '#6c757d';
      const isOverdue = row.status==='pending' && row.due_date && new Date(row.due_date) < new Date();
      const rowBg     = isOverdue ? 'background:#fff5f5;' : '';
      const overdueSt = isOverdue ? 'color:#dc2626;font-weight:700;' : '';

      const planBadge = '<span style="background:'+pc+'20;color:'+pc+';font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;">' +
        esc(planLabel[row.plan]||row.plan) + '</span>';
      const statusBadge = '<span class="'+badge+'">' + esc(FIN_STATUS_LABEL[row.status]||row.status) + '</span>';

      // ── Omie badges — sem onclick inline ─────────────────────────────────
      var omieBadges = [];
      if (row.omie_codigo_lancamento) {
        omieBadges.push('<span class="omie-badge" title="Omie: #'+esc(String(row.omie_codigo_lancamento))+'">🔗 Omie</span>');
      }
      if (row.omie_boleto_url) {
        omieBadges.push('<a class="omie-badge omie-boleto" href="'+esc(row.omie_boleto_url)+'" target="_blank">📄 Boleto</a>');
      } else if (row.omie_codigo_lancamento) {
        omieBadges.push(
          '<button class="abtn omie-boleto"' +
          ' data-action="omie-boleto-gerar"' +
          ' data-id="'+esc(String(row.id))+'"' +
          ' data-omie-id="'+esc(String(row.omie_codigo_lancamento))+'"' +
          ' style="font-size:10px;padding:2px 5px;">📄 Gerar Boleto</button>'
        );
      }
      if (row.omie_nfse_numero) {
        omieBadges.push('<span class="omie-badge omie-nfse">🧾 NFS-e #'+esc(String(row.omie_nfse_numero))+'</span>');
      } else if (row.omie_codigo_lancamento) {
        omieBadges.push(
          '<button class="abtn omie-nfse"' +
          ' data-action="omie-nfse-emitir"' +
          ' data-id="'+esc(String(row.id))+'"' +
          ' data-omie-id="'+esc(String(row.omie_codigo_lancamento))+'"' +
          ' style="font-size:10px;padding:2px 5px;">🧾 NFS-e</button>'
        );
      }
      if (!row.omie_codigo_lancamento) {
        omieBadges.push(
          '<button class="abtn"' +
          ' data-action="omie-push"' +
          ' data-id="'+esc(String(row.id))+'"' +
          ' style="font-size:10px;padding:2px 5px;">+Omie</button>'
        );
      }

      var safeId = esc(String(row.id==null?'':row.id));

      return '<tr class="fin-tr" style="'+rowBg+'">' +
        '<td class="fin-td"><div style="font-weight:600;color:#1B4F72;">'+esc(row.empresa_name||row.user_email||'—')+'</div>' +
        '<div style="font-size:10px;color:#9ca3af;">'+esc(row.user_email||'')+'</div><\/td>' +
        '<td class="fin-td">'+planBadge+'<\/td>' +
        '<td class="fin-td" style="color:#6c757d;">'+esc(FIN_TYPE_LABEL[row.type]||row.type||'—')+'<\/td>' +
        '<td class="fin-td" style="font-weight:700;color:#374151;">'+FMT_BRL(row.amount)+'<\/td>' +
        '<td class="fin-td" style="'+overdueSt+'">'+FMT_DATE(row.due_date)+'<\/td>' +
        '<td class="fin-td" style="color:#16a34a;">'+FMT_DATE(row.paid_at)+'<\/td>' +
        '<td class="fin-td">'+statusBadge+'<\/td>' +
        '<td class="fin-td" style="text-align:center;">'+(omieBadges.length?omieBadges.join(' '):'<span style="color:#d1d5db;font-size:11px;">—</span>')+'<\/td>' +
        '<td class="fin-td" style="white-space:nowrap;">' +
          '<button class="abtn" data-action="fin-detalhe" data-id="'+safeId+'" title="Detalhes"><i class="fas fa-eye"></i></button> ' +
          '<button class="abtn" data-action="fin-edit"    data-id="'+safeId+'" title="Editar"><i class="fas fa-pencil-alt"></i></button>' +
        '<\/td>' +
      '<\/tr>';
    }).join('');
  }

  function openFinDetalhe(id) {
    const row = _finData.find(r => String(r.id) === String(id));
    if (!row) { showToast('Fatura não encontrada','error'); return; }
    _finCurrentId = id;
    const body = document.getElementById('finDetalheBody');
    if (body) {
      const pl = PLAN_COLOR[row.plan]||'#6c757d';
      body.innerHTML =
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
        dRow('Empresa',    esc(row.empresa_name||'—')) +
        dRow('E-mail',     esc(row.user_email||'—')) +
        dRow('Plano',      '<span style="background:'+pl+'20;color:'+pl+';font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">'+esc(row.plan||'—')+'</span>') +
        dRow('Tipo',      esc(FIN_TYPE_LABEL[row.type]||row.type||'—')) +
        dRow('Valor',     FMT_BRL(row.amount)) +
        dRow('Vencimento',FMT_DATE(row.due_date)) +
        dRow('Pago em',   FMT_DATE(row.paid_at)) +
        dRow('Status',    '<span class="fin-badge-'+(row.status||'pending')+'">'+esc(FIN_STATUS_LABEL[row.status]||row.status)+'</span>') +
        (row.omie_codigo_lancamento ? dRow('Omie ID', esc(String(row.omie_codigo_lancamento))) : '') +
        (row.omie_nfse_numero       ? dRow('NFS-e',   esc(String(row.omie_nfse_numero)))       : '') +
        '</div>';
    }
    openMM('finDetalheModal');
  }

  function openEditLancamento(id) {
    const row = _finData.find(r => String(r.id) === String(id));
    if (!row) { showToast('Fatura não encontrada','error'); return; }
    _finCurrentId = id;
    const setVal = (elId, val) => { const el=document.getElementById(elId); if(el) el.value=val||''; };
    setVal('lanEmpresa',   row.user_id||'');
    setVal('lanPlano',     row.plan||'starter');
    setVal('lanValor',     row.amount||0);
    setVal('lanVencimento',row.due_date||'');
    setVal('lanStatus',    row.status||'pending');
    setVal('lanObs',       row.obs||'');
    openMM('lancamentoModal');
  }

  function openNovoLancamento() {
    _finCurrentId = null;
    const today = new Date().toISOString().split('T')[0];
    const setVal = (elId, val) => { const el=document.getElementById(elId); if(el) el.value=val||''; };
    setVal('lanEmpresa',''); setVal('lanPlano','starter'); setVal('lanValor','');
    setVal('lanVencimento', today); setVal('lanStatus','pending'); setVal('lanObs','');
    openMM('lancamentoModal');
  }

  async function salvarLancamento() {
    const empresa    = document.getElementById('lanEmpresa')?.value?.trim();
    const valor      = parseFloat(document.getElementById('lanValor')?.value||'0');
    const vencimento = document.getElementById('lanVencimento')?.value;
    if (!empresa || !vencimento || isNaN(valor) || valor <= 0) {
      showToast('Preencha empresa, valor e vencimento.','error'); return;
    }
    const payload = {
      id:         _finCurrentId,
      user_id:    empresa,
      plan:       document.getElementById('lanPlano')?.value||'starter',
      amount:     valor,
      due_date:   vencimento,
      status:     document.getElementById('lanStatus')?.value||'pending',
      obs:        document.getElementById('lanObs')?.value?.trim()||'',
    };
    try {
      const url = _finCurrentId
        ? '/master/api/financeiro/' + encodeURIComponent(_finCurrentId)
        : '/master/api/financeiro';
      const res  = await fetch(url, {
        method: _finCurrentId ? 'PUT' : 'POST',
        headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
      });
      const data = await res.json().catch(()=>({}));
      if (res.ok && data.ok) {
        closeMM('lancamentoModal');
        showToast(_finCurrentId ? 'Lançamento atualizado!' : 'Lançamento criado!','success');
        loadFinanceiro();
      } else { showToast('Erro: '+(data.error||'Tente novamente.'),'error'); }
    } catch { showToast('Erro de conexão.','error'); }
  }

  async function finMarkAs(status) {
    if (!_finCurrentId) return;
    try {
      const res  = await fetch('/master/api/financeiro/'+encodeURIComponent(_finCurrentId)+'/status', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status})
      });
      const data = await res.json().catch(()=>({}));
      if (res.ok && data.ok) {
        closeMM('finDetalheModal');
        showToast('Status atualizado para "'+FIN_STATUS_LABEL[status]+'"!','success');
        loadFinanceiro();
      } else { showToast('Erro ao atualizar status.','error'); }
    } catch { showToast('Erro de conexão.','error'); }
  }

  async function pushParaOmie(invoiceId) {
    if (!confirm('Enviar este lançamento para o Omie ERP?')) return;
    showToast('Enviando para Omie...','info');
    try {
      const res  = await fetch('/master/api/omie/push/'+encodeURIComponent(invoiceId), { method:'POST' });
      const data = await res.json().catch(()=>({}));
      if (data.ok) { showToast('Enviado ao Omie! Código: '+(data.omie_codigo||''),'success'); loadFinanceiro(); }
      else { showToast('Erro Omie: '+(data.error||''),'error'); }
    } catch { showToast('Erro de rede.','error'); }
  }

  async function gerarBoletoOmie(invoiceId, omieId) {
    if (!confirm('Gerar boleto no Omie para este lançamento?')) return;
    showToast('Gerando boleto...','info');
    try {
      const res  = await fetch('/master/api/omie/boleto/'+encodeURIComponent(invoiceId), {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({omie_codigo_lancamento: omieId})
      });
      const data = await res.json().catch(()=>({}));
      if (data.ok) {
        showToast('Boleto gerado!','success');
        if (data.boleto_url) window.open(data.boleto_url,'_blank');
        loadFinanceiro();
      } else { showToast('Erro boleto: '+(data.error||''),'error'); }
    } catch { showToast('Erro de rede.','error'); }
  }

  async function emitirNFSeOmie(invoiceId, omieId) {
    if (!confirm('Buscar/vincular NFS-e no Omie?')) return;
    showToast('Buscando NFS-e...','info');
    try {
      const res  = await fetch('/master/api/omie/nfse/'+encodeURIComponent(invoiceId), {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({omie_codigo_lancamento: omieId})
      });
      const data = await res.json().catch(()=>({}));
      if (data.ok) {
        showToast('NFS-e nº '+(data.nfse_numero||'—')+' vinculada!','success');
        if (data.nfse_pdf) window.open(data.nfse_pdf,'_blank');
        loadFinanceiro();
      } else { showToast('Erro NFS-e: '+(data.error||''),'error'); }
    } catch { showToast('Erro de rede.','error'); }
  }

  async function syncOmie() {
    showToast('Sincronizando com Omie...','info');
    try {
      const res  = await fetch('/master/api/omie/sync', { method:'POST' });
      const data = await res.json().catch(()=>({}));
      if (data.ok) { showToast('Sincronização concluída!','success'); loadFinanceiro(); }
      else { showToast('Erro sync: '+(data.error||''),'error'); }
    } catch { showToast('Erro de rede.','error'); }
  }

  function exportFinCSV() {
    const rows = [['Empresa','E-mail','Plano','Tipo','Valor','Vencimento','Pago em','Status']];
    _finFiltered.forEach(r => {
      rows.push([
        r.empresa_name||'', r.user_email||'', r.plan||'',
        FIN_TYPE_LABEL[r.type]||r.type||'',
        r.amount||0, r.due_date||'', r.paid_at||'',
        FIN_STATUS_LABEL[r.status]||r.status||''
      ]);
    });
    const csv  = rows.map(r => r.map(v => '"'+String(v||'').replace(/"/g,'""')+'"').join(',')).join('\\n');
    const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href=url; a.download='financeiro_'+new Date().toISOString().split('T')[0]+'.csv';
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Suporte ───────────────────────────────────────────────────────────────
  async function loadSupportTickets() {
    try {
      const empresa  = document.getElementById('supportFilterEmpresa')?.value||'';
      const status   = document.getElementById('supportFilterStatus')?.value||'';
      const priority = document.getElementById('supportFilterPriority')?.value||'';
      const limit    = document.getElementById('supportFilterLimit')?.value||'200';
      let url = '/api/support/tickets?limit='+encodeURIComponent(limit);
      if (empresa)  url += '&empresa_id='+encodeURIComponent(empresa);
      if (status)   url += '&status='+encodeURIComponent(status);
      if (priority) url += '&priority='+encodeURIComponent(priority);
      const res  = await fetch(url);
      const data = await res.json().catch(()=>({ok:false}));
      _masterTickets = data.tickets || [];
      renderKanban(_masterTickets);
      updateSupportKPIs(_masterTickets);
    } catch {
      const kb = document.getElementById('supportKanban');
      if (kb) kb.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;">Erro ao carregar chamados.</div>';
    }
  }

  function applySupportFilters() { loadSupportTickets(); }
  function clearSupportFilters() {
    ['supportFilterEmpresa','supportFilterStatus','supportFilterPriority'].forEach(id => {
      const el = document.getElementById(id); if(el) el.value='';
    });
    const lim = document.getElementById('supportFilterLimit'); if(lim) lim.value='200';
    const ov  = document.getElementById('supportFilterOverdue'); if(ov) ov.checked=false;
    loadSupportTickets();
  }

  function updateSupportKPIs(tickets) {
    const now      = new Date();
    const open     = tickets.filter(t => t.status !== 'Resolvida');
    const resolved = tickets.filter(t => t.status === 'Resolvida');
    const breached = tickets.filter(t => t.due_at && new Date(t.due_at) < now && t.status !== 'Resolvida');
    const critical = tickets.filter(t => t.priority === 'critical');
    const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    set('kpiOpen',     open.length);
    set('kpiResolved', resolved.length);
    set('kpiBreached', breached.length);
    set('kpiCritical', critical.length);
  }

  function renderKanban(tickets) {
    const kb = document.getElementById('supportKanban');
    if (!kb) return;
    if (!tickets.length) {
      kb.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;width:100%;"><i class="fas fa-check-circle" style="font-size:32px;display:block;margin-bottom:8px;opacity:0.3;"></i>Nenhum chamado encontrado</div>';
      return;
    }
    const now = new Date();
    kb.innerHTML = SUPPORT_STATUS_ORDER.map(col => {
      const colTickets = tickets.filter(t => t.status === col);
      const colColor   = col==='Resolvida'?'#16a34a':col==='Criada'?'#6c757d':'#2980B9';
      const cards = colTickets.map(t => {
        const pc       = PRIORITY_COLORS[t.priority]||'#6c757d';
        const pl       = PRIORITY_LABELS_PT[t.priority]||t.priority||'—';
        const isBreached = t.due_at && new Date(t.due_at) < now && t.status !== 'Resolvida';
        const safeId   = esc(String(t.id||''));
        return '<div style="background:white;border-radius:8px;padding:10px 12px;margin-bottom:8px;border:1px solid #e9ecef;border-left:3px solid '+pc+';'+(isBreached?'background:#fff5f5;':'')+'">' +
          '<div style="font-size:12px;font-weight:700;color:#1B4F72;margin-bottom:4px;">'+esc(t.title||'Sem título')+'</div>' +
          '<div style="font-size:10px;color:#9ca3af;margin-bottom:6px;">'+esc(t.empresa_name||t.empresa_id||'—')+'</div>' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
          '<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:'+pc+'20;color:'+pc+';">'+esc(pl)+'</span>' +
          (isBreached?'<span style="font-size:10px;font-weight:700;color:#dc2626;"><i class="fas fa-exclamation-triangle"></i> SLA</span>':'') +
          '</div>' +
          '<div style="display:flex;gap:4px;margin-top:8px;">' +
          '<button class="abtn" data-action="ticket-view" data-id="'+safeId+'" style="font-size:10px;"><i class="fas fa-eye"></i></button>' +
          '<button class="abtn" data-action="ticket-edit" data-id="'+safeId+'" style="font-size:10px;"><i class="fas fa-edit"></i></button>' +
          '<select data-action="ticket-status" data-ticket-id="'+safeId+'" style="font-size:10px;padding:2px 4px;border:1px solid #e9ecef;border-radius:4px;flex:1;">' +
          SUPPORT_STATUS_ORDER.map(s => '<option value="'+esc(s)+'" '+(s===t.status?'selected':'')+'>'+esc(s)+'</option>').join('') +
          '</select></div></div>';
      }).join('');
      return '<div style="min-width:200px;flex:1;background:#f8f9fa;border-radius:10px;padding:12px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
        '<div style="font-size:12px;font-weight:700;color:'+colColor+';">'+esc(col)+'</div>' +
        '<span style="background:'+colColor+'20;color:'+colColor+';font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;">'+colTickets.length+'</span>' +
        '</div>' +
        (cards || '<div style="text-align:center;padding:20px;color:#d1d5db;font-size:11px;">Vazio</div>') +
        '</div>';
    }).join('');
  }

  function viewTicket(id) {
    const t = _masterTickets.find(tk => String(tk.id) === String(id));
    if (!t) { showToast('Chamado não encontrado','error'); return; }
    _viewingTicketId = id;
    const pc = PRIORITY_COLORS[t.priority]||'#6c757d';
    const pl = PRIORITY_LABELS_PT[t.priority]||t.priority||'—';
    const titleEl = document.getElementById('tdModalTitle');
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-ticket-alt" style="margin-right:8px;color:#7c3aed;"></i>' + esc(t.title||'Chamado');
    const set = (id2, val) => { const el=document.getElementById(id2); if(el) el.innerHTML=val; };
    set('tdvTitle',       esc(t.title||'—'));
    set('tdvDescription', esc(t.description||'—'));
    set('tdvCliente',     esc(t.empresa_name||t.empresa_id||'—'));
    set('tdvSolicitante', esc(t.created_by_name||t.created_by||'—'));
    set('tdvAtendente',   esc(t.assigned_to||'Não atribuído'));
    set('tdvPriority',    '<span style="font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;background:'+pc+'20;color:'+pc+';">'+esc(pl)+'</span>');
    set('tdvStatus',      '<span style="font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;background:#e9ecef;color:#374151;">'+esc(t.status||'—')+'</span>');
    set('tdvDueAt',       t.due_at ? '<span style="'+(new Date(t.due_at)<new Date()&&t.status!=='Resolvida'?'color:#dc2626;font-weight:700;':'')+'">'+FMT_DATE(t.due_at)+'</span>' : '—');
    set('tdvCreatedAt',   FMT_DATE(t.created_at));
    set('tdvUpdatedAt',   FMT_DATE(t.updated_at));
    const viewSec = document.getElementById('tdViewSection');
    const editSec = document.getElementById('tdEditSection');
    if (viewSec) viewSec.style.display = '';
    if (editSec) editSec.style.display = 'none';
    openMM('ticketDetailModal');
  }

  function editTicket(id) {
    const t = _masterTickets.find(tk => String(tk.id) === String(id));
    if (!t) { showToast('Chamado não encontrado','error'); return; }
    _editingTicketId = id;
    const titleEl = document.getElementById('tdModalTitle');
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-edit" style="margin-right:8px;color:#7c3aed;"></i>Editar Chamado';
    const setVal = (elId, val) => { const el=document.getElementById(elId); if(el) el.value=val||''; };
    setVal('tdeTitle',       t.title||'');
    setVal('tdeDescription', t.description||'');
    setVal('tdePriority',    t.priority||'medium');
    setVal('tdeStatus',      t.status||'Criada');
    setVal('tdeAtendente',   t.assigned_to||'');
    const viewSec = document.getElementById('tdViewSection');
    const editSec = document.getElementById('tdEditSection');
    if (viewSec) viewSec.style.display = 'none';
    if (editSec) editSec.style.display = '';
    openMM('ticketDetailModal');
  }

  function switchToEditMode() {
    if (_viewingTicketId) editTicket(_viewingTicketId);
  }

  function switchToViewMode() {
    if (_editingTicketId) viewTicket(_editingTicketId);
    else closeMM('ticketDetailModal');
  }

  async function saveTicketEdit() {
    const id    = _editingTicketId;
    const title = document.getElementById('tdeTitle')?.value?.trim();
    if (!title) { showToast('Título obrigatório.','error'); return; }
    const payload = {
      title,
      description: document.getElementById('tdeDescription')?.value?.trim()||'',
      priority:    document.getElementById('tdePriority')?.value||'medium',
      status:      document.getElementById('tdeStatus')?.value||'Criada',
      assigned_to: document.getElementById('tdeAtendente')?.value?.trim()||'',
    };
    try {
      const res  = await fetch('/api/support/tickets/'+encodeURIComponent(id), {
        method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
      });
      const data = await res.json().catch(()=>({}));
      if (res.ok && data.ok) {
        showToast('Chamado atualizado!','success');
        closeMM('ticketDetailModal');
        loadSupportTickets();
      } else { showToast('Erro ao salvar: '+(data.error||''),'error'); }
    } catch { showToast('Erro de conexão.','error'); }
  }

  async function updateTicketStatus(ticketId, newStatus) {
    try {
      const res  = await fetch('/api/support/tickets/'+encodeURIComponent(ticketId)+'/status', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:newStatus})
      });
      const data = await res.json().catch(()=>({}));
      if (res.ok && data.ok) { showToast('Status atualizado!','success'); loadSupportTickets(); }
      else { showToast('Erro ao atualizar status.','error'); }
    } catch { showToast('Erro de conexão.','error'); }
  }

  function openNovoTicketMasterModal() {
    const sel = document.getElementById('mtEmpresa');
    if (sel) sel.value = '';
    const setVal = (id,v) => { const el=document.getElementById(id); if(el) el.value=v||''; };
    setVal('mtTitle',''); setVal('mtDescription',''); setVal('mtPriority','medium');
    openMM('novoTicketMasterModal');
  }

  function openNovoTicketMasterForClient(clientId) {
    openNovoTicketMasterModal();
    const sel = document.getElementById('mtEmpresa');
    if (sel && clientId) sel.value = clientId;
  }

  async function salvarTicketMaster() {
    const empresa = document.getElementById('mtEmpresa')?.value?.trim();
    const title   = document.getElementById('mtTitle')?.value?.trim();
    const desc    = document.getElementById('mtDescription')?.value?.trim();
    const prio    = document.getElementById('mtPriority')?.value||'medium';
    if (!title || !desc) { showToast('Preencha título e descrição.','error'); return; }
    const btn = document.getElementById('btnSalvarTicketMaster');
    if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Criando...'; }
    try {
      const res  = await fetch('/api/support/tickets', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ empresa_id:empresa||null, title, description:desc, priority:prio, source:'master' })
      });
      const data = await res.json().catch(()=>({}));
      if (res.ok && data.ok) {
        closeMM('novoTicketMasterModal');
        showToast('Chamado criado!','success');
        loadSupportTickets();
      } else { showToast('Erro: '+(data.error||''),'error'); }
    } catch { showToast('Erro de conexão.','error'); }
    finally { if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-paper-plane"></i> Criar';} }
  }

  async function loadClientSupportTickets(clientId) {
    const container = document.getElementById('detSupportTickets');
    if (!container) return;
    try {
      const res  = await fetch('/api/support/tickets?empresa_id='+encodeURIComponent(clientId)+'&limit=20');
      const data = await res.json().catch(()=>({ok:false}));
      const tickets = data.tickets || [];
      if (!tickets.length) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af;font-size:12px;"><i class="fas fa-check-circle" style="display:block;font-size:24px;margin-bottom:6px;opacity:0.3;"></i>Nenhum chamado</div>';
        return;
      }
      container.innerHTML = tickets.map(t => {
        const pc = PRIORITY_COLORS[t.priority]||'#6c757d';
        const safeId = esc(String(t.id||''));
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f3f5;">' +
          '<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:'+pc+'20;color:'+pc+';">'+esc(PRIORITY_LABELS_PT[t.priority]||t.priority)+'</span>' +
          '<div style="flex:1;font-size:12px;font-weight:600;color:#374151;">'+esc(t.title||'—')+'</div>' +
          '<span style="font-size:10px;color:#9ca3af;">'+esc(t.status||'—')+'</span>' +
          '<button class="abtn" data-action="ticket-view" data-id="'+safeId+'" style="font-size:10px;"><i class="fas fa-eye"></i></button>' +
          '</div>';
      }).join('');
    } catch {
      container.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af;font-size:12px;">Erro ao carregar.</div>';
    }
  }

  // ── Configurações ─────────────────────────────────────────────────────────
  function loadPlatformSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('master_platform_settings')||'{}');
      Object.entries(saved).forEach(([k,v]) => {
        const el = document.getElementById(k);
        if (!el) return;
        if (el.type==='checkbox') el.checked = !!v;
        else el.value = v;
      });
      const omieEnabled = saved['cfg_omie_enabled'];
      const syncBtn = document.getElementById('btnSyncOmie');
      if (syncBtn) syncBtn.style.display = omieEnabled ? '' : 'none';
    } catch {}
  }

  function saveCfgSection(section) {
    const ids = {
      geral:        ['cfg_platform_name','cfg_support_email','cfg_support_phone','cfg_default_language','cfg_default_timezone','cfg_date_format','cfg_privacy_policy_url','cfg_terms_url','cfg_maintenance_mode','cfg_maintenance_message'],
      branding:     ['brand_platform_name','brand_logo','brand_favicon','brand_primary_color','brand_secondary_color','brand_sidebar_color'],
      notificacoes: ['cfg_notify_trial_expiry_days','cfg_notify_email_sender','cfg_notify_email_footer','cfg_alert_slack_enabled','cfg_alert_slack_webhook'],
      backup:       ['cfg_backup_enabled','cfg_backup_frequency','cfg_backup_retention_days','cfg_backup_storage_bucket'],
      seguranca:    ['cfg_password_min_length','cfg_password_expiry_days','cfg_password_require_uppercase','cfg_password_require_number','cfg_password_require_symbol','cfg_session_timeout_hours','cfg_max_login_attempts','cfg_lockout_duration_minutes','cfg_mfa_enabled','cfg_ip_whitelist'],
      api:          ['cfg_api_enabled','cfg_api_rate_limit','cfg_api_jwt_expiry','cfg_api_allowed_origins','cfg_api_log_requests'],
      omie:         ['cfg_omie_enabled','cfg_omie_app_key','cfg_omie_app_secret','cfg_omie_conta_corrente','cfg_omie_codigo_categoria','cfg_omie_codigo_servico','cfg_omie_sync_auto'],
    };
    const saved = JSON.parse(localStorage.getItem('master_platform_settings')||'{}');
    (ids[section]||[]).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      saved[id] = el.type==='checkbox' ? el.checked : el.value;
    });
    localStorage.setItem('master_platform_settings', JSON.stringify(saved));
    if (section==='branding') applyBranding(saved);
    if (section==='omie') {
      const syncBtn = document.getElementById('btnSyncOmie');
      if (syncBtn) syncBtn.style.display = saved['cfg_omie_enabled'] ? '' : 'none';
    }
    showToast('Configurações salvas!','success');
  }

  function applyBranding(saved) {
    const root = document.documentElement;
    if (saved['brand_primary_color'])   root.style.setProperty('--brand-primary',   saved['brand_primary_color']);
    if (saved['brand_secondary_color']) root.style.setProperty('--brand-secondary', saved['brand_secondary_color']);
    if (saved['brand_sidebar_color'])   root.style.setProperty('--brand-sidebar',   saved['brand_sidebar_color']);
  }

  function resetBranding() {
    const defaults = { brand_primary_color:'#7c3aed', brand_secondary_color:'#2980B9', brand_sidebar_color:'#1B4F72', brand_platform_name:'PCPSyncrus' };
    Object.entries(defaults).forEach(([k,v]) => { const el=document.getElementById(k); if(el) el.value=v; });
    applyBranding(defaults);
    showToast('Branding restaurado para os padrões!','success');
  }

  function updateBrandingPreview() {
    const name    = document.getElementById('brand_platform_name')?.value||'PCPSyncrus';
    const primary = document.getElementById('brand_primary_color')?.value||'#7c3aed';
    const sidebar = document.getElementById('brand_sidebar_color')?.value||'#1B4F72';
    const secondary = document.getElementById('brand_secondary_color')?.value||'#2980B9';
    const previewSidebar = document.getElementById('previewSidebar');
    const previewName    = document.getElementById('previewName');
    const previewLogo    = document.getElementById('previewLogo');
    const previewBtn1    = document.getElementById('previewBtn1');
    const previewBtn2    = document.getElementById('previewBtn2');
    const previewBadge   = document.getElementById('previewBadge');
    if (previewSidebar) previewSidebar.style.background = sidebar;
    if (previewName)    previewName.textContent = name;
    if (previewLogo)    previewLogo.style.background = primary;
    if (previewBtn1)    previewBtn1.style.background = primary;
    if (previewBtn2)    previewBtn2.style.background = secondary;
    if (previewBadge) {
      previewBadge.style.background = primary + '20';
      previewBadge.style.color      = primary;
    }
  }

  function syncColorFromHex(type) {
    const hexMap = {
      primary:   { hex:'brand_primary_color_hex',   picker:'brand_primary_color'   },
      secondary: { hex:'brand_secondary_color_hex', picker:'brand_secondary_color' },
      accent:    { hex:'brand_accent_color_hex',    picker:'brand_accent_color'    },
      sidebar:   { hex:'brand_sidebar_color_hex',   picker:'brand_sidebar_color'   },
    };
    const ids = hexMap[type];
    if (!ids) return;
    const hexEl    = document.getElementById(ids.hex);
    const pickerEl = document.getElementById(ids.picker);
    if (!hexEl || !pickerEl) return;
    const val = hexEl.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      pickerEl.value = val;
      updateBrandingPreview();
    }
  }

  function handleLogoUpload(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const logoInput = document.getElementById('brand_logo');
      if (logoInput) logoInput.value = e.target.result;
      updateBrandingPreview();
    };
    reader.readAsDataURL(file);
  }

  async function testSlackWebhook() {
    const url = document.getElementById('cfg_alert_slack_webhook')?.value?.trim();
    if (!url) { showToast('Informe a URL do webhook Slack.','error'); return; }
    showToast('Enviando mensagem de teste...','info');
    try {
      const res = await fetch('/master/api/test-slack', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ webhook_url: url })
      });
      const data = await res.json().catch(()=>({}));
      if (data.ok) showToast('Mensagem enviada ao Slack!','success');
      else showToast('Erro Slack: '+(data.error||''),'error');
    } catch { showToast('Erro de conexão.','error'); }
  }

  async function runManualBackup() {
    showToast('Iniciando backup...','info');
    try {
      const res  = await fetch('/master/api/backup');
      const data = await res.json().catch(()=>({}));
      if (data.ok) {
        const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href=url; a.download='backup_'+new Date().toISOString().split('T')[0]+'.json';
        a.click(); URL.revokeObjectURL(url);
        const el = document.getElementById('backupLastRun');
        if (el) el.textContent = 'Último backup: ' + new Date().toLocaleString('pt-BR');
        showToast('Backup concluído e baixado!','success');
      } else { showToast('Erro no backup.','error'); }
    } catch { showToast('Erro de conexão.','error'); }
  }

  async function testarConexaoOmie() {
    const key    = document.getElementById('cfg_omie_app_key')?.value?.trim();
    const secret = document.getElementById('cfg_omie_app_secret')?.value?.trim();
    const result = document.getElementById('omieTestResult');
    if (!key || !secret) { showToast('Informe App Key e App Secret.','error'); return; }
    if (result) { result.style.display=''; result.innerHTML='<i class="fas fa-spinner fa-spin"></i> Testando...'; result.style.color='#6c757d'; }
    try {
      const res  = await fetch('/master/api/omie/test', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ app_key:key, app_secret:secret })
      });
      const data = await res.json().catch(()=>({}));
      if (result) {
        if (data.ok) {
          result.innerHTML = '<i class="fas fa-check-circle" style="color:#16a34a;margin-right:5px;"></i>Conexão OK! Empresa: ' + esc(data.empresa||'—');
          result.style.color = '#16a34a';
          const syncInfo = document.getElementById('omieLastSyncInfo');
          if (syncInfo) syncInfo.style.display = '';
          const syncText = document.getElementById('omieLastSyncText');
          if (syncText) syncText.textContent = 'Conexão testada em: ' + new Date().toLocaleString('pt-BR');
        } else {
          result.innerHTML = '<i class="fas fa-times-circle" style="color:#dc2626;margin-right:5px;"></i>Erro: ' + esc(data.error||'Credenciais inválidas');
          result.style.color = '#dc2626';
        }
      }
    } catch {
      if (result) { result.innerHTML='<i class="fas fa-times-circle" style="color:#dc2626;margin-right:5px;"></i>Erro de conexão'; result.style.color='#dc2626'; }
    }
  }

  function generateApiKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'sk_live_';
    for (let i=0; i<32; i++) key += chars.charAt(Math.floor(Math.random()*chars.length));
    const list = document.getElementById('apiKeysList');
    if (!list) return;
    const item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;background:white;border-radius:6px;border:1px solid #e9ecef;margin-bottom:6px;';
    item.innerHTML =
      '<code style="flex:1;font-size:11px;color:#374151;font-family:monospace;word-break:break-all;">'+esc(key)+'</code>' +
      '<button onclick="navigator.clipboard.writeText(\\''+esc(key)+'\\').then(()=>showToast(\\'Chave copiada!\\',\\'success\\'))" style="background:#f1f3f5;border:1px solid #dee2e6;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;"><i class="fas fa-copy"></i></button>' +
      '<button onclick="this.closest(\\'div\\').remove()" style="background:#fef2f2;border:1px solid #fecaca;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;color:#dc2626;"><i class="fas fa-trash"></i></button>';
    const empty = list.querySelector('div[style*="text-align:center"]');
    if (empty) empty.remove();
    list.appendChild(item);
    showToast('Chave de API gerada!','success');
  }

  // ── Inicialização ─────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    loadPlatformSettings();
    updateBrandingPreview();
  });
  </script>`

    return c.html(masterLayout('Master Admin — Painel de Controle', content, auth.name))
  } catch (err: any) {
    console.error('Erro fatal na rota principal:', err)
    return c.text('Erro interno do servidor. Verifique os logs.', 500)
  }
})

export default app
