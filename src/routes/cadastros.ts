import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxUserId } from '../sessionHelper'
import { genId, dbInsert, dbInsertWithRetry, dbUpdate, dbDelete, ok, err } from '../dbHelpers'
import { markTenantModified } from '../userStore'

const app = new Hono()

app.get('/', (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const mockData = tenant  // per-session data
  const suppliers = (mockData as any).suppliers || []
  const productSuppliers = (mockData as any).productSuppliers || []
  const stockItems = (mockData as any).stockItems || []
  const products = (mockData as any).products || []
  const supplierCategories: any[] = (mockData as any).supplierCategories || []

  const DEFAULT_CATEGORIES = ['Matéria-Prima', 'Componente', 'Fixador', 'Embalagem', 'Serviço']
  const customCategoryNames = supplierCategories.map((c: any) => c.name)
  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...customCategoryNames])]

  const typeInfo: Record<string, { label: string, color: string, bg: string, icon: string }> = {
    nacional:  { label: 'Nacional',  color: '#16a34a', bg: '#f0fdf4', icon: 'fa-flag' },
    importado: { label: 'Importado', color: '#2980B9', bg: '#e8f4fd', icon: 'fa-globe' },
  }

  // Build product-supplier map (which products each supplier supplies)
  const supplierProductMap: Record<string, string[]> = {}
  for (const ps of productSuppliers) {
    for (const sid of ps.supplierIds) {
      if (!supplierProductMap[sid]) supplierProductMap[sid] = []
      const allItems = [...stockItems, ...products]
      const item = allItems.find((i: any) => i.code === ps.productCode)
      if (item) supplierProductMap[sid].push(item.name || ps.productCode)
    }
  }

  const allItems = [...stockItems, ...products]

  const content = `

  <script>
  var suppliersData = ${JSON.stringify(suppliers)};
  var productSuppliersData = ${JSON.stringify(productSuppliers)};
  var allItemsData = ${JSON.stringify(allItems)};
  var supplierProductMapData = ${JSON.stringify(supplierProductMap)};
  var allCategoriesData = ${JSON.stringify(allCategories)};

  // ── Filtro de fornecedores ──────────────────────────────────────────────
  function filterSuppliers() {
    var search = document.getElementById('supSearch').value.toLowerCase();
    var type = document.getElementById('supTypeFilter').value;
    var cat = document.getElementById('supCatFilter').value;
    var status = document.getElementById('supStatusFilter').value;
    document.querySelectorAll('.sup-card').forEach(function(card) {
      var matchSearch = !search || (card.dataset.search || '').includes(search);
      var matchType = !type || card.dataset.type === type;
      var matchCat = !cat || card.dataset.cat === cat;
      var matchStatus = !status || card.dataset.active === status;
      card.style.display = (matchSearch && matchType && matchCat && matchStatus) ? '' : 'none';
    });
  }

  // filterFornecedores: filtra por nome e/ou categoria (busca combinada)
  function filterFornecedores(nome, categoria) {
    document.querySelectorAll('.sup-card').forEach(function(card) {
      var matchNome = !nome || (card.dataset.search || '').includes((nome || '').toLowerCase());
      var matchCat = !categoria || card.dataset.cat === categoria;
      card.style.display = (matchNome && matchCat) ? '' : 'none';
    });
  }

  // ── Tipo de fornecedor (nacional/importado) ─────────────────────────────
  function toggleFornType(val) {
    var nac = document.getElementById('fType_nac');
    var imp = document.getElementById('fType_imp');
    if (nac) nac.style.borderColor = val === 'nacional' ? '#16a34a' : '#d1d5db';
    if (imp) imp.style.borderColor = val === 'importado' ? '#2980B9' : '#d1d5db';
    // Label e obrigatoriedade do CNPJ — usar innerHTML para evitar problemas com firstChild
    var cnpjLabel = document.getElementById('fCnpjLabel');
    var cnpjInput = document.getElementById('sup_cnpj');
    if (val === 'importado') {
      if (cnpjLabel) cnpjLabel.innerHTML = 'Tax ID / Registration <span style="color:#9ca3af;font-size:11px;">(opcional)</span>';
      if (cnpjInput) cnpjInput.placeholder = 'Tax ID ou EIN (opcional)';
    } else {
      if (cnpjLabel) cnpjLabel.innerHTML = 'CNPJ <span style="color:#dc2626;">*</span>';
      if (cnpjInput) cnpjInput.placeholder = '00.000.000/0001-00';
    }
    var ncmGroup = document.getElementById('fNcmGroup');
    if (ncmGroup) ncmGroup.style.display = val === 'importado' ? 'block' : 'none';
  }

  // ── Tipo de vinculação ──────────────────────────────────────────────────
  function toggleVincType(val) {
    var ext = document.getElementById('vincType_ext');
    var int_ = document.getElementById('vincType_int');
    var secSup = document.getElementById('vincSuppliersSection');
    var secInt = document.getElementById('vincInternalInfo');
    if (ext) ext.style.borderColor = val === 'external' ? '#2980B9' : '#d1d5db';
    if (int_) int_.style.borderColor = val === 'internal' ? '#7c3aed' : '#d1d5db';
    if (secSup) secSup.style.display = val === 'external' ? 'block' : 'none';
    if (secInt) secInt.style.display = val === 'internal' ? 'block' : 'none';
  }

  // ── Adicionar fornecedor à vinculação ───────────────────────────────────
  function addVincSupplier() {
    var list = document.getElementById('vincSupplierList');
    var count = list.children.length + 1;
    var div = document.createElement('div');
    div.className = 'vinc-supplier-row';
    div.style.cssText = 'display:grid;grid-template-columns:32px 2fr 80px auto;gap:8px;align-items:center;margin-bottom:8px;background:#f8f9fa;padding:8px;border-radius:8px;';
    var bgColors = ['#1B4F72','#9ca3af','#d1d5db'];
    var opts = suppliersData.map(function(s) { return '<option value="' + s.id + '">' + s.name + '</option>'; }).join('');
    var numBg = bgColors[count - 1] || '#d1d5db';
    div.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:' + numBg + ';color:white;border-radius:50%;font-size:11px;font-weight:700;">' + count + '</div>' +
      '<select class="form-control" style="font-size:12px;"><option value="">Selecionar fornecedor...</option>' + opts + '</select>' +
      '<select class="form-control" style="font-size:12px;"><option value="1">Principal</option><option value="2">Backup</option><option value="3">Terci\u00e1rio</option></select>' +
      '<button class="btn btn-danger btn-sm" type="button" onclick="this.closest(\'.vinc-supplier-row\').remove()"><i class="fas fa-trash"></i></button>';
    list.appendChild(div);
  }

  // ── Detalhes do fornecedor ──────────────────────────────────────────────
  function row2(label, value) {
    return '<div style="background:#f8f9fa;border-radius:8px;padding:10px 12px;">' +
      '<div style="font-size:10px;color:#9ca3af;font-weight:600;">' + label.toUpperCase() + '</div>' +
      '<div style="font-size:13px;color:#374151;margin-top:3px;">' + value + '</div>' +
      '</div>';
  }

  function openSupplierDetail(id) {
    var s = suppliersData.find(function(x) { return x.id === id; });
    if (!s) return;
    var prods = supplierProductMapData[id] || [];
    var tiLabel = s.type === 'importado' ? 'Importado' : 'Nacional';
    var tiColor = s.type === 'importado' ? '#2980B9' : '#16a34a';
    var tiBg    = s.type === 'importado' ? '#e8f4fd' : '#f0fdf4';
    var stars = '';
    for (var i = 0; i < 5; i++) {
      stars += '<i class="fas fa-star" style="font-size:14px;color:' + (i < Math.round(s.rating || 0) ? '#F39C12' : '#e9ecef') + '"></i>';
    }
    var titleEl = document.getElementById('supDetailTitle');
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-truck" style="margin-right:8px;"></i>' + s.name;
    var bodyEl = document.getElementById('supDetailBody');
    if (bodyEl) bodyEl.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
      row2('Raz\u00e3o Social', s.name) +
      row2('Nome Fantasia', s.tradeName || s.fantasia || '—') +
      row2('CNPJ / Tax ID', s.cnpj || '—') +
      row2('Tipo', '<span class="badge" style="background:' + tiBg + ';color:' + tiColor + ';">' + tiLabel + '</span>') +
      row2('Contato', s.contact || '—') +
      row2('E-mail', s.email ? '<a href="mailto:' + s.email + '" style="color:#2980B9;">' + s.email + '</a>' : '—') +
      row2('Telefone', s.phone || s.tel || '—') +
      row2('Cidade / Estado', (s.city || '—') + ' \u2014 ' + (s.state || '')) +
      row2('Pa\u00eds', s.country || 'Brasil') +
      row2('Categoria', s.category || '—') +
      row2('Prazo Entrega', '<strong>' + (s.deliveryLeadDays || 0) + ' dias</strong>') +
      row2('Pgto', s.paymentTerms || '—') +
      row2('Avalia\u00e7\u00e3o', stars + ' <span style="font-size:13px;font-weight:600;color:#374151;">' + (s.rating || 0) + '/5</span>') +
      row2('Status', s.active ? '<span class="badge badge-success">Ativo</span>' : '<span class="badge badge-secondary">Inativo</span>') +
      (prods.length > 0 ? '<div style="grid-column:span 2;background:#e8f4fd;border-radius:8px;padding:10px;"><div style="font-size:11px;font-weight:700;color:#2980B9;margin-bottom:6px;">PRODUTOS FORNECIDOS</div><div style="font-size:13px;color:#374151;">' + prods.join(', ') + '</div></div>' : '') +
      (s.notes ? '<div style="grid-column:span 2;background:#f8f9fa;border-radius:8px;padding:10px;"><div style="font-size:11px;font-weight:700;color:#9ca3af;margin-bottom:4px;">OBSERVA\u00c7\u00d5ES</div><div style="font-size:13px;color:#374151;">' + s.notes + '</div></div>' : '') +
      '</div>';
    openModal('supplierDetailModal');
  }

  // ── Editar fornecedor ───────────────────────────────────────────────────
  function setField(fid, val) {
    var el = document.getElementById(fid);
    if (el) el.value = (val !== null && val !== undefined) ? String(val) : '';
  }

  function openEditSupplier(id) {
    var s = suppliersData.find(function(x) { return x.id === id; });
    if (!s) { showToast('Fornecedor n\u00e3o encontrado', 'error'); return; }
    // Limpar campos
    ['sup_id','sup_nome','sup_fantasia','sup_cnpj','sup_email','sup_tel','sup_contato','sup_cidade','sup_estado','sup_pagamento','sup_obs','sup_prazo'].forEach(function(fid) {
      var el = document.getElementById(fid); if (el) el.value = '';
    });
    // Preencher com dados do fornecedor
    setField('sup_id',       s.id);
    setField('sup_nome',     s.name);
    setField('sup_fantasia', s.fantasia || s.tradeName);
    setField('sup_cnpj',     s.cnpj);
    setField('sup_email',    s.email);
    setField('sup_tel',      s.phone || s.tel);
    setField('sup_contato',  s.contact);
    setField('sup_cidade',   s.city);
    setField('sup_estado',   s.state);
    setField('sup_pagamento',s.paymentTerms);
    setField('sup_prazo',    s.deliveryLeadDays);
    setField('sup_obs',      s.notes || s.obs);
    // Categoria — mapear formato legado (snake_case) para display format
    var catEl = document.getElementById('sup_categoria');
    if (catEl) {
      var catLegacyMap = { materia_prima: 'Matéria-Prima', componente: 'Componente', fixador: 'Fixador', embalagem: 'Embalagem', servico: 'Serviço' };
      var cat = s.category || '';
      catEl.value = catLegacyMap[cat] || cat || 'Matéria-Prima';
    }
    // Tipo
    var tipo = s.type || 'nacional';
    document.querySelectorAll('input[name="fType"]').forEach(function(r) { r.checked = (r.value === tipo); });
    toggleFornType(tipo);
    // Título
    var tit = document.getElementById('fornModalTitle');
    if (tit) tit.innerHTML = '<i class="fas fa-edit" style="margin-right:8px;"></i>Editar Fornecedor: ' + (s.name || '');
    openModal('novoFornecedorModal');
  }

  // ── Salvar fornecedor ───────────────────────────────────────────────────
  function gv(id) { var el = document.getElementById(id); return el ? el.value : ''; }

  async function salvarFornecedor() {
    var editId      = gv('sup_id');
    var name        = gv('sup_nome');
    var cnpj        = gv('sup_cnpj');
    var email       = gv('sup_email');
    var phone       = gv('sup_tel');
    var contact     = gv('sup_contato');
    var city        = gv('sup_cidade');
    var state       = gv('sup_estado');
    var category    = gv('sup_categoria');
    var paymentTerms= gv('sup_pagamento');
    var deliveryLeadDays = gv('sup_prazo') || 0;
    var notes       = gv('sup_obs');
    var fantasia    = gv('sup_fantasia');
    var typeEl      = document.querySelector('input[name="fType"]:checked');
    var type        = typeEl ? typeEl.value : 'nacional';

    if (!name) { showToast('Informe o nome (Razão Social)!', 'error'); return; }
    if (type === 'nacional' && !cnpj) { showToast('CNPJ obrigatório para fornecedor Nacional!', 'error'); return; }
    if (type === 'nacional' && cnpj) {
      var cnpjDigits = cnpj.replace(/\D/g, '');
      if (cnpjDigits.length !== 14) { showToast('CNPJ inválido! Informe no formato XX.XXX.XXX/XXXX-XX (14 dígitos)', 'error'); return; }
    }
    if (!email) { showToast('E-mail obrigatório!', 'error'); return; }
    if (!deliveryLeadDays || parseInt(String(deliveryLeadDays)) < 1) { showToast('Informe o prazo mínimo de entrega (dias)!', 'error'); return; }

    var payload = {
      name: name, fantasia: fantasia, cnpj: cnpj, email: email, phone: phone,
      contact: contact, city: city, state: state, category: category,
      paymentTerms: paymentTerms, deliveryLeadDays: deliveryLeadDays,
      notes: notes, type: type
    };

    try {
      var url    = editId ? '/cadastros/api/supplier/' + editId : '/cadastros/api/supplier/create';
      var method = editId ? 'PUT' : 'POST';
      var res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      if (data.ok) {
        if (data.warning) {
          showToast('\u26a0\ufe0f ' + data.warning, 'warning');
          var pendingSuppliers = JSON.parse(localStorage.getItem('pending_suppliers') || '[]');
          pendingSuppliers.push(data.supplier);
          localStorage.setItem('pending_suppliers', JSON.stringify(pendingSuppliers));
        }
        if (editId) {
          var sIdx = suppliersData.findIndex(function(s) { return s.id === editId; });
          if (sIdx !== -1 && data.supplier) { suppliersData[sIdx] = Object.assign(suppliersData[sIdx], data.supplier); }
        } else if (data.supplier) {
          suppliersData.push(data.supplier);
        }
        if (!data.warning) showToast(editId ? '\u2705 Fornecedor atualizado!' : '\u2705 Fornecedor cadastrado!');
        var elId = document.getElementById('sup_id'); if (elId) elId.value = '';
        var elTit = document.getElementById('fornModalTitle');
        if (elTit) elTit.innerHTML = '<i class="fas fa-truck" style="margin-right:8px;"></i>Cadastrar Fornecedor';
        closeModal('novoFornecedorModal');
        setTimeout(function() { location.reload(); }, 800);
      } else {
        showToast(data.error || 'Erro ao salvar', 'error');
      }
    } catch(e) { showToast('Erro de conex\u00e3o', 'error'); }
  }

  // ── Salvar vinculação ───────────────────────────────────────────────────
  async function salvarVinculacao() {
    var prodEl = document.getElementById('vincProduto');
    var prod = prodEl ? prodEl.value : '';
    if (!prod) { showToast('Selecione um produto!', 'error'); return; }
    var vincTypeEl = document.querySelector('input[name="vincType"]:checked');
    var vincType = vincTypeEl ? vincTypeEl.value : 'external';
    var rows = document.querySelectorAll('.vinc-supplier-row');
    var suppliers_vinc = [];
    rows.forEach(function(row) {
      var sels = row.querySelectorAll('select');
      var sel    = sels[0];
      var priSel = sels[1];
      if (sel && sel.value) {
        suppliers_vinc.push({ supplierId: sel.value, priority: parseInt(priSel ? priSel.value : '1') });
      }
    });
    if (vincType === 'external' && suppliers_vinc.length === 0) { showToast('Adicione ao menos um fornecedor!', 'error'); return; }
    try {
      var res = await fetch('/cadastros/api/supplier/vinc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productCode: prod, type: vincType, suppliers: suppliers_vinc })
      });
      var data = await res.json();
      if (data.ok) {
        showToast('\u2705 Vincula\u00e7\u00e3o salva!');
        closeModal('vinculacaoModal');
        setTimeout(function() { location.reload(); }, 800);
      } else {
        showToast(data.error || 'Erro ao salvar vincula\u00e7\u00e3o', 'error');
      }
    } catch(e) { showToast('Erro de conex\u00e3o', 'error'); }
  }

  // ── Solicitar cotação ───────────────────────────────────────────────────
  function solicitarCotacao(id) {
    var s = suppliersData.find(function(x) { return x.id === id; });
    if (!s) return;
    showToast('\u2709\ufe0f Abrindo cota\u00e7\u00e3o para ' + s.name + '...', 'info');
    setTimeout(function() {
      window.location.href = '/suprimentos?mode=nova_cotacao&supplier_id=' + encodeURIComponent(id) + '&supplier_name=' + encodeURIComponent(s.name);
    }, 800);
  }

  // ── Nova categoria ──────────────────────────────────────────────────────
  async function salvarNovaCategoria() {
    var nome = document.getElementById('nova_categoria_nome').value.trim();
    if (!nome) { showToast('Informe o nome da categoria!', 'error'); return; }
    try {
      var res = await fetch('/cadastros/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome })
      });
      var data = await res.json();
      if (data.ok) {
        // Adicionar ao select dinamicamente
        var catSel = document.getElementById('sup_categoria');
        if (catSel) {
          var opt = document.createElement('option');
          opt.value = nome;
          opt.textContent = nome;
          catSel.appendChild(opt);
          catSel.value = nome;
        }
        // Adicionar ao filtro
        var filterSel = document.getElementById('supCatFilter');
        if (filterSel) {
          var fOpt = document.createElement('option');
          fOpt.value = nome;
          fOpt.textContent = nome;
          filterSel.appendChild(fOpt);
        }
        allCategoriesData.push(nome);
        document.getElementById('nova_categoria_nome').value = '';
        closeModal('novaCategoriaModal');
        showToast('\u2705 Categoria "' + nome + '" criada!');
      } else { showToast(data.error || 'Erro ao criar categoria', 'error'); }
    } catch(e) { showToast('Erro de conex\u00e3o', 'error'); }
  }

  // ── Ativar / Inativar fornecedor ────────────────────────────────────────
  async function toggleAtivoFornecedor(id, ativo) {
    var msg = (ativo === true || ativo === 'true') ? 'Ativar este fornecedor?' : 'Inativar este fornecedor?';
    if (!confirm(msg)) return;
    try {
      var res = await fetch('/cadastros/api/supplier/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: (ativo === true || ativo === 'true') })
      });
      var data = await res.json();
      if (data.ok) {
        showToast((ativo === true || ativo === 'true') ? '\u2705 Fornecedor ativado!' : 'Fornecedor inativado!');
        setTimeout(function() { location.reload(); }, 600);
      } else { showToast(data.error || 'Erro', 'error'); }
    } catch(e) { showToast('Erro de conex\u00e3o', 'error'); }
  }

  // ── Excluir fornecedor ──────────────────────────────────────────────────
  async function deleteFornecedor(id) {
    if (!confirm('Excluir este fornecedor?')) return;
    try {
      var res = await fetch('/cadastros/api/supplier/' + id, { method: 'DELETE' });
      var data = await res.json();
      if (data.ok) { showToast('Fornecedor exclu\u00eddo!'); setTimeout(function() { location.reload(); }, 500); }
      else showToast(data.error || 'Erro ao excluir', 'error');
    } catch(e) { showToast('Erro de conex\u00e3o', 'error'); }
  }

  // ── Toast ───────────────────────────────────────────────────────────────
  function showToast(msg, type) {
    if (!type) type = 'success';
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;color:white;box-shadow:0 4px 20px rgba(0,0,0,0.2);transition:opacity 0.3s;display:flex;align-items:center;gap:8px;max-width:360px;';
    t.style.background = type === 'success' ? '#27AE60' : type === 'error' ? '#E74C3C' : '#2980B9';
    var icon = type === 'success' ? '<i class="fas fa-check-circle"></i>' : type === 'error' ? '<i class="fas fa-exclamation-circle"></i>' : '<i class="fas fa-info-circle"></i>';
    t.innerHTML = icon + ' ' + msg;
    document.body.appendChild(t);
    setTimeout(function() {
      t.style.opacity = '0';
      setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, 3500);
  }

  // Fechar alerta crítico após 8s
  setTimeout(function() { var el = document.getElementById('noSupplierAlert'); if (el) el.style.display = 'none'; }, 8000);
</script>
  <!-- Pop-up alerta itens críticos sem fornecedor -->
  ${(() => {
    const criticalNoSupplier = allItems.filter((i: any) =>
      (i.status === 'critical' || i.stockStatus === 'critical') &&
      i.productionType === 'external' &&
      (!i.supplierIds || i.supplierIds.length === 0)
    )
    return criticalNoSupplier.length > 0 ? `
    <div id="noSupplierAlert" style="position:fixed;top:80px;right:20px;z-index:500;width:340px;background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.18);border-top:4px solid #dc2626;animation:slideInRight 0.3s ease;">
      <div style="padding:14px 16px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:32px;height:32px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-exclamation-triangle" style="color:#dc2626;font-size:14px;"></i>
          </div>
          <div>
            <div style="font-size:13px;font-weight:700;color:#dc2626;">Itens Críticos sem Fornecedor!</div>
            <div style="font-size:11px;color:#6c757d;">${criticalNoSupplier.length} item(ns) precisa(m) de fornecedor</div>
          </div>
        </div>
        <button onclick="document.getElementById('noSupplierAlert').style.display='none'" style="background:none;border:none;font-size:18px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:10px 16px 14px;">
        ${criticalNoSupplier.map((i: any) => `<div style="font-size:12px;color:#374151;padding:4px 0;border-bottom:1px solid #f8f9fa;">${i.name} — <span style="color:#dc2626;font-weight:600;">sem fornecedor cadastrado</span></div>`).join('')}
        <button onclick="document.getElementById('noSupplierAlert').style.display='none'" class="btn btn-danger btn-sm" style="width:100%;margin-top:10px;justify-content:center;">Vincular Fornecedores</button>
      </div>
    </div>
    <style>@keyframes slideInRight{from{opacity:0;transform:translateX(40px);}to{opacity:1;transform:translateX(0);}}</style>` : ''
  })()}

  <!-- Header -->
  <div class="section-header">
    <div>
      <div style="font-size:14px;color:#6c757d;">${suppliers.length} fornecedores cadastrados • Nacionais e importados</div>
      <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
        <span class="badge" style="background:#f0fdf4;color:#16a34a;"><i class="fas fa-flag" style="font-size:9px;"></i> ${suppliers.filter((s: any) => !s.type || s.type === 'nacional').length} Nacionais</span>
        <span class="badge" style="background:#e8f4fd;color:#2980B9;"><i class="fas fa-globe" style="font-size:9px;"></i> ${suppliers.filter((s: any) => s.type === 'importado').length} Importados</span>
        <span class="badge" style="background:#f0fdf4;color:#16a34a;">${suppliers.filter((s: any) => s.active !== false).length} Ativos</span>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-secondary" onclick="openModal('vinculacaoModal')" title="Vincular fornecedores a produtos">
        <i class="fas fa-link"></i> Vincular Fornecedor ↔ Produto
      </button>
      <button class="btn btn-primary" onclick="openModal('novoFornecedorModal')" title="Cadastrar novo fornecedor">
        <i class="fas fa-plus"></i> Novo Fornecedor
      </button>
    </div>
  </div>

  <!-- Tabs -->
  <div data-tab-group="cadastros">
    <div class="tab-nav">
      <button class="tab-btn active" onclick="switchTab('tabFornecedores','cadastros')">
        <i class="fas fa-truck" style="margin-right:6px;"></i>Fornecedores
      </button>
      <button class="tab-btn" onclick="switchTab('tabVinculacoes','cadastros')">
        <i class="fas fa-project-diagram" style="margin-right:6px;"></i>Vinculações Produto × Fornecedor
        <span style="background:#2980B9;color:white;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px;margin-left:4px;">${productSuppliers.length}</span>
      </button>
    </div>

    <!-- FORNECEDORES TAB -->
    <div class="tab-content active" id="tabFornecedores">
      <!-- Search -->
      <div class="card" style="padding:12px 16px;margin-bottom:14px;">
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <div class="search-box" style="flex:1;min-width:180px;">
            <i class="fas fa-search icon"></i>
            <input class="form-control" type="text" id="supSearch" placeholder="Nome, CNPJ, contato..." oninput="filterSuppliers()">
          </div>
          <select class="form-control" id="supTypeFilter" style="width:auto;" onchange="filterSuppliers()">
            <option value="">Todos os tipos</option>
            <option value="nacional">Nacional</option>
            <option value="importado">Importado</option>
          </select>
          <select class="form-control" id="supCatFilter" style="width:auto;" onchange="filterSuppliers()">
            <option value="">Todas as categorias</option>
            ${allCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
          </select>
          <select class="form-control" id="supStatusFilter" style="width:auto;" onchange="filterSuppliers()">
            <option value="">Todos os status</option>
            <option value="1">Ativo</option>
            <option value="0">Inativo</option>
          </select>
        </div>
      </div>

      <div id="supGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;">
        ${suppliers.map((s: any) => {
          const ti = typeInfo[s.type] || typeInfo.nacional
          const prods = supplierProductMap[s.id] || []
          const stars = Math.round(s.rating)
          const starsHtml = Array.from({length:5}, (_,i) => `<i class="fas fa-star" style="font-size:11px;color:${i<stars?'#F39C12':'#e9ecef'};"></i>`).join('')
          return `
          <div class="card sup-card" data-type="${s.type}" data-cat="${s.category}" data-active="${s.active !== false ? '1' : '0'}" data-search="${s.name.toLowerCase()} ${(s.cnpj||'').toLowerCase()} ${s.contact.toLowerCase()} ${s.category.toLowerCase()}" style="padding:0;overflow:hidden;border-top:3px solid ${ti.color};">
            <div style="padding:16px;">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
                <div style="flex:1;min-width:0;padding-right:8px;">
                  <div style="font-size:15px;font-weight:700;color:#1B4F72;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${s.name}">${s.name}</div>
                  <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${s.tradeName} ${s.cnpj ? '• CNPJ: ' + s.cnpj : '• ' + s.country}</div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
                  <span class="badge" style="background:${ti.bg};color:${ti.color};">
                    <i class="fas ${ti.icon}" style="font-size:9px;"></i> ${ti.label}
                  </span>
                  ${s.active ? '<span class="badge badge-success" style="font-size:10px;">Ativo</span>' : '<span class="badge badge-secondary" style="font-size:10px;">Inativo</span>'}
                </div>
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
                <div style="background:#f8f9fa;border-radius:8px;padding:8px 10px;">
                  <div style="font-size:10px;color:#9ca3af;font-weight:600;">CONTATO</div>
                  <div style="font-size:12px;color:#374151;margin-top:2px;font-weight:500;">${s.contact}</div>
                  <div style="font-size:11px;color:#6c757d;">${s.phone}</div>
                </div>
                <div style="background:#f8f9fa;border-radius:8px;padding:8px 10px;">
                  <div style="font-size:10px;color:#9ca3af;font-weight:600;">PRAZO ENTREGA</div>
                  <div style="font-size:18px;font-weight:800;color:#1B4F72;margin-top:2px;">${s.deliveryLeadDays} <span style="font-size:11px;font-weight:400;color:#9ca3af;">dias</span></div>
                </div>
                <div style="background:#f8f9fa;border-radius:8px;padding:8px 10px;">
                  <div style="font-size:10px;color:#9ca3af;font-weight:600;">CATEGORIA</div>
                  <div style="font-size:12px;color:#374151;margin-top:2px;">${s.category}</div>
                </div>
                <div style="background:#f8f9fa;border-radius:8px;padding:8px 10px;">
                  <div style="font-size:10px;color:#9ca3af;font-weight:600;">AVALIAÇÃO</div>
                  <div style="margin-top:4px;">${starsHtml} <span style="font-size:11px;color:#6c757d;margin-left:2px;">${s.rating}</span></div>
                </div>
              </div>

              ${prods.length > 0 ? `
              <div style="background:#e8f4fd;border-radius:8px;padding:8px 10px;margin-bottom:10px;">
                <div style="font-size:10px;color:#2980B9;font-weight:600;margin-bottom:4px;"><i class="fas fa-boxes" style="margin-right:4px;"></i>PRODUTOS FORNECIDOS (${prods.length})</div>
                <div style="font-size:12px;color:#374151;">${prods.slice(0,3).join(', ')}${prods.length > 3 ? ` +${prods.length-3} mais` : ''}</div>
              </div>` : ''}

              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div style="font-size:11px;color:#6c757d;"><i class="fas fa-credit-card" style="margin-right:4px;"></i>${s.paymentTerms}</div>
                <div style="font-size:11px;color:#6c757d;"><i class="fas fa-envelope" style="margin-right:4px;"></i>${s.email}</div>
              </div>

              <div style="display:flex;gap:6px;">
                <div class="tooltip-wrap" data-tooltip="Ver detalhes do fornecedor" style="flex:1;">
                  <button class="btn btn-secondary btn-sm" style="width:100%;justify-content:center;" onclick="openSupplierDetail('${s.id}')">
                    <i class="fas fa-eye"></i> Detalhes
                  </button>
                </div>
                <div class="tooltip-wrap" data-tooltip="Editar fornecedor">
                  <button class="btn btn-secondary btn-sm" onclick="openEditSupplier('${s.id}')"><i class="fas fa-edit"></i></button>
                </div>
                <div class="tooltip-wrap" data-tooltip="Solicitar cotação">
                  <button class="btn btn-sm" style="background:#e8f4fd;color:#2980B9;border:1px solid #bee3f8;" onclick="solicitarCotacao('${s.id}')">
                    <i class="fas fa-file-invoice-dollar"></i>
                  </button>
                </div>
                <div class="tooltip-wrap" data-tooltip="${s.active ? 'Inativar fornecedor' : 'Ativar fornecedor'}">
                  <button class="btn btn-sm" style="background:${s.active ? '#fef2f2' : '#f0fdf4'};color:${s.active ? '#dc2626' : '#16a34a'};border:1px solid ${s.active ? '#fecaca' : '#bbf7d0'};" onclick="toggleAtivoFornecedor('${s.id}', ${!s.active})"><i class="fas fa-${s.active ? 'ban' : 'check-circle'}"></i></button>
                </div>
              </div>
            </div>
          </div>`
        }).join('')}
      </div>
    </div>

    <!-- VINCULAÇÕES TAB -->
    <div class="tab-content" id="tabVinculacoes">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
        <div style="font-size:14px;color:#6c757d;">Vincule fornecedores a produtos/matérias-primas com prioridade e prazo de entrega</div>
        <button class="btn btn-primary" onclick="openModal('vinculacaoModal')">
          <i class="fas fa-plus"></i> Nova Vinculação
        </button>
      </div>

      <div class="card" style="overflow:hidden;">
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Produto / Item</th><th>Tipo Produção</th><th>Fornecedores Vinculados</th><th>Prioridade</th><th>Prazo Entrega</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${productSuppliers.map((ps: any) => {
                const allItens = [...stockItems, ...products]
                const item = allItens.find((i: any) => i.code === ps.productCode)
                const linkedSuppliers = ps.supplierIds.map((sid: string) => {
                  const sup = suppliers.find((s: any) => s.id === sid)
                  const priority = ps.priorities[sid] || 1
                  return { sup, priority }
                }).sort((a: any, b: any) => a.priority - b.priority)
                return `
                <tr>
                  <td>
                    <div style="font-weight:600;color:#1B4F72;">${item?.name || ps.productCode}</div>
                    <div style="font-family:monospace;font-size:11px;color:#9ca3af;">${ps.productCode}</div>
                  </td>
                  <td>
                    ${ps.internalProduction ?
                      '<span class="badge" style="background:#f5f3ff;color:#7c3aed;"><i class="fas fa-industry" style="font-size:9px;"></i> Produção Interna</span>' :
                      '<span class="badge" style="background:#e8f4fd;color:#2980B9;"><i class="fas fa-truck" style="font-size:9px;"></i> Compra Externa</span>'
                    }
                  </td>
                  <td>
                    ${ps.internalProduction ? '<span style="color:#9ca3af;font-size:12px;">—</span>' :
                      linkedSuppliers.length > 0 ?
                      linkedSuppliers.map((ls: any) => ls.sup ? `
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                          <span style="font-size:12px;color:#374151;">${ls.sup.name}</span>
                          <span class="badge" style="background:${ls.sup.type==='importado'?'#e8f4fd':'#f0fdf4'};color:${ls.sup.type==='importado'?'#2980B9':'#16a34a'};font-size:9px;">${ls.sup.type==='importado'?'Import.':'Nac.'}</span>
                        </div>` : '').join('') :
                      '<span style="color:#dc2626;font-size:12px;"><i class="fas fa-exclamation-circle" style="margin-right:4px;"></i>Nenhum vinculado</span>'
                    }
                  </td>
                  <td>
                    ${ps.internalProduction ? '<span style="color:#9ca3af;font-size:12px;">—</span>' :
                      linkedSuppliers.length > 0 ?
                      linkedSuppliers.map((ls: any, idx: number) => `
                        <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">
                          <span style="width:20px;height:20px;border-radius:50%;background:${idx===0?'#1B4F72':'#9ca3af'};color:white;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;">${ls.priority}</span>
                          <span style="font-size:11px;color:#6c757d;">${idx===0?'Principal':'Backup'}</span>
                        </div>`).join('') :
                      '—'
                    }
                  </td>
                  <td>
                    ${ps.internalProduction ? `
                      <span style="font-size:12px;color:#7c3aed;font-weight:600;">${item?.leadTimeDays||'?'} dias <span style="font-weight:400;color:#9ca3af;">(produção)</span></span>` :
                      linkedSuppliers.length > 0 ?
                      linkedSuppliers.map((ls: any) => ls.sup ? `
                        <div style="font-size:12px;color:#374151;margin-bottom:3px;">${ls.sup.name}: <strong>${ls.sup.deliveryLeadDays}d</strong></div>` : '').join('') :
                      '—'
                    }
                  </td>
                  <td>
                    <div style="display:flex;gap:4px;">
                      <div class="tooltip-wrap" data-tooltip="Editar vinculação">
                        <button class="btn btn-secondary btn-sm" onclick="openModal('vinculacaoModal')"><i class="fas fa-edit"></i></button>
                      </div>
                      <div class="tooltip-wrap" data-tooltip="Solicitar cotação para este item">
                        <button class="btn btn-sm" style="background:#e8f4fd;color:#2980B9;border:1px solid #bee3f8;" onclick="alert('Cotação solicitada para ${item?.name||ps.productCode}')">
                          <i class="fas fa-file-invoice-dollar"></i>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal: Novo Fornecedor -->
  <div class="modal-overlay" id="novoFornecedorModal">
    <div class="modal" style="max-width:680px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;" id="fornModalTitle"><i class="fas fa-truck" style="margin-right:8px;"></i>Cadastrar Fornecedor</h3>
        <button onclick="closeModal('novoFornecedorModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Tipo de Fornecedor *</label>
            <div style="display:flex;gap:12px;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;" id="fType_nac">
                <input type="radio" name="fType" value="nacional" checked onchange="toggleFornType(this.value)">
                <i class="fas fa-flag" style="color:#16a34a;"></i> Nacional
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;" id="fType_imp">
                <input type="radio" name="fType" value="importado" onchange="toggleFornType(this.value)">
                <i class="fas fa-globe" style="color:#2980B9;"></i> Importado
              </label>
            </div>
          </div>
          <input type="hidden" id="sup_id" value="">
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Razão Social *</label><input class="form-control" id="sup_nome" type="text" placeholder="Nome completo da empresa"></div>
          <div class="form-group"><label class="form-label">Nome Fantasia</label><input class="form-control" id="sup_fantasia" type="text" placeholder="Nome comercial"></div>
          <div class="form-group" id="fCnpjGroup"><label class="form-label" id="fCnpjLabel">CNPJ <span style="color:#dc2626;">*</span></label><input class="form-control" id="sup_cnpj" type="text" placeholder="00.000.000/0001-00"></div>
          <div class="form-group"><label class="form-label">E-mail *</label><input class="form-control" id="sup_email" type="email" placeholder="vendas@fornecedor.com"></div>
          <div class="form-group"><label class="form-label">Telefone</label><input class="form-control" id="sup_tel" type="text" placeholder="(11) 9999-9999"></div>
          <div class="form-group"><label class="form-label">Contato Principal</label><input class="form-control" id="sup_contato" type="text" placeholder="Nome do responsável"></div>
          <div class="form-group"><label class="form-label">Categoria</label>
            <div style="display:flex;gap:6px;align-items:center;">
              <select class="form-control" id="sup_categoria" style="flex:1;">
                ${allCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
              </select>
              <button type="button" class="btn btn-secondary btn-sm" onclick="openModal('novaCategoriaModal')" title="Nova categoria" style="padding:6px 10px;flex-shrink:0;"><i class="fas fa-plus"></i></button>
            </div>
          </div>
          <div class="form-group"><label class="form-label">Cidade</label><input class="form-control" id="sup_cidade" type="text" placeholder="Cidade"></div>
          <div class="form-group"><label class="form-label">Estado / País</label><input class="form-control" id="sup_estado" type="text" placeholder="SP / Brasil"></div>
          <div class="form-group">
            <label class="form-label"><i class="fas fa-clock" style="margin-right:4px;color:#2980B9;"></i>Prazo Mínimo de Entrega (dias) *</label>
            <input class="form-control" id="sup_prazo" type="number" min="1" placeholder="Ex: 7">
          </div>
          <div class="form-group"><label class="form-label">Condições de Pagamento</label><input class="form-control" id="sup_pagamento" type="text" placeholder="Ex: 30/60/90 dias"></div>
          <div id="fNcmGroup" style="display:none;" class="form-group"><label class="form-label"><i class="fas fa-info-circle" style="margin-right:4px;color:#2980B9;"></i>Nota: NCM e Descrições PT/EN são cadastrados por produto em <a href="/suprimentos" style="color:#2980B9;font-weight:700;">Suprimentos → Importação</a></label></div>
          <div class="form-group" style="grid-column:span 2;"><label class="form-label">Observações</label><textarea class="form-control" id="sup_obs" rows="2" placeholder="Informações adicionais, certificações, condições especiais..."></textarea></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novoFornecedorModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarFornecedor()" class="btn btn-primary"><i class="fas fa-save"></i> Salvar Fornecedor</button>
      </div>
    </div>
  </div>

  <!-- Modal: Vinculação Produto × Fornecedor -->
  <div class="modal-overlay" id="vinculacaoModal">
    <div class="modal" style="max-width:620px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-link" style="margin-right:8px;"></i>Vincular Fornecedor ↔ Produto</h3>
        <button onclick="closeModal('vinculacaoModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div class="form-group">
          <label class="form-label">Produto / Item *</label>
          <select class="form-control" id="vincProduto">
            <option value="">Selecionar produto ou matéria-prima...</option>
            ${allItems.map((i: any) => `<option value="${i.code}">${i.name} (${i.code})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de Fornecimento *</label>
          <div style="display:flex;gap:10px;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 14px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;" id="vincType_ext">
              <input type="radio" name="vincType" value="external" checked onchange="toggleVincType(this.value)">
              <i class="fas fa-truck" style="color:#2980B9;"></i> Compra Externa
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 14px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;" id="vincType_int">
              <input type="radio" name="vincType" value="internal" onchange="toggleVincType(this.value)">
              <i class="fas fa-industry" style="color:#7c3aed;"></i> Produção Interna
            </label>
          </div>
        </div>
        <div id="vincSuppliersSection">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <label class="form-label" style="margin:0;">Fornecedores (arraste para reordenar prioridade)</label>
            <button class="btn btn-secondary btn-sm" onclick="addVincSupplier()"><i class="fas fa-plus"></i> Adicionar</button>
          </div>
          <div id="vincSupplierList">
            <div class="vinc-supplier-row" style="display:grid;grid-template-columns:32px 2fr 80px auto;gap:8px;align-items:center;margin-bottom:8px;background:#f8f9fa;padding:8px;border-radius:8px;">
              <div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:#1B4F72;color:white;border-radius:50%;font-size:11px;font-weight:700;">1</div>
              <select class="form-control" style="font-size:12px;">
                <option value="">Selecionar fornecedor...</option>
                ${suppliers.map((s: any) => `<option value="${s.id}">${s.name} (${s.type})</option>`).join('')}
              </select>
              <select class="form-control" style="font-size:12px;">
                <option value="1">Principal</option>
                <option value="2">Backup</option>
                <option value="3">Terciário</option>
              </select>
              <button class="btn btn-danger btn-sm" onclick="this.closest('.vinc-supplier-row').remove()"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        </div>
        <div id="vincInternalInfo" style="display:none;background:#f5f3ff;border-radius:8px;padding:14px;border-left:3px solid #7c3aed;">
          <div style="font-size:13px;color:#7c3aed;font-weight:600;margin-bottom:8px;"><i class="fas fa-industry" style="margin-right:6px;"></i>Produção Interna</div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Lead Time de Produção (dias)</label>
            <input class="form-control" type="number" min="1" placeholder="Ex: 5">
          </div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('vinculacaoModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarVinculacao()" class="btn btn-primary"><i class="fas fa-save"></i> Salvar Vinculação</button>
      </div>
    </div>
  </div>

  <!-- Modal: Detalhes Fornecedor -->
  <div class="modal-overlay" id="supplierDetailModal">
    <div class="modal" style="max-width:600px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;" id="supDetailTitle"><i class="fas fa-truck" style="margin-right:8px;"></i>Detalhes do Fornecedor</h3>
        <button onclick="closeModal('supplierDetailModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;" id="supDetailBody"></div>
      <div style="padding:14px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;">
        <button onclick="closeModal('supplierDetailModal')" class="btn btn-secondary">Fechar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Nova Categoria -->
  <div class="modal-overlay" id="novaCategoriaModal">
    <div class="modal" style="max-width:400px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:16px;font-weight:700;color:#1B4F72;"><i class="fas fa-tag" style="margin-right:8px;"></i>Nova Categoria</h3>
        <button onclick="closeModal('novaCategoriaModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div class="form-group">
          <label class="form-label">Nome da Categoria *</label>
          <input class="form-control" id="nova_categoria_nome" type="text" placeholder="Ex: Lubrificantes">
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaCategoriaModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarNovaCategoria()" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  `

  return c.html(layout('Cadastros — Fornecedores', content, 'cadastros', userInfo))
})

// ── API: POST /cadastros/api/supplier/create ─────────────────────────────────
app.post('/api/supplier/create', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.name) return err(c, 'Nome obrigatório')
  const id = genId('sup')
  const supplier = {
    id, name: body.name, cnpj: body.cnpj || '', email: body.email || '',
    phone: body.phone || '', contact: body.contact || '', city: body.city || '',
    state: body.state || '', category: body.category || '', active: true,
    type: body.type || 'nacional',
    fantasia: body.fantasia || '', tradeName: body.fantasia || '',
    rating: 0, paymentTerms: body.paymentTerms || '', deliveryLeadDays: parseInt(body.deliveryLeadDays) || 0,
    notes: body.notes || '', createdAt: new Date().toISOString(),
  }
  tenant.suppliers.push(supplier)
  console.log(`[SAVE] Fornecedor ${id} salvo em memória`)
  if (db && userId !== 'demo-tenant') {
    console.log(`[PERSIST] Persistindo fornecedor ${id} em D1...`)
    const persistResult = await dbInsertWithRetry(db, 'suppliers', {
      id, user_id: userId, name: supplier.name, cnpj: supplier.cnpj,
      email: supplier.email, phone: supplier.phone, contact: supplier.contact,
      city: supplier.city, state: supplier.state, active: 1,
      type: supplier.type, category: supplier.category,
      trade_name: supplier.tradeName,
      payment_terms: supplier.paymentTerms,
      lead_days: supplier.deliveryLeadDays,
      notes: supplier.notes,
    })
    if (persistResult.success) {
      console.log(`[SUCCESS] Fornecedor ${id} persistido em D1`)
    } else {
      console.error(`[ERROR] Falha ao persistir fornecedor ${id} em D1 após ${persistResult.attempts} tentativas: ${persistResult.error}`)
      return ok(c, {
        supplier,
        warning: 'Fornecedor salvo localmente. Falha ao salvar no banco. Sincronizará automaticamente.',
      })
    }
  }
  markTenantModified(userId)
  return ok(c, { supplier })
})

