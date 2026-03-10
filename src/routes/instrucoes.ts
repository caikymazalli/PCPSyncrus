import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxUserId, getCtxEmpresaId, getCtxSession } from '../sessionHelper'
import { ok, err, dbInsert, dbUpdate, dbDelete, genId } from '../dbHelpers'
import { markTenantModified, logWorkInstructionEvent } from '../userStore'

const app = new Hono()

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Escape HTML special characters to prevent XSS in SSR-rendered output. */
function escapeHtml(str: any): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

/** Resolve the Content-Type for an image file, only allowing jpg/jpeg/png. */
function guessImageContentType(fileName: string, contentType?: string): string | null {
  if (contentType) {
    const ct = contentType.toLowerCase().split(';')[0].trim()
    if (Object.values(ALLOWED_IMAGE_TYPES).includes(ct)) return ct
  }
  const ext = (fileName.split('.').pop() || '').toLowerCase()
  return ALLOWED_IMAGE_TYPES[ext] || null
}

/** Remove path separators and dangerous characters from a file name. */
function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_').slice(0, 200)
}

/** Return a 401 JSON response if the user is not authenticated (no session or demo). */
async function ensureAuthenticatedOr401(c: any): Promise<Response | null> {
  const session = getCtxSession(c)
  if (!session || session.isDemo) {
    return c.json({ error: 'Não autenticado' }, 401)
  }
  return null
}

/** Returns true if the error message indicates a schema drift (missing table or column). */
function isSchemaDriftError(msg: string): boolean {
  return /no such table|no such column|table.*not found|column.*not found|has no column named/i.test(msg)
}

/** Build a clear 500 error response with migration instructions when schema is out of date. */
function schemaDriftError(c: any, detail: string): Response {
  const message =
    `Schema desatualizado no banco de dados D1. ` +
    `Detalhe: ${detail}. ` +
    `Execute os comandos abaixo para corrigir:\n` +
    `  1. wrangler d1 migrations apply pcpsyncrus-production --remote\n` +
    `  2. npx vite-node scripts/d1-migrate-work-instructions.ts pcpsyncrus-production`
  return c.json({ ok: false, error: message, schemaDrift: true }, 500)
}

