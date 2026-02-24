/**
 * emailService.ts — Serviço de envio de e-mail via Resend API
 *
 * Suporta:
 *  - Configuração por tenant (chave Resend salva no D1)
 *  - Fallback para chave global (var de ambiente RESEND_API_KEY)
 *  - Templates HTML para: convite, reset de senha, boas-vindas
 *  - Logs de envio no D1
 */

// ── Types ──────────────────────────────────────────────────────────────────────
export interface EmailConfig {
  apiKey: string
  fromEmail: string
  fromName: string
  replyTo?: string
}

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  text?: string
  type: 'invite' | 'password_reset' | 'welcome' | 'notification'
  userId?: string
}

// ── Utilitários ────────────────────────────────────────────────────────────────
function logEmail(db: D1Database | null, params: {
  userId?: string; to: string; subject: string
  type: string; status: string; providerId?: string; error?: string
}) {
  if (!db) return
  const id = 'el_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
  db.prepare(`INSERT INTO email_logs (id, user_id, to_email, subject, type, status, provider_id, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`)
    .bind(id, params.userId || null, params.to, params.subject, params.type, params.status,
          params.providerId || null, params.error || null)
    .run().catch(() => {})
}

// ── Resolver configuração de e-mail ───────────────────────────────────────────
export async function resolveEmailConfig(
  env: any,
  db: D1Database | null,
  userId?: string
): Promise<EmailConfig | null> {
  // 1. Tentar config do tenant no D1
  if (db && userId) {
    try {
      const cfg = await db.prepare('SELECT * FROM email_config WHERE user_id = ? AND active = 1')
        .bind(userId).first() as any
      if (cfg?.api_key) {
        return {
          apiKey:    cfg.api_key,
          fromEmail: cfg.from_email || 'noreply@pcpsyncrus.com.br',
          fromName:  cfg.from_name  || 'PCP Syncrus',
          replyTo:   cfg.reply_to   || undefined,
        }
      }
    } catch {}
  }

  // 2. Fallback para variável de ambiente global
  const globalKey = env?.RESEND_API_KEY
  if (globalKey) {
    return {
      apiKey:    globalKey,
      fromEmail: env?.EMAIL_FROM    || 'noreply@pcpsyncrus.com.br',
      fromName:  env?.EMAIL_FROM_NAME || 'PCP Syncrus',
    }
  }

  return null
}

// ── Enviar e-mail via Resend ───────────────────────────────────────────────────
export async function sendEmail(
  cfg: EmailConfig,
  params: SendEmailParams,
  db: D1Database | null = null
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const body: any = {
      from:    `${cfg.fromName} <${cfg.fromEmail}>`,
      to:      [params.to],
      subject: params.subject,
      html:    params.html,
    }
    if (params.text) body.text = params.text
    if (cfg.replyTo) body.reply_to = cfg.replyTo

    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })

    const data = await res.json() as any
    if (res.ok && data.id) {
      logEmail(db, { userId: params.userId, to: params.to, subject: params.subject,
        type: params.type, status: 'sent', providerId: data.id })
      return { ok: true, id: data.id }
    } else {
      const err = data?.message || data?.name || 'Resend error'
      logEmail(db, { userId: params.userId, to: params.to, subject: params.subject,
        type: params.type, status: 'failed', error: err })
      return { ok: false, error: err }
    }
  } catch (e: any) {
    const err = e?.message || 'Network error'
    logEmail(db, { userId: params.userId, to: params.to, subject: params.subject,
      type: params.type, status: 'failed', error: err })
    return { ok: false, error: err }
  }
}

