/**
 * suprimentos-init.js
 * Funções do módulo de suprimentos (Cotações).
 * Deve ser carregado DEPOIS de window.quotationsData ser definido.
 */

/**
 * ===================================================================
 * INICIALIZAÇÃO SEGURA - Garantir que quotationsData existe
 * ===================================================================
 */

// Se quotationsData não foi definido ainda, inicializar como array vazio
if (typeof window.quotationsData === 'undefined') {
  window.quotationsData = []
  console.warn('[INIT] ⚠️ window.quotationsData não estava definido, inicializado como []')
}

console.log('[INIT] suprimentos-init.js carregado')
console.log('[INIT] window.quotationsData:', Array.isArray(window.quotationsData) ? window.quotationsData.length + ' itens' : 'ERRO - não é array')

// Fallback: verificar após DOM estar pronto
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.quotationsData === 'undefined' || !Array.isArray(window.quotationsData)) {
    console.error('[INIT-DOM] ❌ quotationsData ainda inválido após DOMContentLoaded!')
    window.quotationsData = []
  } else {
    console.log('[INIT-DOM] ✅ quotationsData validado:', window.quotationsData.length, 'itens')
  }
})

/**
 * Escapa caracteres HTML para evitar XSS
 */
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Abre modal com detalhes completos da cotação - COM VALIDAÇÃO ROBUSTA
 */
function openQuotationDetail(quotId) {
  if (!quotId) {
    showToastSup('Cotação não encontrada', 'error')
    return
  }

  console.log('[COTAÇÃO] Abrindo detalhes:', quotId)

  // VALIDAÇÃO 1: Verificar se window.quotationsData existe
  if (typeof window.quotationsData === 'undefined') {
    console.error('[COTAÇÃO] ERRO: window.quotationsData não definido')
    showToastSup('Erro: Dados de cotações não carregados. Recarregue a página.', 'error')
    return
  }

  // VALIDAÇÃO 2: Verificar tipo
  if (!Array.isArray(window.quotationsData)) {
    console.error('[COTAÇÃO] ERRO: window.quotationsData não é um array, é:', typeof window.quotationsData)
    console.log('[COTAÇÃO] Conteúdo:', window.quotationsData)
    showToastSup('Erro: Formato de dados inválido. Recarregue a página.', 'error')
    return
  }

  // VALIDAÇÃO 3: Verificar se array não está vazio
  if (window.quotationsData.length === 0) {
    console.warn('[COTAÇÃO] Array de quotations vazio')
    showToastSup('Nenhuma cotação carregada', 'error')
    return
  }

  // VALIDAÇÃO 4: Buscar cotação com try/catch
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

  // VALIDAÇÃO 5: Renderizar modal com try/catch
  try {
    // Montar HTML detalhado
    let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">'
    html += '<div><label class="form-label">Código</label><input class="form-control" value="' + escHtml(q.code || '—') + '" readonly></div>'
    html += '<div><label class="form-label">Status</label><input class="form-control" value="' + escHtml(q.status || '—') + '" readonly></div>'
    html += '<div><label class="form-label">Data Limite</label><input class="form-control" value="' + escHtml(q.deadline || '—') + '" readonly></div>'
    html += '<div><label class="form-label">Itens</label><input class="form-control" value="' + escHtml(q.items?.length || 0) + '" readonly></div>'
    html += '</div>'

    // Itens cotados
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

    // Respostas dos fornecedores
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

    // Preencher modal
    // ✅ BOTÕES DE AÇÃO
    html += '<div style="display:flex;gap:8px;margin-top:20px;border-top:1px solid #f1f3f5;padding-top:16px;">'
    html += '<button onclick="aprovarCotacao(\'' + quotId + '\')" style="flex:1;background:#28a745;color:white;padding:12px;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;">✅ Aprovar</button>'
    html += '<button onclick="toggleNegociacao(\'' + quotId + '\')" style="flex:1;background:#2980B9;color:white;padding:12px;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;">🤝 Negociar</button>'
    html += '<button onclick="negarCotacao(\'' + quotId + '\')" style="flex:1;background:#dc3545;color:white;padding:12px;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;">❌ Negar</button>'
    html += '</div>'

    // ✅ CAMPO NEGOCIAÇÃO (OCULTO)
    html += '<div id="negociacao-' + quotId + '" style="display:none;margin-top:16px;border:1px solid #e9ecef;padding:12px;border-radius:6px;background:#f8f9fa;">'
    html += '<label class="form-label" style="font-weight:600;">Observações para Negociação *</label>'
    html += '<textarea id="obs-' + quotId + '" placeholder="Informe sugestões de preço, prazo, etc... (mínimo 10 caracteres)" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;font-family:inherit;resize:vertical;height:80px;"></textarea>'
    html += '<div style="display:flex;gap:8px;margin-top:8px;">'
    html += '<button onclick="enviarNegociacao(\'' + quotId + '\')" style="flex:1;background:#2980B9;color:white;padding:10px;border:none;border-radius:6px;cursor:pointer;font-weight:600;">📤 Enviar Negociação</button>'
    html += '<button onclick="cancelarNegociacao(\'' + quotId + '\')" style="flex:1;background:#6c757d;color:white;padding:10px;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Cancelar</button>'
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

    // Abrir modal
    openModal('quotationDetailModal')
    console.log('[COTAÇÃO] ✅ Modal aberto com sucesso')
  } catch (e) {
    console.error('[COTAÇÃO] Erro ao renderizar modal:', e)
    showToastSup('Erro ao abrir detalhes da cotação', 'error')
  }
}

