import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxUserId, getCtxEmpresaId, getCtxSession } from '../sessionHelper'
import { ok, err, genId } from '../dbHelpers'
import { markTenantModified } from '../userStore'

const app = new Hono<{ Bindings: { DB: D1Database; pcpsyncrus: Queue } }>()

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(str: any): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** SLA deadlines (ms) by priority */
const SLA_MS: Record<string, number> = {
  critical: 4  * 60 * 60 * 1000,      // 4h
  high:     24 * 60 * 60 * 1000,      // 24h
  medium:   72 * 60 * 60 * 1000,      // 72h
  low:      7  * 24 * 60 * 60 * 1000, // 7d
}

function computeDueAt(priority: string): string {
  const ms = SLA_MS[priority] || SLA_MS.medium
  return new Date(Date.now() + ms).toISOString()
}

const PRIORITY_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Crítica',  color: '#dc2626', bg: '#fef2f2' },
  high:     { label: 'Alta',     color: '#ea580c', bg: '#fff7ed' },
  medium:   { label: 'Média',    color: '#d97706', bg: '#fffbeb' },
  low:      { label: 'Baixa',    color: '#16a34a', bg: '#f0fdf4' },
}

const STATUS_ORDER = ['Criada', 'Analisando', 'N1', 'N2', 'N3', 'Resolvendo', 'Resolvida']

