import { Hono } from 'hono'
import { layout } from '../layout'

const app = new Hono()

// ── Mock data: clientes da plataforma ─────────────────────────────────────────
const masterClients = [
  {
    id: 'cli1', empresa: 'Metalúrgica Omega Ltda', fantasia: 'Omega Metais',
    cnpj: '12.345.678/0001-90', setor: 'Metalúrgica / Siderurgia', porte: 'Média',
    responsavel: 'Carlos Silva', email: 'carlos@omega.com.br', tel: '(16) 99123-4567',
    plano: 'professional', billing: 'monthly', valor: 599,
    status: 'active', trialStart: null, trialEnd: null,
    empresas: 2, usuarios: 14, plantas: 3,
    criadoEm: '2024-01-10', ultimoAcesso: '2024-02-20',
    modulos: ['Ordens','Planejamento','Estoque','Qualidade','Suprimentos','Engenharia'],
    cnpjsExtras: 1, pagamentos: [
      { mes: 'Fev/24', valor: 898.50, status: 'pago', data: '2024-02-05' },
      { mes: 'Jan/24', valor: 898.50, status: 'pago', data: '2024-01-05' },
    ],
    obs: ''
  },
  {
    id: 'cli2', empresa: 'Indústrias Delta S.A.', fantasia: 'Delta Ind.',
    cnpj: '98.765.432/0001-10', setor: 'Automotivo', porte: 'Grande',
    responsavel: 'Ana Beatriz Souza', email: 'ana@delta.com.br', tel: '(11) 98765-0001',
    plano: 'enterprise', billing: 'annual', valor: 1490,
    status: 'active', trialStart: null, trialEnd: null,
    empresas: 7, usuarios: 52, plantas: 5,
    criadoEm: '2023-09-01', ultimoAcesso: '2024-02-21',
    modulos: ['Ordens','Planejamento','Estoque','Qualidade','Suprimentos','Engenharia','Importação','Apontamento','Recursos'],
    cnpjsExtras: 6, pagamentos: [
      { mes: 'Anual 2024', valor: 17880, status: 'pago', data: '2024-01-02' },
      { mes: 'Anual 2023', valor: 14400, status: 'pago', data: '2023-01-15' },
    ],
    obs: 'Cliente estratégico — atendimento prioritário'
  },
  {
    id: 'cli3', empresa: 'Construtora Sigma Ltda', fantasia: 'Sigma Build',
    cnpj: '55.111.222/0001-33', setor: 'Construção Civil', porte: 'Pequena',
    responsavel: 'Roberto Alves', email: 'roberto@sigma.com.br', tel: '(21) 97654-3210',
    plano: 'starter', billing: 'trial', valor: 0,
    status: 'trial', trialStart: '2024-02-10', trialEnd: '2024-02-24',
    empresas: 1, usuarios: 3, plantas: 1,
    criadoEm: '2024-02-10', ultimoAcesso: '2024-02-19',
    modulos: ['Ordens','Estoque','Qualidade'],
    cnpjsExtras: 0, pagamentos: [],
    obs: 'Trial expirando em 24/02 — contato pendente'
  },
  {
    id: 'cli4', empresa: 'TechDrive Componentes', fantasia: 'TechDrive',
    cnpj: '44.222.333/0001-55', setor: 'Eletroeletrônico', porte: 'Pequena',
    responsavel: 'Juliana Matos', email: 'juliana@techdrive.com.br', tel: '(51) 96543-2109',
    plano: 'starter', billing: 'monthly', valor: 299,
    status: 'active', trialStart: null, trialEnd: null,
    empresas: 1, usuarios: 5, plantas: 1,
    criadoEm: '2024-01-20', ultimoAcesso: '2024-02-18',
    modulos: ['Ordens','Planejamento','Estoque','Qualidade','Suprimentos'],
    cnpjsExtras: 0, pagamentos: [
      { mes: 'Fev/24', valor: 299, status: 'pago', data: '2024-02-10' },
      { mes: 'Jan/24', valor: 299, status: 'pago', data: '2024-01-10' },
    ],
    obs: ''
  },
  {
    id: 'cli5', empresa: 'Automação Beta Ind. Ltda', fantasia: 'AutoBeta',
    cnpj: '33.777.888/0001-99', setor: 'Metalúrgica / Siderurgia', porte: 'Média',
    responsavel: 'Paulo Henrique Costa', email: 'paulo@autobeta.com.br', tel: '(47) 99876-5432',
    plano: 'professional', billing: 'annual', valor: 479,
    status: 'active', trialStart: null, trialEnd: null,
    empresas: 3, usuarios: 18, plantas: 2,
    criadoEm: '2023-11-15', ultimoAcesso: '2024-02-20',
    modulos: ['Ordens','Planejamento','Estoque','Qualidade','Suprimentos','Importação','Recursos'],
    cnpjsExtras: 2, pagamentos: [
      { mes: 'Anual 2024', valor: 5748, status: 'pago', data: '2024-01-15' },
    ],
    obs: ''
  },
  {
    id: 'cli6', empresa: 'Distribuidora Norte S.A.', fantasia: 'DistrNorte',
    cnpj: '22.888.999/0001-11', setor: 'Outros', porte: 'Pequena',
    responsavel: 'Marcos Lima', email: 'marcos@distrnorte.com.br', tel: '(91) 98899-7766',
    plano: 'starter', billing: 'trial', valor: 0,
    status: 'inactive', trialStart: '2024-01-25', trialEnd: '2024-02-08',
    empresas: 1, usuarios: 2, plantas: 1,
    criadoEm: '2024-01-25', ultimoAcesso: '2024-02-06',
    modulos: ['Ordens','Estoque'],
    cnpjsExtras: 0, pagamentos: [],
    obs: 'Trial expirado sem conversão — acompanhar'
  },
]

