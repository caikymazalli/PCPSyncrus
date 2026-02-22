import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'
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

const app = new Hono()

// Static files
app.use('/static/*', serveStatic({ root: './public' }))

// Auth routes
app.get('/login', (c) => c.html(loginPage()))

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
