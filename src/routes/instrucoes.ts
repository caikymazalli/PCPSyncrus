import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxUserId, getCtxEmpresaId } from '../sessionHelper'
import { ok, err, dbInsert, dbUpdate, dbDelete, genId } from '../dbHelpers'
import { markTenantModified, logWorkInstructionEvent } from '../userStore'

const app = new Hono()

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
          <tr data-search="${(inst.title || '').toLowerCase()} ${(inst.code || '').toLowerCase()} ${(inst.description || '').toLowerCase()}">
            <td><span class="badge badge-secondary">${inst.code || '—'}</span></td>
            <td>
              <div style="font-weight:700;color:#1B4F72;">${inst.title || '—'}</div>
              ${inst.description ? `<div style="font-size:11px;color:#6c757d;margin-top:2px;">${inst.description}</div>` : ''}
            </td>
            <td><span class="badge badge-secondary">v${inst.current_version || '1.0'}</span></td>
            <td><span class="badge badge-${inst.status === 'active' ? 'success' : 'secondary'}">${inst.status || 'draft'}</span></td>
            <td style="font-size:12px;color:#6c757d;">${inst.updated_at ? new Date(inst.updated_at).toLocaleDateString('pt-BR') : '—'}</td>
            <td>
              <div style="display:flex;gap:4px;">
                <button class="btn btn-secondary btn-sm" title="Visualizar" onclick="viewInstruction('${inst.id}')"><i class="fas fa-eye"></i></button>
                <button class="btn btn-secondary btn-sm" title="Editar"><i class="fas fa-edit"></i></button>
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
    if (modal) {
      modal.classList.add('open')
      console.log('[MODAL] Aberto:', id)
    }
  }

  function closeModal(id) {
    const modal = document.getElementById(id)
    if (modal) {
      modal.classList.remove('open')
      console.log('[MODAL] Fechado:', id)
    }
  }

  async function saveInstruction() {
    const code = document.getElementById('instrCode').value.trim()
    const title = document.getElementById('instrTitle').value.trim()
    const desc = document.getElementById('instrDesc').value.trim()

    if (!title) {
      alert('❌ Título é obrigatório')
      return
    }

    console.log('[INSTR] Salvando:', { code, title, desc })

    try {
      const res = await fetch('/instrucoes/api/instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, title, description: desc })
      })

      const data = await res.json()
      console.log('[INSTR] Response:', data)

      if (data.ok) {
        alert('✅ Instrução criada com sucesso!')
        document.getElementById('instrCode').value = ''
        document.getElementById('instrTitle').value = ''
        document.getElementById('instrDesc').value = ''
        closeModal('novaInstrucaoModal')
        setTimeout(() => location.reload(), 800)
      } else {
        alert('❌ Erro: ' + (data.error || 'Desconhecido'))
      }
    } catch (e) {
      console.error('[INSTR] Erro de conexão:', e)
      alert('❌ Erro de conexão: ' + e.message)
    }
  }

  function filterInstructions() {
    const searchValue = document.getElementById('searchInput').value.toLowerCase()
    const rows = document.querySelectorAll('#instructionsBody tr')
    
    rows.forEach(row => {
      const searchText = row.getAttribute('data-search') || ''
      if (searchText.includes(searchValue)) {
        row.style.display = ''
      } else {
        row.style.display = 'none'
      }
    })
  }

  function viewInstruction(id) {
    console.log('[INSTR] Visualizar:', id)
    alert('Função "Visualizar" em breve')
  }
  </script>
`
  function filterInstructions() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const rows = document.querySelectorAll('#instructionsBody tr');
    rows.forEach(row => {
      const text = row.dataset.search || '';
      row.style.display = !search || text.includes(search) ? '' : 'none';
    });
  }

  async function saveInstruction() {
    const title = document.getElementById('instrTitle').value.trim();
    const code = document.getElementById('instrCode').value.trim();
    const description = document.getElementById('instrDesc').value.trim();
    if (!title) { alert('Título é obrigatório'); return; }
    console.log('[Instruções] Salvando:', { title, code, description });
    const res = await fetch('/instrucoes/api/instructions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, code, description })
    });
    const data = await res.json();
    console.log('[Instruções] Resposta:', data);
    if (data.ok) { closeModal('novaInstrucaoModal'); location.reload(); }
    else { alert(data.error || 'Erro ao salvar'); }
  }

  async function viewInstruction(id) {
    const res = await fetch('/instrucoes/api/instructions/' + id);
    const data = await res.json();
    if (data.ok) { console.log('Instruction details:', data); }
  }
  <script>
`
  return c.html(layout('Instruções de Trabalho', content, 'instrucoes', userInfo))
})

