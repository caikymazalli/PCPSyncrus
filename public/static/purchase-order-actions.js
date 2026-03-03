/**
 * purchase-order-actions.js
 * Actions for purchase orders: approve, reject, print, download PDF
 */

async function approvePurchaseOrder(pedidoId) {
  if (!pedidoId) {
    showToastSup('❌ Pedido não identificado', 'error')
    return
  }

  if (!confirm('Aprovar este pedido de compra?')) return

  try {
    const res = await fetch('/suprimentos/api/purchase-orders/' + pedidoId + '/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    const data = await res.json()

    if (data.ok) {
      showToastSup('✅ ' + (data.message || 'Pedido aprovado!'), 'success')

      if (data.action === 'create_import_draft') {
        // 🌍 INTERNACIONAL: Criar rascunho de importação
        await createImportFromPurchaseOrder(pedidoId)
      } else {
        // 🇧🇷 NACIONAL: Mostrar opções de impressão
        showPrintOptions(pedidoId, data.purchaseOrder)
        setTimeout(() => location.reload(), 2000)
      }
    } else {
      showToastSup('❌ ' + (data.error || 'Erro ao aprovar'), 'error')
    }
  } catch (e) {
    console.error('[PEDIDO] Erro ao aprovar:', e)
    showToastSup('❌ Erro de conexão', 'error')
  }
}

async function rejectPurchaseOrder(pedidoId) {
  if (!pedidoId) {
    showToastSup('❌ Pedido não identificado', 'error')
    return
  }

  const reason = prompt('Motivo da rejeição (opcional):')
  if (reason === null) return // Cancelado

  try {
    const res = await fetch('/suprimentos/api/purchase-orders/' + pedidoId + '/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || '' }),
    })

    const data = await res.json()

    if (data.ok) {
      showToastSup('❌ Pedido rejeitado', 'success')
      setTimeout(() => location.reload(), 1000)
    } else {
      showToastSup('❌ ' + (data.error || 'Erro ao rejeitar'), 'error')
    }
  } catch (e) {
    console.error('[PEDIDO] Erro ao rejeitar:', e)
    showToastSup('❌ Erro de conexão', 'error')
  }
}

async function createImportFromPurchaseOrder(pedidoId) {
  try {
    const res = await fetch('/suprimentos/api/imports/from-purchase-order/' + pedidoId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    const data = await res.json()

    if (data.ok) {
      showToastSup('📦 Rascunho de importação criado!', 'success')
      setTimeout(() => {
        window.location.href = data.redirectTo || '/suprimentos?tab=importacao'
      }, 1500)
    } else {
      showToastSup('❌ ' + (data.error || 'Erro ao criar importação'), 'error')
      setTimeout(() => location.reload(), 1500)
    }
  } catch (e) {
    console.error('[PEDIDO] Erro ao criar importação:', e)
    showToastSup('❌ Erro ao criar importação', 'error')
    setTimeout(() => location.reload(), 1500)
  }
}

function showPrintOptions(pedidoId, pedido) {
  const existing = document.getElementById('printOptionsModal')
  if (existing) existing.remove()

  const code = (pedido && pedido.code) ? pedido.code : pedidoId

  const overlay = document.createElement('div')
  overlay.id = 'printOptionsModal'
  overlay.className = 'modal-overlay open'
  overlay.innerHTML = '<div class="modal" style="max-width:420px;">' +
    '<div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">' +
      '<h3 style="margin:0;font-size:16px;font-weight:700;color:#1B4F72;"><i class="fas fa-check-circle" style="color:#27AE60;margin-right:8px;"></i>Pedido Aprovado</h3>' +
      '<button onclick="document.getElementById(\'printOptionsModal\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>' +
    '</div>' +
    '<div style="padding:24px;">' +
      '<p style="margin-bottom:16px;color:#374151;">Pedido <strong>' + code + '</strong> aprovado com sucesso.</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<button class="btn btn-primary" onclick="printPurchaseOrder(\'' + pedidoId + '\')">' +
          '<i class="fas fa-print" style="margin-right:6px;"></i> Imprimir' +
        '</button>' +
        '<button class="btn btn-secondary" onclick="downloadPDFPurchaseOrder(\'' + pedidoId + '\')">' +
          '<i class="fas fa-download" style="margin-right:6px;"></i> Baixar PDF' +
        '</button>' +
        '<button class="btn btn-secondary" onclick="document.getElementById(\'printOptionsModal\').remove()">' +
          'Fechar' +
        '</button>' +
      '</div>' +
    '</div>' +
  '</div>'

  document.body.appendChild(overlay)
}

function printPurchaseOrder(pedidoId) {
  window.open('/suprimentos/api/purchase-orders/' + pedidoId + '/pdf', '_blank')
}

function downloadPDFPurchaseOrder(pedidoId) {
  const link = document.createElement('a')
  link.href = '/suprimentos/api/purchase-orders/' + pedidoId + '/pdf'
  link.download = 'pedido-' + pedidoId + '.pdf'
  link.target = '_blank'
  link.click()
}
