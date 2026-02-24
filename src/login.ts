// Login page - no layout wrapper (standalone page)
export function loginPage(errorMsg?: string): string {
  const errHtml = errorMsg
    ? `<div id="loginError" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#dc2626;display:flex;align-items:center;gap:8px;">
        <i class="fas fa-exclamation-circle" style="flex-shrink:0;"></i>
        <span>${errorMsg}</span>
      </div>`
    : `<div id="loginError" style="display:none;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#dc2626;align-items:center;gap:8px;">
        <i class="fas fa-exclamation-circle" style="flex-shrink:0;"></i>
        <span id="loginErrorMsg"></span>
      </div>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login — PCP Planner</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .form-control { width: 100%; padding: 12px 16px; border: 1.5px solid #d1d5db; border-radius: 10px; font-size: 14px; outline: none; transition: border 0.2s; box-sizing: border-box; }
    .form-control:focus { border-color: #1B4F72; box-shadow: 0 0 0 3px rgba(27,79,114,0.1); }
    .btn-primary { background: #1B4F72; color: white; padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 700; border: none; cursor: pointer; width: 100%; transition: background 0.2s; }
    .btn-primary:hover { background: #154360; }
    .btn-primary:disabled { background: #93c5fd; cursor: not-allowed; }
    .grid-bg { background-color: #0f2d4a; background-image: linear-gradient(rgba(41,128,185,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(41,128,185,0.1) 1px, transparent 1px); background-size: 40px 40px; }
  </style>
</head>
<body>
  <div style="min-height:100vh;display:grid;grid-template-columns:1fr 1fr;">
    <!-- Left panel - branding -->
    <div class="grid-bg" style="display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;position:relative;overflow:hidden;">
      <!-- Decorative circles -->
      <div style="position:absolute;width:400px;height:400px;border-radius:50%;border:1px solid rgba(41,128,185,0.2);top:-100px;left:-100px;"></div>
      <div style="position:absolute;width:300px;height:300px;border-radius:50%;border:1px solid rgba(41,128,185,0.15);top:-50px;left:-50px;"></div>
      <div style="position:absolute;width:500px;height:500px;border-radius:50%;border:1px solid rgba(41,128,185,0.1);bottom:-200px;right:-200px;"></div>
      
      <div style="position:relative;z-index:1;text-align:center;max-width:400px;">
        <!-- Logo -->
        <div style="width:80px;height:80px;background:linear-gradient(135deg,#2980B9,#1B4F72);border-radius:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;box-shadow:0 20px 40px rgba(0,0,0,0.3);">
          <i class="fas fa-industry" style="color:white;font-size:36px;"></i>
        </div>
        <h1 style="font-size:36px;font-weight:900;color:white;margin:0 0 12px;letter-spacing:-1px;">PCP Planner</h1>
        <p style="font-size:16px;color:rgba(255,255,255,0.6);margin:0 0 48px;line-height:1.6;">Plataforma SaaS para Programação e Controle da Produção Industrial</p>
        
        <!-- Feature highlights -->
        <div style="display:flex;flex-direction:column;gap:16px;text-align:left;">
          ${[
            { icon: 'fa-clipboard-list', title: 'Gestão de Ordens', desc: 'Planejamento e controle completo de ordens de produção' },
            { icon: 'fa-chart-line', title: 'MRP Inteligente', desc: 'Planejamento de necessidades de materiais em tempo real' },
            { icon: 'fa-cogs', title: 'Recursos & Máquinas', desc: 'Controle de capacidade e disponibilidade de recursos' },
            { icon: 'fa-shield-alt', title: 'Multi-tenant Seguro', desc: 'Dados isolados por empresa com criptografia end-to-end' },
          ].map(f => `
          <div style="display:flex;align-items:center;gap:14px;background:rgba(255,255,255,0.06);border-radius:12px;padding:14px 18px;border:1px solid rgba(255,255,255,0.08);">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(41,128,185,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="fas ${f.icon}" style="color:#5dade2;font-size:15px;"></i>
            </div>
            <div>
              <div style="font-size:13px;font-weight:700;color:white;">${f.title}</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:1px;">${f.desc}</div>
            </div>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- Right panel - login form -->
    <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;background:white;">
      <div style="width:100%;max-width:400px;">
        <div style="margin-bottom:36px;">
          <h2 style="font-size:28px;font-weight:800;color:#1A1A2E;margin:0 0 8px;">Bem-vindo de volta!</h2>
          <p style="font-size:14px;color:#6c757d;margin:0;">Faça login para acessar o PCP Planner</p>
        </div>

        ${errHtml}

        <form onsubmit="doLogin(event)">
          <div style="margin-bottom:20px;">
            <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">E-mail</label>
            <div style="position:relative;">
              <i class="fas fa-envelope" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#9ca3af;font-size:14px;"></i>
              <input class="form-control" type="email" id="emailInput" placeholder="seu@email.com" style="padding-left:42px;" autocomplete="email">
            </div>
          </div>

          <div style="margin-bottom:28px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <label style="font-size:13px;font-weight:600;color:#374151;">Senha</label>
              <a href="/forgot-password" style="font-size:12px;color:#2980B9;text-decoration:none;">Esqueceu a senha?</a>
            </div>
            <div style="position:relative;">
              <i class="fas fa-lock" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#9ca3af;font-size:14px;"></i>
              <input class="form-control" type="password" id="passwordInput" placeholder="••••••••" style="padding-left:42px;" autocomplete="current-password">
              <button type="button" onclick="togglePwd()" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#9ca3af;">
                <i class="fas fa-eye" id="eyeIcon"></i>
              </button>
            </div>
          </div>

          <button type="submit" class="btn-primary" id="loginBtn">
            <i class="fas fa-sign-in-alt" style="margin-right:8px;"></i>Entrar no PCP Planner
          </button>
        </form>

        <div style="margin-top:24px;padding-top:24px;border-top:1px solid #f1f3f5;text-align:center;">
          <p style="font-size:13px;color:#6c757d;margin:0 0 12px;">Ainda não tem conta?</p>
          <button onclick="window.location.href='/cadastro'" style="width:100%;padding:10px;border:2px solid #1B4F72;border-radius:10px;background:transparent;color:#1B4F72;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.2s;" onmouseenter="this.style.background='#1B4F72';this.style.color='white'" onmouseleave="this.style.background='transparent';this.style.color='#1B4F72'">
            <i class="fas fa-rocket" style="margin-right:8px;"></i>Criar conta gratuita — 14 dias de trial
          </button>
        </div>

        <!-- Demo accounts -->
        <div style="margin-top:24px;background:#f8f9fa;border-radius:12px;padding:16px;">
          <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Contas Demo (senha: demo123)</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${[
              { name: 'Administrador', email: 'carlos@empresa.com', role: 'admin' },
              { name: 'Gestor PCP', email: 'ana@empresa.com', role: 'gestor_pcp' },
              { name: 'Operador', email: 'joao@empresa.com', role: 'operador' },
            ].map(u => `
            <button onclick="fillCredentials('${u.email}', 'demo123')" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:white;border:1px solid #e9ecef;border-radius:8px;cursor:pointer;text-align:left;width:100%;">
              <div style="width:28px;height:28px;border-radius:50%;background:#1B4F72;color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${u.name[0]}</div>
              <div style="flex:1;">
                <div style="font-size:12px;font-weight:600;color:#374151;">${u.name}</div>
                <div style="font-size:11px;color:#9ca3af;">${u.email}</div>
              </div>
              <i class="fas fa-arrow-right" style="color:#d1d5db;font-size:11px;"></i>
            </button>`).join('')}
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
  async function doLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const email = document.getElementById('emailInput').value.trim();
    const pwd = document.getElementById('passwordInput').value;

    if (!email || !pwd) {
      showError('Preencha e-mail e senha.');
      return;
    }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Entrando...';
    btn.disabled = true;

    // Submit as a real HTML form to properly receive the Set-Cookie header and follow redirect
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/login';

    const emailInput = document.createElement('input');
    emailInput.type = 'hidden';
    emailInput.name = 'email';
    emailInput.value = email;

    const pwdInput = document.createElement('input');
    pwdInput.type = 'hidden';
    pwdInput.name = 'pwd';
    pwdInput.value = pwd;

    form.appendChild(emailInput);
    form.appendChild(pwdInput);
    document.body.appendChild(form);
    form.submit();
  }

  function showError(msg) {
    const el = document.getElementById('loginError');
    const msgEl = document.getElementById('loginErrorMsg');
    if (el && msgEl) { msgEl.textContent = msg; el.style.display = 'flex'; }
    else if (el) { el.style.display = 'flex'; }
  }

  function togglePwd() {
    const input = document.getElementById('passwordInput');
    const icon = document.getElementById('eyeIcon');
    if (input.type === 'password') {
      input.type = 'text';
      icon.className = 'fas fa-eye-slash';
    } else {
      input.type = 'password';
      icon.className = 'fas fa-eye';
    }
  }

  function fillCredentials(email, pwd) {
    document.getElementById('emailInput').value = email;
    document.getElementById('passwordInput').value = pwd || 'demo123';
  }
  </script>
</body>
</html>`
}
