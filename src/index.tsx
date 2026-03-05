import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import dashboardApp from './routes/dashboard'
import ordensApp from './routes/ordens'
import recursosApp from './routes/recursos'
import engenhariaApp from './routes/engenharia'
import planejamentoApp from './routes/planejamento'
import apontamentoApp from './routes/apontamento'
import instrucoesApp from './routes/instrucoes'
import produtosApp from './routes/produtos'
import adminApp from './routes/admin'
import assinaturaApp from './routes/assinatura'
import qualidadeApp from './routes/qualidade'
import estoqueApp from './routes/estoque'
import { loginPage } from './login'
import { onboardingPage } from './onboarding'
import { welcomePage } from './welcome'
import cadastrosApp from './routes/cadastros'
import suprimentosApp from './routes/suprimentos'
import masterApp from './routes/master'
import authApp from './routes/auth'
import testApp from './routes/test'
import { newUserDashboard } from './newuser'
import { loginUser, registerUser, getSession, getSessionAsync, sessions, loadTenantFromDB, getEffectiveTenantId, resetTenantHydrationCache } from './userStore'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

const SESSION_COOKIE = 'pcp_session'
const SESSION_MAX_AGE = 60 * 60 * 8

// Static files
app.use('/static/*', serveStatic({ root: './public' }))
// Favicon inline (serveStatic path-specific doesn't work well in Cloudflare Workers)
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#1B4F72"/><text x="16" y="22" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="16" fill="white">P</text></svg>`
app.get('/favicon.svg', (c) => c.body(FAVICON_SVG, 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' }))
app.get('/favicon.ico', (c) => c.redirect('/favicon.svg', 301))

// Track which tenants have already had their hydration cache reset in this
// worker instance.  Resets happen only once per tenant on the first request
// after the worker starts (i.e. after a deploy), guaranteeing a fresh D1 load
// without the cost of resetting on every single request.
const tenantStartupResetDone = new Set<string>()

// ── Middleware: load session from D1 if not in memory + hydrate tenant ─────────
app.use('*', async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (token && c.env?.DB) {
    let session = getSession(token)
    if (!session) {
      session = await getSessionAsync(token, c.env.DB)
    }
    // Hydrate tenant data from D1
    if (session && !session.isDemo) {
      const tenantId = getEffectiveTenantId(session)
      // 🔥 Force re-hydration on first request per worker instance (after deploy)
      if (!tenantStartupResetDone.has(tenantId)) {
        tenantStartupResetDone.add(tenantId)
        resetTenantHydrationCache(tenantId)
      }
      await loadTenantFromDB(tenantId, c.env.DB, session.empresaId)
    }
  }
  await next()
})

// ── Middleware: protect main app routes (require login) ────────────────────────
// Routes that require authentication (non-demo access)
const PROTECTED_ROUTES = ['/', '/ordens', '/recursos', '/engenharia', '/planejamento',
  '/apontamento', '/instrucoes', '/produtos', '/admin', '/assinatura', '/qualidade',
  '/estoque', '/cadastros', '/suprimentos']

// Paths within protected routes that are publicly accessible (no login required)
// /suprimentos/quote-response: supplier quotation response form (new format)
// /suprimentos/cotacao/: existing supplier quotation response page
const PUBLIC_PATHS = ['/suprimentos/quote-response', '/suprimentos/cotacao/']

app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  const isProtected = PROTECTED_ROUTES.some(r => path === r || path.startsWith(r + '/'))
  const isApi = path.includes('/api/')
  const isPublicPath = PUBLIC_PATHS.some(p => path === p || path.startsWith(p))
  
  if (isProtected && !isApi && !isPublicPath) {
    const token = getCookie(c, SESSION_COOKIE)
    if (!token) {
      return c.redirect('/login')
    }
    // Try in-memory first, then D1 (workers may not share memory between isolates)
    let session = getSession(token)
    if (!session && c.env?.DB) {
      session = await getSessionAsync(token, c.env.DB)
    }
    if (!session) {
      // Only clear the cookie if DB was available and confirmed the session is gone.
      // When DB is unavailable, keep the cookie so the user isn't permanently logged out
      // due to a transient infrastructure issue (Cloudflare isolate cold-start, D1 downtime, etc.).
      if (c.env?.DB) {
        deleteCookie(c, SESSION_COOKIE, { path: '/' })
      }
      return c.redirect('/login')
    }
  }
  await next()
})