app.put('/api/supplier/:id', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id'); const body = await c.req.json().catch(() => null)
  if (!body) return err(c, 'Dados inválidos')
  const idx = tenant.suppliers.findIndex((s: any) => s.id === id)
  if (idx === -1) return err(c, 'Fornecedor não encontrado', 404)
  // Persistir todos os campos editáveis
  const s = tenant.suppliers[idx]
  s.name = body.name ?? s.name
  s.fantasia = body.fantasia ?? s.fantasia
  s.tradeName = body.fantasia ?? s.tradeName
  s.cnpj = body.cnpj ?? s.cnpj
  s.email = body.email ?? s.email
  s.phone = body.phone ?? s.phone
  s.tel = body.phone ?? s.tel
  s.contact = body.contact ?? s.contact
  s.city = body.city ?? s.city
  s.state = body.state ?? s.state
  s.category = body.category ?? s.category
  s.paymentTerms = body.paymentTerms ?? s.paymentTerms
  s.deliveryLeadDays = body.deliveryLeadDays ?? s.deliveryLeadDays
  s.notes = body.notes ?? s.notes
  s.obs = body.notes ?? s.obs
  s.type = body.type ?? s.type
  if (body.active !== undefined) s.active = body.active === true || body.active === 1
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'suppliers', id, userId, {
      name: s.name, cnpj: s.cnpj, email: s.email, phone: s.phone,
      contact: s.contact, city: s.city, state: s.state,
      category: s.category, payment_terms: s.paymentTerms,
      lead_days: s.deliveryLeadDays, notes: s.notes,
      type: s.type, active: s.active ? 1 : 0,
      trade_name: s.tradeName || s.fantasia || '',
    })
  }
  return ok(c, { supplier: s })
})

