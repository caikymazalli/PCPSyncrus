import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxUserId, getCtxEmpresaId, getCtxSession } from '../sessionHelper'
import { genId, dbInsert, dbUpdate, dbDelete, ok, err } from '../dbHelpers'
import { requireModuleWriteAccess } from '../moduleAccess'

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
}

function guessImageContentType(fileName: string, contentType?: string): string | null {
  if (contentType) {
    const ct = contentType.toLowerCase().split(';')[0].trim()
    if (Object.values(ALLOWED_IMAGE_TYPES).includes(ct)) return ct
  }
  const ext = (fileName.split('.').pop() || '').toLowerCase()
  return ALLOWED_IMAGE_TYPES[ext] || null
}

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_').slice(0, 200)
}

async function ensureAuthenticatedOr401(c: any): Promise<Response | null> {
  const session = getCtxSession(c)
  if (!session || session.isDemo) return c.json({ error: 'Não autenticado' }, 401)
  return null
}

const app = new Hono()

app.use('*', async (c, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    const blocked = await requireModuleWriteAccess(c, 'apontamento')
    if (blocked) return blocked
  }
  return next()
})

const NC_LIMIT = 3 // Limite padrão de unidades rejeitadas para gerar NC

// ── Helper: find route for a production order ────────────────────────────────
function findRouteForOrder(order: any, routes: any[]): any | null {
  if (!order || !routes || routes.length === 0) return null
  return routes.find(r =>
    (r.productId && order.productId && r.productId === order.productId) ||
    (r.productName && order.productName && r.productName === order.productName)
  ) || null
}

// ── Helper: compute step progress for an order ────────────────────────────────
function computeStepProgress(order: any, entries: any[], routes: any[]): { x: number; y: number } {
  const route = findRouteForOrder(order, routes)
  if (!route || !Array.isArray(route.steps) || route.steps.length === 0) return { x: 0, y: 0 }
  const orderEntries = entries.filter((e: any) => e.orderId === order.id)
  const doneSteps = new Set(orderEntries.map((e: any) => (e.stepName || '').trim()).filter(Boolean))
  const validSteps = route.steps.map((s: any) => (s.operation || s.name || '').trim()).filter(Boolean)
  const x = validSteps.filter(op => doneSteps.has(op)).length
  return { x, y: validSteps.length }
}

