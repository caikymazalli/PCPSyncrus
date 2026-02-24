// Layout helper functions
export interface UserInfo {
  nome: string
  empresa: string
  plano: string
  isDemo: boolean
  role: string
  trialEnd?: string         // ISO date string
  ownerId?: string | null   // null/undefined = conta principal; preenchido = usuário convidado
}

export function layout(title: string, content: string, activePage: string = '', userInfo?: UserInfo) {
  // Compute display values from userInfo or use defaults
  const displayNome    = userInfo?.nome    || 'Usuário'
  const displayEmpresa = userInfo?.empresa || 'Minha Empresa'
  const displayPlano   = userInfo?.plano   || 'starter'
  const displayInitials = (userInfo?.nome || 'CS')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const displayRole = (() => {
    const r = userInfo?.role || 'admin'
    const map: Record<string,string> = { admin: 'Administrador', gestor_pcp: 'Gestor PCP', operador: 'Operador', viewer: 'Visualizador' }
    return map[r] || r
  })()
  // Trial days remaining
  let trialDias = 0
  let isTrialing = false
  if (userInfo?.trialEnd) {
    const diff = new Date(userInfo.trialEnd).getTime() - Date.now()
    trialDias = Math.max(0, Math.ceil(diff / 86400000))
    isTrialing = trialDias > 0
  }
  const planLabel: Record<string,string> = { starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise' }
  const trialBanner = (isTrialing || !userInfo)
    ? `<div style="margin:8px;padding:12px;background:rgba(230,126,34,0.15);border-radius:8px;border:1px solid rgba(230,126,34,0.3);"><div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;"><i class="fas fa-clock" style="color:#E67E22;font-size:13px;"></i><span style="font-size:12px;font-weight:700;color:#E67E22;">Trial ${planLabel[displayPlano]||displayPlano}: ${!userInfo ? 14 : trialDias} dias</span></div><div style="font-size:10px;color:rgba(230,126,34,0.8);margin-bottom:6px;">Sem cartão de crédito</div><a href="/assinatura" style="display:block;text-align:center;padding:6px;background:#E67E22;border-radius:6px;color:white;font-size:11px;font-weight:700;text-decoration:none;">Fazer Upgrade</a></div>`
    : '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — PCP Planner</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    :root {
      --primary: #1B4F72;
      --primary-light: #2980B9;
      --accent: #E67E22;
      --success: #27AE60;
      --warning: #F39C12;
      --danger: #E74C3C;
      --info: #3498DB;
      --bg: #F0F3F5;
      --surface: #FFFFFF;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); }
    .sidebar { width: 260px; height: 100vh; background: #0f2d4a; transition: transform 0.3s; position: fixed; left: 0; top: 0; z-index: 50; overflow: hidden; display: flex; flex-direction: column; }
    .sidebar-nav { flex: 1; overflow-y: auto; overflow-x: hidden; }
    .sidebar-nav::-webkit-scrollbar { width: 4px; }
    .sidebar-nav::-webkit-scrollbar-track { background: transparent; }
    .sidebar-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 4px; }
    .sidebar-nav::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.35); }
    .sidebar-footer { flex-shrink: 0; }
    .sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 40; }
    .main-content { margin-left: 260px; min-height: 100vh; }
    @media (max-width: 768px) {
      .sidebar { transform: translateX(-100%); }
      .sidebar.open { transform: translateX(0); }
      .sidebar-overlay.open { display: block; }
      .main-content { margin-left: 0; }
    }
    .nav-item { display: flex; align-items: center; padding: 10px 16px; color: rgba(255,255,255,0.7); border-radius: 8px; margin: 2px 8px; cursor: pointer; transition: all 0.2s; text-decoration: none; font-size: 14px; gap: 10px; }
    .nav-item:hover { background: rgba(255,255,255,0.1); color: white; }
    .nav-item.active { background: #2980B9; color: white; }
    .nav-item .icon { width: 20px; text-align: center; }
    .nav-section-title { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,0.35); padding: 16px 24px 6px; }
    .card { background: white; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .badge { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; gap: 4px; }
    .badge-success { background: #d4edda; color: #155724; }
    .badge-warning { background: #fff3cd; color: #856404; }
    .badge-danger { background: #f8d7da; color: #721c24; }
    .badge-info { background: #d1ecf1; color: #0c5460; }
    .badge-secondary { background: #e2e3e5; color: #383d41; }
    .badge-primary { background: #cce5ff; color: #004085; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none; text-decoration: none; }
    .btn-primary { background: #1B4F72; color: white; }
    .btn-primary:hover { background: #154360; }
    .btn-secondary { background: #f1f3f5; color: #333; border: 1px solid #dee2e6; }
    .btn-secondary:hover { background: #e9ecef; }
    .btn-danger { background: #E74C3C; color: white; }
    .btn-danger:hover { background: #c0392b; }
    .btn-success { background: #27AE60; color: white; }
    .btn-success:hover { background: #219a52; }
    .btn-warning { background: #F39C12; color: white; }
    .btn-warning:hover { background: #d68910; }
    .btn-sm { padding: 5px 10px; font-size: 12px; }
    .table-wrapper { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f8f9fa; padding: 10px 14px; text-align: left; font-weight: 600; color: #495057; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #dee2e6; }
    td { padding: 12px 14px; border-bottom: 1px solid #f1f3f5; color: #333; vertical-align: middle; }
    tr:hover td { background: #fafbfc; }
    .kpi-card { background: white; border-radius: 14px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .kpi-value { font-size: 32px; font-weight: 800; color: #1B4F72; line-height: 1; }
    .kpi-label { font-size: 12px; color: #6c757d; margin-top: 4px; font-weight: 500; }
    .kpi-trend { font-size: 12px; font-weight: 600; margin-top: 8px; }
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; align-items: center; justify-content: center; }
    .modal-overlay.open { display: flex; }
    .modal { background: white; border-radius: 16px; width: 90%; max-width: 560px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
    .form-control { width: 100%; padding: 10px 12px; border: 1.5px solid #d1d5db; border-radius: 8px; font-size: 13px; outline: none; transition: border 0.2s; box-sizing: border-box; }
    .form-control:focus { border-color: #2980B9; box-shadow: 0 0 0 3px rgba(41,128,185,0.1); }
    .sidebar-logo { padding: 20px 16px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .progress-bar { height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 4px; transition: width 0.5s; }
    .tab-nav { display: flex; gap: 4px; border-bottom: 2px solid #e9ecef; margin-bottom: 20px; }
    .tab-btn { padding: 8px 16px; font-size: 13px; font-weight: 600; color: #6c757d; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s; background: none; border-top: none; border-left: none; border-right: none; }
    .tab-btn.active { color: #1B4F72; border-bottom-color: #1B4F72; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .search-box { position: relative; }
    .search-box input { padding-left: 36px; }
    .search-box .icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #9ca3af; font-size: 14px; }
    .gantt-bar { height: 28px; border-radius: 4px; display: flex; align-items: center; padding: 0 8px; font-size: 11px; font-weight: 600; color: white; white-space: nowrap; overflow: hidden; }
    .breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #6c757d; margin-bottom: 4px; }
    .breadcrumb a { color: #2980B9; text-decoration: none; }
    .breadcrumb a:hover { text-decoration: underline; }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
    .section-title { font-size: 20px; font-weight: 700; color: #1B4F72; }
    .step-item { display: flex; gap: 12px; padding: 12px; background: #f8f9fa; border-radius: 8px; margin-bottom: 8px; }
    .step-number { width: 28px; height: 28px; border-radius: 50%; background: #1B4F72; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
    .priority-urgent { color: #dc2626; }
    .priority-high { color: #ea580c; }
    .priority-medium { color: #d97706; }
    .priority-low { color: #65a30d; }
    .timeline-row { display: flex; align-items: center; gap: 0; margin-bottom: 4px; }
    .timeline-label { width: 180px; font-size: 12px; color: #374151; font-weight: 500; flex-shrink: 0; padding-right: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .timeline-track { flex: 1; height: 32px; background: #f1f5f9; border-radius: 4px; position: relative; overflow: hidden; }
    .notification-dot { width: 8px; height: 8px; border-radius: 50%; background: #E74C3C; position: absolute; top: 4px; right: 4px; }
    .avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: white; flex-shrink: 0; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    /* Tooltips */
    [title]:not(a):not(.nav-item) { position: relative; }
    .tooltip-wrap { position: relative; display: inline-flex; }
    .tooltip-wrap::after { content: attr(data-tooltip); position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%); background: #1B4F72; color: white; font-size: 11px; white-space: nowrap; padding: 4px 8px; border-radius: 4px; pointer-events: none; opacity: 0; transition: opacity 0.15s; z-index: 9999; }
    .tooltip-wrap:hover::after { opacity: 1; }
    /* Stock status colors */
    .stock-critical { color: #dc2626; background: #fef2f2; }
    .stock-normal { color: #16a34a; background: #f0fdf4; }
    .stock-purchase { color: #d97706; background: #fffbeb; }
    .stock-manufacture { color: #7c3aed; background: #f5f3ff; }
  </style>
</head>
<body data-user-name="${displayNome}" data-user-empresa="${displayEmpresa}">
<!-- Sidebar Overlay -->
<div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>

<!-- Sidebar -->
<nav class="sidebar" id="sidebar">
  <div class="sidebar-logo">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:38px;height:38px;background:linear-gradient(135deg,#2980B9,#1B4F72);border-radius:10px;display:flex;align-items:center;justify-content:center;">
        <i class="fas fa-industry" style="color:white;font-size:18px;"></i>
      </div>
      <div>
        <div style="font-size:16px;font-weight:800;color:white;">PCP Planner</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.45);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;">${displayEmpresa}</div>
      </div>
    </div>
  </div>

  <!-- Filtro de Empresa/Grupo (visível para admins) -->
  <div id="sidebarEmpresaFilter" style="margin:10px 8px 0;padding:10px 12px;background:rgba(255,255,255,0.07);border-radius:8px;border:1px solid rgba(255,255,255,0.1);">
    <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:6px;">
      <i class="fas fa-filter" style="margin-right:4px;"></i>Visualizando
    </div>
    <select id="empresaFilterSelect" onchange="onEmpresaFilterChange()" style="width:100%;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:white;font-size:12px;font-weight:600;padding:6px 8px;cursor:pointer;outline:none;">
      <option value="all" style="background:#0f2d4a;color:white;">🏢 ${displayEmpresa}</option>
    </select>
    <div id="empresaFilterBadge" style="margin-top:6px;display:none;">
      <span style="font-size:10px;background:#27AE60;color:white;padding:2px 8px;border-radius:10px;font-weight:600;">
        <i class="fas fa-check" style="font-size:8px;margin-right:3px;"></i>
        <span id="empresaFilterLabel">Filtro ativo</span>
      </span>
      <button onclick="resetEmpresaFilter()" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:11px;cursor:pointer;margin-left:4px;" title="Limpar filtro">×</button>
    </div>
  </div>

  <div class="sidebar-nav">
  <div style="padding:12px 0;">
    <div class="nav-section-title">Principal</div>
    <a href="/" class="nav-item ${activePage === 'dashboard' ? 'active' : ''}">
      <span class="icon"><i class="fas fa-th-large"></i></span> Dashboard
    </a>

    <div class="nav-section-title">Produção</div>
    <a href="/ordens" class="nav-item ${activePage === 'ordens' ? 'active' : ''}" title="Ordens de Produção">
      <span class="icon"><i class="fas fa-clipboard-list"></i></span> Ordens de Produção
    </a>
    <a href="/apontamento" class="nav-item ${activePage === 'apontamento' ? 'active' : ''}" title="Apontamento de Produção">
      <span class="icon"><i class="fas fa-check-square"></i></span> Apontamento
    </a>

    <div class="nav-section-title">Qualidade</div>
    <a href="/qualidade" class="nav-item ${activePage === 'qualidade' ? 'active' : ''}" title="Não Conformidades — NC" style="position:relative;">
      <span class="icon"><i class="fas fa-clipboard-check"></i></span> Não Conformidades
    </a>

    <div class="nav-section-title">Planejamento</div>
    <a href="/planejamento" class="nav-item ${activePage === 'planejamento' ? 'active' : ''}" title="Planejamento MRP e Capacidade">
      <span class="icon"><i class="fas fa-calendar-alt"></i></span> Planejamento & MRP
    </a>
    <a href="/estoque" class="nav-item ${activePage === 'estoque' ? 'active' : ''}" title="Gestão de Estoque">
      <span class="icon"><i class="fas fa-warehouse"></i></span> Estoque
    </a>
    <a href="/engenharia" class="nav-item ${activePage === 'engenharia' ? 'active' : ''}" title="BOM e Roteiros de Produção">
      <span class="icon"><i class="fas fa-cogs"></i></span> Engenharia de Produto
    </a>
    <a href="/instrucoes" class="nav-item ${activePage === 'instrucoes' ? 'active' : ''}" title="Instruções de Trabalho">
      <span class="icon"><i class="fas fa-book-open"></i></span> Instruções de Trabalho
    </a>

    <div class="nav-section-title">Recursos</div>
    <a href="/recursos" class="nav-item ${activePage === 'recursos' ? 'active' : ''}" title="Plantas, Máquinas e Bancadas">
      <span class="icon"><i class="fas fa-tools"></i></span> Cadastros
    </a>
    <a href="/produtos" class="nav-item ${activePage === 'produtos' ? 'active' : ''}" title="Produtos e Estoque Mínimo">
      <span class="icon"><i class="fas fa-box"></i></span> Produtos
    </a>
    <a href="/cadastros" class="nav-item ${activePage === 'cadastros' ? 'active' : ''}" title="Fornecedores e Vínculos">
      <span class="icon"><i class="fas fa-truck"></i></span> Fornecedores
    </a>

    <div class="nav-section-title">Compras</div>
    <a href="/suprimentos" class="nav-item ${activePage === 'suprimentos' ? 'active' : ''}" title="Suprimentos, Cotações e Importações">
      <span class="icon"><i class="fas fa-shopping-cart"></i></span> Suprimentos
    </a>

    <div class="nav-section-title">Gestão</div>
    <a href="/admin" class="nav-item ${activePage === 'admin' ? 'active' : ''}" title="Administração de Usuários e Empresa">
      <span class="icon"><i class="fas fa-users-cog"></i></span> Administração
    </a>
    <a href="/assinatura" class="nav-item ${activePage === 'assinatura' ? 'active' : ''}" title="Planos e Licenças">
      <span class="icon"><i class="fas fa-credit-card"></i></span> Plano & Licença
    </a>
  </div>
  </div><!-- end sidebar-nav -->

  <div class="sidebar-footer">
  <!-- Trial Banner -->
  ${trialBanner}

  <!-- User info -->
  <div style="padding:12px 16px 16px;border-top:1px solid rgba(255,255,255,0.08);margin-top:auto;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div class="avatar" style="background:#2980B9;font-size:12px;">${displayInitials}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:white;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${displayNome}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.45);">${displayRole}</div>
      </div>
      <a href="/login" style="color:rgba(255,255,255,0.4);font-size:16px;" title="Sair">
        <i class="fas fa-sign-out-alt"></i>
      </a>
    </div>
    <!-- Master Admin link — dev only -->
    <a href="/master" title="Master Admin — Painel do Desenvolvedor" style="display:flex;align-items:center;gap:7px;margin-top:10px;padding:6px 10px;border-radius:7px;background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.22);text-decoration:none;transition:background 0.2s;" onmouseenter="this.style.background='rgba(124,58,237,0.22)'" onmouseleave="this.style.background='rgba(124,58,237,0.12)'" class="${activePage === 'master' ? 'active' : ''}">
      <i class="fas fa-shield-alt" style="color:#a78bfa;font-size:12px;flex-shrink:0;"></i>
      <span style="font-size:11px;font-weight:700;color:#c4b5fd;">Master Admin</span>
      <span style="margin-left:auto;font-size:9px;font-weight:700;background:rgba(124,58,237,0.3);color:#a78bfa;padding:1px 6px;border-radius:8px;">DEV</span>
    </a>
  </div>
  </div><!-- end sidebar-footer -->
</nav>

<!-- Main Content -->
<div class="main-content">
  <!-- Top Bar -->
  <div style="background:white;border-bottom:1px solid #e9ecef;padding:12px 24px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:30;">
    <button onclick="toggleSidebar()" style="display:none;background:none;border:none;font-size:20px;cursor:pointer;color:#374151;padding:4px;" class="mobile-menu-btn" id="mobileMenuBtn">
      <i class="fas fa-bars"></i>
    </button>
    <div style="flex:1;">
      <div class="breadcrumb">
        <a href="/">Início</a>
        <i class="fas fa-chevron-right" style="font-size:9px;"></i>
        <span>${title}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="font-size:18px;font-weight:700;color:#1B4F72;">${title}</div>
        <span id="topbarEmpresaBadge" style="display:none;background:#e8f4fd;color:#2980B9;font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;border:1px solid #bee3f8;">
          <i class="fas fa-building" style="font-size:9px;margin-right:3px;"></i>
          <span id="activeFilterInfo">Grupo</span>
        </span>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;">
      <button style="position:relative;background:none;border:none;cursor:pointer;color:#6c757d;font-size:18px;padding:6px;">
        <i class="fas fa-bell"></i>
        <span class="notification-dot"></span>
      </button>
      <button style="background:none;border:none;cursor:pointer;color:#6c757d;font-size:18px;padding:6px;">
        <i class="fas fa-question-circle"></i>
      </button>
    </div>
  </div>

  <!-- Page Content -->
  <div style="padding:24px;">
    ${content}
  </div>
</div>

<script>
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// Filtro de empresa/grupo
function onEmpresaFilterChange() {
  const sel = document.getElementById('empresaFilterSelect');
  const val = sel ? sel.value : 'all';
  const badge = document.getElementById('empresaFilterBadge');
  const label = document.getElementById('empresaFilterLabel');
  const optText = sel ? sel.options[sel.selectedIndex].text.replace(/^📍 |^🏢 /, '') : '';
  if (val === 'all') {
    if (badge) badge.style.display = 'none';
  } else {
    if (badge) badge.style.display = 'block';
    if (label) label.textContent = optText;
  }
  // Atualiza a versão do sub-header se existir
  const filterInfo = document.getElementById('activeFilterInfo');
  if (filterInfo) {
    filterInfo.textContent = val === 'all' ? 'Grupo — todas as empresas' : optText;
  }
  // Dispara evento customizado para as páginas reagirem
  window.dispatchEvent(new CustomEvent('empresaFilterChanged', { detail: { value: val, label: optText } }));
  // Atualiza badge na topbar
  const topBadge = document.getElementById('topbarEmpresaBadge');
  if (topBadge) topBadge.style.display = val === 'all' ? 'none' : 'inline-flex';
}

function resetEmpresaFilter() {
  const sel = document.getElementById('empresaFilterSelect');
  if (sel) { sel.value = 'all'; onEmpresaFilterChange(); }
}

// Mobile menu button visibility
if (window.innerWidth <= 768) {
  document.getElementById('mobileMenuBtn').style.display = 'block';
}
window.addEventListener('resize', () => {
  document.getElementById('mobileMenuBtn').style.display = window.innerWidth <= 768 ? 'block' : 'none';
});

// Tab switching
function switchTab(tabId, groupId) {
  const group = document.querySelector('[data-tab-group="' + groupId + '"]');
  if (!group) return;
  group.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  group.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

// Modal
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
</script>
</body>
</html>`;
}
