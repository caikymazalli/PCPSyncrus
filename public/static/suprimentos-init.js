/**
 * suprimentos-init.js
 * Funções do módulo de suprimentos (Cotações).
 * Deve ser carregado DEPOIS de window.quotationsData ser definido.
 */

if (typeof window.quotationsData === 'undefined') {
  window.quotationsData = []
  console.warn('[INIT] ⚠️ window.quotationsData não estava definido, inicializado como []')
}

console.log('[INIT] suprimentos-init.js carregado')
console.log('[INIT] window.quotationsData:', Array.isArray(window.quotationsData) ? window.quotationsData.length + ' itens' : 'ERRO - não é array')

document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.quotationsData === 'undefined' || !Array.isArray(window.quotationsData)) {
    console.error('[INIT-DOM] ❌ quotationsData ainda inválido após DOMContentLoaded!')
    window.quotationsData = []
  } else {
    console.log('[INIT-DOM] ✅ quotationsData validado:', window.quotationsData.length, 'itens')
  }
})

function escHtml(str) {
  return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function openQuotationDetail(quotId) {
  if (!quotId) {
    showToastSup('Cotação não encontrada', 'error')
    return
  }
  console.log('[COTAÇÃO] Abrindo detalhes:', quotId)
  if (typeof window.quotationsData === 'undefined') {
    console.error('[COTAÇÃO] ERRO: window.quotationsData não definido')
    showToastSup('Erro: Dados de cotações não carregados. Recarregue a página.', 'error')
    return
  }
  if (!Array.isArray(window.quotationsData)) {
    console.error('[COTAÇÃO] ERRO: window.quotationsData não é um array, é:', typeof window.quotationsData)
    console.log('[COTAÇÃO] Conteúdo:', window.quotationsData)
    showToastSup('Erro: Formato de dados inválido. Recarregue a página.', 'error')
    return
  }
  if (window.quotationsData.length === 0) {
    console.warn('[COTAÇÃO] Array de quotations vazio')
    showToastSup('Nenhuma cotação carregada', 'error')
    return
  }
  let q = null
  try {
    q = window.quotationsData.find((qu) => qu && qu.id === quotId)
  } catch (e) {
    console.error('[COTAÇÃO] Erro ao buscar cotação:', e)
    showToastSup('Erro ao buscar cotação', 'error')
    return
  }
  if (!q) {
    const ids = window.quotationsData.map((x) => x && x.id).join(', ')
    console.error('[COTAÇÃO] Cotação não encontrada. Procurando:', quotId, 'IDs disponíveis:', ids)
    showToastSup('Cotação ' + quotId + ' não encontrada', 'error')
    return
  }
  console.log('[COTAÇÃO] Cotação encontrada:', q)
  try {
    let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">'
    html += '<div><label class="form-label">Código</label><input class="form-control" value="' + escHtml(q.code || '—') + '" readonly></div>'
    html += '<div><label class="form-label">Status</label><input class="form-control" value="' + escHtml(q.status || '—') + '" readonly></div>'
    html += '<div><label class="form-label">Data Limite</label><input class="form-control" value="' + escHtml(q.deadline || '—') + '" readonly></div>'
    html += '<div><label class="form-label">Itens</label><input class="form-control" value="' + escHtml(q.items?.length || 0) + '" readonly></div>'
    html += '</div>'
    html += '<div style="margin-top:14px;"><label class="form-label" style="font-weight:700;">Itens Cotados</label>'
    html += '<div class="table-wrapper" style="margin-top:8px;"><table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f8f9fa;"><th style="padding:8px;text-align:left;border-bottom:1px solid #e9ecef;">Produto</th><th style="padding:8px;text-align:left;border-bottom:1px solid #e9ecef;">Qtd</th><th style="padding:8px;text-align:left;border-bottom:1px solid #e9ecef;">Un</th></tr></thead><tbody>'
    if (q.items && q.items.length > 0) {
      for (const item of q.items) {
        html += '<tr style="border-bottom:1px solid #f1f3f5;"><td style="padding:8px;">' + escHtml(item.productName || '—') + '</td><td style="padding:8px;"><strong>' + escHtml(item.quantity || 0) + '</strong></td><td style="padding:8px;">' + escHtml(item.unit || 'un') + '</td></tr>'
      }
    } else {
      html += '<tr><td colspan="3" style="padding:8px;text-align:center;color:#9ca3af;">Nenhum item</td></tr>'
    }
    html += '</tbody></table></div></div>'
    if (q.supplierResponses && q.supplierResponses.length > 0) {
      html += '<div style="margin-top:14px;"><label class="form-label" style="font-weight:700;">Respostas dos Fornecedores</label>'
      html += '<div style="display:flex;flex-direction:column;gap:8px;">'
      for (const resp of q.supplierResponses) {
        html += '<div style="background:#f8f9fa;border-radius:8px;padding:12px;border-left:3px solid #2980B9;">'
        html += '<div style="font-weight:600;color:#1B4F72;margin-bottom:6px;">' + escHtml(resp.supplierName || 'Fornecedor') + '</div>'
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;color:#6c757d;">'
        html += '<div><strong>Valor:</strong> R$ ' + escHtml(Number(resp.totalPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })) + '</div>'
        html += '<div><strong>Prazo:</strong> ' + escHtml(resp.deliveryDays || '—') + ' dias</div>'
        html += '<div><strong>Pgto:</strong> ' + escHtml(resp.paymentTerms || '—') + '</div>'
        html += '<div><strong>Respondido:</strong> ' + escHtml(resp.respondedAt || '—') + '</div>'
        html += '</div>'
        html += '</div>'
      }
      html += '</div></div>'
    }
    html += '<div style="display:flex;gap:8px;margin-top:20px;border-top:1px solid #f1f3f5;padding-top:16px;">'
    html += '<button data-action="quot-aprovar" data-quot-id="' + escHtml(quotId) + '" style="flex:1;background:#28a745;color:white;padding:12px;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;">✅ Aprovar</button>'
    html += '<button data-action="quot-negociar" data-quot-id="' + escHtml(quotId) + '" style="flex:1;background:#2980B9;color:white;padding:12px;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;">🤝 Negociar</button>'
    html += '<button data-action="quot-negar" data-quot-id="' + escHtml(quotId) + '" style="flex:1;background:#dc3545;color:white;padding:12px;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;">❌ Negar</button>'
    html += '</div>'
    html += '<div id="negociacao-' + escHtml(quotId) + '" style="display:none;margin-top:16px;border:1px solid #e9ecef;padding:12px;border-radius:6px;background:#f8f9fa;">'
    html += '<label class="form-label" style="font-weight:600;">Observações para Negociação *</label>'
    html += '<textarea id="obs-' + escHtml(quotId) + '" placeholder="Informe sugestões de preço, prazo, etc... (mínimo 10 caracteres)" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;font-family:inherit;resize:vertical;height:80px;"></textarea>'
    html += '<div style="display:flex;gap:8px;margin-top:8px;">'
    html += '<button data-action="quot-enviar-neg" data-quot-id="' + escHtml(quotId) + '" style="flex:1;background:#2980B9;color:white;padding:10px;border:none;border-radius:6px;cursor:pointer;font-weight:600;">📤 Enviar Negociação</button>'
    html += '<button data-action="quot-cancelar-neg" data-quot-id="' + escHtml(quotId) + '" style="flex:1;background:#6c757d;color:white;padding:10px;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Cancelar</button>'
    html += '</div>'
    html += '</div>'
    const titleEl = document.getElementById('quotDetailTitle')
    if (titleEl) {
      titleEl.innerHTML = '<i class="fas fa-file-invoice-dollar" style="margin-right:8px;"></i>'
      const titleText = document.createTextNode(q.code || 'Cotação')
      titleEl.appendChild(titleText)
    }
    const bodyEl = document.getElementById('quotDetailBody')
    if (bodyEl) bodyEl.innerHTML = html
    openModal('quotationDetailModal')
    console.log('[COTAÇÃO] ✅ Modal aberto com sucesso')
  } catch (e) {
    console.error('[COTAÇÃO] Erro ao renderizar modal:', e)
    showToastSup('Erro ao abrir detalhes da cotação', 'error')
  }
}