// ── Auth: POST /login ──────────────────────────────────────────────────────────
app.post('/login', async (c) => {
  const body = await c.req.parseBody()
  const email = (body['email'] as string || '').trim()
  const pwd   = (body['pwd']   as string || body['password'] as string || '').trim()

  const result = await loginUser(email, pwd, c.env?.DB || null)
  if (!result.ok || !result.token) {
    return c.html(loginPage('E-mail ou senha incorretos.'))
  }

  setCookie(c, SESSION_COOKIE, result.token, {
    maxAge: SESSION_MAX_AGE, path: '/', httpOnly: true, sameSite: 'Lax'
  })

  // New (non-demo) user first login → /novo; returning user or demo → dashboard
  if (result.session && !result.session.isDemo && result.isNewUser) {
    const params = new URLSearchParams({
      empresa: result.session.empresa,
      nome: result.session.nome,
      plano: result.session.plano,
    })
    return c.redirect('/novo?' + params.toString())
  }
  return c.redirect('/')
})

// ── Auth: POST /cadastro ───────────────────────────────────────────────────────
app.post('/cadastro', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ ok: false, error: 'Dados inválidos.' }, 400)

  const result = await registerUser({
    email:     body.email     || '',
    pwd:       body.pwd       || '',
    nome:      body.nome      || '',
    sobrenome: body.sobrenome || '',
    empresa:   body.empresa   || '',
    plano:     body.plano     || 'starter',
    tel:       body.tel       || '',
    setor:     body.setor     || '',
    porte:     body.porte     || '',
  }, c.env?.DB || null)

  if (!result.ok || !result.user) {
    return c.json({ ok: false, error: result.error || 'Erro ao cadastrar.' }, 400)
  }

  // Auto-login after registration
  const loginResult = await loginUser(body.email, body.pwd, c.env?.DB || null)
  if (loginResult.ok && loginResult.token) {
    setCookie(c, SESSION_COOKIE, loginResult.token, {
      maxAge: SESSION_MAX_AGE, path: '/', httpOnly: true, sameSite: 'Lax'
    })
  }

  return c.json({
    ok: true,
    redirect: `/novo?empresa=${encodeURIComponent(result.user.empresa)}&nome=${encodeURIComponent(result.user.nome)}&plano=${encodeURIComponent(result.user.plano)}`
  })
})

// ── Auth: GET /cadastro ────────────────────────────────────────────────────────
app.get('/cadastro', (c) => c.html(onboardingPage()))

// ── Auth: GET /login ───────────────────────────────────────────────────────────
app.get('/login', (c) => {
  const err = c.req.query('err') || ''
  return c.html(loginPage(err === '1' ? 'E-mail ou senha incorretos.' : ''))
})

// ── Auth: GET /logout ──────────────────────────────────────────────────────────
app.get('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) {
    delete sessions[token]
    // Remove from D1
    if (c.env?.DB) {
      try {
        await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
      } catch {}
    }
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.redirect('/login')
})

// ── Welcome ────────────────────────────────────────────────────────────────────
app.get('/welcome', (c) => {
  const empresa = c.req.query('empresa') || 'Minha Empresa'
  const nome    = c.req.query('nome')    || ''
  const plano   = c.req.query('plano')   || 'starter'
  return c.html(welcomePage(empresa, nome, plano))
})

// ── /novo — dashboard vazio para novo usuário ──────────────────────────────────
app.get('/novo', async (c) => {
  const token  = getCookie(c, SESSION_COOKIE)
  // Try async session load first (handles worker restart / new isolate)
  let session = getSession(token)
  if (!session && token && c.env?.DB) {
    session = await getSessionAsync(token, c.env.DB)
  }
  const empresa = session?.empresa || c.req.query('empresa') || ''
  const nome    = session?.nome    || c.req.query('nome')    || ''
  const plano   = session?.plano   || c.req.query('plano')   || 'starter'
  return c.html(newUserDashboard(empresa, nome, plano))
})

// ── /usar-demo ─────────────────────────────────────────────────────────────────
app.get('/usar-demo', (c) => c.redirect('/'))

// ── Module routes ──────────────────────────────────────────────────────────────
app.route('/', dashboardApp)
app.route('/ordens', ordensApp)
app.route('/recursos', recursosApp)
app.route('/engenharia', engenhariaApp)
app.route('/planejamento', planejamentoApp)
app.route('/apontamento', apontamentoApp)
app.route('/instrucoes', instrucoesApp)
app.route('/produtos', produtosApp)
app.route('/admin', adminApp)
app.route('/assinatura', assinaturaApp)
app.route('/qualidade', qualidadeApp)
app.route('/estoque', estoqueApp)
app.route('/cadastros', cadastrosApp)
app.route('/suprimentos', suprimentosApp)
app.route('/master', masterApp)
app.route('/test', testApp)
app.route('/', authApp)

// ── 404 ────────────────────────────────────────────────────────────────────────
app.notFound((c) => {
  return c.html(`
    <html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#F0F3F5;">
      <div style="text-align:center;">
        <div style="font-size:64px;margin-bottom:16px;">🏭</div>
        <h1 style="color:#1B4F72;font-size:24px;">Página não encontrada</h1>
        <a href="/" style="color:#2980B9;font-size:14px;">← Voltar ao Dashboard</a>
      </div>
    </body></html>
  `, 404)
})

export default app