// ── Templates HTML ─────────────────────────────────────────────────────────────
const BASE_STYLE = `
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  background:#f0f3f5;margin:0;padding:0;
`
function emailWrapper(content: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="${BASE_STYLE}">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f3f5;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:560px;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#1B4F72,#2980B9);padding:28px 32px;text-align:center;">
    <div style="font-size:20px;font-weight:900;color:white;letter-spacing:-0.5px;">
      <span style="display:inline-block;width:32px;height:32px;background:rgba(255,255,255,0.2);border-radius:8px;line-height:32px;margin-right:8px;font-size:16px;">⚙</span>
      PCP Syncrus
    </div>
    <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:4px;">Sistema de Planejamento e Controle da Produção</div>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:32px;">${content}</td></tr>
  <!-- Footer -->
  <tr><td style="background:#f8f9fa;padding:20px 32px;text-align:center;border-top:1px solid #e9ecef;">
    <div style="font-size:11px;color:#9ca3af;">PCP Syncrus · Plataforma de PCP Industrial</div>
    <div style="font-size:11px;color:#9ca3af;margin-top:4px;">
      <a href="https://pcpsyncrus.pages.dev" style="color:#2980B9;text-decoration:none;">pcpsyncrus.pages.dev</a>
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

export function templateInvite(params: {
  inviterName: string; empresa: string
  inviteUrl: string; role: string; expiresIn?: string
}): string {
  const roleLabel: Record<string, string> = { admin: 'Administrador', user: 'Usuário', viewer: 'Visualizador' }
  return emailWrapper(`
    <h2 style="font-size:20px;font-weight:800;color:#1B4F72;margin:0 0 8px;">Você foi convidado!</h2>
    <p style="font-size:14px;color:#374151;margin:0 0 20px;">
      <strong>${params.inviterName}</strong> convidou você para acessar o PCP Syncrus da empresa
      <strong>${params.empresa}</strong> como <strong>${roleLabel[params.role] || params.role}</strong>.
    </p>
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:12px;color:#0369a1;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Empresa</div>
      <div style="font-size:15px;font-weight:700;color:#1B4F72;">${params.empresa}</div>
    </div>
    <a href="${params.inviteUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#1B4F72,#2980B9);color:white;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.3px;margin-bottom:20px;">
      Aceitar Convite e Criar Conta
    </a>
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">
      ${params.expiresIn ? `Este convite expira em ${params.expiresIn}.` : ''}
      Se não esperava este e-mail, pode ignorá-lo.
    </p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-top:20px;font-size:12px;color:#92400e;">
      <strong>Link direto:</strong><br>
      <a href="${params.inviteUrl}" style="color:#2980B9;word-break:break-all;">${params.inviteUrl}</a>
    </div>
  `)
}

export function templatePasswordReset(params: {
  nome: string; resetUrl: string; expiresIn?: string
}): string {
  return emailWrapper(`
    <h2 style="font-size:20px;font-weight:800;color:#1B4F72;margin:0 0 8px;">Redefinição de Senha</h2>
    <p style="font-size:14px;color:#374151;margin:0 0 20px;">
      Olá, <strong>${params.nome}</strong>! Recebemos uma solicitação para redefinir a senha da sua conta no PCP Syncrus.
    </p>
    <a href="${params.resetUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#dc2626,#b91c1c);color:white;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.3px;margin-bottom:20px;">
      Redefinir Minha Senha
    </a>
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0 0 16px;">
      ${params.expiresIn ? `Este link expira em ${params.expiresIn}.` : 'Este link expira em 1 hora.'}
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;font-size:12px;color:#dc2626;">
      <strong>Atenção:</strong> Se você não solicitou a redefinição de senha, ignore este e-mail.
      Sua senha atual continua ativa.
    </div>
    <div style="background:#f8f9fa;border-radius:8px;padding:12px 16px;margin-top:16px;font-size:12px;color:#374151;">
      <strong>Link direto:</strong><br>
      <a href="${params.resetUrl}" style="color:#2980B9;word-break:break-all;">${params.resetUrl}</a>
    </div>
  `)
}

export function templateWelcome(params: {
  nome: string; empresa: string; plano: string; loginUrl: string
}): string {
  const planLabel: Record<string, string> = {
    starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise'
  }
  return emailWrapper(`
    <h2 style="font-size:20px;font-weight:800;color:#1B4F72;margin:0 0 8px;">Bem-vindo ao PCP Syncrus! 🎉</h2>
    <p style="font-size:14px;color:#374151;margin:0 0 20px;">
      Olá, <strong>${params.nome}</strong>! Sua conta foi criada com sucesso.
      Você tem <strong>14 dias de trial gratuito</strong> do plano
      <strong>${planLabel[params.plano] || params.plano}</strong>.
    </p>
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:12px;color:#16a34a;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Sua empresa</div>
      <div style="font-size:16px;font-weight:800;color:#1B4F72;">${params.empresa}</div>
      <div style="font-size:12px;color:#6c757d;margin-top:4px;">Plano ${planLabel[params.plano] || params.plano} · Trial 14 dias</div>
    </div>
    <a href="${params.loginUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#1B4F72,#2980B9);color:white;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.3px;margin-bottom:20px;">
      Acessar o Sistema
    </a>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px;">
      <div style="background:#f8f9fa;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:20px;margin-bottom:4px;">📋</div>
        <div style="font-size:12px;font-weight:700;color:#374151;">Ordens de Produção</div>
      </div>
      <div style="background:#f8f9fa;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:20px;margin-bottom:4px;">📦</div>
        <div style="font-size:12px;font-weight:700;color:#374151;">Controle de Estoque</div>
      </div>
    </div>
  `)
}