async function reenviarCotacao(quotId, quotCode) {
  if (!confirm('Reenviar cotação ' + (quotCode || quotId) + ' para os fornecedores?')) return
  console.log('[COTAÇÃO] Reenviando:', quotId)
  showToastSup('📧 Reenviando cotação...', 'info')
  try {
    const res = await fetch('/suprimentos/api/quotations/' + quotId + '/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    if (data.ok) {
      showToastSup('✅ Cotação ' + (quotCode || quotId) + ' reenviada!', 'success')
      console.log('[COTAÇÃO] Reenviada com sucesso')
      setTimeout(() => location.reload(), 1000)
    } else {
      showToastSup(data.error || 'Erro ao reenviar', 'error')
      console.error('[COTAÇÃO] Erro:', data)
    }
  } catch (e) {
    showToastSup('Erro de conexão', 'error')
    console.error('[COTAÇÃO] Erro de conexão:', e)
  }
}

async function recusarCotacao(quotId, quotCode) {
  if (!confirm('Recusar cotação ' + (quotCode || quotId) + '?')) return
  console.log('[COTAÇÃO] Recusando:', quotId)
  showToastSup('Recusando cotação...', 'info')
  try {
    const res = await fetch('/suprimentos/api/quotations/' + quotId + '/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    if (data.ok) {
      showToastSup('✅ Cotação ' + (quotCode || quotId) + ' recusada!', 'success')
      console.log('[COTAÇÃO] Recusada com sucesso')
      setTimeout(() => location.reload(), 1000)
    } else {
      showToastSup(data.error || 'Erro ao recusar', 'error')
      console.error('[COTAÇÃO] Erro:', data)
    }
  } catch (e) {
    showToastSup('Erro de conexão', 'error')
    console.error('[COTAÇÃO] Erro:', e)
  }
}

