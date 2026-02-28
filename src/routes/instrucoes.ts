import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo } from '../sessionHelper'

const app = new Hono()

app.get('/', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const instructions = tenant.instructions || []

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
      <input class="form-control" type="text" id="searchInput" placeholder="Buscar instrução por título, produto ou operação..." oninput="filterInstructions()">
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
          <th>Título</th>
          <th>Produto / Operação</th>
          <th>Revisão</th>
          <th>Atualizado em</th>
          <th>Ações</th>
        </tr></thead>
        <tbody id="instructionsBody">
          ${instructions.map((inst: any) => `
          <tr data-search="${(inst.title || '').toLowerCase()} ${(inst.product || '').toLowerCase()} ${(inst.operation || '').toLowerCase()}">
            <td>
              <div style="font-weight:700;color:#1B4F72;">${inst.title || '—'}</div>
              ${inst.description ? `<div style="font-size:11px;color:#6c757d;margin-top:2px;">${inst.description}</div>` : ''}
            </td>
            <td>
              ${inst.product ? `<div style="font-size:12px;font-weight:600;color:#374151;"><i class="fas fa-box" style="color:#2980B9;margin-right:4px;"></i>${inst.product}</div>` : ''}
              ${inst.operation ? `<div style="font-size:11px;color:#6c757d;margin-top:2px;"><i class="fas fa-cog" style="margin-right:4px;"></i>${inst.operation}</div>` : '<div style="font-size:11px;color:#9ca3af;">—</div>'}
            </td>
            <td><span class="badge badge-secondary">${inst.revision || 'Rev. 1'}</span></td>
            <td style="font-size:12px;color:#6c757d;">${inst.updatedAt ? new Date(inst.updatedAt).toLocaleDateString('pt-BR') : '—'}</td>
            <td>
              <div style="display:flex;gap:4px;">
                <button class="btn btn-secondary btn-sm" title="Visualizar"><i class="fas fa-eye"></i></button>
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
          <label class="form-label">Título *</label>
          <input class="form-control" id="instrTitle" type="text" placeholder="Ex: Procedimento de Torneamento CNC">
        </div>
        <div class="form-group">
          <label class="form-label">Descrição</label>
          <textarea class="form-control" id="instrDesc" rows="3" placeholder="Breve descrição do procedimento..."></textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">Produto</label>
            <input class="form-control" id="instrProduct" type="text" placeholder="Nome do produto">
          </div>
          <div class="form-group">
            <label class="form-label">Operação</label>
            <input class="form-control" id="instrOperation" type="text" placeholder="Ex: Torneamento, Soldagem...">
          </div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaInstrucaoModal')" class="btn btn-secondary">Cancelar</button>
        <button class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <script>
  function filterInstructions() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const rows = document.querySelectorAll('#instructionsBody tr');
    rows.forEach(row => {
      const text = row.dataset.search || '';
      row.style.display = !search || text.includes(search) ? '' : 'none';
    });
  }
  </script>
  `

  return c.html(layout('Instruções de Trabalho', content, 'instrucoes', userInfo))
})

app.get('/api/instrucoes', (c) => {
  const tenant = getCtxTenant(c)
  const instructions = tenant.instructions || []
  return c.json(instructions)
})

export default app