// ── UI: GET /suporte ──────────────────────────────────────────────────────────
app.get('/', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const session = getCtxSession(c)
  const empresaId = getCtxEmpresaId(c)

  if (!session || session.isDemo) {
    return c.redirect('/login')
  }

  const tickets: any[] = ((tenant as any).supportTickets || []).filter(
    (t: any) => t.empresa_id === empresaId || t.empresa_id === (session.ownerId || session.userId)
  )

  const open     = tickets.filter(t => t.status !== 'Resolvida').length
  const resolved = tickets.filter(t => t.status === 'Resolvida').length
  const now      = Date.now()
  const breached = tickets.filter(t => t.status !== 'Resolvida' && t.due_at && new Date(t.due_at).getTime() < now).length
  const withinSLA = open - breached

  const content = `
  <!-- Header -->
  <div class="section-header">
    <div>
      <div style="font-size:14px;color:#6c757d;margin-bottom:4px;">Abertura e acompanhamento de chamados de suporte</div>
    </div>
    <button class="btn btn-primary" onclick="openModal('novoTicketModal')">
      <i class="fas fa-plus"></i> Novo Chamado
    </button>
  </div>

  <!-- KPIs -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px;">
    <div class="kpi-card" style="border-left:4px solid #2980B9;">
      <div class="kpi-value" style="color:#2980B9;">${open}</div>
      <div class="kpi-label">Abertos</div>
    </div>
    <div class="kpi-card" style="border-left:4px solid #16a34a;">
      <div class="kpi-value" style="color:#16a34a;">${resolved}</div>
      <div class="kpi-label">Resolvidos</div>
    </div>
    <div class="kpi-card" style="border-left:4px solid #16a34a;">
      <div class="kpi-value" style="color:#16a34a;">${withinSLA}</div>
      <div class="kpi-label">No prazo SLA</div>
    </div>
    <div class="kpi-card" style="border-left:4px solid #dc2626;">
      <div class="kpi-value" style="color:#dc2626;">${breached}</div>
      <div class="kpi-label">SLA Vencido</div>
    </div>
  </div>

  <!-- Ticket List -->
  ${tickets.length === 0 ? `
  <div class="card" style="padding:48px;text-align:center;">
    <div style="font-size:48px;margin-bottom:16px;">🎫</div>
    <div style="font-size:18px;font-weight:700;color:#1B4F72;margin-bottom:8px;">Nenhum chamado aberto</div>
    <div style="font-size:14px;color:#6c757d;margin-bottom:20px;">Abra um chamado para solicitar suporte à equipe Syncrus.</div>
    <button class="btn btn-primary" onclick="openModal('novoTicketModal')"><i class="fas fa-plus"></i> Abrir primeiro chamado</button>
  </div>
  ` : `
  <div class="card" style="overflow:hidden;">
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Título</th>
          <th>Prioridade</th>
          <th>Status</th>
          <th>Prazo SLA</th>
          <th>Aberto em</th>
        </tr></thead>
        <tbody>
          ${tickets.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((t: any) => {
            const pri = PRIORITY_LABELS[t.priority] || PRIORITY_LABELS.medium
            const dueDate = t.due_at ? new Date(t.due_at) : null
            const overdue = dueDate && dueDate.getTime() < now && t.status !== 'Resolvida'
            const dueStr = dueDate ? dueDate.toLocaleDateString('pt-BR') + ' ' + dueDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'
            return `<tr>
              <td style="font-weight:600;color:#374151;">${escapeHtml(t.title)}</td>
              <td><span class="badge" style="background:${pri.bg};color:${pri.color};">${pri.label}</span></td>
              <td><span class="badge badge-secondary">${escapeHtml(t.status)}</span></td>
              <td style="font-size:12px;color:${overdue ? '#dc2626' : '#374151'};font-weight:${overdue ? '700' : '400'};">
                ${overdue ? '<i class="fas fa-exclamation-triangle" style="margin-right:4px;"></i>' : ''}${dueStr}
              </td>
              <td style="font-size:12px;color:#6c757d;">${new Date(t.created_at).toLocaleDateString('pt-BR')}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>
  `}

  <!-- Modal: Novo Chamado -->
  <div class="modal-overlay" id="novoTicketModal">
    <div class="modal" style="max-width:520px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-ticket-alt" style="margin-right:8px;"></i>Novo Chamado de Suporte</h3>
        <button onclick="closeModal('novoTicketModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div class="form-group">
          <label class="form-label">Título <span style="color:#dc2626;">*</span></label>
          <input class="form-control" type="text" id="ticketTitle" placeholder="Descreva brevemente o problema...">
        </div>
        <div class="form-group">
          <label class="form-label">Descrição <span style="color:#dc2626;">*</span></label>
          <textarea class="form-control" id="ticketDescription" rows="4" placeholder="Descreva o problema em detalhes, incluindo passos para reproduzir..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Prioridade</label>
          <select class="form-control" id="ticketPriority">
            <option value="low">🟢 Baixa — SLA 7 dias</option>
            <option value="medium" selected>🟡 Média — SLA 72h</option>
            <option value="high">🟠 Alta — SLA 24h</option>
            <option value="critical">🔴 Crítica — SLA 4h</option>
          </select>
        </div>
        <div id="ticketSlaInfo" style="margin-top:-8px;margin-bottom:12px;font-size:12px;color:#6c757d;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:8px 12px;">
          <i class="fas fa-clock" style="color:#0284c7;margin-right:4px;"></i>
          <span id="ticketSlaText">Prazo SLA: 72 horas após abertura</span>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novoTicketModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarTicket()" class="btn btn-primary" id="btnSalvarTicket">
          <i class="fas fa-paper-plane"></i> Abrir Chamado
        </button>
      </div>
    </div>
  </div>

  <script>
  const SLA_LABELS = {
    critical: 'Crítica — SLA 4 horas',
    high:     'Alta — SLA 24 horas',
    medium:   'Média — SLA 72 horas',
    low:      'Baixa — SLA 7 dias',
  };

  document.getElementById('ticketPriority').addEventListener('change', function() {
    document.getElementById('ticketSlaText').textContent = 'Prazo SLA: ' + (SLA_LABELS[this.value] || '');
  });

  async function salvarTicket() {
    const title = document.getElementById('ticketTitle').value.trim();
    const description = document.getElementById('ticketDescription').value.trim();
    const priority = document.getElementById('ticketPriority').value;

    if (!title) { alert('Informe o título do chamado.'); return; }
    if (!description) { alert('Informe a descrição do problema.'); return; }

    const btn = document.getElementById('btnSalvarTicket');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    try {
      const res = await fetch('/suporte/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, priority }),
      });
      const data = await res.json();
      if (data.ok) {
        closeModal('novoTicketModal');
        setTimeout(() => location.reload(), 400);
      } else {
        alert(data.error || 'Erro ao criar chamado.');
      }
    } catch(e) {
      alert('Erro de conexão. Tente novamente.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Abrir Chamado';
    }
  }
  </script>
  `

  return c.html(layout('Suporte', content, userInfo, 'suporte'))
})

// ── API: POST /api/tickets ────────────────────────────────────────────────────
app.post('/api/tickets', async (c) => {
  const session = getCtxSession(c)
  if (!session || session.isDemo) return err(c, 'Não autenticado', 401)

  const db       = getCtxDB(c)
  const userId   = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant   = getCtxTenant(c)
  const body     = await c.req.json().catch(() => null)

  if (!body || !body.title) return err(c, 'Título é obrigatório')
  if (!body.description)    return err(c, 'Descrição é obrigatória')

  const priority = ['low','medium','high','critical'].includes(body.priority) ? body.priority : 'medium'
  const id = genId('tkt')
  const now = new Date().toISOString()
  const dueAt = computeDueAt(priority)

  const ticket = {
    id,
    empresa_id:         empresaId || '1',
    empresa_name:       session.empresa || null,
    user_id:            userId,
    created_by_name:    session.nome || '',
    created_by_email:   session.email || '',
    assigned_to_user_id: null,
    atendente_id:       null,
    atendente_name:     null,
    title:              body.title,
    description:        body.description,
    priority,
    status:             'Criada',
    created_at:         now,
    updated_at:         now,
    resolved_at:        null,
    due_at:             dueAt,
    last_activity_at:   now,
  }

  // D1-first (production); se falhar, enfileirar na Queue como fallback durável
  if (db && userId !== 'demo-tenant') {
    let d1Ok = false
    try {
      const data = { ...ticket, empresa_id: empresaId || '1' }
      const keys = Object.keys(data)
      const vals = Object.values(data)
      await db.prepare(
        `INSERT INTO support_tickets (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
      ).bind(...vals).run()
      d1Ok = true
    } catch (e: any) {
      console.error(`[SUPORTE][CRÍTICO][${id}] Falha ao persistir ticket em D1: ${e?.message} — tentando Queue fallback`)
    }

    if (!d1Ok) {
      // Fallback: enfileirar na Cloudflare Queue para persistência assíncrona
      const queue: Queue | undefined = c.env?.pcpsyncrus
      if (queue) {
        try {
          await queue.send({
            type: 'support_ticket',
            correlationId: id,
            ticket: { ...ticket, empresa_id: empresaId || '1' },
            enqueuedAt: new Date().toISOString(),
          })
          console.log(`[SUPORTE][QUEUE][${id}] Ticket enfileirado com sucesso como fallback`)
          // Retornar 202 com protocolo para rastreabilidade
          if (!(tenant as any).supportTickets) (tenant as any).supportTickets = []
          ;(tenant as any).supportTickets.push(ticket)
          markTenantModified(userId)
          return c.json({ ok: true, queued: true, correlationId: id, protocolo: id,
            mensagem: 'Chamado recebido e em processamento. Protocolo: ' + id }, 202)
        } catch (qe: any) {
          console.error(`[SUPORTE][QUEUE][${id}] Falha ao enfileirar: ${qe?.message}`)
          return err(c, 'Erro ao salvar chamado. Tente novamente em instantes.', 500)
        }
      } else {
        // Queue indisponível (ambiente local/dev sem binding)
        return err(c, 'Erro ao salvar chamado no banco de dados', 500)
      }
    }
  }

  // Memory (only reached when D1 succeeded or demo mode)
  if (!(tenant as any).supportTickets) (tenant as any).supportTickets = []
  ;(tenant as any).supportTickets.push(ticket)
  markTenantModified(userId)

  return ok(c, { ticket })
})