// ── UI: GET /instrucoes ──
app.get('/', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const instructions = tenant.workInstructions || []

  const content = `
  <!-- Header -->
  <div class="section-header">
    <div>
      <div style="font-size:14px;color:#6c757d;margin-bottom:4px;">Instruções de Trabalho e Procedimentos Operacionais</div>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-primary" onclick="openModal('novaInstrucaoModal')"><i class="fas fa-plus"></i> Nova Instrução</button>
    </div>
  </div>

  <!-- Search -->
  <div class="card" style="padding:14px 20px;margin-bottom:16px;">
    <div class="search-box" style="max-width:400px;">
      <i class="fas fa-search icon"></i>
      <input class="form-control" type="text" id="searchInput" placeholder="Buscar instrução por título, código ou descrição..." oninput="filterInstructions()">
    </div>
  </div>

  <!-- Instructions List -->
  ${instructions.length === 0 ? `
  <div class="card" style="padding:48px;text-align:center;">
    <div style="font-size:48px;margin-bottom:16px;">📋</div>
    <div style="font-size:18px;font-weight:700;color:#1B4F72;margin-bottom:8px;">Nenhuma instrução cadastrada</div>
    <div style="font-size:14px;color:#6c757d;margin-bottom:20px;">Crie instruções de trabalho para padronizar seus processos de produção.</div>
    <button class="btn btn-primary" onclick="openModal('novaInstrucaoModal')"><i class="fas fa-plus"></i> Criar primeira instrução</button>
  </div>
  ` : `
  <div class="card" style="overflow:hidden;">
    <div class="table-wrapper">
      <table id="instructionsTable">
        <thead><tr>
          <th>Código</th>
          <th>Título</th>
          <th>Versão</th>
          <th>Status</th>
          <th>Atualizado em</th>
          <th>Ações</th>
        </tr></thead>
        <tbody id="instructionsBody">
          ${instructions.map((inst: any) => `
          <tr data-search="${escapeHtml((inst.title || '').toLowerCase())} ${escapeHtml((inst.code || '').toLowerCase())} ${escapeHtml((inst.description || '').toLowerCase())}">
            <td><span class="badge badge-secondary">${escapeHtml(inst.code || '—')}</span></td>
            <td>
              <div style="font-weight:700;color:#1B4F72;">${escapeHtml(inst.title || '—')}</div>
              ${inst.description ? `<div style="font-size:11px;color:#6c757d;margin-top:2px;">${escapeHtml(inst.description)}</div>` : ''}
            </td>
            <td><span class="badge badge-secondary">v${escapeHtml(inst.current_version || '1.0')}</span></td>
            <td><span class="badge badge-${inst.status === 'active' ? 'success' : 'secondary'}">${escapeHtml(inst.status || 'draft')}</span></td>
            <td style="font-size:12px;color:#6c757d;">${inst.updated_at ? new Date(inst.updated_at).toLocaleDateString('pt-BR') : '—'}</td>
            <td>
              <div style="display:flex;gap:4px;">
                <button class="btn btn-secondary btn-sm" title="Visualizar (somente leitura, nova aba)" onclick="viewOnlyInstruction('${escapeHtml(inst.id)}')"><i class="fas fa-eye"></i> Visualizar</button>
                <button class="btn btn-primary btn-sm" title="Editar" onclick="viewInstruction('${escapeHtml(inst.id)}')"><i class="fas fa-edit"></i> Editar</button>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>
  `}

  <!-- Nova Instrução Modal -->
  <div class="modal-overlay" id="novaInstrucaoModal">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-book-open" style="margin-right:8px;"></i>Nova Instrução de Trabalho</h3>
        <button onclick="closeModal('novaInstrucaoModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <div class="form-group">
          <label class="form-label">Código</label>
          <input class="form-control" id="instrCode" type="text" placeholder="Ex: INSTR-001">
        </div>
        <div class="form-group">
          <label class="form-label">Título *</label>
          <input class="form-control" id="instrTitle" type="text" placeholder="Ex: Procedimento de Torneamento CNC">
        </div>
        <div class="form-group">
          <label class="form-label">Descrição</label>
          <textarea class="form-control" id="instrDesc" rows="3" placeholder="Breve descrição do procedimento..."></textarea>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaInstrucaoModal')" class="btn btn-secondary">Cancelar</button>
        <button class="btn btn-primary" onclick="saveInstruction()"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <script>
  function openModal(id) {
    const modal = document.getElementById(id)
    if (modal) modal.classList.add('open')
  }

  function closeModal(id) {
    const modal = document.getElementById(id)
    if (modal) modal.classList.remove('open')
  }

  async function saveInstruction() {
    const code = document.getElementById('instrCode').value.trim()
    const title = document.getElementById('instrTitle').value.trim()
    const desc = document.getElementById('instrDesc').value.trim()

    if (!title) {
      alert('❌ Título é obrigatório')
      return
    }

    try {
      const res = await fetch('/instrucoes/api/instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, title, description: desc })
      })

      const text = await res.text()
      let data = null
      try { data = JSON.parse(text) } catch (parseError) { data = null }
      if (res.ok && data && data.ok) {
        alert('✅ Instrução criada com sucesso!')
        document.getElementById('instrCode').value = ''
        document.getElementById('instrTitle').value = ''
        document.getElementById('instrDesc').value = ''
        closeModal('novaInstrucaoModal')
        setTimeout(() => location.reload(), 800)
      } else {
        const msg = (data && (data.error || data.message)) || text
        alert('❌ Erro ' + res.status + ': ' + msg)
      }
    } catch (e) {
      alert('❌ Erro de conexão: ' + (e && e.message ? e.message : e))
    }
  }

  function filterInstructions() {
    const searchValue = (document.getElementById('searchInput').value || '').toLowerCase()
    const rows = document.querySelectorAll('#instructionsBody tr')
    rows.forEach(row => {
      const searchText = (row.getAttribute('data-search') || '').toLowerCase()
      row.style.display = searchText.includes(searchValue) ? '' : 'none'
    })
  }

  function viewInstruction(id) {
    window.location.href = '/instrucoes/' + encodeURIComponent(id)
  }
  function viewOnlyInstruction(id) {
    window.open('/instrucoes/' + encodeURIComponent(id) + '/view', '_blank')
  }
  </script>
  `

  return c.html(layout('Instruções de Trabalho', content, 'instrucoes', userInfo))
})

// ── UI: GET /instrucoes/:id ──
app.get('/:id', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const instructionId = c.req.param('id')

  const instruction = (tenant.workInstructions || []).find((i: any) => i.id === instructionId)
  if (!instruction) {
    const notFound = `
    <div style="padding:48px;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px;">📋</div>
      <div style="font-size:18px;font-weight:700;color:#1B4F72;margin-bottom:8px;">Instrução não encontrada</div>
      <div style="font-size:14px;color:#6c757d;margin-bottom:20px;">O ID informado não corresponde a nenhuma instrução cadastrada.</div>
      <a href="/instrucoes" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> Voltar à listagem</a>
    </div>`
    return c.html(layout('Instrução não encontrada', notFound, 'instrucoes', userInfo))
  }

  const currentVersion = (tenant.workInstructionVersions || []).find(
    (v: any) => v.instruction_id === instructionId && v.is_current
  )

  const steps = (tenant.workInstructionSteps || [])
    .filter((s: any) => s.version_id === currentVersion?.id)
    .sort((a: any, b: any) => (a.step_number || 0) - (b.step_number || 0))

  const stepIds = new Set(steps.map((s: any) => s.id))
  const photos = (tenant.workInstructionPhotos || []).filter((p: any) => stepIds.has(p.step_id))

  const photosByStep: Record<string, any[]> = {}
  for (const p of photos) (photosByStep[p.step_id] ||= []).push(p)

  const nextStepNumber = steps.length ? Math.max(...steps.map((s: any) => Number(s.step_number) || 0)) + 1 : 1

  const allVersions = (tenant.workInstructionVersions || [])
    .filter((v: any) => v.instruction_id === instructionId)
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const statusLabel: Record<string, string> = { active: 'Ativo', draft: 'Rascunho', archived: 'Arquivado', obsolete: 'Obsoleto' }
  const statusBadge: Record<string, string> = { active: 'success', draft: 'secondary', archived: 'secondary', obsolete: 'secondary' }
  const status = instruction.status || 'draft'

  const statusButtons = status === 'draft'
    ? '<button class="btn btn-success no-print" onclick="transitionStatus(\'' + escapeHtml(instructionId) + '\', \'active\')"><i class="fas fa-check"></i> Aprovar</button>'
    : status === 'active'
      ? '<button class="btn btn-warning no-print" onclick="transitionStatus(\'' + escapeHtml(instructionId) + '\', \'obsolete\')"><i class="fas fa-archive"></i> Arquivar</button>' +
        ' <button class="btn btn-secondary no-print" onclick="transitionStatus(\'' + escapeHtml(instructionId) + '\', \'draft\')"><i class="fas fa-undo"></i> Rascunho</button>'
      : ''

  const content = `
  <style>
    .wi-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .wi-thumb { width:110px; height:auto; border:1px solid #e9ecef; border-radius:8px; display:block; }
    .wi-muted { font-size:12px; color:#6c757d; }
    .wi-table td, .wi-table th { vertical-align: top; }
    .modal-overlay .modal { max-width: 720px; width: 95%; }

    @media print {
      .no-print { display: none !important; }
      .sidebar, .nav-sidebar, .topbar { display: none !important; }
      .main-content, body { background: #fff !important; padding: 0 !important; margin: 0 !important; }
      .card { box-shadow: none !important; border: 1px solid #ddd !important; page-break-inside: avoid; }
      img { max-width: 180px !important; max-height: 180px !important; }
      h1 { font-size: 16px !important; }
      textarea.form-control { border: none !important; background: transparent !important; resize: none !important; overflow: visible !important; height: auto !important; min-height: unset !important; padding: 2px 0 !important; }
      .wi-table td { word-break: break-word; overflow-wrap: break-word; }
    }
  </style>

  <div class="section-header">
    <div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
        <span class="badge badge-secondary">${escapeHtml(instruction.code || '—')}</span>
        <h1 style="margin:0;font-size:20px;font-weight:700;color:#1B4F72;">${escapeHtml(instruction.title || '—')}</h1>
      </div>
      <div style="display:flex;align-items:center;gap:12px;font-size:13px;color:#6c757d;flex-wrap:wrap;">
        <span>Versão: <strong>v${escapeHtml(instruction.current_version || '1.0')}</strong></span>
        <span class="badge badge-${escapeHtml(statusBadge[status] || 'secondary')}">${escapeHtml(statusLabel[status] || status)}</span>
        ${instruction.description ? `<span>— ${escapeHtml(instruction.description)}</span>` : ''}
      </div>
    </div>
    <div class="wi-actions no-print">
      <a href="/instrucoes" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> Voltar</a>
      <a href="/instrucoes/${escapeHtml(instructionId)}/view" target="_blank" class="btn btn-secondary"><i class="fas fa-eye"></i> Visualizar</a>
      <button class="btn btn-secondary" onclick="window.print()"><i class="fas fa-print"></i> Imprimir / PDF</button>
      ${statusButtons}
      <button class="btn btn-primary" onclick="openModal('novaEtapaModal')"><i class="fas fa-plus"></i> Nova etapa</button>
    </div>
  </div>

  <div class="card" style="overflow:hidden;">
    <div class="table-wrapper">
      <table class="wi-table">
        <thead>
          <tr>
            <th style="width:70px;">Nº</th>
            <th style="width:240px;">Título</th>
            <th>Descrição</th>
            <th>Observação</th>
            <th style="width:280px;">Imagem de apoio</th>
            <th class="no-print" style="width:140px;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${steps.length === 0 ? `
            <tr>
              <td colspan="6" style="padding:16px;color:#6c757d;">Nenhuma etapa cadastrada para esta instrução.</td>
            </tr>
          ` : steps.map((step: any) => {
            const stepPhotos = photosByStep[step.id] || []
            const firstPhoto = stepPhotos[0]
            return `
              <tr data-step-id="${escapeHtml(step.id)}">
                <td>
                  <input class="form-control" type="number" min="1" step="1" data-field="step_number" value="${escapeHtml(step.step_number)}">
                </td>
                <td>
                  <input class="form-control" type="text" data-field="title" value="${escapeHtml(step.title || '')}" placeholder="Título">
                </td>
                <td>
                  <textarea class="form-control" rows="2" data-field="description" placeholder="Descrição...">${escapeHtml(step.description || '')}</textarea>
                </td>
                <td>
                  <textarea class="form-control" rows="2" data-field="observation" placeholder="Observação...">${escapeHtml(step.observation || '')}</textarea>
                </td>
                <td>
                  ${firstPhoto ? `
                    <img src="/instrucoes/api/photos/${encodeURIComponent(firstPhoto.id)}" class="wi-thumb" alt="${escapeHtml(firstPhoto.file_name || 'foto')}">
                    <div class="wi-muted" style="margin-top:6px;">${escapeHtml(firstPhoto.file_name || '')}</div>
                  ` : `<div class="wi-muted">Sem imagem</div>`}

                  <div class="no-print" style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <input type="file" id="file-${escapeHtml(step.id)}" accept="image/png,image/jpeg" style="font-size:13px;">
                    <button class="btn btn-secondary btn-sm" onclick="uploadPhoto('${escapeHtml(instructionId)}', '${escapeHtml(step.id)}')"><i class="fas fa-upload"></i> Enviar</button>
                  </div>
                  <div id="upload-status-${escapeHtml(step.id)}" class="wi-muted no-print" style="margin-top:6px;"></div>
                </td>
                <td class="no-print">
                  <div style="display:flex;gap:8px;align-items:center;">
                    <button class="btn btn-primary btn-sm" onclick="saveStep('${escapeHtml(instructionId)}', '${escapeHtml(step.id)}')"><i class="fas fa-save"></i></button>
                    <button class="btn btn-secondary btn-sm" onclick="deleteStep('${escapeHtml(instructionId)}', '${escapeHtml(step.id)}')"><i class="fas fa-trash"></i></button>
                  </div>
                </td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Modal: Nova Etapa -->
  <div class="modal-overlay no-print" id="novaEtapaModal">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-list-ol" style="margin-right:8px;"></i>Nova Etapa</h3>
        <button onclick="closeModal('novaEtapaModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <div class="form-group">
          <label class="form-label">Nº da etapa *</label>
          <input class="form-control" id="stepNumber" type="number" min="1" step="1" value="${nextStepNumber}">
        </div>
        <div class="form-group">
          <label class="form-label">Título *</label>
          <input class="form-control" id="stepTitle" type="text" placeholder="Ex: Preparar equipamento">
        </div>
        <div class="form-group">
          <label class="form-label">Descrição</label>
          <textarea class="form-control" id="stepDesc" rows="3" placeholder="Descreva a etapa..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Observação</label>
          <textarea class="form-control" id="stepObs" rows="2" placeholder="Observações importantes..."></textarea>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaEtapaModal')" class="btn btn-secondary">Cancelar</button>
        <button class="btn btn-primary" onclick="createStep('${escapeHtml(instructionId)}')"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <!-- Versões -->
  <div class="card no-print" style="margin-top:16px;padding:20px 24px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <h3 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-code-branch" style="margin-right:8px;"></i>Versões</h3>
      <button class="btn btn-secondary btn-sm" onclick="openModal('novaVersaoModal')"><i class="fas fa-plus"></i> Nova versão</button>
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Versão</th>
          <th>Status</th>
          <th>Criado em</th>
        </tr></thead>
        <tbody>
          ${allVersions.length === 0 ? `
            <tr><td colspan="3" style="padding:12px;color:#6c757d;">Nenhuma versão encontrada.</td></tr>
          ` : allVersions.map((v: any) => `
            <tr>
              <td><strong>v${escapeHtml(v.version || '—')}</strong>${v.is_current ? ' <span class="badge badge-success" style="font-size:11px;">Atual</span>' : ''}</td>
              <td><span class="badge badge-${v.status === 'active' ? 'success' : 'secondary'}">${escapeHtml(statusLabel[v.status] || v.status || 'Rascunho')}</span></td>
              <td style="font-size:12px;color:#6c757d;">${v.created_at ? new Date(v.created_at).toLocaleDateString('pt-BR') : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Modal: Nova Versão -->
  <div class="modal-overlay no-print" id="novaVersaoModal">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-code-branch" style="margin-right:8px;"></i>Nova Versão</h3>
        <button onclick="closeModal('novaVersaoModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <p style="font-size:13px;color:#6c757d;margin-bottom:16px;">Versão atual: <strong>v${escapeHtml(instruction.current_version || '1.0')}</strong></p>
        <div class="form-group">
          <label class="form-label">Nova versão *</label>
          <input class="form-control" id="newVersionInput" type="text" placeholder="Ex: 2.0">
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaVersaoModal')" class="btn btn-secondary">Cancelar</button>
        <button class="btn btn-primary" onclick="createVersion('${escapeHtml(instructionId)}')"><i class="fas fa-save"></i> Criar versão</button>
      </div>
    </div>
  </div>

  <script>
  function openModal(id) {
    const modal = document.getElementById(id)
    if (modal) modal.classList.add('open')
  }
  function closeModal(id) {
    const modal = document.getElementById(id)
    if (modal) modal.classList.remove('open')
  }

  function getRow(stepId) {
    return document.querySelector('tr[data-step-id=\"' + stepId + '\"]')
  }

  async function createStep(instructionId) {
    const step_number = Number(document.getElementById('stepNumber').value)
    const title = String(document.getElementById('stepTitle').value || '').trim()
    const description = String(document.getElementById('stepDesc').value || '')
    const observation = String(document.getElementById('stepObs').value || '')

    if (!step_number || step_number <= 0) { alert('❌ Nº da etapa é obrigatório'); return }
    if (!title) { alert('❌ Título é obrigatório'); return }

    try {
      const res = await fetch('/instrucoes/api/instructions/' + encodeURIComponent(instructionId) + '/steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_number, title, description, observation })
      })
      const data = await res.json()
      if (data && data.ok) {
        closeModal('novaEtapaModal')
        setTimeout(() => location.reload(), 250)
      } else {
        alert('❌ Erro: ' + (data && data.error ? data.error : 'Desconhecido'))
      }
    } catch (e) {
      alert('❌ Falha: ' + (e && e.message ? e.message : e))
    }
  }

  async function saveStep(instructionId, stepId) {
    const row = getRow(stepId)
    if (!row) return

    const step_number = Number(row.querySelector('[data-field=\"step_number\"]').value)
    const title = String(row.querySelector('[data-field=\"title\"]').value || '').trim()
    const description = String(row.querySelector('[data-field=\"description\"]').value || '')
    const observation = String(row.querySelector('[data-field=\"observation\"]').value || '')

    if (!step_number || step_number <= 0) { alert('❌ Nº inválido'); return }
    if (!title) { alert('❌ Título é obrigatório'); return }

    try {
      const res = await fetch('/instrucoes/api/instructions/' + encodeURIComponent(instructionId) + '/steps/' + encodeURIComponent(stepId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_number, title, description, observation })
      })
      const data = await res.json()
      if (data && data.ok) {
        alert('✅ Etapa salva')
        setTimeout(() => location.reload(), 150)
      } else {
        alert('❌ Erro: ' + (data && data.error ? data.error : 'Desconhecido'))
      }
    } catch (e) {
      alert('❌ Falha: ' + (e && e.message ? e.message : e))
    }
  }

  async function deleteStep(instructionId, stepId) {
    if (!confirm('Remover esta etapa?')) return
    try {
      const res = await fetch('/instrucoes/api/instructions/' + encodeURIComponent(instructionId) + '/steps/' + encodeURIComponent(stepId), {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data && data.ok) {
        setTimeout(() => location.reload(), 150)
      } else {
        alert('❌ Erro: ' + (data && data.error ? data.error : 'Desconhecido'))
      }
    } catch (e) {
      alert('❌ Falha: ' + (e && e.message ? e.message : e))
    }
  }

  async function uploadPhoto(instructionId, stepId) {
    const fileInput = document.getElementById('file-' + stepId)
    const statusEl = document.getElementById('upload-status-' + stepId)

    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      if (statusEl) statusEl.textContent = '⚠️ Selecione um arquivo antes de enviar.'
      return
    }

    const file = fileInput.files[0]
    const formData = new FormData()
    formData.append('step_id', stepId)
    formData.append('file', file)

    if (statusEl) statusEl.textContent = '⏳ Enviando...'

    try {
      const res = await fetch('/instrucoes/api/instructions/' + encodeURIComponent(instructionId) + '/photos/upload', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      if (data && data.ok) {
        if (statusEl) statusEl.textContent = '✅ Foto enviada! Recarregando...'
        setTimeout(() => location.reload(), 800)
      } else {
        if (statusEl) statusEl.textContent = '❌ Erro: ' + (data.error || 'Desconhecido')
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = '❌ Erro de conexão. Tente novamente.'
    }
  }

  async function createVersion(instructionId) {
    const newVersion = String(document.getElementById('newVersionInput').value || '').trim()
    if (!newVersion) { alert('❌ Nova versão é obrigatória'); return }
    try {
      const res = await fetch('/instrucoes/api/instructions/' + encodeURIComponent(instructionId) + '/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_version: newVersion })
      })
      const data = await res.json()
      if (data && data.ok) {
        alert('✅ Nova versão criada!')
        closeModal('novaVersaoModal')
        setTimeout(() => location.reload(), 250)
      } else {
        alert('❌ Erro: ' + (data && data.error ? data.error : 'Desconhecido'))
      }
    } catch (e) {
      alert('❌ Falha: ' + (e && e.message ? e.message : e))
    }
  }

  async function transitionStatus(instructionId, newStatus) {
    const actionLabels = { active: 'aprovar', obsolete: 'arquivar', draft: 'voltar a rascunho' }
    if (!confirm('Deseja ' + (actionLabels[newStatus] || newStatus) + ' esta instrução?')) return
    try {
      const res = await fetch('/instrucoes/api/instructions/' + encodeURIComponent(instructionId) + '/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      const data = await res.json()
      if (data && data.ok) {
        setTimeout(() => location.reload(), 150)
      } else {
        alert('❌ Erro: ' + (data && data.error ? data.error : 'Desconhecido'))
      }
    } catch (e) {
      alert('❌ Falha: ' + (e && e.message ? e.message : e))
    }
  }
  </script>
  `

  return c.html(layout('Instrução: ' + instruction.title, content, 'instrucoes', userInfo))
})

// ── UI: GET /instrucoes/:id/view (Read-only view) ──
app.get('/:id/view', async (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const session = getCtxSession(c)
  const db = getCtxDB(c)
  const instructionId = c.req.param('id')

  const instruction = (tenant.workInstructions || []).find((i: any) => i.id === instructionId)
  if (!instruction) {
    const notFound = `
    <div style="padding:48px;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px;">📋</div>
      <div style="font-size:18px;font-weight:700;color:#1B4F72;margin-bottom:8px;">Instrução não encontrada</div>
      <div style="font-size:14px;color:#6c757d;margin-bottom:20px;">O ID informado não corresponde a nenhuma instrução cadastrada.</div>
      <a href="/instrucoes" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> Voltar à listagem</a>
    </div>`
    return c.html(layout('Instrução não encontrada', notFound, 'instrucoes', userInfo))
  }

  const currentVersion = (tenant.workInstructionVersions || []).find(
    (v: any) => v.instruction_id === instructionId && v.is_current
  )

  const steps = (tenant.workInstructionSteps || [])
    .filter((s: any) => s.version_id === currentVersion?.id)
    .sort((a: any, b: any) => (a.step_number || 0) - (b.step_number || 0))

  const stepIds = new Set(steps.map((s: any) => s.id))
  const photos = (tenant.workInstructionPhotos || []).filter((p: any) => stepIds.has(p.step_id))

  const photosByStep: Record<string, any[]> = {}
  for (const p of photos) (photosByStep[p.step_id] ||= []).push(p)

  const statusLabel: Record<string, string> = { active: 'Ativo', draft: 'Rascunho', archived: 'Arquivado', obsolete: 'Obsoleto' }
  const statusBadge: Record<string, string> = { active: 'success', draft: 'secondary', archived: 'secondary', obsolete: 'secondary' }
  const status = instruction.status || 'draft'

  // Resolve group logo URL for print header
  let logoHtml = ''
  try {
    if (db && session && !session.isDemo) {
      let grupoId = session.grupoId || ''
      if (!grupoId && session.empresaId) {
        const empRow = await db.prepare('SELECT grupo_id FROM empresas WHERE id = ?')
          .bind(session.empresaId).first() as any
        grupoId = empRow?.grupo_id || ''
      }
      if (grupoId) {
        const logoRow = await db.prepare(
          'SELECT logo_object_key, logo_updated_at FROM grupo WHERE id = ?'
        ).bind(grupoId).first() as any
        if (logoRow?.logo_object_key) {
          const vParam = logoRow.logo_updated_at
            ? '?v=' + encodeURIComponent(logoRow.logo_updated_at)
            : ''
          logoHtml = `<img src="${escapeHtml('/admin/api/grupo/logo' + vParam)}" alt="Logo" style="max-height:48px;max-width:120px;object-fit:contain;" class="wi-print-logo">`
        }
      }
    }
  } catch {
    // ignore — logo is optional
  }

  const content = `
  <style>
    .wi-thumb { width:140px; height:auto; border:1px solid #e9ecef; border-radius:8px; display:block; }
    .wi-muted { font-size:12px; color:#6c757d; }
    .wi-table td, .wi-table th { vertical-align: top; }
    .wi-text { white-space: pre-wrap; word-break: break-word; font-size: 14px; line-height: 1.5; }
    .wi-print-header { display:none; }
    @media print {
      .no-print { display: none !important; }
      .sidebar, .nav-sidebar, .topbar { display: none !important; }
      .main-content, body { background: #fff !important; padding: 0 !important; margin: 0 !important; }
      .card { box-shadow: none !important; border: 1px solid #ddd !important; page-break-inside: avoid; }
      img { max-width: 180px !important; max-height: 180px !important; }
      .wi-print-logo { max-height:48px !important; max-width:120px !important; }
      h1 { font-size: 16px !important; }
      .wi-table td { word-break: break-word; }
      .wi-print-header { display:flex !important; align-items:center; gap:12px; border-bottom:2px solid #1B4F72; padding-bottom:10px; margin-bottom:14px; }
    }
  </style>

  <div class="wi-print-header">
    ${logoHtml}
    <div>
      <div style="font-size:14px;font-weight:700;color:#1B4F72;">${escapeHtml(instruction.title || '—')}</div>
      <div style="font-size:11px;color:#6c757d;">${escapeHtml(instruction.code || '')} — v${escapeHtml(instruction.current_version || '1.0')}</div>
    </div>
  </div>

  <div class="section-header">
    <div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
        <span class="badge badge-secondary">${escapeHtml(instruction.code || '—')}</span>
        <h1 style="margin:0;font-size:20px;font-weight:700;color:#1B4F72;">${escapeHtml(instruction.title || '—')}</h1>
      </div>
      <div style="display:flex;align-items:center;gap:12px;font-size:13px;color:#6c757d;flex-wrap:wrap;">
        <span>Versão: <strong>v${escapeHtml(instruction.current_version || '1.0')}</strong></span>
        <span class="badge badge-${escapeHtml(statusBadge[status] || 'secondary')}">${escapeHtml(statusLabel[status] || status)}</span>
        ${instruction.description ? `<span>— ${escapeHtml(instruction.description)}</span>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;" class="no-print">
      <a href="/instrucoes" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> Voltar</a>
      <a href="/instrucoes/${escapeHtml(instructionId)}" class="btn btn-secondary"><i class="fas fa-edit"></i> Editar</a>
      <button class="btn btn-secondary" onclick="window.print()"><i class="fas fa-print"></i> Imprimir / PDF</button>
    </div>
  </div>

  <div class="card" style="overflow:hidden;">
    <div class="table-wrapper">
      <table class="wi-table">
        <thead>
          <tr>
            <th style="width:60px;">Nº</th>
            <th style="width:200px;">Título</th>
            <th>Descrição</th>
            <th>Observação</th>
            <th style="width:200px;">Imagem de apoio</th>
          </tr>
        </thead>
        <tbody>
          ${steps.length === 0 ? `
            <tr>
              <td colspan="5" style="padding:16px;color:#6c757d;">Nenhuma etapa cadastrada para esta instrução.</td>
            </tr>
          ` : steps.map((step: any) => {
            const stepPhotos = photosByStep[step.id] || []
            const firstPhoto = stepPhotos[0]
            return `
              <tr>
                <td style="font-weight:700;font-size:15px;">${escapeHtml(String(step.step_number || ''))}</td>
                <td style="font-weight:600;">${escapeHtml(step.title || '')}</td>
                <td><div class="wi-text">${escapeHtml(step.description || '')}</div></td>
                <td><div class="wi-text">${escapeHtml(step.observation || '')}</div></td>
                <td>
                  ${firstPhoto ? `
                    <img src="/instrucoes/api/photos/${encodeURIComponent(firstPhoto.id)}" class="wi-thumb" alt="${escapeHtml(firstPhoto.file_name || 'foto')}">
                    <div class="wi-muted" style="margin-top:6px;">${escapeHtml(firstPhoto.file_name || '')}</div>
                  ` : `<div class="wi-muted">—</div>`}
                </td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>
  `

  return c.html(layout('Instrução: ' + instruction.title, content, 'instrucoes', userInfo))
})

// ── API: POST /api/instructions (Criar Instrução) ──
app.post('/api/instructions', async (c) => {
  const authErr = await ensureAuthenticatedOr401(c)
  if (authErr) return authErr

  const db = getCtxDB(c)
  const session = getCtxSession(c)!
  const userId = session.userId
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)

  if (!body || !body.title) return err(c, 'Título é obrigatório', 400)

  const now = new Date().toISOString()
  const id = genId('instr')
  const versionId = genId('instrv')

  // In-memory instruction object (may contain extra fields for frontend compatibility)
  const instruction = {
    id,
    code: body.code || 'INSTR-' + Date.now(),
    title: body.title,
    description: body.description || '',
    current_version: '1.0',
    status: 'draft',
    created_at: now,
    updated_at: now,
  }

  const version = {
    id: versionId,
    instruction_id: id,
    version: '1.0',
    title: body.title,
    description: body.description || '',
    is_current: true,
    status: 'draft',
    created_at: now,
    created_by: userId,
  }

  // D1-first (production): only insert columns that exist in work_instructions schema
  // Schema: id, user_id, empresa_id, code, title, version, status, created_at, updated_at
  // NOTE: description, current_version, created_by, updated_by are NOT in work_instructions;
  //       description belongs exclusively in work_instruction_versions.
  if (db) {
    console.log(`[INSTRUCOES] Persistindo instrução ${id} (user=${userId}, empresa=${empresaId})`)
    try {
      const instrData: Record<string, unknown> = {
        id,
        user_id: userId,
        empresa_id: empresaId,
        code: instruction.code,
        title: instruction.title,
        version: '1.0',
        status: instruction.status,
        created_at: now,
        updated_at: now,
      }
      const instrKeys = Object.keys(instrData)
      const instrVals = Object.values(instrData)
      await db.prepare(
        `INSERT INTO work_instructions (${instrKeys.join(', ')}) VALUES (${instrKeys.map(() => '?').join(', ')})`
      ).bind(...instrVals).run()
    } catch (e: any) {
      const msg = e?.message || String(e)
      if (isSchemaDriftError(msg)) {
        console.error(`[INSTRUCOES][SCHEMA] Schema drift detectado ao inserir instrução ${id}: ${msg}`)
        return schemaDriftError(c, msg)
      }
      console.error(`[INSTRUCOES][CRÍTICO] Falha ao persistir instrução ${id} em D1: ${msg}`)
      return err(c, 'Erro ao salvar instrução no banco de dados', 500)
    }
    try {
      // description is persisted here in work_instruction_versions (normalized model)
      const versionData: Record<string, unknown> = {
        id: versionId,
        user_id: userId,
        empresa_id: empresaId,
        instruction_id: id,
        version: '1.0',
        title: body.title,
        description: body.description || '',
        is_current: 1,
        status: 'draft',
        created_at: now,
        created_by: userId,
      }
      const versionKeys = Object.keys(versionData)
      const versionVals = Object.values(versionData)
      await db.prepare(
        `INSERT INTO work_instruction_versions (${versionKeys.join(', ')}) VALUES (${versionKeys.map(() => '?').join(', ')})`
      ).bind(...versionVals).run()
    } catch (e: any) {
      const msg = e?.message || String(e)
      // Compensate: rollback instruction insert to avoid orphaned rows in D1
      try {
        const rollback = await db.prepare('DELETE FROM work_instructions WHERE id = ? AND user_id = ?').bind(id, userId).run()
        if (rollback.success) {
          console.log(`[INSTRUCOES][ROLLBACK] Instrução ${id} removida do D1 em compensação pela falha na versão`)
        } else {
          console.error(`[INSTRUCOES][ROLLBACK] Rollback de instrução ${id} não removeu nenhuma linha (pode já ter falhado)`)
        }
      } catch (rollbackErr: any) {
        console.error(`[INSTRUCOES][ROLLBACK] Falha ao remover instrução ${id} em compensação: ${rollbackErr?.message}`)
      }
      if (isSchemaDriftError(msg)) {
        console.error(`[INSTRUCOES][SCHEMA] Schema drift detectado ao inserir versão ${versionId}: ${msg}`)
        return schemaDriftError(c, msg)
      }
      console.error(`[INSTRUCOES][CRÍTICO] Falha ao persistir versão ${versionId} em D1: ${msg}`)
      return err(c, 'Erro ao salvar versão no banco de dados', 500)
    }
    console.log(`[INSTRUCOES] Instrução ${id} e versão ${versionId} persistidas em D1 com sucesso`)
  }

  // Memória (after D1 success or in demo/no-db mode)
  if (!tenant.workInstructions) tenant.workInstructions = []
  if (!tenant.workInstructionVersions) tenant.workInstructionVersions = []
  tenant.workInstructions.push(instruction)
  tenant.workInstructionVersions.push(version)
  markTenantModified(userId)

  await logWorkInstructionEvent(db, userId, empresaId, id, 'CREATED', { title: body.title }, tenant)

  return ok(c, { instruction, version })
})

// ── API: POST /api/instructions/:id/steps (Adicionar Etapa) ──
app.post('/api/instructions/:id/steps', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const instructionId = c.req.param('id')
  const body = await c.req.json().catch(() => null)

  if (!body || !body.step_number || !body.title) return err(c, 'Dados inválidos')

  const instruction = (tenant.workInstructions || []).find((i: any) => i.id === instructionId)
  if (!instruction) return err(c, 'Instrução não encontrada', 404)

  const currentVersion = (tenant.workInstructionVersions || []).find((v: any) => v.instruction_id === instructionId && v.is_current)
  if (!currentVersion) return err(c, 'Versão atual não encontrada', 404)

  const stepId = genId('step')
  const step = {
    id: stepId,
    version_id: currentVersion.id,
    step_number: body.step_number,
    title: body.title,
    description: body.description || '',
    observation: body.observation || '',
    created_at: new Date().toISOString(),
    created_by: userId,
  }

  // D1-first (production)
  if (db && userId !== 'demo-tenant') {
    const saved = await dbInsert(db, 'work_instruction_steps', { ...step, user_id: userId, empresa_id: empresaId })
    if (!saved) {
      console.error(`[INSTRUCOES][ETAPAS][CRÍTICO] Falha ao persistir etapa ${stepId} em D1`)
      return err(c, 'Erro ao salvar etapa no banco de dados', 500)
    }
    console.log(`[INSTRUCOES][ETAPAS] Etapa ${stepId} persistida em D1 com sucesso`)
  }

  // Memória (after D1 success or in demo/no-db mode)
  if (!tenant.workInstructionSteps) tenant.workInstructionSteps = []
  tenant.workInstructionSteps.push(step)
  markTenantModified(userId)

  await logWorkInstructionEvent(db, userId, empresaId, instructionId, 'STEP_ADDED', {
    step_number: body.step_number,
    title: body.title
  }, tenant)

  return ok(c, { step })
})

// ── API: GET /api/instructions/:id/steps/:stepId (Obter Etapa) ──
app.get('/api/instructions/:id/steps/:stepId', async (c) => {
  const tenant = getCtxTenant(c)
  const instructionId = c.req.param('id')
  const stepId = c.req.param('stepId')

  // (Opcional) valida instrução existe
  const instruction = (tenant.workInstructions || []).find((i: any) => i.id === instructionId)
  if (!instruction) return err(c, 'Instrução não encontrada', 404)

  const step = (tenant.workInstructionSteps || []).find((s: any) => s.id === stepId)
  if (!step) return err(c, 'Etapa não encontrada', 404)

  return ok(c, { step })
})

// ── API: PUT /api/instructions/:id/steps/:stepId (Editar Etapa) ──
app.put('/api/instructions/:id/steps/:stepId', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const instructionId = c.req.param('id')
  const stepId = c.req.param('stepId')
  const body = await c.req.json().catch(() => null)

  if (!body) return err(c, 'Dados inválidos')

  if (!tenant.workInstructionSteps) tenant.workInstructionSteps = []
  let stepIdx = tenant.workInstructionSteps.findIndex((s: any) => s.id === stepId)
  // Fallback to D1 if not in memory
  if (stepIdx === -1 && db && userId !== 'demo-tenant') {
    const row = await db.prepare('SELECT * FROM work_instruction_steps WHERE id = ? AND user_id = ?')
      .bind(stepId, userId).first()

    if (row) {
      tenant.workInstructionSteps.push(row as any)
      stepIdx = tenant.workInstructionSteps.length - 1
    }
  }

  if (stepIdx === -1) return err(c, 'Etapa não encontrada', 404)

  const oldStep = tenant.workInstructionSteps[stepIdx]
  const newStepNumber = body.step_number !== undefined ? Number(body.step_number) : oldStep.step_number

  if (!newStepNumber || Number.isNaN(newStepNumber) || newStepNumber <= 0) {
    return err(c, 'Número da etapa inválido', 400)
  }

  const updatedStep = {
    ...oldStep,
    step_number: newStepNumber,
    title: body.title !== undefined ? body.title : oldStep.title,
    description: body.description !== undefined ? body.description : oldStep.description,
    observation: body.observation !== undefined ? body.observation : oldStep.observation,
  }

  // D1-first (production)
  if (db && userId !== 'demo-tenant') {
    const updated = await dbUpdate(db, 'work_instruction_steps', stepId, userId, {
      step_number: updatedStep.step_number,
      title: updatedStep.title,
      description: updatedStep.description,
      observation: updatedStep.observation,
    })
    if (!updated) {
      console.error(`[INSTRUCOES][ETAPAS][CRÍTICO] Falha ao atualizar etapa ${stepId} em D1`)
      return err(c, 'Erro ao salvar etapa no banco de dados', 500)
    }
    console.log(`[INSTRUCOES][ETAPAS] Etapa ${stepId} atualizada em D1 com sucesso`)
  }

  // Update memory only after D1 success (or demo/no-db mode)
  tenant.workInstructionSteps[stepIdx] = updatedStep
  markTenantModified(userId)

  await logWorkInstructionEvent(db, userId, empresaId, instructionId, 'STEP_EDITED', {
    stepId,
    whatChanged: Object.keys(body).filter((k: string) => body[k] !== undefined && body[k] !== oldStep[k])
  }, tenant)

  return ok(c, { step: updatedStep })
})

// ── API: DELETE /api/instructions/:id/steps/:stepId (Deletar Etapa) ──
app.delete('/api/instructions/:id/steps/:stepId', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const instructionId = c.req.param('id')
  const stepId = c.req.param('stepId')

  if (!tenant.workInstructionSteps) tenant.workInstructionSteps = []
  let stepIdx = tenant.workInstructionSteps.findIndex((s: any) => s.id === stepId)
  // Fallback to D1 if not in memory
  if (stepIdx === -1 && db && userId !== 'demo-tenant') {
    const row = await db.prepare('SELECT * FROM work_instruction_steps WHERE id = ? AND user_id = ?')
      .bind(stepId, userId).first()

    if (row) {
      tenant.workInstructionSteps.push(row as any)
      stepIdx = tenant.workInstructionSteps.length - 1
    }
  }

  if (stepIdx === -1) return err(c, 'Etapa não encontrada', 404)

  const step = tenant.workInstructionSteps[stepIdx]

  // D1 first
  if (db && userId !== 'demo-tenant') {
    const deleted = await dbDelete(db, 'work_instruction_steps', stepId, userId)
    if (!deleted) {
      console.error(`[INSTRUCOES][ETAPAS][CRÍTICO] Falha ao deletar etapa ${stepId} em D1`)
      return err(c, 'Erro ao remover etapa do banco de dados', 500)
    }
    const photosInDb = await db.prepare('SELECT id FROM work_instruction_photos WHERE step_id = ?').bind(stepId).all()
    for (const photo of photosInDb.results || []) {
      await dbDelete(db, 'work_instruction_photos', (photo as any).id, userId)
    }
  }

  // Memória (after D1 success or demo/no-db mode)
  tenant.workInstructionSteps.splice(stepIdx, 1)

  // Remover fotos associadas
  tenant.workInstructionPhotos = (tenant.workInstructionPhotos || []).filter((p: any) => p.step_id !== stepId)
  markTenantModified(userId)

  await logWorkInstructionEvent(db, userId, empresaId, instructionId, 'STEP_DELETED', {
    stepId,
    stepNumber: step.step_number,
    title: step.title
  }, tenant)

  return ok(c, { message: 'Etapa removida' })
})

// ── API: POST /api/instructions/:id/photos/upload (R2 Upload) ──
app.post('/api/instructions/:id/photos/upload', async (c) => {
  const unauthorized = await ensureAuthenticatedOr401(c)
  if (unauthorized) return unauthorized

  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const instructionId = c.req.param('id')

  const formData = await c.req.formData().catch(() => null)
  if (!formData) return err(c, 'Dados inválidos')

  const stepId = formData.get('step_id')
  const file = formData.get('file')

  if (!stepId || typeof stepId !== 'string') return err(c, 'step_id obrigatório')
  if (!file || !(file instanceof File)) return err(c, 'Arquivo obrigatório')

  // Validate step exists
  const stepExists = (tenant.workInstructionSteps || []).find((s: any) => s.id === stepId)
  if (!stepExists) return err(c, 'Etapa não encontrada', 404)

  // Validate file type
  const resolvedContentType = guessImageContentType(file.name, file.type)
  if (!resolvedContentType) return err(c, 'Tipo de arquivo não permitido. Use jpg, jpeg ou png.')

  // Validate file size (~8MB)
  if (file.size > 8 * 1024 * 1024) return err(c, 'Arquivo muito grande. Limite: 8MB')

  const photoId = genId('photo')
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const safeFileName = sanitizeFileName(file.name)
  const objectKey = `work-instructions/${instructionId}/steps/${stepId}/${photoId}.${ext}`

  // Upload to R2
  const bucket = (c.env as any)?.INSTR_PHOTOS_BUCKET
  if (!bucket) return err(c, 'Upload de fotos indisponível: configure o binding INSTR_PHOTOS_BUCKET no Cloudflare R2.', 503)

  const arrayBuffer = await file.arrayBuffer()
  await bucket.put(objectKey, arrayBuffer, { httpMetadata: { contentType: resolvedContentType } })

  const photo: Record<string, any> = {
    id: photoId,
    step_id: stepId,
    photo_url: '',
    file_name: safeFileName,
    uploaded_at: new Date().toISOString(),
    uploaded_by: userId,
    object_key: objectKey,
    content_type: resolvedContentType,
  }

  // D1 first
  if (db && userId !== 'demo-tenant') {
    const saved = await dbInsert(db, 'work_instruction_photos', { ...photo, user_id: userId, empresa_id: empresaId })
    if (!saved) {
      console.error(`[INSTRUCOES][FOTO][CRÍTICO] Falha ao persistir foto ${photoId} (upload R2) em D1`)
      return err(c, 'Erro ao salvar foto no banco de dados', 500)
    }
  }

  // Memória (after D1 success or demo/no-db mode)
  if (!tenant.workInstructionPhotos) tenant.workInstructionPhotos = []
  tenant.workInstructionPhotos.push(photo)
  markTenantModified(userId)

  await logWorkInstructionEvent(db, userId, empresaId, instructionId, 'PHOTO_UPLOADED', {
    stepId,
    photoId,
    fileName: safeFileName,
    objectKey,
  }, tenant)

  return ok(c, { photo, view_url: '/instrucoes/api/photos/' + photoId })
})

// ── API: GET /api/photos/:photoId (Servir Foto do R2) ──
app.get('/api/photos/:photoId', async (c) => {
  const unauthorized = await ensureAuthenticatedOr401(c)
  if (unauthorized) return unauthorized

  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const tenant = getCtxTenant(c)
  const photoId = c.req.param('photoId')

  // Lookup photo in memory first
  let photo: any = (tenant.workInstructionPhotos || []).find((p: any) => p.id === photoId)

  // Fallback to D1 if not in memory
  if (!photo && db && userId !== 'demo-tenant') {
    try {
      const row = await db.prepare('SELECT * FROM work_instruction_photos WHERE id = ? AND user_id = ?')
        .bind(photoId, userId).first()
      if (row) photo = row
    } catch {
      // ignore
    }
  }

  if (!photo) return err(c, 'Foto não encontrada', 404)

  const bucket = (c.env as any)?.INSTR_PHOTOS_BUCKET

  // Serve from R2 if object_key exists and bucket is configured
  if (photo.object_key && bucket) {
    const obj = await bucket.get(photo.object_key)
    if (!obj) return err(c, 'Objeto não encontrado no storage', 404)
    const contentType = photo.content_type || obj.httpMetadata?.contentType || 'image/jpeg'
    return c.body(obj.body as any, 200, {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=300',
    })
  }

  // Fallback: redirect to photo_url for legacy data
  if (photo.photo_url) {
    return c.redirect(photo.photo_url, 302)
  }

  return err(c, 'Foto não disponível', 404)
})

// ── API: POST /api/instructions/:id/photos (Upload Foto — legado) ──
app.post('/api/instructions/:id/photos', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const instructionId = c.req.param('id')
  const body = await c.req.json().catch(() => null)

  if (!body || !body.step_id || (!body.photo_url && !body.object_key)) return err(c, 'step_id e (photo_url ou object_key) são obrigatórios')

  const stepExists = (tenant.workInstructionSteps || []).find((s: any) => s.id === body.step_id)
  if (!stepExists) return err(c, 'Etapa não encontrada', 404)

  const photoId = genId('photo')
  const photo: Record<string, any> = {
    id: photoId,
    step_id: body.step_id,
    photo_url: body.photo_url || '',
    file_name: body.file_name || 'photo_' + photoId + '.jpg',
    uploaded_at: new Date().toISOString(),
    uploaded_by: userId,
    object_key: body.object_key || '',
    content_type: body.content_type || '',
  }

  // D1 first
  if (db && userId !== 'demo-tenant') {
    const saved = await dbInsert(db, 'work_instruction_photos', { ...photo, user_id: userId, empresa_id: empresaId })
    if (!saved) {
      console.error(`[INSTRUCOES][FOTO][CRÍTICO] Falha ao persistir foto ${photoId} em D1`)
      return err(c, 'Erro ao salvar foto no banco de dados', 500)
    }
  }

  // Memória (after D1 success or demo/no-db mode)
  if (!tenant.workInstructionPhotos) tenant.workInstructionPhotos = []
  tenant.workInstructionPhotos.push(photo)
  markTenantModified(userId)

  await logWorkInstructionEvent(db, userId, empresaId, instructionId, 'PHOTO_ADDED', {
    stepId: body.step_id,
    fileName: photo.file_name
  }, tenant)

  return ok(c, { photo })
})

// ── API: DELETE /api/instructions/:id/photos/:photoId (Deletar Foto) ──
app.delete('/api/instructions/:id/photos/:photoId', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const instructionId = c.req.param('id')
  const photoId = c.req.param('photoId')

  const photosArr = tenant.workInstructionPhotos || []
  const photoIdx = photosArr.findIndex((p: any) => p.id === photoId)
  if (photoIdx === -1) return err(c, 'Foto não encontrada', 404)

  const photo = photosArr[photoIdx]

  // D1 first
  if (db && userId !== 'demo-tenant') {
    const deleted = await dbDelete(db, 'work_instruction_photos', photoId, userId)
    if (!deleted) {
      console.error(`[INSTRUCOES][FOTO][CRÍTICO] Falha ao deletar foto ${photoId} em D1`)
      return err(c, 'Erro ao remover foto do banco de dados', 500)
    }
  }

  // Delete from R2 if object_key exists
  const bucket = (c.env as any)?.INSTR_PHOTOS_BUCKET
  if (photo.object_key && bucket) {
    try {
      await bucket.delete(photo.object_key)
    } catch (e) {
      console.warn('[R2][DELETE] Falha ao remover objeto do R2:', (e as any)?.message)
    }
  }

  // Memory (after D1 success or demo/no-db mode)
  photosArr.splice(photoIdx, 1)
  markTenantModified(userId)
  await logWorkInstructionEvent(db, userId, empresaId, instructionId, 'PHOTO_DELETED', {
    photoId,
    fileName: photo.file_name
  }, tenant)

  return ok(c, { message: 'Foto removida' })
})

// ── API: POST /api/instructions/:id/versions (Criar Nova Versão) ──
app.post('/api/instructions/:id/versions', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const instructionId = c.req.param('id')
  const body = await c.req.json().catch(() => null)

  if (!body || !body.new_version) return err(c, 'Nova versão não especificada')

  const instruction = (tenant.workInstructions || []).find((i: any) => i.id === instructionId)
  if (!instruction) return err(c, 'Instrução não encontrada', 404)

  const currentVersion = (tenant.workInstructionVersions || []).find((v: any) => v.instruction_id === instructionId && v.is_current)
  if (!currentVersion) return err(c, 'Versão atual não encontrada', 404)

  // Criar nova versão
  const newVersionId = genId('instrv')
  const newVersion = {
    id: newVersionId,
    instruction_id: instructionId,
    version: body.new_version,
    title: instruction.title,
    description: instruction.description,
    is_current: true,
    status: 'draft',
    created_at: new Date().toISOString(),
    created_by: userId,
  }
  const updatedAt = new Date().toISOString()

  // D1 first
  if (db && userId !== 'demo-tenant') {
    const prevUpdated = await dbUpdate(db, 'work_instruction_versions', currentVersion.id, userId, { is_current: 0 })
    if (!prevUpdated) {
      console.error(`[INSTRUCOES][VERSION][CRÍTICO] Falha ao atualizar versão anterior ${currentVersion.id} em D1`)
      return err(c, 'Erro ao salvar versão no banco de dados', 500)
    }
    const inserted = await dbInsert(db, 'work_instruction_versions', { ...newVersion, is_current: 1, user_id: userId, empresa_id: empresaId })
    if (!inserted) {
      // Compensate: restore previous version as current
      const restored = await dbUpdate(db, 'work_instruction_versions', currentVersion.id, userId, { is_current: 1 })
      if (!restored) {
        console.error(`[INSTRUCOES][VERSION][CRÍTICO] Compensação falhou: não foi possível restaurar is_current da versão ${currentVersion.id}`)
      } else {
        console.log(`[INSTRUCOES][VERSION][ROLLBACK] Versão anterior ${currentVersion.id} restaurada como is_current em compensação`)
      }
      console.error(`[INSTRUCOES][VERSION][CRÍTICO] Falha ao inserir nova versão ${newVersionId} em D1`)
      return err(c, 'Erro ao salvar nova versão no banco de dados', 500)
    }
    await dbUpdate(db, 'work_instructions', instructionId, userId, {
      current_version: body.new_version,
      updated_at: updatedAt,
      updated_by: userId,
    })
  }

  // Memory (after D1 success or demo/no-db mode)
  currentVersion.is_current = false
  if (!tenant.workInstructionVersions) tenant.workInstructionVersions = []
  tenant.workInstructionVersions.push(newVersion)
  instruction.current_version = body.new_version
  instruction.updated_at = updatedAt
  instruction.updated_by = userId
  markTenantModified(userId)
  await logWorkInstructionEvent(db, userId, empresaId, instructionId, 'VERSION_CREATED', {
    versionBefore: currentVersion.version,
    versionAfter: body.new_version
  }, tenant)

  return ok(c, { instruction, version: newVersion })
})

// ── API: PUT /api/instructions/:id/status (Transition Status) ──
app.put('/api/instructions/:id/status', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const instructionId = c.req.param('id')
  const body = await c.req.json().catch(() => null)

  if (!body || !body.status) return err(c, 'Status é obrigatório')

  const instruction = (tenant.workInstructions || []).find((i: any) => i.id === instructionId)
  if (!instruction) return err(c, 'Instrução não encontrada', 404)

  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    draft: ['active'],
    active: ['obsolete', 'draft'],
    obsolete: [],
    archived: [],
  }

  const currentStatus = instruction.status || 'draft'
  const newStatus: string = body.status
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || []
  if (!allowed.includes(newStatus)) {
    return err(c, 'Transição de status inválida: ' + currentStatus + ' → ' + newStatus)
  }

  const oldStatus = instruction.status
  const updatedAt = new Date().toISOString()

  // Also look up current version for sync
  const currentVersion = (tenant.workInstructionVersions || []).find(
    (v: any) => v.instruction_id === instructionId && v.is_current
  )

  // D1 first
  if (db && userId !== 'demo-tenant') {
    const saved = await dbUpdate(db, 'work_instructions', instructionId, userId, {
      status: newStatus,
      updated_at: updatedAt,
    })
    if (!saved) {
      console.error(`[INSTRUCOES][STATUS][CRÍTICO] Falha ao atualizar status de ${instructionId} em D1`)
      return err(c, 'Erro ao salvar status no banco de dados', 500)
    }
    if (currentVersion) {
      await dbUpdate(db, 'work_instruction_versions', currentVersion.id, userId, { status: newStatus })
    }
  }

  // Memory (after D1 success or demo/no-db mode)
  instruction.status = newStatus
  instruction.updated_at = updatedAt
  instruction.updated_by = userId
  if (currentVersion) {
    currentVersion.status = newStatus
  }
  markTenantModified(userId)
  await logWorkInstructionEvent(db, userId, empresaId, instructionId, 'STATUS_CHANGED', {
    from: oldStatus,
    to: newStatus,
  }, tenant)

  return ok(c, { instruction })
})

