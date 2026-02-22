import { Hono } from 'hono'
import { layout } from '../layout'

const app = new Hono()

app.get('/', (c) => {
  const plans = [
    {
      name: 'Starter',
      priceMonthly: 500,
      setupFee: 1000,
      period: '/mês',
      description: 'Ideal para pequenas empresas',
      color: '#27AE60',
      badge: null,
      features: [
        { ok: true, text: 'Até 3 usuários' },
        { ok: true, text: '1 planta fabril' },
        { ok: true, text: 'Ordens de Produção ilimitadas' },
        { ok: true, text: 'Apontamentos de Produção' },
        { ok: true, text: 'Gestão de Estoque básica' },
        { ok: true, text: 'Dashboard básico' },
        { ok: false, text: 'MRP (Planejamento de Materiais)' },
        { ok: false, text: 'Gráfico de Gantt' },
        { ok: false, text: 'Relatórios avançados' },
        { ok: false, text: 'Módulo de Qualidade / NC' },
      ]
    },
    {
      name: 'Professional',
      priceMonthly: 700,
      setupFee: 1500,
      period: '/mês',
      description: 'Para empresas em crescimento',
      color: '#1B4F72',
      badge: 'Mais Popular',
      features: [
        { ok: true, text: 'Até 10 usuários' },
        { ok: true, text: 'Plantas ilimitadas' },
        { ok: true, text: 'Ordens de Produção ilimitadas' },
        { ok: true, text: 'Apontamentos de Produção' },
        { ok: true, text: 'Dashboard completo com gráficos' },
        { ok: true, text: 'MRP (Planejamento de Materiais)' },
        { ok: true, text: 'Gráfico de Gantt' },
        { ok: true, text: 'Módulo de Qualidade / NC' },
        { ok: true, text: 'Instruções de Trabalho' },
        { ok: true, text: 'Gestão de Estoque completa' },
      ]
    },
    {
      name: 'Enterprise',
      priceMonthly: -1,  // sob consulta
      setupFee: -1,      // sob consulta
      period: '',
      description: 'Para grandes operações industriais',
      color: '#E67E22',
      badge: 'Customizado',
      features: [
        { ok: true, text: 'Usuários ilimitados' },
        { ok: true, text: 'Plantas ilimitadas' },
        { ok: true, text: 'Todos os módulos' },
        { ok: true, text: 'SLA garantido (99.9% uptime)' },
        { ok: true, text: 'Suporte dedicado 24/7' },
        { ok: true, text: 'Multi-empresa / Multi-CNPJ' },
        { ok: true, text: 'Relatórios customizados' },
        { ok: true, text: 'Onboarding assistido' },
      ]
    }
  ]

  const formatPrice = (val: number, annual: boolean) => {
    if (val < 0) return 'Sob consulta'
    const price = annual ? Math.round(val * 0.8) : val
    return `R$ ${price.toLocaleString('pt-BR')}`
  }

  const content = `
  <!-- Header Banner -->
  <div style="background:linear-gradient(135deg,#1B4F72,#2980B9);border-radius:16px;padding:32px;color:white;margin-bottom:32px;text-align:center;">
    <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:0.7;margin-bottom:8px;">Plano & Licença</div>
    <h2 style="margin:0 0 8px;font-size:28px;font-weight:800;">Escolha o plano ideal para sua operação</h2>
    <p style="margin:0;font-size:15px;opacity:0.7;">Comece com 14 dias gratuitos em qualquer plano • Cancele a qualquer momento</p>

    <!-- Trial status -->
    <div style="margin-top:20px;display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,0.15);border-radius:10px;padding:12px 20px;">
      <i class="fas fa-clock" style="color:#F39C12;font-size:18px;"></i>
      <div style="text-align:left;">
        <div style="font-size:12px;opacity:0.7;">Seu trial atual</div>
        <div style="font-size:14px;font-weight:700;">11 dias restantes — Acesso completo ao Professional</div>
      </div>
    </div>
  </div>

  <!-- Toggle Billing -->
  <div style="text-align:center;margin-bottom:32px;">
    <div style="display:inline-flex;background:#f1f3f5;border-radius:10px;padding:4px;gap:4px;">
      <button id="btnMonthly" onclick="setBilling('monthly')" style="padding:8px 20px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;background:#1B4F72;color:white;">Mensal</button>
      <button id="btnAnnual" onclick="setBilling('annual')" style="padding:8px 20px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;background:transparent;color:#374151;">
        Anual <span style="font-size:11px;background:#27AE60;color:white;padding:1px 6px;border-radius:4px;margin-left:4px;">-20%</span>
      </button>
    </div>
    <div id="annualSavingsBadge" style="display:none;margin-top:10px;">
      <span style="background:#dcfce7;color:#166534;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;">
        <i class="fas fa-piggy-bank" style="margin-right:6px;"></i>Economize 20% no plano anual!
      </span>
    </div>
  </div>

  <!-- Plans Grid -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;margin-bottom:40px;">
    ${plans.map((plan, i) => {
      const monthlyPrice = plan.priceMonthly < 0 ? 'Sob consulta' : `R$ ${plan.priceMonthly.toLocaleString('pt-BR')}`
      const annualPrice = plan.priceMonthly < 0 ? 'Sob consulta' : `R$ ${Math.round(plan.priceMonthly * 0.8).toLocaleString('pt-BR')}`
      const setupStr = plan.setupFee < 0 ? 'Setup: sob consulta' : `Setup: R$ ${plan.setupFee.toLocaleString('pt-BR')} (único)`
      return `
    <div class="card" style="padding:0;overflow:hidden;${plan.badge === 'Mais Popular' ? `border:2px solid ${plan.color};` : ''}">
      ${plan.badge ? `<div style="background:${plan.color};color:white;text-align:center;padding:6px;font-size:12px;font-weight:700;">${plan.badge === 'Mais Popular' ? '⭐ ' : ''}${plan.badge}</div>` : ''}
      <div style="padding:24px;">
        <div style="margin-bottom:16px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${plan.color};margin-bottom:6px;">${plan.name}</div>
          <div class="price-monthly" style="font-size:36px;font-weight:900;color:#1A1A2E;line-height:1;">
            ${monthlyPrice}<span style="font-size:14px;font-weight:400;color:#9ca3af;">${plan.priceMonthly > 0 ? plan.period : ''}</span>
          </div>
          <div class="price-annual" style="display:none;font-size:36px;font-weight:900;color:#1A1A2E;line-height:1;">
            ${annualPrice}<span style="font-size:14px;font-weight:400;color:#9ca3af;">${plan.priceMonthly > 0 ? plan.period : ''}</span>
          </div>
          ${plan.priceMonthly > 0 ? `
          <div style="font-size:12px;color:#6c757d;margin-top:6px;">
            <span class="setup-txt">${setupStr}</span>
          </div>
          <div class="annual-saving" style="display:none;font-size:12px;color:#27AE60;font-weight:600;margin-top:4px;">
            <i class="fas fa-tag"></i> Economia de R$ ${Math.round(plan.priceMonthly * 12 * 0.2).toLocaleString('pt-BR')}/ano
          </div>` : `<div style="font-size:12px;color:#6c757d;margin-top:6px;">Setup: sob consulta</div>`}
          <div style="font-size:13px;color:#6c757d;margin-top:6px;">${plan.description}</div>
        </div>

        <button onclick="alert('Ativando plano ${plan.name}!')" style="width:100%;padding:12px;border-radius:10px;border:none;cursor:pointer;font-size:14px;font-weight:700;margin-bottom:20px;background:${plan.badge === 'Mais Popular' ? plan.color : 'transparent'};color:${plan.badge === 'Mais Popular' ? 'white' : plan.color};${plan.badge !== 'Mais Popular' ? `border:2px solid ${plan.color};` : ''}" title="${plan.name === 'Enterprise' ? 'Falar com consultor' : 'Assinar plano ' + plan.name}">
          ${plan.priceMonthly < 0 ? 'Falar com Consultor' : (i === 1 ? 'Assinar Agora' : 'Começar Grátis')}
        </button>

        <div style="display:flex;flex-direction:column;gap:10px;">
          ${plan.features.map(f => `
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:18px;height:18px;border-radius:50%;background:${f.ok ? '#27AE60' : '#f1f3f5'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="fas ${f.ok ? 'fa-check' : 'fa-times'}" style="color:${f.ok ? 'white' : '#9ca3af'};font-size:9px;"></i>
            </div>
            <span style="font-size:13px;color:${f.ok ? '#374151' : '#9ca3af'};">${f.text}</span>
          </div>`).join('')}
        </div>
      </div>
    </div>`}).join('')}
  </div>

  <!-- Enterprise CTA Banner -->
  <div style="background:linear-gradient(135deg,#E67E22,#d35400);border-radius:16px;padding:28px 32px;color:white;margin-bottom:32px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
    <div>
      <div style="font-size:18px;font-weight:800;margin-bottom:6px;">Precisa de uma solução customizada?</div>
      <div style="font-size:14px;opacity:0.85;">O plano Enterprise é totalmente flexível — fale com nossa equipe para personalizar sua proposta.</div>
    </div>
    <button onclick="alert('Abrindo formulário de contato Enterprise...')" style="padding:12px 28px;background:white;color:#E67E22;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;" title="Solicitar proposta Enterprise">
      <i class="fas fa-phone" style="margin-right:8px;"></i>Falar com Consultor
    </button>
  </div>

  <!-- Current plan details -->
  <div class="card" style="padding:24px;margin-bottom:20px;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
      <div>
        <h3 style="margin:0 0 4px;font-size:17px;font-weight:700;color:#1B4F72;">Plano Atual: Trial Gratuito</h3>
        <div style="font-size:13px;color:#6c757d;">Iniciado em 07/02/2024 • Expira em 21/02/2024</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-secondary" onclick="alert('Gerenciando fatura...')" title="Ver faturas"><i class="fas fa-file-invoice"></i> Ver Faturas</button>
        <button class="btn btn-primary" onclick="alert('Abrindo checkout...')" title="Assinar agora"><i class="fas fa-rocket"></i> Assinar Agora</button>
      </div>
    </div>

    <div style="margin-top:20px;padding-top:20px;border-top:1px solid #f1f3f5;">
      <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:12px;">Limites do seu plano:</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
        ${[
          { label: 'Usuários', used: 4, limit: 1 },
          { label: 'Plantas', used: 3, limit: 1 },
          { label: 'Ordens/mês', used: 47, limit: 999 },
        ].map(l => `
        <div style="background:#f8f9fa;border-radius:8px;padding:12px;">
          <div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;margin-bottom:6px;">${l.label}</div>
          <div style="font-size:16px;font-weight:800;color:${l.used > l.limit ? '#E74C3C' : '#1B4F72'};">${l.used}<span style="font-size:12px;font-weight:400;color:#9ca3af;">/${l.limit === 999 ? '∞' : l.limit}</span></div>
          <div class="progress-bar" style="margin-top:6px;">
            <div class="progress-fill" style="width:${Math.min(100, (l.used/l.limit)*100)}%;background:${l.used > l.limit ? '#E74C3C' : '#27AE60'};"></div>
          </div>
        </div>`).join('')}
      </div>
    </div>
  </div>

  <!-- FAQ -->
  <div class="card" style="padding:24px;">
    <h3 style="font-size:17px;font-weight:700;color:#1B4F72;margin:0 0 20px;">Perguntas Frequentes</h3>
    <div style="display:flex;flex-direction:column;gap:16px;">
      ${[
        { q: 'Posso cancelar a qualquer momento?', a: 'Sim! Você pode cancelar sua assinatura a qualquer momento sem taxas de cancelamento.' },
        { q: 'O que inclui a taxa de setup?', a: 'A taxa de setup cobre a configuração inicial do sistema, importação de dados e treinamento básico via vídeo.' },
        { q: 'Os dados ficam salvos após o cancelamento?', a: 'Seus dados ficam disponíveis por 30 dias após o cancelamento para exportação.' },
        { q: 'Como funciona o desconto anual de 20%?', a: 'Ao optar pelo pagamento anual, você paga 20% menos por mês, com cobrança anual antecipada.' },
        { q: 'Como funciona o trial de 14 dias?', a: 'Você tem acesso completo ao plano Professional durante 14 dias sem precisar de cartão de crédito.' },
      ].map(faq => `
      <div style="border-bottom:1px solid #f1f3f5;padding-bottom:16px;">
        <div style="font-size:14px;font-weight:700;color:#374151;margin-bottom:6px;"><i class="fas fa-question-circle" style="color:#2980B9;margin-right:8px;"></i>${faq.q}</div>
        <div style="font-size:13px;color:#6c757d;padding-left:24px;">${faq.a}</div>
      </div>`).join('')}
    </div>
  </div>

  <script>
  let currentBilling = 'monthly';

  function setBilling(type) {
    currentBilling = type;
    const monthly = document.getElementById('btnMonthly');
    const annual = document.getElementById('btnAnnual');
    const annualBadge = document.getElementById('annualSavingsBadge');

    if (type === 'monthly') {
      monthly.style.background = '#1B4F72'; monthly.style.color = 'white';
      annual.style.background = 'transparent'; annual.style.color = '#374151';
      annualBadge.style.display = 'none';
      document.querySelectorAll('.price-monthly').forEach(el => el.style.display = 'block');
      document.querySelectorAll('.price-annual').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.annual-saving').forEach(el => el.style.display = 'none');
    } else {
      annual.style.background = '#1B4F72'; annual.style.color = 'white';
      monthly.style.background = 'transparent'; monthly.style.color = '#374151';
      annualBadge.style.display = 'block';
      document.querySelectorAll('.price-monthly').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.price-annual').forEach(el => el.style.display = 'block');
      document.querySelectorAll('.annual-saving').forEach(el => el.style.display = 'block');
    }
  }
  </script>
  `
  return c.html(layout('Plano & Licença', content, 'assinatura'))
})

export default app
