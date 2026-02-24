/**
 * auth.ts — Rotas de autenticação estendida
 *  - GET/POST /forgot-password  → solicitar reset de senha
 *  - GET/POST /reset-password   → definir nova senha com token
 *  - GET      /invite/:token    → aceitar convite
 *  - POST     /invite/:token    → criar conta via convite
 */

import { Hono } from 'hono'
import { sha256, hashPassword, loginUser, registeredUsers, getDB } from '../userStore'
import {
  resolveEmailConfig, sendEmail,
  templatePasswordReset, templateWelcome
} from '../emailService'

const app = new Hono<{ Bindings: { DB: D1Database } }>()

// ── Utilidades ─────────────────────────────────────────────────────────────────
function makeSecureToken(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

function forgotPageHtml(msg = '', type: 'error'|'success'|'' = '') {
  const isOk = type === 'success'
  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Esqueci minha Senha — PCP Syncrus</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#0d1b2a,#1B4F72);min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:20px;}
  .card{background:white;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:100%;max-width:420px;padding:40px;}
  .form-control{width:100%;padding:12px 14px 12px 42px;border:1.5px solid #e9ecef;border-radius:10px;font-size:14px;outline:none;transition:border 0.2s;}
  .form-control:focus{border-color:#2980B9;box-shadow:0 0 0 3px rgba(41,128,185,0.1);}
  .btn{width:100%;padding:13px;background:linear-gradient(135deg,#1B4F72,#2980B9);color:white;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;transition:opacity 0.2s;}
  .btn:hover{opacity:0.9;} .btn:disabled{opacity:0.6;cursor:not-allowed;}
  .alert{padding:12px 16px;border-radius:10px;font-size:13px;margin-bottom:20px;display:flex;align-items:center;gap:10px;}
  .alert-success{background:#f0fdf4;border:1px solid #86efac;color:#16a34a;}
  .alert-error{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;}
</style>
</head><body>
<div class="card">
  <div style="text-align:center;margin-bottom:28px;">
    <div style="width:56px;height:56px;background:linear-gradient(135deg,#1B4F72,#2980B9);border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;box-shadow:0 8px 24px rgba(41,128,185,0.3);">
      <i class="fas fa-key" style="color:white;font-size:22px;"></i>
    </div>
    <h1 style="font-size:20px;font-weight:900;color:#1B4F72;margin:0 0 4px;">Esqueci minha Senha</h1>
    <p style="font-size:13px;color:#6c757d;margin:0;">Informe seu e-mail e enviaremos um link de redefinição.</p>
  </div>
  ${msg ? `<div class="alert alert-${type}"><i class="fas fa-${isOk ? 'check-circle' : 'exclamation-circle'}"></i><span>${msg}</span></div>` : ''}
  ${isOk ? '' : `
  <form method="POST" action="/forgot-password">
    <div style="position:relative;margin-bottom:20px;">
      <i class="fas fa-envelope" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#9ca3af;font-size:13px;"></i>
      <input class="form-control" type="email" name="email" placeholder="seu@email.com" required autofocus>
    </div>
    <button type="submit" class="btn" id="submitBtn">
      <i class="fas fa-paper-plane" style="margin-right:8px;"></i>Enviar Link de Redefinição
    </button>
  </form>`}
  <div style="text-align:center;margin-top:20px;">
    <a href="/login" style="font-size:13px;color:#6c757d;text-decoration:none;">
      <i class="fas fa-arrow-left" style="margin-right:4px;"></i>Voltar ao Login
    </a>
  </div>
</div>
<script>
document.querySelector('form')?.addEventListener('submit', function(e) {
  const btn = document.getElementById('submitBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Enviando...'; }
});
</script>
</body></html>`
}

function resetPageHtml(token: string, msg = '', type: 'error'|'success'|'' = '') {
  const isOk = type === 'success'
  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Redefinir Senha — PCP Syncrus</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#0d1b2a,#1B4F72);min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:20px;}
  .card{background:white;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:100%;max-width:420px;padding:40px;}
  .form-control{width:100%;padding:12px 14px 12px 42px;border:1.5px solid #e9ecef;border-radius:10px;font-size:14px;outline:none;transition:border 0.2s;}
  .form-control:focus{border-color:#2980B9;box-shadow:0 0 0 3px rgba(41,128,185,0.1);}
  .btn{width:100%;padding:13px;background:linear-gradient(135deg,#1B4F72,#2980B9);color:white;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;transition:opacity 0.2s;}
  .btn:hover{opacity:0.9;} .btn:disabled{opacity:0.6;cursor:not-allowed;}
  .alert{padding:12px 16px;border-radius:10px;font-size:13px;margin-bottom:20px;display:flex;align-items:center;gap:10px;}
  .alert-success{background:#f0fdf4;border:1px solid #86efac;color:#16a34a;}
  .alert-error{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;}
  .input-wrap{position:relative;margin-bottom:16px;}
  .input-wrap i.icon{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#9ca3af;font-size:13px;}
  .toggle-pwd{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#9ca3af;padding:4px;}
  .strength{height:4px;border-radius:2px;margin-top:6px;transition:all 0.3s;}
</style>
</head><body>
<div class="card">
  <div style="text-align:center;margin-bottom:28px;">
    <div style="width:56px;height:56px;background:linear-gradient(135deg,#dc2626,#b91c1c);border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;box-shadow:0 8px 24px rgba(220,38,38,0.3);">
      <i class="fas fa-lock-open" style="color:white;font-size:22px;"></i>
    </div>
    <h1 style="font-size:20px;font-weight:900;color:#1B4F72;margin:0 0 4px;">Redefinir Senha</h1>
    <p style="font-size:13px;color:#6c757d;margin:0;">Crie uma nova senha segura para sua conta.</p>
  </div>
  ${msg ? `<div class="alert alert-${type}"><i class="fas fa-${isOk ? 'check-circle' : 'exclamation-circle'}"></i><span>${msg}</span></div>` : ''}
  ${isOk ? `<div style="text-align:center;margin-top:10px;"><a href="/login" class="btn" style="display:inline-block;text-decoration:none;padding:13px 24px;width:auto;"><i class="fas fa-sign-in-alt" style="margin-right:8px;"></i>Ir para o Login</a></div>` : `
  <form method="POST" action="/reset-password">
    <input type="hidden" name="token" value="${token}">
    <div class="input-wrap">
      <i class="fas fa-lock icon"></i>
      <input class="form-control" type="password" id="pwd" name="pwd" placeholder="Nova senha (mín. 8 caracteres)" required minlength="8" oninput="checkStrength(this.value)">
      <button type="button" class="toggle-pwd" onclick="togglePwd('pwd','eye1')"><i class="fas fa-eye" id="eye1"></i></button>
    </div>
    <div class="strength" id="strengthBar" style="background:#e9ecef;"></div>
    <div style="font-size:11px;color:#6c757d;margin-bottom:16px;" id="strengthLabel">Força da senha</div>
    <div class="input-wrap">
      <i class="fas fa-lock icon"></i>
      <input class="form-control" type="password" id="pwd2" name="pwd2" placeholder="Confirmar nova senha" required>
      <button type="button" class="toggle-pwd" onclick="togglePwd('pwd2','eye2')"><i class="fas fa-eye" id="eye2"></i></button>
    </div>
    <button type="submit" class="btn" id="submitBtn" style="margin-top:8px;">
      <i class="fas fa-save" style="margin-right:8px;"></i>Salvar Nova Senha
    </button>
  </form>`}
  <div style="text-align:center;margin-top:20px;">
    <a href="/login" style="font-size:13px;color:#6c757d;text-decoration:none;">
      <i class="fas fa-arrow-left" style="margin-right:4px;"></i>Voltar ao Login
    </a>
  </div>
</div>
<script>
function togglePwd(id, ico) {
  const inp = document.getElementById(id), icon = document.getElementById(ico);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  icon.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}
function checkStrength(v) {
  const bar = document.getElementById('strengthBar'), lbl = document.getElementById('strengthLabel');
  if (!bar || !lbl) return;
  let score = 0;
  if (v.length >= 8) score++;
  if (/[A-Z]/.test(v)) score++;
  if (/[0-9]/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  const colors = ['#e9ecef','#dc2626','#f59e0b','#16a34a','#1B4F72'];
  const labels = ['','Fraca','Regular','Boa','Forte'];
  bar.style.background = colors[score]; bar.style.width = (score*25)+'%';
  lbl.textContent = labels[score] || 'Força da senha';
}
document.querySelector('form')?.addEventListener('submit', function(e) {
  const p1 = document.getElementById('pwd')?.value;
  const p2 = document.getElementById('pwd2')?.value;
  if (p1 !== p2) { e.preventDefault(); alert('As senhas não coincidem.'); return; }
  const btn = document.getElementById('submitBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Salvando...'; }
});
</script>
</body></html>`
}

function invitePageHtml(invite: any, msg = '', type: 'error'|'success'|'' = '') {
  const isOk = type === 'success'
  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Aceitar Convite — PCP Syncrus</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#0d1b2a,#1B4F72);min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:20px;}
  .card{background:white;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:100%;max-width:480px;padding:40px;}
  .form-control{width:100%;padding:11px 14px 11px 42px;border:1.5px solid #e9ecef;border-radius:10px;font-size:14px;outline:none;transition:border 0.2s;}
  .form-control:focus{border-color:#2980B9;box-shadow:0 0 0 3px rgba(41,128,185,0.1);}
  .form-label{display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:5px;}
  .btn{width:100%;padding:13px;background:linear-gradient(135deg,#1B4F72,#2980B9);color:white;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;transition:opacity 0.2s;}
  .btn:hover{opacity:0.9;} .btn:disabled{opacity:0.6;cursor:not-allowed;}
  .alert{padding:12px 16px;border-radius:10px;font-size:13px;margin-bottom:20px;display:flex;align-items:center;gap:10px;}
  .alert-success{background:#f0fdf4;border:1px solid #86efac;color:#16a34a;}
  .alert-error{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;}
  .input-wrap{position:relative;}
  .input-wrap i{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#9ca3af;font-size:13px;}
  .toggle-pwd{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#9ca3af;}
</style>
</head><body>
<div class="card">
  <div style="text-align:center;margin-bottom:24px;">
    <div style="width:56px;height:56px;background:linear-gradient(135deg,#1B4F72,#2980B9);border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;box-shadow:0 8px 24px rgba(41,128,185,0.3);">
      <i class="fas fa-user-plus" style="color:white;font-size:22px;"></i>
    </div>
    <h1 style="font-size:20px;font-weight:900;color:#1B4F72;margin:0 0 6px;">Aceitar Convite</h1>
    ${invite ? `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:12px 16px;margin-top:12px;">
      <div style="font-size:11px;color:#0369a1;font-weight:700;text-transform:uppercase;">Convite para</div>
      <div style="font-size:16px;font-weight:800;color:#1B4F72;">${invite.empresa || 'PCP Syncrus'}</div>
      <div style="font-size:12px;color:#6c757d;">${invite.email}</div>
    </div>` : ''}
  </div>
  ${msg ? `<div class="alert alert-${type}"><i class="fas fa-${isOk ? 'check-circle' : 'exclamation-circle'}"></i><span>${msg}</span></div>` : ''}
  ${isOk ? `<div style="text-align:center;"><a href="/login" class="btn" style="display:inline-block;text-decoration:none;padding:13px 24px;width:auto;"><i class="fas fa-sign-in-alt" style="margin-right:8px;"></i>Ir para o Login</a></div>` : (invite ? `
  <form method="POST" action="/invite/${invite.token}">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div><label class="form-label">Nome *</label>
        <div class="input-wrap"><i class="fas fa-user"></i><input class="form-control" type="text" name="nome" value="${invite.nome || ''}" placeholder="Seu nome" required></div>
      </div>
      <div><label class="form-label">Sobrenome</label>
        <div class="input-wrap"><i class="fas fa-user"></i><input class="form-control" type="text" name="sobrenome" placeholder="Sobrenome" style="padding-left:14px;"></div>
      </div>
    </div>
    <div style="margin-bottom:16px;"><label class="form-label">E-mail</label>
      <div class="input-wrap"><i class="fas fa-envelope"></i><input class="form-control" type="email" value="${invite.email}" disabled style="background:#f8f9fa;color:#6c757d;"></div>
    </div>
    <div style="margin-bottom:16px;"><label class="form-label">Senha *</label>
      <div class="input-wrap">
        <i class="fas fa-lock"></i>
        <input class="form-control" type="password" id="invPwd" name="pwd" placeholder="Mínimo 8 caracteres" required minlength="8">
        <button type="button" class="toggle-pwd" onclick="togglePwd('invPwd','invEye')"><i class="fas fa-eye" id="invEye"></i></button>
      </div>
    </div>
    <div style="margin-bottom:20px;"><label class="form-label">Confirmar Senha *</label>
      <div class="input-wrap">
        <i class="fas fa-lock"></i>
        <input class="form-control" type="password" id="invPwd2" name="pwd2" placeholder="Confirmar senha" required>
        <button type="button" class="toggle-pwd" onclick="togglePwd('invPwd2','invEye2')"><i class="fas fa-eye" id="invEye2"></i></button>
      </div>
    </div>
    <button type="submit" class="btn" id="submitBtn">
      <i class="fas fa-check" style="margin-right:8px;"></i>Criar Minha Conta
    </button>
  </form>` : '')}
  <div style="text-align:center;margin-top:20px;">
    <a href="/login" style="font-size:13px;color:#6c757d;text-decoration:none;">
      <i class="fas fa-arrow-left" style="margin-right:4px;"></i>Já tem conta? Fazer Login
    </a>
  </div>
</div>
<script>
function togglePwd(id, ico) {
  const inp = document.getElementById(id), icon = document.getElementById(ico);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  icon.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}
document.querySelector('form')?.addEventListener('submit', function(e) {
  const p1 = document.getElementById('invPwd')?.value;
  const p2 = document.getElementById('invPwd2')?.value;
  if (p1 !== p2) { e.preventDefault(); alert('As senhas não coincidem.'); return; }
  const btn = document.getElementById('submitBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Criando conta...'; }
});
</script>
</body></html>`
}

// ── GET /forgot-password ───────────────────────────────────────────────────────
app.get('/forgot-password', (c) => c.html(forgotPageHtml()))

// ── POST /forgot-password ──────────────────────────────────────────────────────
app.post('/forgot-password', async (c) => {
  const body  = await c.req.parseBody()
  const email = ((body['email'] as string) || '').trim().toLowerCase()
  const db    = c.env?.DB || null
  const origin = new URL(c.req.url).origin

  // Sempre mostrar mensagem de sucesso para não vazar info de existência de conta
  const successMsg = 'Se esse e-mail estiver cadastrado, você receberá um link de redefinição em breve.'

  if (!email) return c.html(forgotPageHtml('Informe um e-mail válido.', 'error'))

  // Verificar se o usuário existe (D1 ou memória)
  let userEmail = email
  let userName  = ''

  if (db) {
    try {
      const row = await db.prepare('SELECT id, nome FROM registered_users WHERE email = ? AND is_demo = 0')
        .bind(email).first() as any
      if (!row) return c.html(forgotPageHtml(successMsg, 'success'))
      userName = row.nome || 'usuário'
    } catch {
      return c.html(forgotPageHtml(successMsg, 'success'))
    }
  } else {
    const usr = registeredUsers[email]
    if (!usr || usr.isDemo) return c.html(forgotPageHtml(successMsg, 'success'))
    userName = usr.nome
  }

  // Gerar token
  const token     = makeSecureToken()
  const expiresAt = new Date(Date.now() + 3600000).toISOString() // 1 hora

  if (db) {
    try {
      // Invalidar tokens anteriores
      await db.prepare('UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0')
        .bind(email).run()
      // Inserir novo token
      await db.prepare(
        'INSERT INTO password_resets (id, email, token, expires_at) VALUES (?, ?, ?, ?)'
      ).bind('pr_' + Date.now(), email, token, expiresAt).run()
    } catch {
      return c.html(forgotPageHtml('Erro interno. Tente novamente.', 'error'))
    }
  }

  // Enviar e-mail
  const cfg = await resolveEmailConfig(c.env, db)
  if (cfg) {
    const resetUrl = `${origin}/reset-password?token=${token}`
    await sendEmail(cfg, {
      to:      email,
      subject: 'Redefinição de Senha — PCP Syncrus',
      html:    templatePasswordReset({ nome: userName, resetUrl, expiresIn: '1 hora' }),
      type:    'password_reset',
    }, db)
  }

  return c.html(forgotPageHtml(successMsg, 'success'))
})

// ── GET /reset-password ────────────────────────────────────────────────────────
app.get('/reset-password', async (c) => {
  const token = c.req.query('token') || ''
  const db    = c.env?.DB || null

  if (!token) return c.redirect('/forgot-password')

  // Verificar token no D1
  if (db) {
    try {
      const row = await db.prepare(
        'SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime("now")'
      ).bind(token).first() as any
      if (!row) return c.html(resetPageHtml('', 'Link inválido ou expirado. Solicite um novo reset.', 'error'))
    } catch {
      return c.html(resetPageHtml(token, 'Erro ao verificar token.', 'error'))
    }
  }

  return c.html(resetPageHtml(token))
})

// ── POST /reset-password ───────────────────────────────────────────────────────
app.post('/reset-password', async (c) => {
  const body  = await c.req.parseBody()
  const token = (body['token'] as string || '').trim()
  const pwd   = (body['pwd']   as string || '').trim()
  const pwd2  = (body['pwd2']  as string || '').trim()
  const db    = c.env?.DB || null

  if (!token || !pwd) return c.html(resetPageHtml(token, 'Dados inválidos.', 'error'))
  if (pwd !== pwd2)   return c.html(resetPageHtml(token, 'As senhas não coincidem.', 'error'))
  if (pwd.length < 8) return c.html(resetPageHtml(token, 'A senha deve ter no mínimo 8 caracteres.', 'error'))

  if (!db) return c.html(resetPageHtml(token, 'Serviço indisponível. Tente novamente.', 'error'))

  try {
    // Buscar token válido
    const row = await db.prepare(
      'SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime("now")'
    ).bind(token).first() as any

    if (!row) return c.html(resetPageHtml('', 'Link inválido ou expirado. <a href="/forgot-password">Solicite um novo reset</a>.', 'error'))

    const email   = row.email as string
    const newHash = await hashPassword(pwd)

    // Atualizar senha no D1
    await db.prepare('UPDATE registered_users SET pwd_hash = ? WHERE email = ?')
      .bind(newHash, email).run()

    // Atualizar no cache em memória se existir
    if (registeredUsers[email]) {
      registeredUsers[email].pwdHash = newHash
    }

    // Marcar token como usado
    await db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?').bind(token).run()

    // Invalidar sessões antigas do usuário
    await db.prepare('DELETE FROM sessions WHERE email = ?').bind(email).run()

    return c.html(resetPageHtml('', 'Senha redefinida com sucesso! Agora você pode fazer login com a nova senha.', 'success'))
  } catch (e: any) {
    return c.html(resetPageHtml(token, 'Erro ao redefinir senha: ' + (e?.message || 'tente novamente.'), 'error'))
  }
})

// ── GET /invite/:token ─────────────────────────────────────────────────────────
app.get('/invite/:token', async (c) => {
  const token = c.req.param('token')
  const db    = c.env?.DB || null

  if (!db) return c.html(invitePageHtml(null, 'Serviço indisponível.', 'error'))

  try {
    const row = await db.prepare(
      `SELECT i.*, ru.empresa FROM invites i
       LEFT JOIN registered_users ru ON ru.id = i.user_id
       WHERE i.token = ? AND i.status = 'pending' AND i.expires_at > datetime('now')`
    ).bind(token).first() as any

    if (!row) return c.html(invitePageHtml(null, 'Convite inválido, expirado ou já utilizado.', 'error'))

    return c.html(invitePageHtml({ ...row, token }))
  } catch {
    return c.html(invitePageHtml(null, 'Erro ao carregar convite.', 'error'))
  }
})

// ── POST /invite/:token ────────────────────────────────────────────────────────
app.post('/invite/:token', async (c) => {
  const token = c.req.param('token')
  const body  = await c.req.parseBody()
  const nome      = (body['nome']     as string || '').trim()
  const sobrenome = (body['sobrenome']as string || '').trim()
  const pwd       = (body['pwd']      as string || '').trim()
  const pwd2      = (body['pwd2']     as string || '').trim()
  const db        = c.env?.DB || null

  if (!nome || !pwd) return c.html(invitePageHtml({ token }, 'Preencha nome e senha.', 'error'))
  if (pwd !== pwd2)  return c.html(invitePageHtml({ token }, 'As senhas não coincidem.', 'error'))
  if (pwd.length < 8)return c.html(invitePageHtml({ token }, 'Senha mínima de 8 caracteres.', 'error'))
  if (!db)           return c.html(invitePageHtml({ token }, 'Serviço indisponível.', 'error'))

  try {
    // Buscar convite válido
    const invite = await db.prepare(
      `SELECT i.*, ru.empresa, ru.plano FROM invites i
       LEFT JOIN registered_users ru ON ru.id = i.user_id
       WHERE i.token = ? AND i.status = 'pending' AND i.expires_at > datetime('now')`
    ).bind(token).first() as any

    if (!invite) return c.html(invitePageHtml(null, 'Convite inválido ou expirado.', 'error'))

    // Verificar se e-mail já cadastrado
    const existing = await db.prepare('SELECT id FROM registered_users WHERE email = ?')
      .bind(invite.email).first()
    if (existing) return c.html(invitePageHtml({ ...invite, token }, 'E-mail já cadastrado. Faça login normalmente.', 'error'))

    // Criar usuário com owner_id apontando para o dono da empresa
    const { registerUser: _reg, ..._ } = await import('../userStore')
    const result = await _reg({
      email:     invite.email,
      pwd,
      nome,
      sobrenome,
      empresa:   invite.empresa || 'PCP Syncrus',
      plano:     invite.plano   || 'starter',
      tel:       '',
      setor:     '',
      porte:     '',
      ownerId:   invite.user_id,          // ← quem convidou = dono da conta
      role:      invite.role || 'user',   // ← papel definido no convite
    }, db)

    if (!result.ok) return c.html(invitePageHtml({ ...invite, token }, result.error || 'Erro ao criar conta.', 'error'))

    // Marcar convite como aceito
    await db.prepare('UPDATE invites SET status = ?, accepted_at = datetime("now") WHERE token = ?')
      .bind('accepted', token).run()

    return c.html(invitePageHtml(null, 'Conta criada com sucesso! Você já pode fazer login.', 'success'))
  } catch (e: any) {
    return c.html(invitePageHtml({ token }, 'Erro ao processar convite: ' + (e?.message || ''), 'error'))
  }
})

export default app