app.delete('/api/supplier/:id', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const id = c.req.param('id')
  const idx = tenant.suppliers.findIndex((s: any) => s.id === id)
  if (idx === -1) return err(c, 'Fornecedor não encontrado', 404)
  tenant.suppliers.splice(idx, 1)
  if (db && userId !== 'demo-tenant') await dbDelete(db, 'suppliers', id, userId)
  return ok(c)
})

app.get('/api/suppliers', (c) => ok(c, { suppliers: getCtxTenant(c).suppliers }))

// ── API: GET /cadastros/api/categories ───────────────────────────────────────
app.get('/api/categories', (c) => {
  const tenant = getCtxTenant(c)
  const DEFAULT_CATEGORIES = ['Matéria-Prima', 'Componente', 'Fixador', 'Embalagem', 'Serviço']
  const customNames = (tenant.supplierCategories || []).map((c: any) => c.name)
  const all = [...new Set([...DEFAULT_CATEGORIES, ...customNames])]
  return ok(c, { categories: all, custom: tenant.supplierCategories || [] })
})

// ── API: POST /cadastros/api/categories ──────────────────────────────────────
app.post('/api/categories', async (c) => {
  const db = getCtxDB(c); const userId = getCtxUserId(c); const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.name || !body.name.trim()) return err(c, 'Nome obrigatório')
  const name = body.name.trim()
  if (!tenant.supplierCategories) tenant.supplierCategories = []
  // Prevent duplicates (case-insensitive)
  const DEFAULT_CATEGORIES = ['Matéria-Prima', 'Componente', 'Fixador', 'Embalagem', 'Serviço']
  const existing = [...DEFAULT_CATEGORIES, ...tenant.supplierCategories.map((c: any) => c.name)]
  const lowerExisting = new Set(existing.map((n: string) => n.toLowerCase()))
  if (lowerExisting.has(name.toLowerCase())) {
    return err(c, 'Categoria já existe')
  }
  const id = genId('cat')
  const category = { id, name, createdAt: new Date().toISOString() }
  tenant.supplierCategories.push(category)
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'supplier_categories', { id, user_id: userId, name })
  }
  return ok(c, { category })
})

// ── API: POST /cadastros/api/supplier/vinc ───────────────────────────────────
app.post('/api/supplier/vinc', async (c) => {
  const tenant = getCtxTenant(c)
  const body = await c.req.json().catch(() => null)
  if (!body || !body.productCode) return err(c, 'Produto obrigatório')
  // Guardar vinculação na lista de productSuppliers do tenant
  if (!tenant.productSuppliers) tenant.productSuppliers = []
  // Remove vinculações anteriores do mesmo produto
  tenant.productSuppliers = tenant.productSuppliers.filter((v: any) => v.productCode !== body.productCode)
  if (body.type === 'external' && Array.isArray(body.suppliers)) {
    body.suppliers.forEach((s: any) => {
      tenant.productSuppliers.push({ id: genId('vinc'), productCode: body.productCode, supplierId: s.supplierId, priority: s.priority, type: 'external' })
    })
  } else if (body.type === 'internal') {
    tenant.productSuppliers.push({ id: genId('vinc'), productCode: body.productCode, type: 'internal' })
  }
  return ok(c, { saved: true })
})

export default app