app.get('/', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const mockData = tenant  // per-session data
  const productionEntries = (mockData as any).productionEntries || []
  const productionOrders = (mockData as any).productionOrders || []
  const nonConformances = (mockData as any).nonConformances || []
  const routes = (mockData as any).routes || []
  const activeOrders = productionOrders.filter((o: any) => o.status === 'in_progress' || o.status === 'planned')
  const completedOrders = productionOrders.filter((o: any) => o.status === 'completed')

  const content = `
  <!-- NC Alert Modal for critical rejections -->
  <div id="ncAlertModal" class="modal-overlay" style="z-index:200;">
    <div class="modal" style="max-width:500px;border-top:4px solid #E74C3C;">
      <div style="padding:24px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="width:48px;height:48px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-exclamation-triangle" style="color:#E74C3C;font-size:22px;"></i>
          </div>
          <div>
            <div style="font-size:16px;font-weight:700;color:#E74C3C;">Limite de Rejeição Atingido!</div>
            <div style="font-size:13px;color:#6c757d;">Uma Não Conformidade será gerada automaticamente</div>
          </div>
        </div>
        <div id="ncAlertBody" style="background:#fef2f2;border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;color:#374151;"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-secondary" onclick="closeModal('ncAlertModal')">Fechar</button>
          <button class="btn btn-danger" onclick="openNCForm()"><i class="fas fa-clipboard-check"></i> Preencher NC Agora</button>
        </div>
      </div>
    </div>
  </div>

  <!-- New Apontamento Modal -->
  <div id="novoApontamentoModal" class="modal-overlay">
    <div class="modal" style="max-width:640px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:16px;font-weight:700;color:#1B4F72;"><i class="fas fa-check-square" style="margin-right:8px;color:#27AE60;"></i>Novo Apontamento</h3>
        <button onclick="closeModal('novoApontamentoModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div class="form-group">
          <label class="form-label">Ordem de Produção *</label>
          <select class="form-control" id="apt_ordem" onchange="updateOrderInfo()">
            <option value="">Selecionar ordem...</option>
            ${activeOrders.map((o: any) => `<option value="${o.id}" data-code="${o.code}" data-product="${o.productName}" data-productid="${o.productId || ''}" data-qty="${o.quantity}" data-completed="${o.completedQuantity || 0}">${o.code} — ${o.productName}</option>`).join('')}
          </select>
        </div>
        <div id="orderInfoCard" style="display:none;background:#f0f7ff;border:1px solid #bee3f8;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#374151;">Qtd Planejada: <strong id="infoQty">-</strong></span>
            <span style="color:#374151;">Já Produzida: <strong id="infoCompleted">-</strong></span>
            <span style="color:#374151;">Saldo: <strong id="infoBalance" style="color:#E67E22;">-</strong></span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Etapa / Operação</label>
            <select class="form-control" id="apt_etapa" disabled>
              <option value="">Selecione a OP primeiro...</option>
            </select>
            <div id="apt_etapa_hint" style="display:none;font-size:11px;color:#d97706;margin-top:4px;"><i class="fas fa-info-circle" style="margin-right:4px;"></i>Cadastre um roteiro para este produto em Engenharia &gt; Roteiros.</div>
          </div>
          <div class="form-group">
            <label class="form-label">Operador *</label>
            <select class="form-control" id="apt_operador">
              ${mockData.users.map(u => `<option value="${u.name}">${u.name} (${u.role})</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Campo Nº Série / Lote (visível somente quando produto exige controle) -->
        <div id="serialLoteGroup" style="display:none;background:#f5f3ff;border:1.5px solid #c4b5fd;border-radius:8px;padding:12px 14px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <i class="fas fa-barcode" style="color:#7c3aed;font-size:16px;"></i>
            <span style="font-size:13px;font-weight:700;color:#7c3aed;" id="serialLoteLabel">Número de Série / Lote *</span>
            <span class="badge" style="background:#ede9fe;color:#7c3aed;font-size:10px;" id="serialLoteTypeBadge">Série</span>
          </div>
          <div style="font-size:11px;color:#6c757d;margin-bottom:8px;" id="serialLoteHint">
            O produto desta ordem requer controle por número de série. Informe o número de série da(s) unidade(s) produzida(s).
          </div>
          <input class="form-control" id="apt_serial" type="text" placeholder="Ex: SN-EXT-0035" style="border-color:#c4b5fd;">
          <div style="font-size:11px;color:#7c3aed;margin-top:6px;"><i class="fas fa-info-circle" style="margin-right:3px;"></i>Para múltiplas séries, separe por vírgula (ex: SN-001, SN-002). Para lote, informe o número do lote e a quantidade total.</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Qtd Produzida *</label>
            <input class="form-control" id="apt_produzida" type="number" min="0" placeholder="0" oninput="checkNCLimit()">
          </div>
          <div class="form-group">
            <label class="form-label">
              Qtd Rejeitada
              <span id="ncLimitBadge" style="display:none;" class="badge badge-danger" title="Tooltip">Limite: ${NC_LIMIT}</span>
            </label>
            <input class="form-control" id="apt_rejeitada" type="number" min="0" placeholder="0" oninput="checkNCLimit()" style="border-color:#d1d5db;">
          </div>
          <div class="form-group">
            <label class="form-label">Tempo (min)</label>
            <input class="form-control" id="apt_tempo" type="number" min="0" placeholder="0">
          </div>
        </div>

        <!-- NC Warning inline -->
        <div id="ncWarningInline" style="display:none;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:#991b1b;">
          <i class="fas fa-exclamation-circle" style="margin-right:6px;"></i>
          <strong>Atenção:</strong> Quantidade rejeitada ≥ limite (${NC_LIMIT} un). Uma NC será gerada automaticamente ao salvar.
        </div>

        <!-- Upload de Imagens -->
        <div class="form-group">
          <label class="form-label"><i class="fas fa-images" style="margin-right:6px;color:#6c757d;"></i>Imagens de Evidência</label>
          <div id="imageUploadArea" style="border:2px dashed #d1d5db;border-radius:8px;padding:20px;text-align:center;cursor:pointer;transition:all 0.2s;" onclick="document.getElementById('apt_images').click()" ondragover="event.preventDefault();this.style.borderColor='#2980B9'" ondragleave="this.style.borderColor='#d1d5db'" ondrop="handleImageDrop(event)">
            <i class="fas fa-cloud-upload-alt" style="font-size:28px;color:#9ca3af;margin-bottom:8px;"></i>
            <div style="font-size:13px;color:#6c757d;">Clique para selecionar ou arraste as imagens aqui</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:4px;">Múltiplos arquivos • JPG, PNG, WEBP • Máx 5MB cada</div>
          </div>
          <input type="file" id="apt_images" multiple accept="image/*" style="display:none;" onchange="previewImages(event)">
          <!-- Camera Button -->
          <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px;width:100%;" onclick="capturePhoto()" title="Abrir câmera para foto">
            <i class="fas fa-camera"></i> Tirar Foto (Câmera)
          </button>
          <input type="file" id="apt_camera" accept="image/*" capture="environment" style="display:none;" onchange="previewImages(event)">
          <!-- Image preview grid -->
          <div id="imagePreviewGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;margin-top:10px;"></div>
        </div>

        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="apt_obs" rows="2" placeholder="Ocorrências, desvios, melhorias..."></textarea>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
          <button class="btn btn-secondary" onclick="closeModal('novoApontamentoModal')">Cancelar</button>
          <button class="btn btn-success" onclick="saveApontamento()"><i class="fas fa-check"></i> Salvar Apontamento</button>
        </div>
      </div>
    </div>
  </div>

  <!-- NC Form Modal (triggered after save with rejection) -->
  <div id="ncFormModal" class="modal-overlay" style="z-index:210;">
    <div class="modal" style="max-width:580px;border-top:4px solid #E74C3C;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:16px;font-weight:700;color:#E74C3C;"><i class="fas fa-clipboard-check" style="margin-right:8px;"></i>Registrar Não Conformidade</h3>
        <button onclick="closeModal('ncFormModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div id="ncFormInfo" style="background:#fef2f2;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Severidade *</label>
            <select class="form-control" id="nc_severidade">
              <option value="low">Baixa</option>
              <option value="medium" selected>Média</option>
              <option value="high">Alta</option>
              <option value="critical">Crítica</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Responsável pela Análise</label>
            <select class="form-control" id="nc_responsavel">
              ${mockData.users.filter(u => u.role === 'qualidade' || u.role === 'admin').map(u => `<option value="${u.name}">${u.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Descrição da NC *</label>
          <textarea class="form-control" id="nc_descricao" rows="3" placeholder="Descreva detalhadamente o defeito encontrado, dimensões, localização na peça..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Causa Raiz (Preliminar)</label>
          <input class="form-control" id="nc_causa" type="text" placeholder="Ex: Desgaste de ferramenta, configuração incorreta...">
        </div>
        <div class="form-group">
          <label class="form-label">Ação Corretiva Proposta</label>
          <input class="form-control" id="nc_acao" type="text" placeholder="Ex: Substituição de ferramenta, re-setup de máquina...">
        </div>

        <!-- NC Images Upload -->
        <div class="form-group">
          <label class="form-label"><i class="fas fa-images" style="margin-right:6px;color:#6c757d;"></i>Evidências Fotográficas da NC</label>
          <div style="border:2px dashed #fca5a5;border-radius:8px;padding:16px;text-align:center;cursor:pointer;" onclick="document.getElementById('nc_images').click()">
            <i class="fas fa-camera" style="font-size:24px;color:#ef4444;margin-bottom:6px;"></i>
            <div style="font-size:13px;color:#6c757d;">Adicionar fotos da não conformidade</div>
          </div>
          <input type="file" id="nc_images" multiple accept="image/*" style="display:none;" onchange="previewNCImages(event)">
          <button type="button" class="btn btn-secondary btn-sm" style="margin-top:6px;width:100%;" onclick="captureNCPhoto()">
            <i class="fas fa-camera"></i> Fotografar com Câmera
          </button>
          <input type="file" id="nc_camera" accept="image/*" capture="environment" style="display:none;" onchange="previewNCImages(event)">
          <div id="ncImagePreviewGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;margin-top:8px;"></div>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-secondary" onclick="closeModal('ncFormModal')">Pular NC por Agora</button>
          <button class="btn btn-danger" onclick="saveNC()"><i class="fas fa-save"></i> Registrar NC</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Detalhe Apontamento Modal -->
  <div id="detalheApontamentoModal" class="modal-overlay">
    <div class="modal" style="max-width:600px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:16px;font-weight:700;color:#1B4F72;"><i class="fas fa-eye" style="margin-right:8px;color:#2980B9;"></i>Detalhes do Apontamento</h3>
        <button onclick="closeModal('detalheApontamentoModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;" id="detalheApontamentoBody">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Ordem / OP</div>
            <div style="font-size:14px;font-weight:700;color:#1B4F72;" id="det_orderCode">—</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Etapa</div>
            <div style="font-size:14px;color:#374151;" id="det_stepName">—</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Operador</div>
            <div style="font-size:14px;color:#374151;" id="det_operator">—</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Tempo (min)</div>
            <div style="font-size:14px;color:#374151;" id="det_timeSpent">—</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Qtd Produzida</div>
            <div style="font-size:14px;font-weight:700;color:#27AE60;" id="det_produced">—</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Qtd Rejeitada</div>
            <div style="font-size:14px;font-weight:700;" id="det_rejected">—</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Índice de Qualidade</div>
            <div style="font-size:14px;font-weight:700;" id="det_quality">—</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">NC</div>
            <div style="font-size:14px;color:#374151;" id="det_nc">—</div>
          </div>
          <div style="grid-column:1/-1;">
            <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Data / Hora</div>
            <div style="font-size:14px;color:#374151;" id="det_recordedAt">—</div>
          </div>
          <div style="grid-column:1/-1;" id="det_notesRow">
            <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Observação</div>
            <div style="font-size:13px;color:#374151;background:#f8f9fa;border-radius:6px;padding:10px;" id="det_notes">—</div>
          </div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="closeModal('detalheApontamentoModal')">Fechar</button>
      </div>
    </div>
  </div>

  <!-- Header -->
  <div class="section-header">
    <div>
      <div style="font-size:14px;color:#6c757d;">Registro de Apontamentos de Produção</div>
      <div style="display:flex;gap:10px;margin-top:6px;flex-wrap:wrap;">
        <span class="badge badge-info"><i class="fas fa-circle" style="font-size:8px;"></i> ${activeOrders.length} Ordens Ativas</span>
        <span class="badge badge-secondary"><i class="fas fa-list" style="font-size:8px;"></i> ${productionEntries.length} Apontamentos</span>
        <span class="badge badge-danger"><i class="fas fa-exclamation-triangle" style="font-size:8px;"></i> ${mockData.nonConformances.filter(n => n.status === 'open').length} NCs Abertas</span>
      </div>
    </div>
    <div style="display:flex;gap:8px;">
      <a href="/qualidade" class="btn btn-secondary" title="Ir para Qualidade / NCs">
        <i class="fas fa-clipboard-check"></i> Ver NCs
      </a>
      <button class="btn btn-primary" onclick="openModal('novoApontamentoModal')">
        <i class="fas fa-plus"></i> Novo Apontamento
      </button>
    </div>
  </div>

  <!-- NC Limit Config Banner -->
  <div class="card" style="padding:12px 20px;margin-bottom:16px;background:linear-gradient(135deg,#fef2f2,#fff);">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <i class="fas fa-shield-alt" style="color:#E74C3C;font-size:18px;"></i>
      <div style="flex:1;">
        <span style="font-size:13px;font-weight:700;color:#374151;">Controle Automático de NC</span>
        <span style="font-size:12px;color:#6c757d;margin-left:8px;">NC gerada automaticamente quando rejeições ≥ limite configurado</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <label style="font-size:12px;color:#374151;font-weight:600;">Limite NC:</label>
        <input type="number" id="ncLimitInput" value="${NC_LIMIT}" min="1" max="99" style="width:60px;padding:4px 8px;border:1.5px solid #d1d5db;border-radius:6px;font-size:13px;text-align:center;">
        <button class="btn btn-primary btn-sm" onclick="alert('Limite atualizado para ' + document.getElementById('ncLimitInput').value + ' unidades!')">Salvar</button>
      </div>
    </div>
  </div>

  <!-- Active Orders Cards -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-bottom:24px;">
    ${activeOrders.slice(0, 4).map((o: any) => {
      const progress = o.quantity > 0 ? Math.round(((o.completedQuantity || 0) / o.quantity) * 100) : 0
      const priorityColors: Record<string, string> = { urgent: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#65a30d' }
      const priorityLabel: Record<string, string> = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' }
      const { x, y } = computeStepProgress(o, productionEntries, routes)
      const stepBadge = y > 0
        ? `<span style="font-size:11px;font-weight:700;color:${x >= y ? '#27AE60' : '#3498DB'};background:${x >= y ? '#f0fdf4' : '#eff6ff'};border-radius:12px;padding:2px 8px;border:1px solid ${x >= y ? '#bbf7d0' : '#bfdbfe'};"><i class="fas fa-tasks" style="margin-right:3px;"></i>${x}/${y} etapas</span>`
        : ''
      return `
      <div class="card" style="padding:16px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
          <div>
            <div style="font-size:14px;font-weight:700;color:#1B4F72;">${o.code}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${o.productName}</div>
            ${o.cliente ? `<div style="font-size:11px;color:#6c757d;margin-top:2px;"><i class="fas fa-user" style="margin-right:4px;"></i>${o.cliente}</div>` : ''}
          </div>
          <span class="badge ${o.status === 'in_progress' ? 'badge-info' : 'badge-primary'}">${o.status === 'in_progress' ? 'Em Progresso' : 'Planejada'}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:12px;color:#6c757d;">Progresso</span>
          <span style="font-size:12px;font-weight:700;color:${progress >= 100 ? '#27AE60' : '#3498DB'};">${o.completedQuantity || 0}/${o.quantity} un • ${progress}%</span>
        </div>
        <div class="progress-bar" style="margin-bottom:8px;">
          <div class="progress-fill" style="width:${progress}%;background:${progress >= 100 ? '#27AE60' : '#3498DB'};"></div>
        </div>
        ${y > 0 ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">${stepBadge}</div>` : '<div style="margin-bottom:10px;"></div>'}
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
          <span style="font-size:11px;color:#9ca3af;">${o.plantName || ''}</span>
          <span style="font-size:11px;font-weight:700;color:${priorityColors[o.priority] || '#d97706'};">● ${priorityLabel[o.priority] || 'Média'}</span>
        </div>
        <button class="btn btn-primary btn-sm" style="width:100%;" onclick="startTracking('${o.id}','${o.code}')" title="Registrar apontamento para esta ordem">
          <i class="fas fa-check"></i> Realizar Apontamento
        </button>
      </div>`
    }).join('')}
    ${completedOrders.slice(0, 2).map((o: any) => {
      const { x, y } = computeStepProgress(o, productionEntries, routes)
      return `
      <div class="card" style="padding:16px;border-top:3px solid #27AE60;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
          <div>
            <div style="font-size:14px;font-weight:700;color:#1B4F72;">${o.code}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${o.productName}</div>
          </div>
          <span class="badge" style="background:#d1fae5;color:#065f46;">✓ Concluída</span>
        </div>
        ${y > 0 ? `<div style="margin-bottom:10px;"><span style="font-size:11px;font-weight:700;color:#27AE60;background:#f0fdf4;border-radius:12px;padding:2px 8px;border:1px solid #bbf7d0;"><i class="fas fa-tasks" style="margin-right:3px;"></i>${x}/${y} etapas</span></div>` : ''}
        <a href="/apontamento/relatorio/${o.id}" class="btn btn-success btn-sm" style="width:100%;display:block;text-align:center;" title="Gerar relatório de apontamentos">
          <i class="fas fa-file-alt"></i> Relatório de Apontamentos
        </a>
      </div>`
    }).join('')}
  </div>

  <!-- Apontamentos Table -->
  <div class="card" style="overflow:hidden;">
    <div style="padding:16px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
      <h4 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-history" style="margin-right:8px;"></i>Histórico de Apontamentos</h4>
      <div style="display:flex;gap:8px;">
        <select class="form-control" style="width:auto;font-size:12px;">
          <option>Todos os operadores</option>
          ${mockData.users.filter(u => u.role === 'operador').map(u => `<option>${u.name}</option>`).join('')}
        </select>
        <button class="btn btn-secondary btn-sm" onclick="alert('Exportando CSV...')" title="Exportar histórico">
          <i class="fas fa-download"></i>
        </button>
      </div>
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Ordem</th><th>Etapa</th><th>Qtd Produzida</th><th>Qtd Rejeitada</th><th>Índice Q.</th><th>Tempo (min)</th><th>Operador</th><th>NC</th><th>Data</th><th>Ações</th>
        </tr></thead>
        <tbody>
          ${productionEntries.map((e, _aptIdx) => {
            const qtyProduced = (e as any).quantityProduced ?? (e as any).produced ?? null
            const qtyRejected = (e as any).quantityRejected ?? (e as any).rejected ?? 0
            const dateStr = (e as any).recordedAt || (e as any).createdAt || '—'
            const operatorName: string = (e as any).operator || ''
            const avatarLetters = operatorName.split(' ').map(n => n[0] || '').join('').slice(0, 2) || '?'
            const quality = qtyRejected && qtyProduced
              ? Math.round(((qtyProduced - qtyRejected) / qtyProduced) * 100)
              : 100
            const qColor = quality >= 99 ? '#27AE60' : quality >= 95 ? '#F39C12' : '#E74C3C'
            return `
            <tr>
              <td style="font-weight:700;color:#1B4F72;">${e.orderCode}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="width:8px;height:8px;border-radius:50%;background:#27AE60;"></div>
                  <span style="font-weight:500;">${e.stepName || 'Produção Geral'}</span>
                </div>
              </td>
              <td style="font-weight:600;">${qtyProduced != null ? qtyProduced : '—'}</td>
              <td style="color:${qtyRejected > 0 ? '#E74C3C' : '#6c757d'};font-weight:${qtyRejected > 0 ? '700' : '400'};">${qtyRejected}</td>
              <td><span style="color:${qColor};font-weight:700;">${quality}%</span></td>
              <td>${e.timeSpent != null ? e.timeSpent : '—'} min</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;">
                  <div class="avatar" style="width:26px;height:26px;font-size:10px;background:#2980B9;">${avatarLetters}</div>
                  <span style="font-size:12px;">${operatorName || '—'}</span>
                </div>
              </td>
              <td>
                ${(e as any).ncGenerated
                  ? `<span class="badge badge-danger" title="NC registrada para este apontamento"><i class="fas fa-exclamation-triangle"></i> NC</span>`
                  : `<span class="badge badge-secondary">—</span>`
                }
              </td>
              <td style="color:#6c757d;font-size:12px;">${dateStr}</td>
              <td>
                <div style="display:flex;gap:4px;">
                  <button class="btn btn-secondary btn-sm" onclick="viewApontamento(${_aptIdx})" title="Ver detalhes">
                    <i class="fas fa-eye"></i>
                  </button>
                  ${qtyRejected > 0 && !(e as any).ncGenerated
                    ? `<button class="btn btn-warning btn-sm" onclick="openNCFromEntry('${e.orderCode}','${e.stepName || 'Produção Geral'}','${qtyRejected}')" title="Gerar NC para este apontamento"><i class="fas fa-clipboard-check"></i></button>`
                    : ''
                  }
                </div>
              </td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- NC Summary Card -->
  <div class="card" style="margin-top:16px;padding:20px;">
    <h4 style="margin:0 0 16px;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-clipboard-check" style="margin-right:8px;color:#E74C3C;"></i>Não Conformidades Recentes</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
      ${mockData.nonConformances.map(nc => {
        const sevColor: Record<string, string> = { low: '#65a30d', medium: '#d97706', high: '#ea580c', critical: '#dc2626' }
        const sevLabel: Record<string, string> = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' }
        const stColor: Record<string, string> = { open: '#E74C3C', in_analysis: '#F39C12', closed: '#27AE60' }
        const stLabel: Record<string, string> = { open: 'Aberta', in_analysis: 'Em Análise', closed: 'Encerrada' }
        return `
        <div style="border:1px solid #e9ecef;border-radius:8px;padding:14px;border-left:3px solid ${sevColor[nc.severity]};">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="font-size:13px;font-weight:700;color:#1B4F72;">${nc.code}</span>
            <span class="badge" style="background:${stColor[nc.status]}20;color:${stColor[nc.status]};">${stLabel[nc.status]}</span>
          </div>
          <div style="font-size:12px;color:#374151;margin-bottom:4px;">${nc.description}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
            <span style="font-size:11px;color:#6c757d;"><i class="fas fa-clipboard-list" style="margin-right:3px;"></i>${nc.orderCode}</span>
            <span style="font-size:11px;color:${sevColor[nc.severity]};font-weight:600;"><i class="fas fa-exclamation-circle" style="margin-right:3px;"></i>${sevLabel[nc.severity]}</span>
            <span style="font-size:11px;color:#6c757d;">${nc.quantityRejected} un rejeitadas</span>
          </div>
          <div style="margin-top:8px;display:flex;gap:6px;">
            <a href="/qualidade" class="btn btn-secondary btn-sm" title="Abrir tratamento desta NC"><i class="fas fa-arrow-right"></i> Tratar</a>
          </div>
        </div>`
      }).join('')}
    </div>
    <div style="text-align:center;margin-top:12px;">
      <a href="/qualidade" class="btn btn-secondary">
        <i class="fas fa-clipboard-list"></i> Ver Todas as NCs no Módulo de Qualidade
      </a>
    </div>
  </div>

  <script>
  let pendingNCData = null;
  let selectedImages = [];
  let selectedNCImages = [];
  const NC_LIMIT = parseInt(document.getElementById('ncLimitInput').value) || 3;

  // Snapshot of production entries for the view-details modal.
  // Supports both legacy demo-data keys (quantityProduced/quantityRejected/recordedAt)
  // and API-created entry keys (produced/rejected/createdAt).
  const productionEntriesData = ${JSON.stringify(productionEntries.map((e: any) => ({
    id: e.id || '',
    orderCode: e.orderCode || '',
    stepName: e.stepName || '',
    operator: e.operator || '',
    quantityProduced: e.quantityProduced ?? e.produced ?? null,
    quantityRejected: e.quantityRejected ?? e.rejected ?? null,
    timeSpent: e.timeSpent ?? null,
    ncGenerated: !!e.ncGenerated,
    recordedAt: e.recordedAt || e.createdAt || '',
    notes: e.notes || '',
  })))};

  // Products data with serial control info
  const productsSerialData = ${JSON.stringify(mockData.products.map((p: any) => ({
    code: p.code,
    name: p.productName || p.name,
    serialControlled: p.serialControlled || false,
    controlType: p.controlType || null
  })))};

  // Routes data keyed for quick lookup (productId -> steps)
  const allRoutesData = ${JSON.stringify(routes.map((r: any) => ({
    productId: r.productId || '',
    productName: r.productName || '',
    steps: (r.steps || []).map((s: any) => (s.operation || s.name || '').trim()).filter((op: string) => op !== ''),
  })))};

  function _findRouteStepsForOrder(productId, productName) {
    const route = allRoutesData.find(r =>
      (r.productId && productId && r.productId === productId) ||
      (r.productName && productName && r.productName === productName)
    );
    return route ? route.steps : null;
  }

  function updateOrderInfo() {
    const sel = document.getElementById('apt_ordem');
    const opt = sel.options[sel.selectedIndex];
    const card = document.getElementById('orderInfoCard');
    if (opt.value) {
      const qty = opt.dataset.qty;
      const completed = opt.dataset.completed;
      const balance = qty - completed;
      document.getElementById('infoQty').textContent = qty + ' un';
      document.getElementById('infoCompleted').textContent = completed + ' un';
      document.getElementById('infoBalance').textContent = balance + ' un';
      card.style.display = 'block';
      // Check serial control for product of this order
      const productName = opt.dataset.product || '';
      checkSerialRequirement(productName);
      // Populate steps select from route
      _populateStepsSelect(opt.dataset.productid || '', productName);
    } else {
      card.style.display = 'none';
      document.getElementById('serialLoteGroup').style.display = 'none';
      _populateStepsSelect('', '');
    }
  }

  function _populateStepsSelect(productId, productName) {
    const sel = document.getElementById('apt_etapa');
    const hint = document.getElementById('apt_etapa_hint');
    const steps = _findRouteStepsForOrder(productId, productName);
    sel.innerHTML = '';
    if (steps && steps.length > 0) {
      sel.disabled = false;
      hint.style.display = 'none';
      steps.forEach(function(op) {
        const o = document.createElement('option');
        o.value = op;
        o.textContent = op;
        sel.appendChild(o);
      });
    } else if (productId || productName) {
      // OP selected but no route
      sel.disabled = true;
      hint.style.display = 'block';
      const o = document.createElement('option');
      o.value = '';
      o.textContent = 'Sem roteiro cadastrado';
      sel.appendChild(o);
    } else {
      // No OP selected
      sel.disabled = true;
      hint.style.display = 'none';
      const o = document.createElement('option');
      o.value = '';
      o.textContent = 'Selecione a OP primeiro...';
      sel.appendChild(o);
    }
  }

  function checkSerialRequirement(productName) {
    // Match by product name (in production orders, product name is used, not code)
    const prod = productsSerialData.find(p => p.name === productName || p.code === productName);
    const group = document.getElementById('serialLoteGroup');
    if (prod && prod.serialControlled) {
      group.style.display = 'block';
      const isLote = prod.controlType === 'lote';
      document.getElementById('serialLoteTypeBadge').textContent = isLote ? 'Lote' : 'Série';
      document.getElementById('serialLoteTypeBadge').style.background = isLote ? '#fef3c7' : '#ede9fe';
      document.getElementById('serialLoteTypeBadge').style.color = isLote ? '#d97706' : '#7c3aed';
      document.getElementById('serialLoteLabel').textContent = isLote ? 'Número do Lote *' : 'Número(s) de Série *';
      document.getElementById('apt_serial').placeholder = isLote ? 'Ex: LT-2024-001' : 'Ex: SN-EXT-0035';
      if (isLote) {
        document.getElementById('serialLoteHint').textContent = 'O produto desta ordem requer controle por lote. Informe o número do lote — a quantidade será somada ao total do lote informado.';
      } else {
        document.getElementById('serialLoteHint').textContent = 'O produto desta ordem requer controle por número de série. Informe o(s) número(s) de série da(s) unidade(s) produzida(s). Para múltiplas séries, separe por vírgula.';
      }
    } else {
      group.style.display = 'none';
    }
  }

  function checkNCLimit() {
    const rejected = parseInt(document.getElementById('apt_rejeitada').value) || 0;
    const limit = parseInt(document.getElementById('ncLimitInput').value) || 3;
    const badge = document.getElementById('ncLimitBadge');
    const warn = document.getElementById('ncWarningInline');
    const field = document.getElementById('apt_rejeitada');
    badge.style.display = rejected > 0 ? 'inline-flex' : 'none';
    if (rejected >= limit) {
      warn.style.display = 'block';
      field.style.borderColor = '#E74C3C';
    } else {
      warn.style.display = 'none';
      field.style.borderColor = '#d1d5db';
    }
  }

  function startTracking(orderId, orderCode) {
    const sel = document.getElementById('apt_ordem');
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === orderId) {
        sel.selectedIndex = i;
        break;
      }
    }
    updateOrderInfo();
    openModal('novoApontamentoModal');
  }

  function previewImages(event) {
    const files = Array.from(event.target.files);
    addToPreview(files, 'imagePreviewGrid', selectedImages);
  }

  function handleImageDrop(event) {
    event.preventDefault();
    document.getElementById('imageUploadArea').style.borderColor = '#d1d5db';
    const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    addToPreview(files, 'imagePreviewGrid', selectedImages);
  }

  function capturePhoto() {
    document.getElementById('apt_camera').click();
  }

  function captureNCPhoto() {
    document.getElementById('nc_camera').click();
  }

  function previewNCImages(event) {
    const files = Array.from(event.target.files);
    addToPreview(files, 'ncImagePreviewGrid', selectedNCImages);
  }

  function addToPreview(files, gridId, arr) {
    const grid = document.getElementById(gridId);
    files.forEach(file => {
      arr.push(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const div = document.createElement('div');
        div.style.cssText = 'position:relative;';
        div.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:80px;object-fit:cover;border-radius:6px;border:1px solid #e9ecef;">' +
          '<button onclick="removeImage(this)" style="position:absolute;top:2px;right:2px;background:#E74C3C;color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">×</button>';
        grid.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeImage(btn) {
    btn.parentElement.remove();
  }

  // ── Image upload helper ───────────────────────────────────────────────────
  async function uploadImages(files, refType) {
    const ids = [];
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('ref_type', refType);
        const res = await fetch('/apontamento/api/upload-image', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.ok && data.image?.id) ids.push(data.image.id);
      } catch(e) { console.error('[uploadImages] falha ao enviar imagem:', e); /* continua – imagens são evidências, não bloqueiam o salvamento */ }
    }
    return ids;
  }

  async function saveApontamento() {
    const ordemSel = document.getElementById('apt_ordem');
    const orderId = ordemSel.value;
    if (!orderId) { showToast('Selecione a ordem de produção!', 'error'); return; }

    const opt = ordemSel.options[ordemSel.selectedIndex];
    const orderCode = opt.dataset.code || '';
    const productName = opt.dataset.product || '';
    const productId = opt.dataset.productid || '';

    const produzida = parseInt(document.getElementById('apt_produzida').value) || 0;
    const rejeitada = parseInt(document.getElementById('apt_rejeitada').value) || 0;
    const limit = parseInt(document.getElementById('ncLimitInput').value) || 3;
    const etapaEl = document.getElementById('apt_etapa');
    const etapa = etapaEl.value || '';
    const operador = document.getElementById('apt_operador').value;
    const tempo = parseInt(document.getElementById('apt_tempo').value) || 0;
    const notes = document.getElementById('apt_obs').value || '';

    if (produzida === 0) { showToast('Informe a quantidade produzida!', 'error'); return; }

    // Validate step is selected when route exists
    const routeSteps = _findRouteStepsForOrder(productId, productName);
    if (routeSteps && routeSteps.length > 0 && !etapa) {
      showToast('Selecione a etapa/operação!', 'error');
      etapaEl.focus();
      return;
    }

    // Validate serial/lote if required
    const serialGroup = document.getElementById('serialLoteGroup');
    if (serialGroup.style.display !== 'none') {
      const serialVal = document.getElementById('apt_serial').value.trim();
      if (!serialVal) {
        document.getElementById('apt_serial').style.borderColor = '#E74C3C';
        const label = document.getElementById('serialLoteLabel').textContent.replace(' *', '');
        showToast('⚠ ' + label + ' é obrigatório para este produto!', 'error');
        document.getElementById('apt_serial').focus();
        return;
      }
    }

    try {
      const imageIds = await uploadImages(selectedImages, 'apt');
      const res = await fetch('/apontamento/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId, orderCode, productName, operator: operador,
          stepName: etapa, produced: produzida, rejected: rejeitada,
          timeSpent: tempo, notes, shift: 'manha',
          startTime: new Date().toISOString(), endTime: new Date().toISOString(),
          imageIds,
        })
      });
      const data = await res.json();
      if (!data.ok) { showToast(data.error || 'Erro ao salvar', 'error'); return; }

      // Trigger NC flow if rejection threshold is reached
      if (rejeitada >= limit) {
        pendingNCData = { orderCode, etapa, rejeitada, operador, produzida, apontamentoId: data.entry?.id };
        closeModal('novoApontamentoModal');
        document.getElementById('ncFormInfo').innerHTML =
          '<strong style="color:#E74C3C;">⚠ NC Automática:</strong> ' + rejeitada + ' unidades rejeitadas na etapa "' + etapa + '" da ordem ' + orderCode +
          '<br><span style="color:#6c757d;font-size:12px;">Operador: ' + operador + ' • Produzidas: ' + produzida + ' un</span>';
        document.getElementById('nc_descricao').value = 'Rejeição acima do limite na etapa ' + etapa + ' — ' + rejeitada + ' peças rejeitadas de ' + produzida + ' produzidas.';
        openModal('ncFormModal');
      } else {
        showToast('✅ Apontamento registrado com sucesso!');
        closeModal('novoApontamentoModal');
        resetApontamentoForm();
        setTimeout(() => location.reload(), 800);
      }
    } catch(e) { console.error('[saveApontamento]', e); showToast('Erro de conexão', 'error'); }
    closeModal('ncAlertModal');
    openModal('ncFormModal');
  }

  function openNCFromEntry(orderCode, etapa, qty) {
    pendingNCData = { orderCode, etapa, rejeitada: qty };
    document.getElementById('ncFormInfo').innerHTML =
      '<strong style="color:#E74C3C;">NC para Apontamento:</strong> ' + qty + ' unidades rejeitadas na etapa "' + etapa + '" da ordem ' + orderCode;
    document.getElementById('nc_descricao').value = 'Rejeição registrada na etapa ' + etapa + ' — ' + qty + ' peças rejeitadas.';
    openModal('ncFormModal');
  }

  async function saveNC() {
    const severidade = document.getElementById('nc_severidade').value;
    const descricao = document.getElementById('nc_descricao').value;
    const responsavel = document.getElementById('nc_responsavel').value;
    const causa = document.getElementById('nc_causa').value;
    const acao = document.getElementById('nc_acao').value;
    if (!descricao) { showToast('Descreva a não conformidade!', 'error'); return; }

    try {
      const imageIds = await uploadImages(selectedNCImages, 'nc');
      const orderCode = pendingNCData?.orderCode || '';
      const res = await fetch('/qualidade/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'NC – ' + orderCode + (pendingNCData?.etapa ? ' / ' + pendingNCData.etapa : ''),
          orderCode,
          stepName: pendingNCData?.etapa || '',
          quantityRejected: parseInt(pendingNCData?.rejeitada) || 0,
          operator: pendingNCData?.operador || '',
          severity: severidade,
          description: descricao,
          responsible: responsavel,
          rootCause: causa,
          correctiveAction: acao,
          imageIds,
          openedAt: new Date().toISOString().split('T')[0],
        })
      });
      const data = await res.json();
      if (!data.ok) { showToast(data.error || 'Erro ao registrar NC', 'error'); return; }

      showToast('✅ NC ' + (data.nc?.code || '') + ' registrada com sucesso!');
      closeModal('ncFormModal');
      resetApontamentoForm();
      pendingNCData = null;
      selectedNCImages = [];
      document.getElementById('ncImagePreviewGrid').innerHTML = '';
      setTimeout(() => location.reload(), 800);
    } catch(e) { console.error('[saveNC]', e); showToast('Erro de conexão', 'error'); }
  }

  function resetApontamentoForm() {
    document.getElementById('apt_ordem').selectedIndex = 0;
    _populateStepsSelect('', '');
    document.getElementById('apt_produzida').value = '';
    document.getElementById('apt_rejeitada').value = '';
    document.getElementById('apt_tempo').value = '';
    document.getElementById('apt_obs').value = '';
    document.getElementById('orderInfoCard').style.display = 'none';
    document.getElementById('ncWarningInline').style.display = 'none';
    document.getElementById('imagePreviewGrid').innerHTML = '';
    selectedImages = [];
  }

  async function deleteApontamento(id) {
    if (!confirm('Excluir este apontamento?')) return;
    try {
      const res = await fetch('/apontamento/api/' + id, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) { showToast('Apontamento excluído!'); setTimeout(() => location.reload(), 500); }
      else showToast(data.error || 'Erro ao excluir', 'error');
    } catch(e) { showToast('Erro de conexão', 'error'); }
  }

  // ── View appointment details modal ───────────────────────────────────────
  function viewApontamento(idx) {
    const e = productionEntriesData[idx];
    if (!e) { console.warn('[viewApontamento] entry not found at index', idx); return; }

    const produced = e.quantityProduced != null ? e.quantityProduced : null;
    const rejected = e.quantityRejected != null ? e.quantityRejected : 0;
    const quality = (produced != null && produced > 0)
      ? Math.round(((produced - rejected) / produced) * 100)
      : null;
    const qColor = quality == null ? '#6c757d' : quality >= 99 ? '#27AE60' : quality >= 95 ? '#F39C12' : '#E74C3C';
    const rejColor = rejected > 0 ? '#E74C3C' : '#6c757d';

    document.getElementById('det_orderCode').textContent  = e.orderCode  || '—';
    document.getElementById('det_stepName').textContent   = e.stepName   || '—';
    document.getElementById('det_operator').textContent   = e.operator   || '—';
    document.getElementById('det_timeSpent').textContent  = e.timeSpent != null ? e.timeSpent + ' min' : '—';
    document.getElementById('det_produced').textContent   = produced != null ? produced + ' un' : '—';

    const rejEl = document.getElementById('det_rejected');
    rejEl.textContent = rejected + ' un';
    rejEl.style.color = rejColor;

    const qEl = document.getElementById('det_quality');
    qEl.textContent = quality != null ? quality + '%' : '—';
    qEl.style.color = qColor;

    const ncEl = document.getElementById('det_nc');
    ncEl.textContent = e.ncGenerated ? 'NC Gerada' : 'Sem NC';
    ncEl.style.color = e.ncGenerated ? '#E74C3C' : '#6c757d';
    ncEl.style.fontWeight = e.ncGenerated ? '700' : '400';

    document.getElementById('det_recordedAt').textContent = e.recordedAt || '—';

    const notesRow = document.getElementById('det_notesRow');
    if (e.notes) {
      document.getElementById('det_notes').textContent = e.notes;
      notesRow.style.display = 'block';
    } else {
      notesRow.style.display = 'none';
    }

    openModal('detalheApontamentoModal');
  }

  // ── Toast notification ────────────────────────────────────────────────────
  function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;color:white;box-shadow:0 4px 20px rgba(0,0,0,0.2);transition:opacity 0.3s;display:flex;align-items:center;gap:8px;max-width:360px;';
    t.style.background = type === 'success' ? '#27AE60' : type === 'error' ? '#E74C3C' : '#2980B9';
    t.innerHTML = (type === 'success' ? '<i class=\"fas fa-check-circle\"></i>' : type === 'error' ? '<i class=\"fas fa-exclamation-circle\"></i>' : '<i class=\"fas fa-info-circle\"></i>') + ' ' + msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
  }
