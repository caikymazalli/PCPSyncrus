// Mock data for PCP SaaS Platform
export const mockData = {
  kpis: {
    totalOrders: 47,
    activeOrders: 12,
    plannedOrders: 18,
    completedOrders: 15,
    cancelledOrders: 2,
    totalProduced: 3840,
    totalRejected: 76,
    totalProducts: 24,
    totalMachines: 8,
    totalPlants: 3,
    completionRate: 68,
    qualityRate: 98,
  },
  plants: [
    { id: 'p1', name: 'Planta Alpha', location: 'São Paulo - SP', totalCapacity: 500, contact: 'Carlos Silva', status: 'active', notes: 'Planta principal de produção' },
    { id: 'p2', name: 'Planta Beta', location: 'Campinas - SP', totalCapacity: 320, contact: 'Ana Souza', status: 'active', notes: 'Especializada em montagem' },
    { id: 'p3', name: 'Planta Gamma', location: 'Santo André - SP', totalCapacity: 180, contact: 'Roberto Lima', status: 'inactive', notes: 'Em manutenção programada' },
  ],
  machines: [
    { id: 'm1', name: 'Torno CNC-01', plantId: 'p1', plantName: 'Planta Alpha', type: 'CNC', capacity: '200 peças/h', status: 'operational', specs: 'Fanuc 0i-MF, 3 eixos' },
    { id: 'm2', name: 'Fresadora CNC-02', plantId: 'p1', plantName: 'Planta Alpha', type: 'Fresadora', capacity: '150 peças/h', status: 'maintenance', specs: 'Siemens 840D' },
    { id: 'm3', name: 'Prensa Hidráulica-01', plantId: 'p2', plantName: 'Planta Beta', type: 'Prensa', capacity: '300 ton', status: 'operational', specs: '300 toneladas, curso 500mm' },
    { id: 'm4', name: 'Robô de Solda-01', plantId: 'p1', plantName: 'Planta Alpha', type: 'Robótica', capacity: '80 cordões/h', status: 'operational', specs: 'KUKA KR 16' },
    { id: 'm5', name: 'Injetora Plástico-01', plantId: 'p2', plantName: 'Planta Beta', type: 'Injetora', capacity: '500 ciclos/h', status: 'offline', specs: '250 ton, 1200g' },
    { id: 'm6', name: 'Centro Usinagem-01', plantId: 'p1', plantName: 'Planta Alpha', type: 'CNC', capacity: '100 peças/h', status: 'operational', specs: 'DMG MORI 5 eixos' },
  ],
  // Products with stock status
  products: [
    { id: 'pr1', name: 'Tampa de Alumínio A200', code: 'TAM-A200', description: 'Tampa de fechamento em alumínio anodizado', unit: 'un', stockMin: 50, stockCurrent: 12, stockStatus: 'critical', serialControlled: true, controlType: 'serie', productionType: 'internal', leadTimeDays: 5, supplierIds: [], criticalAlertSent: false },
    { id: 'pr2', name: 'Eixo Transmissão T500', code: 'EXT-T500', description: 'Eixo de transmissão em aço SAE 1045', unit: 'un', stockMin: 30, stockCurrent: 35, stockStatus: 'normal', serialControlled: true, controlType: 'serie', productionType: 'internal', leadTimeDays: 7, supplierIds: [], criticalAlertSent: false },
    { id: 'pr3', name: 'Suporte Lateral SL100', code: 'SLT-SL100', description: 'Suporte lateral em chapa dobrada', unit: 'un', stockMin: 40, stockCurrent: 18, stockStatus: 'purchase_needed', serialControlled: false, controlType: null, productionType: 'external', leadTimeDays: 10, supplierIds: ['sup4'], criticalAlertSent: false },
    { id: 'pr4', name: 'Carcaça Motor CM300', code: 'CRC-CM300', description: 'Carcaça do motor em ferro fundido', unit: 'un', stockMin: 20, stockCurrent: 8, stockStatus: 'manufacture_needed', serialControlled: true, controlType: 'lote', productionType: 'internal', leadTimeDays: 14, supplierIds: [], criticalAlertSent: false },
    { id: 'pr5', name: 'Engrenagem Cônica EC-45', code: 'ENG-EC45', description: 'Engrenagem cônica módulo 3, 45 dentes', unit: 'un', stockMin: 100, stockCurrent: 250, stockStatus: 'normal', serialControlled: false, controlType: null, productionType: 'external', leadTimeDays: 12, supplierIds: ['sup1'], criticalAlertSent: false },
    { id: 'pr6', name: 'Pino Elástico PE-12', code: 'PIN-PE12', description: 'Pino elástico DIN 1481, diâm 12mm', unit: 'un', stockMin: 200, stockCurrent: 5, stockStatus: 'critical', serialControlled: true, controlType: 'lote', productionType: 'external', leadTimeDays: 45, supplierIds: ['sup3'], criticalAlertSent: true },
  ],
  // Production orders with "pedido" and "cliente" fields
  productionOrders: [
    { id: 'op1', code: 'OP-2024-001', productName: 'Tampa de Alumínio A200', quantity: 500, startDate: '2024-02-01', endDate: '2024-02-10', status: 'completed', priority: 'high', plantName: 'Planta Alpha', completedQuantity: 500, pedido: 'PV-2024-0045', cliente: 'Metalúrgica Omega Ltda' },
    { id: 'op2', code: 'OP-2024-002', productName: 'Eixo Transmissão T500', quantity: 200, startDate: '2024-02-05', endDate: '2024-02-15', status: 'in_progress', priority: 'urgent', plantName: 'Planta Alpha', completedQuantity: 120, pedido: 'PV-2024-0052', cliente: 'Indústrias Delta S.A.' },
    { id: 'op3', code: 'OP-2024-003', productName: 'Suporte Lateral SL100', quantity: 350, startDate: '2024-02-10', endDate: '2024-02-20', status: 'in_progress', priority: 'medium', plantName: 'Planta Beta', completedQuantity: 85, pedido: 'PV-2024-0041', cliente: 'Construtora Sigma' },
    { id: 'op4', code: 'OP-2024-004', productName: 'Carcaça Motor CM300', quantity: 100, startDate: '2024-02-12', endDate: '2024-02-25', status: 'planned', priority: 'high', plantName: 'Planta Beta', completedQuantity: 0, pedido: 'PV-2024-0058', cliente: 'Automação Beta Ind.' },
    { id: 'op5', code: 'OP-2024-005', productName: 'Engrenagem Cônica EC-45', quantity: 800, startDate: '2024-02-15', endDate: '2024-02-28', status: 'planned', priority: 'medium', plantName: 'Planta Alpha', completedQuantity: 0, pedido: 'PV-2024-0061', cliente: 'TechDrive Ltda' },
    { id: 'op6', code: 'OP-2024-006', productName: 'Pino Elástico PE-12', quantity: 2000, startDate: '2024-02-01', endDate: '2024-02-08', status: 'completed', priority: 'low', plantName: 'Planta Alpha', completedQuantity: 2000, pedido: 'PV-2024-0031', cliente: 'Distribuidora Norte' },
    { id: 'op7', code: 'OP-2024-007', productName: 'Tampa de Alumínio A200', quantity: 300, startDate: '2024-02-18', endDate: '2024-02-25', status: 'planned', priority: 'medium', plantName: 'Planta Alpha', completedQuantity: 0, pedido: 'PV-2024-0063', cliente: 'Metalúrgica Omega Ltda' },
    { id: 'op8', code: 'OP-2024-008', productName: 'Eixo Transmissão T500', quantity: 150, startDate: '2024-02-20', endDate: '2024-02-28', status: 'cancelled', priority: 'low', plantName: 'Planta Beta', completedQuantity: 0, pedido: '', cliente: '' },
  ],
  productionEntries: [
    { id: 'ae1', orderCode: 'OP-2024-002', stepName: 'Torneamento', quantityProduced: 60, quantityRejected: 2, timeSpent: 120, operator: 'João Ferreira', recordedAt: '2024-02-06', ncGenerated: false },
    { id: 'ae2', orderCode: 'OP-2024-002', stepName: 'Fresamento', quantityProduced: 60, quantityRejected: 1, timeSpent: 90, operator: 'Maria Santos', recordedAt: '2024-02-07', ncGenerated: false },
    { id: 'ae3', orderCode: 'OP-2024-003', stepName: 'Corte', quantityProduced: 85, quantityRejected: 8, timeSpent: 60, operator: 'Paulo Costa', recordedAt: '2024-02-11', ncGenerated: true },
    { id: 'ae4', orderCode: 'OP-2024-001', stepName: 'Montagem Final', quantityProduced: 500, quantityRejected: 8, timeSpent: 240, operator: 'Ana Lima', recordedAt: '2024-02-10', ncGenerated: false },
  ],
  // Non-conformances (NC)
  nonConformances: [
    { id: 'nc1', code: 'NC-2024-001', orderCode: 'OP-2024-003', stepName: 'Corte', operator: 'Paulo Costa', quantityRejected: 8, description: 'Peças com rebarbas excessivas no corte', status: 'open', severity: 'medium', createdAt: '2024-02-11', images: [], rootCause: '', correctiveAction: '', responsible: '' },
    { id: 'nc2', code: 'NC-2024-002', orderCode: 'OP-2024-001', stepName: 'Montagem Final', operator: 'Ana Lima', quantityRejected: 8, description: 'Folga fora de especificação nas tampas', status: 'in_analysis', severity: 'high', createdAt: '2024-02-10', images: [], rootCause: 'Desgaste do ferramental', correctiveAction: 'Substituição do punção de estampagem', responsible: 'Maria Santos' },
    { id: 'nc3', code: 'NC-2024-003', orderCode: 'OP-2024-002', stepName: 'Torneamento', operator: 'João Ferreira', quantityRejected: 2, description: 'Diâmetro externo fora de tolerância', status: 'closed', severity: 'low', createdAt: '2024-02-06', images: [], rootCause: 'Desvio de programação CNC', correctiveAction: 'Reprogramação e ajuste do offset', responsible: 'Carlos Silva' },
  ],
  // Stock items (raw materials / components)
  stockItems: [
    { id: 'st1', code: 'MAT-001', name: 'Barra Aço SAE 1045 Ø50', unit: 'm', quantity: 80, minQuantity: 100, location: 'Armazém A - Prateleira 3', category: 'Matéria-Prima', lastUpdate: '2024-02-15', status: 'critical', serialControlled: false, controlType: null, leadTimeDays: 7, supplierIds: ['sup1'], productionType: 'external' },
    { id: 'st2', code: 'ROL-001', name: 'Rolamento 6205-2RS', unit: 'un', quantity: 250, minQuantity: 200, location: 'Armazém B - Caixa 12', category: 'Componente', lastUpdate: '2024-02-14', status: 'normal', serialControlled: true, controlType: 'serie', leadTimeDays: 5, supplierIds: ['sup2','sup4'], productionType: 'external' },
    { id: 'st3', code: 'ANL-001', name: 'Anel de Retenção', unit: 'un', quantity: 180, minQuantity: 300, location: 'Armazém B - Caixa 15', category: 'Componente', lastUpdate: '2024-02-13', status: 'purchase_needed', serialControlled: true, controlType: 'lote', leadTimeDays: 5, supplierIds: ['sup2'], productionType: 'external' },
    { id: 'st4', code: 'MAT-010', name: 'Lingote Ferro Fundido GG-25', unit: 'kg', quantity: 320, minQuantity: 200, location: 'Pátio Externo - Lote 2', category: 'Matéria-Prima', lastUpdate: '2024-02-15', status: 'normal', serialControlled: false, controlType: null, leadTimeDays: 10, supplierIds: ['sup1'], productionType: 'external' },
    { id: 'st5', code: 'PAR-001', name: 'Parafuso M8x25', unit: 'un', quantity: 1200, minQuantity: 500, location: 'Armazém C - Caixa 8', category: 'Fixador', lastUpdate: '2024-02-12', status: 'normal', serialControlled: false, controlType: null, leadTimeDays: 45, supplierIds: ['sup3','sup1'], productionType: 'external' },
    { id: 'st6', code: 'MAT-005', name: 'Chapa Al 6061 3mm', unit: 'kg', quantity: 200, minQuantity: 150, location: 'Armazém A - Prateleira 7', category: 'Matéria-Prima', lastUpdate: '2024-02-11', status: 'normal', serialControlled: false, controlType: null, leadTimeDays: 60, supplierIds: ['sup5'], productionType: 'external' },
    { id: 'st7', code: 'MAT-015', name: 'Bloco Aço 8620', unit: 'kg', quantity: 200, minQuantity: 400, location: 'Armazém A - Prateleira 5', category: 'Matéria-Prima', lastUpdate: '2024-02-10', status: 'purchase_needed', serialControlled: false, controlType: null, leadTimeDays: 7, supplierIds: ['sup1'], productionType: 'external' },
  ],
  // Serial/Lot numbers per item (for items with serialControlled = true)
  serialNumbers: [
    // TAM-A200 - série
    { id: 'sn1', itemCode: 'TAM-A200', itemName: 'Tampa de Alumínio A200', number: 'SN-TAM-0001', type: 'serie', status: 'em_estoque', quantity: 1, createdAt: '2024-02-10', createdBy: 'Ana Lima', origin: 'apontamento', orderCode: 'OP-2024-001' },
    { id: 'sn2', itemCode: 'TAM-A200', itemName: 'Tampa de Alumínio A200', number: 'SN-TAM-0002', type: 'serie', status: 'em_estoque', quantity: 1, createdAt: '2024-02-10', createdBy: 'Ana Lima', origin: 'apontamento', orderCode: 'OP-2024-001' },
    { id: 'sn3', itemCode: 'TAM-A200', itemName: 'Tampa de Alumínio A200', number: 'SN-TAM-0012', type: 'serie', status: 'separado', quantity: 1, createdAt: '2024-02-10', createdBy: 'Ana Lima', origin: 'apontamento', orderCode: 'OP-2024-001' },
    // EXT-T500 - série
    { id: 'sn4', itemCode: 'EXT-T500', itemName: 'Eixo Transmissão T500', number: 'SN-EXT-0030', type: 'serie', status: 'em_estoque', quantity: 1, createdAt: '2024-02-07', createdBy: 'Maria Santos', origin: 'apontamento', orderCode: 'OP-2024-002' },
    { id: 'sn5', itemCode: 'EXT-T500', itemName: 'Eixo Transmissão T500', number: 'SN-EXT-0031', type: 'serie', status: 'em_estoque', quantity: 1, createdAt: '2024-02-07', createdBy: 'Maria Santos', origin: 'apontamento', orderCode: 'OP-2024-002' },
    { id: 'sn6', itemCode: 'EXT-T500', itemName: 'Eixo Transmissão T500', number: 'SN-EXT-0034', type: 'serie', status: 'separado', quantity: 1, createdAt: '2024-02-07', createdBy: 'Maria Santos', origin: 'apontamento', orderCode: 'OP-2024-002' },
    // CRC-CM300 - lote
    { id: 'sn7', itemCode: 'CRC-CM300', itemName: 'Carcaça Motor CM300', number: 'LT-CM-2024-001', type: 'lote', status: 'em_estoque', quantity: 8, createdAt: '2024-02-05', createdBy: 'Carlos Silva', origin: 'planilha', orderCode: null },
    // ROL-001 - série
    { id: 'sn8', itemCode: 'ROL-001', itemName: 'Rolamento 6205-2RS', number: 'SN-ROL-0100', type: 'serie', status: 'em_estoque', quantity: 1, createdAt: '2024-02-01', createdBy: 'Carlos Silva', origin: 'planilha', orderCode: null },
    { id: 'sn9', itemCode: 'ROL-001', itemName: 'Rolamento 6205-2RS', number: 'SN-ROL-0101', type: 'serie', status: 'em_estoque', quantity: 1, createdAt: '2024-02-01', createdBy: 'Carlos Silva', origin: 'planilha', orderCode: null },
    // ANL-001 - lote
    { id: 'sn10', itemCode: 'ANL-001', itemName: 'Anel de Retenção', number: 'LT-ANL-2024-001', type: 'lote', status: 'em_estoque', quantity: 180, createdAt: '2024-02-13', createdBy: 'Ana Souza', origin: 'planilha', orderCode: null },
    // PIN-PE12 - lote
    { id: 'sn11', itemCode: 'PIN-PE12', itemName: 'Pino Elástico PE-12', number: 'LT-PIN-2024-007', type: 'lote', status: 'em_estoque', quantity: 5, createdAt: '2024-02-08', createdBy: 'João Ferreira', origin: 'apontamento', orderCode: 'OP-2024-006' },
  ],
  // Kardex – all stock movements
  kardexMovements: [
    { id: 'kx1', serialNumber: 'SN-TAM-0001', itemCode: 'TAM-A200', itemName: 'Tampa de Alumínio A200', movType: 'entrada', description: 'Criado via apontamento OP-2024-001', orderCode: 'OP-2024-001', pedido: null, nf: null, quantity: 1, date: '2024-02-10T14:32:00', user: 'Ana Lima' },
    { id: 'kx2', serialNumber: 'SN-TAM-0002', itemCode: 'TAM-A200', itemName: 'Tampa de Alumínio A200', movType: 'entrada', description: 'Criado via apontamento OP-2024-001', orderCode: 'OP-2024-001', pedido: null, nf: null, quantity: 1, date: '2024-02-10T14:33:00', user: 'Ana Lima' },
    { id: 'kx3', serialNumber: 'SN-TAM-0012', itemCode: 'TAM-A200', itemName: 'Tampa de Alumínio A200', movType: 'entrada', description: 'Criado via apontamento OP-2024-001', orderCode: 'OP-2024-001', pedido: null, nf: null, quantity: 1, date: '2024-02-10T14:45:00', user: 'Ana Lima' },
    { id: 'kx4', serialNumber: 'SN-TAM-0012', itemCode: 'TAM-A200', itemName: 'Tampa de Alumínio A200', movType: 'saida', description: 'Separado para pedido PV-2024-0045', orderCode: null, pedido: 'PV-2024-0045', nf: 'NF-00542', quantity: 1, date: '2024-02-12T09:10:00', user: 'Carlos Silva' },
    { id: 'kx5', serialNumber: 'SN-EXT-0030', itemCode: 'EXT-T500', itemName: 'Eixo Transmissão T500', movType: 'entrada', description: 'Criado via apontamento OP-2024-002', orderCode: 'OP-2024-002', pedido: null, nf: null, quantity: 1, date: '2024-02-07T16:00:00', user: 'Maria Santos' },
    { id: 'kx6', serialNumber: 'SN-EXT-0031', itemCode: 'EXT-T500', itemName: 'Eixo Transmissão T500', movType: 'entrada', description: 'Criado via apontamento OP-2024-002', orderCode: 'OP-2024-002', pedido: null, nf: null, quantity: 1, date: '2024-02-07T16:01:00', user: 'Maria Santos' },
    { id: 'kx7', serialNumber: 'SN-EXT-0034', itemCode: 'EXT-T500', itemName: 'Eixo Transmissão T500', movType: 'entrada', description: 'Criado via apontamento OP-2024-002', orderCode: 'OP-2024-002', pedido: null, nf: null, quantity: 1, date: '2024-02-07T16:02:00', user: 'Maria Santos' },
    { id: 'kx8', serialNumber: 'SN-EXT-0034', itemCode: 'EXT-T500', itemName: 'Eixo Transmissão T500', movType: 'saida', description: 'Separado para pedido PV-2024-0052', orderCode: null, pedido: 'PV-2024-0052', nf: null, quantity: 1, date: '2024-02-18T10:30:00', user: 'Ana Souza' },
    { id: 'kx9', serialNumber: 'LT-CM-2024-001', itemCode: 'CRC-CM300', itemName: 'Carcaça Motor CM300', movType: 'entrada', description: 'Importado via planilha', orderCode: null, pedido: null, nf: null, quantity: 8, date: '2024-02-05T08:00:00', user: 'Carlos Silva' },
    { id: 'kx10', serialNumber: 'SN-ROL-0100', itemCode: 'ROL-001', itemName: 'Rolamento 6205-2RS', movType: 'entrada', description: 'Importado via planilha', orderCode: null, pedido: null, nf: null, quantity: 1, date: '2024-02-01T08:00:00', user: 'Carlos Silva' },
    { id: 'kx11', serialNumber: 'SN-ROL-0101', itemCode: 'ROL-001', itemName: 'Rolamento 6205-2RS', movType: 'entrada', description: 'Importado via planilha', orderCode: null, pedido: null, nf: null, quantity: 1, date: '2024-02-01T08:01:00', user: 'Carlos Silva' },
    { id: 'kx12', serialNumber: 'LT-ANL-2024-001', itemCode: 'ANL-001', itemName: 'Anel de Retenção', movType: 'entrada', description: 'Importado via planilha', orderCode: null, pedido: null, nf: null, quantity: 180, date: '2024-02-13T08:00:00', user: 'Ana Souza' },
    { id: 'kx13', serialNumber: 'LT-PIN-2024-007', itemCode: 'PIN-PE12', itemName: 'Pino Elástico PE-12', movType: 'entrada', description: 'Criado via apontamento OP-2024-006', orderCode: 'OP-2024-006', pedido: null, nf: null, quantity: 5, date: '2024-02-08T11:20:00', user: 'João Ferreira' },
  ],
  // Almoxarifados
  warehouses: [
    { id: 'alm2', name: 'Almoxarifado Matérias-Primas', code: 'ALM-002', responsible: 'João Ferreira', custodian: 'Ana Souza', city: 'São Paulo', state: 'SP', status: 'active', active: true },
    { id: 'alm3', name: 'Almoxarifado Produtos Acabados', code: 'ALM-003', responsible: 'Carlos Silva', custodian: 'Carlos Silva', city: 'São Paulo', state: 'SP', status: 'active', active: true },
    { id: 'alm4', name: 'Almoxarifado Filial Sul', code: 'ALM-004', responsible: 'Roberto Lima', custodian: 'Roberto Lima', city: 'Curitiba', state: 'PR', status: 'manutencao', active: false },
  ],
  // Separation orders (picking for finished products)
  separationOrders: [
    { id: 'sep1', code: 'OS-2024-001', pedido: 'PV-2024-0045', cliente: 'Metalúrgica Omega Ltda', items: [{ productCode: 'TAM-A200', productName: 'Tampa de Alumínio A200', quantity: 200, serialNumber: 'SN-TAM-0012' }], dataSeparacao: '2024-02-12', status: 'completed', responsavel: 'Carlos Silva' },
    { id: 'sep2', code: 'OS-2024-002', pedido: 'PV-2024-0052', cliente: 'Indústrias Delta S.A.', items: [{ productCode: 'EXT-T500', productName: 'Eixo Transmissão T500', quantity: 80, serialNumber: 'SN-EXT-0034' }], dataSeparacao: '2024-02-18', status: 'pending', responsavel: 'Ana Souza' },
  ],
  // Stock exits / baixas
  stockExits: [
    { id: 'bx1', code: 'BX-2024-001', type: 'faturamento', pedido: 'PV-2024-0045', items: [{ code: 'TAM-A200', name: 'Tampa de Alumínio A200', quantity: 200 }], date: '2024-02-12', responsavel: 'Carlos Silva', notes: 'Faturamento NF-e 00542' },
    { id: 'bx2', code: 'BX-2024-002', type: 'requisicao', pedido: 'REQ-ENG-014', items: [{ code: 'MAT-001', name: 'Barra Aço SAE 1045 Ø50', quantity: 5 }], date: '2024-02-13', responsavel: 'João Ferreira', notes: 'Requisição para manutenção Torno CNC-01' },
  ],
  workInstructions: [
    {
      id: 'wi1', title: 'Procedimento de Torneamento CNC', code: 'IT-CNC-001', version: 3, status: 'published',
      createdBy: 'Eng. Carlos', approvedBy: 'Gerente Silva', productName: 'Eixo Transmissão T500',
      steps: [
        { order: 1, description: 'Verificar o estado das ferramentas de corte antes de iniciar', hasPhoto: false, photo: null },
        { order: 2, description: 'Montar peça no mandril com torque de 45 Nm utilizando chave dinamométrica', hasPhoto: true, photo: 'https://placehold.co/400x300?text=Montagem+Mandril' },
        { order: 3, description: 'Definir zero-peça no programa CNC conforme plano de usinagem', hasPhoto: false, photo: null },
        { order: 4, description: 'Executar passagem de desbaste com avanço 0,3 mm/rot e velocidade 180 m/min', hasPhoto: false, photo: null },
        { order: 5, description: 'Inspecionar diâmetro externo com micrômetro após desbaste (tolerância ±0,05 mm)', hasPhoto: true, photo: 'https://placehold.co/400x300?text=Inspeção+Dimensional' },
        { order: 6, description: 'Executar passagem de acabamento com avanço 0,1 mm/rot', hasPhoto: false, photo: null },
      ]
    },
    {
      id: 'wi2', title: 'Inspeção Visual de Superfícies', code: 'IT-QUAL-002', version: 1, status: 'approved',
      createdBy: 'Eng. Ana', approvedBy: 'Gerente Silva', productName: null,
      steps: [
        { order: 1, description: 'Limpar a superfície da peça com pano seco e isento de óleo', hasPhoto: false, photo: null },
        { order: 2, description: 'Inspecionar visualmente sob iluminação de 500 lux mínimo', hasPhoto: false, photo: null },
        { order: 3, description: 'Verificar presença de trincas, marcas, rebarbas e oxidação', hasPhoto: true, photo: 'https://placehold.co/400x300?text=Inspeção+Visual' },
        { order: 4, description: 'Registrar resultado no formulário INS-001 e assinar', hasPhoto: false, photo: null },
      ]
    },
    {
      id: 'wi3', title: 'Montagem de Carcaça do Motor', code: 'IT-MON-003', version: 2, status: 'review',
      createdBy: 'Eng. Roberto', approvedBy: null, productName: 'Carcaça Motor CM300',
      steps: [
        { order: 1, description: 'Verificar dimensões da carcaça conforme desenho técnico DT-CM300-Rev2', hasPhoto: false, photo: null },
        { order: 2, description: 'Aplicar graxa mineral nos furos de rolamento', hasPhoto: true, photo: 'https://placehold.co/400x300?text=Lubrificação' },
        { order: 3, description: 'Pressionar rolamentos com prensa hidráulica, força máx. 5 kN', hasPhoto: false, photo: null },
        { order: 4, description: 'Instalar vedações e verificar folgas conforme tabela de tolerâncias', hasPhoto: false, photo: null },
      ]
    },
    {
      id: 'wi4', title: 'Solda MIG em Aço Carbono', code: 'IT-SOLD-004', version: 1, status: 'draft',
      createdBy: 'Eng. Paulo', approvedBy: null, productName: null,
      steps: [
        { order: 1, description: 'EPIs obrigatórios: máscara de solda, luvas raspa e avental de couro', hasPhoto: false, photo: null },
        { order: 2, description: 'Limpar superfície com escova de aço e acetona', hasPhoto: false, photo: null },
        { order: 3, description: 'Configurar parâmetros: tensão 20-22V, corrente 180-200A, gás Ar/CO2 75/25', hasPhoto: false, photo: null },
      ]
    },
    {
      id: 'wi5', title: 'Setup de Fresadora 5 Eixos', code: 'IT-CNC-005', version: 2, status: 'published',
      createdBy: 'Eng. Carlos', approvedBy: 'Gerente Lima', productName: null,
      steps: [
        { order: 1, description: 'Verificar nível de óleo lubrificante e refrigerante antes do acionamento', hasPhoto: false, photo: null },
        { order: 2, description: 'Referenciar máquina nos 5 eixos (X, Y, Z, A, C)', hasPhoto: false, photo: null },
        { order: 3, description: 'Carregar programa CNC e realizar simulação gráfica antes de usinar', hasPhoto: true, photo: 'https://placehold.co/400x300?text=Simulação+CNC' },
        { order: 4, description: 'Realizar corte-teste em material de sacrifício e medir com apalpador', hasPhoto: false, photo: null },
      ]
    },
  ],
  bomItems: [
    { id: 'b1', productName: 'Eixo Transmissão T500', productCode: 'EXT-T500', componentName: 'Barra Aço SAE 1045 Ø50', componentCode: 'MAT-001', quantity: 1, unit: 'm' },
    { id: 'b2', productName: 'Eixo Transmissão T500', productCode: 'EXT-T500', componentName: 'Rolamento 6205-2RS', componentCode: 'ROL-001', quantity: 2, unit: 'un' },
    { id: 'b3', productName: 'Eixo Transmissão T500', productCode: 'EXT-T500', componentName: 'Anel de Retenção', componentCode: 'ANL-001', quantity: 2, unit: 'un' },
    { id: 'b4', productName: 'Carcaça Motor CM300', productCode: 'CRC-CM300', componentName: 'Lingote Ferro Fundido GG-25', componentCode: 'MAT-010', quantity: 5, unit: 'kg' },
    { id: 'b5', productName: 'Carcaça Motor CM300', productCode: 'CRC-CM300', componentName: 'Parafuso M8x25', componentCode: 'PAR-001', quantity: 12, unit: 'un' },
    { id: 'b6', productName: 'Tampa de Alumínio A200', productCode: 'TAM-A200', componentName: 'Chapa Al 6061 3mm', componentCode: 'MAT-005', quantity: 0.5, unit: 'kg' },
  ],
  routes: [
    { id: 'r1', productName: 'Eixo Transmissão T500', productCode: 'EXT-T500', name: 'Roteiro Principal', steps: [
      { order: 1, operation: 'Corte da Barra', resourceType: 'machine', standardTime: 15 },
      { order: 2, operation: 'Torneamento Externo', resourceType: 'machine', standardTime: 45 },
      { order: 3, operation: 'Fresamento de Canal', resourceType: 'machine', standardTime: 30 },
      { order: 4, operation: 'Inspeção Dimensional', resourceType: 'workbench', standardTime: 20 },
    ]},
    { id: 'r2', productName: 'Tampa de Alumínio A200', productCode: 'TAM-A200', name: 'Roteiro Estamparia', steps: [
      { order: 1, operation: 'Corte a Laser', resourceType: 'machine', standardTime: 10 },
      { order: 2, operation: 'Estampagem', resourceType: 'machine', standardTime: 25 },
      { order: 3, operation: 'Rebarbação', resourceType: 'workbench', standardTime: 15 },
      { order: 4, operation: 'Anodização', resourceType: 'manual', standardTime: 60 },
    ]},
  ],
  mrpEntries: [
    { id: 'mrp1', productName: 'Eixo Transmissão T500', componentName: 'Barra Aço SAE 1045 Ø50', requiredQuantity: 200, availableQuantity: 80, shortfall: 120, suggestedAction: 'purchase', generatedAt: '2024-02-15', stockStatus: 'critical', leadTimeDays: 7, shortageDate: '2024-02-22', alertSent: true },
    { id: 'mrp2', productName: 'Eixo Transmissão T500', componentName: 'Rolamento 6205-2RS', requiredQuantity: 400, availableQuantity: 250, shortfall: 150, suggestedAction: 'purchase', generatedAt: '2024-02-15', stockStatus: 'purchase_needed', leadTimeDays: 5, shortageDate: '2024-02-25', alertSent: true },
    { id: 'mrp3', productName: 'Carcaça Motor CM300', componentName: 'Lingote Ferro Fundido GG-25', requiredQuantity: 500, availableQuantity: 320, shortfall: 180, suggestedAction: 'purchase', generatedAt: '2024-02-15', stockStatus: 'purchase_needed', leadTimeDays: 10, shortageDate: '2024-03-05', alertSent: false },
    { id: 'mrp4', productName: 'Tampa de Alumínio A200', componentName: 'Chapa Al 6061 3mm', requiredQuantity: 150, availableQuantity: 200, shortfall: 0, suggestedAction: 'manufacture', generatedAt: '2024-02-15', stockStatus: 'normal', leadTimeDays: 60, shortageDate: null, alertSent: false },
    { id: 'mrp5', productName: 'Engrenagem Cônica EC-45', componentName: 'Bloco Aço 8620', requiredQuantity: 800, availableQuantity: 200, shortfall: 600, suggestedAction: 'purchase', generatedAt: '2024-02-15', stockStatus: 'critical', leadTimeDays: 7, shortageDate: '2024-02-20', alertSent: true },
  ],
  workbenches: [
    { id: 'wb1', name: 'Bancada de Inspeção 01', plantName: 'Planta Alpha', function: 'Inspeção Dimensional', status: 'available' },
    { id: 'wb2', name: 'Bancada de Montagem 01', plantName: 'Planta Alpha', function: 'Montagem de Subconjuntos', status: 'in_use' },
    { id: 'wb3', name: 'Bancada de Solda 01', plantName: 'Planta Beta', function: 'Soldagem Manual', status: 'available' },
    { id: 'wb4', name: 'Bancada de Rebarbação', plantName: 'Planta Alpha', function: 'Acabamento Superficial', status: 'maintenance' },
  ],
  users: [
    { id: 'u1', name: 'Carlos Silva', email: 'carlos@empresa.com', role: 'admin', avatar: null },
    { id: 'u2', name: 'Ana Souza', email: 'ana@empresa.com', role: 'gestor_pcp', avatar: null },
    { id: 'u3', name: 'João Ferreira', email: 'joao@empresa.com', role: 'operador', avatar: null },
    { id: 'u4', name: 'Maria Santos', email: 'maria@empresa.com', role: 'qualidade', avatar: null },
    { id: 'u5', name: 'Roberto Lima', email: 'roberto@empresa.com', role: 'compras', avatar: null },
  ],
  // Suppliers / Fornecedores
  suppliers: [
    { id: 'sup1', name: 'Aços Especiais Nacionais Ltda', tradeName: 'Aços Nacionais', cnpj: '12.345.678/0001-90', email: 'vendas@acosnacionais.com.br', phone: '(11) 3456-7890', contact: 'Marcos Vieira', city: 'São Paulo', state: 'SP', country: 'Brasil', type: 'nacional', category: 'Matéria-Prima', paymentTerms: '30/60/90 dias', deliveryLeadDays: 7, rating: 4.5, active: true, notes: 'Fornecedor homologado desde 2019' },
    { id: 'sup2', name: 'Rolamentos Premium S.A.', tradeName: 'RolPremium', cnpj: '98.765.432/0001-10', email: 'compras@rolpremium.com.br', phone: '(11) 4567-8901', contact: 'Fernanda Costa', city: 'Campinas', state: 'SP', country: 'Brasil', type: 'nacional', category: 'Componente', paymentTerms: '28 dias', deliveryLeadDays: 5, rating: 4.8, active: true, notes: 'Distribuidor autorizado SKF' },
    { id: 'sup3', name: 'Fasteners & Fixings Co.', tradeName: 'FastFix', cnpj: null, email: 'sales@fastfix.com', phone: '+1 555-234-5678', contact: 'John Smith', city: 'Chicago', state: 'IL', country: 'EUA', type: 'importado', category: 'Fixador', paymentTerms: 'L/C 60 dias', deliveryLeadDays: 45, rating: 4.2, active: true, notes: 'Importação via trading; NCM 7318.15.00' },
    { id: 'sup4', name: 'Componentes Industriais Sul Ltda', tradeName: 'CIS', cnpj: '55.111.222/0001-33', email: 'vendas@cis.com.br', phone: '(51) 3333-4444', contact: 'Paulo Menezes', city: 'Porto Alegre', state: 'RS', country: 'Brasil', type: 'nacional', category: 'Componente', paymentTerms: '30 dias', deliveryLeadDays: 10, rating: 3.9, active: true, notes: 'Segundo fornecedor para rolamentos' },
    { id: 'sup5', name: 'Alumínio & Ligas GmbH', tradeName: 'AluminGmbH', cnpj: null, email: 'export@alumingmbh.de', phone: '+49 89 1234-5678', contact: 'Klaus Müller', city: 'München', state: 'Bayern', country: 'Alemanha', type: 'importado', category: 'Matéria-Prima', paymentTerms: 'L/C 90 dias', deliveryLeadDays: 60, rating: 4.7, active: true, notes: 'Liga AL6061; NCM 7604.10.00' },
  ],
  // Product-Supplier links com prioridade
  productSuppliers: [
    { id: 'ps1', productCode: 'MAT-001', supplierIds: ['sup1'], priorities: { sup1: 1 }, internalProduction: false },
    { id: 'ps2', productCode: 'ROL-001', supplierIds: ['sup2', 'sup4'], priorities: { sup2: 1, sup4: 2 }, internalProduction: false },
    { id: 'ps3', productCode: 'ANL-001', supplierIds: ['sup2'], priorities: { sup2: 1 }, internalProduction: false },
    { id: 'ps4', productCode: 'MAT-010', supplierIds: ['sup1'], priorities: { sup1: 1 }, internalProduction: false },
    { id: 'ps5', productCode: 'PAR-001', supplierIds: ['sup3', 'sup1'], priorities: { sup3: 1, sup1: 2 }, internalProduction: false },
    { id: 'ps6', productCode: 'MAT-005', supplierIds: ['sup5'], priorities: { sup5: 1 }, internalProduction: false },
    { id: 'ps7', productCode: 'MAT-015', supplierIds: ['sup1'], priorities: { sup1: 1 }, internalProduction: false },
    // Produtos acabados: maioria internos
    { id: 'ps8', productCode: 'TAM-A200', supplierIds: [], priorities: {}, internalProduction: true },
    { id: 'ps9', productCode: 'EXT-T500', supplierIds: [], priorities: {}, internalProduction: true },
    { id: 'ps10', productCode: 'SLT-SL100', supplierIds: ['sup4'], priorities: { sup4: 1 }, internalProduction: false },
    { id: 'ps11', productCode: 'CRC-CM300', supplierIds: [], priorities: {}, internalProduction: true },
    { id: 'ps12', productCode: 'ENG-EC45', supplierIds: ['sup1'], priorities: { sup1: 1 }, internalProduction: false },
    { id: 'ps13', productCode: 'PIN-PE12', supplierIds: ['sup3'], priorities: { sup3: 1 }, internalProduction: false },
  ],
  // Cotações de compra
  quotations: [
    { id: 'cot1', code: 'COT-2024-001', status: 'pending_approval', createdAt: '2024-02-15', createdBy: 'Roberto Lima', items: [{ productCode: 'MAT-001', productName: 'Barra Aço SAE 1045 Ø50', quantity: 120, unit: 'm' }], supplierResponses: [{ supplierId: 'sup1', supplierName: 'Aços Nacionais', unitPrice: 48.50, totalPrice: 5820.00, deliveryDays: 7, paymentTerms: '30 dias', respondedAt: '2024-02-16', notes: 'Preço válido por 15 dias' }], approvedBy: null, approvedAt: null, purchaseOrderId: null },
    { id: 'cot2', code: 'COT-2024-002', status: 'awaiting_responses', createdAt: '2024-02-14', createdBy: 'Roberto Lima', items: [{ productCode: 'ROL-001', productName: 'Rolamento 6205-2RS', quantity: 100, unit: 'un' }], supplierResponses: [{ supplierId: 'sup2', supplierName: 'RolPremium', unitPrice: 22.90, totalPrice: 2290.00, deliveryDays: 5, paymentTerms: '28 dias', respondedAt: '2024-02-15', notes: 'Disponível em estoque' }], approvedBy: null, approvedAt: null, purchaseOrderId: null },
    { id: 'cot3', code: 'COT-2024-003', status: 'approved', createdAt: '2024-02-10', createdBy: 'Roberto Lima', items: [{ productCode: 'MAT-005', productName: 'Chapa Al 6061 3mm', quantity: 200, unit: 'kg' }], supplierResponses: [{ supplierId: 'sup5', supplierName: 'AluminGmbH', unitPrice: 18.75, totalPrice: 3750.00, deliveryDays: 60, paymentTerms: 'L/C 90 dias', respondedAt: '2024-02-12', notes: 'CIF Santos' }], approvedBy: 'Carlos Silva', approvedAt: '2024-02-13', purchaseOrderId: 'PC-2024-001' },
    { id: 'cot4', code: 'COT-2024-004', status: 'sent', createdAt: '2024-02-16', createdBy: 'Sistema', items: [{ productCode: 'MAT-015', productName: 'Bloco Aço 8620', quantity: 500, unit: 'kg' }, { productCode: 'ANL-001', productName: 'Anel de Retenção', quantity: 300, unit: 'un' }], supplierResponses: [], approvedBy: null, approvedAt: null, purchaseOrderId: null },
  ],
  // Pedidos de compra
  purchaseOrders: [
    { id: 'pc1', code: 'PC-2024-001', quotationId: 'cot3', supplierId: 'sup5', supplierName: 'AluminGmbH', items: [{ productCode: 'MAT-005', productName: 'Chapa Al 6061 3mm', quantity: 200, unit: 'kg', unitPrice: 18.75, totalPrice: 3750.00 }], totalValue: 3750.00, currency: 'EUR', isImport: true, status: 'in_transit', expectedDelivery: '2024-04-15', createdAt: '2024-02-13', createdBy: 'Carlos Silva', notes: 'Importação; Invoice: INV-2024-001' },
    { id: 'pc2', code: 'PC-2024-002', quotationId: null, supplierId: 'sup1', supplierName: 'Aços Nacionais', items: [{ productCode: 'MAT-001', productName: 'Barra Aço SAE 1045 Ø50', quantity: 50, unit: 'm', unitPrice: 48.50, totalPrice: 2425.00 }], totalValue: 2425.00, currency: 'BRL', isImport: false, status: 'delivered', expectedDelivery: '2024-02-10', createdAt: '2024-02-03', createdBy: 'Roberto Lima', notes: 'Entrega confirmada' },
  ],
  // Importações
  imports: [
    { id: 'imp1', code: 'IMP-2024-001', purchaseOrderId: 'pc1', supplierId: 'sup5', supplierName: 'Alumínio & Ligas GmbH', invoiceNumber: 'INV-2024-001', invoiceDate: '2024-02-13', invoiceValueUSD: 0, invoiceValueEUR: 3750.00, exchangeRate: 5.52, invoiceValueBRL: 20700.00, incoterm: 'CIF', portOfOrigin: 'Hamburg', portOfDestination: 'Santos', ncm: '7604.10.00', description: 'Chapa de Alumínio Liga 6061 espessura 3mm', netWeight: 200, grossWeight: 210, status: 'in_transit', expectedArrival: '2024-04-10',
      taxes: { ii: 12, ipi: 5, pis: 1.65, cofins: 7.6, icms: 12, afrmm: 25, siscomex: 185, taxBRL: 7420.00 },
      numerario: { invoiceBRL: 20700.00, freightBRL: 1500.00, insuranceBRL: 300.00, taxesBRL: 7420.00, brokerageBRL: 1200.00, portFeesBRL: 800.00, storageBRL: 400.00, totalLandedCostBRL: 32320.00, unitCostBRL: 161.60 },
      timeline: [
        { date: '2024-02-13', event: 'Invoice emitida', user: 'Carlos Silva' },
        { date: '2024-02-20', event: 'Embarque confirmado', user: 'Carlos Silva' },
        { date: '2024-03-25', event: 'Chegada prevista no porto', user: null },
        { date: '2024-04-10', event: 'Liberação alfandegária prevista', user: null },
      ]
    },
  ],
  chartData: {
    ordersPerWeek: [8, 12, 9, 15, 11, 14, 12],
    productionPerDay: [320, 480, 390, 520, 410, 550, 490],
    qualityPerWeek: [98.5, 97.2, 98.8, 99.1, 97.8, 98.4, 99.0],
    statusDistribution: { planned: 18, in_progress: 12, completed: 15, cancelled: 2 },
    capacityUtilization: { 'Planta Alpha': 78, 'Planta Beta': 62, 'Planta Gamma': 0 },
    stockStatus: { critical: 2, normal: 3, purchase_needed: 2, manufacture_needed: 1 }
  }
};