// ── API: DELETE /api/instructions/:id (Deletar Instrução) ──
app.delete('/api/instructions/:id', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const instructionId = c.req.param('id')

  const idx = (tenant.workInstructions || []).findIndex((i: any) => i.id === instructionId)
  if (idx === -1) return err(c, 'Instrução não encontrada', 404)

  const instruction = tenant.workInstructions[idx]

  // Collect version/step IDs before removal for cascade cleanup
  const versionIds = (tenant.workInstructionVersions || [])
    .filter((v: any) => v.instruction_id === instructionId)
    .map((v: any) => v.id)
  const stepIds = (tenant.workInstructionSteps || [])
    .filter((s: any) => versionIds.includes(s.version_id))
    .map((s: any) => s.id)

  // Collect photos to delete from R2 before any mutations
  const photosToDelete = (tenant.workInstructionPhotos || []).filter((p: any) => stepIds.includes(p.step_id))

  // D1 first (cascade delete — use IN clauses to reduce round trips)
  if (db && userId !== 'demo-tenant') {
    if (stepIds.length > 0) {
      const stepPlaceholders = stepIds.map(() => '?').join(', ')
      await db.prepare('DELETE FROM work_instruction_photos WHERE step_id IN (' + stepPlaceholders + ') AND user_id = ?')
        .bind(...stepIds, userId).run()
      await db.prepare('DELETE FROM work_instruction_steps WHERE id IN (' + stepPlaceholders + ') AND user_id = ?')
        .bind(...stepIds, userId).run()
    }
    if (versionIds.length > 0) {
      const versionPlaceholders = versionIds.map(() => '?').join(', ')
      await db.prepare('DELETE FROM work_instruction_versions WHERE id IN (' + versionPlaceholders + ') AND user_id = ?')
        .bind(...versionIds, userId).run()
    }
    await db.prepare('DELETE FROM work_instructions WHERE id = ? AND user_id = ?').bind(instructionId, userId).run()
  }

  // Delete R2 objects for photos that have object_key
  const bucket = (c.env as any)?.INSTR_PHOTOS_BUCKET
  if (bucket) {
    for (const p of photosToDelete) {
      if (p.object_key) {
        try {
          await bucket.delete(p.object_key)
        } catch (e) {
          console.warn('[R2][DELETE] Falha ao remover objeto do R2:', (e as any)?.message)
        }
      }
    }
  }

  // Memory (after D1 success or demo/no-db mode)
  tenant.workInstructionPhotos = (tenant.workInstructionPhotos || []).filter((p: any) => !stepIds.includes(p.step_id))
  tenant.workInstructionSteps = (tenant.workInstructionSteps || []).filter((s: any) => !versionIds.includes(s.version_id))
  tenant.workInstructionVersions = (tenant.workInstructionVersions || []).filter((v: any) => v.instruction_id !== instructionId)
  tenant.workInstructions.splice(idx, 1)
  markTenantModified(userId)
  await logWorkInstructionEvent(db, userId, empresaId, instructionId, 'DELETED', { title: instruction.title }, tenant)

  return ok(c, { deleted: true })
})

