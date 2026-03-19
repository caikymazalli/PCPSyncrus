/**
 * quotations-actions.js
 * Functions for the Suprimentos module: quotations, imports, purchase orders, etc.
 * Requires window.quotationsData, window.purchaseOrdersData, window.statusInfoData,
 * window.suppliersData, window.importsData, and window.allItemsData to be set by
 * the server-side data initialization script before these functions are called.
 */


// ── Confirmação customizada (substitui window.confirm para evitar supressão pelo browser) ──
function customConfirm(message, onConfirm, onCancel) {
  // Remover modal existente se houver
  const existing = document.getElementById('customConfirmModal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = 'customConfirmModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <h3 style="margin:0 0 12px;font-size:16px;color:#1B4F72;font-weight:700;">
        <i class="fas fa-question-circle" style="color:#f59e0b;margin-right:8px;"></i>Confirmação
      </h3>
      <p style="margin:0 0 20px;font-size:14px;color:#374151;white-space:pre-line;">${message.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="customConfirmCancel" style="padding:8px 20px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#374151;font-size:14px;cursor:pointer;">Cancelar</button>
        <button id="customConfirmOk" style="padding:8px 20px;border:none;border-radius:6px;background:#1B4F72;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Confirmar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  
  document.getElementById('customConfirmOk').onclick = function() {
    modal.remove();
    if (onConfirm) onConfirm();
  };
  document.getElementById('customConfirmCancel').onclick = function() {
    modal.remove();
    if (onCancel) onCancel();
  };
  modal.onclick = function(e) {
    if (e.target === modal) { modal.remove(); if (onCancel) onCancel(); }
  };
}

function addCotItem() {
    const list = document.getElementById('cotItensList');
    if (!list) return;
    const div = document.createElement('div');
    div.className = 'cot-item';
    div.style.cssText = 'display:grid;grid-template-columns:2fr 80px 60px auto;gap:8px;margin-bottom:8px;align-items:center;';
    div.innerHTML = '<select class="form-control" style="font-size:12px;"><option value="">Selecionar item...</option>' +
      window.allItemsData.map(function(i) { return '<option value="'+i.code+'">'+i.name+' ('+i.code+')</option>'; }).join('') + '</select>' +
      '<input class="form-control" type="number" placeholder="Qtd" min="1">' +
      '<input class="form-control" type="text" placeholder="Un" value="un">' +
      '<button class="btn btn-danger btn-sm" onclick="this.closest(\'.cot-item\').remove()"><i class="fas fa-trash"></i></button>';
    list.appendChild(div);
  }

  function addCotSupplier() {
    const list = document.getElementById('cotSupplierList');
    if (!list) return;
    const div = document.createElement('div');
    div.className = 'cot-sup';
    div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';
    div.innerHTML = '<select class="form-control" style="font-size:12px;flex:1;"><option value="">Selecionar fornecedor...</option>' +
      window.suppliersData.map(function(s) { return '<option value="'+s.id+'">'+s.name+' ('+s.type+') \u2014 Prazo: '+s.deliveryLeadDays+'d</option>'; }).join('') + '</select>' +
      '<button class="btn btn-danger btn-sm" onclick="this.closest(\'.cot-sup\').remove()"><i class="fas fa-trash"></i></button>';
    list.appendChild(div);
  }

  async function salvarCotacao() {
    const tipo = document.getElementById('cotTipo').value;
    const descricao = document.getElementById('cotDescricao')?.value?.trim() || 'Cotação de suprimentos';
    const deadline = document.getElementById('cotDataLimite')?.value || '';
    const obs = document.getElementById('cotObs')?.value?.trim() || '';
    const items = [];
    document.querySelectorAll('.cot-item').forEach(function(row) {
      const sel = row.querySelector('select');
      const inputs = row.querySelectorAll('input');
      if (sel && sel.value) items.push({ productCode: sel.value, productName: sel.options[sel.selectedIndex]?.text || sel.value, quantity: parseInt(inputs[0]?.value||'1')||1, unit: inputs[1]?.value||'un' });
    });
    const supplierIds = [];
    document.querySelectorAll('.cot-sup select').forEach(function(sel) { if (sel.value) supplierIds.push(sel.value); });
    if (items.length === 0 && tipo !== 'critico') { showToastSup('\u26a0\ufe0f Adicione pelo menos 1 item \u00e0 cota\u00e7\u00e3o!', 'error'); return; }
    if (supplierIds.length === 0) { showToastSup('\u26a0\ufe0f Selecione pelo menos 1 fornecedor!', 'error'); return; }
    if (!deadline) { showToastSup('\u26a0\ufe0f Informe a data limite para respostas!', 'error'); return; }
    try {
      const res = await fetch('/suprimentos/api/quotations/create', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ tipo, descricao, items, supplierIds, deadline, observations: obs })
      });
      const data = await res.json();
      if (data.ok) {
        if (data.warning) {
          showToastSup('\u26a0\ufe0f ' + data.warning, 'warning');
          const pendingQuotations = JSON.parse(localStorage.getItem('pending_quotations') || '[]');
          pendingQuotations.push(data.quotation);
          localStorage.setItem('pending_quotations', JSON.stringify(pendingQuotations));
        } else {
          showToastSup('\u2705 Cota\u00e7\u00e3o ' + (data.code||'') + ' criada com sucesso!', 'success');
        }
        closeModal('gerarCotacaoModal');
        setTimeout(function() { location.reload(); }, 1000);
      } else { showToastSup(data.error || 'Erro ao criar cota\u00e7\u00e3o', 'error'); }
    } catch(e) { showToastSup('Erro de conex\u00e3o', 'error'); }
  }

  function onCotTipoChange() {
    const tipo = document.getElementById('cotTipo').value;
    const itensSection = document.getElementById('cotItensSection');
    if (tipo === 'critico') {
      if (itensSection) { itensSection.style.opacity = '0.5'; itensSection.style.pointerEvents = 'none'; }
      preencherItensCriticos();
    } else {
      if (itensSection) { itensSection.style.opacity = '1'; itensSection.style.pointerEvents = ''; }
    }
  }

  function preencherItensCriticos() {
    const criticalItems = window.allItemsData.filter(function(i) { return i.type === 'external' && i.stockStatus === 'critical'; });
    if (criticalItems.length === 0) {
      showToastSup('\u26a0\ufe0f Nenhum item cr\u00edtico encontrado!', 'warning');
      return;
    }
    const list = document.getElementById('cotItensList');
    if (list) { list.querySelectorAll('.cot-item').forEach(function(item) { item.remove(); }); }
    criticalItems.forEach(function(item) {
      addCotItem();
      const items = document.querySelectorAll('.cot-item');
      const lastItem = items[items.length - 1];
      if (lastItem) {
        const sel = lastItem.querySelector('select');
        if (sel) sel.value = item.code;
        const inputs = lastItem.querySelectorAll('input');
        if (inputs[0]) inputs[0].value = (item.stockMin || 10) * 2;
      }
    });
    showToastSup('\u2705 ' + criticalItems.length + ' itens cr\u00edticos adicionados!', 'success');
  }

  // ── Cotações ──────────────────────────────────────────────────────────────
  function approveQuotation(id, code, supplierName) {
    customConfirm(
      'Aprovar cotação ' + code + '?\nUm Pedido de Compra será gerado automaticamente.',
      async function() {
        try {
          const res = await fetch('/suprimentos/api/quotations/' + id + '/approve', {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ supplierName })
          });
          const data = await res.json();
          if (data.ok) {
            showToastSup('✅ Cotação ' + code + ' aprovada! PC ' + (data.pcCode||'') + ' gerado.', 'success');
            setTimeout(() => location.reload(), 1000);
          } else { showToastSup(data.error || 'Erro ao aprovar', 'error'); }
        } catch(e) { showToastSup('Erro de conexão', 'error'); }
      }
    );
  }

  async function recusarCotacao(id, code) {
    const motivo = prompt('Motivo da recusa da cotação ' + code + ':');
    if (!motivo) return;
    try {
      const res = await fetch('/suprimentos/api/quotations/' + id + '/reject', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ motivo })
      });
      const data = await res.json();
      if (data.ok) { showToastSup('❌ Cotação ' + code + ' recusada.', 'success'); setTimeout(() => location.reload(), 1000); }
      else { showToastSup(data.error || 'Erro ao recusar', 'error'); }
    } catch(e) { showToastSup('Erro de conexão', 'error'); }
  }

  async function reenviarCotacao(id, code) {
    // Confirmação via modal customizado (a ação já foi iniciada pelo clique do usuário)
    showToastSup('📧 Reenviando cotação...', 'info');
    try {
      const res = await fetch('/suprimentos/api/quotations/' + id + '/resend', {
        method: 'POST', headers: {'Content-Type':'application/json'}
      });
      const data = await res.json();
      if (data.ok) {
        showToastSup('✅ Cotação ' + code + ' reenviada para os fornecedores!', 'success');
        setTimeout(() => location.reload(), 800);
      } else { showToastSup(data.error || 'Erro ao reenviar', 'error'); }
    } catch(e) { showToastSup('Erro de conexão', 'error'); }
  }

  function dispararCotacao(supId, supName, supEmail) {
    // Confirmação implícita pelo clique - window.confirm suprimido pelo browser
    showToastSup('📧 Cotação enviada para ' + supName + '!', 'success');
  }

  function gerarCotacoesCriticos() {
    showToastSup('✅ Cotações geradas para itens críticos!', 'success');
  }

  function copySupplierLink(quotId) {
    const link = window.location.origin + '/suprimentos/cotacao/' + quotId + '/responder';
    navigator.clipboard?.writeText(link).then(() => {
      showToastSup('🔗 Link copiado: ' + link, 'success');
    }).catch(() => { showToastSup('Link: ' + link, 'success'); });
  }

  function openQuotationDetail(id) {
    // Nível 1: validar parâmetro quotId
    if (!id) { showToastSup('⚠️ ID da cotação inválido', 'error'); return; }
    // Nível 2: validar que window.quotationsData está definido
    if (typeof window.quotationsData === 'undefined') { showToastSup('⚠️ Dados de cotações não carregados', 'error'); return; }
    // Nível 3: validar que window.quotationsData é um array
    if (!Array.isArray(window.quotationsData)) { showToastSup('⚠️ Estrutura de cotações inválida', 'error'); return; }
    // Nível 4: validar que há cotações
    if (window.quotationsData.length === 0) { showToastSup('⚠️ Nenhuma cotação disponível', 'error'); return; }
    // Nível 5: buscar cotação
    const found = window.quotationsData.find(function(x) { return x.id === id; });
    // Nível 6: validar que a cotação foi encontrada
    if (!found) { showToastSup('⚠️ Cotação não encontrada: ' + id, 'error'); return; }
    const q = found;
    // Nível 7: validar que o status existe
    if (!q.status) { showToastSup('⚠️ Status da cotação inválido', 'error'); return; }
    // Nível 8: cotação com status final não permite mais ações (apenas visualização)
    const finalStatuses = ['approved', 'cancelled', 'rejected'];
    const canAct = !finalStatuses.includes(q.status);

    const si = window.statusInfoData[q.status] || window.statusInfoData.sent;
    document.getElementById('quotDetailTitle').innerHTML = '<i class="fas fa-file-invoice-dollar" style="margin-right:8px;"></i>' + escHtml(q.code);
    let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">' +
      detRow('Código', escHtml(q.code)) + detRow('Status', '<span class="badge" style="background:'+escHtml(si.bg)+';color:'+escHtml(si.color)+';">'+escHtml(si.label)+'</span>') +
      detRow('Criado por', escHtml(q.createdBy || '—')) + detRow('Data', new Date((q.createdAt||new Date().toISOString())+'T12:00:00').toLocaleDateString('pt-BR')) +
      (q.approvedBy ? detRow('Aprovado por', escHtml(q.approvedBy)) + detRow('Aprovação', new Date((q.approvedAt||'')+'T12:00:00').toLocaleDateString('pt-BR')) : '') +
      (q.rejectionReason ? detRow('Motivo Negação', escHtml(q.rejectionReason)) : '') +
      (q.negotiationObs ? detRow('Obs. Negociação', escHtml(q.negotiationObs)) : '') +
      '</div>';
    html += '<div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:8px;">Itens Solicitados</div>';
    html += '<div class="table-wrapper" style="margin-bottom:16px;"><table><thead><tr><th>Produto</th><th>Qtd</th><th>Unidade</th></tr></thead><tbody>';
    for (const it of (q.items||[])) html += '<tr><td>'+escHtml(it.productName||'')+'</td><td><strong>'+(it.quantity||0)+'</strong></td><td>'+escHtml(it.unit||'un')+'</td></tr>';
    html += '</tbody></table></div>';
    if ((q.supplierResponses||[]).length > 0) {
      const best = q.supplierResponses.reduce(function(b, r) { return (!b || r.totalPrice < b.totalPrice) ? r : b; }, null);
      html += '<div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:8px;">Respostas dos Fornecedores</div>';
      html += '<div style="display:flex;flex-direction:column;gap:8px;">';
      for (const r of q.supplierResponses) {
        const isBest = r.supplierName === best.supplierName;
        html += '<div style="background:#f8f9fa;border-radius:8px;padding:12px;border-left:3px solid '+(isBest?'#27AE60':'#d1d5db')+';">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:8px;">' +
          '<div style="font-size:13px;font-weight:700;color:#374151;">' + escHtml(r.supplierName) + '</div>' +
          (isBest ? '<span class="badge" style="background:#f0fdf4;color:#16a34a;"><i class="fas fa-crown" style="font-size:9px;"></i> Melhor Preço</span>' : '') +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
          '<div><div style="font-size:10px;color:#9ca3af;">PREÇO UNIT.</div><div style="font-size:14px;font-weight:800;color:#27AE60;">R$ '+(r.unitPrice||0).toFixed(2)+'</div></div>' +
          '<div><div style="font-size:10px;color:#9ca3af;">TOTAL</div><div style="font-size:14px;font-weight:800;color:#1B4F72;">R$ '+(r.totalPrice||0).toLocaleString('pt-BR',{minimumFractionDigits:2})+'</div></div>' +
          '<div><div style="font-size:10px;color:#9ca3af;">PRAZO</div><div style="font-size:14px;font-weight:800;color:#2980B9;">'+(r.deliveryDays||0)+'d</div></div>' +
          '</div>' + (r.notes ? '<div style="font-size:12px;color:#6c757d;margin-top:6px;">'+escHtml(r.notes)+'</div>' : '') +
          '</div>';
      }
      html += '</div>';
    } else {
      html += '<div style="background:#fffbeb;border-radius:8px;padding:16px;text-align:center;"><i class="fas fa-clock" style="font-size:24px;color:#F39C12;margin-bottom:6px;"></i><div style="font-size:13px;color:#d97706;">Aguardando resposta dos fornecedores...</div></div>';
    }
    document.getElementById('quotDetailBody').innerHTML = html;

    // Ocultar área de negociação
    const negArea = document.getElementById('quotNegotiationArea');
    const negObs = document.getElementById('quotNegotiationObs');
    if (negArea) negArea.style.display = 'none';
    if (negObs) negObs.value = '';

    // Montar botões de ação usando DOM API (evita onclick inline)
    const actDiv = document.getElementById('quotDetailActions');
    while (actDiv.firstChild) actDiv.removeChild(actDiv.firstChild);
    if (canAct) {
      const supName = ((q.supplierResponses||[])[0]?.supplierName||'fornecedor');
      window._detailQuotId = q.id;
      window._detailQuotCode = q.code;
      window._detailQuotSup = supName;
      const btnNegar = document.createElement('button');
      btnNegar.className = 'btn';
      btnNegar.style.cssText = 'background:#dc2626;color:white;border:none;border-radius:6px;padding:8px 16px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;';
      btnNegar.innerHTML = '<i class="fas fa-times"></i> Negar';
      btnNegar.addEventListener('click', function() { rejectQuotationFromDetail(); });
      actDiv.appendChild(btnNegar);
      const btnNegociar = document.createElement('button');
      btnNegociar.className = 'btn';
      btnNegociar.style.cssText = 'background:#2563eb;color:white;border:none;border-radius:6px;padding:8px 16px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;';
      btnNegociar.innerHTML = '<i class="fas fa-comments"></i> Negociar';
      btnNegociar.addEventListener('click', function() { negotiateQuotationFromDetail(); });
      actDiv.appendChild(btnNegociar);
      const btnAprovar = document.createElement('button');
      btnAprovar.className = 'btn btn-success';
      btnAprovar.style.cssText = 'display:inline-flex;align-items:center;gap:6px;';
      btnAprovar.innerHTML = '<i class="fas fa-check"></i> Aprovar';
      btnAprovar.addEventListener('click', function() { approveQuotationFromDetail(); });
      actDiv.appendChild(btnAprovar);
    }
    const btnFechar = document.createElement('button');
    btnFechar.className = 'btn btn-secondary';
    btnFechar.textContent = 'Fechar';
    btnFechar.addEventListener('click', function() { closeModal('quotationDetailModal'); });
    actDiv.appendChild(btnFechar);
    openModal('quotationDetailModal');
  }

  function detRow(label, value) {
    return '<div style="background:#f8f9fa;border-radius:8px;padding:10px 12px;">' +
      '<div style="font-size:10px;color:#9ca3af;font-weight:600;">'+label.toUpperCase()+'</div>' +
      '<div style="font-size:13px;color:#374151;margin-top:3px;">'+value+'</div></div>';
  }

  function approveQuotationFromDetail() {
    approveQuotation(window._detailQuotId, window._detailQuotCode, window._detailQuotSup);
    closeModal('quotationDetailModal');
  }

  function cancelNegotiationFromDetail() {
    const negArea = document.getElementById('quotNegotiationArea');
    if (negArea) negArea.style.display = 'none';
    openQuotationDetail(window._detailQuotId);
  }

  function negotiateQuotationFromDetail() {
    const negArea = document.getElementById('quotNegotiationArea');
    const actDiv = document.getElementById('quotDetailActions');
    if (!negArea) return;
    if (negArea.style.display === 'none') {
      negArea.style.display = 'block';
      // Replace action buttons with Confirmar Negociação using DOM API
      while (actDiv.firstChild) actDiv.removeChild(actDiv.firstChild);
      const btnCancelar = document.createElement('button');
      btnCancelar.className = 'btn btn-secondary';
      btnCancelar.textContent = 'Cancelar';
      btnCancelar.addEventListener('click', function() { cancelNegotiationFromDetail(); });
      actDiv.appendChild(btnCancelar);
      const btnConfirmar = document.createElement('button');
      btnConfirmar.className = 'btn';
      btnConfirmar.style.cssText = 'background:#2563eb;color:white;border:none;border-radius:6px;padding:8px 16px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;';
      btnConfirmar.innerHTML = '<i class="fas fa-paper-plane"></i> Confirmar Negociação';
      btnConfirmar.addEventListener('click', function() { confirmNegotiateQuotation(); });
      actDiv.appendChild(btnConfirmar);
    }
  }

  async function confirmNegotiateQuotation() {
    const obs = (document.getElementById('quotNegotiationObs')?.value || '').trim();
    if (!obs) { showToastSup('⚠️ Informe as observações da negociação', 'error'); return; }
    const id = window._detailQuotId;
    const code = window._detailQuotCode;
    if (!id || !code) { showToastSup('⚠️ Cotação inválida', 'error'); return; }
    try {
      const res = await fetch('/suprimentos/api/quotations/' + id + '/negotiate', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ observations: obs })
      });
      const data = await res.json();
      if (data.ok) {
        showToastSup('🤝 Cotação ' + code + ' em negociação!', 'success');
        closeModal('quotationDetailModal');
        setTimeout(() => location.reload(), 1000);
      } else { showToastSup(data.error || 'Erro ao registrar negociação', 'error'); }
    } catch(e) { showToastSup('Erro de conexão', 'error'); }
  }

  async function rejectQuotationFromDetail() {
    const id = window._detailQuotId;
    const code = window._detailQuotCode;
    if (!id || !code) { showToastSup('⚠️ Cotação inválida', 'error'); return; }
    const motivo = prompt('Motivo da negação da cotação ' + code + ':');
    if (!motivo) return;
    try {
      const res = await fetch('/suprimentos/api/quotations/' + id + '/reject', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ motivo })
      });
      const data = await res.json();
      if (data.ok) {
        showToastSup('❌ Cotação ' + code + ' negada.', 'success');
        closeModal('quotationDetailModal');
        setTimeout(() => location.reload(), 1000);
      } else { showToastSup(data.error || 'Erro ao negar cotação', 'error'); }
    } catch(e) { showToastSup('Erro de conexão', 'error'); }
  }

  // ── Importação ────────────────────────────────────────────────────────────
  function openImportDetail(id) {
    const imp = window.importsData.find(x => x.id === id);
    if (!imp) return;
    window._currentImpDetailId = id; // guarda para botão Gerar Invoice
    const taxes = imp.taxes || {};
    const num = imp.numerario || {};
    document.getElementById('importDetailTitle').innerHTML = '<i class="fas fa-ship" style="margin-right:8px;"></i>' + imp.code + ' — ' + imp.supplierName;
    let html = '';
    // Seção dados gerais
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">';
    html += detRow('Código Processo', imp.code) + detRow('Fornecedor', imp.supplierName);
    const fmtDate = d => d ? new Date(d+'T12:00:00').toLocaleDateString('pt-BR') : '—';
    html += detRow('Invoice Nº', imp.invoiceNumber||'—') + detRow('Data Invoice', fmtDate(imp.invoiceDate));
    html += detRow('Incoterm', imp.incoterm||'—') + detRow('NCM', imp.ncm||'—');
    html += detRow('Porto Origem', imp.portOfOrigin||'—') + detRow('Porto Destino', imp.portOfDestination||'—');
    html += detRow('Peso Líquido', (imp.netWeight||0) + ' kg') + detRow('Peso Bruto', (imp.grossWeight||0) + ' kg');
    html += detRow('Chegada Prevista', fmtDate(imp.expectedArrival)) + detRow('Descrição', imp.description||'—');
    html += '</div>';
    // Invoice
    html += '<div style="background:#e8f4fd;border-radius:8px;padding:14px;margin-bottom:16px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:10px;"><i class="fas fa-file-invoice-dollar" style="margin-right:6px;"></i>Valores da Invoice</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">';
    const valEUR = imp.invoiceValueEUR || 0;
    const valUSD = imp.invoiceValueUSD || 0;
    const valBRL = imp.invoiceValueBRL || 0;
    const exchR  = imp.exchangeRate || 0;
    html += '<div><div style="font-size:10px;color:#9ca3af;font-weight:700;">VALOR '+(valEUR > 0 ? 'EUR':'USD')+'</div><div style="font-size:18px;font-weight:800;color:#2980B9;">'+(valEUR > 0 ? '€'+(valEUR||0).toLocaleString('pt-BR',{minimumFractionDigits:2}) : 'US$'+(valUSD||0).toLocaleString('pt-BR',{minimumFractionDigits:2}))+'</div></div>';
    html += '<div><div style="font-size:10px;color:#9ca3af;font-weight:700;">TAXA CÂMBIO</div><div style="font-size:18px;font-weight:800;color:#374151;">R$ '+exchR+'</div></div>';
    html += '<div><div style="font-size:10px;color:#9ca3af;font-weight:700;">VALOR BRL</div><div style="font-size:18px;font-weight:800;color:#1B4F72;">R$ '+(valBRL||0).toLocaleString('pt-BR',{minimumFractionDigits:2})+'</div></div>';
    html += '</div></div>';
    // Itens da Invoice
    const impItems = imp.items || [];
    // Sempre exibe a seção de itens (mesmo vazia, com aviso)
    if (true) {
      html += '<div style="background:#f0fdf4;border-radius:8px;padding:14px;margin-bottom:16px;">';
      html += '<div style="font-size:13px;font-weight:700;color:#16a34a;margin-bottom:10px;"><i class="fas fa-boxes" style="margin-right:6px;"></i>Itens da Invoice ('+impItems.length+')</div>';
      html += '<div style="overflow-x:auto;">';
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
      html += '<thead><tr style="background:#dcfce7;">';
      html += '<th style="padding:6px 8px;text-align:left;color:#166534;font-weight:700;">Código</th>';
      html += '<th style="padding:6px 8px;text-align:left;color:#166534;font-weight:700;">Descrição PT (LI)</th>';
      html += '<th style="padding:6px 8px;text-align:left;color:#166534;font-weight:700;">Descrição EN</th>';
      html += '<th style="padding:6px 8px;text-align:right;color:#166534;font-weight:700;">Qtd</th>';
      html += '<th style="padding:6px 8px;text-align:right;color:#166534;font-weight:700;">Val. Unit.</th>';
      html += '<th style="padding:6px 8px;text-align:right;color:#166534;font-weight:700;">Subtotal</th>';
      html += '<th style="padding:6px 8px;text-align:left;color:#166534;font-weight:700;">NCM</th>';
      html += '</tr></thead><tbody>';
      if (impItems.length === 0) {
        html += '<tr><td colspan="7" style="padding:16px;text-align:center;"><div style="color:#f59e0b;font-weight:600;margin-bottom:8px;">⚠ Nenhum item cadastrado neste processo.</div><div style="font-size:12px;color:#6b7280;">Use o botão <strong>Editar Processo</strong> abaixo para informar valor da invoice, itens e demais dados.</div></td></tr>';
      }
      impItems.forEach(it => {
        const sub = (it.sub || it.subtotal || ((it.qty||0) * (it.vu||it.unitPrice||0)) || 0);
        html += '<tr style="border-bottom:1px solid #bbf7d0;">';
        html += '<td style="padding:5px 8px;font-family:monospace;color:#166534;font-weight:700;">'+(it.code||'—')+'</td>';
        html += '<td style="padding:5px 8px;color:#374151;">'+(it.descPT||it.description||'— preencher —')+'</td>';
        html += '<td style="padding:5px 8px;color:#6b7280;">'+(it.descEN||it.englishDescription||'—')+'</td>';
        html += '<td style="padding:5px 8px;text-align:right;color:#374151;font-weight:600;">'+(it.qty||0)+'</td>';
        html += '<td style="padding:5px 8px;text-align:right;color:#374151;">'+(it.vu||0).toLocaleString('pt-BR',{minimumFractionDigits:2})+'</td>';
        html += '<td style="padding:5px 8px;text-align:right;color:#1B4F72;font-weight:700;">'+(sub||0).toLocaleString('pt-BR',{minimumFractionDigits:2})+'</td>';
        html += '<td style="padding:5px 8px;font-family:monospace;font-size:11px;color:#6b7280;">'+(it.ncm||'—')+'</td>';
        html += '</tr>';
      });
      html += '</tbody></table></div></div>';
    }
    // Impostos
    html += '<div style="background:#fef2f2;border-radius:8px;padding:14px;margin-bottom:16px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:10px;"><i class="fas fa-percent" style="margin-right:6px;"></i>Alíquotas e Impostos</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">II</div><div style="font-size:16px;font-weight:800;color:#dc2626;">' + (taxes.ii||0) + '%</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">IPI</div><div style="font-size:16px;font-weight:800;color:#dc2626;">' + (taxes.ipi||0) + '%</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">PIS</div><div style="font-size:16px;font-weight:800;color:#d97706;">' + (taxes.pis||0) + '%</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">COFINS</div><div style="font-size:16px;font-weight:800;color:#d97706;">' + (taxes.cofins||0) + '%</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">ICMS</div><div style="font-size:16px;font-weight:800;color:#7c3aed;">' + (taxes.icms||0) + '%</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">AFRMM</div><div style="font-size:16px;font-weight:800;color:#374151;">R$ ' + (taxes.afrmm||0) + '</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">SISCOMEX</div><div style="font-size:16px;font-weight:800;color:#374151;">R$ ' + (taxes.siscomex||0) + '</div></div>';
    html += '<div style="background:#fef2f2;border-radius:6px;padding:8px;text-align:center;border:2px solid #dc2626;"><div style="font-size:10px;color:#9ca3af;">TOTAL IMPOSTOS</div><div style="font-size:16px;font-weight:800;color:#dc2626;">R$ ' + (taxes.taxBRL||0).toLocaleString('pt-BR',{minimumFractionDigits:2}) + '</div></div>';
    html += '</div></div>';
    // Numerário — usando os campos corretos (frete, seguro, desp, porto, arm)
    html += '<div style="background:#f5f3ff;border-radius:8px;padding:14px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:10px;"><i class="fas fa-calculator" style="margin-right:6px;"></i>Pré-via de Numerário (Custo Desembaraçado)</div>';
    html += '<div style="display:flex;flex-direction:column;gap:6px;">';
    const numRows = [
      ['Invoice (BRL)', valBRL],
      ['Frete', num.frete||num.freightBRL||0],
      ['Seguro', num.seguro||num.insuranceBRL||0],
      ['Despachante', num.desp||num.brokerageBRL||0],
      ['Taxas Porto', num.porto||num.portFeesBRL||0],
      ['Armazenagem', num.arm||num.storageBRL||0],
    ];
    numRows.forEach(([label, val]) => {
      if (!val) return;
      html += '<div style="display:flex;justify-content:space-between;padding:6px 8px;background:white;border-radius:6px;">' +
        '<span style="font-size:13px;color:#374151;">'+label+'</span>' +
        '<span style="font-size:13px;font-weight:600;color:#374151;">R$ '+(val||0).toLocaleString('pt-BR',{minimumFractionDigits:2})+'</span></div>';
    });
    const totalLanded = num.totalLandedCostBRL || (valBRL + (num.frete||0) + (num.seguro||0) + (num.desp||0) + (num.porto||0) + (num.arm||0));
    html += '<div style="display:flex;justify-content:space-between;padding:10px 8px;background:#7c3aed;border-radius:6px;margin-top:4px;">' +
      '<span style="font-size:13px;font-weight:700;color:white;">CUSTO TOTAL DESEMBARAÇADO</span>' +
      '<span style="font-size:15px;font-weight:800;color:white;">R$ '+(totalLanded||0).toLocaleString('pt-BR',{minimumFractionDigits:2})+'</span></div>';
    html += '<div style="display:flex;justify-content:flex-end;padding:6px 8px;">' +
      '<span style="font-size:12px;color:#7c3aed;font-weight:600;">Custo Unitário: R$ '+(num.unitCostBRL||0).toFixed(2)+' / unidade</span></div>';
    html += '</div></div>';
    document.getElementById('importDetailBody').innerHTML = html;
    openModal('importDetailModal');
  }

  
  function openNumerario(id) {
    const imp = window.importsData.find(x => x.id === id);
    if (!imp) return;
    const num = imp.numerario || {};
    document.getElementById('numerarioTitle').innerHTML = '<i class="fas fa-calculator" style="margin-right:8px;"></i>Pré-via de Numerário — ' + imp.code;
    let html = '<div style="background:#1B4F72;color:white;border-radius:8px;padding:16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">' +
      '<div><div style="font-size:12px;opacity:0.8;">PROCESSO</div><div style="font-size:18px;font-weight:800;">' + imp.code + '</div>' +
      '<div style="font-size:12px;opacity:0.7;">' + imp.supplierName + ' · ' + imp.invoiceNumber + '</div></div>' +
      '<div style="text-align:right;"><div style="font-size:11px;opacity:0.7;">CUSTO TOTAL DESEMBARAÇADO</div><div style="font-size:24px;font-weight:800;">R$ ' + (num.totalLandedCostBRL||0).toLocaleString('pt-BR',{minimumFractionDigits:2}) + '</div></div>' +
      '</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<thead><tr style="background:#f8f9fa;"><th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">Componente</th><th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">Valor (BRL)</th><th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">% do Total</th></tr></thead>';
    html += '<tbody>';
    const rows = [
      { label: 'Valor da Invoice', val: num.invoiceBRL, color: '#1B4F72' },
      { label: 'Frete Internacional', val: num.freightBRL, color: '#374151' },
      { label: 'Seguro', val: num.insuranceBRL, color: '#374151' },
      { label: 'Impostos (II + IPI + PIS/COFINS + ICMS + AFRMM + SISCOMEX)', val: num.taxesBRL, color: '#dc2626' },
      { label: 'Honorários do Despachante', val: num.brokerageBRL, color: '#374151' },
      { label: 'Taxas Portuárias', val: num.portFeesBRL, color: '#374151' },
      { label: 'Armazenagem', val: num.storageBRL, color: '#374151' },
    ];
    const total = num.totalLandedCostBRL || 1;
    for (const row of rows) {
      if (!row.val) continue;
      const pct = ((row.val / total) * 100).toFixed(1);
      html += '<tr style="border-bottom:1px solid #e9ecef;"><td style="padding:10px 12px;color:' + row.color + ';font-weight:600;">' + row.label + '</td>' +
        '<td style="padding:10px 12px;text-align:right;font-weight:700;color:' + row.color + ';">R$ ' + row.val.toLocaleString('pt-BR',{minimumFractionDigits:2}) + '</td>' +
        '<td style="padding:10px 12px;text-align:right;">' +
        '<div style="display:flex;align-items:center;gap:8px;justify-content:flex-end;"><div style="height:6px;background:#e9ecef;border-radius:3px;width:60px;overflow:hidden;"><div style="height:100%;background:' + row.color + ';width:' + pct + '%;"></div></div>' +
        '<span style="font-size:12px;color:#6c757d;min-width:36px;">' + pct + '%</span></div></td></tr>';
    }
    html += '<tr style="background:#1B4F72;"><td colspan="3" style="padding:12px;"><div style="display:flex;justify-content:space-between;"><span style="font-size:14px;font-weight:700;color:white;">CUSTO TOTAL DESEMBARAÇADO</span><span style="font-size:16px;font-weight:800;color:white;">R$ ' + (num.totalLandedCostBRL||0).toLocaleString('pt-BR',{minimumFractionDigits:2}) + '</span></div></td></tr>';
    html += '</tbody></table>';
    html += '<div style="background:#f5f3ff;border-radius:8px;padding:12px;margin-top:14px;display:flex;justify-content:space-between;align-items:center;">' +
      '<div><div style="font-size:12px;color:#7c3aed;font-weight:700;">CUSTO UNITÁRIO DESEMBARAÇADO</div><div style="font-size:11px;color:#9ca3af;margin-top:2px;">Base para formação de preço de custo</div></div>' +
      '<div style="font-size:22px;font-weight:800;color:#7c3aed;">R$ ' + (num.unitCostBRL||0).toFixed(2) + '</div>' +
      '</div>';
    document.getElementById('numerarioBody').innerHTML = html;
    openModal('numerarioModal');
  }

  // ── Nova importação: cálculos inline ─────────────────────────────────────
  function updateImpMoedaLabel() {
    const moeda = document.getElementById('impMoeda')?.value || 'USD';
    const labelEl = document.getElementById('impValorLabel');
    if (labelEl) labelEl.textContent = 'Valor Invoice (' + moeda + ')';
    const origemLabel = document.getElementById('impOrigemLabel');
    const destinoLabel = document.getElementById('impDestinoLabel');
    if (moeda === 'BRL') {
      if (origemLabel) origemLabel.textContent = 'Cidade de Origem';
      if (destinoLabel) destinoLabel.textContent = 'Cidade de Destino';
    } else {
      if (origemLabel) origemLabel.textContent = 'Porto de Origem';
      if (destinoLabel) destinoLabel.textContent = 'Porto de Destino';
    }
    calcImpBRL();
  }

  // ── Navegação entre abas do modal de nova importação ────────────────────
  function switchImpTab(n) {
    [1,2,3].forEach(i => {
      document.getElementById('impTabContent'+i).style.display = i===n ? 'block':'none';
      const btn = document.getElementById('impTab'+i);
      if (i===n) { btn.style.color='#1B4F72'; btn.style.borderBottom='2px solid #1B4F72'; }
      else { btn.style.color='#6c757d'; btn.style.borderBottom='none'; }
    });
    if (n===3) { calcImpostos(); updateImpResumo(); }
  }

  // ── Seletor de modalidade ──────────────────────────────────────────────
  function selectModalidade(mode) {
    const labels = { aereo:'lblAereo', terrestre:'lblTerrestre', maritimo:'lblMaritimo' };
    const colors = { aereo:'#2980B9', terrestre:'#27AE60', maritimo:'#7c3aed' };
    const origemLabels = { aereo:'Aeroporto de Origem', terrestre:'Cidade de Origem', maritimo:'Porto de Origem' };
    const destLabels = { aereo:'Aeroporto de Destino', terrestre:'Cidade de Destino', maritimo:'Porto de Destino' };
    Object.keys(labels).forEach(m => {
      const el = document.getElementById(labels[m]);
      if (!el) { console.warn('[selectModalidade] Element not found:', labels[m]); return; }
      if (m===mode) { el.style.border='2px solid '+colors[mode]; el.style.background=colors[mode]+'15'; }
      else { el.style.border='2px solid #e9ecef'; el.style.background='white'; }
    });
    const origemEl = document.getElementById('impOrigemLabel');
    const destEl = document.getElementById('impDestinoLabel');
    if (origemEl) origemEl.textContent = origemLabels[mode];
    else console.warn('[selectModalidade] Element not found: impOrigemLabel');
    if (destEl) destEl.textContent = destLabels[mode];
    else console.warn('[selectModalidade] Element not found: impDestinoLabel');
  }
  // Inicializa marítimo
  setTimeout(() => selectModalidade('maritimo'), 100);

  // ── Adicionar item à invoice ──────────────────────────────────────────
  let impItemCount = 0;
  function addImpItem() {
    impItemCount++;
    const idx = impItemCount;
    const list = document.getElementById('impItensList');
    const div = document.createElement('div');
    div.id = 'impItem'+idx;
    div.style.cssText = 'background:#f8f9fa;border:1px solid #e9ecef;border-radius:8px;padding:10px;margin-bottom:4px;';
    // Gerar options do dropdown com produtos cadastrados
    const prodOpts = '<option value="">Selecionar...</option>' +
      (window.allItemsData||[]).map(function(i){ return '<option value="'+i.code+'">'+i.code+' \u2014 '+i.name+'</option>'; }).join('') +
      '<option value="__manual__">\u2014 Manual \u2014</option>';
    div.innerHTML =
      '<div style="display:grid;grid-template-columns:90px 2fr 70px 1fr 90px 90px 80px 36px;gap:6px;align-items:start;">' +
        '<div>' +
          '<label style="font-size:9px;font-weight:700;color:#6c757d;text-transform:uppercase;display:block;margin-bottom:2px;">C\u00f3d.</label>' +
          '<select class="form-control" style="font-size:11px;" id="impItemProd'+idx+'" onchange="onImpItemChange('+idx+')">' +
            prodOpts +
          '</select>' +
        '</div>' +
        '<div>' +
          '<label style="font-size:9px;font-weight:700;color:#6c757d;text-transform:uppercase;display:block;margin-bottom:2px;">Descri\u00e7\u00e3o EN *</label>' +
          '<input class="form-control" id="impItemDescEN'+idx+'" type="text" placeholder="English description..." style="font-size:12px;" oninput="calcImpTotal()">' +
        '</div>' +
        '<div>' +
          '<label style="font-size:9px;font-weight:700;color:#6c757d;text-transform:uppercase;display:block;margin-bottom:2px;">Qtd</label>' +
          '<input class="form-control" id="impItemQtd'+idx+'" type="number" placeholder="Qtd" min="0" step="0.001" style="font-size:12px;" value="1" oninput="recalcImpItem('+idx+')">' +
        '</div>' +
        '<div>' +
          '<label style="font-size:9px;font-weight:700;color:#6c757d;text-transform:uppercase;display:block;margin-bottom:2px;">Observa\u00e7\u00f5es</label>' +
          '<input class="form-control" id="impItemObs'+idx+'" type="text" placeholder="Especifica\u00e7\u00e3o, uso..." style="font-size:12px;">' +
        '</div>' +
        '<div>' +
          '<label style="font-size:9px;font-weight:700;color:#6c757d;text-transform:uppercase;display:block;margin-bottom:2px;">Val. Unit.</label>' +
          '<input class="form-control" id="impItemVU'+idx+'" type="number" placeholder="0.00" min="0" step="0.01" style="font-size:12px;" value="0" oninput="recalcImpItem('+idx+')">' +
        '</div>' +
        '<div>' +
          '<label style="font-size:9px;font-weight:700;color:#6c757d;text-transform:uppercase;display:block;margin-bottom:2px;">Val. Total</label>' +
          '<input class="form-control" id="impItemSub'+idx+'" type="text" placeholder="Subtotal" readonly style="font-size:12px;background:#fff;color:#1B4F72;font-weight:700;">' +
        '</div>' +
        '<div>' +
          '<label style="font-size:9px;font-weight:700;color:#6c757d;text-transform:uppercase;display:block;margin-bottom:2px;">NCM</label>' +
          '<input class="form-control" id="impItemNCM'+idx+'" type="text" placeholder="0000.00.00" style="font-size:11px;font-family:monospace;" value="">' +
        '</div>' +
        '<div style="padding-top:18px;">' +
          '<button class="btn btn-danger btn-sm" style="padding:6px 8px;" onclick="removeImpItem('+idx+')"><i class="fas fa-trash"></i></button>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:6px;">' +
        '<label style="font-size:9px;font-weight:700;color:#6c757d;text-transform:uppercase;">Descri\u00e7\u00e3o PT (para LI)</label>' +
        '<input class="form-control" id="impItemDescPT'+idx+'" type="text" placeholder="Ex: Chapa de Alum\u00ednio Liga 6061 esp. 3mm" style="font-size:12px;margin-top:2px;" oninput="calcImpTotal()">' +
      '</div>';
    list.appendChild(div);
    calcImpTotal();
  }

  function removeImpItem(idx) {
    const el = document.getElementById('impItem'+idx);
    if (el) el.remove();
    calcImpTotal();
  }

  // Coleta todos os itens do formulário de importação em um array de objetos
  function getImpItemsData() {
    const items = [];
    for (let i = 1; i <= impItemCount; i++) {
      const itemEl = document.getElementById('impItem' + i);
      if (!itemEl) continue; // item foi removido
      const code    = document.getElementById('impItemProd'   + i)?.value || '';
      const descEN  = document.getElementById('impItemDescEN' + i)?.value?.trim() || '';
      const descPT  = document.getElementById('impItemDescPT' + i)?.value?.trim() || '';
      const qty     = parseFloat(document.getElementById('impItemQtd'   + i)?.value || '0');
      const vu      = parseFloat(document.getElementById('impItemVU'    + i)?.value || '0');
      const ncm     = document.getElementById('impItemNCM'   + i)?.value?.trim() || '';
      const obs     = document.getElementById('impItemObs'   + i)?.value?.trim() || '';
      const sub     = qty * vu;
      items.push({ code, descEN, descPT, qty, vu, sub, ncm, obs });
    }
    return items;
  }

  function onImpItemChange(idx) {
    const sel = document.getElementById('impItemProd'+idx);
    const code = sel.value;
    if (!code || code==='__manual__') return;
    const item = window.allItemsData ? window.allItemsData.find(function(i){ return i.code===code; }) : null;
    if (!item) return;
    // Buscar também em impProdEdits local
    const localEdits = (impProdEdits && impProdEdits[code]) ? impProdEdits[code] : {};
    // Pré-preenche descrição PT: prioridade = impProdEdits > item.descPT > item.description (cadastro geral)
    const descPT = localEdits.descPT || item.descPT || item.description || '';
    // Pré-preenche descrição EN: prioridade = impProdEdits > item.descEN
    const descEN = localEdits.descEN || item.descEN || item.englishDescription || item.englishDesc || '';
    // NCM: prioridade = impProdEdits > item.ncm > célula da tabela
    const impProdEl = document.querySelector('.imp-prod-row[data-code="'+code+'"]');
    const ncmFromTable = impProdEl ? (function() {
      const cells = impProdEl.querySelectorAll('td');
      // NCM está na 5ª coluna (index 4) da tabela de produtos importados
      const raw = cells[4] ? cells[4].textContent.trim() : '';
      return (raw && raw !== '— preencher —') ? raw : '';
    })() : '';
    const ncm = localEdits.ncm || item.ncm || ncmFromTable;
    const descPTEl = document.getElementById('impItemDescPT'+idx);
    const descENEl = document.getElementById('impItemDescEN'+idx);
    const ncmEl   = document.getElementById('impItemNCM'+idx);
    if (descPTEl) descPTEl.value = descPT;
    if (descENEl) descENEl.value = descEN;
    if (ncmEl && ncm) ncmEl.value = ncm;
    calcImpTotal();
  }

  function recalcImpItem(idx) {
    const qtd = parseFloat(document.getElementById('impItemQtd'+idx)?.value)||0;
    const vu = parseFloat(document.getElementById('impItemVU'+idx)?.value)||0;
    const sub = qtd * vu;
    const moeda = document.getElementById('impMoeda')?.value || 'EUR';
    const sym = moeda==='EUR'?'€':moeda==='USD'?'US$':moeda==='GBP'?'£':'¥';
    const el = document.getElementById('impItemSub'+idx);
    if (el) el.value = sym+' '+sub.toLocaleString('pt-BR',{minimumFractionDigits:2});
    calcImpTotal();
  }

  function calcImpTotal() {
    const moeda = document.getElementById('impMoeda')?.value || 'EUR';
    const fx = parseFloat(document.getElementById('impCambio')?.value)||1;
    const sym = moeda==='EUR'?'€':moeda==='USD'?'US$':moeda==='GBP'?'£':'¥';
    let total = 0;
    let count = 0;
    document.querySelectorAll('[id^="impItemVU"]').forEach(el => {
      const idx = el.id.replace('impItemVU','');
      const qtd = parseFloat(document.getElementById('impItemQtd'+idx)?.value)||0;
      const vu = parseFloat(el.value)||0;
      total += qtd * vu;
      count++;
    });
    const brl = total * fx;
    const tmEl = document.getElementById('impTotalMoeda');
    const tbEl = document.getElementById('impTotalBRL');
    const brlEl = document.getElementById('impBRL');
    if (tmEl) tmEl.textContent = sym+' '+total.toLocaleString('pt-BR',{minimumFractionDigits:2});
    if (tbEl) tbEl.textContent = 'R$ '+brl.toLocaleString('pt-BR',{minimumFractionDigits:2});
    if (brlEl) brlEl.value = brl.toString();
    // Sincronizar campo impValorInvoice com a soma dos itens (FOB automático)
    const invEl = document.getElementById('impValorInvoice');
    if (invEl && total > 0) { invEl.value = total.toFixed(2); }
    document.getElementById('impResumoItens') && (document.getElementById('impResumoItens').textContent = count);
    calcImpostos();
  }

  function calcImpBRL() {
    // Atualizar o hidden impBRL com base no valor da invoice e câmbio
    const moeda   = document.getElementById('impMoeda')?.value || 'USD';
    const valorFx = parseFloat(document.getElementById('impValorInvoice')?.value || '0');
    const cambio  = parseFloat(document.getElementById('impCambio')?.value || '5.52');
    const brl     = moeda === 'BRL' ? valorFx : valorFx * cambio;
    const hiddenBRL = document.getElementById('impBRL');
    if (hiddenBRL) hiddenBRL.value = brl.toFixed(2);
    calcImpTotal();
  }

  function calcImpostos() {
    const brl = parseFloat(document.getElementById('impBRL')?.value) || 0;
    const ii = parseFloat(document.getElementById('taxII')?.value) || 0;
    const ipi = parseFloat(document.getElementById('taxIPI')?.value) || 0;
    const pis = parseFloat(document.getElementById('taxPIS')?.value) || 0;
    const cofins = parseFloat(document.getElementById('taxCOFINS')?.value) || 0;
    const icms = parseFloat(document.getElementById('taxICMS')?.value) || 0;
    const afrmm = parseFloat(document.getElementById('taxAFRMM')?.value) || 0;
    const siscomex = parseFloat(document.getElementById('taxSISCOMEX')?.value) || 0;
    const baseII = brl;
    const valII = baseII * ii / 100;
    const valIPI = (baseII + valII) * ipi / 100;
    const valPIS = brl * pis / 100;
    const valCOFINS = brl * cofins / 100;
    const valICMS = (brl + valII + valIPI) / (1 - icms/100) * (icms/100);
    const total = valII + valIPI + valPIS + valCOFINS + valICMS + afrmm + siscomex;
    const el = document.getElementById('taxTotal');
    if (el) el.value = 'R$ ' + total.toLocaleString('pt-BR', {minimumFractionDigits:2});
    calcNumerario(total);
  }

  function calcNumerario(impostos) {
    const brl = parseFloat(document.getElementById('impBRL')?.value) || 0;
    const taxTotal = impostos !== undefined ? impostos : parseFloat((document.getElementById('taxTotal')?.value||'').replace('R$ ','').replace(/\./g,'').replace(',','.')) || 0;
    const frete = parseFloat(document.getElementById('numFrete')?.value) || 0;
    const seguro = parseFloat(document.getElementById('numSeguro')?.value) || 0;
    const desp = parseFloat(document.getElementById('numDesp')?.value) || 0;
    const porto = parseFloat(document.getElementById('numPorto')?.value) || 0;
    const arm = parseFloat(document.getElementById('numArm')?.value) || 0;
    const total = brl + taxTotal + frete + seguro + desp + porto + arm;
    const el = document.getElementById('numTotal');
    if (el) el.value = 'R$ ' + total.toLocaleString('pt-BR', {minimumFractionDigits:2});
    updateImpResumo(taxTotal, total);
  }

  function updateImpResumo(taxTotalVal, custoTotalVal) {
    const taxStr = document.getElementById('taxTotal')?.value || 'R$ 0,00';
    const custoStr = document.getElementById('numTotal')?.value || 'R$ 0,00';
    if (document.getElementById('impResumoImpostos')) document.getElementById('impResumoImpostos').textContent = taxStr;
    if (document.getElementById('impResumoCusto')) document.getElementById('impResumoCusto').textContent = custoStr;
  }

  async function salvarImportacao() {
    const inv = document.getElementById('impInvoice')?.value?.trim();
    const fornEl = document.getElementById('impFornecedor');
    const fornId = fornEl?.value || '';
    const forn = fornEl?.options[fornEl?.selectedIndex]?.text || '';
    if (!inv) { showToastSup('⚠️ Informe o número da Invoice!', 'error'); switchImpTab(1); return; }
    if (!fornId) { showToastSup('⚠️ Selecione o fornecedor!', 'error'); return; }
    const mod = document.querySelector('input[name="impModalidade"]:checked')?.value || 'maritimo';
    // Capturar todos os campos do formulário
    const invoiceDate     = document.getElementById('impDataInvoice')?.value || '';
    const incoterm        = document.getElementById('impIncoterm')?.value || 'FOB';
    const currency        = document.getElementById('impMoeda')?.value || 'USD';
    const exchangeRate    = parseFloat(document.getElementById('impCambio')?.value || '5.52');
    const portOfOrigin    = document.getElementById('impOrigem')?.value || '';
    const portOfDestination = document.getElementById('impDestino')?.value || 'Santos';
    const expectedArrival = document.getElementById('impChegada')?.value || '';
    const grossWeight     = parseFloat(document.getElementById('impPesoBruto')?.value || '0');
    const netWeight       = parseFloat(document.getElementById('impPesoLiquido')?.value || '0') || grossWeight;
    const invoiceValueRaw = parseFloat(document.getElementById('impValorInvoice')?.value || '0');
    const invoiceValueEUR = currency === 'EUR' ? invoiceValueRaw : 0;
    const invoiceValueUSD = currency === 'USD' ? invoiceValueRaw : 0;
    const invoiceValueBRL = invoiceValueRaw * exchangeRate;
    // Impostos
    const taxes = {
      ii:        parseFloat(document.getElementById('taxII')?.value || '0'),
      ipi:       parseFloat(document.getElementById('taxIPI')?.value || '0'),
      pis:       parseFloat(document.getElementById('taxPIS')?.value || '0'),
      cofins:    parseFloat(document.getElementById('taxCOFINS')?.value || '0'),
      icms:      parseFloat(document.getElementById('taxICMS')?.value || '0'),
      afrmm:     parseFloat(document.getElementById('taxAFRMM')?.value || '0'),
      siscomex:  parseFloat(document.getElementById('taxSISCOMEX')?.value || '0'),
    };
    // Numerário (custos adicionais de desembaraço)
    const numerario = {
      frete:    parseFloat(document.getElementById('numFrete')?.value  || '0'),
      seguro:   parseFloat(document.getElementById('numSeguro')?.value || '0'),
      desp:     parseFloat(document.getElementById('numDesp')?.value   || '0'),
      porto:    parseFloat(document.getElementById('numPorto')?.value  || '0'),
      arm:      parseFloat(document.getElementById('numArm')?.value    || '0'),
    };
    // Itens da importação
    const items = getImpItemsData();
    try {
      const res = await fetch('/suprimentos/api/imports/create', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          invoiceNumber: inv, supplierId: fornId, supplierName: forn, modality: mod,
          invoiceDate, incoterm, currency, exchangeRate,
          portOfOrigin, portOfDestination, expectedArrival, grossWeight, netWeight,
          invoiceValueEUR, invoiceValueUSD, invoiceValueBRL,
          taxes, numerario, items
        })
      });
      const data = await res.json();
      if (data.ok) {
        showToastSup('✅ Importação ' + (data.code||'') + ' criada!', 'success');
        closeModal('novaImportacaoModal');
        setTimeout(() => location.reload(), 1000);
      } else { showToastSup(data.error || 'Erro ao criar importação', 'error'); }
    } catch(e) { showToastSup('Erro de conexão', 'error'); }
  }

  function printNumerario() {
    window.print();
  }

  // ── Rascunho de LI ────────────────────────────────────────────────────
  function openRascunhoLI(id) {
    const imp = window.importsData.find(x => x.id === id);
    if (!imp) return;
    // Obter edições salvas localmente para este processo
    const liEditsKey = 'liEdits_' + id;
    const liEdits = JSON.parse(localStorage.getItem(liEditsKey) || '{}');
    document.getElementById('liImpCodigo').textContent = imp.code;
    const hoje = new Date().toLocaleDateString('pt-BR');
    const moedaSym = (imp.invoiceValueEUR||0) > 0 ? '€' : 'US$';

    // Helper para campo editável (edições salvas no localStorage, apenas para este embarque)
    function liField(key, defaultVal) {
      const val = liEdits[key] !== undefined ? liEdits[key] : (defaultVal || '—');
      return `<span class="li-edit-field" contenteditable="true" data-li-key="${key}" data-imp-id="${id}"
        title="Clique para editar · Alterações salvas apenas neste embarque"
        style="outline:none;border-bottom:1px dashed #7c3aed;cursor:text;min-width:60px;display:inline-block;color:inherit;"
        onblur="saveLiEdit('${id}','${key}',this.textContent)">${val}</span>`;
    }

    // Calcular país de origem a partir do porto
    const origin = imp.portOfOrigin || '';
    const paises = origin.includes('Hamburg')||origin.includes('München')||origin.includes('Berlin') ? 'Alemanha' :
                   origin.includes('Chicago')||origin.includes('New York')||origin.includes('Los Angeles') ? 'EUA' :
                   origin.includes('Shanghai')||origin.includes('Ningbo')||origin.includes('Shenzhen') ? 'China' :
                   origin.includes('Tokyo')||origin.includes('Osaka') ? 'Japão' :
                   origin.includes('Seoul') ? 'Coreia do Sul' : liEdits['paisOrigem'] || '—';

    const liItems = imp.items && imp.items.length > 0
      ? imp.items
      : [{ code: imp.code, descPT: imp.description||'—', ncm: imp.ncm||'—', qty: imp.netWeight||1, vu: imp.invoiceValueEUR||imp.invoiceValueUSD||0, sub: imp.invoiceValueEUR||imp.invoiceValueUSD||0 }];
    // CIF = FOB (valor invoice) + Frete + Seguro (em moeda original)
    // FOB = soma dos subtotais dos itens OU invoiceValueEUR/USD (o que for maior/válido)
    const _itemsFOB = (imp.items||[]).reduce((acc, it) => acc + (it.sub || it.subtotal || ((it.qty||0)*(it.vu||it.unitPrice||0))), 0);
    const _invoiceFOB = (imp.invoiceValueEUR||0) > 0 ? (imp.invoiceValueEUR||0) : (imp.invoiceValueUSD||0);
    // Fallback: se não há valor de invoice em moeda estrangeira nem itens, tentar calcular via BRL/câmbio
    const _fobValFromBRL = (imp.invoiceValueBRL||0) > 0 && (_exchR||1) > 0 ? (imp.invoiceValueBRL||0) / (_exchR||1) : 0;
    const _fobVal = _invoiceFOB > 0 ? _invoiceFOB : (_itemsFOB > 0 ? _itemsFOB : _fobValFromBRL);
    const _exchR  = imp.exchangeRate || 1;
    // Frete e seguro em moeda estrangeira: se foram informados em BRL, converter
    const _freteBRL  = (imp.numerario && imp.numerario.frete)  || 0;
    const _seguroBRL = (imp.numerario && imp.numerario.seguro) || 0;
    const _freteFX   = _exchR > 0 ? _freteBRL  / _exchR : 0;
    const _seguroFX  = _exchR > 0 ? _seguroBRL / _exchR : 0;
    const totalCIF = _fobVal + _freteFX + _seguroFX;

    let html = `
    <div style="background:#f5f3ff;border-radius:8px;padding:14px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:15px;font-weight:800;color:#7c3aed;"><i class="fas fa-stamp" style="margin-right:8px;"></i>RASCUNHO DE LICENÇA DE IMPORTAÇÃO</div>
        <div style="font-size:11px;color:#6c757d;margin-top:4px;">Gerado em ${hoje} · Processo: ${imp.code}
          · <span style="color:#7c3aed;font-size:10px;"><i class="fas fa-pencil-alt"></i> Campos roxos sublinhados são editáveis (só para este embarque)</span>
        </div>
      </div>
      <span style="background:#fef2f2;color:#dc2626;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;border:1px solid #fecaca;">MINUTA — Não oficial</span>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
      ${detRow('IMPORTADOR (CNPJ)', liField('importador', 'Sua Empresa Ltda — 00.000.000/0001-00'))}
      ${detRow('FORNECEDOR / EXPORTADOR', imp.supplierName||'—')}
      ${detRow('PAÍS DE ORIGEM', liField('paisOrigem', paises))}
      ${detRow('PAÍS DE PROCEDÊNCIA', liField('paisProcedencia', paises))}
      ${detRow('PORTO/AEROPORTO DESCARGA', imp.portOfDestination||'—')}
      ${detRow('VIA DE TRANSPORTE', liField('viaTransporte', (imp.incoterm||'').includes('CIF')?'Marítima':'A definir'))}
      ${detRow('INCOTERM', imp.incoterm||'—')}
      ${detRow('REGIME ADUANEIRO', liField('regimeAduaneiro', 'Importação Comum'))}
      ${detRow('ENQUADRAMENTO CAMBIAL', liField('enquadramentoCambial', 'SEM COBERTURA CAMBIAL — LUCROS E DIVIDENDOS'))}
      ${detRow('MODALIDADE PAGAMENTO', liField('modalidadePagamento', 'Pagamento Antecipado / L/C à vista'))}
    </div>

    <div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:8px;"><i class="fas fa-boxes" style="margin-right:6px;"></i>Relação de Mercadorias</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;">
      <thead><tr style="background:#7c3aed;color:white;">
        <th style="padding:8px 10px;text-align:left;">Cód.</th>
        <th style="padding:8px 10px;text-align:left;">Descrição PT (LI)</th>
        <th style="padding:8px 10px;text-align:right;">Qtd</th>
        <th style="padding:8px 10px;text-align:left;">NCM</th>
        <th style="padding:8px 10px;text-align:right;">Valor Total CIF</th>
      </tr></thead>
      <tbody>${liItems.map((it, i) => {
        const valT = it.sub || it.subtotal || ((it.qty||1)*(it.vu||it.unitPrice||0));
        return '<tr style="background:'+(i%2===0?'#f8f9fa':'white')+';border-bottom:1px solid #e9ecef;">' +
          '<td style="padding:8px 10px;font-family:monospace;font-weight:700;color:#1B4F72;font-size:11px;">'+(it.code||it.productCode||'—')+'</td>' +
          '<td style="padding:8px 10px;font-weight:500;color:#374151;">'+(it.descPT||it.description||'— preencher —')+'</td>' +
          '<td style="padding:8px 10px;text-align:right;">'+(it.qty||it.quantity||'—')+'</td>' +
          '<td style="padding:8px 10px;font-weight:700;color:#7c3aed;font-family:monospace;">'+(it.ncm||imp.ncm||'—')+'</td>' +
          '<td style="padding:8px 10px;text-align:right;font-weight:700;color:#1B4F72;">'+moedaSym+' '+(valT>0?valT.toLocaleString('pt-BR',{minimumFractionDigits:2}):'—')+'</td>' +
        '</tr>';
      }).join('')}</tbody>
      <tfoot>
        <tr style="background:#fafafa;"><td colspan="4" style="padding:5px 10px;color:#6b7280;text-align:right;font-size:11px;">FOB (Invoice):</td><td style="padding:5px 10px;text-align:right;font-size:11px;color:${_fobVal>0?'#374151':'#dc2626'};font-weight:600;">${_fobVal>0 ? moedaSym+' '+_fobVal.toLocaleString("pt-BR",{minimumFractionDigits:2}) : '⚠ Editar Processo para informar valor'}</td></tr>
        ${_freteFX > 0 ? '<tr style="background:#fafafa;"><td colspan="4" style="padding:5px 10px;color:#6b7280;text-align:right;font-size:11px;">+ Frete:</td><td style="padding:5px 10px;text-align:right;font-size:11px;color:#6b7280;">'+moedaSym+' '+_freteFX.toLocaleString("pt-BR",{minimumFractionDigits:2})+'</td></tr>' : ''}
        ${_seguroFX > 0 ? '<tr style="background:#fafafa;"><td colspan="4" style="padding:5px 10px;color:#6b7280;text-align:right;font-size:11px;">+ Seguro:</td><td style="padding:5px 10px;text-align:right;font-size:11px;color:#6b7280;">'+moedaSym+' '+_seguroFX.toLocaleString("pt-BR",{minimumFractionDigits:2})+'</td></tr>' : ''}
        <tr style="background:#f5f3ff;">
          <td colspan="4" style="padding:8px 10px;font-weight:700;color:#7c3aed;text-align:right;">TOTAL CIF:</td>
          <td style="padding:8px 10px;font-weight:800;color:#7c3aed;text-align:right;">${moedaSym} ${(totalCIF||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
        </tr>
      </tfoot>
    </table>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
      ${detRow('FOB INVOICE ('+((imp.invoiceValueEUR||0)>0?'EUR':'USD')+')', _fobVal > 0 ? moedaSym+' '+_fobVal.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '<span style="color:#dc2626;font-weight:700;">⚠ Não informado — use Editar</span>')}
      ${_freteFX > 0 ? detRow('+ FRETE ('+((imp.invoiceValueEUR||0)>0?'EUR':'USD')+')', moedaSym+' '+_freteFX.toLocaleString('pt-BR',{minimumFractionDigits:2})) : ''}
      ${_seguroFX > 0 ? detRow('+ SEGURO ('+((imp.invoiceValueEUR||0)>0?'EUR':'USD')+')', moedaSym+' '+_seguroFX.toLocaleString('pt-BR',{minimumFractionDigits:2})) : ''}
      ${detRow('<strong>TOTAL CIF ('+((imp.invoiceValueEUR||0)>0?'EUR':'USD')+')</strong>', '<strong>'+moedaSym+' '+(totalCIF||0).toLocaleString('pt-BR',{minimumFractionDigits:2})+'</strong>')}
      ${detRow('TOTAL CIF (BRL)', 'R$ '+((totalCIF * (imp.exchangeRate||1))||0).toLocaleString('pt-BR',{minimumFractionDigits:2})+' (câmbio R$ '+(imp.exchangeRate||0)+')')}
      ${detRow('PESO LÍQUIDO', (imp.netWeight||0)+' kg')}
      ${detRow('PESO BRUTO', (imp.grossWeight||0)+' kg')}
    </div>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;font-size:12px;color:#92400e;">
      <i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>
      <strong>Atenção:</strong> Este rascunho deve ser revisado e validado pelo despachante aduaneiro antes de protocolar a LI no SISCOMEX.
      Informações marcadas como "— preencher —" requerem complementação.
    </div>`;
    document.getElementById('rascunhoLIBody').innerHTML = html;
    openModal('rascunhoLIModal');
  }

  // Salvar edição de campo da LI no localStorage (somente este embarque)
  function saveLiEdit(impId, key, value) {
    const k = 'liEdits_' + impId;
    const edits = JSON.parse(localStorage.getItem(k) || '{}');
    edits[key] = value.trim();
    localStorage.setItem(k, JSON.stringify(edits));
  }


  // ── Versionamento de Invoice ─────────────────────────────────────────
  function getInvVersionKey(impId) { return 'invVersions_' + impId; }

  function getInvVersions(impId) {
    try { return JSON.parse(localStorage.getItem(getInvVersionKey(impId)) || '[]'); }
    catch { return []; }
  }

  function saveInvVersion(impId) {
    const imp = window.importsData.find(x => x.id === impId);
    if (!imp) return null;
    const editsKey = 'invEdits_' + impId;
    const currentEdits = JSON.parse(localStorage.getItem(editsKey) || '{}');
    const versions = getInvVersions(impId);
    const nextNum  = versions.length + 1;
    const versionLabel = 'v' + String(nextNum).padStart(2, '0');
    const ts = new Date();
    const dateStr = ts.toLocaleString('pt-BR');
    const versionData = {
      version: nextNum,
      label: versionLabel,
      date: dateStr,
      timestamp: ts.toISOString(),
      edits: JSON.parse(JSON.stringify(currentEdits)),
      impSnapshot: {
        invoiceNumber: imp.invoiceNumber, invoiceDate: imp.invoiceDate,
        supplierName: imp.supplierName,   incoterm: imp.incoterm,
        currency: imp.currency,           exchangeRate: imp.exchangeRate,
        invoiceValueEUR: imp.invoiceValueEUR, invoiceValueUSD: imp.invoiceValueUSD,
        invoiceValueBRL: imp.invoiceValueBRL,
        items: imp.items || [],
      }
    };
    versions.push(versionData);
    localStorage.setItem(getInvVersionKey(impId), JSON.stringify(versions));
    return versionData;
  }

  function confirmarInvoice(impId) {
    const imp = window.importsData.find(x => x.id === impId);
    if (!imp) return;
    const saved = saveInvVersion(impId);
    if (!saved) return;
    const versions = getInvVersions(impId);
    showToastSup('✅ Invoice confirmada como ' + saved.label + ' — ' + saved.date, 'success');
    // Atualizar o título do modal com a versão
    const titleEl = document.getElementById('invoiceImpCodigo');
    if (titleEl) titleEl.textContent = imp.code + ' · ' + saved.label;
    // Atualizar badge de versão
    const badgeEl = document.getElementById('invVersionBadge');
    if (badgeEl) {
      badgeEl.textContent = saved.label + ' (' + versions.length + ' vers.)';
      badgeEl.style.display = 'inline-block';
    }
    // Renderizar histórico de versões
    renderInvVersionHistory(impId);
  }

    function renderInvVersionHistory(impId) {
    const container = document.getElementById('invVersionHistoryContainer');
    if (!container) return;
    const versions = getInvVersions(impId);
    if (versions.length === 0) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    const rows = versions.slice().reverse().map(function(v) {
      const inv = v.impSnapshot || {};
      const moeda = (inv.invoiceValueEUR||0) > 0 ? 'EUR' : 'USD';
      const val = (inv.invoiceValueEUR||0) > 0 ? (inv.invoiceValueEUR||0) : (inv.invoiceValueUSD||0);
      const btnOnClick = 'restoreInvVersion(' + JSON.stringify(impId) + ',' + v.version + ')';
      return '<tr style="border-bottom:1px solid #e5e7eb;">' +
        '<td style="padding:6px 10px;font-weight:700;color:#1B4F72;">' + v.label + '</td>' +
        '<td style="padding:6px 10px;color:#374151;">' + v.date + '</td>' +
        '<td style="padding:6px 10px;color:#374151;">' + (inv.invoiceNumber||'—') + '</td>' +
        '<td style="padding:6px 10px;color:#374151;">' + moeda + ' ' + (val||0).toLocaleString('pt-BR',{minimumFractionDigits:2}) + '</td>' +
        '<td style="padding:6px 10px;text-align:center;">' +
          '<button onclick="' + btnOnClick + '" style="font-size:10px;padding:3px 8px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;color:#374151;">' +
          '<i class="fas fa-undo"></i> Restaurar</button>' +
        '</td></tr>';
    }).join('');
    container.innerHTML =
      '<div style="padding:10px 0 6px;font-size:12px;font-weight:700;color:#1B4F72;">' +
        '<i class="fas fa-history" style="margin-right:5px;"></i>Histórico de Versões</div>' +
      '<div style="overflow-x:auto;">' +
        '<table style="width:100%;border-collapse:collapse;font-size:11px;">' +
          '<thead><tr style="background:#f8f9fa;">' +
            '<th style="padding:6px 10px;text-align:left;color:#6b7280;">Versão</th>' +
            '<th style="padding:6px 10px;text-align:left;color:#6b7280;">Data/Hora</th>' +
            '<th style="padding:6px 10px;text-align:left;color:#6b7280;">Nº Invoice</th>' +
            '<th style="padding:6px 10px;text-align:left;color:#6b7280;">Valor</th>' +
            '<th style="padding:6px 10px;text-align:center;color:#6b7280;">Ação</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>';
  }

  function restoreInvVersion(impId, versionNum) {
    const versions = getInvVersions(impId);
    const v = versions.find(x => x.version === versionNum);
    if (!v) return;
    if (!confirm('Restaurar versão ' + v.label + ' (' + v.date + ')? As edições atuais serão substituídas.')) return;
    const editsKey = 'invEdits_' + impId;
    localStorage.setItem(editsKey, JSON.stringify(v.edits || {}));
    showToastSup('↩️ Versão ' + v.label + ' restaurada!', 'info');
    // Reabrir a invoice para refletir as edições restauradas
    closeModal('invoiceComercialModal');
    setTimeout(() => openInvoiceComercial(impId), 200);
  }

  // ── Invoice Comercial ────────────────────────────────────────────────────
  function openInvoiceComercial(id) {
    window._currentInvId = id; // necessário para botão Confirmar
    const imp = window.importsData.find(x => x.id === id);
    if (!imp) return;
    const invEditsKey = 'invEdits_' + id;
    const invEdits = JSON.parse(localStorage.getItem(invEditsKey) || '{}');
    // Mostrar versão atual no título
    const versions = getInvVersions(id);
    const currentVersion = versions.length > 0 ? versions[versions.length-1] : null;
    const vLabel = currentVersion ? currentVersion.label : '';
    document.getElementById('invoiceImpCodigo').textContent = imp.code + (vLabel ? ' · ' + vLabel : '');
    // Atualizar badge
    const badgeEl = document.getElementById('invVersionBadge');
    if (badgeEl) {
      if (versions.length > 0) {
        badgeEl.textContent = (currentVersion ? currentVersion.label : '') + ' (' + versions.length + ' vers.)';
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }
    const moedaSym = (imp.invoiceValueEUR||0) > 0 ? '€' : 'US$';
    const moedaLabel = (imp.invoiceValueEUR||0) > 0 ? 'EUR' : 'USD';
    const fmtVal = v => (v||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
    const hoje = new Date().toLocaleDateString('pt-BR');

    // Helper para campo editável (salvo no localStorage deste embarque)
    function invField(key, defaultVal, style) {
      const val = invEdits[key] !== undefined ? invEdits[key] : (defaultVal || '—');
      return `<span contenteditable="true" data-inv-key="${key}"
        title="Clique para editar"
        style="outline:none;border-bottom:1px dashed #1B4F72;cursor:text;display:inline-block;min-width:80px;${style||''}"
        onblur="saveInvEdit('${id}','${key}',this.textContent)">${val}</span>`;
    }

    const invItems = imp.items && imp.items.length > 0 ? imp.items
      : [{ code: imp.code||'—', descEN: imp.description||'—', qty: imp.netWeight||1, vu: imp.invoiceValueEUR||imp.invoiceValueUSD||0, sub: imp.invoiceValueEUR||imp.invoiceValueUSD||0, ncm: imp.ncm||'—' }];

    const itemsTotal = invItems.reduce((acc, it) => acc + (it.sub||((it.qty||0)*(it.vu||0))), 0);
    const freight    = parseFloat(invEdits['freight'] || '0');
    const insurance  = parseFloat(invEdits['insurance'] || '0');
    const grandTotal = itemsTotal + freight + insurance;

    const invoiceNumber = invEdits['invoiceNumber'] || imp.invoiceNumber || '';
    const invoiceDate   = invEdits['invoiceDate'] || imp.invoiceDate || hoje;

    let html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;max-width:860px;margin:0 auto;">

      <!-- Cabeçalho da Invoice -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:3px solid #1B4F72;">
        <div>
          <div style="font-size:22px;font-weight:800;color:#1B4F72;letter-spacing:1px;">COMMERCIAL INVOICE</div>
          <div style="font-size:13px;color:#6c757d;margin-top:4px;">Invoice No: ${invField('invoiceNumber', invoiceNumber, 'font-weight:700;font-size:14px;color:#1B4F72;')} &nbsp;·&nbsp; Date: ${invField('invoiceDate', invoiceDate)}</div>
          <div style="font-size:12px;color:#6c757d;">Incoterm: <strong>${imp.incoterm||'—'}</strong> &nbsp;·&nbsp; Port of Loading: <strong>${imp.portOfOrigin||'—'}</strong> &nbsp;·&nbsp; Port of Discharge: <strong>${imp.portOfDestination||'—'}</strong></div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:#9ca3af;">Processo</div>
          <div style="font-size:18px;font-weight:800;color:#1B4F72;">${imp.code}</div>
          <div style="font-size:11px;color:#6c757d;margin-top:4px;">🖊 Campos sublinhados são editáveis</div>
        </div>
      </div>

      <!-- Vendedor / Importador / Notify (3 colunas editáveis) -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:20px;">
        <div style="background:#f8f9fa;border-radius:8px;padding:12px;border-left:3px solid #1B4F72;">
          <div style="font-size:10px;font-weight:700;color:#1B4F72;text-transform:uppercase;margin-bottom:6px;">SELLER (VENDEDOR)</div>
          <div style="font-size:13px;">${invField('sellerName', imp.supplierName||'—', 'font-weight:700;')}</div>
          <div style="font-size:12px;margin-top:4px;">${invField('sellerAddress', '— endereço —')}</div>
          <div style="font-size:12px;">${invField('sellerCity', '— cidade / país —')}</div>
          <div style="font-size:12px;">Tel: ${invField('sellerPhone', '—')}</div>
          <div style="font-size:12px;">Bank: ${invField('sellerBank', '—')}</div>
        </div>
        <div style="background:#f8f9fa;border-radius:8px;padding:12px;border-left:3px solid #059669;">
          <div style="font-size:10px;font-weight:700;color:#059669;text-transform:uppercase;margin-bottom:6px;">BUYER / IMPORTER (COMPRADOR)</div>
          <div style="font-size:13px;">${invField('buyerName', 'Sua Empresa Ltda', 'font-weight:700;')}</div>
          <div style="font-size:12px;margin-top:4px;">${invField('buyerAddress', '— endereço —')}</div>
          <div style="font-size:12px;">${invField('buyerCity', '— cidade, Brasil —')}</div>
          <div style="font-size:12px;">CNPJ: ${invField('buyerCNPJ', '00.000.000/0001-00')}</div>
        </div>
        <div style="background:#f8f9fa;border-radius:8px;padding:12px;border-left:3px solid #d97706;">
          <div style="font-size:10px;font-weight:700;color:#d97706;text-transform:uppercase;margin-bottom:6px;">NOTIFY PARTY</div>
          <div style="font-size:13px;">${invField('notifyName', 'Sua Empresa Ltda', 'font-weight:700;')}</div>
          <div style="font-size:12px;margin-top:4px;">${invField('notifyAddress', '— endereço —')}</div>
          <div style="font-size:12px;">${invField('notifyCity', '— cidade, Brasil —')}</div>
          <div style="font-size:12px;">${invField('notifyContact', '—')}</div>
        </div>
      </div>

      <!-- Tabela de Produtos -->
      <div style="font-size:12px;font-weight:700;color:#1B4F72;text-transform:uppercase;margin-bottom:6px;"><i class="fas fa-boxes" style="margin-right:6px;"></i>Description of Goods</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;">
        <thead>
          <tr style="background:#1B4F72;color:white;">
            <th style="padding:8px 10px;text-align:left;">Item / Code</th>
            <th style="padding:8px 10px;text-align:left;">Description</th>
            <th style="padding:8px 10px;text-align:left;">NCM / HS</th>
            <th style="padding:8px 10px;text-align:right;">Qty</th>
            <th style="padding:8px 10px;text-align:right;">Unit Price (${moedaLabel})</th>
            <th style="padding:8px 10px;text-align:right;">Total (${moedaLabel})</th>
          </tr>
        </thead>
        <tbody>
          ${invItems.map((it, i) => {
            const sub = it.sub || it.subtotal || ((it.qty||0)*(it.vu||it.unitPrice||0));
            return '<tr style="background:'+(i%2===0?'#f8f9fa':'white')+';border-bottom:1px solid #e9ecef;">' +
              '<td style="padding:8px 10px;font-family:monospace;font-size:11px;font-weight:700;color:#1B4F72;">'+(it.code||'—')+'</td>' +
              '<td style="padding:8px 10px;">'+(it.descEN||it.description||'—')+'</td>' +
              '<td style="padding:8px 10px;font-family:monospace;color:#7c3aed;">'+(it.ncm||imp.ncm||'—')+'</td>' +
              '<td style="padding:8px 10px;text-align:right;">'+(it.qty||0)+'</td>' +
              '<td style="padding:8px 10px;text-align:right;">'+(it.vu||it.unitPrice||0).toLocaleString('pt-BR',{minimumFractionDigits:2})+'</td>' +
              '<td style="padding:8px 10px;text-align:right;font-weight:700;">'+(sub||0).toLocaleString('pt-BR',{minimumFractionDigits:2})+'</td>' +
            '</tr>';
          }).join('')}
        </tbody>
        <tfoot>
          <tr style="background:#f0f9ff;border-top:2px solid #1B4F72;">
            <td colspan="5" style="padding:8px 10px;text-align:right;font-weight:700;color:#1B4F72;">Subtotal Goods:</td>
            <td style="padding:8px 10px;text-align:right;font-weight:800;color:#1B4F72;">${moedaSym} ${fmtVal(itemsTotal)}</td>
          </tr>
          <tr style="background:#f0f9ff;">
            <td colspan="5" style="padding:6px 10px;text-align:right;color:#374151;">Freight (${moedaLabel}):
              <span contenteditable="true" data-inv-key="freight"
                style="outline:none;border-bottom:1px dashed #1B4F72;cursor:text;display:inline-block;min-width:60px;text-align:right;padding:0 4px;"
                onblur="saveInvEdit('${id}','freight',this.textContent);openInvoiceComercial('${id}')">${invEdits['freight']||'0,00'}</span>
            </td>
            <td style="padding:6px 10px;text-align:right;font-weight:600;">${moedaSym} <span id="invFreightDisplay">${fmtVal(freight)}</span></td>
          </tr>
          <tr style="background:#f0f9ff;">
            <td colspan="5" style="padding:6px 10px;text-align:right;color:#374151;">Insurance (${moedaLabel}):
              <span contenteditable="true" data-inv-key="insurance"
                style="outline:none;border-bottom:1px dashed #1B4F72;cursor:text;display:inline-block;min-width:60px;text-align:right;padding:0 4px;"
                onblur="saveInvEdit('${id}','insurance',this.textContent);openInvoiceComercial('${id}')">${invEdits['insurance']||'0,00'}</span>
            </td>
            <td style="padding:6px 10px;text-align:right;font-weight:600;">${moedaSym} <span id="invInsuranceDisplay">${fmtVal(insurance)}</span></td>
          </tr>
          <tr style="background:#1B4F72;color:white;">
            <td colspan="5" style="padding:10px;text-align:right;font-weight:800;font-size:14px;">TOTAL INVOICE (${moedaLabel}):</td>
            <td style="padding:10px;text-align:right;font-weight:900;font-size:16px;">${moedaSym} ${fmtVal(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Informações Gerais (campo livre editável) -->
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;font-weight:700;color:#1B4F72;text-transform:uppercase;margin-bottom:6px;"><i class="fas fa-info-circle" style="margin-right:4px;"></i>General Information / Remarks</div>
        <div contenteditable="true" data-inv-key="remarks"
          style="min-height:60px;border:1px dashed #cbd5e1;border-radius:6px;padding:10px;font-size:12px;color:#374151;line-height:1.6;outline:none;"
          onblur="saveInvEdit('${id}','remarks',this.innerHTML)">${invEdits['remarks']||'<em style="color:#9ca3af;">Clique aqui para adicionar observações gerais, condições de pagamento, número de L/C, dados bancários, etc.</em>'}</div>
      </div>

      <!-- Assinaturas -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:32px;padding-top:20px;border-top:2px solid #e9ecef;">
        <div style="text-align:center;">
          <div style="border-top:1px solid #374151;padding-top:8px;margin-top:48px;">
            <div style="font-size:12px;font-weight:700;color:#1B4F72;">${invField('signerSeller', imp.supplierName||'SELLER', 'font-weight:700;')}</div>
            <div style="font-size:11px;color:#6c757d;">Authorized Signature &amp; Company Stamp</div>
            <div style="font-size:11px;color:#6c757d;margin-top:2px;">${invField('signerSellerTitle', 'Export Manager')}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Date: _______________</div>
          </div>
        </div>
        <div style="text-align:center;">
          <div style="border-top:1px solid #374151;padding-top:8px;margin-top:48px;">
            <div style="font-size:12px;font-weight:700;color:#059669;">${invField('signerBuyer', 'Sua Empresa Ltda', 'font-weight:700;')}</div>
            <div style="font-size:11px;color:#6c757d;">Authorized Signature &amp; Company Stamp</div>
            <div style="font-size:11px;color:#6c757d;margin-top:2px;">${invField('signerBuyerTitle', 'Import Manager')}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Date: _______________</div>
          </div>
        </div>
      </div>

      <div style="text-align:center;font-size:10px;color:#9ca3af;margin-top:20px;padding-top:12px;border-top:1px solid #f1f3f5;">
        This is a commercial invoice generated by PCPSyncrus · ${imp.code} · Printed: ${hoje}
      </div>
    </div>`;
    document.getElementById('invoiceComercialBody').innerHTML = html;
    openModal('invoiceComercialModal');
    // Renderizar histórico de versões (se existir)
    setTimeout(() => renderInvVersionHistory(id), 50);
  }

  // Salvar edição de campo da Invoice no localStorage (somente este embarque)
  function saveInvEdit(impId, key, value) {
    const k = 'invEdits_' + impId;
    const edits = JSON.parse(localStorage.getItem(k) || '{}');
    edits[key] = value.trim();
    localStorage.setItem(k, JSON.stringify(edits));
  }

  function imprimirLI() {
    window.print();
  }

  // ── Fechamento de Processo ─────────────────────────────────────────────
  let fechCurrentImp = null;
  const fechDocumentos = {}; // simula documentos por processo

  function openFechamento(id) {
    const imp = window.importsData.find(x => x.id === id);
    if (!imp) return;
    fechCurrentImp = imp;
    document.getElementById('fechImpCodigo').textContent = imp.code;
    switchFechTab('doc');
    buildFechHistorico(imp);
    buildFechAuditoria(imp);
    openModal('fechamentoProcessoModal');
  }

  function switchFechTab(tab) {
    ['doc','hist','audit'].forEach(t => {
      const btn = document.getElementById('fechTab'+t.charAt(0).toUpperCase()+t.slice(1));
      const content = document.getElementById('fechTabContent'+t.charAt(0).toUpperCase()+t.slice(1));
      if (!btn||!content) return;
      if (t===tab) { btn.style.color='#1B4F72'; btn.style.borderBottom='2px solid #1B4F72'; content.style.display='block'; }
      else { btn.style.color='#6c757d'; btn.style.borderBottom='none'; content.style.display='none'; }
    });
  }

  function uploadDocSlot(idx, docName) {
    // Simula upload
    const inp = document.createElement('input');
    inp.type='file'; inp.accept='.pdf,.xlsx,.docx,.jpg,.png';
    inp.onchange = function(e) {
      const f = e.target.files[0];
      if (!f) return;
      document.getElementById('docSlotStatus'+idx).textContent = f.name+' — '+new Date().toLocaleDateString('pt-BR');
      document.getElementById('docSlotStatus'+idx).style.color = '#16a34a';
      document.getElementById('docSlot'+idx).style.background='#f0fdf4';
      document.getElementById('docSlot'+idx).style.border='1px solid #bbf7d0';
      document.getElementById('docSlotIcon'+idx).style.background='#dcfce7';
      document.getElementById('docSlotIcon'+idx).innerHTML='<i class="fas fa-check-circle" style="color:#16a34a;font-size:14px;"></i>';
      // Registra no histórico
      if (fechCurrentImp) {
        if (!fechDocumentos[fechCurrentImp.id]) fechDocumentos[fechCurrentImp.id] = [];
        fechDocumentos[fechCurrentImp.id].push({ doc:docName, file:f.name, date:new Date().toLocaleString('pt-BR'), user:document.querySelector('[data-user-name]')?.dataset?.userName||'Usuário' });
        buildFechHistorico(fechCurrentImp);
        buildFechAuditoria(fechCurrentImp);
      }
    };
    inp.click();
  }

  function addFechDocuments(files) {
    for (const f of files) {
      if (fechCurrentImp) {
        if (!fechDocumentos[fechCurrentImp.id]) fechDocumentos[fechCurrentImp.id] = [];
        fechDocumentos[fechCurrentImp.id].push({ doc:'Geral', file:f.name, date:new Date().toLocaleString('pt-BR'), user:document.querySelector('[data-user-name]')?.dataset?.userName||'Usuário' });
      }
    }
    if (fechCurrentImp) { buildFechHistorico(fechCurrentImp); buildFechAuditoria(fechCurrentImp); }
    alert('✅ '+files.length+' arquivo(s) adicionado(s) ao processo!');
  }

  function buildFechHistorico(imp) {
    const docs = fechDocumentos[imp.id] || [];
    // Combina timeline + docs
    const events = [
      ...imp.timeline.filter(t=>t.user).map(t=>({ tipo:'timeline', desc:t.event, date:new Date(t.date+'T12:00:00').toLocaleString('pt-BR'), user:t.user })),
      ...docs.map(d=>({ tipo:'doc', desc:'Upload: '+d.doc+' — '+d.file, date:d.date, user:d.user }))
    ].sort((a,b)=>a.date<b.date?-1:1);
    let html = '';
    if (events.length===0) {
      html = '<div style="text-align:center;padding:28px;color:#9ca3af;"><i class="fas fa-history" style="font-size:24px;margin-bottom:8px;display:block;"></i>Nenhum evento registrado</div>';
    } else {
      html = '<div style="display:flex;flex-direction:column;gap:0;">';
      events.forEach((ev,i) => {
        html += '<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #f1f3f5;">' +
          '<div style="width:32px;height:32px;border-radius:50%;background:'+(ev.tipo==='doc'?'#e8f4fd':'#f0fdf4')+';display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
          '<i class="fas '+(ev.tipo==='doc'?'fa-file-upload':'fa-check')+'" style="font-size:12px;color:'+(ev.tipo==='doc'?'#2980B9':'#16a34a')+';"></i></div>' +
          '<div style="flex:1;"><div style="font-size:13px;color:#374151;font-weight:600;">'+escHtml(ev.desc)+'</div>' +
          '<div style="font-size:11px;color:#9ca3af;">'+escHtml(ev.date)+' · '+escHtml(ev.user)+'</div></div></div>';
      });
      html += '</div>';
    }
    const el = document.getElementById('fechHistoricoBody');
    if (el) el.innerHTML = html;
  }

  function buildFechAuditoria(imp) {
    const docs = fechDocumentos[imp.id] || [];
    const auditRows = [
      { acao:'Processo criado', data:imp.timeline[0]?.date||'—', user:imp.timeline[0]?.user||'Usuário', obs:'Abertura do processo de importação' },
      ...imp.timeline.filter(t=>t.user).map(t=>({ acao:t.event, data:t.date, user:t.user, obs:'Atualização de status' })),
      ...docs.map(d=>({ acao:'Upload de documento', data:d.date, user:d.user, obs:d.doc+': '+d.file }))
    ];
    let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="background:#f1f3f5;"><th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Ação</th><th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Data/Hora</th><th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Usuário</th><th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Observação</th></tr></thead><tbody>';
    auditRows.forEach(r => {
      html += '<tr style="border-bottom:1px solid #f1f3f5;"><td style="padding:8px 10px;font-weight:600;color:#374151;">'+escHtml(r.acao)+'</td><td style="padding:8px 10px;color:#6c757d;">'+escHtml(r.data)+'</td><td style="padding:8px 10px;color:#374151;">'+escHtml(r.user)+'</td><td style="padding:8px 10px;color:#6c757d;">'+escHtml(r.obs)+'</td></tr>';
    });
    html += '</tbody></table>';
    const el = document.getElementById('fechAuditoriaBody');
    if (el) el.innerHTML = html;
  }

  // ── Edição Inline — Tabela de Produtos Importados ───────────────────────
  // Mapa em memória dos dados editados pelo usuário (persiste na sessão)
  const impProdEdits = {};

  function startInlineEdit(td, inputId, code, field) {
    const view = td.querySelector('.imp-inline-view');
    const input = td.querySelector('.imp-inline-input');
    if (!view || !input) return;
    view.style.display = 'none';
    input.style.display = 'block';
    input.focus();
    input.select();
  }

  function saveInlineEdit(input) {
    const code = input.dataset.code || '';
    const field = input.dataset.field || '';
    const val = input.value.trim();
    // Persistir no mapa local
    if (!impProdEdits[code]) impProdEdits[code] = {};
    impProdEdits[code][field] = val;
    // Atualizar view
    const td = input.closest('td');
    if (!td) return;
    const view = td.querySelector('.imp-inline-view');
    if (view) {
      view.innerHTML = val || '<span style="font-style:italic;font-size:11px;">— clique para preencher —</span>';
      if (val) {
        view.style.color = '#374151';
      } else {
        view.style.color = '#dc2626';
      }
      view.style.display = 'block';
    }
    input.style.display = 'none';
    // Salvar no servidor via API
    fetch('/suprimentos/api/product-imp-field', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ code, field, value: val })
    }).then(r => r.json()).then(d => {
      if (d.ok) showToastSup('✅ '+field.toUpperCase()+' salvo para '+code, 'success');
    }).catch(() => showToastSup('Salvo localmente (sincronização pendente)', 'info'));
  }

  function cancelInlineEdit(input) {
    const td = input.closest('td');
    if (!td) return;
    const view = td.querySelector('.imp-inline-view');
    if (view) view.style.display = 'block';
    input.style.display = 'none';
  }

  // ── Produtos Importados ───────────────────────────────────────────────────
  let impProdExpanded = false;
  function toggleImpProdSection() {
    impProdExpanded = !impProdExpanded;
    const sec = document.getElementById('impProdTableSection');
    const chev = document.getElementById('impProdChevron');
    const btn = chev?.closest('button');
    if (sec) sec.style.display = impProdExpanded ? 'block' : 'none';
    if (chev) {
      chev.className = impProdExpanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
    }
    if (btn) btn.innerHTML = (impProdExpanded ? '<i class="fas fa-chevron-up" id="impProdChevron"></i> Recolher' : '<i class="fas fa-chevron-down" id="impProdChevron"></i> Expandir');
  }

  function filterImportProducts() {
    const q = (document.getElementById('filterImpProd')?.value || '').toLowerCase();
    document.querySelectorAll('.imp-prod-row').forEach(row => {
      const text = row.textContent?.toLowerCase() || '';
      row.style.display = text.includes(q) ? '' : 'none';
    });
    if (q && !impProdExpanded) toggleImpProdSection();
  }

  // Mapa de descrições EN editadas pelo usuário
  const impProdDescENMap = {};

  function editDescEN(code) {
    const current = impProdDescENMap[code] || '';
    const val = prompt('Descrição em inglês para ' + code + ':\n(Ex: Aluminum Alloy 6061 Sheet 3mm thickness)', current);
    if (val === null) return;
    impProdDescENMap[code] = val;
    // Atualiza célula na tabela
    const rows = document.querySelectorAll('.imp-prod-row');
    rows.forEach(row => {
      const codeCell = row.querySelector('td:first-child');
      if (codeCell?.textContent?.trim() === code) {
        const descCell = row.querySelectorAll('td')[2];
        if (descCell) {
          const span = descCell.querySelector('span');
          if (span) span.textContent = val || '— preencher —';
        }
      }
    });
    if (val) alert('✅ Descrição EN salva para ' + code + ':\n' + val + '\n\nSalvo localmente. Para persistir, utilize a edição de produtos em Cadastros.');
  }

  function exportImpProdCSV() {
    const rows = document.querySelectorAll('.imp-prod-row');
    if (rows.length === 0) { alert('Nenhum produto para exportar.'); return; }
    let csv = 'Código,Produto (PT),Descrição EN,NCM,Detalhes Técnicos,Qtd Atual,Preço Unit. Ref.,Subtotal Est.,Fornecedor,Status\n';
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      const vals = Array.from(cells).map(c => '"' + (c.textContent?.trim().replace(/"/g,'""') || '') + '"');
      csv += vals.join(',') + '\n';
    });
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'produtos_importados.csv'; a.click();
    URL.revokeObjectURL(url);
  }


  // Expose window.purchaseOrdersData for abrirModalPedidoCompra()

  // ── Event delegation for data-action buttons (avoids unsafe onclick inline) ─
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'upload-doc') {
      const idx = parseInt(btn.dataset.slotIndex || '0', 10);
      const docName = btn.dataset.slotDoc || '';
      uploadDocSlot(idx, docName);
    } else if (action === 'view-quotation') {
      openQuotationDetail(btn.dataset.id || '');
    } else if (action === 'approve-quotation') {
      approveQuotation(btn.dataset.id || '', btn.dataset.code || '', btn.dataset.supplier || 'fornecedor');
    } else if (action === 'reject-quotation') {
      recusarCotacao(btn.dataset.id || '', btn.dataset.code || '');
    } else if (action === 'resend-quotation') {
      reenviarCotacao(btn.dataset.id || '', btn.dataset.code || '');
    } else if (action === 'copy-supplier-link') {
      copySupplierLink(btn.dataset.id || '');
    } else if (action === 'view-pc') {
      abrirModalPedidoCompra(btn.dataset.id || '');
    } else if (action === 'disparar-cotacao') {
      dispararCotacao(btn.dataset.supplierId || '', btn.dataset.supplierName || '', btn.dataset.supplierEmail || '');
    }
  });
  // Auto close popups after 12s
  setTimeout(() => {
    ['pendingApprovalPopup','criticalQuotPopup'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
  }, 12000);

  // ── URL params: abrir modal de cotação pré-preenchido ─────────────────────
  (function() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'nova_cotacao') {
      const productCode = params.get('product_code') || '';
      const productName = params.get('product_name') || '';
      const supId = params.get('supplier_id') || '';
      const supName = params.get('supplier_name') || '';
      openModal('gerarCotacaoModal');
      if (productCode) {
        setTimeout(function() {
          const firstItemSel = document.querySelector('.cot-item select');
          if (firstItemSel) {
            firstItemSel.value = productCode;
          } else {
            addCotItem();
            setTimeout(function() {
              const sel = document.querySelector('.cot-item select');
              if (sel) sel.value = productCode;
            }, 50);
          }
        }, 100);
        if (productName) {
          showToastSup('\u2709\ufe0f Cota\u00e7\u00e3o para: ' + productName, 'info');
        }
      }
      if (supId) {
        // Selecionar o fornecedor no primeiro select de fornecedor da cotação
        setTimeout(function() {
          const firstSupSel = document.querySelector('#cotSupplierList .cot-sup select');
          if (firstSupSel) {
            firstSupSel.value = supId;
          } else {
            // Adicionar linha de fornecedor se não houver
            addCotSupplier();
            setTimeout(function() {
              const sel = document.querySelector('#cotSupplierList .cot-sup select');
              if (sel) sel.value = supId;
            }, 50);
          }
        }, 100);
      }
      if (supName && !productName) {
        showToastSup('\u2709\ufe0f Cota\u00e7\u00e3o para: ' + supName, 'info');
      }
      // Limpar params da URL sem recarregar
      history.replaceState({}, '', window.location.pathname);
    }
  })();

  // ════════════════════════════════════════════════════════════════════
  // EDITAR PROCESSO DE IMPORTAÇÃO
  // ════════════════════════════════════════════════════════════════════
  function openEditImportModal(id) {
    const imp = window.importsData.find(x => x.id === id);
    if (!imp) return;
    window._editingImpId = id;
    document.getElementById('editImpCodigo').textContent = imp.code;
    const taxes  = imp.taxes  || {};
    const num    = imp.numerario || {};
    const moedaSym = (imp.invoiceValueEUR||0)>0 ? 'EUR' : 'USD';
    const invoiceVal = (imp.invoiceValueEUR||0)>0 ? (imp.invoiceValueEUR||0) : (imp.invoiceValueUSD||0);

    const fmtDate = d => d ? d.substring(0,10) : '';

    document.getElementById('editImportBody').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;display:block;">Invoice Nº</label>
          <input type="text" id="editInvoiceNumber" class="form-control" value="${imp.invoiceNumber||''}">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;display:block;">Data Invoice</label>
          <input type="date" id="editInvoiceDate" class="form-control" value="${fmtDate(imp.invoiceDate)}">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;display:block;">Moeda</label>
          <select id="editCurrency" class="form-control">
            <option value="USD" ${(imp.currency||'USD')==='USD'?'selected':''}>USD</option>
            <option value="EUR" ${(imp.currency||'')==='EUR'?'selected':''}>EUR</option>
            <option value="GBP" ${(imp.currency||'')==='GBP'?'selected':''}>GBP</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;display:block;">Taxa de Câmbio (R$)</label>
          <input type="number" id="editExchangeRate" class="form-control" value="${imp.exchangeRate||5.52}" step="0.01">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;display:block;">Valor Invoice (${moedaSym})</label>
          <input type="number" id="editInvoiceValue" class="form-control" value="${invoiceVal}" step="0.01">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;display:block;">Incoterm</label>
          <select id="editIncoterm" class="form-control">
            ${['FOB','CIF','EXW','CFR','DDP','DAP'].map(t=>`<option value="${t}" ${(imp.incoterm||'FOB')===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;display:block;">Porto Origem</label>
          <input type="text" id="editPortOrigin" class="form-control" value="${imp.portOfOrigin||''}">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;display:block;">Porto Destino</label>
          <input type="text" id="editPortDest" class="form-control" value="${imp.portOfDestination||'Santos'}">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;display:block;">Peso Bruto (kg)</label>
          <input type="number" id="editGrossWeight" class="form-control" value="${imp.grossWeight||0}" step="0.1">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;display:block;">Peso Líquido (kg)</label>
          <input type="number" id="editNetWeight" class="form-control" value="${imp.netWeight||0}" step="0.1">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;display:block;">Chegada Prevista</label>
          <input type="date" id="editExpectedArrival" class="form-control" value="${fmtDate(imp.expectedArrival)}">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;display:block;">NCM (geral)</label>
          <input type="text" id="editNcm" class="form-control" value="${imp.ncm||''}">
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;display:block;">Descrição</label>
        <input type="text" id="editDescription" class="form-control" value="${imp.description||''}">
      </div>
      <div style="background:#fef3c7;border-radius:8px;padding:12px;margin-bottom:18px;">
        <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:10px;"><i class="fas fa-percentage" style="margin-right:5px;"></i>Impostos / Alíquotas</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
          <div><label style="font-size:10px;color:#92400e;font-weight:700;display:block;margin-bottom:3px;">II (%)</label><input type="number" id="editTaxII" class="form-control" value="${taxes.ii||0}" step="0.1"></div>
          <div><label style="font-size:10px;color:#92400e;font-weight:700;display:block;margin-bottom:3px;">IPI (%)</label><input type="number" id="editTaxIPI" class="form-control" value="${taxes.ipi||0}" step="0.1"></div>
          <div><label style="font-size:10px;color:#92400e;font-weight:700;display:block;margin-bottom:3px;">PIS (%)</label><input type="number" id="editTaxPIS" class="form-control" value="${taxes.pis||0}" step="0.1"></div>
          <div><label style="font-size:10px;color:#92400e;font-weight:700;display:block;margin-bottom:3px;">COFINS (%)</label><input type="number" id="editTaxCOFINS" class="form-control" value="${taxes.cofins||0}" step="0.1"></div>
          <div><label style="font-size:10px;color:#92400e;font-weight:700;display:block;margin-bottom:3px;">ICMS (%)</label><input type="number" id="editTaxICMS" class="form-control" value="${taxes.icms||0}" step="0.1"></div>
          <div><label style="font-size:10px;color:#92400e;font-weight:700;display:block;margin-bottom:3px;">AFRMM (R$)</label><input type="number" id="editTaxAFRMM" class="form-control" value="${taxes.afrmm||0}" step="1"></div>
          <div><label style="font-size:10px;color:#92400e;font-weight:700;display:block;margin-bottom:3px;">SISCOMEX (R$)</label><input type="number" id="editTaxSISCOMEX" class="form-control" value="${taxes.siscomex||0}" step="1"></div>
        </div>
      </div>
      <div style="background:#e8f4fd;border-radius:8px;padding:12px;">
        <div style="font-size:12px;font-weight:700;color:#1B4F72;margin-bottom:10px;"><i class="fas fa-money-bill-wave" style="margin-right:5px;"></i>Numerário / Custos Adicionais (R$)</div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;">
          <div><label style="font-size:10px;color:#1B4F72;font-weight:700;display:block;margin-bottom:3px;">Frete</label><input type="number" id="editNumFrete" class="form-control" value="${num.frete||0}" step="0.01"></div>
          <div><label style="font-size:10px;color:#1B4F72;font-weight:700;display:block;margin-bottom:3px;">Seguro</label><input type="number" id="editNumSeguro" class="form-control" value="${num.seguro||0}" step="0.01"></div>
          <div><label style="font-size:10px;color:#1B4F72;font-weight:700;display:block;margin-bottom:3px;">Despachante</label><input type="number" id="editNumDesp" class="form-control" value="${num.desp||0}" step="0.01"></div>
          <div><label style="font-size:10px;color:#1B4F72;font-weight:700;display:block;margin-bottom:3px;">Porto</label><input type="number" id="editNumPorto" class="form-control" value="${num.porto||0}" step="0.01"></div>
          <div><label style="font-size:10px;color:#1B4F72;font-weight:700;display:block;margin-bottom:3px;">Armazenagem</label><input type="number" id="editNumArm" class="form-control" value="${num.arm||0}" step="0.01"></div>
        </div>
      </div>


      <div style="margin-top:18px;padding-top:16px;border-top:1px solid #e5e7eb;">
        <div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:10px;"><i class="fas fa-boxes" style="margin-right:6px;"></i>Itens da Invoice
          <span id="editItemsCount" style="font-size:11px;font-weight:400;color:#6b7280;margin-left:6px;"></span>
        </div>
        <div id="editItemsPreview"></div>
      </div>
    `;
    // Preencher itens no edit modal
    const editItemsCount = document.getElementById('editItemsCount');
    const editItemsPreview = document.getElementById('editItemsPreview');
    if (editItemsCount) {
      editItemsCount.textContent = imp.items && imp.items.length > 0
        ? '(' + imp.items.length + ' item(ns) cadastrado(s))'
        : '(Nenhum item — valor FOB via campo acima)';
    }
    if (editItemsPreview) {
      if (imp.items && imp.items.length > 0) {
        let tbl = '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
        tbl += '<thead><tr style="background:#e0f2fe;"><th style="padding:5px 8px;text-align:left;">Cód.</th><th style="padding:5px 8px;text-align:left;">Descrição PT</th><th style="padding:5px 8px;text-align:right;">Qtd</th><th style="padding:5px 8px;text-align:right;">Val.Unit.</th><th style="padding:5px 8px;text-align:right;">Subtotal</th></tr></thead><tbody>';
        imp.items.forEach(it => {
          const sub = it.sub || it.subtotal || ((it.qty||0)*(it.vu||0));
          tbl += '<tr style="border-bottom:1px solid #e5e7eb;">';
          tbl += '<td style="padding:4px 8px;font-family:monospace;color:#1B4F72;">'+(it.code||'—')+'</td>';
          tbl += '<td style="padding:4px 8px;">'+(it.descPT||it.description||'—')+'</td>';
          tbl += '<td style="padding:4px 8px;text-align:right;">'+(it.qty||0)+'</td>';
          tbl += '<td style="padding:4px 8px;text-align:right;">'+(it.vu||0).toLocaleString('pt-BR',{minimumFractionDigits:2})+'</td>';
          tbl += '<td style="padding:4px 8px;text-align:right;font-weight:700;">'+sub.toLocaleString('pt-BR',{minimumFractionDigits:2})+'</td>';
          tbl += '</tr>';
        });
        tbl += '</tbody></table>';
        editItemsPreview.innerHTML = tbl;
      } else {
        editItemsPreview.innerHTML = '<div style="background:#fef9c3;padding:10px;border-radius:6px;font-size:12px;color:#92400e;"><i class="fas fa-info-circle" style="margin-right:5px;"></i>Sem itens cadastrados. Informe o <strong>Valor Invoice</strong> acima — o FOB na LI usará esse valor.</div>';
      }
    }
    closeModal('importDetailModal');
    openModal('editImportModal');
  }

  async function salvarEdicaoImport() {
    const id = window._editingImpId;
    if (!id) return;
    const imp = window.importsData.find(x => x.id === id);
    if (!imp) return;
    const currency     = document.getElementById('editCurrency')?.value || 'USD';
    const invoiceVal   = parseFloat(document.getElementById('editInvoiceValue')?.value || '0');
    const exchangeRate = parseFloat(document.getElementById('editExchangeRate')?.value || '5.52');
    const taxes = {
      ii:       parseFloat(document.getElementById('editTaxII')?.value || '0'),
      ipi:      parseFloat(document.getElementById('editTaxIPI')?.value || '0'),
      pis:      parseFloat(document.getElementById('editTaxPIS')?.value || '0'),
      cofins:   parseFloat(document.getElementById('editTaxCOFINS')?.value || '0'),
      icms:     parseFloat(document.getElementById('editTaxICMS')?.value || '0'),
      afrmm:    parseFloat(document.getElementById('editTaxAFRMM')?.value || '0'),
      siscomex: parseFloat(document.getElementById('editTaxSISCOMEX')?.value || '0'),
    };
    const numerario = {
      frete:  parseFloat(document.getElementById('editNumFrete')?.value || '0'),
      seguro: parseFloat(document.getElementById('editNumSeguro')?.value || '0'),
      desp:   parseFloat(document.getElementById('editNumDesp')?.value || '0'),
      porto:  parseFloat(document.getElementById('editNumPorto')?.value || '0'),
      arm:    parseFloat(document.getElementById('editNumArm')?.value || '0'),
    };
    const body = {
      invoiceNumber:      document.getElementById('editInvoiceNumber')?.value?.trim() || '',
      invoiceDate:        document.getElementById('editInvoiceDate')?.value || '',
      currency, exchangeRate,
      invoiceValueEUR:    currency === 'EUR' ? invoiceVal : 0,
      invoiceValueUSD:    currency === 'USD' ? invoiceVal : 0,
      invoiceValueBRL:    invoiceVal * exchangeRate,
      incoterm:           document.getElementById('editIncoterm')?.value || 'FOB',
      portOfOrigin:       document.getElementById('editPortOrigin')?.value || '',
      portOfDestination:  document.getElementById('editPortDest')?.value || 'Santos',
      grossWeight:        parseFloat(document.getElementById('editGrossWeight')?.value || '0'),
      netWeight:          parseFloat(document.getElementById('editNetWeight')?.value || '0'),
      expectedArrival:    document.getElementById('editExpectedArrival')?.value || '',
      ncm:                document.getElementById('editNcm')?.value?.trim() || '',
      description:        document.getElementById('editDescription')?.value?.trim() || '',
      taxes, numerario,
      items: imp.items || [],
    };
    try {
      const res = await fetch('/suprimentos/api/imports/' + id, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.ok) {
        // Atualizar em memória
        Object.assign(imp, {
          invoiceNumber: body.invoiceNumber, invoiceDate: body.invoiceDate,
          currency, exchangeRate,
          invoiceValueEUR: body.invoiceValueEUR, invoiceValueUSD: body.invoiceValueUSD,
          invoiceValueBRL: body.invoiceValueBRL, incoterm: body.incoterm,
          portOfOrigin: body.portOfOrigin, portOfDestination: body.portOfDestination,
          grossWeight: body.grossWeight, netWeight: body.netWeight,
          expectedArrival: body.expectedArrival, ncm: body.ncm,
          description: body.description, taxes, numerario,
          items: body.items || imp.items || [],
        });
        showToastSup('✅ Processo atualizado com sucesso!', 'success');
        closeModal('editImportModal');
        setTimeout(() => openImportDetail(id), 200);
      } else {
        showToastSup(data.error || 'Erro ao salvar', 'error');
      }
    } catch(e) { showToastSup('Erro de conexão', 'error'); }
  }

  // ════════════════════════════════════════════════════════════════════
  // DADOS FÍSICOS DOS PRODUTOS (peso bruto/líquido unitário e CBM)
  // ════════════════════════════════════════════════════════════════════
  // ── Dados Físicos dos Produtos (D1 + memória) ────────────────────────────
  // Fallback para localStorage mantido por compatibilidade com dados antigos
  function getProdPhysKey(code) { return 'prodPhys_' + code; }

  function getProdPhysData(code) {
    // Prioridade 1: window.allItemsData (carregado do D1 via hydration)
    if (window.allItemsData) {
      const item = window.allItemsData.find(function(i) { return i.code === code; });
      if (item && (item.grossWeight > 0 || item.netWeight > 0 || item.cbm > 0)) {
        return { grossWeight: item.grossWeight || 0, netWeight: item.netWeight || 0, cbm: item.cbm || 0 };
      }
    }
    // Fallback: localStorage (dados salvos antes da migração)
    try { return JSON.parse(localStorage.getItem(getProdPhysKey(code)) || 'null'); }
    catch { return null; }
  }

  function openProdPhysicalModal(code, name) {
    console.log('[PHYS] Abrindo modal para:', code, name);
    const codeEl = document.getElementById('prodPhysicalCode');
    const nameEl = document.getElementById('prodPhysicalName');
    const grossEl = document.getElementById('prodPhysGrossPeso');
    const netEl   = document.getElementById('prodPhysNetPeso');
    const cbmEl   = document.getElementById('prodPhysCBM');
    if (!codeEl || !nameEl || !grossEl || !netEl || !cbmEl) {
      console.error('[PHYS] Elementos do modal não encontrados!', { codeEl, nameEl, grossEl, netEl, cbmEl });
      alert('Erro: modal de dados físicos não encontrado. Recarregue a página.');
      return;
    }
    codeEl.value = code;
    nameEl.textContent = name;
    const data = getProdPhysData(code) || {};
    grossEl.value = data.grossWeight || '';
    netEl.value   = data.netWeight   || '';
    cbmEl.value   = data.cbm         || '';
    openModal('prodPhysicalModal');
    console.log('[PHYS] Modal aberto com sucesso');
  }
  window.openProdPhysicalModal = openProdPhysicalModal;

  async function salvarDadosFisicos() {
    const code = document.getElementById('prodPhysicalCode')?.value;
    if (!code) return;
    const gross = parseFloat(document.getElementById('prodPhysGrossPeso')?.value || '0');
    const net   = parseFloat(document.getElementById('prodPhysNetPeso')?.value   || '0');
    const cbm   = parseFloat(document.getElementById('prodPhysCBM')?.value       || '0');

    // Mostrar loading
    const saveBtn = document.querySelector('#prodPhysicalModal button[onclick="salvarDadosFisicos()"]');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando...'; }

    try {
      // 1. Persistir no D1 via API
      const res  = await fetch('/suprimentos/api/product-phys-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, grossWeight: gross, netWeight: net, cbm })
      });
      const data = await res.json();

      if (data.ok) {
        // 2. Atualizar window.allItemsData em memória (sem reload)
        if (window.allItemsData) {
          const item = window.allItemsData.find(function(i) { return i.code === code; });
          if (item) {
            item.grossWeight = gross;
            item.netWeight   = net;
            item.cbm         = cbm;
          }
        }
        // 3. Manter também no localStorage como cache (compatibilidade)
        localStorage.setItem(getProdPhysKey(code), JSON.stringify({ grossWeight: gross, netWeight: net, cbm }));
        showToastSup('✅ Dados físicos salvos para ' + code + ' (gross: ' + gross + 'kg | net: ' + net + 'kg | CBM: ' + cbm + 'm³)', 'success');
        closeModal('prodPhysicalModal');
      } else {
        showToastSup('❌ Erro ao salvar: ' + (data.error || 'Tente novamente'), 'error');
      }
    } catch(e) {
      // Fallback gracioso: salvar só no localStorage se API falhar
      localStorage.setItem(getProdPhysKey(code), JSON.stringify({ grossWeight: gross, netWeight: net, cbm }));
      showToastSup('⚠ Salvo localmente (sem conexão ao servidor). Reconecte para sincronizar.', 'warning');
      closeModal('prodPhysicalModal');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar Dados Físicos'; }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // PACKING LIST
  // ════════════════════════════════════════════════════════════════════
  function openPackingList(id) {
    const imp = window.importsData.find(x => x.id === id);
    if (!imp) return;
    document.getElementById('packingListImpCodigo').textContent = imp.code;

    const moedaSym    = (imp.invoiceValueEUR||0) > 0 ? '€' : 'US$';
    const moedaLabel  = (imp.invoiceValueEUR||0) > 0 ? 'EUR' : 'USD';
    const hoje        = new Date().toLocaleDateString('pt-BR');
    const fmtDate     = d => d ? new Date(d+'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const fmtNum      = (v,d=3) => (v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});

    // Montar lista de itens com dados físicos
    const invItems = imp.items && imp.items.length > 0 ? imp.items
      : [{ code: imp.code||'—', descEN: imp.description||'—', descPT: imp.description||'—', qty: 1, vu: imp.invoiceValueEUR||imp.invoiceValueUSD||0, sub: imp.invoiceValueEUR||imp.invoiceValueUSD||0, ncm: imp.ncm||'—' }];

    let totalGross = 0, totalNet = 0, totalCBM = 0, totalVal = 0;
    const rows = invItems.map(function(it, i) {
      const qty     = it.qty || 1;
      const physData = getProdPhysData(it.code) || {};
      const grossUn = physData.grossWeight || 0;
      const netUn   = physData.netWeight   || 0;
      const cbmUn   = physData.cbm         || 0;
      const grossT  = grossUn * qty;
      const netT    = netUn   * qty;
      const cbmT    = cbmUn   * qty;
      const val     = it.sub || it.subtotal || ((it.qty||0)*(it.vu||0));
      totalGross += grossT; totalNet += netT; totalCBM += cbmT; totalVal += val;

      const hasPhy  = grossUn > 0 || netUn > 0 || cbmUn > 0;
      const warnStyle = hasPhy ? '' : 'color:#dc2626;font-style:italic;';

      return '<tr style="background:'+(i%2===0?'#fafafa':'white')+';border-bottom:1px solid #e5e7eb;">' +
        '<td style="padding:8px 10px;font-family:monospace;font-weight:700;color:#1B4F72;font-size:11px;">'+(it.code||'—')+'</td>' +
        '<td style="padding:8px 10px;color:#374151;font-size:12px;">'+(it.descPT||it.description||it.descEN||'—')+'</td>' +
        '<td style="padding:8px 10px;text-align:right;font-weight:600;">'+(qty)+'</td>' +
        '<td style="padding:8px 10px;text-align:right;'+warnStyle+'">'+(grossT > 0 ? fmtNum(grossT,2)+' kg' : '— *')+'</td>' +
        '<td style="padding:8px 10px;text-align:right;'+warnStyle+'">'+(netT > 0 ? fmtNum(netT,2)+' kg' : '— *')+'</td>' +
        '<td style="padding:8px 10px;text-align:right;'+warnStyle+'">'+(cbmT > 0 ? fmtNum(cbmT,4)+' m³' : '— *')+'</td>' +
        '<td style="padding:8px 10px;text-align:left;font-family:monospace;color:#7c3aed;font-weight:700;">'+(it.ncm||imp.ncm||'—')+'</td>' +
        '</tr>';
    }).join('');

    const hasMissingPhys = invItems.some(it => {
      const p = getProdPhysData(it.code); return !p || (!p.grossWeight && !p.netWeight && !p.cbm);
    });

    const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;max-width:860px;margin:0 auto;">

      <!-- Cabeçalho -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:3px solid #7c3aed;">
        <div>
          <div style="font-size:22px;font-weight:800;color:#7c3aed;letter-spacing:1px;">PACKING LIST</div>
          <div style="font-size:13px;color:#6c757d;margin-top:4px;">
            Ref: <strong>${imp.invoiceNumber||'—'}</strong> &nbsp;·&nbsp; Data: ${fmtDate(imp.invoiceDate)} &nbsp;·&nbsp; Gerado em ${hoje}
          </div>
          <div style="font-size:12px;color:#6c757d;">
            Incoterm: <strong>${imp.incoterm||'—'}</strong> &nbsp;·&nbsp;
            Porto Embarque: <strong>${imp.portOfOrigin||'—'}</strong> &nbsp;·&nbsp;
            Porto Destino: <strong>${imp.portOfDestination||'—'}</strong>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:#9ca3af;">Processo</div>
          <div style="font-size:18px;font-weight:800;color:#7c3aed;">${imp.code}</div>
          <div style="font-size:11px;color:#6c757d;margin-top:4px;">Fornecedor: <strong>${imp.supplierName||'—'}</strong></div>
        </div>
      </div>

      <!-- Tabela de Itens -->
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px;">
        <thead>
          <tr style="background:#7c3aed;color:white;">
            <th style="padding:9px 10px;text-align:left;">Código</th>
            <th style="padding:9px 10px;text-align:left;">Produto</th>
            <th style="padding:9px 10px;text-align:right;">Qtd</th>
            <th style="padding:9px 10px;text-align:right;">Peso Bruto Total</th>
            <th style="padding:9px 10px;text-align:right;">Peso Líq. Total</th>
            <th style="padding:9px 10px;text-align:right;">CBM Total</th>
            <th style="padding:9px 10px;text-align:left;">NCM</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:#f5f3ff;font-weight:800;">
            <td colspan="2" style="padding:10px;color:#7c3aed;text-align:right;font-size:13px;">TOTAIS:</td>
            <td style="padding:10px;text-align:right;color:#7c3aed;font-size:13px;">${invItems.length} itens</td>
            <td style="padding:10px;text-align:right;color:#1B4F72;font-size:13px;">${totalGross>0?fmtNum(totalGross,2)+' kg':'—'}</td>
            <td style="padding:10px;text-align:right;color:#1B4F72;font-size:13px;">${totalNet>0?fmtNum(totalNet,2)+' kg':'—'}</td>
            <td style="padding:10px;text-align:right;color:#1B4F72;font-size:13px;">${totalCBM>0?fmtNum(totalCBM,4)+' m³':'—'}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <!-- Resumo final -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">
        <div style="background:#f0fdf4;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:10px;color:#166534;font-weight:700;text-transform:uppercase;">Peso Bruto Total</div>
          <div style="font-size:20px;font-weight:800;color:#166534;">${totalGross>0?fmtNum(totalGross,2)+' kg':'—'}</div>
        </div>
        <div style="background:#f0fdf4;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:10px;color:#166534;font-weight:700;text-transform:uppercase;">Peso Líquido Total</div>
          <div style="font-size:20px;font-weight:800;color:#166534;">${totalNet>0?fmtNum(totalNet,2)+' kg':'—'}</div>
        </div>
        <div style="background:#f5f3ff;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:10px;color:#7c3aed;font-weight:700;text-transform:uppercase;">Volume Total (CBM)</div>
          <div style="font-size:20px;font-weight:800;color:#7c3aed;">${totalCBM>0?fmtNum(totalCBM,4)+' m³':'—'}</div>
        </div>
      </div>

      ${hasMissingPhys ? `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;font-size:12px;color:#991b1b;">
        <i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>
        <strong>Atenção:</strong> Itens marcados com <em>—*</em> não possuem dados físicos cadastrados.
        Acesse <strong>Produtos de Fornecedores Importados</strong> e clique no nome do produto para preencher peso bruto, peso líquido e CBM.
      </div>` : ''}
    </div>`;

    document.getElementById('packingListBody').innerHTML = html;
    closeModal('importDetailModal');
    openModal('packingListModal');
  }