</script>
  `

  return c.html(layout('Apontamento', content, 'apontamento', userInfo))
})

// ── API: POST /apontamento/api/create ────────────────────────────────────────
app.post('/api/create', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body) return err(c, 'Dados inválidos')

  // ── Server-side step validation ───────────────────────────────────────────
  if (body.orderId && body.stepName) {
    const order = (tenant.productionOrders || []).find((o: any) => o.id === body.orderId)
    const route = order ? findRouteForOrder(order, tenant.routes || []) : null
    if (route && Array.isArray(route.steps) && route.steps.length > 0) {
      const validSteps = route.steps.map((s: any) => (s.operation || s.name || '').trim()).filter(Boolean)
      if (!validSteps.includes(body.stepName.trim())) {
        return err(c, `Etapa "${body.stepName}" não pertence ao roteiro deste produto. Etapas válidas: ${validSteps.join(', ')}`)
      }
    }
  }

  const id = genId('apt')
  const entry = {
    id, orderId: body.orderId || '', orderCode: body.orderCode || '',
    productName: body.productName || '', operator: body.operator || '',
    stepName: body.stepName || '', machine: body.machine || '',
    startTime: body.startTime || '', endTime: body.endTime || '',
    produced: parseInt(body.produced) || 0, rejected: parseInt(body.rejected) || 0,
    timeSpent: parseInt(body.timeSpent) || 0,
    reason: body.reason || '', notes: body.notes || '', shift: body.shift || 'manha',
    imageIds: Array.isArray(body.imageIds) ? body.imageIds : [],
    createdAt: new Date().toISOString(),
  }
  if (db && userId !== 'demo-tenant') {
    const empresaId = getCtxEmpresaId(c)
    await dbInsert(db, 'apontamentos', {
      id, user_id: userId, empresa_id: empresaId, order_id: entry.orderId, order_code: entry.orderCode,
      product_name: entry.productName, operator: entry.operator,
      machine: entry.machine, start_time: entry.startTime, end_time: entry.endTime,
      produced: entry.produced, rejected: entry.rejected, shift: entry.shift,
      notes: entry.notes, reason: entry.reason || '',
      step_name: entry.stepName, time_spent: entry.timeSpent || 0,
    })
    // Link uploaded images to this apontamento record
    if (entry.imageIds.length > 0) {
      for (const imgId of entry.imageIds) {
        await db.prepare(
          'UPDATE apontamento_images SET ref_id = ? WHERE id = ? AND user_id = ? AND empresa_id = ?'
        ).bind(id, imgId, userId, empresaId).run()
          .catch((e: any) => console.error('[APONTAMENTO] Falha ao vincular imagem', imgId, e))
      }
    }
  }
  tenant.productionEntries.push(entry)

  // ── Auto-complete: mark OP as completed when all route steps are done ─────
  let orderAutoCompleted = false
  if (entry.orderId) {
    const orderIdx = (tenant.productionOrders || []).findIndex((o: any) => o.id === entry.orderId)
    if (orderIdx !== -1) {
      const order = tenant.productionOrders[orderIdx]
      if (order.status !== 'completed' && order.status !== 'cancelled') {
        const route = findRouteForOrder(order, tenant.routes || [])
        if (route && Array.isArray(route.steps) && route.steps.length > 0) {
          const validSteps = route.steps.map((s: any) => (s.operation || s.name || '').trim()).filter(Boolean)
          const doneSteps = new Set(
            tenant.productionEntries
              .filter((e: any) => e.orderId === entry.orderId)
              .map((e: any) => (e.stepName || '').trim())
              .filter(Boolean)
          )
          const allDone = validSteps.every((op: string) => doneSteps.has(op))
          if (allDone) {
            if (db && userId !== 'demo-tenant') {
              await dbUpdate(db, 'production_orders', order.id, userId, { status: 'completed' })
                .catch((e: any) => console.error('[APONTAMENTO] Falha ao atualizar status da OP:', e))
            }
            tenant.productionOrders[orderIdx] = { ...order, status: 'completed' }
            orderAutoCompleted = true
            console.log(`[APONTAMENTO] OP ${order.code} marcada como concluída — todas as etapas apontadas.`)
          }
        }
      }
    }
  }

  return ok(c, { entry, orderAutoCompleted })
})

// ── API: POST /apontamento/api/upload-image ───────────────────────────────────
app.post('/api/upload-image', async (c) => {
  const unauthorized = await ensureAuthenticatedOr401(c)
  if (unauthorized) return unauthorized

  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)

  const formData = await c.req.formData().catch((e: any) => { console.error('[upload-image] FormData parse error:', e); return null; })
  if (!formData) return err(c, 'Dados inválidos')

  const file = formData.get('file')
  const refType = (formData.get('ref_type') as string) || 'apt'

  if (!file || !(file instanceof File)) return err(c, 'Arquivo obrigatório')

  const resolvedContentType = guessImageContentType(file.name, file.type)
  if (!resolvedContentType) return err(c, 'Tipo de arquivo não permitido. Use jpg, jpeg, png ou webp.')

  if (file.size > 5 * 1024 * 1024) return err(c, 'Arquivo muito grande. Limite: 5MB')

  const imageId = genId('aimg')
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const safeFileName = sanitizeFileName(file.name)
  const objectKey = `apontamento-images/${refType}/${imageId}.${ext}`

  const bucket = (c.env as any)?.APT_PHOTOS_BUCKET
  if (!bucket) return err(c, 'Upload de fotos indisponível: configure o binding APT_PHOTOS_BUCKET no Cloudflare R2.', 503)

  const arrayBuffer = await file.arrayBuffer()
  await bucket.put(objectKey, arrayBuffer, { httpMetadata: { contentType: resolvedContentType } })

  const image: Record<string, any> = {
    id: imageId,
    ref_type: refType,
    ref_id: '',  // will be set when the apontamento is saved
    file_name: safeFileName,
    object_key: objectKey,
    content_type: resolvedContentType,
    uploaded_at: new Date().toISOString(),
  }

  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'apontamento_images', {
      ...image, user_id: userId, empresa_id: empresaId,
    })
  }

  return ok(c, { image, view_url: '/apontamento/api/images/' + imageId })
})

// ── API: GET /apontamento/api/images/:imageId (serve from R2) ─────────────────
app.get('/api/images/:imageId', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const imageId = c.req.param('imageId')

  // Look up metadata in D1
  if (!db || userId === 'demo-tenant') return c.text('Not found', 404)
  const empresaId = getCtxEmpresaId(c)
  const row = await db.prepare(
    'SELECT * FROM apontamento_images WHERE id = ? AND empresa_id = ?'
  ).bind(imageId, empresaId).first()
    .catch((e: any) => { console.error('[APONTAMENTO][IMAGES] Erro ao buscar imagem:', e); return null; })
  if (!row) return c.text('Not found', 404)

  const bucket = (c.env as any)?.APT_PHOTOS_BUCKET
  if (!bucket || !row.object_key) return c.text('Not available', 503)

  const obj = await bucket.get(row.object_key)
  if (!obj) return c.text('Not found', 404)

  return new Response(await obj.arrayBuffer(), {
    headers: {
      'Content-Type': (row.content_type as string) || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000',
    },
  })
})

app.delete('/api/:id', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const idx = tenant.productionEntries.findIndex((e: any) => e.id === id)
  if (idx === -1) return err(c, 'Apontamento não encontrado', 404)
  if (db && userId !== 'demo-tenant') await dbDelete(db, 'apontamentos', id, userId)
  tenant.productionEntries.splice(idx, 1)
  return ok(c)
})

app.get('/api/list', (c) => ok(c, { entries: getCtxTenant(c).productionEntries }))

// ── GET /apontamento/relatorio/:orderId — Printable HTML report ───────────────
app.get('/relatorio/:orderId', async (c) => {
  const session = getCtxSession(c)
  if (!session) return c.html('<h1>Não autenticado</h1>', 401)

  const tenant = getCtxTenant(c)
  const db = getCtxDB(c)
  const empresaId = getCtxEmpresaId(c)
  const orderId = c.req.param('orderId')

  const order = (tenant.productionOrders || []).find((o: any) => o.id === orderId)
  if (!order) return c.html('<h1>Ordem não encontrada</h1>', 404)
  if (order.status !== 'completed') return c.html('<h1>Relatório disponível somente para ordens concluídas</h1>', 400)

  const entries: any[] = (tenant.productionEntries || []).filter((e: any) => e.orderId === orderId)
  const ncs: any[] = (tenant.nonConformances || []).filter((n: any) =>
    n.orderCode === order.code || n.orderId === orderId
  )
  const route = findRouteForOrder(order, tenant.routes || [])

  // Fetch image metadata from D1 for all entries
  const imagesByEntry: Record<string, string[]> = {}
  if (db && session.userId !== 'demo-tenant') {
    const entryIds = entries.map(e => e.id)
    if (entryIds.length > 0) {
      const placeholders = entryIds.map(() => '?').join(',')
      const query = empresaId
        ? `SELECT id, ref_id FROM apontamento_images WHERE empresa_id = ? AND ref_id IN (${placeholders})`
        : `SELECT id, ref_id FROM apontamento_images WHERE ref_id IN (${placeholders})`
      const binds = empresaId ? [empresaId, ...entryIds] : entryIds
      const imgRows = await db.prepare(query).bind(...binds).all()
        .then((r: any) => r.results || [])
        .catch(() => [])
      for (const row of imgRows as any[]) {
        if (!imagesByEntry[row.ref_id]) imagesByEntry[row.ref_id] = []
        imagesByEntry[row.ref_id].push(row.id)
      }
    }
  } else {
    for (const e of entries) {
      if (Array.isArray(e.imageIds) && e.imageIds.length > 0) {
        imagesByEntry[e.id] = e.imageIds
      }
    }
  }

  const sevLabel: Record<string, string> = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' }
  const stLabel: Record<string, string> = { open: 'Aberta', in_analysis: 'Em Análise', closed: 'Encerrada' }
  const sevColor: Record<string, string> = { low: '#65a30d', medium: '#d97706', high: '#ea580c', critical: '#dc2626' }

  const fmtDate = (iso: string) => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) } catch { return iso }
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório de Apontamentos — ${order.code}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a1a;background:#fff;padding:24px;}
    h1{font-size:20px;color:#1B4F72;margin-bottom:4px;}
    h2{font-size:15px;color:#1B4F72;margin:20px 0 8px;border-bottom:2px solid #e0e7ef;padding-bottom:4px;}
    .meta{display:flex;flex-wrap:wrap;gap:16px;background:#f0f7ff;border:1px solid #bee3f8;border-radius:8px;padding:14px;margin-bottom:20px;}
    .meta-item{flex:1;min-width:140px;}
    .meta-label{font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;margin-bottom:2px;}
    .meta-value{font-size:14px;font-weight:700;color:#1B4F72;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;}
    th{background:#1B4F72;color:#fff;padding:8px 10px;font-size:12px;text-align:left;}
    td{padding:7px 10px;border-bottom:1px solid #e9ecef;vertical-align:top;}
    tr:nth-child(even) td{background:#f8fafc;}
    .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;}
    .img-thumb{width:72px;height:54px;object-fit:cover;border-radius:4px;border:1px solid #e9ecef;margin:2px;}
    .nc-card{border:1px solid #e9ecef;border-radius:6px;padding:10px;margin-bottom:8px;}
    .print-btn{position:fixed;top:16px;right:16px;background:#1B4F72;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;}
    @media print{.print-btn{display:none;}}
    .steps-list{display:flex;flex-wrap:wrap;gap:6px;}
    .step-badge{padding:3px 10px;border-radius:10px;font-size:11px;background:#e0e7ef;color:#1B4F72;font-weight:600;}
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨 Imprimir</button>

  <h1>Relatório de Apontamentos de Produção</h1>
  <div style="font-size:11px;color:#6c757d;margin-bottom:14px;">Gerado em ${fmtDate(new Date().toISOString())}</div>

  <h2>Dados da Ordem de Produção</h2>
  <div class="meta">
    <div class="meta-item"><div class="meta-label">Código OP</div><div class="meta-value">${order.code}</div></div>
    <div class="meta-item"><div class="meta-label">Produto</div><div class="meta-value">${order.productName}</div></div>
    <div class="meta-item"><div class="meta-label">Qtd Planejada</div><div class="meta-value">${order.quantity} un</div></div>
    <div class="meta-item"><div class="meta-label">Qtd Produzida</div><div class="meta-value">${order.completedQuantity || 0} un</div></div>
    <div class="meta-item"><div class="meta-label">Status</div><div class="meta-value" style="color:#27AE60;">✓ Concluída</div></div>
    ${order.cliente ? `<div class="meta-item"><div class="meta-label">Cliente</div><div class="meta-value">${order.cliente}</div></div>` : ''}
    ${order.pedido ? `<div class="meta-item"><div class="meta-label">Pedido</div><div class="meta-value">${order.pedido}</div></div>` : ''}
  </div>

  ${route && route.steps && route.steps.length > 0 ? `
  <h2>Roteiro de Fabricação — ${route.name || ''}</h2>
  <div class="steps-list" style="margin-bottom:16px;">
    ${route.steps.map((s: any) => `<span class="step-badge">${s.operation || s.name || ''}</span>`).join('')}
  </div>` : ''}

  <h2>Apontamentos Realizados (${entries.length})</h2>
  ${entries.length === 0 ? '<p style="color:#6c757d;">Nenhum apontamento registrado.</p>' : `
  <table>
    <thead><tr>
      <th>Data / Hora</th><th>Operador</th><th>Etapa / Operação</th>
      <th>Qtd Prod.</th><th>Qtd Rej.</th><th>Tempo (min)</th><th>Observações</th><th>Evidências</th>
    </tr></thead>
    <tbody>
    ${entries.map((e: any) => {
      const imgs = imagesByEntry[e.id] || []
      return `<tr>
        <td style="white-space:nowrap;">${fmtDate(e.recordedAt || e.createdAt)}</td>
        <td>${e.operator || '—'}</td>
        <td><strong>${e.stepName || '—'}</strong></td>
        <td>${e.produced ?? e.quantityProduced ?? '—'}</td>
        <td style="color:${(e.rejected ?? e.quantityRejected ?? 0) > 0 ? '#dc2626' : 'inherit'};">${e.rejected ?? e.quantityRejected ?? 0}</td>
        <td>${e.timeSpent != null ? e.timeSpent : '—'}</td>
        <td style="font-size:12px;">${e.notes || '—'}</td>
        <td>${imgs.map((imgId: string) => `<img class="img-thumb" src="/apontamento/api/images/${imgId}" alt="evidência">`).join('') || '—'}</td>
      </tr>`
    }).join('')}
    </tbody>
  </table>`}

  <h2>Não Conformidades Relacionadas (${ncs.length})</h2>
  ${ncs.length === 0 ? '<p style="color:#6c757d;">Nenhuma NC registrada para esta OP.</p>' : `
  <div>
    ${ncs.map((nc: any) => `
    <div class="nc-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <strong style="color:#1B4F72;">${nc.code || '—'}</strong>
        <span class="badge" style="background:${sevColor[nc.severity] || '#9ca3af'}22;color:${sevColor[nc.severity] || '#9ca3af'};">${sevLabel[nc.severity] || nc.severity}</span>
        <span class="badge" style="background:#e9ecef;color:#374151;">${stLabel[nc.status] || nc.status}</span>
      </div>
      ${nc.title ? `<div style="font-weight:600;margin-bottom:4px;">${nc.title}</div>` : ''}
      <div style="font-size:12px;color:#374151;margin-bottom:4px;">${nc.description || '—'}</div>
      <div style="display:flex;gap:16px;font-size:11px;color:#6c757d;">
        ${nc.stepName ? `<span>Etapa: ${nc.stepName}</span>` : ''}
        ${nc.openedAt ? `<span>Aberta em: ${nc.openedAt}</span>` : ''}
        ${nc.closedAt ? `<span>Encerrada em: ${nc.closedAt}</span>` : ''}
        ${nc.responsible ? `<span>Responsável: ${nc.responsible}</span>` : ''}
      </div>
      ${nc.rootCause ? `<div style="font-size:12px;color:#374151;margin-top:4px;"><strong>Causa Raiz:</strong> ${nc.rootCause}</div>` : ''}
      ${nc.correctiveAction ? `<div style="font-size:12px;color:#374151;margin-top:2px;"><strong>Ação Corretiva:</strong> ${nc.correctiveAction}</div>` : ''}
    </div>`).join('')}
  </div>`}

  <div style="margin-top:24px;border-top:1px solid #e9ecef;padding-top:12px;font-size:11px;color:#9ca3af;text-align:center;">
    PCPSyncrus — Relatório gerado automaticamente em ${fmtDate(new Date().toISOString())}
  </div>
</body>
</html>`

  return c.html(html)
})

export default app