// ── API: GET /api/instructions/:id/audit-log (Obter Histórico) ──
app.get('/api/instructions/:id/audit-log', async (c) => {
  const tenant = getCtxTenant(c)
  const instructionId = c.req.param('id')

  const auditLog = (tenant.workInstructionAuditLog || [])
    .filter((a: any) => a.instruction_id === instructionId)
    .sort((a: any, b: any) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime())

  return ok(c, { auditLog })
})

// ── API: GET /api/instructions (Listar todas) ──
app.get('/api/instructions', async (c) => {
  const tenant = getCtxTenant(c)
  const instructions = tenant.workInstructions || []
  return ok(c, { instructions })
})

// ── API: GET /api/instructions/:id (Obter detalhes) ──
app.get('/api/instructions/:id', async (c) => {
  const tenant = getCtxTenant(c)
  const instructionId = c.req.param('id')

  const instruction = (tenant.workInstructions || []).find((i: any) => i.id === instructionId)
  if (!instruction) return err(c, 'Instrução não encontrada', 404)

  const versions = (tenant.workInstructionVersions || []).filter((v: any) => v.instruction_id === instructionId)
  const currentVersion = versions.find((v: any) => v.is_current)
  const steps = (tenant.workInstructionSteps || []).filter((s: any) => s.version_id === currentVersion?.id)
  const photos = (tenant.workInstructionPhotos || []).filter((p: any) =>
    steps.some((s: any) => s.id === p.step_id)
  )

  return ok(c, { instruction, currentVersion, versions, steps, photos })
})

