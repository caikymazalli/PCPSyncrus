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
    { id: 'pr1', name: 'Tampa de Alumínio A200', code: 'TAM-A200', description: 'Tampa de fechamento em alumínio anodizado', unit: 'un', stockMin: 50, stockCurrent: 12, stockStatus: 'critical' },
    { id: 'pr2', name: 'Eixo Transmissão T500', code: 'EXT-T500', description: 'Eixo de transmissão em aço SAE 1045', unit: 'un', stockMin: 30, stockCurrent: 35, stockStatus: 'normal' },
    { id: 'pr3', name: 'Suporte Lateral SL100', code: 'SLT-SL100', description: 'Suporte lateral em chapa dobrada', unit: 'un', stockMin: 40, stockCurrent: 18, stockStatus: 'purchase_needed' },
    { id: 'pr4', name: 'Carcaça Motor CM300', code: 'CRC-CM300', description: 'Carcaça do motor em ferro fundido', unit: 'un', stockMin: 20, stockCurrent: 8, stockStatus: 'manufacture_needed' },
    { id: 'pr5', name: 'Engrenagem Cônica EC-45', code: 'ENG-EC45', description: 'Engrenagem cônica módulo 3, 45 dentes', unit: 'un', stockMin: 100, stockCurrent: 250, stockStatus: 'normal' },
    { id: 'pr6', name: 'Pino Elástico PE-12', code: 'PIN-PE12', description: 'Pino elástico DIN 1481, diâm 12mm', unit: 'un', stockMin: 200, stockCurrent: 5, stockStatus: 'critical' },
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
    { id: 'st1', code: 'MAT-001', name: 'Barra Aço SAE 1045 Ø50', unit: 'm', quantity: 80, minQuantity: 100, location: 'Armazém A - Prateleira 3', category: 'Matéria-Prima', lastUpdate: '2024-02-15', status: 'critical' },
    { id: 'st2', code: 'ROL-001', name: 'Rolamento 6205-2RS', unit: 'un', quantity: 250, minQuantity: 200, location: 'Armazém B - Caixa 12', category: 'Componente', lastUpdate: '2024-02-14', status: 'normal' },
    { id: 'st3', code: 'ANL-001', name: 'Anel de Retenção', unit: 'un', quantity: 180, minQuantity: 300, location: 'Armazém B - Caixa 15', category: 'Componente', lastUpdate: '2024-02-13', status: 'purchase_needed' },
    { id: 'st4', code: 'MAT-010', name: 'Lingote Ferro Fundido GG-25', unit: 'kg', quantity: 320, minQuantity: 200, location: 'Pátio Externo - Lote 2', category: 'Matéria-Prima', lastUpdate: '2024-02-15', status: 'normal' },
    { id: 'st5', code: 'PAR-001', name: 'Parafuso M8x25', unit: 'un', quantity: 1200, minQuantity: 500, location: 'Armazém C - Caixa 8', category: 'Fixador', lastUpdate: '2024-02-12', status: 'normal' },
    { id: 'st6', code: 'MAT-005', name: 'Chapa Al 6061 3mm', unit: 'kg', quantity: 200, minQuantity: 150, location: 'Armazém A - Prateleira 7', category: 'Matéria-Prima', lastUpdate: '2024-02-11', status: 'normal' },
    { id: 'st7', code: 'MAT-015', name: 'Bloco Aço 8620', unit: 'kg', quantity: 200, minQuantity: 400, location: 'Armazém A - Prateleira 5', category: 'Matéria-Prima', lastUpdate: '2024-02-10', status: 'purchase_needed' },
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
    { id: 'mrp1', productName: 'Eixo Transmissão T500', componentName: 'Barra Aço SAE 1045 Ø50', requiredQuantity: 200, availableQuantity: 80, shortfall: 120, suggestedAction: 'purchase', generatedAt: '2024-02-15', stockStatus: 'critical' },
    { id: 'mrp2', productName: 'Eixo Transmissão T500', componentName: 'Rolamento 6205-2RS', requiredQuantity: 400, availableQuantity: 250, shortfall: 150, suggestedAction: 'purchase', generatedAt: '2024-02-15', stockStatus: 'purchase_needed' },
    { id: 'mrp3', productName: 'Carcaça Motor CM300', componentName: 'Lingote Ferro Fundido GG-25', requiredQuantity: 500, availableQuantity: 320, shortfall: 180, suggestedAction: 'purchase', generatedAt: '2024-02-15', stockStatus: 'purchase_needed' },
    { id: 'mrp4', productName: 'Tampa de Alumínio A200', componentName: 'Chapa Al 6061 3mm', requiredQuantity: 150, availableQuantity: 200, shortfall: 0, suggestedAction: 'manufacture', generatedAt: '2024-02-15', stockStatus: 'normal' },
    { id: 'mrp5', productName: 'Engrenagem Cônica EC-45', componentName: 'Bloco Aço 8620', requiredQuantity: 800, availableQuantity: 200, shortfall: 600, suggestedAction: 'purchase', generatedAt: '2024-02-15', stockStatus: 'critical' },
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