/**
 * Reenviar cotação para fornecedores
 */
async function reenviarCotacao(quotId, quotCode) {
  if (!confirm('Reenviar cotação ' + (quotCode || quotId) + ' para os fornecedores?')) {
    return
  }

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

/**
 * Recusar cotação
 */
async function recusarCotacao(quotId, quotCode) {
  if (!confirm('Recusar cotação ' + (quotCode || quotId) + '?')) {
    return
  }

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

/**
 * Aprovar cotação
 */
async function approveQuotation(quotId, quotCode, supplierName) {
  if (!confirm('Aprovar cotação ' + (quotCode || quotId) + ' de ' + (supplierName || 'fornecedor') + '?')) {
    return
  }

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

/**
 * Copiar link de cotação para clipboard
 */
function copySupplierLink(quotId) {
  if (!quotId) {
    showToastSup('Cotação não encontrada', 'error')
    return
  }

  const baseUrl = window.location.origin || ''
  const link = baseUrl + '/suprimentos/quote-response?id=' + encodeURIComponent(quotId)

  console.log('[COTAÇÃO] Copiando link:', link)

  // Tentar usar Clipboard API (moderna)
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(link).then(() => {
      showToastSup('✅ Link copiado para clipboard!', 'success')
      console.log('[COTAÇÃO] Link copiado com sucesso')
    }).catch((err) => {
      console.error('[COTAÇÃO] Erro ao copiar:', err)
      fallbackCopyToClipboard(link)
    })
  } else {
    // Fallback para navegadores antigos
    fallbackCopyToClipboard(link)
  }
}

/**
 * Fallback para copiar para clipboard em navegadores antigos
 */
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

/**
 * Helper: Mostrar toast
 */
function showToastSup(message, type) {
  // Tentar usar função existente no escopo global (definida na página)
  if (typeof window._showToastSupImpl === 'function') {
    window._showToastSupImpl(message, type)
    return
  }

  // Fallback: criar toast básico
  console.log('[TOAST]', (type || '').toUpperCase(), message)

  const toast = document.createElement('div')
  toast.style.cssText = 'position:fixed;top:20px;right:20px;padding:12px 16px;background:' +
    (type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6') +
    ';color:white;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:9999;font-size:13px;max-width:300px;'
  toast.textContent = message
  document.body.appendChild(toast)

  setTimeout(() => toast.remove(), 3000)
}

/**
 * Helper: Abrir modal
 */
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

/**
 * Helper: Fechar modal
 */
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

/**
 * Salvar novo pedido de compra
 */
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

  if (!confirm('Criar pedido de compra com base na cotação selecionada?')) {
    return
  }

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
 * Abrir modal de visualização de pedido de compra
 */
function abrirModalPedidoCompra(pedidoId) {
  if (!pedidoId) {
    showToastSup('Pedido não encontrado', 'error')
    return
  }

  console.log('[PEDIDO] Abrindo modal para:', pedidoId)

  const purchaseOrders = window.purchaseOrdersData || []
  const pedido = purchaseOrders.find((p) => p.id === pedidoId)

  if (!pedido) {
    showToastSup('Pedido não encontrado', 'error')
    return
  }

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

  let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">'
  html += '<div><label class="form-label">Código</label><input class="form-control" value="' + escHtml(pedido.code || pedido.id) + '" readonly></div>'
  html += '<div><label class="form-label">Status</label><input class="form-control" value="' + escHtml(pedido.status || 'pending') + '" readonly style="background:' + (statusColors[pedido.status] || '#fff3cd') + ';"></div>'
  html += '<div><label class="form-label">Data Pedido</label><input class="form-control" value="' + escHtml(pedido.pedidoData ? new Date(pedido.pedidoData).toLocaleDateString('pt-BR') : (pedido.createdAt ? new Date(pedido.createdAt).toLocaleDateString('pt-BR') : '—')) + '" readonly></div>'
  html += '<div><label class="form-label">Data Entrega</label><input class="form-control" value="' + escHtml((pedido.dataEntrega || pedido.expectedDelivery) ? new Date((pedido.dataEntrega || pedido.expectedDelivery) + 'T12:00:00').toLocaleDateString('pt-BR') : '—') + '" readonly></div>'
  html += '</div>'

  html += '<div style="background:#f8f9fa;padding:12px;border-radius:6px;margin-bottom:16px;border-left:3px solid #2980B9;">'
  html += '<div><strong>Cotação Ref:</strong> ' + escHtml(pedido.quotationCode || (pedido.quotationId ? pedido.quotationId : '—')) + '</div>'
  html += '<div><strong>Fornecedor:</strong> ' + escHtml(pedido.supplierName || '—') + '</div>'
  html += '<div><strong>Valor Total:</strong> R$ ' + ((pedido.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })) + '</div>'
  html += '</div>'

  if (pedido.items && pedido.items.length > 0) {
    html += '<div style="margin-bottom:16px;"><label class="form-label" style="font-weight:700;">Itens do Pedido</label>'
    html += '<div class="table-wrapper" style="margin-top:8px;"><table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f8f9fa;"><th style="padding:8px;text-align:left;border-bottom:1px solid #e9ecef;">Produto</th><th style="padding:8px;text-align:right;border-bottom:1px solid #e9ecef;">Qtd</th><th style="padding:8px;text-align:right;border-bottom:1px solid #e9ecef;">Un.Valor</th><th style="padding:8px;text-align:right;border-bottom:1px solid #e9ecef;">Total</th></tr></thead><tbody>'

    for (const item of pedido.items) {
      const itemTotal = (item.quantity || 0) * (item.unitPrice || 0)
      html += '<tr style="border-bottom:1px solid #f1f3f5;"><td style="padding:8px;">' + escHtml(item.productName || '—') + '</td><td style="padding:8px;text-align:right;"><strong>' + escHtml(item.quantity || 0) + '</strong></td><td style="padding:8px;text-align:right;">R$ ' + ((item.unitPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })) + '</td><td style="padding:8px;text-align:right;"><strong>R$ ' + (itemTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })) + '</strong></td></tr>'
    }

    html += '</tbody></table></div></div>'
  }

  if (pedido.observacoes || pedido.notes) {
    html += '<div style="background:#f0f4f8;padding:12px;border-radius:6px;margin-bottom:16px;">'
    html += '<strong>Observações:</strong><br>'
    html += '<span style="white-space:pre-wrap;color:#555;">' + escHtml(pedido.observacoes || pedido.notes) + '</span>'
    html += '</div>'
  }

  if (pedido.status === 'pending_approval') {
    html += '<div style="display:flex;gap:8px;margin-top:16px;">'
    html += '<button onclick="aprovarPedidoCompra(' + JSON.stringify(pedidoId) + ', ' + JSON.stringify(pedido.code || pedidoId) + ')" style="flex:1;background:#28a745;color:white;padding:10px;border:none;border-radius:6px;cursor:pointer;font-weight:600;">✅ Aprovar</button>'
    html += '<button onclick="recusarPedidoCompra(' + JSON.stringify(pedidoId) + ', ' + JSON.stringify(pedido.code || pedidoId) + ')" style="flex:1;background:#dc3545;color:white;padding:10px;border:none;border-radius:6px;cursor:pointer;font-weight:600;">❌ Recusar</button>'
    html += '</div>'
  }

  const titleEl = document.getElementById('pedidoDetailTitle')
  if (titleEl) {
    titleEl.innerHTML = '<i class="fas fa-shopping-cart" style="margin-right:8px;"></i>' + escHtml(pedido.code || 'Pedido de Compra')
  }

  const bodyEl = document.getElementById('pedidoDetailBody')
  if (bodyEl) bodyEl.innerHTML = html

  openModal('pedidoCompraDetailModal')
  console.log('[PEDIDO] Modal aberto com sucesso')
}