// ── API: POST /api/instructions (Criar Instrução) ──
app.post('/api/instructions', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)

  if (!body || !body.title) return err(c, 'Título é obrigatório')

  const id = genId('instr')
  const versionId = genId('instrv')

  const instruction = {
    id,
    code: body.code || `INSTR-${Date.now()}`,
    title: body.title,
    description: body.description || '',
    current_version: '1.0',
    status: 'draft',
    created_at: new Date().toISOString(),
    created_by: userId,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  }

  const version = {
    id: versionId,
    instruction_id: id,
    version: '1.0',
    title: body.title,
    description: body.description || '',
    is_current: true,
    status: 'draft',
    created_at: new Date().toISOString(),
    created_by: userId,
  }

  // Memória
  if (!tenant.workInstructions) tenant.workInstructions = []
  if (!tenant.workInstructionVersions) tenant.workInstructionVersions = []
  tenant.workInstructions.push(instruction)
  tenant.workInstructionVersions.push(version)
  markTenantModified(userId)

  // D1
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'work_instructions', { ...instruction, user_id: userId, empresa_id: empresaId })
    await dbInsert(db, 'work_instruction_versions', { ...version, is_current: 1, user_id: userId, empresa_id: empresaId })
  }
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

  // Memória
  if (!tenant.workInstructionSteps) tenant.workInstructionSteps = []
  tenant.workInstructionSteps.push(step)
  markTenantModified(userId)

  // D1
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'work_instruction_steps', { ...step, user_id: userId, empresa_id: empresaId })
  }
  await logWorkInstructionEvent(db, userId, empresaId, instructionId, 'STEP_ADDED', {
    step_number: body.step_number,
    title: body.title
  }, tenant)

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

  const steps = tenant.workInstructionSteps || []
  const stepIdx = steps.findIndex((s: any) => s.id === stepId)
  if (stepIdx === -1) return err(c, 'Etapa não encontrada', 404)

  const oldStep = steps[stepIdx]
  steps[stepIdx] = {
    ...oldStep,
    title: body.title || oldStep.title,
    description: body.description !== undefined ? body.description : oldStep.description,
    observation: body.observation !== undefined ? body.observation : oldStep.observation,
  }
  markTenantModified(userId)

  // D1
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'work_instruction_steps', stepId, userId, {
      title: steps[stepIdx].title,
      description: steps[stepIdx].description,
      observation: steps[stepIdx].observation,
    })
  }
  await logWorkInstructionEvent(db, userId, empresaId, instructionId, 'STEP_EDITED', {
    stepId,
    whatChanged: Object.keys(body).filter((k: string) => body[k] !== undefined && body[k] !== oldStep[k])
  }, tenant)

  return ok(c, { step: steps[stepIdx] })
})

// ── API: DELETE /api/instructions/:id/steps/:stepId (Deletar Etapa) ──
app.delete('/api/instructions/:id/steps/:stepId', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const instructionId = c.req.param('id')
  const stepId = c.req.param('stepId')

  const steps = tenant.workInstructionSteps || []
  const stepIdx = steps.findIndex((s: any) => s.id === stepId)
  if (stepIdx === -1) return err(c, 'Etapa não encontrada', 404)

  const step = steps[stepIdx]
  steps.splice(stepIdx, 1)

  // Remover fotos associadas
  tenant.workInstructionPhotos = (tenant.workInstructionPhotos || []).filter((p: any) => p.step_id !== stepId)
  markTenantModified(userId)

  // D1
  if (db && userId !== 'demo-tenant') {
    await dbDelete(db, 'work_instruction_steps', stepId, userId)
    const photos = await db.prepare('SELECT id FROM work_instruction_photos WHERE step_id = ?').bind(stepId).all()
    for (const photo of photos.results || []) {
      await dbDelete(db, 'work_instruction_photos', (photo as any).id, userId)
    }
  }
  await logWorkInstructionEvent(db, userId, empresaId, instructionId, 'STEP_DELETED', {
    stepId,
    stepNumber: step.step_number,
    title: step.title
  }, tenant)

  return ok(c, { message: 'Etapa removida' })
})