async function approveQuotation(quotId, quotCode, supplierName) {
  if (!confirm('Aprovar cotação ' + (quotCode || quotId) + ' de ' + (supplierName || 'fornecedor') + '?')) return
  console.log('[COTAÇÃO] Aprovando:', quotId)
  showToastSup('✅ Aprovando cotação...', 'info')
  try {
    const res = await fetch('/suprimentos/api/quotations/' + quotId + '/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierName: supplierName || '' }),
    })
    const data = await res.json()
    if (data.ok) {
      showToastSup('✅ Cotação ' + (quotCode || quotId) + ' aprovada!', 'success')
      console.log('[COTAÇÃO] Aprovada com sucesso')
      setTimeout(() => location.reload(), 1000)
    } else {
      showToastSup(data.error || 'Erro ao aprovar', 'error')
      console.error('[COTAÇÃO] Erro:', data)
    }
  } catch (e) {
    showToastSup('Erro de conexão', 'error')
    console.error('[COTAÇÃO] Erro:', e)
  }
}

function copySupplierLink(quotId) {
  if (!quotId) {
    showToastSup('Cotação não encontrada', 'error')
    return
  }
  const baseUrl = window.location.origin || ''
  const link = baseUrl + '/suprimentos/quote-response?id=' + encodeURIComponent(quotId)
  console.log('[COTAÇÃO] Copiando link:', link)
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(link).then(() => {
      showToastSup('✅ Link copiado para clipboard!', 'success')
      console.log('[COTAÇÃO] Link copiado com sucesso')
    }).catch((err) => {
      console.error('[COTAÇÃO] Erro ao copiar:', err)
      fallbackCopyToClipboard(link)
    })
  } else {
    fallbackCopyToClipboard(link)
  }
}

function fallbackCopyToClipboard(text) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
    showToastSup('✅ Link copiado para clipboard!', 'success')
    console.log('[COTAÇÃO] Link copiado (fallback)')
  } catch (err) {
    showToastSup('❌ Erro ao copiar link', 'error')
    console.error('[COTAÇÃO] Erro fallback:', err)
  }
  document.body.removeChild(textarea)
}

function showToastSup(message, type) {
  if (typeof window._showToastSupImpl === 'function') {
    window._showToastSupImpl(message, type)
    return
  }
  console.log('[TOAST]', (type || '').toUpperCase(), message)
  const toast = document.createElement('div')
  toast.style.cssText = 'position:fixed;top:20px;right:20px;padding:12px 16px;background:' + (type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6') + ';color:white;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:9999;font-size:13px;max-width:300px;'
  toast.textContent = message
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 3000)
}

function openModal(modalId) {
  if (typeof window._openModalImpl === 'function') {
    window._openModalImpl(modalId)
    return
  }
  const modal = document.getElementById(modalId)
  if (modal) {
    modal.classList.add('open')
    console.log('[MODAL] Aberto:', modalId)
  } else {
    console.warn('[MODAL] Elemento não encontrado:', modalId)
  }
}

