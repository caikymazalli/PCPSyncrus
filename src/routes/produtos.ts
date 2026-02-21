import { Hono } from 'hono'
import { layout } from '../layout'
import { mockData } from '../data'

const app = new Hono()

// Produtos page
app.get('/', (c) => {
  const { products, bomItems } = mockData

  const content = `
  <div class="section-header">
    <div style="font-size:14px;color:#6c757d;">${products.length} produtos cadastrados</div>
    <button class="btn btn-primary" onclick="openModal('novoProdModal')"><i class="fas fa-plus"></i> Novo Produto</button>
  </div>

  <!-- Search -->
  <div class="card" style="padding:14px 20px;margin-bottom:16px;">
    <div style="display:flex;gap:12px;align-items:center;">
      <div class="search-box" style="flex:1;">
        <i class="fas fa-search icon"></i>
        <input class="form-control" type="text" placeholder="Buscar por código ou nome...">
      </div>
      <select class="form-control" style="width:auto;">
        <option>Todas as unidades</option>
        <option>un</option><option>kg</option><option>m</option><option>l</option>
      </select>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
    ${products.map(p => {
      const bomCount = bomItems.filter(b => b.productCode === p.code).length
      return `
      <div class="card" style="padding:20px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;">
          <div>
            <div style="font-size:15px;font-weight:700;color:#1B4F72;">${p.name}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
              <span style="font-family:monospace;font-size:11px;background:#e8f4fd;padding:2px 8px;border-radius:4px;color:#1B4F72;font-weight:700;">${p.code}</span>
              <span class="chip" style="background:#f1f5f9;color:#374151;">${p.unit}</span>
            </div>
          </div>
        </div>
        ${p.description ? `<div style="font-size:12px;color:#6c757d;margin-bottom:14px;line-height:1.5;">${p.description}</div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
          <div style="background:#f8f9fa;border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:18px;font-weight:800;color:${bomCount > 0 ? '#1B4F72' : '#9ca3af'};">${bomCount}</div>
            <div style="font-size:10px;color:#9ca3af;margin-top:2px;">Componentes BOM</div>
          </div>
          <div style="background:#f8f9fa;border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:18px;font-weight:800;color:#27AE60;">✓</div>
            <div style="font-size:10px;color:#9ca3af;margin-top:2px;">Ativo</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          <a href="/engenharia" class="btn btn-secondary btn-sm" style="flex:1;justify-content:center;"><i class="fas fa-list-ul"></i> Ver BOM</a>
          <button class="btn btn-secondary btn-sm" onclick="openModal('novoProdModal')"><i class="fas fa-edit"></i></button>
          <button class="btn btn-danger btn-sm" onclick="alert('Confirmar?')"><i class="fas fa-trash"></i></button>
        </div>
      </div>`
    }).join('')}
  </div>

  <!-- Novo Produto Modal -->
  <div class="modal-overlay" id="novoProdModal">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-box" style="margin-right:8px;"></i>Novo Produto</h3>
        <button onclick="closeModal('novoProdModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Nome *</label><input class="form-control" type="text" placeholder="Nome do produto"></div>
          <div class="form-group"><label class="form-label">Código *</label><input class="form-control" type="text" placeholder="ENG-001"></div>
          <div class="form-group"><label class="form-label">Unidade *</label>
            <select class="form-control"><option value="un">un</option><option value="kg">kg</option><option value="m">m</option><option value="l">l</option></select>
          </div>
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Descrição</label><textarea class="form-control" rows="3" placeholder="Descrição detalhada..."></textarea></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novoProdModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('Produto criado!');closeModal('novoProdModal')" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>
  `
  return c.html(layout('Produtos', content, 'produtos'))
})

export default app
