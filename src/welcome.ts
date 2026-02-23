// Welcome page — shown after successful onboarding
export function welcomePage(empresa: string, nome: string, plano: string): string {
  const planInfo: Record<string, { label: string; color: string; features: string[] }> = {
    starter: {
      label: 'Starter',
      color: '#27AE60',
      features: ['Ordens de Produção', 'Controle de Estoque', 'Qualidade', 'Planejamento básico']
    },
    professional: {
      label: 'Professional',
      color: '#2980B9',
      features: ['Todos os módulos Starter', 'MRP Avançado', 'Suprimentos e Importação', 'Engenharia']
    },
    enterprise: {
      label: 'Enterprise',
      color: '#7c3aed',
      features: ['Todos os módulos Professional', 'Multi-empresa', 'Suporte dedicado', 'API de integração']
    }
  }
  const pl = planInfo[plano] || planInfo.starter

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo ao PCP Planner</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F0F3F5; }
    @keyframes fadeInUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
    .fade-in { animation: fadeInUp 0.6s ease forwards; }
    .fade-in-delay { animation: fadeInUp 0.6s ease 0.3s forwards; opacity:0; }
    .fade-in-delay2 { animation: fadeInUp 0.6s ease 0.6s forwards; opacity:0; }
    .setup-card { background:white;border-radius:14px;padding:22px;border:1px solid #e9ecef;cursor:pointer;transition:all 0.2s;text-decoration:none;display:block; }
    .setup-card:hover { transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,0.1);border-color:#2980B9; }
  </style>
</head>
<body>
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px;">
    <div style="width:100%;max-width:720px;">

      <!-- Header com confetti -->
      <div class="fade-in" style="text-align:center;margin-bottom:40px;">
        <div style="font-size:60px;margin-bottom:16px;">🎉</div>
        <h1 style="font-size:32px;font-weight:900;color:#1A1A2E;margin:0 0 8px;">
          Bem-vindo ao PCP Planner${nome ? ', ' + nome : ''}!
        </h1>
        <p style="font-size:16px;color:#6c757d;margin:0;">
          Sua conta da empresa <strong style="color:#1B4F72;">${empresa}</strong> foi criada com sucesso.
        </p>
        <div style="margin-top:12px;display:inline-flex;align-items:center;gap:8px;background:#f0fdf4;border:1px solid #86efac;border-radius:20px;padding:6px 16px;">
          <i class="fas fa-clock" style="color:#16a34a;font-size:12px;"></i>
          <span style="font-size:13px;font-weight:700;color:#15803d;">14 dias de trial no plano ${pl.label} ativados</span>
        </div>
      </div>

      <!-- Card do plano -->
      <div class="fade-in-delay" style="background:white;border-radius:16px;padding:24px;margin-bottom:24px;border:2px solid ${pl.color};">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
          <div style="width:46px;height:46px;border-radius:12px;background:${pl.color};display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-box-open" style="color:white;font-size:18px;"></i>
          </div>
          <div>
            <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;">Plano ativo</div>
            <div style="font-size:20px;font-weight:800;color:${pl.color};">${pl.label}</div>
          </div>
          <div style="margin-left:auto;text-align:right;">
            <div style="font-size:11px;color:#9ca3af;">Trial expira em</div>
            <div style="font-size:14px;font-weight:700;color:#1B4F72;" id="trialExpiry">—</div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${pl.features.map(f => `
          <span style="font-size:11px;font-weight:600;padding:4px 12px;border-radius:20px;background:#f8f9fa;color:#374151;border:1px solid #e9ecef;">
            <i class="fas fa-check" style="color:${pl.color};margin-right:4px;font-size:9px;"></i>${f}
          </span>`).join('')}
        </div>
      </div>

      <!-- Configuração inicial -->
      <div class="fade-in-delay2">
        <div style="font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;">
          <i class="fas fa-map-signs" style="color:#2980B9;margin-right:6px;"></i>Por onde começar
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:30px;">
          <a class="setup-card" href="/recursos">
            <div style="width:40px;height:40px;border-radius:10px;background:#e8f4fd;display:flex;align-items:center;justify-content:center;margin-bottom:12px;">
              <i class="fas fa-cogs" style="color:#2980B9;font-size:16px;"></i>
            </div>
            <div style="font-size:14px;font-weight:700;color:#1A1A2E;margin-bottom:4px;">1. Recursos</div>
            <div style="font-size:12px;color:#6c757d;">Cadastre máquinas e centros de trabalho</div>
          </a>
          <a class="setup-card" href="/engenharia">
            <div style="width:40px;height:40px;border-radius:10px;background:#f5f3ff;display:flex;align-items:center;justify-content:center;margin-bottom:12px;">
              <i class="fas fa-drafting-compass" style="color:#7c3aed;font-size:16px;"></i>
            </div>
            <div style="font-size:14px;font-weight:700;color:#1A1A2E;margin-bottom:4px;">2. Produtos</div>
            <div style="font-size:12px;color:#6c757d;">Cadastre produtos e estruturas</div>
          </a>
          <a class="setup-card" href="/estoque">
            <div style="width:40px;height:40px;border-radius:10px;background:#f0fdf4;display:flex;align-items:center;justify-content:center;margin-bottom:12px;">
              <i class="fas fa-boxes" style="color:#16a34a;font-size:16px;"></i>
            </div>
            <div style="font-size:14px;font-weight:700;color:#1A1A2E;margin-bottom:4px;">3. Estoque</div>
            <div style="font-size:12px;color:#6c757d;">Configure itens e estoque inicial</div>
          </a>
          <a class="setup-card" href="/ordens">
            <div style="width:40px;height:40px;border-radius:10px;background:#fff7ed;display:flex;align-items:center;justify-content:center;margin-bottom:12px;">
              <i class="fas fa-clipboard-list" style="color:#ea580c;font-size:16px;"></i>
            </div>
            <div style="font-size:14px;font-weight:700;color:#1A1A2E;margin-bottom:4px;">4. Ordens</div>
            <div style="font-size:12px;color:#6c757d;">Crie sua primeira ordem de produção</div>
          </a>
        </div>

        <div style="text-align:center;">
          <a href="/" style="display:inline-flex;align-items:center;gap:10px;background:#1B4F72;color:white;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:700;text-decoration:none;transition:background 0.2s;" onmouseenter="this.style.background='#154360'" onmouseleave="this.style.background='#1B4F72'">
            <i class="fas fa-tachometer-alt"></i>
            Ir para o Dashboard
          </a>
          <div style="margin-top:12px;font-size:12px;color:#9ca3af;">
            Você pode configurar tudo isso depois pelo menu lateral
          </div>
        </div>
      </div>

    </div>
  </div>

  <script>
    // Calcular data de expiração do trial (14 dias a partir de hoje)
    const exp = new Date(Date.now() + 14 * 86400000);
    document.getElementById('trialExpiry').textContent = exp.toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
  </script>
</body>
</html>`
}