function closeModal(modalId) {
  if (typeof window._closeModalImpl === 'function') {
    window._closeModalImpl(modalId)
    return
  }
  const modal = document.getElementById(modalId)
  if (modal) {
    modal.classList.remove('open')
    console.log('[MODAL] Fechado:', modalId)
  } else {
    console.warn('[MODAL] Elemento não encontrado:', modalId)
  }
}

async function salvarNovoPedidoCompra() {
  console.log('[PEDIDO] Salvando novo pedido de compra...')
  const quotationId = document.getElementById('formQuotationRef')?.value
  const pedidoData = document.getElementById('formPedidoData')?.value
  const dataEntrega = document.getElementById('formDataEntrega')?.value
  const observacoes = document.getElementById('formObservacoes')?.value || ''
  if (!quotationId) {
    showToastSup('Selecione uma cotação', 'error')
    return
  }
  if (!pedidoData) {
    showToastSup('Data do pedido obrigatória', 'error')
    return
  }
  if (!dataEntrega) {
    showToastSup('Data de entrega obrigatória', 'error')
    return
  }
  const pedidoDate = new Date(pedidoData)
  const entregaDate = new Date(dataEntrega)
  if (entregaDate < pedidoDate) {
    showToastSup('Data de entrega não pode ser menor que data do pedido', 'error')
    return
  }
  if (!confirm('Criar pedido de compra com base na cotação selecionada?')) return
  console.log('[PEDIDO] Enviando novo pedido:', { quotationId, pedidoData, dataEntrega, observacoes })
  showToastSup('📝 Criando pedido de compra...', 'info')
  try {
    const res = await fetch('/suprimentos/api/purchase-orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quotationId, pedidoData, dataEntrega, observacoes }),
    })
    const data = await res.json()
    if (data.ok) {
      showToastSup('✅ Pedido de compra criado com sucesso!', 'success')
      console.log('[PEDIDO] ✅ Pedido criado:', data.purchaseOrder)
      closeModal('novoPedidoCompraModal')
      document.getElementById('formQuotationRef').value = ''
      document.getElementById('formPedidoData').value = ''
      document.getElementById('formDataEntrega').value = ''
      document.getElementById('formObservacoes').value = ''
      setTimeout(() => location.reload(), 1000)
    } else {
      showToastSup('❌ Erro: ' + (data.error || 'Erro desconhecido'), 'error')
      console.error('[PEDIDO] Erro:', data)
    }
  } catch (e) {
    showToastSup('❌ Erro de conexão', 'error')
    console.error('[PEDIDO] Erro de conexão:', e)
  }
}

/**
 * Abrir e exibir detalhes do pedido de compra
 */
