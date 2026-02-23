import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'
import { setCookie, deleteCookie } from 'hono/cookie'
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
import { newUserDashboard } from './newuser'

const app = new Hono()

// Static files
app.use('/static/*', serveStatic({ root: './public' }))

// Auth routes
app.get('/login', (c) => c.html(loginPage()))
app.get('/cadastro', (c) => c.html(onboardingPage()))
app.get('/welcome', (c) => {
  const empresa = c.req.query('empresa') || 'Minha Empresa'
  const nome = c.req.query('nome') || ''
  const plano = c.req.query('plano') || 'starter'
  return c.html(welcomePage(empresa, nome, plano))
})

// Rota de dashboard para novo usuário (sem dados demo) — acessada após cadastro
app.get('/novo', (c) => {
  const empresa = c.req.query('empresa') || ''
  const nome = c.req.query('nome') || ''
  const plano = c.req.query('plano') || 'starter'
  // Setar cookie indicando novo usuário (sem dados demo)
  setCookie(c, 'new_user', '1', { path: '/', maxAge: 86400 * 30, sameSite: 'Lax' })
  return c.html(newUserDashboard(empresa, nome, plano))
})

// Rota para "sair" do modo novo usuário (usar o demo)
app.get('/usar-demo', (c) => {
  deleteCookie(c, 'new_user', { path: '/' })
  return c.redirect('/')
})

// Module routes
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

// 404 fallback
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