// ── API: GET /api/tickets ─────────────────────────────────────────────────────
app.get('/api/tickets', async (c) => {
  const session = getCtxSession(c)
  if (!session || session.isDemo) return err(c, 'Não autenticado', 401)

  const db        = getCtxDB(c)
  const tenant    = getCtxTenant(c)
  const empresaId = getCtxEmpresaId(c)
  const userId    = getCtxUserId(c)

  // D1-first: lê do banco de dados quando disponível para garantir que chamados
  // criados pelo tenant reflitam imediatamente no painel Master (que também lê D1).
  if (db && userId !== 'demo-tenant') {
    try {
      // Usa empresaId real quando disponível; '1' é o valor-padrão de getCtxEmpresaId
      // quando nenhum empresa_id está associado à sessão — nesse caso,
      // recorre ao ownerId (para convidados) ou userId (para titulares de conta).
      const PLACEHOLDER_EMPRESA_ID = '1'
      const filter = empresaId && empresaId !== PLACEHOLDER_EMPRESA_ID
        ? empresaId
        : (session.ownerId || session.userId || empresaId)
      const res = await db.prepare(
        `SELECT * FROM support_tickets WHERE empresa_id = ? ORDER BY updated_at DESC LIMIT 200`
      ).bind(filter).all()
      const tickets: any[] = res.results || []
      return ok(c, { tickets })
    } catch (e: any) {
      console.error(`[SUPORTE][GET /api/tickets] Falha ao ler D1, usando memória: ${e?.message}`)
      // fallback para memória abaixo
    }
  }

  // Fallback: memória (desenvolvimento local / D1 indisponível)
  const tickets = ((tenant as any).supportTickets || []).filter(
    (t: any) => t.empresa_id === empresaId || t.empresa_id === (session.ownerId || session.userId)
  )

  return ok(c, { tickets })
})

export default app