function abrirModalPedidoCompra(pedidoId) {
  if (!pedidoId) {
    showToastSup('⚠️ Pedido não encontrado', 'error')
    return
  }

  console.log('[PEDIDO] Abrindo modal para:', pedidoId)

  const purchaseOrders = window.purchaseOrdersData || []
  const pedido = purchaseOrders.find((p) => p.id === pedidoId)

  if (!pedido) {
    showToastSup('⚠️ Pedido não encontrado', 'error')
    return
  }

  // Escapar HTML para segurança
  function esc(text) {
    if (!text) return ''
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  // Cores de status
  const statusColors = {
    pending_approval: '#fff3cd',
    approved: '#d4edda',
    rejected: '#f8d7da',
    pending: '#fff3cd',
    confirmed: '#d1ecf1',
    in_transit: '#d1ecf1',
    delivered: '#d4edda',
    cancelled: '#e2e3e5',
  }

  // Construir HTML
  let html = ''

  // 1. Dados principais (2 colunas)
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">'
  
  // Código
  html += '<div>'
  html += '<label class="form-label">Código</label>'
  html += '<input class="form-control" value="' + esc(pedido.code || pedido.id) + '" readonly>'
  html += '</div>'

  // Status
  const bgColor = statusColors[pedido.status] || '#fff3cd'
  html += '<div>'
  html += '<label class="form-label">Status</label>'
  html += '<input class="form-control" value="' + esc(pedido.status || 'pending') + '" readonly style="background-color:' + bgColor + ';">'
  html += '</div>'

  // Data Pedido
  const pedidoDataFormatada = pedido.pedidoData 
    ? new Date(pedido.pedidoData).toLocaleDateString('pt-BR')
    : (pedido.createdAt ? new Date(pedido.createdAt).toLocaleDateString('pt-BR') : '—')
  
  html += '<div>'
  html += '<label class="form-label">Data Pedido</label>'
  html += '<input class="form-control" value="' + esc(pedidoDataFormatada) + '" readonly>'
  html += '</div>'

  // Data Entrega
  const entregaDataFormatada = (pedido.dataEntrega || pedido.expectedDelivery)
    ? new Date((pedido.dataEntrega || pedido.expectedDelivery) + 'T12:00:00').toLocaleDateString('pt-BR')
    : '—'
  
  html += '<div>'
  html += '<label class="form-label">Data Entrega</label>'
  html += '<input class="form-control" value="' + esc(entregaDataFormatada) + '" readonly>'
  html += '</div>'

  html += '</div>'

  // 2. Informações de cotação e fornecedor
  html += '<div style="background:#f8f9fa;padding:12px;border-radius:6px;margin-bottom:16px;border-left:3px solid #2980B9;">'
  html += '<div style="margin-bottom:8px;"><strong>Cotação Ref.:</strong> ' + esc(pedido.quotationCode || pedido.quotationId || '—') + '</div>'
  html += '<div style="margin-bottom:8px;"><strong>Fornecedor:</strong> ' + esc(pedido.supplierName || '—') + '</div>'
  html += '<div><strong>Valor Total:</strong> <span style="color:#27AE60;font-weight:700;">R$ ' + (pedido.totalValue || 0).toLocaleString('pt-BR', {minimumFractionDigits:2}) + '</span></div>'
  html += '</div>'

  // 3. Itens do pedido
  if (pedido.items && pedido.items.length > 0) {
    html += '<div style="margin-bottom:16px;">'
    html += '<label class="form-label" style="font-weight:700;">Itens do Pedido</label>'
    html += '<div style="background:#f8f9fa;border-radius:6px;overflow:hidden;">'

    pedido.items.forEach((item, idx) => {
      const itemTotal = (item.quantity || 0) * (item.unitPrice || 0)
      const isLast = idx === pedido.items.length - 1
      
      html += '<div style="padding:10px 12px;' + (isLast ? '' : 'border-bottom:1px solid #e9ecef;') + 'display:grid;grid-template-columns:2fr 80px 80px 1fr;gap:10px;align-items:center;">'
      
      html += '<div>'
      html += '<div style="font-weight:600;color:#374151;font-size:12px;">' + esc(item.productName || item.productCode || '—') + '</div>'
      html += '<div style="font-size:11px;color:#9ca3af;">Cód: ' + esc(item.productCode || '—') + '</div>'
      html += '</div>'
      
      html += '<div style="text-align:center;font-size:12px;">'
      html += '<div style="font-size:10px;color:#9ca3af;">Qtd</div>'
      html += '<div style="font-weight:600;">' + (item.quantity || 0) + '</div>'
      html += '</div>'
      
      html += '<div style="text-align:center;font-size:12px;">'
      html += '<div style="font-size:10px;color:#9ca3af;">Unit.</div>'
      html += '<div style="font-weight:600;color:#27AE60;">R$ ' + (item.unitPrice || 0).toFixed(2) + '</div>'
      html += '</div>'
      
      html += '<div style="text-align:right;font-size:12px;">'
      html += '<div style="font-size:10px;color:#9ca3af;">Total</div>'
      html += '<div style="font-weight:700;color:#1B4F72;">R$ ' + itemTotal.toFixed(2) + '</div>'
      html += '</div>'
      
      html += '</div>'
    })

    html += '</div>'
    html += '</div>'
  }

  // 4. Observações
  if (pedido.observacoes) {
    html += '<div style="background:#fffbeb;border-radius:6px;padding:12px;margin-bottom:16px;border-left:3px solid #f59e0b;">'
    html += '<div style="font-size:11px;color:#9ca3af;font-weight:700;margin-bottom:6px;">OBSERVAÇÕES</div>'
    html += '<div style="font-size:12px;color:#374151;">' + esc(pedido.observacoes) + '</div>'
    html += '</div>'
  }

  // Inserir no modal
  const bodyEl = document.getElementById('pedidoDetailBody')
  if (bodyEl) {
    bodyEl.innerHTML = html
  }

  // Atualizar título
  const titleEl = document.getElementById('pedidoDetailTitle')
  if (titleEl) {
    titleEl.textContent = (pedido.code || 'Pedido') + ' — ' + (pedido.supplierName || 'Fornecedor')
  }

  // Abrir modal
  openModal('pedidoCompraDetailModal')
}

async function aprovarPedidoCompra(pedidoId, pedidoCode) {
  if (!confirm('Aprovar pedido de compra ' + (pedidoCode || pedidoId) + '?')) return
  console.log('[PEDIDO] Aprovando:', pedidoId)
  showToastSup('✅ Aprovando pedido...', 'info')
  try {
    const res = await fetch('/suprimentos/api/purchase-orders/' + pedidoId + '/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    if (data.ok) {
      showToastSup('✅ Pedido ' + (pedidoCode || pedidoId) + ' aprovado!', 'success')
      console.log('[PEDIDO] Aprovado com sucesso')
      setTimeout(() => location.reload(), 1000)
    } else {
      showToastSup(data.error || 'Erro ao aprovar', 'error')
      console.error('[PEDIDO] Erro:', data)
    }
  } catch (e) {
    showToastSup('Erro de conexão', 'error')
    console.error('[PEDIDO] Erro de conexão:', e)
  }
}

async function recusarPedidoCompra(pedidoId, pedidoCode) {
  if (!confirm('Recusar pedido de compra ' + (pedidoCode || pedidoId) + '?')) return
  console.log('[PEDIDO] Recusando:', pedidoId)
  showToastSup('Recusando pedido...', 'info')
  try {
    const res = await fetch('/suprimentos/api/purchase-orders/' + pedidoId + '/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    if (data.ok) {
      showToastSup('✅ Pedido ' + (pedidoCode || pedidoId) + ' recusado!', 'success')
      console.log('[PEDIDO] Recusado com sucesso')
      setTimeout(() => location.reload(), 1000)
    } else {
      showToastSup(data.error || 'Erro ao recusar', 'error')
      console.error('[PEDIDO] Erro:', data)
    }
  } catch (e) {
    showToastSup('Erro de conexão', 'error')
    console.error('[PEDIDO] Erro:', e)
  }
}

function carregarItensQuotacao() {
  const quotId = document.getElementById('formQuotationRef')?.value
  if (!quotId) {
    const container = document.getElementById('quotationItemsContainer')
    if (container) container.style.display = 'none'
    return
  }
  const quotations = window.quotationsData || []
  const quot = quotations.find((q) => q.id === quotId)
  if (!quot || !quot.items || quot.items.length === 0) {
    const container = document.getElementById('quotationItemsContainer')
    if (container) container.style.display = 'none'
    return
  }
  const bestResponse = (quot.supplierResponses || []).reduce((best, r) => (!best || r.totalPrice < best.totalPrice) ? r : best, null)
  const totalValue = bestResponse ? bestResponse.totalPrice : quot.items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0)
  let itemsHTML = ''
  if (bestResponse) {
    itemsHTML += '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:8px;">'
    itemsHTML += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">'
    itemsHTML += '<span style="font-size:13px;font-weight:700;color:#15803d;">Fornecedor: ' + escHtml(bestResponse.supplierName || '—') + '</span>'
    itemsHTML += '<span style="font-size:15px;font-weight:800;color:#1B4F72;">R$ ' + totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</span>'
    itemsHTML += '</div>'
    if (bestResponse.deliveryDays) {
      itemsHTML += '<div style="font-size:12px;color:#6c757d;">Prazo: ' + escHtml(bestResponse.deliveryDays) + ' dias</div>'
    }
    itemsHTML += '</div>'
  }
  for (const item of quot.items) {
    itemsHTML += '<div style="background:#f8f9fa;padding:12px;border-radius:6px;margin-bottom:8px;border-left:3px solid #2980B9;">'
    itemsHTML += '<div style="font-weight:600;color:#1B4F72;margin-bottom:4px;">' + escHtml(item.productName || '—') + '</div>'
    const gridCols = item.unitPrice > 0 ? '1fr 1fr 1fr' : '1fr 1fr'
    itemsHTML += '<div style="display:grid;grid-template-columns:' + gridCols + ';gap:8px;font-size:12px;color:#6c757d;">'
    itemsHTML += '<div><strong>Qtd:</strong> ' + escHtml(item.quantity || 0) + '</div>'
    itemsHTML += '<div><strong>Un.:</strong> ' + escHtml(item.unit || 'un') + '</div>'
    if (item.unitPrice > 0) {
      itemsHTML += '<div><strong>Total:</strong> R$ ' + ((item.quantity || 0) * (item.unitPrice || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</div>'
    }
    itemsHTML += '</div></div>'
  }
  if (!bestResponse) {
    itemsHTML += '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-top:8px;">'
    itemsHTML += '<div style="display:flex;justify-content:space-between;align-items:center;">'
    itemsHTML += '<span style="font-size:13px;font-weight:700;color:#15803d;">Valor Total</span>'
    itemsHTML += '<span style="font-size:15px;font-weight:800;color:#1B4F72;">R$ ' + totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</span>'
    itemsHTML += '</div></div>'
  }
  const itemsEl = document.getElementById('quotationItems')
  if (itemsEl) itemsEl.innerHTML = itemsHTML
  const container = document.getElementById('quotationItemsContainer')
  if (container) container.style.display = 'block'
  console.log('[PEDIDO] Itens carregados:', quot.items.length, 'Valor total:', totalValue)
}

function aprovarCotacao(quotId) {
  if (!confirm('Aprovar cotação?')) return
  console.log('[COTAÇÃO] Aprovando:', quotId)
  showToastSup('✅ Aprovando cotação...', 'info')
  fetch('/suprimentos/api/quotations/' + quotId + '/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.ok) {
        showToastSup('✅ Cotação aprovada!', 'success')
        setTimeout(() => location.reload(), 1000)
      } else {
        showToastSup('❌ ' + (data.error || 'Erro'), 'error')
      }
    })
    .catch((e) => {
      console.error('[COTAÇÃO] Erro:', e)
      showToastSup('❌ Erro ao aprovar', 'error')
    })
}

