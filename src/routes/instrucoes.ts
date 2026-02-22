import { Hono } from 'hono'
import { layout } from '../layout'
import { mockData } from '../data'

const app = new Hono()

app.get('/', (c) => {
  const { workInstructions, products } = mockData

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { published: 'badge-success', approved: 'badge-info', review: 'badge-warning', draft: 'badge-secondary' }
    const label: Record<string, string> = { published: 'Publicada', approved: 'Aprovada', review: 'Em Revisão', draft: 'Rascunho' }
    return `<span class="badge ${map[s] || 'badge-secondary'}">${label[s] || s}</span>`
  }

  const content = `
  <!-- Header -->
  <div class="section-header">
    <div style="font-size:14px;color:#6c757d;">Gestão de Instruções de Trabalho e Documentação</div>
    <button class="btn btn-primary" onclick="openModal('novaITModal')" title="Criar nova instrução de trabalho"><i class="fas fa-plus"></i> Nova Instrução</button>
  </div>

  <!-- Stats Row -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;">
    <div class="kpi-card">
      <div style="font-size:24px;font-weight:800;color:#27AE60;">${workInstructions.filter(w => w.status === 'published').length}</div>
      <div style="font-size:12px;color:#6c757d;margin-top:4px;"><i class="fas fa-check-circle" style="color:#27AE60;"></i> Publicadas</div>
    </div>
    <div class="kpi-card">
      <div style="font-size:24px;font-weight:800;color:#3498DB;">${workInstructions.filter(w => w.status === 'approved').length}</div>
      <div style="font-size:12px;color:#6c757d;margin-top:4px;"><i class="fas fa-thumbs-up" style="color:#3498DB;"></i> Aprovadas</div>
    </div>
    <div class="kpi-card">
      <div style="font-size:24px;font-weight:800;color:#F39C12;">${workInstructions.filter(w => w.status === 'review').length}</div>
      <div style="font-size:12px;color:#6c757d;margin-top:4px;"><i class="fas fa-eye" style="color:#F39C12;"></i> Em Revisão</div>
    </div>
    <div class="kpi-card">
      <div style="font-size:24px;font-weight:800;color:#9ca3af;">${workInstructions.filter(w => w.status === 'draft').length}</div>
      <div style="font-size:12px;color:#6c757d;margin-top:4px;"><i class="fas fa-edit" style="color:#9ca3af;"></i> Rascunhos</div>
    </div>
  </div>

  <div data-tab-group="it">
    <div class="tab-nav">
      <button class="tab-btn active" onclick="switchTab('tabListaIT','it')"><i class="fas fa-list" style="margin-right:6px;"></i>Todas as Instruções</button>
      <button class="tab-btn" onclick="switchTab('tabPendentes','it')"><i class="fas fa-clock" style="margin-right:6px;"></i>Pendentes de Aprovação</button>
    </div>

    <!-- Lista Completa -->
    <div class="tab-content active" id="tabListaIT">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;">
        ${workInstructions.map(wi => `
        <div class="card" style="padding:0;overflow:hidden;">
          <div style="padding:16px;background:linear-gradient(135deg,#f8fafc,#fff);border-bottom:1px solid #f1f3f5;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
              <div style="flex:1;padding-right:8px;">
                <div style="font-size:15px;font-weight:700;color:#1B4F72;">${wi.title}</div>
                <div style="font-size:11px;color:#9ca3af;margin-top:3px;font-family:monospace;">${wi.code} • v${wi.version}.0</div>
              </div>
              ${statusBadge(wi.status)}
            </div>
            ${wi.productName ? `<div style="font-size:12px;color:#6c757d;"><i class="fas fa-box" style="margin-right:5px;color:#2980B9;"></i>${wi.productName}</div>` : '<div style="font-size:12px;color:#9ca3af;"><i class="fas fa-globe" style="margin-right:5px;"></i>Instrução Geral</div>'}
            <!-- Step count -->
            <div style="margin-top:6px;font-size:11px;color:#6c757d;">
              <i class="fas fa-list-ol" style="margin-right:4px;"></i>${wi.steps.length} passos
              ${wi.steps.some((s: any) => s.hasPhoto) ? `<span style="margin-left:8px;"><i class="fas fa-camera" style="color:#2980B9;"></i> ${wi.steps.filter((s: any) => s.hasPhoto).length} fotos</span>` : ''}
            </div>
          </div>
          <div style="padding:12px 16px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
              <div style="font-size:11px;color:#9ca3af;">
                <i class="fas fa-user" style="margin-right:4px;"></i>Criado por: <strong style="color:#374151;">${wi.createdBy}</strong>
              </div>
              ${wi.approvedBy ? `<div style="font-size:11px;color:#9ca3af;"><i class="fas fa-check" style="margin-right:4px;color:#27AE60;"></i><strong style="color:#374151;">${wi.approvedBy}</strong></div>` : '<div style="font-size:11px;color:#F39C12;"><i class="fas fa-clock" style="margin-right:4px;"></i>Aguardando aprovação</div>'}
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="viewInstruction('${wi.id}')" title="Visualizar instrução completa"><i class="fas fa-eye"></i> Visualizar</button>
              <div class="tooltip-wrap" data-tooltip="Editar instrução"><button class="btn btn-secondary btn-sm" onclick="editInstruction('${wi.id}')"><i class="fas fa-edit"></i></button></div>
              ${wi.status === 'review' ? `<div class="tooltip-wrap" data-tooltip="Aprovar instrução"><button class="btn btn-success btn-sm" onclick="alert('Instrução aprovada!')"><i class="fas fa-check"></i></button></div>` : ''}
              <div class="tooltip-wrap" data-tooltip="Excluir instrução"><button class="btn btn-danger btn-sm" onclick="if(confirm('Excluir?')) alert('Removida.')"><i class="fas fa-trash"></i></button></div>
            </div>
          </div>
        </div>`).join('')}
      </div>
    </div>

    <!-- Pendentes Tab -->
    <div class="tab-content" id="tabPendentes">
      ${workInstructions.filter(w => w.status === 'review' || w.status === 'approved').length === 0
        ? '<div class="card" style="padding:40px;text-align:center;"><i class="fas fa-check-double" style="font-size:48px;color:#27AE60;margin-bottom:12px;"></i><div style="font-size:16px;font-weight:600;color:#374151;">Nenhuma instrução pendente de aprovação</div></div>'
        : `<div class="card" style="overflow:hidden;"><div class="table-wrapper"><table>
            <thead><tr><th>Código</th><th>Título</th><th>Produto</th><th>Versão</th><th>Status</th><th>Criado por</th><th>Ações</th></tr></thead>
            <tbody>
              ${workInstructions.filter(w => w.status === 'review' || w.status === 'draft').map(wi => `
              <tr>
                <td><span style="font-family:monospace;font-size:12px;background:#f1f5f9;padding:2px 8px;border-radius:4px;">${wi.code}</span></td>
                <td style="font-weight:600;color:#374151;">${wi.title}</td>
                <td style="font-size:12px;color:#6c757d;">${wi.productName || 'Geral'}</td>
                <td><span class="chip" style="background:#f1f5f9;color:#374151;">v${wi.version}.0</span></td>
                <td>${statusBadge(wi.status)}</td>
                <td style="font-size:12px;color:#6c757d;">${wi.createdBy}</td>
                <td>
                  <div style="display:flex;gap:4px;">
                    <div class="tooltip-wrap" data-tooltip="Visualizar"><button class="btn btn-secondary btn-sm" onclick="viewInstruction('${wi.id}')"><i class="fas fa-eye"></i></button></div>
                    ${wi.status === 'review' ? `<div class="tooltip-wrap" data-tooltip="Aprovar instrução"><button class="btn btn-success btn-sm" onclick="alert('Aprovada!')"><i class="fas fa-check"></i> Aprovar</button></div>` : ''}
                    ${wi.status === 'draft' ? `<div class="tooltip-wrap" data-tooltip="Enviar para revisão"><button class="btn btn-info btn-sm" onclick="alert('Enviada para revisão!')" style="background:#3498DB;color:white;"><i class="fas fa-paper-plane"></i> Enviar</button></div>` : ''}
                  </div>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div></div>`
      }
    </div>
  </div>

  <!-- Nova IT Modal (com lista de passos + foto) -->
  <div class="modal-overlay" id="novaITModal">
    <div class="modal" style="max-width:680px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-book" style="margin-right:8px;"></i>Nova Instrução de Trabalho</h3>
        <button onclick="closeModal('novaITModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;" id="novaITBody">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Título da Instrução *</label><input class="form-control" id="it_titulo" type="text" placeholder="Ex: Procedimento de Usinagem CNC"></div>
          <div class="form-group"><label class="form-label">Código *</label><input class="form-control" id="it_codigo" type="text" placeholder="IT-CNC-006"></div>
          <div class="form-group"><label class="form-label">Versão</label><input class="form-control" id="it_versao" type="number" value="1" min="1"></div>
          <div class="form-group"><label class="form-label">Produto Relacionado</label>
            <select class="form-control" id="it_produto"><option value="">Geral (sem produto específico)</option>${products.map(p => `<option>${p.name}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label class="form-label">Status Inicial</label>
            <select class="form-control" id="it_status"><option value="draft">Rascunho</option><option value="review">Em Revisão</option></select>
          </div>
          <div class="form-group"><label class="form-label">Criado por *</label>
            <select class="form-control" id="it_criador">${mockData.users.map(u => `<option>${u.name}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label class="form-label">Aprovado por</label>
            <select class="form-control" id="it_aprovador"><option value="">— Pendente —</option>${mockData.users.filter(u => u.role === 'admin' || u.role === 'gestor_pcp').map(u => `<option>${u.name}</option>`).join('')}</select>
          </div>
        </div>

        <!-- Lista de Passos -->
        <div style="border-top:1px solid #f1f3f5;padding-top:16px;margin-top:4px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <label class="form-label" style="margin:0;font-size:14px;"><i class="fas fa-list-ol" style="margin-right:6px;color:#1B4F72;"></i>Passos da Instrução *</label>
            <button class="btn btn-secondary btn-sm" onclick="addStep()" title="Adicionar novo passo"><i class="fas fa-plus"></i> Adicionar Passo</button>
          </div>
          <div id="stepsList">
            <!-- Step 1 default -->
            <div class="step-edit-item" style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:10px;border-left:3px solid #1B4F72;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <div style="width:26px;height:26px;border-radius:50%;background:#1B4F72;color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">1</div>
                <input class="form-control" type="text" placeholder="Descreva este passo da instrução..." style="flex:1;">
                <button onclick="this.closest('.step-edit-item').remove();renumberSteps()" class="btn btn-danger btn-sm" title="Remover passo"><i class="fas fa-trash"></i></button>
              </div>
              <!-- Photo upload for step -->
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="this.nextElementSibling.click()" title="Adicionar foto a este passo">
                  <i class="fas fa-camera"></i> Adicionar Foto
                </button>
                <input type="file" accept="image/*" style="display:none;" onchange="previewStepPhoto(this)">
                <span style="font-size:11px;color:#9ca3af;">Opcional — JPG, PNG, WEBP</span>
              </div>
              <div class="step-photo-preview" style="display:none;margin-top:8px;"></div>
            </div>
          </div>
        </div>

        <div class="form-group" style="margin-top:16px;"><label class="form-label">Notas / EPI Necessários</label><textarea class="form-control" id="it_notas" rows="2" placeholder="EPI necessários, cuidados especiais, normas aplicáveis..."></textarea></div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaITModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="saveIT('draft')" class="btn btn-secondary"><i class="fas fa-save"></i> Salvar Rascunho</button>
        <button onclick="saveIT('review')" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Enviar para Revisão</button>
      </div>
    </div>
  </div>

  <!-- View IT Modal (com lista de passos + fotos) -->
  <div class="modal-overlay" id="viewITModal">
    <div class="modal" style="max-width:680px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <div id="viewITHeader">
          <div style="font-size:17px;font-weight:700;color:#1B4F72;" id="viewITTitle">Instrução de Trabalho</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:2px;" id="viewITSubtitle"></div>
        </div>
        <button onclick="closeModal('viewITModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;" id="viewITContent"></div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:space-between;align-items:center;">
        <button onclick="alert('Abrindo para impressão...')" class="btn btn-secondary"><i class="fas fa-print"></i> Imprimir</button>
        <button onclick="closeModal('viewITModal')" class="btn btn-primary"><i class="fas fa-times"></i> Fechar</button>
      </div>
    </div>
  </div>

  <script>
  const instructions = ${JSON.stringify(workInstructions)};
  let stepCount = 1;

  const statusColors = { published: '#27AE60', approved: '#3498DB', review: '#F39C12', draft: '#9ca3af' };
  const statusLabels = { published: 'Publicada', approved: 'Aprovada', review: 'Em Revisão', draft: 'Rascunho' };

  function viewInstruction(id) {
    const wi = instructions.find(x => x.id === id);
    if (!wi) return;
    document.getElementById('viewITTitle').textContent = wi.title;
    document.getElementById('viewITSubtitle').innerHTML =
      wi.code + ' • v' + wi.version + '.0' +
      ' <span class="badge badge-' + (wi.status === 'published' ? 'success' : wi.status === 'approved' ? 'info' : wi.status === 'review' ? 'warning' : 'secondary') + '" style="margin-left:8px;">' + (statusLabels[wi.status] || wi.status) + '</span>';

    let html = '<div style="background:#f8f9fa;border-radius:10px;padding:14px;margin-bottom:16px;">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">' +
      '<div><div style="font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Produto</div><div style="font-size:13px;font-weight:600;">' + (wi.productName || 'Geral') + '</div></div>' +
      '<div><div style="font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Criado por</div><div style="font-size:13px;font-weight:600;">' + wi.createdBy + '</div></div>' +
      '<div><div style="font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Aprovado por</div><div style="font-size:13px;font-weight:600;color:' + (wi.approvedBy ? '#27AE60' : '#F39C12') + ';">' + (wi.approvedBy || 'Pendente') + '</div></div>' +
      '</div></div>';

    html += '<div style="font-weight:700;margin-bottom:12px;color:#1B4F72;font-size:14px;"><i class="fas fa-list-ol" style="margin-right:8px;"></i>Procedimento (' + wi.steps.length + ' passos):</div>';

    wi.steps.forEach((step, i) => {
      html += '<div style="display:flex;gap:12px;margin-bottom:12px;background:#f8f9fa;border-radius:8px;padding:12px;">' +
        '<div style="width:28px;height:28px;border-radius:50%;background:#1B4F72;color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">' + (i+1) + '</div>' +
        '<div style="flex:1;">' +
        '<div style="font-size:13px;color:#374151;line-height:1.5;">' + step.description + '</div>';
      if (step.hasPhoto && step.photo) {
        html += '<div style="margin-top:10px;"><img src="' + step.photo + '" alt="Foto do passo ' + (i+1) + '" style="max-width:100%;max-height:200px;border-radius:6px;border:1px solid #e9ecef;object-fit:cover;"></div>';
      }
      html += '</div></div>';
    });

    document.getElementById('viewITContent').innerHTML = html;
    openModal('viewITModal');
  }

  function editInstruction(id) {
    const wi = instructions.find(x => x.id === id);
    if (!wi) return;
    document.getElementById('it_titulo').value = wi.title;
    document.getElementById('it_codigo').value = wi.code;
    document.getElementById('it_versao').value = wi.version;
    // Rebuild steps list
    const list = document.getElementById('stepsList');
    list.innerHTML = '';
    stepCount = 0;
    wi.steps.forEach(step => {
      stepCount++;
      const div = document.createElement('div');
      div.className = 'step-edit-item';
      div.style.cssText = 'background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:10px;border-left:3px solid #1B4F72;';
      div.innerHTML = buildStepHTML(stepCount, step.description, step.photo || null);
      list.appendChild(div);
    });
    openModal('novaITModal');
  }

  function buildStepHTML(num, desc, photoUrl) {
    let html = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
      '<div style="width:26px;height:26px;border-radius:50%;background:#1B4F72;color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">' + num + '</div>' +
      '<input class="form-control" type="text" placeholder="Descreva este passo..." style="flex:1;" value="' + (desc || '') + '">' +
      '<button onclick="this.closest(\\'.step-edit-item\\').remove();renumberSteps()" class="btn btn-danger btn-sm" title="Remover passo"><i class="fas fa-trash"></i></button>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
      '<button type="button" class="btn btn-secondary btn-sm" onclick="this.nextElementSibling.click()" title="Adicionar foto"><i class="fas fa-camera"></i> Foto</button>' +
      '<input type="file" accept="image/*" style="display:none;" onchange="previewStepPhoto(this)">' +
      '<span style="font-size:11px;color:#9ca3af;">Opcional</span>' +
      '</div>' +
      '<div class="step-photo-preview"' + (photoUrl ? '' : ' style="display:none;"') + '>';
    if (photoUrl) {
      html += '<img src="' + photoUrl + '" style="max-width:160px;max-height:100px;border-radius:6px;margin-top:6px;border:1px solid #e9ecef;object-fit:cover;">';
    }
    html += '</div>';
    return html;
  }

  function addStep() {
    stepCount++;
    const list = document.getElementById('stepsList');
    const div = document.createElement('div');
    div.className = 'step-edit-item';
    div.style.cssText = 'background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:10px;border-left:3px solid #1B4F72;';
    div.innerHTML = buildStepHTML(stepCount, '', null);
    list.appendChild(div);
  }

  function renumberSteps() {
    document.querySelectorAll('.step-edit-item').forEach((item, i) => {
      const badge = item.querySelector('[style*="border-radius:50%"]');
      if (badge) badge.textContent = (i + 1);
    });
    stepCount = document.querySelectorAll('.step-edit-item').length;
  }

  function previewStepPhoto(input) {
    const file = input.files[0];
    if (!file) return;
    const preview = input.parentElement.nextElementSibling;
    const reader = new FileReader();
    reader.onload = e => {
      preview.style.display = 'block';
      preview.innerHTML = '<div style="position:relative;display:inline-block;margin-top:8px;">' +
        '<img src="' + e.target.result + '" style="max-width:160px;max-height:100px;border-radius:6px;border:1px solid #e9ecef;object-fit:cover;">' +
        '<button onclick="this.parentElement.parentElement.style.display=\'none\'" style="position:absolute;top:2px;right:2px;background:#E74C3C;color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;">×</button>' +
        '</div>';
    };
    reader.readAsDataURL(file);
  }

  function saveIT(status) {
    const titulo = document.getElementById('it_titulo').value;
    const codigo = document.getElementById('it_codigo').value;
    const steps = document.querySelectorAll('.step-edit-item input[type="text"]');
    if (!titulo || !codigo) { alert('Preencha o título e código da instrução!'); return; }
    if (steps.length === 0) { alert('Adicione pelo menos um passo!'); return; }
    const stLabel = { draft: 'Rascunho', review: 'Revisão' }[status] || status;
    alert('✅ Instrução "' + titulo + '" salva como ' + stLabel + '!\\n\\nPassos registrados: ' + steps.length);
    closeModal('novaITModal');
  }
  </script>
  `
  return c.html(layout('Instruções de Trabalho', content, 'instrucoes'))
})

export default app
