import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxUserId, getCtxEmpresaId, getCtxSession } from '../sessionHelper'
import { genId, dbInsert, dbUpdate, dbDelete, ok, err } from '../dbHelpers'
import { requireModuleWriteAccess } from '../moduleAccess'

/** Return a 401 JSON response if the user is not authenticated. */
function ensureAuthOr401(c: any): Response | null {
  const session = getCtxSession(c)
  if (!session) {
    return c.json({ error: 'Não autenticado' }, 401)
  }
  return null
}

/** Escape a string for safe inclusion in HTML text content. */
function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const app = new Hono()

app.use('*', async (c, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    const blocked = await requireModuleWriteAccess(c, 'qualidade')
    if (blocked) return blocked
  }
  return next()
})

app.get('/', (c) => {
  try {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const mockData = tenant  // per-session data
  const nonConformances = (mockData as any).nonConformances || []

  const sevColor: Record<string, string> = { low: '#65a30d', medium: '#d97706', high: '#ea580c', critical: '#dc2626' }
  const sevBg: Record<string, string> = { low: '#f0fdf4', medium: '#fffbeb', high: '#fff7ed', critical: '#fef2f2' }
  const sevLabel: Record<string, string> = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' }
  const stColor: Record<string, string> = { open: '#E74C3C', in_analysis: '#F39C12', closed: '#27AE60' }
  const stBadge: Record<string, string> = { open: 'badge-danger', in_analysis: 'badge-warning', closed: 'badge-success' }
  const stLabel: Record<string, string> = { open: 'Aberta', in_analysis: 'Em Análise', closed: 'Encerrada' }

  const openCount = nonConformances.filter(n => n.status === 'open').length
  const analysisCount = nonConformances.filter(n => n.status === 'in_analysis').length
  const closedCount = nonConformances.filter(n => n.status === 'closed').length
  const criticalCount = nonConformances.filter(n => n.severity === 'critical' || n.severity === 'high').length

  const content = `
  <!-- New NC Modal -->
  <div id="novaNcModal" class="modal-overlay">
    <div class="modal" style="max-width:620px;border-top:4px solid #E74C3C;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:16px;font-weight:700;color:#E74C3C;"><i class="fas fa-plus-circle" style="margin-right:8px;"></i>Nova Não Conformidade</h3>
        <button onclick="closeModal('novaNcModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Título / Descrição Breve *</label>
            <input class="form-control" id="nc_titulo" type="text" placeholder="Ex: Dimensão fora de tolerância">
          </div>
          <div class="form-group">
            <label class="form-label">Tipo *</label>
            <select class="form-control" id="nc_tipo">
              <option value="processo">Processo</option>
              <option value="produto">Produto</option>
              <option value="material">Material</option>
              <option value="fornecedor">Fornecedor</option>
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Ordem de Produção</label>
            <select class="form-control" id="nc_ordem">
              <option value="">Selecionar...</option>
              ${((mockData as any).productionOrders || []).map((o: any) => `<option>${o.code}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Etapa / Operação</label>
            <input class="form-control" id="nc_produto" type="text" placeholder="Ex: Torneamento, Montagem...">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Qtd Rejeitada *</label>
            <input class="form-control" id="nc_qtd" type="number" min="1" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">Severidade *</label>
            <select class="form-control" id="nc_gravidade">
              <option value="low">Baixa</option>
              <option value="medium" selected>Média</option>
              <option value="high">Alta</option>
              <option value="critical">Crítica</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Responsável Análise</label>
            <select class="form-control" id="nc_responsavel">
              ${((mockData as any).users || []).filter((u: any) => u.role === 'qualidade' || u.role === 'admin').map((u: any) => `<option value="${u.name}">${u.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Descrição da Não Conformidade *</label>
          <textarea class="form-control" id="nc_descricao" rows="3" placeholder="Descreva detalhadamente o defeito: localização na peça, extensão, impacto..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Setor</label>
          <input class="form-control" id="nc_setor" type="text" placeholder="Ex: Usinagem, Qualidade...">
        </div>
        <div class="form-group">
          <label class="form-label">Prazo para Tratamento</label>
          <input class="form-control" id="nc_prazo" type="date">
        </div>
        <div class="form-group">
          <label class="form-label"><i class="fas fa-images" style="margin-right:6px;color:#6c757d;"></i>Evidências Fotográficas</label>
          <div style="border:2px dashed #fca5a5;border-radius:8px;padding:16px;text-align:center;cursor:pointer;" onclick="document.getElementById('nc_imgs_new').click()">
            <i class="fas fa-cloud-upload-alt" style="font-size:24px;color:#ef4444;margin-bottom:6px;"></i>
            <div style="font-size:13px;color:#6c757d;">Selecionar imagens ou arrastar aqui</div>
          </div>
          <input type="file" id="nc_imgs_new" multiple accept="image/*" style="display:none;" onchange="previewNewNCImages(event)">
          <button type="button" class="btn btn-secondary btn-sm" style="margin-top:6px;width:100%;" onclick="document.getElementById('nc_cam_new').click()">
            <i class="fas fa-camera"></i> Tirar Foto com Câmera
          </button>
          <input type="file" id="nc_cam_new" accept="image/*" capture="environment" style="display:none;" onchange="previewNewNCImages(event)">
          <div id="newNCImageGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;margin-top:8px;"></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-secondary" onclick="closeModal('novaNcModal')">Cancelar</button>
          <button class="btn btn-danger" onclick="salvarNC()"><i class="fas fa-save"></i> Registrar NC</button>
        </div>
      </div>
    </div>
  </div>

  <!-- NC Detail/Edit Modal -->
  <div id="ncDetailModal" class="modal-overlay">
    <div class="modal" style="max-width:640px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 id="ncDetailTitle" style="margin:0;font-size:16px;font-weight:700;color:#1B4F72;"></h3>
        <button onclick="closeModal('ncDetailModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div id="ncDetailBody" style="padding:24px;"></div>
    </div>
  </div>

  <!-- Header -->
  <div class="section-header">
    <div>
      <div style="font-size:14px;color:#6c757d;">Tratamento e Análise de Não Conformidades</div>
    </div>
    <button class="btn btn-danger" onclick="openModal('novaNcModal')">
      <i class="fas fa-plus"></i> Nova NC
    </button>
  </div>

  <!-- KPI Cards -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;margin-bottom:24px;">
    <div class="kpi-card" style="border-left:4px solid #E74C3C;">
      <div style="font-size:11px;color:#6c757d;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Abertas</div>
      <div style="font-size:32px;font-weight:800;color:#E74C3C;line-height:1.1;margin:6px 0;">${openCount}</div>
      <div style="font-size:12px;color:#6c757d;">Aguardando tratamento</div>
    </div>
    <div class="kpi-card" style="border-left:4px solid #F39C12;">
      <div style="font-size:11px;color:#6c757d;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Em Análise</div>
      <div style="font-size:32px;font-weight:800;color:#F39C12;line-height:1.1;margin:6px 0;">${analysisCount}</div>
      <div style="font-size:12px;color:#6c757d;">Em investigação</div>
    </div>
    <div class="kpi-card" style="border-left:4px solid #27AE60;">
      <div style="font-size:11px;color:#6c757d;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Encerradas</div>
      <div style="font-size:32px;font-weight:800;color:#27AE60;line-height:1.1;margin:6px 0;">${closedCount}</div>
      <div style="font-size:12px;color:#6c757d;">Tratadas e fechadas</div>
    </div>
    <div class="kpi-card" style="border-left:4px solid #dc2626;">
      <div style="font-size:11px;color:#6c757d;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Alta/Crítica</div>
      <div style="font-size:32px;font-weight:800;color:#dc2626;line-height:1.1;margin:6px 0;">${criticalCount}</div>
      <div style="font-size:12px;color:#6c757d;">Severidade elevada</div>
    </div>
  </div>

  <!-- Filter Bar -->
  <div class="card" style="padding:12px 16px;margin-bottom:16px;">
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
      <div class="search-box" style="flex:1;min-width:200px;">
        <i class="fas fa-search icon"></i>
        <input class="form-control" type="text" placeholder="Buscar por código, ordem, descrição...">
      </div>
      <select class="form-control" style="width:auto;">
        <option>Todos os status</option>
        <option>Aberta</option>
        <option>Em Análise</option>
        <option>Encerrada</option>
      </select>
      <select class="form-control" style="width:auto;">
        <option>Toda severidade</option>
        <option>Baixa</option>
        <option>Média</option>
        <option>Alta</option>
        <option>Crítica</option>
      </select>
      <button class="btn btn-secondary btn-sm" onclick="alert('Exportando relatório de NCs...')" title="Exportar relatório">
        <i class="fas fa-file-excel"></i> Exportar
      </button>
    </div>
  </div>

  <!-- NC Table -->
  <div class="card" style="overflow:hidden;">
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Código NC</th>
          <th>Ordem</th>
          <th>Etapa</th>
          <th>Qtd Rejeitada</th>
          <th>Severidade</th>
          <th>Status</th>
          <th>Responsável</th>
          <th>Data</th>
          <th>Ações</th>
        </tr></thead>
        <tbody>
          ${nonConformances.map(nc => `
          <tr>
            <td style="font-weight:700;color:#E74C3C;">${nc.code || '—'}</td>
            <td style="font-weight:600;color:#1B4F72;">${nc.orderCode || '—'}</td>
            <td>${nc.stepName || nc.product || '—'}</td>
            <td style="font-weight:600;color:#E74C3C;">${nc.quantityRejected || 0} un</td>
            <td>
              <span class="badge" style="background:${sevBg[nc.severity]};color:${sevColor[nc.severity]};">
                <i class="fas fa-circle" style="font-size:7px;"></i> ${sevLabel[nc.severity]}
              </span>
            </td>
            <td><span class="badge ${stBadge[nc.status]}">${stLabel[nc.status]}</span></td>
            <td>
              ${nc.responsible
                ? `<div style="display:flex;align-items:center;gap:6px;">
                    <div class="avatar" style="width:24px;height:24px;font-size:9px;background:#2980B9;">${nc.responsible.split(' ').map((n: string) => n[0]).join('').slice(0,2)}</div>
                    <span style="font-size:12px;">${nc.responsible}</span>
                   </div>`
                : `<span style="color:#9ca3af;font-size:12px;">Não atribuído</span>`
              }
            </td>
            <td style="color:#6c757d;font-size:12px;">${nc.createdAt}</td>
            <td>
              <div style="display:flex;gap:4px;">
                <button class="btn btn-secondary btn-sm" onclick="openNCDetail('${nc.id}')" title="Ver / Editar NC">
                  <i class="fas fa-eye"></i>
                </button>
                ${nc.status !== 'closed'
                  ? `<button class="btn btn-success btn-sm" onclick="encerrarNC('${nc.id}')" title="Encerrar NC">
                      <i class="fas fa-check"></i>
                     </button>`
                  : ''
                }
              </div>
            </td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- NC Detail Cards -->
  <div style="margin-top:24px;">
    <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin-bottom:16px;"><i class="fas fa-clipboard-list" style="margin-right:8px;"></i>Detalhes das NCs</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;">
      ${nonConformances.map(nc => `
      <div class="card" style="padding:20px;border-left:4px solid ${sevColor[nc.severity]};">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
          <div>
            <div style="font-size:14px;font-weight:700;color:#1B4F72;">${nc.code}</div>
            <div style="font-size:12px;color:#6c757d;">Ordem: ${nc.orderCode} • ${nc.stepName}</div>
          </div>
          <span class="badge ${stBadge[nc.status]}">${stLabel[nc.status]}</span>
        </div>

        <div style="background:#f8f9fa;border-radius:8px;padding:10px;margin-bottom:12px;">
          <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">Descrição:</div>
          <div style="font-size:13px;color:#374151;">${nc.description}</div>
        </div>

        ${nc.rootCause ? `
        <div style="margin-bottom:8px;">
          <span style="font-size:11px;font-weight:600;color:#6c757d;text-transform:uppercase;">Causa Raiz:</span>
          <div style="font-size:12px;color:#374151;margin-top:2px;">${nc.rootCause}</div>
        </div>` : ''}

        ${nc.correctiveAction ? `
        <div style="margin-bottom:8px;">
          <span style="font-size:11px;font-weight:600;color:#6c757d;text-transform:uppercase;">Ação Corretiva:</span>
          <div style="font-size:12px;color:#374151;margin-top:2px;">${nc.correctiveAction}</div>
        </div>` : ''}

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <span class="badge" style="background:${sevBg[nc.severity]};color:${sevColor[nc.severity]};">
            <i class="fas fa-exclamation-circle"></i> ${sevLabel[nc.severity]}
          </span>
          <span class="badge badge-danger"><i class="fas fa-times-circle"></i> ${nc.quantityRejected} rejeitadas</span>
          <span class="badge badge-secondary"><i class="fas fa-user"></i> ${nc.operator}</span>
        </div>

        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="openNCDetail('${nc.id}')" title="Analisar esta NC">
            <i class="fas fa-microscope"></i> Analisar
          </button>
          ${nc.status !== 'closed'
            ? `<button class="btn btn-success btn-sm" onclick="encerrarNC('${nc.id}')" title="Encerrar NC"><i class="fas fa-check"></i></button>`
            : `<span class="badge badge-success" style="flex:0;"><i class="fas fa-check-circle"></i> Encerrada</span>`
          }
        </div>
      </div>
      `).join('')}
    </div>
  </div>

  <script>
  const ncData = ${JSON.stringify(nonConformances)};

  function openNCDetail(id) {
    const nc = ncData.find(n => n.id === id);
    if (!nc) return;
    const sevColor = { low: '#65a30d', medium: '#d97706', high: '#ea580c', critical: '#dc2626' };
    const sevLabel = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' };
    const stLabel = { open: 'Aberta', in_analysis: 'Em Análise', closed: 'Encerrada' };
    document.getElementById('ncDetailTitle').innerHTML = '<i class="fas fa-clipboard-check" style="margin-right:8px;color:#E74C3C;"></i>' + nc.code + ' — Tratamento';
    document.getElementById('ncDetailBody').innerHTML = \`
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div><label class="form-label">Ordem</label><input class="form-control" value="\${nc.orderCode}" readonly></div>
        <div><label class="form-label">Etapa</label><input class="form-control" value="\${nc.stepName}" readonly></div>
        <div><label class="form-label">Qtd Rejeitada</label><input class="form-control" value="\${nc.quantityRejected} un" readonly></div>
        <div><label class="form-label">Severidade</label>
          <select class="form-control">
            <option value="low" \${nc.severity === 'low' ? 'selected' : ''}>Baixa</option>
            <option value="medium" \${nc.severity === 'medium' ? 'selected' : ''}>Média</option>
            <option value="high" \${nc.severity === 'high' ? 'selected' : ''}>Alta</option>
            <option value="critical" \${nc.severity === 'critical' ? 'selected' : ''}>Crítica</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Descrição da NC</label>
        <textarea class="form-control" rows="3">\${nc.description}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Causa Raiz</label>
        <input class="form-control" value="\${nc.rootCause || ''}" placeholder="Análise de causa raiz...">
      </div>
      <div class="form-group">
        <label class="form-label">Ação Corretiva</label>
        <input class="form-control" value="\${nc.correctiveAction || ''}" placeholder="Ação para eliminar a causa raiz...">
      </div>
      <div class="form-group">
        <label class="form-label">Responsável pela Análise</label>
        <input class="form-control" value="\${nc.responsible || ''}" placeholder="Nome do responsável...">
      </div>
      <div class="form-group">
        <label class="form-label"><i class="fas fa-images" style="margin-right:6px;"></i>Evidências Fotográficas</label>
        <div style="border:2px dashed #fca5a5;border-radius:8px;padding:14px;text-align:center;cursor:pointer;" onclick="document.getElementById('nc_det_imgs').click()">
          <i class="fas fa-camera" style="font-size:20px;color:#ef4444;margin-bottom:4px;"></i>
          <div style="font-size:12px;color:#6c757d;">Adicionar evidências fotográficas</div>
        </div>
        <input type="file" id="nc_det_imgs" multiple accept="image/*" style="display:none;" onchange="previewNCDetImages(event)">
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:6px;width:100%;" onclick="document.getElementById('nc_det_cam').click()">
          <i class="fas fa-camera"></i> Usar Câmera
        </button>
        <input type="file" id="nc_det_cam" accept="image/*" capture="environment" style="display:none;" onchange="previewNCDetImages(event)">
        <div id="ncDetImgGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;margin-top:8px;"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="closeModal('ncDetailModal')">Fechar</button>
        <button class="btn btn-warning" onclick="salvarNcDetalhe('\${nc.id}')"><i class="fas fa-save"></i> Salvar Alterações</button>
        <button class="btn btn-success" onclick="encerrarNC('\${nc.id}');closeModal('ncDetailModal')"><i class="fas fa-check"></i> Encerrar NC</button>
      </div>
    \`;
    openModal('ncDetailModal');
  }

  function previewNewNCImages(event) {
    const grid = document.getElementById('newNCImageGrid');
    Array.from(event.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const div = document.createElement('div');
        div.style.cssText = 'position:relative;';
        div.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:80px;object-fit:cover;border-radius:6px;border:1px solid #e9ecef;">' +
          '<button onclick="this.parentElement.remove()" style="position:absolute;top:2px;right:2px;background:#E74C3C;color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;padding:0;">×</button>';
        grid.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
  }

  function previewNCDetImages(event) {
    const grid = document.getElementById('ncDetImgGrid');
    Array.from(event.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const div = document.createElement('div');
        div.style.cssText = 'position:relative;';
        div.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:80px;object-fit:cover;border-radius:6px;border:1px solid #e9ecef;">' +
          '<button onclick="this.parentElement.remove()" style="position:absolute;top:2px;right:2px;background:#E74C3C;color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;padding:0;">×</button>';
        grid.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
  }
  

  async function salvarNC() {
    const title = document.getElementById('nc_titulo')?.value || '';
    const type = document.getElementById('nc_tipo')?.value || 'processo';
    const severity = document.getElementById('nc_gravidade')?.value || 'medium';
    const product = document.getElementById('nc_produto')?.value || '';
    const department = document.getElementById('nc_setor')?.value || '';
    const description = document.getElementById('nc_descricao')?.value || '';
    const responsible = document.getElementById('nc_responsavel')?.value || '';
    const dueDate = document.getElementById('nc_prazo')?.value || '';
    
    if (!title) { showToast('Informe o título!', 'error'); return; }
    
    try {
      const res = await fetch('/qualidade/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type, severity, product, department, description, responsible, dueDate })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('✅ NC registrada com sucesso!');
        closeModal('novaNcModal');
        setTimeout(() => location.reload(), 800);
      } else {
        showToast(data.error || 'Erro ao registrar NC', 'error');
      }
    } catch(e) { showToast('Erro de conexão', 'error'); }
  }

  async function encerrarNC(id) {
    if (!confirm('Encerrar esta NC?')) return;
    try {
      const res = await fetch('/qualidade/api/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' })
      });
      const data = await res.json();
      if (data.ok) { showToast('✅ NC encerrada!'); setTimeout(() => location.reload(), 600); }
      else showToast(data.error || 'Erro ao encerrar NC', 'error');
    } catch(e) { showToast('Erro de conexão', 'error'); }
  }

  async function salvarNcDetalhe(id) {
    // Lê campos do modal de detalhe (gerados dinamicamente)
    const inputs = document.querySelectorAll('#ncDetailBody input, #ncDetailBody select, #ncDetailBody textarea');
    let severity = '', rootCause = '', correctiveAction = '', responsible = '';
    inputs.forEach(el => {
      const lbl = el.previousElementSibling?.textContent || el.closest('.form-group')?.querySelector('label')?.textContent || '';
      if (lbl.includes('Severidade') && el.tagName === 'SELECT') severity = el.value;
      if (lbl.includes('Causa Raiz')) rootCause = el.value;
      if (lbl.includes('Ação Corretiva') || lbl.includes('Corretiva')) correctiveAction = el.value;
      if (lbl.includes('Responsável')) responsible = el.value;
    });
    try {
      const res = await fetch('/qualidade/api/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ severity, rootCause, correctiveAction, responsible })
      });
      const data = await res.json();
      if (data.ok) { showToast('✅ NC atualizada!'); setTimeout(() => location.reload(), 600); }
      else showToast(data.error || 'Erro ao atualizar NC', 'error');
    } catch(e) { showToast('Erro de conexão', 'error'); }
  }

  async function deleteNC(id) {
    if (!confirm('Excluir esta NC?')) return;
    try {
      const res = await fetch('/qualidade/api/' + id, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) { showToast('NC excluída!'); setTimeout(() => location.reload(), 500); }
      else showToast(data.error || 'Erro ao excluir', 'error');
    } catch(e) { showToast('Erro de conexão', 'error'); }
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

  return c.html(layout('Qualidade — NCs', content, 'qualidade', userInfo))
  } catch(err: any) {
    console.error('[qualidade] render error:', err?.message, err?.stack)
    return c.html(`<div style="padding:20px;font-family:sans-serif;"><h2>Erro ao carregar Qualidade</h2><pre style="background:#f8f9fa;padding:14px;border-radius:6px;">${err?.message || 'Unknown error'}</pre></div>`, 500)
  }
})

// ── API: POST /qualidade/api/create ─────────────────────────────────────────
app.post('/api/create', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const empresaId = getCtxEmpresaId(c)
  const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.title) return err(c, 'Título obrigatório')

  const id = genId('nc')
  const nc = {
    id, title: body.title, code: body.code || `NC-${Date.now().toString().slice(-6)}`,
    type: body.type || 'processo', severity: body.severity || 'medium',
    status: body.status || 'open', product: body.product || '',
    productId: body.productId || '', department: body.department || '',
    description: body.description || '', rootCause: body.rootCause || '',
    correctiveAction: body.correctiveAction || '', responsible: body.responsible || '',
    dueDate: body.dueDate || '', openedAt: new Date().toISOString().split('T')[0],
    images: [], createdAt: new Date().toISOString().split('T')[0],
    // Fields needed for UI rendering
    orderCode: body.orderCode || '—', stepName: body.stepName || body.product || '—',
    quantityRejected: body.quantityRejected || 0, operator: body.operator || body.responsible || '—',
  }
  if (!Array.isArray(tenant.nonConformances)) tenant.nonConformances = []
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'non_conformances', {
      id, user_id: userId, empresa_id: empresaId,
      code: nc.code, title: nc.title, type: nc.type,
      severity: nc.severity, status: nc.status, product: nc.product,
      description: nc.description, responsible: nc.responsible, due_date: nc.dueDate,
      order_code: nc.orderCode || '', step_name: nc.stepName || '',
      quantity_rejected: nc.quantityRejected || 0, operator: nc.operator || '',
      root_cause: nc.rootCause || '', corrective_action: nc.correctiveAction || '',
    })
  }
  tenant.nonConformances.push(nc)
  return ok(c, { nc })
})

app.put('/api/:id', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id'); const body = await c.req.json().catch(() => null)
  if (!body) return err(c, 'Dados inválidos')
  const idx = tenant.nonConformances.findIndex((n: any) => n.id === id)
  if (idx === -1) return err(c, 'NC não encontrada', 404)
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'non_conformances', id, userId, {
      status: body.status !== undefined ? body.status : undefined,
      severity: body.severity !== undefined ? body.severity : undefined,
      responsible: body.responsible !== undefined ? body.responsible : undefined,
      corrective_action: body.correctiveAction !== undefined ? body.correctiveAction : undefined,
      root_cause: body.rootCause !== undefined ? body.rootCause : undefined,
      title: body.title !== undefined ? body.title : undefined,
      description: body.description !== undefined ? body.description : undefined,
      order_code: body.orderCode !== undefined ? body.orderCode : undefined,
      step_name: body.stepName !== undefined ? body.stepName : undefined,
      quantity_rejected: body.quantityRejected !== undefined ? body.quantityRejected : undefined,
      operator: body.operator !== undefined ? body.operator : undefined,
      due_date: body.dueDate !== undefined ? body.dueDate : undefined,
    })
  }
  Object.assign(tenant.nonConformances[idx], body)
  return ok(c, { nc: tenant.nonConformances[idx] })
})

app.delete('/api/:id', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const idx = tenant.nonConformances.findIndex((n: any) => n.id === id)
  if (idx === -1) return err(c, 'NC não encontrada', 404)
  if (db && userId !== 'demo-tenant') await dbDelete(db, 'non_conformances', id, userId)
  tenant.nonConformances.splice(idx, 1)
  return ok(c)
})

app.get('/api/list', (c) => ok(c, { ncs: getCtxTenant(c).nonConformances }))

// ── UI: GET /qualidade/relatorios ────────────────────────────────────────────
app.get('/relatorios', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)

  const content = `
  <!-- Header -->
  <div class="section-header">
    <div>
      <div style="font-size:14px;color:#6c757d;">Relatório de Não Conformidades</div>
    </div>
  </div>

  <!-- Filter Card -->
  <div class="card" style="padding:20px;margin-bottom:24px;">
    <h4 style="font-size:14px;font-weight:700;color:#1B4F72;margin-bottom:16px;"><i class="fas fa-filter" style="margin-right:8px;"></i>Filtros</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;align-items:end;">
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Status</label>
        <select class="form-control" id="rel_status" multiple size="3">
          <option value="open" selected>Aberta</option>
          <option value="in_analysis" selected>Em Análise</option>
          <option value="closed" selected>Encerrada</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Data Início (abertura)</label>
        <input class="form-control" id="rel_start" type="date">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Data Fim (abertura)</label>
        <input class="form-control" id="rel_end" type="date">
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="aplicarFiltros()"><i class="fas fa-search"></i> Filtrar</button>
        <button class="btn btn-danger" onclick="gerarPDF()" id="btnGerarPdf" style="display:none;"><i class="fas fa-file-pdf"></i> Gerar PDF</button>
      </div>
    </div>
  </div>

  <!-- Results -->
  <div id="resultadoRelatorio" style="display:none;">
    <div class="card" style="overflow:hidden;">
      <div style="padding:14px 16px;border-bottom:1px solid #f1f3f5;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;font-weight:600;color:#374151;" id="resultCount"></span>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Código NC</th>
            <th>Título</th>
            <th>Tipo</th>
            <th>Severidade</th>
            <th>Status</th>
            <th>Responsável</th>
            <th>Abertura</th>
            <th>Prazo</th>
          </tr></thead>
          <tbody id="relatorioTbody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
  const allNCs = ${JSON.stringify((tenant as any).nonConformances || [])};
  const sevLabel = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' };
  const sevColor = { low: '#65a30d', medium: '#d97706', high: '#ea580c', critical: '#dc2626' };
  const stLabel  = { open: 'Aberta', in_analysis: 'Em Análise', closed: 'Encerrada' };
  const stBadge  = { open: 'badge-danger', in_analysis: 'badge-warning', closed: 'badge-success' };

  let filteredNCs = [];

  function getSelectedStatuses() {
    const sel = document.getElementById('rel_status');
    return Array.from(sel.options).filter(o => o.selected).map(o => o.value);
  }

  function aplicarFiltros() {
    const statuses = getSelectedStatuses();
    const start = document.getElementById('rel_start').value;
    const end   = document.getElementById('rel_end').value;

    filteredNCs = allNCs.filter(nc => {
      if (statuses.length && !statuses.includes(nc.status)) return false;
      // Lexicographic comparison works correctly for ISO YYYY-MM-DD date strings
      const dateStr = nc.openedAt || nc.createdAt || '';
      if (start && dateStr && dateStr < start) return false;
      if (end   && dateStr && dateStr > end)   return false;
      return true;
    });

    renderTabela(filteredNCs);
    document.getElementById('resultadoRelatorio').style.display = 'block';
    document.getElementById('btnGerarPdf').style.display = filteredNCs.length ? 'inline-flex' : 'none';
  }

  function renderTabela(ncs) {
    document.getElementById('resultCount').textContent = ncs.length + ' NC(s) encontrada(s)';
    const tbody = document.getElementById('relatorioTbody');
    if (!ncs.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#6c757d;padding:20px;">Nenhuma NC encontrada para os filtros selecionados.</td></tr>';
      return;
    }
    tbody.innerHTML = ncs.map(nc => \`
      <tr>
        <td style="font-weight:700;color:#E74C3C;">\${nc.code || '—'}</td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="\${nc.title || ''}">\${nc.title || '—'}</td>
        <td>\${nc.type || '—'}</td>
        <td><span class="badge" style="background-color:\${sevColor[nc.severity]||'#666'};color:#fff;">\${sevLabel[nc.severity]||nc.severity||'—'}</span></td>
        <td><span class="badge \${stBadge[nc.status]||''}">\${stLabel[nc.status]||nc.status||'—'}</span></td>
        <td>\${nc.responsible || '—'}</td>
        <td style="font-size:12px;color:#6c757d;">\${nc.openedAt || nc.createdAt || '—'}</td>
        <td style="font-size:12px;color:#6c757d;">\${nc.dueDate || '—'}</td>
      </tr>
    \`).join('');
  }

  function gerarPDF() {
    const statuses = getSelectedStatuses();
    const start = document.getElementById('rel_start').value;
    const end   = document.getElementById('rel_end').value;
    const params = new URLSearchParams();
    statuses.forEach(s => params.append('status', s));
    if (start) params.set('start', start);
    if (end)   params.set('end', end);
    window.open('/qualidade/api/report/pdf?' + params.toString(), '_blank');
  }
  </script>
  `

  return c.html(layout('Qualidade — Relatórios NC', content, 'qualidade', userInfo))
})

// ── API: GET /qualidade/api/report/pdf ───────────────────────────────────────
// Period filter is based on `openedAt` (fallback: `createdAt`).
// Accepts query params: status (repeatable), start (YYYY-MM-DD), end (YYYY-MM-DD).
app.get('/api/report/pdf', (c) => {
  const unauth = ensureAuthOr401(c)
  if (unauth) return unauth

  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)

  const statusParam = c.req.queries('status') || []
  const start = c.req.query('start') || ''
  const end   = c.req.query('end')   || ''

  const sevLabel: Record<string, string> = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' }
  const stLabel:  Record<string, string> = { open: 'Aberta', in_analysis: 'Em Análise', closed: 'Encerrada' }
  const sevColor: Record<string, string> = { low: '#65a30d', medium: '#d97706', high: '#ea580c', critical: '#dc2626' }

  const allNCs: any[] = (tenant as any).nonConformances || []

  const filtered = allNCs.filter(nc => {
    if (statusParam.length && !statusParam.includes(nc.status)) return false
    // Lexicographic comparison works correctly for ISO YYYY-MM-DD date strings
    const dateStr: string = nc.openedAt || nc.createdAt || ''
    if (start && dateStr && dateStr < start) return false
    if (end   && dateStr && dateStr > end)   return false
    return true
  })

  const generatedAt = new Date().toLocaleString('pt-BR')

  const statusLabels = statusParam.length
    ? statusParam.map(s => stLabel[s] || s).join(', ')
    : 'Todos'

  const periodLabel = start || end
    ? `${start || '—'} a ${end || '—'}`
    : 'Todo o período'

  const rowsHtml = filtered.length
    ? filtered.map(nc => `
      <tr>
        <td>${escapeHtml(nc.code || '—')}</td>
        <td>${escapeHtml(nc.title || '—')}</td>
        <td>${escapeHtml(nc.type || '—')}</td>
        <td style="color:${sevColor[nc.severity] || '#333'};font-weight:600;">${escapeHtml(sevLabel[nc.severity] || nc.severity || '—')}</td>
        <td>${escapeHtml(stLabel[nc.status] || nc.status || '—')}</td>
        <td>${escapeHtml(nc.responsible || '—')}</td>
        <td>${escapeHtml(nc.openedAt || nc.createdAt || '—')}</td>
        <td>${escapeHtml(nc.dueDate || '—')}</td>
      </tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center;color:#666;padding:16px;">Nenhuma NC encontrada para os filtros selecionados.</td></tr>'

  const logoHtml = (() => {
    try {
      const logoUrl = (tenant as any).groupLogoUrl || (tenant as any).logoUrl || ''
      if (logoUrl) {
        return `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="height:50px;object-fit:contain;margin-bottom:8px;">`
      }
    } catch {}
    return ''
  })()

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório de NCs — ${escapeHtml(userInfo.empresa)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #222; }
    h1 { color: #1B4F72; font-size: 20px; margin: 0 0 4px; }
    .subtitle { font-size: 13px; color: #6c757d; margin-bottom: 16px; }
    .filters { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; font-size: 12px; }
    .filters strong { color: #374151; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #1B4F72; color: #fff; padding: 8px 10px; border: 1px solid #bbb; text-align: left; font-size: 12px; }
    td { padding: 7px 10px; border: 1px solid #ddd; font-size: 12px; vertical-align: top; }
    tr:nth-child(even) td { background: #f8f9fa; }
    .footer { margin-top: 28px; font-size: 11px; color: #999; border-top: 1px solid #e0e0e0; padding-top: 10px; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:12px;">
    ${logoHtml}
    <div>
      <h1><i class="fas fa-clipboard-list"></i> Relatório de Não Conformidades</h1>
      <div class="subtitle">${escapeHtml(userInfo.empresa)} · Gerado em ${generatedAt}</div>
    </div>
  </div>
  <div class="filters">
    <strong>Filtros aplicados:</strong>
    Status: ${escapeHtml(statusLabels)} &nbsp;|&nbsp;
    Período (abertura): ${escapeHtml(periodLabel)} &nbsp;|&nbsp;
    Total: ${filtered.length} NC(s)
  </div>
  <table>
    <thead>
      <tr>
        <th>Código NC</th>
        <th>Título</th>
        <th>Tipo</th>
        <th>Severidade</th>
        <th>Status</th>
        <th>Responsável</th>
        <th>Abertura</th>
        <th>Prazo</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">PCPSyncrus · Relatório NC · ${generatedAt}</div>
  <script>window.onload = function(){ window.print(); }</script>
</body>
</html>`

  return c.html(html)
})

export default app