function negarCotacao(quotId) {
  if (!confirm('Negar cotação?')) return
  console.log('[COTAÇÃO] Negando:', quotId)
  showToastSup('❌ Negando cotação...', 'info')
  fetch('/suprimentos/api/quotations/' + quotId + '/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.ok) {
        showToastSup('✅ Cotação negada!', 'success')
        setTimeout(() => location.reload(), 1000)
      } else {
        showToastSup('❌ ' + (data.error || 'Erro'), 'error')
      }
    })
    .catch((e) => {
      console.error('[COTAÇÃO] Erro:', e)
      showToastSup('❌ Erro ao negar', 'error')
    })
}

function toggleNegociacao(quotId) {
  const negDiv = document.getElementById('negociacao-' + quotId)
  if (negDiv) {
    negDiv.style.display = negDiv.style.display === 'none' ? 'block' : 'none'
  }
}

function cancelarNegociacao(quotId) {
  const negDiv = document.getElementById('negociacao-' + quotId)
  if (negDiv) negDiv.style.display = 'none'
  const obsField = document.getElementById('obs-' + quotId)
  if (obsField) obsField.value = ''
}

function enviarNegociacao(quotId) {
  const obs = document.getElementById('obs-' + quotId)?.value || ''
  if (obs.length < 10) {
    showToastSup('Observações devem ter no mínimo 10 caracteres', 'error')
    return
  }
  if (obs.length > 500) {
    showToastSup('Observações não podem exceder 500 caracteres', 'error')
    return
  }
  if (!confirm('Enviar negociação?')) return
  console.log('[COTAÇÃO] Negociando:', quotId)
  showToastSup('🤝 Enviando negociação...', 'info')
  fetch('/suprimentos/api/quotations/' + quotId + '/negotiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ observations: obs }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.ok) {
        showToastSup('✅ Negociação enviada!', 'success')
        setTimeout(() => location.reload(), 1000)
      } else {
        showToastSup('❌ ' + (data.error || 'Erro'), 'error')
      }
    })
    .catch((e) => {
      console.error('[COTAÇÃO] Erro:', e)
      showToastSup('❌ Erro ao enviar', 'error')
    })
}

console.log('[SUPRIMENTOS-INIT] ✅ Todas as funções de cotação carregadas')

// ── Event delegation for data-action quotation buttons ──────────────────────
document.addEventListener('click', function (e) {
  const btn = e.target.closest('[data-action^="quot-"]')
  if (!btn) return
  const quotId = btn.dataset.quotId || ''
  const action = btn.dataset.action
  if (action === 'quot-aprovar') aprovarCotacao(quotId)
  else if (action === 'quot-negociar') toggleNegociacao(quotId)
  else if (action === 'quot-negar') negarCotacao(quotId)
  else if (action === 'quot-enviar-neg') enviarNegociacao(quotId)
  else if (action === 'quot-cancelar-neg') cancelarNegociacao(quotId)
})
