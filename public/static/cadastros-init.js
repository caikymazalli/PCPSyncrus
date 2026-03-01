/**
 * cadastros-init.js
 * Funções do módulo de cadastros (Fornecedores).
 * Espera que as variáveis globais suppliersData, supplierProductMapData e
 * allCategoriesData sejam definidas no script inline da página antes
 * de qualquer interação do usuário.
 */

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
    row2('Nome Fantasia', s.tradeName || s.fantasia || '\u2014') +
    row2('CNPJ / Tax ID', s.cnpj || '\u2014') +
    row2('Tipo', '<span class="badge" style="background:' + tiBg + ';color:' + tiColor + ';">' + tiLabel + '</span>') +
    row2('Contato', s.contact || '\u2014') +
    row2('E-mail', s.email ? '<a href="mailto:' + s.email + '" style="color:#2980B9;">' + s.email + '</a>' : '\u2014') +
    row2('Telefone', s.phone || s.tel || '\u2014') +
    row2('Cidade / Estado', (s.city || '\u2014') + ' \u2014 ' + (s.state || '')) +
    row2('Pa\u00eds', s.country || 'Brasil') +
    row2('Categoria', s.category || '\u2014') +
    row2('Prazo Entrega', '<strong>' + (s.deliveryLeadDays || 0) + ' dias</strong>') +
    row2('Pgto', s.paymentTerms || '\u2014') +
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
    var catLegacyMap = { materia_prima: 'Mat\u00e9ria-Prima', componente: 'Componente', fixador: 'Fixador', embalagem: 'Embalagem', servico: 'Servi\u00e7o' };
    var cat = s.category || '';
    catEl.value = catLegacyMap[cat] || cat || 'Mat\u00e9ria-Prima';
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

  if (!name) { showToast('Informe o nome (Raz\u00e3o Social)!', 'error'); return; }
  if (type === 'nacional' && !cnpj) { showToast('CNPJ obrigat\u00f3rio para fornecedor Nacional!', 'error'); return; }
  if (type === 'nacional' && cnpj) {
    var cnpjDigits = cnpj.replace(/\D/g, '');
    if (cnpjDigits.length !== 14) { showToast('CNPJ inv\u00e1lido! Informe no formato XX.XXX.XXX/XXXX-XX (14 d\u00edgitos)', 'error'); return; }
  }
  if (!email) { showToast('E-mail obrigat\u00f3rio!', 'error'); return; }
  if (!deliveryLeadDays || parseInt(String(deliveryLeadDays)) < 1) { showToast('Informe o prazo m\u00ednimo de entrega (dias)!', 'error'); return; }

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

console.log('[CADASTROS] cadastros-init.js carregado');
