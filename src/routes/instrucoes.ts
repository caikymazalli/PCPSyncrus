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
    <button class="btn btn-primary" onclick="openModal('novaITModal')"><i class="fas fa-plus"></i> Nova Instrução</button>
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
              <div>
                <div style="font-size:15px;font-weight:700;color:#1B4F72;">${wi.title}</div>
                <div style="font-size:11px;color:#9ca3af;margin-top:3px;font-family:monospace;">${wi.code} • v${wi.version}.0</div>
              </div>
              ${statusBadge(wi.status)}
            </div>
            ${wi.productName ? `<div style="font-size:12px;color:#6c757d;"><i class="fas fa-box" style="margin-right:5px;color:#2980B9;"></i>${wi.productName}</div>` : '<div style="font-size:12px;color:#9ca3af;"><i class="fas fa-globe" style="margin-right:5px;"></i>Instrução Geral</div>'}
          </div>
          <div style="padding:12px 16px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
              <div style="font-size:11px;color:#9ca3af;">
                <i class="fas fa-user" style="margin-right:4px;"></i>Criado por: <strong style="color:#374151;">${wi.createdBy}</strong>
              </div>
              ${wi.approvedBy ? `<div style="font-size:11px;color:#9ca3af;"><i class="fas fa-check" style="margin-right:4px;color:#27AE60;"></i><strong style="color:#374151;">${wi.approvedBy}</strong></div>` : '<div style="font-size:11px;color:#F39C12;"><i class="fas fa-clock" style="margin-right:4px;"></i>Aguardando aprovação</div>'}
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="openModal('viewITModal')"><i class="fas fa-eye"></i> Visualizar</button>
              <button class="btn btn-secondary btn-sm" onclick="openModal('novaITModal')"><i class="fas fa-edit"></i></button>
              ${wi.status === 'review' ? `<button class="btn btn-success btn-sm" onclick="alert('Instrução aprovada!')"><i class="fas fa-check"></i></button>` : ''}
              <button class="btn btn-danger btn-sm" onclick="alert('Confirmar exclusão?')"><i class="fas fa-trash"></i></button>
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
                    <button class="btn btn-secondary btn-sm" onclick="openModal('viewITModal')"><i class="fas fa-eye"></i></button>
                    ${wi.status === 'review' ? `<button class="btn btn-success btn-sm" onclick="alert('Aprovada!')"><i class="fas fa-check"></i> Aprovar</button>` : ''}
                    ${wi.status === 'draft' ? `<button class="btn btn-info btn-sm" onclick="alert('Enviada para revisão!')" style="background:#3498DB;color:white;"><i class="fas fa-paper-plane"></i> Enviar para Revisão</button>` : ''}
                  </div>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div></div>`
      }
    </div>
  </div>

  <!-- Nova IT Modal -->
  <div class="modal-overlay" id="novaITModal">
    <div class="modal" style="max-width:640px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-book" style="margin-right:8px;"></i>Nova Instrução de Trabalho</h3>
        <button onclick="closeModal('novaITModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Título da Instrução *</label><input class="form-control" type="text" placeholder="Ex: Procedimento de Usinagem CNC"></div>
          <div class="form-group"><label class="form-label">Código *</label><input class="form-control" type="text" placeholder="IT-CNC-006"></div>
          <div class="form-group"><label class="form-label">Versão</label><input class="form-control" type="number" value="1" min="1"></div>
          <div class="form-group"><label class="form-label">Produto Relacionado</label>
            <select class="form-control"><option value="">Geral (sem produto específico)</option>${products.map(p => `<option>${p.name}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label class="form-label">Status Inicial</label>
            <select class="form-control"><option value="draft">Rascunho</option><option value="review">Em Revisão</option></select>
          </div>
          <div class="form-group"><label class="form-label">Criado por *</label>
            <select class="form-control">${mockData.users.map(u => `<option>${u.name}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label class="form-label">Aprovado por</label>
            <select class="form-control"><option value="">— Pendente —</option>${mockData.users.filter(u => u.role === 'admin' || u.role === 'gestor_pcp').map(u => `<option>${u.name}</option>`).join('')}</select>
          </div>
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Conteúdo da Instrução *</label>
            <textarea class="form-control" rows="8" placeholder="Descreva os procedimentos passo a passo...&#10;&#10;1. Verificar...&#10;2. Preparar...&#10;3. Executar...&#10;4. Inspecionar..."></textarea>
          </div>
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Notas Adicionais</label><textarea class="form-control" rows="2" placeholder="EPI necessários, cuidados especiais..."></textarea></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaITModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('Instrução salva como rascunho!');closeModal('novaITModal')" class="btn btn-secondary"><i class="fas fa-save"></i> Salvar Rascunho</button>
        <button onclick="alert('Instrução enviada para revisão!');closeModal('novaITModal')" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Enviar para Revisão</button>
      </div>
    </div>
  </div>

  <!-- View IT Modal -->
  <div class="modal-overlay" id="viewITModal">
    <div class="modal" style="max-width:680px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:17px;font-weight:700;color:#1B4F72;">Procedimento de Torneamento CNC</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:2px;">IT-CNC-001 • v3.0 <span class="badge badge-success" style="margin-left:8px;">Publicada</span></div>
        </div>
        <button onclick="closeModal('viewITModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <div style="background:#f8f9fa;border-radius:10px;padding:16px;margin-bottom:16px;">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
            <div><div style="font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Produto</div><div style="font-size:13px;font-weight:600;">Eixo T500</div></div>
            <div><div style="font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Criado por</div><div style="font-size:13px;font-weight:600;">Eng. Carlos</div></div>
            <div><div style="font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Aprovado por</div><div style="font-size:13px;font-weight:600;color:#27AE60;">Gerente Silva</div></div>
          </div>
        </div>
        <div style="font-size:14px;color:#374151;line-height:1.7;">
          <div style="font-weight:700;margin-bottom:10px;color:#1B4F72;">📋 Procedimento:</div>
          ${['Verificar as condições da máquina antes do início', 'Montar e fixar a peça no mandril conforme desenho', 'Configurar os parâmetros de corte (velocidade, avanço, profundidade)', 'Realizar o torneamento externo seguindo o roteiro', 'Verificar dimensões com paquímetro a cada 10 peças', 'Registrar os dados de produção no sistema'].map((step, i) => `
          <div style="display:flex;gap:12px;margin-bottom:10px;">
            <div style="width:24px;height:24px;border-radius:50%;background:#1B4F72;color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${i+1}</div>
            <div style="padding-top:2px;">${step}</div>
          </div>`).join('')}
          <div style="margin-top:14px;padding:12px;background:#fff3cd;border-radius:8px;border-left:4px solid #F39C12;">
            <div style="font-size:12px;font-weight:700;color:#856404;"><i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>ATENÇÃO — EPI Obrigatório</div>
            <div style="font-size:12px;color:#856404;margin-top:4px;">Óculos de proteção, luvas e protetor auricular obrigatórios durante toda a operação.</div>
          </div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:space-between;align-items:center;">
        <button onclick="alert('Abrindo para impressão...')" class="btn btn-secondary"><i class="fas fa-print"></i> Imprimir</button>
        <button onclick="closeModal('viewITModal')" class="btn btn-primary"><i class="fas fa-times"></i> Fechar</button>
      </div>
    </div>
  </div>
  `
  return c.html(layout('Instruções de Trabalho', content, 'instrucoes'))
})

export default app
