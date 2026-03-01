/**
 * suprimentos-init.js
 * Funções do módulo de suprimentos (Cotações).
 * Deve ser carregado ANTES de qualquer HTML que referencie estas funções.
 */

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
 * Abre modal com detalhes completos da cotação
 */
function openQuotationDetail(quotId) {
  if (!quotId) {
    showToastSup('Cotação não encontrada', 'error')
    return
  }

  console.log('[COTAÇÃO] Abrindo detalhes:', quotId)

  // Buscar cotação nos dados (assumindo que quotations está disponível)
  const quotations = window.quotationsData || []
  const q = quotations.find((qu) => qu.id === quotId)

  if (!q) {
    showToastSup('Cotação não encontrada', 'error')
    return
  }

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
  console.log('[COTAÇÃO] Modal aberto com sucesso')
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

  // Fallback: mostrar elemento por ID
  const modal = document.getElementById(modalId)
  if (modal) {
    modal.style.display = 'flex'
    console.log('[MODAL] Aberto:', modalId)
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

  // Fallback: esconder elemento por ID
  const modal = document.getElementById(modalId)
  if (modal) {
    modal.style.display = 'none'
    console.log('[MODAL] Fechado:', modalId)
  }
}

console.log('[SUPRIMENTOS-INIT] ✅ Todas as funções de cotação carregadas')