// ── API: POST /api/instructions/:id/photos (Upload Foto) ──
app.post('/api/instructions/:id/photos', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const instructionId = c.req.param('id')
  const body = await c.req.json().catch(() => null)

  if (!body || !body.step_id || !body.photo_url) return err(c, 'Dados inválidos')

  const stepExists = (tenant.workInstructionSteps || []).find((s: any) => s.id === body.step_id)
  if (!stepExists) return err(c, 'Etapa não encontrada', 404)

  const photoId = genId('photo')
  const photo = {
    id: photoId,
    step_id: body.step_id,
    photo_url: body.photo_url,
    file_name: body.file_name || `photo_${photoId}.jpg`,
    uploaded_at: new Date().toISOString(),
    uploaded_by: userId,
  }

  // Memória
  if (!tenant.workInstructionPhotos) tenant.workInstructionPhotos = []
  tenant.workInstructionPhotos.push(photo)
  markTenantModified(userId)

  // D1
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'work_instruction_photos', { ...photo, user_id: userId, empresa_id: empresaId })
  }
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

  const photos = tenant.workInstructionPhotos || []
  const photoIdx = photos.findIndex((p: any) => p.id === photoId)
  if (photoIdx === -1) return err(c, 'Foto não encontrada', 404)

  const photo = photos[photoIdx]
  photos.splice(photoIdx, 1)
  markTenantModified(userId)

  // D1
  if (db && userId !== 'demo-tenant') {
    await dbDelete(db, 'work_instruction_photos', photoId, userId)
  }
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

  // Marcar versão anterior como não-atual
  currentVersion.is_current = false
  markTenantModified(userId)

  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'work_instruction_versions', currentVersion.id, userId, { is_current: 0 })
  }

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

  // Memória
  if (!tenant.workInstructionVersions) tenant.workInstructionVersions = []
  tenant.workInstructionVersions.push(newVersion)
  instruction.current_version = body.new_version
  instruction.updated_at = new Date().toISOString()
  instruction.updated_by = userId
  markTenantModified(userId)

  // D1
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'work_instruction_versions', { ...newVersion, is_current: 1, user_id: userId, empresa_id: empresaId })
    await dbUpdate(db, 'work_instructions', instructionId, userId, {
      current_version: body.new_version,
      updated_at: instruction.updated_at,
      updated_by: userId,
    })
  }
  await logWorkInstructionEvent(db, userId, empresaId, instructionId, 'VERSION_CREATED', {
    versionBefore: currentVersion.version,
    versionAfter: body.new_version
  }, tenant)

  return ok(c, { instruction, version: newVersion })
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

  // Remove from memory (cascade)
  tenant.workInstructionPhotos = (tenant.workInstructionPhotos || []).filter((p: any) => !stepIds.includes(p.step_id))
  tenant.workInstructionSteps = (tenant.workInstructionSteps || []).filter((s: any) => !versionIds.includes(s.version_id))
  tenant.workInstructionVersions = (tenant.workInstructionVersions || []).filter((v: any) => v.instruction_id !== instructionId)
  tenant.workInstructions.splice(idx, 1)
  markTenantModified(userId)

  // D1 (cascade delete — use IN clauses to reduce round trips)
  if (db && userId !== 'demo-tenant') {
    if (stepIds.length > 0) {
      const stepPlaceholders = stepIds.map(() => '?').join(', ')
      await db.prepare(`DELETE FROM work_instruction_photos WHERE step_id IN (${stepPlaceholders}) AND user_id = ?`)
        .bind(...stepIds, userId).run()
      await db.prepare(`DELETE FROM work_instruction_steps WHERE id IN (${stepPlaceholders}) AND user_id = ?`)
        .bind(...stepIds, userId).run()
    }
    if (versionIds.length > 0) {
      const versionPlaceholders = versionIds.map(() => '?').join(', ')
      await db.prepare(`DELETE FROM work_instruction_versions WHERE id IN (${versionPlaceholders}) AND user_id = ?`)
        .bind(...versionIds, userId).run()
    }
    await db.prepare('DELETE FROM work_instructions WHERE id = ? AND user_id = ?').bind(instructionId, userId).run()
  }
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

export default app

