/**
 * Modal de Detalhes do Pedido de Compra
 * Sem onclick inline - usa event listeners puros
 */

function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function abrirModalPedidoCompra(pedidoId) {
  if (!pedidoId) {
    showToastSup('❌ Pedido não encontrado', 'error')
    return
  }

  console.log('[PEDIDO] Abrindo modal para:', pedidoId)

  const purchaseOrders = window.purchaseOrdersData || []
  const pedido = purchaseOrders.find(p => p.id === pedidoId)

  if (!pedido) {
    showToastSup('❌ Pedido não encontrado', 'error')
    return
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

  // Construir HTML usando DOM APIs (seguro)
  const modal = document.getElementById('pedidoCompraDetailModal')
  if (!modal) return

  // Criar container
  const bodyEl = document.getElementById('pedidoDetailBody')
  if (!bodyEl) return

  // Limpar
  bodyEl.innerHTML = ''

  // 1. Grid de informações principais
  const gridDiv = document.createElement('div')
  gridDiv.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;'

  // Código
  const codeDiv = document.createElement('div')
  codeDiv.innerHTML = '<label class="form-label">Código</label><input class="form-control" readonly>'
  codeDiv.querySelector('input').value = pedido.code || pedido.id
  gridDiv.appendChild(codeDiv)

  // Status
  const statusDiv = document.createElement('div')
  const statusInput = document.createElement('input')
  statusInput.className = 'form-control'
  statusInput.readOnly = true
  statusInput.value = pedido.status || 'pending'
  statusInput.style.backgroundColor = statusColors[pedido.status] || '#fff3cd'
  const statusLabel = document.createElement('label')
  statusLabel.className = 'form-label'
  statusLabel.textContent = 'Status'
  statusDiv.appendChild(statusLabel)
  statusDiv.appendChild(statusInput)
  gridDiv.appendChild(statusDiv)

  // Data Pedido
  const pedidoDataDiv = document.createElement('div')
  const pedidoDataFormatada = pedido.pedidoData
    ? new Date(pedido.pedidoData).toLocaleDateString('pt-BR')
    : pedido.createdAt
    ? new Date(pedido.createdAt).toLocaleDateString('pt-BR')
    : '—'
  const pedidoDataInput = document.createElement('input')
  pedidoDataInput.className = 'form-control'
  pedidoDataInput.readOnly = true
  pedidoDataInput.value = pedidoDataFormatada
  const pedidoDataLabel = document.createElement('label')
  pedidoDataLabel.className = 'form-label'
  pedidoDataLabel.textContent = 'Data Pedido'
  pedidoDataDiv.appendChild(pedidoDataLabel)
  pedidoDataDiv.appendChild(pedidoDataInput)
  gridDiv.appendChild(pedidoDataDiv)

  // Data Entrega
  const entregaDiv = document.createElement('div')
  const entregaData = pedido.dataEntrega || pedido.expectedDelivery
    ? new Date((pedido.dataEntrega || pedido.expectedDelivery) + 'T12:00:00').toLocaleDateString('pt-BR')
    : '—'
  const entregaInput = document.createElement('input')
  entregaInput.className = 'form-control'
  entregaInput.readOnly = true
  entregaInput.value = entregaData
  const entregaLabel = document.createElement('label')
  entregaLabel.className = 'form-label'
  entregaLabel.textContent = 'Data Entrega'
  entregaDiv.appendChild(entregaLabel)
  entregaDiv.appendChild(entregaInput)
  gridDiv.appendChild(entregaDiv)

  bodyEl.appendChild(gridDiv)

  // 2. Info box fornecedor
  const infoBox = document.createElement('div')
  infoBox.style.cssText = 'background:#f8f9fa;padding:12px;border-radius:6px;margin-bottom:16px;border-left:3px solid #2980B9;'
  infoBox.innerHTML = `
    <div style="margin-bottom:8px;"><strong>Cotação Ref.:</strong> ${escapeHtml(pedido.quotationCode || pedido.quotationId || '—')}</div>
    <div style="margin-bottom:8px;"><strong>Fornecedor:</strong> ${escapeHtml(pedido.supplierName || '—')}</div>
    <div><strong>Valor Total:</strong> <span style="color:#27AE60;font-weight:700;">R$ ${(pedido.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
  `
  bodyEl.appendChild(infoBox)

  // 3. Itens
  if (pedido.items && pedido.items.length > 0) {
    const itemsLabel = document.createElement('div')
    itemsLabel.style.cssText = 'font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:8px;'
    itemsLabel.innerHTML = '<i class="fas fa-boxes" style="margin-right:6px;"></i>Itens do Pedido'
    bodyEl.appendChild(itemsLabel)

    const itemsContainer = document.createElement('div')
    itemsContainer.style.cssText = 'background:#f8f9fa;border-radius:6px;overflow:hidden;'

    pedido.items.forEach((item, idx) => {
      const itemTotal = (item.quantity || 0) * (item.unitPrice || 0)
      const isLast = idx === pedido.items.length - 1

      const itemRow = document.createElement('div')
      itemRow.style.cssText = `padding:10px 12px;${isLast ? '' : 'border-bottom:1px solid #e9ecef;'}display:grid;grid-template-columns:2fr 80px 80px 1fr;gap:10px;align-items:center;`
      itemRow.innerHTML = `
        <div>
          <div style="font-weight:600;color:#374151;font-size:12px;">${escapeHtml(item.productName || item.productCode || '—')}</div>
          <div style="font-size:11px;color:#9ca3af;">Cód: ${escapeHtml(item.productCode || '—')}</div>
        </div>
        <div style="text-align:center;font-size:12px;">
          <div style="font-size:10px;color:#9ca3af;">Qtd</div>
          <div style="font-weight:600;">${item.quantity || 0}</div>
        </div>
        <div style="text-align:center;font-size:12px;">
          <div style="font-size:10px;color:#9ca3af;">Unit.</div>
          <div style="font-weight:600;color:#27AE60;">R$ ${(item.unitPrice || 0).toFixed(2)}</div>
        </div>
        <div style="text-align:right;font-size:12px;">
          <div style="font-size:10px;color:#9ca3af;">Total</div>
          <div style="font-weight:700;color:#1B4F72;">R$ ${itemTotal.toFixed(2)}</div>
        </div>
      `
      itemsContainer.appendChild(itemRow)
    })

    bodyEl.appendChild(itemsContainer)
  }

  // 4. Observações
  if (pedido.observacoes) {
    const obsBox = document.createElement('div')
    obsBox.style.cssText = 'background:#fffbeb;border-radius:6px;padding:12px;margin-top:16px;border-left:3px solid #f59e0b;'
    obsBox.innerHTML = `
      <div style="font-size:11px;color:#9ca3af;font-weight:700;margin-bottom:6px;">OBSERVAÇÕES</div>
      <div style="font-size:12px;color:#374151;">${escapeHtml(pedido.observacoes)}</div>
    `
    bodyEl.appendChild(obsBox)
  }

  // 5. Botões de ação (SEM onclick inline)
  const buttonsDiv = document.createElement('div')
  buttonsDiv.style.cssText = 'display:flex;gap:8px;margin-top:16px;'

  if (pedido.status === 'pending_approval') {
    const approveBtn = document.createElement('button')
    approveBtn.className = 'btn btn-success btn-sm'
    approveBtn.style.flex = '1'
    approveBtn.innerHTML = '<i class="fas fa-check"></i> Aprovar'
    approveBtn.addEventListener('click', () => {
      closeModal('pedidoCompraDetailModal')
      approvePurchaseOrder(pedidoId)
    })
    buttonsDiv.appendChild(approveBtn)

    const rejectBtn = document.createElement('button')
    rejectBtn.className = 'btn btn-danger btn-sm'
    rejectBtn.style.flex = '1'
    rejectBtn.innerHTML = '<i class="fas fa-times"></i> Rejeitar'
    rejectBtn.addEventListener('click', () => {
      closeModal('pedidoCompraDetailModal')
      rejectPurchaseOrder(pedidoId)
    })
    buttonsDiv.appendChild(rejectBtn)
  } else if (pedido.status === 'approved' && !pedido.isImport) {
    const printBtn = document.createElement('button')
    printBtn.className = 'btn btn-primary btn-sm'
    printBtn.style.flex = '1'
    printBtn.innerHTML = '<i class="fas fa-print"></i> Imprimir'
    printBtn.addEventListener('click', () => printPurchaseOrder(pedidoId))
    buttonsDiv.appendChild(printBtn)

    const pdfBtn = document.createElement('button')
    pdfBtn.className = 'btn btn-secondary btn-sm'
    pdfBtn.style.flex = '1'
    pdfBtn.innerHTML = '<i class="fas fa-download"></i> PDF'
    pdfBtn.addEventListener('click', () => downloadPDFPurchaseOrder(pedidoId))
    buttonsDiv.appendChild(pdfBtn)
  }

  const editBtn = document.createElement('button')
  editBtn.className = 'btn btn-secondary btn-sm'
  editBtn.style.flex = '1'
  editBtn.innerHTML = '<i class="fas fa-edit"></i> Editar'
  editBtn.onclick = () => {
    console.log('[PEDIDO] Editando:', pedidoId)
    showToastSup('✏️ Editar pedido', 'info')
  }
  buttonsDiv.appendChild(editBtn)

  bodyEl.appendChild(buttonsDiv)

  // Atualizar título
  const titleEl = document.getElementById('pedidoDetailTitle')
  if (titleEl) {
    titleEl.textContent = (pedido.code || 'Pedido') + ' — ' + (pedido.supplierName || 'Fornecedor')
  }

  // Abrir modal
  openModal('pedidoCompraDetailModal')
  console.log('[PEDIDO] ✅ Modal aberto com sucesso')
}