const PLANS: Record<string, { label: string; monthlyBase: number; color: string; bg: string }> = {
  starter:      { label: 'Starter',      monthlyBase: 299,  color: '#27AE60', bg: '#f0fdf4' },
  professional: { label: 'Professional', monthlyBase: 599,  color: '#2980B9', bg: '#e8f4fd' },
  enterprise:   { label: 'Enterprise',   monthlyBase: 1490, color: '#7c3aed', bg: '#f5f3ff' },
}

// ── Rota principal ─────────────────────────────────────────────────────────────
app.get('/', (c) => {
  const clients = masterClients

  // KPIs
  const totalClients    = clients.length
  const activeClients   = clients.filter(c => c.status === 'active').length
  const trialClients    = clients.filter(c => c.status === 'trial').length
  const inactiveClients = clients.filter(c => c.status === 'inactive').length
  const totalUsers      = clients.reduce((a, c) => a + c.usuarios, 0)
  const totalEmpresas   = clients.reduce((a, c) => a + c.empresas, 0)

  // MRR — receita mensal recorrente
  const mrr = clients.filter(c => c.status === 'active').reduce((acc, c) => {
    if (c.billing === 'annual') return acc + c.valor
    return acc + c.valor
  }, 0)
  const arr = mrr * 12

  const planDist: Record<string, number> = { starter: 0, professional: 0, enterprise: 0 }
  clients.forEach(c => { if (planDist[c.plano] !== undefined) planDist[c.plano]++ })

  const content = `
  <style>
    .master-kpi { background:white; border-radius:12px; padding:18px 20px; box-shadow:0 1px 4px rgba(0,0,0,0.07); }
    .client-row { transition: background 0.15s; }
    .client-row:hover { background: #f8f9fa !important; }
    .master-badge { display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;gap:4px; }
    .action-btn { background:none;border:1px solid #e9ecef;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.15s;display:inline-flex;align-items:center;gap:4px; }
    .action-btn:hover { background:#f1f3f5;border-color:#adb5bd; }
    .modal-overlay { display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:200;align-items:center;justify-content:center; }
    .modal-overlay.open { display:flex; }
    .modal { background:white;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.25);width:100%;animation:modalIn 0.25s ease; }
    @keyframes modalIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
    .tab-btn-m { padding:8px 16px;font-size:12px;font-weight:600;border:none;background:none;cursor:pointer;color:#6c757d;border-bottom:2px solid transparent; }
    .tab-btn-m.active { color:#1B4F72;border-color:#1B4F72; }
  </style>

  <!-- Header -->
  <div class="section-header">
    <div>
      <div style="font-size:13px;color:#6c757d;">Área restrita — acesso exclusivo do desenvolvedor</div>
      <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
        <span class="badge badge-success"><i class="fas fa-users" style="font-size:9px;"></i> ${activeClients} Ativos</span>
        <span class="badge badge-warning">${trialClients} Em Trial</span>
        <span class="badge badge-secondary">${inactiveClients} Inativos</span>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-secondary" onclick="exportClientCSV()"><i class="fas fa-file-csv"></i> Exportar CSV</button>
      <button class="btn btn-primary" onclick="openAddClientModal()"><i class="fas fa-plus"></i> Novo Cliente</button>
    </div>
  </div>

  <!-- KPIs principais -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:12px;margin-bottom:22px;">
    <div class="master-kpi" style="border-left:4px solid #27AE60;">
      <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Clientes Ativos</div>
      <div style="font-size:28px;font-weight:900;color:#27AE60;">${activeClients}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:4px;">de ${totalClients} totais</div>
    </div>
    <div class="master-kpi" style="border-left:4px solid #F39C12;">
      <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Em Trial</div>
      <div style="font-size:28px;font-weight:900;color:#d97706;">${trialClients}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:4px;">potencial de conversão</div>
    </div>
    <div class="master-kpi" style="border-left:4px solid #2980B9;">
      <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">MRR</div>
      <div style="font-size:22px;font-weight:900;color:#2980B9;">R$ ${mrr.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:4px;">receita mensal recorrente</div>
    </div>
    <div class="master-kpi" style="border-left:4px solid #1B4F72;">
      <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">ARR (anualizado)</div>
      <div style="font-size:18px;font-weight:900;color:#1B4F72;">R$ ${arr.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:4px;">receita anual recorrente</div>
    </div>
    <div class="master-kpi" style="border-left:4px solid #7c3aed;">
      <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Total Usuários</div>
      <div style="font-size:28px;font-weight:900;color:#7c3aed;">${totalUsers}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:4px;">${totalEmpresas} empresas cadastradas</div>
    </div>
    <div class="master-kpi">
      <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Distribuição de Planos</div>
      ${Object.entries(planDist).map(([plan, count]) => {
        const pl = PLANS[plan]
        const pct = totalClients > 0 ? Math.round((count/totalClients)*100) : 0
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
          <div style="font-size:11px;font-weight:700;color:${pl.color};width:72px;">${pl.label}</div>
          <div style="flex:1;height:6px;background:#e9ecef;border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${pl.color};border-radius:3px;"></div>
          </div>
          <div style="font-size:11px;color:#6c757d;width:20px;text-align:right;">${count}</div>
        </div>`
      }).join('')}
    </div>
  </div>

  <!-- Alertas de atenção -->
  ${clients.filter(c => c.status === 'trial').length > 0 ? `
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
    <i class="fas fa-exclamation-triangle" style="color:#d97706;font-size:18px;flex-shrink:0;"></i>
    <div style="flex:1;">
      <div style="font-size:13px;font-weight:700;color:#92400e;">${clients.filter(c => c.status === 'trial').length} cliente(s) em período de trial</div>
      <div style="font-size:12px;color:#b45309;">
        ${clients.filter(c => c.status === 'trial').map(c => {
          const daysLeft = c.trialEnd ? Math.ceil((new Date(c.trialEnd).getTime() - Date.now())/(1000*60*60*24)) : 0
          return `<span style="margin-right:12px;"><strong>${c.fantasia}</strong>: ${daysLeft > 0 ? daysLeft+' dias restantes' : 'EXPIRADO'}</span>`
        }).join('')}
      </div>
    </div>
    <button class="btn btn-sm" style="background:#F39C12;color:white;border:none;border-radius:6px;font-weight:700;padding:6px 14px;cursor:pointer;flex-shrink:0;" onclick="filterByStatus('trial')">
      <i class="fas fa-clock"></i> Ver trials
    </button>
  </div>` : ''}

  <!-- Tabela de clientes -->
  <div class="card" style="overflow:hidden;">
    <!-- Filtros -->
    <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <input type="text" id="searchClients" class="form-control" placeholder="Buscar cliente..." style="width:200px;font-size:12px;" oninput="filterClients()">
      <select class="form-control" id="filterStatus" style="width:130px;font-size:12px;" onchange="filterClients()">
        <option value="">Todos os status</option>
        <option value="active">Ativo</option>
        <option value="trial">Em Trial</option>
        <option value="inactive">Inativo</option>
      </select>
      <select class="form-control" id="filterPlano" style="width:140px;font-size:12px;" onchange="filterClients()">
        <option value="">Todos os planos</option>
        <option value="starter">Starter</option>
        <option value="professional">Professional</option>
        <option value="enterprise">Enterprise</option>
      </select>
      <div style="margin-left:auto;font-size:12px;color:#9ca3af;" id="clientCount">${clients.length} clientes</div>
    </div>

    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f8f9fa;border-bottom:2px solid #e9ecef;">
            <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Empresa</th>
            <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Responsável</th>
            <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Plano</th>
            <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Status</th>
            <th style="padding:10px 14px;text-align:right;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Valor/mês</th>
            <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Empresas</th>
            <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Usuários</th>
            <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Último acesso</th>
            <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;white-space:nowrap;">Ações</th>
          </tr>
        </thead>
        <tbody id="clientTableBody">
          ${clients.map((cli) => {
            const pl = PLANS[cli.plano] || PLANS.starter
            const statusMap: Record<string,{label:string,color:string,bg:string}> = {
              active:   { label:'Ativo',    color:'#16a34a', bg:'#f0fdf4' },
              trial:    { label:'Trial',    color:'#d97706', bg:'#fffbeb' },
              inactive: { label:'Inativo',  color:'#6c757d', bg:'#e9ecef' },
            }
            const st = statusMap[cli.status] || statusMap.inactive
            const daysLeft = cli.trialEnd
              ? Math.ceil((new Date(cli.trialEnd).getTime() - Date.now())/(1000*60*60*24))
              : null
            const billingLabel: Record<string,string> = { monthly:'Mensal', annual:'Anual', trial:'Trial' }

            return `
            <tr class="client-row" data-status="${cli.status}" data-plano="${cli.plano}" data-search="${cli.empresa.toLowerCase()} ${cli.responsavel.toLowerCase()} ${cli.email.toLowerCase()}" style="border-bottom:1px solid #f1f3f5;">
              <td style="padding:12px 14px;">
                <div style="font-weight:700;color:#1B4F72;">${cli.fantasia}</div>
                <div style="font-size:11px;color:#9ca3af;">${cli.empresa}</div>
                ${cli.obs ? `<div style="font-size:10px;color:#d97706;margin-top:2px;"><i class="fas fa-sticky-note" style="font-size:9px;"></i> ${cli.obs.slice(0,50)}${cli.obs.length>50?'...':''}</div>` : ''}
              </td>
              <td style="padding:12px 14px;">
                <div style="font-weight:600;color:#374151;">${cli.responsavel}</div>
                <div style="font-size:11px;color:#9ca3af;">${cli.email}</div>
              </td>
              <td style="padding:12px 14px;">
                <span class="master-badge" style="background:${pl.bg};color:${pl.color};">${pl.label}</span>
                <div style="font-size:10px;color:#9ca3af;margin-top:3px;">${billingLabel[cli.billing] || cli.billing}</div>
              </td>
              <td style="padding:12px 14px;text-align:center;">
                <span class="master-badge" style="background:${st.bg};color:${st.color};">${st.label}</span>
                ${cli.status === 'trial' ? `<div style="font-size:10px;color:${(daysLeft||0)<=3?'#dc2626':'#d97706'};margin-top:3px;font-weight:700;">${(daysLeft||0)>0?(daysLeft)+' dias':'EXPIRADO'}</div>` : ''}
              </td>
              <td style="padding:12px 14px;text-align:right;">
                <div style="font-weight:800;color:#1B4F72;">${cli.status==='trial'||cli.status==='inactive'?'R$ —':'R$ '+cli.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                ${cli.cnpjsExtras > 0 ? `<div style="font-size:10px;color:#9ca3af;">+${cli.cnpjsExtras} CNPJ extra</div>` : ''}
              </td>
              <td style="padding:12px 14px;text-align:center;font-weight:700;color:#374151;">${cli.empresas}</td>
              <td style="padding:12px 14px;text-align:center;font-weight:700;color:#374151;">${cli.usuarios}</td>
              <td style="padding:12px 14px;">
                <div style="font-size:12px;color:#374151;">${new Date(cli.ultimoAcesso+'T12:00:00').toLocaleDateString('pt-BR')}</div>
                <div style="font-size:10px;color:#9ca3af;">${cli.criadoEm ? 'desde '+new Date(cli.criadoEm+'T12:00:00').toLocaleDateString('pt-BR') : ''}</div>
              </td>
              <td style="padding:12px 14px;text-align:center;">
                <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap;">
                  <button class="action-btn" onclick="openClientDetail('${cli.id}')" title="Ver detalhes" style="color:#2980B9;"><i class="fas fa-eye"></i></button>
                  <button class="action-btn" onclick="openMigrateModal('${cli.id}')" title="Migrar plano" style="color:#7c3aed;border-color:#ddd6fe;background:#f5f3ff;"><i class="fas fa-exchange-alt"></i></button>
                  <button class="action-btn" onclick="openObsModal('${cli.id}')" title="Anotações" style="color:#d97706;"><i class="fas fa-sticky-note"></i></button>
                </div>
              </td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- ══ MODAIS ════════════════════════════════════════════════════════════════ -->

  <!-- Modal: Detalhes do Cliente -->
  <div class="modal-overlay" id="clientDetailModal">
    <div class="modal" style="max-width:680px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;">
      <div style="padding:18px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;" id="detailTitle"><i class="fas fa-building" style="margin-right:8px;"></i>Detalhes do Cliente</h3>
        <button onclick="closeMasterModal('clientDetailModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <!-- Sub-abas -->
      <div style="display:flex;gap:0;border-bottom:1px solid #e9ecef;padding:0 24px;background:#f8f9fa;flex-shrink:0;">
        <button class="tab-btn-m active" id="detTabInfo" onclick="switchDetTab('info')">Informações</button>
        <button class="tab-btn-m" id="detTabModulos" onclick="switchDetTab('modulos')">Módulos</button>
        <button class="tab-btn-m" id="detTabPagamentos" onclick="switchDetTab('pagamentos')">Pagamentos</button>
        <button class="tab-btn-m" id="detTabAtividade" onclick="switchDetTab('atividade')">Atividade</button>
      </div>
      <div style="padding:22px 24px;overflow-y:auto;flex:1;" id="detailBody"></div>
      <div style="padding:14px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
        <button onclick="openMigrateModal(window._currentClientId)" class="btn btn-sm" style="background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;font-weight:700;"><i class="fas fa-exchange-alt"></i> Migrar Plano</button>
        <button onclick="closeMasterModal('clientDetailModal')" class="btn btn-secondary">Fechar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Migrar / Ajustar Plano -->
  <div class="modal-overlay" id="migrateModal">
    <div class="modal" style="max-width:560px;">
      <div style="padding:18px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#7c3aed;"><i class="fas fa-exchange-alt" style="margin-right:8px;"></i>Migrar / Ajustar Plano</h3>
        <button onclick="closeMasterModal('migrateModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;" id="migrateBody"></div>
      <div style="padding:14px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeMasterModal('migrateModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="confirmarMigracao()" class="btn btn-primary" style="background:#7c3aed;"><i class="fas fa-check"></i> Confirmar Alteração</button>
      </div>
    </div>
  </div>

  <!-- Modal: Anotações -->
  <div class="modal-overlay" id="obsModal">
    <div class="modal" style="max-width:440px;">
      <div style="padding:18px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-sticky-note" style="margin-right:8px;"></i>Anotações do Cliente</h3>
        <button onclick="closeMasterModal('obsModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;" id="obsClientName"></div>
        <textarea class="form-control" id="obsText" rows="5" placeholder="Registre observações sobre este cliente: contatos, acordos, pendências..."></textarea>
      </div>
      <div style="padding:14px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeMasterModal('obsModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarObs()" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Novo Cliente Manual -->
  <div class="modal-overlay" id="addClientModal">
    <div class="modal" style="max-width:540px;">
      <div style="padding:18px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-plus" style="margin-right:8px;"></i>Adicionar Cliente Manualmente</h3>
        <button onclick="closeMasterModal('addClientModal')" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div style="grid-column:span 2;"><label class="form-label">Empresa *</label><input class="form-control" id="add_empresa" type="text" placeholder="Razão Social"></div>
        <div><label class="form-label">Responsável *</label><input class="form-control" id="add_resp" type="text"></div>
        <div><label class="form-label">E-mail *</label><input class="form-control" id="add_email" type="email"></div>
        <div><label class="form-label">Plano</label>
          <select class="form-control" id="add_plano">
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        <div><label class="form-label">Status inicial</label>
          <select class="form-control" id="add_status">
            <option value="trial">Trial</option>
            <option value="active">Ativo</option>
          </select>
        </div>
        <div style="grid-column:span 2;"><label class="form-label">Observações</label><textarea class="form-control" id="add_obs" rows="2"></textarea></div>
      </div>
      <div style="padding:14px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeMasterModal('addClientModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="salvarNovoCliente()" class="btn btn-primary"><i class="fas fa-save"></i> Adicionar</button>
      </div>
    </div>
  </div>

  <script>
  const masterClientsData = ${JSON.stringify(clients)};
  const plansData = ${JSON.stringify(PLANS)};
  let _currentClientId = null;
  let _currentDetTab = 'info';

  // ── Filtros ──────────────────────────────────────────────────────────────
  function filterClients() {
    const q = document.getElementById('searchClients').value.toLowerCase();
    const st = document.getElementById('filterStatus').value;
    const pl = document.getElementById('filterPlano').value;
    let count = 0;
    document.querySelectorAll('#clientTableBody tr').forEach(row => {
      const rowEl = row;
      const search = rowEl.dataset.search || '';
      const status = rowEl.dataset.status || '';
      const plano = rowEl.dataset.plano || '';
      const visible =
        (!q || search.includes(q)) &&
        (!st || status === st) &&
        (!pl || plano === pl);
      rowEl.style.display = visible ? '' : 'none';
      if (visible) count++;
    });
    document.getElementById('clientCount').textContent = count + ' clientes';
  }

  function filterByStatus(st) {
    document.getElementById('filterStatus').value = st;
    filterClients();
    document.getElementById('clientTableBody').scrollIntoView({behavior:'smooth'});
  }

  // ── Detalhes do cliente ──────────────────────────────────────────────────
  function openClientDetail(id) {
    const cli = masterClientsData.find(c => c.id === id);
    if (!cli) return;
    _currentClientId = id;
    window._currentClientId = id;
    document.getElementById('detailTitle').innerHTML = '<i class="fas fa-building" style="margin-right:8px;"></i>' + cli.fantasia;
    switchDetTab('info');
    openMasterModal('clientDetailModal');
  }

  function switchDetTab(tab) {
    _currentDetTab = tab;
    ['info','modulos','pagamentos','atividade'].forEach(t => {
      const btn = document.getElementById('detTab'+t.charAt(0).toUpperCase()+t.slice(1));
      if (btn) { btn.className = 'tab-btn-m' + (t===tab?' active':''); }
    });
    const cli = masterClientsData.find(c => c.id === _currentClientId);
    if (!cli) return;
    let html = '';
    const pl = plansData[cli.plano] || plansData.starter;
    const statusMap = { active:{label:'Ativo',color:'#16a34a',bg:'#f0fdf4'}, trial:{label:'Trial',color:'#d97706',bg:'#fffbeb'}, inactive:{label:'Inativo',color:'#6c757d',bg:'#e9ecef'} };
    const st = statusMap[cli.status] || statusMap.inactive;

    if (tab === 'info') {
      html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
        dRow('Empresa', cli.empresa) + dRow('Fantasia', cli.fantasia) +
        dRow('CNPJ', cli.cnpj) + dRow('Setor', cli.setor) +
        dRow('Porte', cli.porte) + dRow('Status', '<span class="master-badge" style="background:'+st.bg+';color:'+st.color+';">'+st.label+'</span>') +
        dRow('Responsável', cli.responsavel) + dRow('E-mail', '<a href="mailto:'+cli.email+'" style="color:#2980B9;">'+cli.email+'</a>') +
        dRow('Telefone', cli.tel || '—') + dRow('Plano', '<span class="master-badge" style="background:'+pl.bg+';color:'+pl.color+';">'+pl.label+'</span>') +
        dRow('Billing', {monthly:'Mensal',annual:'Anual',trial:'Trial'}[cli.billing] || cli.billing) +
        dRow('Valor/mês', cli.status==='active' ? 'R$ '+cli.valor.toLocaleString('pt-BR',{minimumFractionDigits:2}) : 'R$ —') +
        dRow('CNPJs extras', cli.cnpjsExtras.toString()) + dRow('Empresas', cli.empresas.toString()) +
        dRow('Usuários', cli.usuarios.toString()) + dRow('Plantas', cli.plantas.toString()) +
        dRow('Cliente desde', new Date(cli.criadoEm+'T12:00:00').toLocaleDateString('pt-BR')) +
        dRow('Último acesso', new Date(cli.ultimoAcesso+'T12:00:00').toLocaleDateString('pt-BR')) +
        '</div>';
      if (cli.obs) html += '<div style="margin-top:14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;"><div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;margin-bottom:4px;">Observações</div><div style="font-size:13px;color:#374151;">'+cli.obs+'</div></div>';
      if (cli.status === 'trial') {
        const daysLeft = cli.trialEnd ? Math.ceil((new Date(cli.trialEnd).getTime()-Date.now())/(1000*60*60*24)) : 0;
        html += '<div style="margin-top:14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;display:flex;align-items:center;gap:10px;">' +
          '<i class="fas fa-clock" style="color:#dc2626;font-size:20px;"></i>' +
          '<div><div style="font-size:13px;font-weight:700;color:#dc2626;">Trial: '+daysLeft+' dia(s) restantes</div>' +
          '<div style="font-size:11px;color:#9ca3af;">Expira em: '+cli.trialEnd+'</div></div>' +
          '<button onclick="openMigrateModal(\''+cli.id+'\');closeMasterModal(\'clientDetailModal\')" class="btn btn-sm" style="margin-left:auto;background:#7c3aed;color:white;border:none;font-weight:700;border-radius:6px;padding:6px 12px;cursor:pointer;"><i class="fas fa-exchange-alt"></i> Migrar Plano</button>' +
          '</div>';
      }
    } else if (tab === 'modulos') {
      html = '<div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:12px;">Módulos habilitados ('+cli.modulos.length+')</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
      const allMods = ['Ordens','Planejamento','Estoque','Qualidade','Suprimentos','Engenharia','Apontamento','Importação','Recursos'];
      allMods.forEach(m => {
        const on = cli.modulos.includes(m);
        html += '<span style="font-size:12px;font-weight:600;padding:6px 14px;border-radius:20px;background:'+(on?'#1B4F72':'#f1f3f5')+';color:'+(on?'white':'#9ca3af')+';"><i class="fas '+(on?'fa-check':'fa-times')+'" style="margin-right:5px;font-size:10px;"></i>'+m+'</span>';
      });
      html += '</div>';
    } else if (tab === 'pagamentos') {
      if (cli.pagamentos.length === 0) {
        html = '<div style="text-align:center;padding:24px;color:#9ca3af;"><i class="fas fa-receipt" style="font-size:32px;display:block;margin-bottom:8px;"></i>Nenhum pagamento registrado</div>';
      } else {
        html = '<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:#f8f9fa;"><th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Período</th><th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Valor</th><th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Status</th><th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;">Data</th></tr></thead><tbody>';
        cli.pagamentos.forEach((p: any) => {
          const sc = p.status==='pago' ? '#16a34a' : '#dc2626';
          const sb = p.status==='pago' ? '#f0fdf4' : '#fef2f2';
          html += '<tr style="border-bottom:1px solid #f1f3f5;"><td style="padding:10px 12px;font-weight:600;color:#374151;">'+p.mes+'</td><td style="padding:10px 12px;text-align:right;font-weight:700;color:#1B4F72;">R$ '+p.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})+'</td><td style="padding:10px 12px;text-align:center;"><span class="master-badge" style="background:'+sb+';color:'+sc+';">'+p.status+'</span></td><td style="padding:10px 12px;color:#6c757d;">'+p.data+'</td></tr>';
        });
        html += '</tbody></table>';
        const totalPago = cli.pagamentos.filter((p: any) => p.status==='pago').reduce((a: number, p: any) => a+p.valor, 0);
        html += '<div style="margin-top:12px;padding:10px 16px;background:#f0fdf4;border-radius:8px;display:flex;justify-content:space-between;"><span style="font-size:13px;font-weight:700;color:#15803d;">Total pago até hoje:</span><span style="font-size:15px;font-weight:800;color:#15803d;">R$ '+totalPago.toLocaleString('pt-BR',{minimumFractionDigits:2})+'</span></div>';
      }
    } else if (tab === 'atividade') {
      html = '<div style="display:flex;flex-direction:column;gap:0;">';
      const events = [
        { icon:'fa-user-plus', color:'#27AE60', desc:'Conta criada', date:cli.criadoEm, detail:'Onboarding concluído — plano '+pl.label },
        { icon:'fa-sign-in-alt', color:'#2980B9', desc:'Último acesso registrado', date:cli.ultimoAcesso, detail:'Usuário: '+cli.responsavel },
        ...(cli.status==='trial' ? [{ icon:'fa-clock', color:'#d97706', desc:'Trial ativo', date:cli.trialStart||cli.criadoEm, detail:'Expira em: '+cli.trialEnd }] : []),
        ...(cli.pagamentos.slice(0,3).map((p: any) => ({ icon:'fa-credit-card', color:'#1B4F72', desc:'Pagamento '+p.mes, date:p.data, detail:'R$ '+p.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})+' — '+p.status }))),
      ].sort((a,b) => b.date > a.date ? 1 : -1);
      events.forEach(ev => {
        html += '<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #f1f3f5;">' +
          '<div style="width:34px;height:34px;border-radius:50%;background:#f1f3f5;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas '+ev.icon+'" style="font-size:12px;color:'+ev.color+';"></i></div>' +
          '<div><div style="font-size:13px;font-weight:600;color:#374151;">'+ev.desc+'</div><div style="font-size:11px;color:#9ca3af;">'+new Date(ev.date+'T12:00:00').toLocaleDateString('pt-BR')+' · '+ev.detail+'</div></div></div>';
      });
      html += '</div>';
    }
    document.getElementById('detailBody').innerHTML = html;
  }

  function dRow(label: string, val: string) {
    return '<div style="background:#f8f9fa;border-radius:8px;padding:10px 12px;"><div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:3px;">'+label+'</div><div style="font-size:13px;color:#374151;font-weight:500;">'+val+'</div></div>';
  }

  // ── Migrar Plano ─────────────────────────────────────────────────────────
  function openMigrateModal(id: string) {
    const cli = masterClientsData.find((c: any) => c.id === id);
    if (!cli) return;
    _currentClientId = id;
    window._currentClientId = id;
    const pl = plansData[cli.plano];
    const today = new Date().toISOString().split('T')[0];
    const trialPlusMonth = new Date(Date.now() + 30*86400000).toISOString().split('T')[0];

    let html = '<div style="background:#f8f9fa;border-radius:10px;padding:14px;margin-bottom:18px;">' +
      '<div style="font-size:12px;color:#9ca3af;margin-bottom:2px;">Cliente</div>' +
      '<div style="font-size:15px;font-weight:700;color:#1B4F72;">'+cli.fantasia+'</div>' +
      '<div style="font-size:12px;color:#6c757d;">'+cli.responsavel+' · '+cli.email+'</div>' +
      '</div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">';

    // Tipo de ação
    html += '<div style="grid-column:span 2;"><label class="form-label">Tipo de Ação *</label>' +
      '<select class="form-control" id="mg_acao" onchange="onMgAcaoChange()">' +
      '<option value="change_plan">Migrar para outro plano</option>' +
      '<option value="extend_trial">Prorrogar período de trial</option>' +
      '<option value="activate">Ativar conta manualmente</option>' +
      '<option value="suspend">Suspender conta</option>' +
      '<option value="reactivate">Reativar conta suspensa</option>' +
      '</select></div>';

    // Novo plano
    html += '<div id="mg_planGroup"><label class="form-label">Novo Plano</label>' +
      '<select class="form-control" id="mg_plano">' +
      Object.entries(plansData).map(([k, v]: any) => '<option value="' + k + '" ' + (k===cli.plano?'selected':'') + '>' + v.label + ' \u2014 R$ ' + v.monthlyBase + '/m\u00eas</option>').join('') +
      '</select></div>';

    // Novo billing
    html += '<div id="mg_billingGroup"><label class="form-label">Cobrança</label>' +
      '<select class="form-control" id="mg_billing">' +
      '<option value="monthly" '+( cli.billing==='monthly'?'selected':'')+'">Mensal</option>' +
      '<option value="annual" '+(cli.billing==='annual'?'selected':'')+'>Anual (20% off)</option>' +
      '<option value="trial">Trial</option>' +
      '</select></div>';

    // Data de vigência
    html += '<div><label class="form-label">Vigência a partir de</label><input class="form-control" type="date" id="mg_inicio" value="'+today+'"></div>';

    // Dias de trial extra (hidden by default)
    html += '<div id="mg_trialGroup" style="display:none;grid-column:span 2;"><label class="form-label">Nova data de expiração do trial</label><input class="form-control" type="date" id="mg_trialEnd" value="'+trialPlusMonth+'"></div>';

    // Motivo
    html += '<div style="grid-column:span 2;"><label class="form-label">Motivo / Justificativa *</label><textarea class="form-control" id="mg_motivo" rows="2" placeholder="Ex: Solicitado pelo cliente via WhatsApp · Cortesia comercial · Atualização de contrato..."></textarea></div>';

    html += '</div>';

    // Aviso de impacto
    html += '<div style="margin-top:14px;background:#fff3cd;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;font-size:12px;color:#856404;">' +
      '<i class="fas fa-info-circle" style="margin-right:6px;"></i>' +
      '<strong>Atenção:</strong> Esta alteração é registrada no histórico de auditoria com seu usuário e data/hora. Em ambiente de produção, as alterações refletiriam imediatamente na conta do cliente.' +
      '</div>';

    document.getElementById('migrateBody').innerHTML = html;
    openMasterModal('migrateModal');
  }

  function onMgAcaoChange() {
    const acao = (document.getElementById('mg_acao') as HTMLSelectElement)?.value;
    const planGroup = document.getElementById('mg_planGroup');
    const billingGroup = document.getElementById('mg_billingGroup');
    const trialGroup = document.getElementById('mg_trialGroup');
    if (planGroup) planGroup.style.display = acao==='change_plan'||acao==='activate' ? '' : 'none';
    if (billingGroup) billingGroup.style.display = acao==='change_plan'||acao==='activate' ? '' : 'none';
    if (trialGroup) trialGroup.style.display = acao==='extend_trial' ? '' : 'none';
  }

  function confirmarMigracao() {
    const acao = (document.getElementById('mg_acao') as HTMLSelectElement)?.value;
    const motivo = (document.getElementById('mg_motivo') as HTMLTextAreaElement)?.value?.trim();
    if (!motivo) { alert('⚠️ Por favor informe o motivo da alteração.'); return; }

    const cli = masterClientsData.find((c: any) => c.id === _currentClientId);
    const acaoLabels: Record<string,string> = {
      change_plan:'Migração de plano', extend_trial:'Prorrogação de trial',
      activate:'Ativação manual', suspend:'Suspensão de conta', reactivate:'Reativação'
    };
    const novoPlano = (document.getElementById('mg_plano') as HTMLSelectElement)?.value;
    const novoBilling = (document.getElementById('mg_billing') as HTMLSelectElement)?.value;
    const novaData = (document.getElementById('mg_trialEnd') as HTMLInputElement)?.value;
    const vigencia = (document.getElementById('mg_inicio') as HTMLInputElement)?.value;

    let msg = '✅ Alteração registrada com sucesso!\\n\\n';
    msg += '📋 Tipo: ' + acaoLabels[acao] + '\\n';
    msg += '🏢 Cliente: ' + (cli?.fantasia||'—') + '\\n';
    if (acao==='change_plan') msg += '📦 Novo Plano: ' + (plansData[novoPlano]?.label||novoPlano) + ' (' + novoBilling + ')\\n';
    if (acao==='extend_trial') msg += '⏰ Novo fim do Trial: ' + novaData + '\\n';
    msg += '📅 Vigência: ' + vigencia + '\\n';
    msg += '💬 Motivo: ' + motivo + '\\n\\n';
    msg += '⚠️ Nota: Em produção com banco de dados, esta alteração seria aplicada imediatamente e registrada no log de auditoria.';

    alert(msg);
    closeMasterModal('migrateModal');
  }

  // ── Anotações ────────────────────────────────────────────────────────────
  function openObsModal(id: string) {
    const cli = masterClientsData.find((c: any) => c.id === id);
    if (!cli) return;
    _currentClientId = id;
    document.getElementById('obsClientName').textContent = cli.fantasia + ' — ' + cli.responsavel;
    (document.getElementById('obsText') as HTMLTextAreaElement).value = cli.obs || '';
    openMasterModal('obsModal');
  }

  function salvarObs() {
    const obs = (document.getElementById('obsText') as HTMLTextAreaElement)?.value?.trim();
    alert('✅ Anotação salva para o cliente!\\n\\n"'+obs+'"\\n\\nAtualizado em: '+new Date().toLocaleString('pt-BR'));
    closeMasterModal('obsModal');
  }

  // ── Novo Cliente ─────────────────────────────────────────────────────────
  function openAddClientModal() {
    openMasterModal('addClientModal');
  }

  function salvarNovoCliente() {
    const emp = (document.getElementById('add_empresa') as HTMLInputElement)?.value?.trim();
    const resp = (document.getElementById('add_resp') as HTMLInputElement)?.value?.trim();
    const email = (document.getElementById('add_email') as HTMLInputElement)?.value?.trim();
    if (!emp || !resp || !email) { alert('⚠️ Preencha os campos obrigatórios (Empresa, Responsável, E-mail).'); return; }
    alert('✅ Cliente adicionado manualmente!\\n\\n🏢 Empresa: '+emp+'\\n👤 Responsável: '+resp+'\\n📧 E-mail: '+email+'\\n\\nUm e-mail de boas-vindas será enviado com as credenciais de acesso.');
    closeMasterModal('addClientModal');
  }

  // ── Exportar CSV ─────────────────────────────────────────────────────────
  function exportClientCSV() {
    let csv = 'Empresa,Responsável,E-mail,Plano,Status,Valor/mês,Empresas,Usuários,Criado em,Último acesso\\n';
    masterClientsData.forEach((c: any) => {
      const pl = plansData[c.plano];
      csv += '"'+c.empresa+'","'+c.responsavel+'","'+c.email+'","'+(pl?.label||c.plano)+'","'+c.status+'","R$ '+c.valor.toFixed(2)+'","'+c.empresas+'","'+c.usuarios+'","'+c.criadoEm+'","'+c.ultimoAcesso+'"\\n';
    });
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download='clientes_pcpsyncrus.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Helpers de modal ────────────────────────────────────────────────────
  function openMasterModal(id: string) {
    const el = document.getElementById(id);
    if (el) { el.style.display='flex'; el.classList.add('open'); }
  }
  function closeMasterModal(id: string) {
    const el = document.getElementById(id);
    if (el) { el.style.display='none'; el.classList.remove('open'); }
  }
  // Fechar ao clicar fora
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', function(e) {
      if (e.target === el) closeMasterModal(el.id);
    });
  });
  </script>
  `

  return c.html(layout('Master Admin — PCP Planner', content, 'master'))
})

export default app
