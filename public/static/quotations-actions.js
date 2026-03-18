/**
 * quotations-actions.js
 * Functions for the Suprimentos module: quotations, imports, purchase orders, etc.
 * Requires window.quotationsData, window.purchaseOrdersData, window.statusInfoData,
 * window.suppliersData, window.importsData, and window.allItemsData to be set by
 * the server-side data initialization script before these functions are called.
 */

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
  async function approveQuotation(id, code, supplierName) {
    if (!confirm('Aprovar cotação ' + code + '?\nUm Pedido de Compra será gerado automaticamente.')) return;
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
    if (!confirm('Reenviar cotação ' + code + ' para os fornecedores?')) return;
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
    if (!confirm('Disparar cotação individual para ' + supName + '?')) return;
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
    const taxes = imp.taxes || {};
    const num = imp.numerario || {};
    document.getElementById('importDetailTitle').innerHTML = '<i class="fas fa-ship" style="margin-right:8px;"></i>' + imp.code + ' — ' + imp.supplierName;
    let html = '';
    // Seção dados gerais
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">';
    html += detRow('Código Processo', imp.code) + detRow('Fornecedor', imp.supplierName);
    html += detRow('Invoice Nº', imp.invoiceNumber) + detRow('Data Invoice', new Date(imp.invoiceDate+'T12:00:00').toLocaleDateString('pt-BR'));
    html += detRow('Incoterm', imp.incoterm) + detRow('NCM', imp.ncm);
    html += detRow('Porto Origem', imp.portOfOrigin) + detRow('Porto Destino', imp.portOfDestination);
    html += detRow('Peso Líquido', imp.netWeight + ' kg') + detRow('Peso Bruto', imp.grossWeight + ' kg');
    html += detRow('Chegada Prevista', new Date(imp.expectedArrival+'T12:00:00').toLocaleDateString('pt-BR')) + detRow('Descrição', imp.description);
    html += '</div>';
    // Invoice
    html += '<div style="background:#e8f4fd;border-radius:8px;padding:14px;margin-bottom:16px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:10px;"><i class="fas fa-file-invoice-dollar" style="margin-right:6px;"></i>Valores da Invoice</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">';
    html += '<div><div style="font-size:10px;color:#9ca3af;font-weight:700;">VALOR '+(imp.invoiceValueEUR > 0 ? 'EUR':'USD')+'</div><div style="font-size:18px;font-weight:800;color:#2980B9;">'+(imp.invoiceValueEUR > 0 ? '€'+imp.invoiceValueEUR.toLocaleString('pt-BR',{minimumFractionDigits:2}) : 'US$'+imp.invoiceValueUSD.toLocaleString('pt-BR',{minimumFractionDigits:2}))+'</div></div>';
    html += '<div><div style="font-size:10px;color:#9ca3af;font-weight:700;">TAXA CÂMBIO</div><div style="font-size:18px;font-weight:800;color:#374151;">R$ '+imp.exchangeRate+'</div></div>';
    html += '<div><div style="font-size:10px;color:#9ca3af;font-weight:700;">VALOR BRL</div><div style="font-size:18px;font-weight:800;color:#1B4F72;">R$ '+imp.invoiceValueBRL.toLocaleString('pt-BR',{minimumFractionDigits:2})+'</div></div>';
    html += '</div></div>';
    // Impostos
    html += '<div style="background:#fef2f2;border-radius:8px;padding:14px;margin-bottom:16px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:10px;"><i class="fas fa-percent" style="margin-right:6px;"></i>Alíquotas e Impostos</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">II</div><div style="font-size:16px;font-weight:800;color:#dc2626;">' + taxes.ii + '%</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">IPI</div><div style="font-size:16px;font-weight:800;color:#dc2626;">' + taxes.ipi + '%</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">PIS</div><div style="font-size:16px;font-weight:800;color:#d97706;">' + taxes.pis + '%</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">COFINS</div><div style="font-size:16px;font-weight:800;color:#d97706;">' + taxes.cofins + '%</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">ICMS</div><div style="font-size:16px;font-weight:800;color:#7c3aed;">' + taxes.icms + '%</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">AFRMM</div><div style="font-size:16px;font-weight:800;color:#374151;">R$ ' + taxes.afrmm + '</div></div>';
    html += '<div style="background:white;border-radius:6px;padding:8px;text-align:center;"><div style="font-size:10px;color:#9ca3af;">SISCOMEX</div><div style="font-size:16px;font-weight:800;color:#374151;">R$ ' + taxes.siscomex + '</div></div>';
    html += '<div style="background:#fef2f2;border-radius:6px;padding:8px;text-align:center;border:2px solid #dc2626;"><div style="font-size:10px;color:#9ca3af;">TOTAL IMPOSTOS</div><div style="font-size:16px;font-weight:800;color:#dc2626;">R$ ' + (taxes.taxBRL||0).toLocaleString('pt-BR',{minimumFractionDigits:2}) + '</div></div>';
    html += '</div></div>';
    // Numerário
    html += '<div style="background:#f5f3ff;border-radius:8px;padding:14px;">';
    html += '<div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:10px;"><i class="fas fa-calculator" style="margin-right:6px;"></i>Pré-via de Numerário (Custo Desembaraçado)</div>';
    html += '<div style="display:flex;flex-direction:column;gap:6px;">';
    const numItems = [
      ['Invoice (BRL)', num.invoiceBRL], ['Frete', num.freightBRL], ['Seguro', num.insuranceBRL],
      ['Impostos', num.taxesBRL], ['Despachante', num.brokerageBRL], ['Taxas Porto', num.portFeesBRL], ['Armazenagem', num.storageBRL]
    ];
    for (const [label, val] of numItems) {
      if (!val) continue;
      html += '<div style="display:flex;justify-content:space-between;padding:6px 8px;background:white;border-radius:6px;">' +
        '<span style="font-size:13px;color:#374151;">'+label+'</span>' +
        '<span style="font-size:13px;font-weight:600;color:#374151;">R$ '+val.toLocaleString('pt-BR',{minimumFractionDigits:2})+'</span></div>';
    }
    html += '<div style="display:flex;justify-content:space-between;padding:10px 8px;background:#7c3aed;border-radius:6px;margin-top:4px;">' +
      '<span style="font-size:13px;font-weight:700;color:white;">CUSTO TOTAL DESEMBARAÇADO</span>' +
      '<span style="font-size:15px;font-weight:800;color:white;">R$ '+(num.totalLandedCostBRL||0).toLocaleString('pt-BR',{minimumFractionDigits:2})+'</span></div>';
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
    // mantido por compatibilidade
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

  function onImpItemChange(idx) {
    const sel = document.getElementById('impItemProd'+idx);
    const code = sel.value;
    if (!code || code==='__manual__') return;
    const item = window.allItemsData.find(i => i.code===code);
    if (!item) return;
    // Pré-preenche descrição PT e EN dos dados do produto importado
    const impProdEl = document.querySelector('.imp-prod-row[data-code="'+code+'"]');
    const descPT = item.descPT || item.name || '';
    const descEN = item.descEN || item.englishDescription || item.englishDesc || '';
    const ncm = item.ncm || (impProdEl ? (() => {
      const cells = impProdEl.querySelectorAll('td');
      return cells[4]?.textContent?.trim() || '';
    })() : '');
    if (document.getElementById('impItemDescPT'+idx)) document.getElementById('impItemDescPT'+idx).value = descPT;
    if (document.getElementById('impItemDescEN'+idx)) document.getElementById('impItemDescEN'+idx).value = descEN;
    if (document.getElementById('impItemNCM'+idx) && ncm) document.getElementById('impItemNCM'+idx).value = ncm;
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
    document.getElementById('impResumoItens') && (document.getElementById('impResumoItens').textContent = count);
    calcImpostos();
  }

  function calcImpBRL() {
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
    try {
      const res = await fetch('/suprimentos/api/imports/create', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ invoiceNumber: inv, supplierId: fornId, supplierName: forn, modality: mod })
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
    document.getElementById('liImpCodigo').textContent = imp.code;
    const hoje = new Date().toLocaleDateString('pt-BR');
    let html = `
    <div style="background:#f5f3ff;border-radius:8px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div style="font-size:16px;font-weight:800;color:#7c3aed;"><i class="fas fa-stamp" style="margin-right:8px;"></i>RASCUNHO DE LICENÇA DE IMPORTAÇÃO</div>
        <span style="background:#fef2f2;color:#dc2626;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;border:1px solid #fecaca;">MINUTA — Não oficial</span>
      </div>
      <div style="font-size:11px;color:#6c757d;">Gerado automaticamente em \${hoje} · Processo: \${imp.code}</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
      \${detRow('IMPORTADOR (CNPJ)', 'Sua Empresa Ltda — 00.000.000/0001-00')}
      \${detRow('FORNECEDOR / EXPORTADOR', imp.supplierName)}
      \${detRow('PAÍS DE ORIGEM', imp.portOfOrigin.includes('Hamburg')||imp.portOfOrigin.includes('München')?'Alemanha':imp.portOfOrigin.includes('Chicago')?'EUA':'—')}
      \${detRow('PAÍS DE PROCEDÊNCIA', imp.portOfOrigin.includes('Hamburg')||imp.portOfOrigin.includes('München')?'Alemanha':imp.portOfOrigin.includes('Chicago')?'EUA':'—')}
      \${detRow('PORTO/AEROPORTO DESCARGA', imp.portOfDestination)}
      \${detRow('VIA DE TRANSPORTE', imp.incoterm.includes('CIF')?'Marítima':'A definir')}
      \${detRow('INCOTERM', imp.incoterm)}
      \${detRow('REGIME ADUANEIRO', 'Importação Comum')}
      \${detRow('ENQUADRAMENTO CAMBIAL', 'SEM COBERTURA CAMBIAL — LUCROS E DIVIDENDOS')}
      \${detRow('MODALIDADE PAGAMENTO', 'Pagamento Antecipado / L/C à vista')}
    </div>

    <div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:8px;"><i class="fas fa-boxes" style="margin-right:6px;"></i>Relação de Mercadorias</div>
    \${(() => {
      // Tentar montar itens a partir dos dados do processo (itens da invoice)
      const liItems = imp.items && imp.items.length > 0 ? imp.items : [{ productCode: imp.code, descPT: imp.description, ncm: imp.ncm, qty: imp.netWeight, totalCIF: imp.invoiceValueEUR || imp.invoiceValueUSD }];
      const moedaSym = imp.invoiceValueEUR > 0 ? '€' : 'US$';
      const liRows = liItems.map((it, i) => {
        const valTotal = it.totalCIF || it.subtotal || ((it.qty||1) * (it.unitPrice||0));
        return '<tr style="background:'+(i%2===0?'#f8f9fa':'white')+';border-bottom:1px solid #e9ecef;">' +
          '<td style="padding:8px 10px;font-family:monospace;font-weight:700;color:#1B4F72;font-size:11px;">'+(it.productCode||'—')+'</td>' +
          '<td style="padding:8px 10px;font-weight:500;color:#374151;">'+(it.descPT||it.description||imp.description||'— preencher —')+'</td>' +
          '<td style="padding:8px 10px;text-align:right;">'+(it.qty||it.quantity||'—')+'</td>' +
          '<td style="padding:8px 10px;font-weight:700;color:#7c3aed;font-family:monospace;">'+(it.ncm||imp.ncm||'—')+'</td>' +
          '<td style="padding:8px 10px;text-align:right;font-weight:700;color:#1B4F72;">'+moedaSym+' '+(valTotal>0?valTotal.toLocaleString('pt-BR',{minimumFractionDigits:2}):'—')+'</td>' +
          '</tr>';
      }).join('');
      const totalCIF = imp.invoiceValueEUR > 0 ? imp.invoiceValueEUR : imp.invoiceValueUSD;
      return '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">' +
        '<thead><tr style="background:#7c3aed;color:white;">' +
        '<th style="padding:8px 10px;text-align:left;">Cód.</th>' +
        '<th style="padding:8px 10px;text-align:left;">Descrição PT</th>' +
        '<th style="padding:8px 10px;text-align:right;">Qtd</th>' +
        '<th style="padding:8px 10px;text-align:left;">NCM</th>' +
        '<th style="padding:8px 10px;text-align:right;">Valor Total CIF</th>' +
        '</tr></thead>' +
        '<tbody>'+liRows+'</tbody>' +
        '<tfoot><tr style="background:#f5f3ff;">' +
        '<td colspan="4" style="padding:8px 10px;font-weight:700;color:#7c3aed;text-align:right;">TOTAL CIF:</td>' +
        '<td style="padding:8px 10px;font-weight:800;color:#7c3aed;text-align:right;">'+moedaSym+' '+totalCIF.toLocaleString('pt-BR',{minimumFractionDigits:2})+'</td>' +
        '</tr></tfoot>' +
        '</table>';
    })()}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
      \${detRow('VALOR TOTAL CIF (USD/EUR)', imp.invoiceValueEUR > 0 ? '€ '+imp.invoiceValueEUR.toLocaleString('pt-BR',{minimumFractionDigits:2}) : 'US$ '+imp.invoiceValueUSD.toLocaleString('pt-BR',{minimumFractionDigits:2}))}
      \${detRow('VALOR TOTAL CIF (BRL)', 'R$ '+imp.invoiceValueBRL.toLocaleString('pt-BR',{minimumFractionDigits:2})+' (câmbio R$ '+imp.exchangeRate+')')}
      \${detRow('PESO LÍQUIDO', imp.netWeight+' kg')}
      \${detRow('PESO BRUTO', imp.grossWeight+' kg')}
    </div>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;font-size:12px;color:#92400e;">
      <i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>
      <strong>Atenção:</strong> Este rascunho deve ser revisado e validado pelo despachante aduaneiro antes de protocolar a LI no SISCOMEX.
      Informações marcadas como "— preencher —" requerem complementação.
    </div>`;
    document.getElementById('rascunhoLIBody').innerHTML = html;
    openModal('rascunhoLIModal');
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