/**
 * Aprovar pedido de compra
 */
async function aprovarPedidoCompra(pedidoId, pedidoCode) {
  if (!confirm('Aprovar pedido de compra ' + (pedidoCode || pedidoId) + '?')) {
    return
  }

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

/**
 * Recusar pedido de compra
 */
async function recusarPedidoCompra(pedidoId, pedidoCode) {
  if (!confirm('Recusar pedido de compra ' + (pedidoCode || pedidoId) + '?')) {
    return
  }

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

/**
 * Carregar itens da cotação selecionada no formulário de novo pedido
 */
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

  let itemsHTML = ''
  for (const item of quot.items) {
    itemsHTML += '<div style="background:#f8f9fa;padding:12px;border-radius:6px;margin-bottom:8px;border-left:3px solid #2980B9;">'
    itemsHTML += '<div style="font-weight:600;color:#1B4F72;margin-bottom:4px;">' + escHtml(item.productName || '—') + '</div>'
    itemsHTML += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:12px;color:#6c757d;">'
    itemsHTML += '<div><strong>Qtd:</strong> ' + escHtml(item.quantity || 0) + '</div>'
    itemsHTML += '<div><strong>Un.:</strong> ' + escHtml(item.unit || 'un') + '</div>'
    itemsHTML += '<div><strong>Total:</strong> R$ ' + ((item.quantity || 0) * (item.unitPrice || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</div>'
    itemsHTML += '</div></div>'
  }

  const itemsEl = document.getElementById('quotationItems')
  if (itemsEl) itemsEl.innerHTML = itemsHTML
  const container = document.getElementById('quotationItemsContainer')
  if (container) container.style.display = 'block'

  console.log('[PEDIDO] Itens carregados:', quot.items.length)
}

/**
 * Aprovar cotação
 */
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

/**
 * Negar cotação
 */
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

/**
 * Mostrar/ocultar campo negociação
 */
function toggleNegociacao(quotId) {
  const negDiv = document.getElementById('negociacao-' + quotId)
  if (negDiv) {
    negDiv.style.display = negDiv.style.display === 'none' ? 'block' : 'none'
  }
}

/**
 * Cancelar negociação
 */
function cancelarNegociacao(quotId) {
  const negDiv = document.getElementById('negociacao-' + quotId)
  if (negDiv) negDiv.style.display = 'none'
  const obsField = document.getElementById('obs-' + quotId)
  if (obsField) obsField.value = ''
}

/**
 * Enviar negociação
 */
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
