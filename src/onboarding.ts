// Onboarding page — new user registration (no demo data)
export function onboardingPage(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Criar Conta — PCP Planner</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .form-control { width: 100%; padding: 11px 14px; border: 1.5px solid #d1d5db; border-radius: 10px; font-size: 13px; outline: none; transition: border 0.2s; box-sizing: border-box; }
    .form-control:focus { border-color: #1B4F72; box-shadow: 0 0 0 3px rgba(27,79,114,0.1); }
    .form-label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; }
    .btn-primary { background: #1B4F72; color: white; padding: 13px; border-radius: 10px; font-size: 14px; font-weight: 700; border: none; cursor: pointer; width: 100%; transition: background 0.2s; }
    .btn-primary:hover { background: #154360; }
    .btn-primary:disabled { background: #93c5fd; cursor: not-allowed; }
    .grid-bg { background-color: #0f2d4a; background-image: linear-gradient(rgba(41,128,185,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(41,128,185,0.1) 1px, transparent 1px); background-size: 40px 40px; }
    .step-indicator { display: flex; align-items: center; gap: 0; margin-bottom: 28px; }
    .step-dot { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; transition: all 0.3s; flex-shrink: 0; }
    .step-line { flex: 1; height: 2px; background: #e5e7eb; }
    .step-dot.done { background: #1B4F72; color: white; }
    .step-dot.active { background: #2980B9; color: white; box-shadow: 0 0 0 4px rgba(41,128,185,0.2); }
    .step-dot.pending { background: #e5e7eb; color: #9ca3af; }
    .plan-card { border: 2px solid #e5e7eb; border-radius: 12px; padding: 18px; cursor: pointer; transition: all 0.2s; }
    .plan-card:hover { border-color: #93c5fd; background: #f8faff; }
    .plan-card.selected { border-color: #1B4F72; background: #f0f6ff; }
    .plan-card.selected .plan-check { display: flex; }
    .plan-check { display: none; width: 22px; height: 22px; border-radius: 50%; background: #1B4F72; color: white; align-items: center; justify-content: center; flex-shrink: 0; }
    .input-icon { position: relative; }
    .input-icon i { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: #9ca3af; font-size: 13px; }
    .input-icon .form-control { padding-left: 38px; }
    .error-msg { font-size: 11px; color: #dc2626; margin-top: 4px; display: none; }
    .error-msg.show { display: block; }
  </style>
</head>
<body>
  <div style="min-height:100vh;display:grid;grid-template-columns:420px 1fr;">
    <!-- Left panel - branding fixo -->
    <div class="grid-bg" style="display:flex;flex-direction:column;justify-content:center;align-items:center;padding:50px 40px;position:sticky;top:0;height:100vh;overflow:hidden;">
      <div style="position:relative;z-index:1;text-align:center;width:100%;">
        <div style="width:68px;height:68px;background:linear-gradient(135deg,#2980B9,#1B4F72);border-radius:18px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;box-shadow:0 16px 40px rgba(0,0,0,0.3);">
          <i class="fas fa-industry" style="color:white;font-size:28px;"></i>
        </div>
        <h1 style="font-size:28px;font-weight:900;color:white;margin:0 0 8px;">PCP Planner</h1>
        <p style="font-size:13px;color:rgba(255,255,255,0.55);margin:0 0 40px;line-height:1.6;">Plataforma SaaS para Programação e Controle da Produção Industrial</p>

        <!-- Benefícios do trial -->
        <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:22px;text-align:left;margin-bottom:24px;">
          <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;">Seu trial de 14 dias inclui</div>
          ${[
            { icon: 'fa-check-circle', text: 'Todos os módulos do plano selecionado' },
            { icon: 'fa-check-circle', text: 'Suporte técnico por e-mail' },
            { icon: 'fa-check-circle', text: 'Dados reais — nenhum dado fictício' },
            { icon: 'fa-check-circle', text: 'Sem cartão de crédito necessário' },
            { icon: 'fa-check-circle', text: 'Cancele a qualquer momento' },
          ].map(b => `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;">
            <i class="fas ${b.icon}" style="color:#4ade80;font-size:13px;flex-shrink:0;"></i>
            <span style="font-size:13px;color:rgba(255,255,255,0.8);">${b.text}</span>
          </div>`).join('')}
        </div>

        <!-- Social proof -->
        <div style="font-size:11px;color:rgba(255,255,255,0.35);text-align:center;">
          <i class="fas fa-shield-alt" style="color:rgba(255,255,255,0.3);margin-right:5px;"></i>
          Seus dados são criptografados e isolados por empresa
        </div>
      </div>
    </div>

    <!-- Right panel - formulário multi-step -->
    <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;padding:40px;background:white;min-height:100vh;overflow-y:auto;">
      <div style="width:100%;max-width:480px;">

        <!-- Steps indicator -->
        <div class="step-indicator">
          <div class="step-dot active" id="step1dot">1</div>
          <div class="step-line" id="line12"></div>
          <div class="step-dot pending" id="step2dot">2</div>
          <div class="step-line" id="line23"></div>
          <div class="step-dot pending" id="step3dot">3</div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#9ca3af;margin-top:-20px;margin-bottom:28px;">
          <span>Sua conta</span>
          <span style="margin-left:32px;">Empresa</span>
          <span>Plano</span>
        </div>

        <!-- ─── STEP 1: Dados pessoais ─────────────────────────────── -->
        <div id="step1">
          <div style="margin-bottom:24px;">
            <h2 style="font-size:24px;font-weight:800;color:#1A1A2E;margin:0 0 6px;">Crie sua conta</h2>
            <p style="font-size:13px;color:#6c757d;margin:0;">Comece sua jornada com 14 dias grátis</p>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
            <div>
              <label class="form-label">Nome *</label>
              <input class="form-control" type="text" id="s1_nome" placeholder="João">
              <div class="error-msg" id="err_nome">Nome obrigatório</div>
            </div>
            <div>
              <label class="form-label">Sobrenome *</label>
              <input class="form-control" type="text" id="s1_sobrenome" placeholder="Silva">
              <div class="error-msg" id="err_sob">Sobrenome obrigatório</div>
            </div>
          </div>

          <div style="margin-bottom:14px;">
            <label class="form-label">E-mail corporativo *</label>
            <div class="input-icon">
              <i class="fas fa-envelope"></i>
              <input class="form-control" type="email" id="s1_email" placeholder="voce@empresa.com.br" oninput="validateEmail()">
            </div>
            <div class="error-msg" id="err_email">E-mail inválido</div>
          </div>

          <div style="margin-bottom:14px;">
            <label class="form-label">Telefone / WhatsApp</label>
            <div class="input-icon">
              <i class="fas fa-phone"></i>
              <input class="form-control" type="tel" id="s1_tel" placeholder="(00) 00000-0000" oninput="maskPhone(this)">
            </div>
          </div>

          <div style="margin-bottom:24px;">
            <label class="form-label">Senha *</label>
            <div class="input-icon" style="position:relative;">
              <i class="fas fa-lock"></i>
              <input class="form-control" type="password" id="s1_senha" placeholder="Mínimo 8 caracteres" oninput="checkPwd()">
              <button type="button" onclick="togglePwd('s1_senha','eyeIcon1')" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#9ca3af;">
                <i class="fas fa-eye" id="eyeIcon1"></i>
              </button>
            </div>
            <!-- Password strength -->
            <div style="margin-top:8px;">
              <div style="display:flex;gap:4px;">
                <div style="flex:1;height:3px;border-radius:2px;background:#e5e7eb;" id="pbar1"></div>
                <div style="flex:1;height:3px;border-radius:2px;background:#e5e7eb;" id="pbar2"></div>
                <div style="flex:1;height:3px;border-radius:2px;background:#e5e7eb;" id="pbar3"></div>
                <div style="flex:1;height:3px;border-radius:2px;background:#e5e7eb;" id="pbar4"></div>
              </div>
              <div style="font-size:10px;color:#9ca3af;margin-top:4px;" id="pwdStrengthLabel">Use letras, números e símbolos</div>
            </div>
            <div class="error-msg" id="err_senha">Mínimo de 8 caracteres</div>
          </div>

          <button type="button" class="btn-primary" onclick="goStep2()">
            <i class="fas fa-arrow-right" style="margin-right:8px;"></i>Continuar
          </button>

          <div style="margin-top:20px;text-align:center;">
            <span style="font-size:13px;color:#6c757d;">Já tem conta? </span>
            <a href="/login" style="font-size:13px;color:#2980B9;font-weight:700;text-decoration:none;">Fazer login</a>
          </div>
        </div>

        <!-- ─── STEP 2: Dados da empresa ───────────────────────────── -->
        <div id="step2" style="display:none;">
          <div style="margin-bottom:24px;">
            <h2 style="font-size:24px;font-weight:800;color:#1A1A2E;margin:0 0 6px;">Sua empresa</h2>
            <p style="font-size:13px;color:#6c757d;margin:0;">Essas informações configuram sua conta</p>
          </div>

          <div style="margin-bottom:14px;">
            <label class="form-label">Razão Social / Nome da empresa *</label>
            <input class="form-control" type="text" id="s2_empresa" placeholder="Ex: Metalúrgica XYZ Ltda">
            <div class="error-msg" id="err_empresa">Nome da empresa obrigatório</div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
            <div>
              <label class="form-label">CNPJ</label>
              <input class="form-control" type="text" id="s2_cnpj" placeholder="00.000.000/0001-00" oninput="maskCNPJ(this)" maxlength="18">
            </div>
            <div>
              <label class="form-label">Setor / Indústria *</label>
              <select class="form-control" id="s2_setor">
                <option value="">Selecione...</option>
                <option>Metalúrgica / Siderurgia</option>
                <option>Automotivo</option>
                <option>Alimentos e Bebidas</option>
                <option>Têxtil / Confecção</option>
                <option>Eletroeletrônico</option>
                <option>Plástico / Borracha</option>
                <option>Construção Civil</option>
                <option>Móveis e Madeira</option>
                <option>Químico / Farmacêutico</option>
                <option>Outros</option>
              </select>
              <div class="error-msg" id="err_setor">Selecione o setor</div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
            <div>
              <label class="form-label">Número de funcionários *</label>
              <select class="form-control" id="s2_porte">
                <option value="">Selecione...</option>
                <option value="micro">Até 10</option>
                <option value="pequena">11 a 50</option>
                <option value="media">51 a 200</option>
                <option value="grande">Acima de 200</option>
              </select>
              <div class="error-msg" id="err_porte">Campo obrigatório</div>
            </div>
            <div>
              <label class="form-label">Nº de plantas/unidades</label>
              <select class="form-control" id="s2_plantas">
                <option value="1">1 planta</option>
                <option value="2">2 plantas</option>
                <option value="3">3 plantas</option>
                <option value="5+">5 ou mais</option>
              </select>
            </div>
          </div>

          <div style="margin-bottom:24px;">
            <label class="form-label">Principal desafio que busca resolver</label>
            <select class="form-control" id="s2_desafio">
              <option value="">Selecione (opcional)</option>
              <option>Controle de ordens de produção</option>
              <option>Planejamento de materiais (MRP)</option>
              <option>Rastreabilidade de produtos</option>
              <option>Controle de estoque</option>
              <option>Gestão de compras e suprimentos</option>
              <option>Qualidade e não conformidades</option>
              <option>Integração entre setores</option>
            </select>
          </div>

          <div style="display:flex;gap:12px;">
            <button type="button" onclick="goStep1()" style="padding:13px 20px;border:2px solid #e5e7eb;border-radius:10px;background:white;color:#374151;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;">
              <i class="fas fa-arrow-left"></i>
            </button>
            <button type="button" class="btn-primary" onclick="goStep3()" style="flex:1;">
              <i class="fas fa-arrow-right" style="margin-right:8px;"></i>Continuar
            </button>
          </div>
        </div>

        <!-- ─── STEP 3: Escolha do plano ───────────────────────────── -->
        <div id="step3" style="display:none;">
          <div style="margin-bottom:24px;">
            <h2 style="font-size:24px;font-weight:800;color:#1A1A2E;margin:0 0 6px;">Escolha seu plano</h2>
            <p style="font-size:13px;color:#6c757d;margin:0;">Todos os planos incluem 14 dias de trial gratuito</p>
          </div>

          <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:24px;">
            <!-- Starter -->
            <div class="plan-card selected" id="plan_starter" onclick="selectPlan('starter')">
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="flex:1;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <span style="font-size:14px;font-weight:800;color:#27AE60;">Starter</span>
                    <span style="font-size:10px;font-weight:700;background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:12px;">MAIS POPULAR</span>
                  </div>
                  <div style="font-size:22px;font-weight:900;color:#1A1A2E;">R$ 299<span style="font-size:13px;font-weight:500;color:#9ca3af;">/mês</span></div>
                  <div style="font-size:11px;color:#6c757d;margin-top:4px;">Até 10 usuários · 1 empresa · módulos essenciais</div>
                </div>
                <div class="plan-check"><i class="fas fa-check" style="font-size:10px;"></i></div>
              </div>
            </div>

            <!-- Professional -->
            <div class="plan-card" id="plan_professional" onclick="selectPlan('professional')">
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="flex:1;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <span style="font-size:14px;font-weight:800;color:#2980B9;">Professional</span>
                  </div>
                  <div style="font-size:22px;font-weight:900;color:#1A1A2E;">R$ 599<span style="font-size:13px;font-weight:500;color:#9ca3af;">/mês</span></div>
                  <div style="font-size:11px;color:#6c757d;margin-top:4px;">Até 25 usuários · 3 empresas · todos os módulos</div>
                </div>
                <div class="plan-check"><i class="fas fa-check" style="font-size:10px;"></i></div>
              </div>
            </div>

            <!-- Enterprise -->
            <div class="plan-card" id="plan_enterprise" onclick="selectPlan('enterprise')">
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="flex:1;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <span style="font-size:14px;font-weight:800;color:#7c3aed;">Enterprise</span>
                    <span style="font-size:10px;font-weight:700;background:#f5f3ff;color:#7c3aed;padding:2px 8px;border-radius:12px;">SOB CONSULTA</span>
                  </div>
                  <div style="font-size:22px;font-weight:900;color:#1A1A2E;">R$ 1.490<span style="font-size:13px;font-weight:500;color:#9ca3af;">/mês</span></div>
                  <div style="font-size:11px;color:#6c757d;margin-top:4px;">Usuários ilimitados · multi-empresa · suporte dedicado</div>
                </div>
                <div class="plan-check"><i class="fas fa-check" style="font-size:10px;"></i></div>
              </div>
            </div>
          </div>

          <!-- Aviso trial -->
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:10px;">
            <i class="fas fa-gift" style="color:#16a34a;font-size:18px;flex-shrink:0;"></i>
            <div>
              <div style="font-size:13px;font-weight:700;color:#15803d;">14 dias de trial sem cobrança</div>
              <div style="font-size:11px;color:#4ade80;">Sem cartão de crédito. Cancele a qualquer momento.</div>
            </div>
          </div>

          <div style="display:flex;gap:12px;">
            <button type="button" onclick="goStep2()" style="padding:13px 20px;border:2px solid #e5e7eb;border-radius:10px;background:white;color:#374151;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;">
              <i class="fas fa-arrow-left"></i>
            </button>
            <button type="button" class="btn-primary" id="createBtn" onclick="createAccount()" style="flex:1;">
              <i class="fas fa-rocket" style="margin-right:8px;"></i>Criar minha conta gratuita
            </button>
          </div>

          <!-- Mensagem de erro -->
          <div id="createError" style="display:none;margin-top:12px;padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:13px;color:#dc2626;text-align:center;"></div>

          <!-- Termos -->
          <div style="margin-top:16px;font-size:11px;color:#9ca3af;text-align:center;line-height:1.6;">
            Ao criar sua conta você concorda com os
            <a href="#" style="color:#2980B9;text-decoration:none;">Termos de Uso</a> e a
            <a href="#" style="color:#2980B9;text-decoration:none;">Política de Privacidade</a>
          </div>
        </div>

        <!-- ─── SUCCESS ─────────────────────────────────────────────── -->
        <div id="stepSuccess" style="display:none;text-align:center;">
          <div style="width:80px;height:80px;background:linear-gradient(135deg,#27AE60,#1B8A46);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;box-shadow:0 12px 30px rgba(39,174,96,0.3);">
            <i class="fas fa-check" style="color:white;font-size:32px;"></i>
          </div>
          <h2 style="font-size:26px;font-weight:800;color:#1A1A2E;margin:0 0 8px;">Conta criada!</h2>
          <p style="font-size:14px;color:#6c757d;margin:0 0 24px;" id="successMsg">Sua conta foi criada com sucesso. Bem-vindo ao PCP Planner!</p>

          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:20px;text-align:left;margin-bottom:24px;">
            <div style="font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;margin-bottom:12px;">Próximos passos</div>
            ${[
              { icon: 'fa-building', text: 'Configure sua empresa e unidades produtivas' },
              { icon: 'fa-cogs', text: 'Cadastre seus recursos e máquinas' },
              { icon: 'fa-boxes', text: 'Importe ou cadastre seus produtos e materiais' },
              { icon: 'fa-clipboard-list', text: 'Crie sua primeira ordem de produção' },
            ].map(s => `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <div style="width:26px;height:26px;background:white;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1px solid #86efac;flex-shrink:0;">
                <i class="fas ${s.icon}" style="color:#16a34a;font-size:11px;"></i>
              </div>
              <span style="font-size:13px;color:#374151;">${s.text}</span>
            </div>`).join('')}
          </div>

          <button onclick="enterApp()" class="btn-primary">
            <i class="fas fa-arrow-right" style="margin-right:8px;"></i>Acessar o PCP Planner
          </button>
        </div>

      </div>
    </div>
  </div>

  <script>
  let selectedPlan = 'starter';

  // ── Navegação entre steps ──────────────────────────────────────────────────
  function showStep(n) {
    ['step1','step2','step3','stepSuccess'].forEach((id,i) => {
      document.getElementById(id).style.display = (i+1 === n || (n===4 && id==='stepSuccess')) ? '' : 'none';
    });
    // atualizar dots
    for (let i = 1; i <= 3; i++) {
      const dot = document.getElementById('step' + i + 'dot');
      if (!dot) continue;
      dot.className = 'step-dot ' + (i < n ? 'done' : i === n ? 'active' : 'pending');
      dot.innerHTML = i < n ? '<i class="fas fa-check" style="font-size:10px;"></i>' : i;
    }
    ['line12','line23'].forEach((id, idx) => {
      const el = document.getElementById(id);
      if (el) el.style.background = (n > idx + 2) ? '#1B4F72' : '#e5e7eb';
    });
  }

  function goStep1() { showStep(1); }

  function goStep2() {
    // Validar step1
    let ok = true;
    if (!document.getElementById('s1_nome').value.trim()) { showErr('err_nome', true); ok = false; } else { showErr('err_nome', false); }
    if (!document.getElementById('s1_sobrenome').value.trim()) { showErr('err_sob', true); ok = false; } else { showErr('err_sob', false); }
    const emailVal = document.getElementById('s1_email').value.trim();
    if (!emailVal || !/^[^@]+@[^@]+\.[^@]+$/.test(emailVal)) { showErr('err_email', true); ok = false; } else { showErr('err_email', false); }
    if (document.getElementById('s1_senha').value.length < 8) { showErr('err_senha', true); ok = false; } else { showErr('err_senha', false); }
    if (!ok) return;
    showStep(2);
  }

  function goStep3() {
    // Validar step2
    let ok = true;
    if (!document.getElementById('s2_empresa').value.trim()) { showErr('err_empresa', true); ok = false; } else { showErr('err_empresa', false); }
    if (!document.getElementById('s2_setor').value) { showErr('err_setor', true); ok = false; } else { showErr('err_setor', false); }
    if (!document.getElementById('s2_porte').value) { showErr('err_porte', true); ok = false; } else { showErr('err_porte', false); }
    if (!ok) return;
    showStep(3);
  }

  async function createAccount() {
    const btn = document.getElementById('createBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Criando sua conta...';
    btn.disabled = true;

    const nome      = document.getElementById('s1_nome').value.trim();
    const sobrenome = document.getElementById('s1_sobrenome').value.trim();
    const email     = document.getElementById('s1_email').value.trim();
    const pwd       = document.getElementById('s1_senha').value;
    const empresa   = document.getElementById('s2_empresa').value.trim();
    const setor     = document.getElementById('s2_setor').value;
    const porte     = document.getElementById('s2_porte').value;
    const tel       = document.getElementById('s1_tel').value.trim();

    try {
      const res = await fetch('/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, sobrenome, email, pwd, empresa, setor, porte, tel, plano: selectedPlan }),
        credentials: 'include'
      });

      const data = await res.json();

      if (!data.ok) {
        btn.innerHTML = '<i class="fas fa-rocket" style="margin-right:8px;"></i>Criar minha conta gratuita';
        btn.disabled = false;
        const errDiv = document.getElementById('createError');
        if (errDiv) { errDiv.textContent = data.error || 'Erro ao criar conta. Tente novamente.'; errDiv.style.display = 'block'; }
        else { alert(data.error || 'Erro ao criar conta. Tente novamente.'); }
        return;
      }

      // Sucesso — mostrar tela de sucesso
      document.getElementById('successMsg').textContent =
        'Olá, ' + nome + '! Sua conta na empresa "' + empresa + '" foi criada com sucesso no plano ' +
        { starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise' }[selectedPlan] +
        '. Aproveite seus 14 dias gratuitos!';
      showStep(4);

      // Guardar redirect para o botão "Acessar"
      window._redirectUrl = data.redirect || '/novo?empresa=' + encodeURIComponent(empresa) + '&nome=' + encodeURIComponent(nome) + '&plano=' + selectedPlan;

    } catch(e) {
      btn.innerHTML = '<i class="fas fa-rocket" style="margin-right:8px;"></i>Criar minha conta gratuita';
      btn.disabled = false;
      alert('Erro de conexão. Verifique sua internet e tente novamente.');
    }
  }

  function enterApp() {
    // Usar URL retornada pelo servidor (com sessão já criada)
    window.location.href = window._redirectUrl || '/novo';
  }

  // ── Seleção de plano ──────────────────────────────────────────────────────
  function selectPlan(plan) {
    selectedPlan = plan;
    ['starter','professional','enterprise'].forEach(p => {
      const card = document.getElementById('plan_' + p);
      if (card) card.className = 'plan-card' + (p === plan ? ' selected' : '');
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function showErr(id, show) {
    const el = document.getElementById(id);
    if (el) { el.className = 'error-msg' + (show ? ' show' : ''); }
  }

  function validateEmail() {
    const val = document.getElementById('s1_email').value.trim();
    showErr('err_email', val.length > 0 && !/^[^@]+@[^@]+\.[^@]+$/.test(val));
  }

  function togglePwd(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (input.type === 'password') { input.type = 'text'; icon.className = 'fas fa-eye-slash'; }
    else { input.type = 'password'; icon.className = 'fas fa-eye'; }
  }

  function checkPwd() {
    const pwd = document.getElementById('s1_senha').value;
    const strength = [pwd.length >= 8, /[A-Z]/.test(pwd), /[0-9]/.test(pwd), /[^A-Za-z0-9]/.test(pwd)].filter(Boolean).length;
    const colors = ['#e5e7eb', '#ef4444', '#f59e0b', '#3b82f6', '#22c55e'];
    const labels = ['', 'Muito fraca', 'Fraca', 'Boa', 'Forte'];
    for (let i = 1; i <= 4; i++) {
      const bar = document.getElementById('pbar' + i);
      if (bar) bar.style.background = i <= strength ? colors[strength] : '#e5e7eb';
    }
    const lbl = document.getElementById('pwdStrengthLabel');
    if (lbl) { lbl.textContent = labels[strength] || 'Use letras, números e símbolos'; lbl.style.color = colors[strength]; }
  }

  function maskPhone(el) {
    let v = el.value.replace(/\D/g,'');
    if (v.length <= 10) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3');
    else v = v.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3');
    el.value = v.substring(0,15);
  }

  function maskCNPJ(el) {
    let v = el.value.replace(/\D/g,'');
    v = v.replace(/^(\d{2})(\d)/,'$1.$2');
    v = v.replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3');
    v = v.replace(/\.(\d{3})(\d)/,'.$1/$2');
    v = v.replace(/(\d{4})(\d)/,'$1-$2');
    el.value = v;
  }
  </script>
</body>
</html>`
}