// ── UI: GET /api/report (Printable list of all work instructions) ─────────────
app.get('/api/report', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)

  const instructions = (tenant.workInstructions || [])
    .slice()
    .sort((a: any, b: any) => (a.code || '').localeCompare(b.code || ''))

  const statusLabel: Record<string, string> = { active: 'Ativo', draft: 'Rascunho', archived: 'Arquivado', obsolete: 'Obsoleto' }
  const statusColor: Record<string, string> = { active: '#27AE60', draft: '#6c757d', archived: '#95a5a6', obsolete: '#E67E22' }

  const generatedAt = new Date().toLocaleString('pt-BR')
  const empresa = userInfo?.empresa ?? ''

  const rowsHtml = instructions.map((i: any) => {
    const status = i.status || 'draft'
    const color = statusColor[status] || '#6c757d'
    const label = statusLabel[status] || status
    return `
      <tr>
        <td>${escapeHtml(i.code || '—')}</td>
        <td>${escapeHtml(i.title || '—')}</td>
        <td>${escapeHtml(i.description || '—')}</td>
        <td>v${escapeHtml(i.current_version || '1.0')}</td>
        <td><span style="background:${color};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${escapeHtml(label)}</span></td>
        <td style="font-size:11px;color:#6c757d;">${escapeHtml((i.updated_at || i.created_at || '').split('T')[0] || '—')}</td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Relatório de Instruções de Trabalho</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #333; font-size: 13px; }
    h1 { font-size: 18px; color: #1B4F72; margin-bottom: 4px; }
    .subtitle { font-size: 12px; color: #6c757d; margin-bottom: 16px; }
    .filters { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 8px 12px; font-size: 12px; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1B4F72; color: #fff; padding: 8px 10px; text-align: left; font-size: 12px; }
    td { padding: 7px 10px; border: 1px solid #ddd; font-size: 12px; vertical-align: top; }
    tr:nth-child(even) td { background: #f8f9fa; }
    .footer { margin-top: 28px; font-size: 11px; color: #999; border-top: 1px solid #e0e0e0; padding-top: 10px; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>Relatório de Instruções de Trabalho</h1>
  <div class="subtitle">${escapeHtml(empresa)} · Gerado em ${generatedAt}</div>
  <div class="filters"><strong>Total:</strong> ${instructions.length} instrução(ões)</div>
  <table>
    <thead>
      <tr>
        <th>Código</th>
        <th>Título</th>
        <th>Descrição</th>
        <th>Versão</th>
        <th>Status</th>
        <th>Atualizado em</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">PCPSyncrus · Relatório Instruções de Trabalho · ${generatedAt}</div>
  <script>window.onload = function(){ window.print(); }</script>
</body>
</html>`

  return c.html(html)
})

export default app
