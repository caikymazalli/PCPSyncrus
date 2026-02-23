// New User Dashboard — empty state, no demo data
// Shown after onboarding registration
import { layout } from './layout'

export function newUserDashboard(empresa: string, nome: string, plano: string): string {
  const planInfo: Record<string, { label: string; color: string; bg: string }> = {
    starter:      { label: 'Starter',      color: '#27AE60', bg: '#f0fdf4' },
    professional: { label: 'Professional', color: '#2980B9', bg: '#e8f4fd' },
    enterprise:   { label: 'Enterprise',   color: '#7c3aed', bg: '#f5f3ff' },
  }
  const pl = planInfo[plano] || planInfo.starter

  const setupSteps = [
    {
      id: 'step1', num: '01', icon: 'fa-cogs', color: '#2980B9', bg: '#e8f4fd',
      title: 'Configure seus Recursos',
      desc: 'Cadastre máquinas, centros de trabalho e capacidade produtiva.',
      link: '/recursos', linkLabel: 'Ir para Recursos',
      estimated: '5-10 min', done: false
    },
    {
      id: 'step2', num: '02', icon: 'fa-drafting-compass', color: '#7c3aed', bg: '#f5f3ff',
      title: 'Cadastre seus Produtos',
      desc: 'Adicione produtos, estruturas de produto (BOM) e roteiros de fabricação.',
      link: '/engenharia', linkLabel: 'Ir para Engenharia',
      estimated: '10-20 min', done: false
    },
    {
      id: 'step3', num: '03', icon: 'fa-boxes', color: '#27AE60', bg: '#f0fdf4',
      title: 'Configure o Estoque',
      desc: 'Cadastre matérias-primas, componentes e defina estoques mínimos.',
      link: '/estoque', linkLabel: 'Ir para Estoque',
      estimated: '10-15 min', done: false
    },
    {
      id: 'step4', num: '04', icon: 'fa-truck', color: '#d97706', bg: '#fffbeb',
      title: 'Cadastre Fornecedores',
      desc: 'Adicione fornecedores nacionais e internacionais para compras e cotações.',
      link: '/cadastros', linkLabel: 'Ir para Cadastros',
      estimated: '5-10 min', done: false
    },
    {
      id: 'step5', num: '05', icon: 'fa-clipboard-list', color: '#ea580c', bg: '#fff7ed',
      title: 'Crie sua Primeira Ordem',
      desc: 'Com os dados configurados, crie e acompanhe ordens de produção em tempo real.',
      link: '/ordens', linkLabel: 'Ir para Ordens',
      estimated: '2-5 min', done: false
    },
  ]

  const content = `
  <style>
    .setup-card { background:white; border-radius:14px; border:2px solid #e9ecef; padding:22px 24px; transition:all 0.2s; }
    .setup-card:hover { border-color: #2980B9; box-shadow: 0 4px 20px rgba(41,128,185,0.12); transform:translateY(-2px); }
    .setup-card.done-card { border-color:#86efac; background:#f0fdf4; opacity:0.75; }
    .step-link { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; border-radius:8px; font-size:12px; font-weight:700; text-decoration:none; transition:all 0.2s; }
    .kpi-empty { background:white; border-radius:12px; padding:20px; border:2px dashed #e9ecef; text-align:center; }
    .welcome-banner { background:linear-gradient(135deg,#1B4F72,#2980B9); border-radius:16px; padding:28px 32px; margin-bottom:28px; position:relative; overflow:hidden; }
    .welcome-banner::before { content:''; position:absolute; width:300px; height:300px; background:rgba(255,255,255,0.05); border-radius:50%; top:-100px; right:-80px; }
    .welcome-banner::after  { content:''; position:absolute; width:200px; height:200px; background:rgba(255,255,255,0.04); border-radius:50%; bottom:-60px; right:60px; }
  </style>

  <!-- Banner de boas-vindas -->
  <div class="welcome-banner">
    <div style="position:relative;z-index:1;">
      <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            <span style="font-size:24px;">🎉</span>
            <span style="font-size:11px;font-weight:700;background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.9);padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Conta criada com sucesso</span>
          </div>
          <h1 style="font-size:24px;font-weight:900;color:white;margin:0 0 6px;">
            Bem-vindo${nome ? ', ' + nome : ''}! 👋
          </h1>
          <p style="font-size:14px;color:rgba(255,255,255,0.75);margin:0 0 16px;line-height:1.5;">
            ${empresa ? 'A empresa <strong style="color:white;">' + empresa + '</strong> foi criada.' : 'Sua conta foi criada.'} Configure o sistema seguindo os passos abaixo para começar a usar o PCP Planner.
          </p>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.1);border-radius:8px;padding:6px 14px;">
              <i class="fas fa-clock" style="color:#fbbf24;font-size:13px;"></i>
              <span style="font-size:12px;font-weight:700;color:white;">Trial: 14 dias restantes</span>
            </div>
            <span class="mbadge" style="background:${pl.bg};color:${pl.color};font-size:12px;font-weight:700;padding:6px 14px;border-radius:8px;">
              <i class="fas fa-box-open" style="margin-right:5px;"></i>${pl.label}
            </span>
          </div>
        </div>
        <div style="flex-shrink:0;text-align:right;">
          <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:4px;">Progresso da configuração</div>
          <div style="font-size:36px;font-weight:900;color:white;" id="progressPct">0%</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.5);">0 de ${setupSteps.length} etapas</div>
        </div>
      </div>
      <!-- Barra de progresso -->
      <div style="margin-top:16px;height:6px;background:rgba(255,255,255,0.15);border-radius:3px;overflow:hidden;">
        <div id="progressBar" style="height:100%;width:0%;background:linear-gradient(90deg,#4ade80,#22c55e);border-radius:3px;transition:width 0.4s ease;"></div>
      </div>
    </div>
  </div>

  <!-- KPIs vazios -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:28px;">
    ${[
      { icon:'fa-clipboard-list', label:'Ordens de Produção', color:'#1B4F72' },
      { icon:'fa-spinner',        label:'Em Progresso',       color:'#3498DB' },
      { icon:'fa-check-circle',   label:'Concluídas',         color:'#27AE60' },
      { icon:'fa-boxes',          label:'Itens no Estoque',   color:'#d97706' },
      { icon:'fa-exclamation-triangle', label:'Itens Críticos', color:'#E74C3C' },
    ].map(k => `
    <div class="kpi-empty">
      <div style="width:38px;height:38px;border-radius:10px;background:${k.color}15;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;">
        <i class="fas ${k.icon}" style="color:${k.color};font-size:16px;"></i>
      </div>
      <div style="font-size:26px;font-weight:900;color:#e9ecef;">—</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:4px;">${k.label}</div>
    </div>`).join('')}
  </div>

  <!-- Guia de configuração -->
  <div style="display:grid;grid-template-columns:1fr 340px;gap:20px;align-items:start;" class="setup-grid">

    <!-- Passos de configuração -->
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <div>
          <h2 style="font-size:16px;font-weight:800;color:#1A1A2E;margin:0 0 3px;">
            <i class="fas fa-map-signs" style="color:#2980B9;margin-right:8px;"></i>Guia de Configuração Inicial
          </h2>
          <p style="font-size:12px;color:#9ca3af;margin:0;">Siga os passos para ter o sistema funcionando com seus dados reais</p>
        </div>
        <button onclick="markAllDone()" style="font-size:11px;color:#9ca3af;border:1px solid #e9ecef;background:white;border-radius:6px;padding:5px 12px;cursor:pointer;">
          <i class="fas fa-check-double" style="margin-right:4px;"></i>Marcar todos como feito
        </button>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;" id="setupSteps">
        ${setupSteps.map((step, idx) => `
        <div class="setup-card" id="${step.id}" data-done="false">
          <div style="display:flex;align-items:flex-start;gap:16px;">
            <!-- Checkbox -->
            <button onclick="toggleStep('${step.id}')" style="width:26px;height:26px;border-radius:50%;border:2px solid #e9ecef;background:white;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;transition:all 0.2s;" id="${step.id}_check">
              <i class="fas fa-check" style="font-size:10px;color:transparent;" id="${step.id}_icon"></i>
            </button>
            <!-- Número -->
            <div style="width:36px;height:36px;border-radius:10px;background:${step.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="fas ${step.icon}" style="color:${step.color};font-size:14px;"></i>
            </div>
            <!-- Conteúdo -->
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;flex-wrap:wrap;">
                <span style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">${step.num}</span>
                <h3 style="font-size:14px;font-weight:700;color:#1A1A2E;margin:0;" id="${step.id}_title">${step.title}</h3>
              </div>
              <p style="font-size:12px;color:#6c757d;margin:0 0 12px;line-height:1.5;">${step.desc}</p>
              <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <a href="${step.link}" class="step-link" style="background:${step.color};color:white;">
                  <i class="fas fa-arrow-right" style="font-size:10px;"></i>${step.linkLabel}
                </a>
                <span style="font-size:11px;color:#9ca3af;"><i class="fas fa-clock" style="margin-right:4px;font-size:10px;"></i>${step.estimated}</span>
              </div>
            </div>
          </div>
        </div>`).join('')}
      </div>
    </div>

    <!-- Sidebar de ajuda -->
    <div style="position:sticky;top:20px;">
      <!-- Card trial -->
      <div style="background:white;border-radius:14px;padding:20px;border:1px solid #e9ecef;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
          <div style="width:36px;height:36px;border-radius:10px;background:#f0fdf4;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-gift" style="color:#16a34a;font-size:14px;"></i>
          </div>
          <div>
            <div style="font-size:13px;font-weight:700;color:#15803d;">Trial Ativo</div>
            <div style="font-size:11px;color:#9ca3af;">Plano ${pl.label}</div>
          </div>
        </div>
        <div style="background:#f0fdf4;border-radius:8px;padding:10px 12px;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;margin-bottom:4px;">Expira em</div>
          <div style="font-size:18px;font-weight:900;color:#16a34a;" id="trialExpiry">—</div>
        </div>
        <a href="/assinatura" style="display:block;text-align:center;padding:9px;background:#1B4F72;color:white;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;">
          <i class="fas fa-credit-card" style="margin-right:6px;"></i>Ver planos e assinar
        </a>
      </div>

      <!-- Atalhos rápidos -->
      <div style="background:white;border-radius:14px;padding:20px;border:1px solid #e9ecef;margin-bottom:14px;">
        <div style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;">Atalhos Rápidos</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${[
            { icon:'fa-users-cog', label:'Convidar usuários',       link:'/admin',      color:'#1B4F72' },
            { icon:'fa-building',  label:'Configurar empresa',       link:'/admin',      color:'#2980B9' },
            { icon:'fa-file-import', label:'Importar dados (CSV)',   link:'/estoque',    color:'#27AE60' },
            { icon:'fa-question-circle', label:'Central de ajuda',   link:'#',           color:'#9ca3af' },
          ].map(a => `
          <a href="${a.link}" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;background:#f8f9fa;text-decoration:none;transition:background 0.15s;" onmouseenter="this.style.background='#f1f3f5'" onmouseleave="this.style.background='#f8f9fa'">
            <i class="fas ${a.icon}" style="color:${a.color};font-size:13px;width:16px;text-align:center;"></i>
            <span style="font-size:13px;color:#374151;font-weight:500;">${a.label}</span>
            <i class="fas fa-chevron-right" style="color:#d1d5db;font-size:10px;margin-left:auto;"></i>
          </a>`).join('')}
        </div>
      </div>

      <!-- Ver dados demo -->
      <div style="background:#fef9eb;border:1px solid #fde68a;border-radius:12px;padding:16px;">
        <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:6px;">
          <i class="fas fa-eye" style="margin-right:5px;"></i>Quer ver o sistema funcionando?
        </div>
        <p style="font-size:12px;color:#b45309;margin:0 0 10px;line-height:1.4;">Acesse o ambiente de demonstração com dados fictícios para conhecer todas as funcionalidades.</p>
        <a href="/usar-demo" style="display:block;text-align:center;padding:8px;background:#F39C12;color:white;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;">
          <i class="fas fa-play" style="margin-right:5px;"></i>Abrir dados de demonstração
        </a>
      </div>
    </div>
  </div>

  <style>
    @media (max-width: 768px) {
      .setup-grid { grid-template-columns: 1fr !important; }
    }
  </style>

  <script>
  // ── Progress tracking ──────────────────────────────────────────────────────
  const TOTAL_STEPS = ${setupSteps.length};
  let doneCount = 0;

  // Restaurar estado salvo do localStorage
  ['step1','step2','step3','step4','step5'].forEach(id => {
    if (localStorage.getItem('setup_' + id) === '1') {
      markStepDone(id, false);
    }
  });

  function toggleStep(id) {
    const card = document.getElementById(id);
    if (!card) return;
    const isDone = card.dataset.done === 'true';
    if (isDone) {
      markStepUndone(id);
    } else {
      markStepDone(id, true);
    }
    updateProgress();
  }

  function markStepDone(id, save) {
    const card  = document.getElementById(id);
    const check = document.getElementById(id + '_check');
    const icon  = document.getElementById(id + '_icon');
    if (!card) return;
    card.dataset.done = 'true';
    card.classList.add('done-card');
    if (check) { check.style.background='#16a34a'; check.style.borderColor='#16a34a'; }
    if (icon)  { icon.style.color='white'; }
    if (save) localStorage.setItem('setup_' + id, '1');
  }

  function markStepUndone(id) {
    const card  = document.getElementById(id);
    const check = document.getElementById(id + '_check');
    const icon  = document.getElementById(id + '_icon');
    if (!card) return;
    card.dataset.done = 'false';
    card.classList.remove('done-card');
    if (check) { check.style.background='white'; check.style.borderColor='#e9ecef'; }
    if (icon)  { icon.style.color='transparent'; }
    localStorage.removeItem('setup_' + id);
  }

  function markAllDone() {
    ['step1','step2','step3','step4','step5'].forEach(id => markStepDone(id, true));
    updateProgress();
  }

  function updateProgress() {
    const done = document.querySelectorAll('[data-done="true"]').length;
    const pct = Math.round((done / TOTAL_STEPS) * 100);
    const bar = document.getElementById('progressBar');
    const pctEl = document.getElementById('progressPct');
    if (bar) bar.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
    document.querySelector('.welcome-banner div div div:last-child div:last-child').textContent = done + ' de ${setupSteps.length} etapas';
  }

  // Calcular data de expiração do trial
  const exp = new Date(Date.now() + 14 * 86400000);
  const expEl = document.getElementById('trialExpiry');
  if (expEl) expEl.textContent = exp.toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });

  // Atualizar progresso ao carregar
  updateProgress();
  </script>
  `

  return layout('Dashboard — PCP Planner', content, 'dashboard')
}
