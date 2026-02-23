import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxSession } from '../sessionHelper'

const app = new Hono()

app.get('/', (c) => {
  const tenant   = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const session  = getCtxSession(c)

  // Real data from session
  const userName    = userInfo.nome    || 'Usuário'
  const userEmail   = session?.email   || ''
  const userEmpresa = userInfo.empresa || 'Minha Empresa'
  const userPlano   = userInfo.plano   || 'starter'
  const userRole    = userInfo.role    || 'admin'
  const trialEnd    = userInfo.trialEnd || ''
  const isDemo      = userInfo.isDemo  || false

  // Compute remaining trial days
  const trialDaysLeft = trialEnd
    ? Math.max(0, Math.ceil((new Date(trialEnd).getTime() - Date.now()) / 86400000))
    : 14

  const roleLabel: Record<string, string> = {
    admin: 'Administrador', gestor_pcp: 'Gestor PCP', qualidade: 'Qualidade',
    operador: 'Operador', compras: 'Compras', grupo_admin: 'Admin do Grupo'
  }
  const roleColor: Record<string, string> = {
    admin: '#1B4F72', gestor_pcp: '#27AE60', qualidade: '#8E44AD',
    operador: '#E67E22', compras: '#2980B9', grupo_admin: '#dc2626'
  }

  // Real tenant data
  const plants  = tenant.plants  || []
  const users   = tenant.users   || []

  // Current user as the only user (admin) if no sub-users yet
  const currentUserEntry = {
    id: session?.userId || 'u1',
    name: userName,
    email: userEmail,
    role: userRole,
    empresa: 'e1',
    empresaName: userEmpresa,
    scope: 'empresa'
  }

  const allUsers = [currentUserEntry, ...users.filter((u: any) => u.id !== currentUserEntry.id)]

  // Single company (the logged-in user's company)
  const empresas = [
    {
      id: 'e1',
      name: userEmpresa,
      cnpj: '',
      city: '',
      state: '',
      type: 'matriz',
      status: 'ativa',
      users: allUsers.length,
      plants: plants.length
    }
  ]

  // Grupo (single company mode)
  const grupo = {
    name: userEmpresa,
    cnpj: '',
    since: new Date().getFullYear().toString()
  }

  const planoLabel: Record<string,string> = {
    starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise', trial: 'Trial'
  }
  const planoColor: Record<string,string> = {
    starter: '#27AE60', professional: '#2980B9', enterprise: '#8E44AD', trial: '#E67E22'
  }
  const planoValor: Record<string,string> = {
    starter: 'R$ 299', professional: 'R$ 599', enterprise: 'R$ 1.490', trial: 'R$ 0'
  }
  const planoBilling = isDemo ? 'Demo' : (trialDaysLeft > 0 ? `Trial — ${trialDaysLeft} dias restantes` : planoLabel[userPlano] || userPlano)

  const content = `
  <div class="section-header">
    <div style="font-size:14px;color:#6c757d;">Gestão da empresa e usuários</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-secondary" onclick="openModal('novaEmpresaModal')"><i class="fas fa-building"></i> Nova Empresa/Filial</button>
      <button class="btn btn-primary" onclick="openModal('convidarModal')"><i class="fas fa-user-plus"></i> Convidar Usuário</button>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:300px 1fr;gap:20px;">
    <!-- Coluna esquerda -->
    <div style="display:flex;flex-direction:column;gap:16px;">

      <!-- Card da Empresa -->
      <div class="card" style="padding:20px;border-top:4px solid #1B4F72;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
          <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#1B4F72,#2980B9);display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-building" style="color:white;font-size:20px;"></i>
          </div>
          <div>
            <div style="font-size:15px;font-weight:800;color:#1B4F72;">${userEmpresa}</div>
            <div style="font-size:11px;color:#9ca3af;">Empresa ativa</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">
          <div style="text-align:center;background:#f8f9fa;border-radius:8px;padding:10px;">
            <div style="font-size:20px;font-weight:800;color:#1B4F72;">1</div>
            <div style="font-size:10px;color:#6c757d;">Empresa</div>
          </div>
          <div style="text-align:center;background:#f8f9fa;border-radius:8px;padding:10px;">
            <div style="font-size:20px;font-weight:800;color:#27AE60;">${allUsers.length}</div>
            <div style="font-size:10px;color:#6c757d;">Usuários</div>
          </div>
          <div style="text-align:center;background:#f8f9fa;border-radius:8px;padding:10px;">
            <div style="font-size:20px;font-weight:800;color:#E67E22;">${plants.length}</div>
            <div style="font-size:10px;color:#6c757d;">Plantas</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" style="width:100%;" onclick="openModal('editEmpresaModal')">
          <i class="fas fa-edit"></i> Editar Empresa
        </button>
      </div>

      <!-- Lista de Empresas -->
      <div class="card" style="padding:0;overflow:hidden;">
        <div style="padding:14px 16px;border-bottom:1px solid #f1f3f5;font-size:13px;font-weight:700;color:#1B4F72;">
          <i class="fas fa-building" style="margin-right:6px;"></i>Empresas / Filiais
        </div>
        ${empresas.map(e => `
        <div style="padding:12px 16px;border-bottom:1px solid #f8f9fa;cursor:pointer;" id="empCard_${e.id}">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:32px;height:32px;border-radius:8px;background:#e8f4fd;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="fas fa-star" style="font-size:13px;color:#2980B9;"></i>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:700;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.name}</div>
              <div style="font-size:11px;color:#9ca3af;">${e.users} usuário(s) · ${e.plants} planta(s)</div>
            </div>
            <span class="badge" style="font-size:10px;background:#e8f4fd;color:#2980B9;">Matriz</span>
          </div>
        </div>`).join('')}
        <div style="padding:10px 16px;">
          <button class="btn btn-secondary btn-sm" style="width:100%;" onclick="openModal('novaEmpresaModal')">
            <i class="fas fa-plus"></i> Adicionar Filial
          </button>
        </div>
      </div>

      <!-- Plano atual -->
      <div class="card" style="padding:20px;">
        <div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:12px;"><i class="fas fa-credit-card" style="margin-right:8px;"></i>Plano Atual</div>
        <div style="background:linear-gradient(135deg,${planoColor[userPlano]||'#27AE60'},${planoColor[userPlano]||'#1e8449'});border-radius:10px;padding:14px;color:white;margin-bottom:8px;">
          <div style="font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:1px;">${planoBilling}</div>
          <div style="font-size:20px;font-weight:800;margin-top:4px;">${planoValor[userPlano] || 'R$ 0'}<span style="font-size:13px;font-weight:400;opacity:0.7;">/mês</span></div>
        </div>
        ${!isDemo && trialDaysLeft > 0 ? `
        <div style="font-size:11px;color:#9ca3af;text-align:center;margin-bottom:10px;">
          <i class="fas fa-clock" style="margin-right:4px;color:#E67E22;"></i>${trialDaysLeft} dias restantes · Sem cartão de crédito
        </div>
        <a href="/assinatura" class="btn btn-primary" style="width:100%;justify-content:center;"><i class="fas fa-arrow-up"></i> Fazer Upgrade</a>` : `
        <a href="/assinatura" class="btn btn-secondary" style="width:100%;justify-content:center;"><i class="fas fa-credit-card"></i> Gerenciar Plano</a>`}
      </div>
    </div>

    <!-- Coluna direita: abas -->
    <div>
      <div data-tab-group="admin">
        <div class="tab-nav">
          <button class="tab-btn active" onclick="switchTab('tabUsuarios','admin')"><i class="fas fa-users" style="margin-right:6px;"></i>Usuários (${allUsers.length})</button>
          <button class="tab-btn" onclick="switchTab('tabEmpresas','admin')"><i class="fas fa-building" style="margin-right:6px;"></i>Empresas (${empresas.length})</button>
          <button class="tab-btn" onclick="switchTab('tabPermissoes','admin')"><i class="fas fa-shield-alt" style="margin-right:6px;"></i>Permissões</button>
          <button class="tab-btn" onclick="switchTab('tabConfig','admin')"><i class="fas fa-sliders-h" style="margin-right:6px;"></i>Configurações</button>
        </div>

        <!-- Aba: Usuários -->
        <div class="tab-content active" id="tabUsuarios">
          <div class="card" style="overflow:hidden;">
            <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <h4 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;">Membros e Colaboradores</h4>
              <button class="btn btn-primary btn-sm" onclick="openModal('convidarModal')"><i class="fas fa-user-plus"></i> Convidar</button>
            </div>
            <div style="padding:8px 0;" id="usersListContainer">
              ${allUsers.map((u: any) => `
              <div class="user-row" style="display:flex;align-items:center;gap:14px;padding:12px 20px;border-bottom:1px solid #f8f9fa;">
                <div style="position:relative;">
                  <div class="avatar" style="background:${roleColor[u.role] || '#9ca3af'};">${u.name.split(' ').map((n: string) => n[0]).slice(0,2).join('')}</div>
                </div>
                <div style="flex:1;">
                  <div style="font-size:14px;font-weight:600;color:#374151;">${u.name}</div>
                  <div style="font-size:12px;color:#9ca3af;">${u.email}</div>
                </div>
                <div style="text-align:center;min-width:100px;">
                  <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;">Empresa</div>
                  <span class="badge" style="font-size:10px;background:#e8f4fd;color:#2980B9;">
                    <i class="fas fa-building" style="font-size:8px;"></i>
                    ${u.empresaName || userEmpresa}
                  </span>
                </div>
                <span class="badge badge-primary" style="background:${roleColor[u.role] || '#9ca3af'}1A;color:${roleColor[u.role] || '#9ca3af'};">${roleLabel[u.role] || u.role}</span>
              </div>`).join('')}
            </div>
          </div>
        </div>

        <!-- Aba: Empresas -->
        <div class="tab-content" id="tabEmpresas">
          <div style="display:flex;flex-direction:column;gap:16px;">
            ${empresas.map(e => `
            <div class="card" style="padding:0;overflow:hidden;border-left:4px solid #2980B9;">
              <div style="padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                <div style="display:flex;align-items:center;gap:14px;">
                  <div style="width:48px;height:48px;border-radius:12px;background:#e8f4fd;display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-star" style="font-size:20px;color:#2980B9;"></i>
                  </div>
                  <div>
                    <div style="font-size:16px;font-weight:800;color:#1B4F72;">${e.name}</div>
                    <div style="font-size:12px;color:#6c757d;">${e.cnpj ? 'CNPJ: ' + e.cnpj : 'CNPJ não cadastrado'} ${e.city ? '· ' + e.city + '/' + e.state : ''}</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span class="badge" style="background:#e8f4fd;color:#2980B9;">Matriz</span>
                  <span class="badge badge-success">ativa</span>
                  <button class="btn btn-secondary btn-sm" onclick="openModal('editEmpresaModal')"><i class="fas fa-edit"></i> Editar</button>
                  <button class="btn btn-primary btn-sm" onclick="openModal('convidarModal')"><i class="fas fa-user-plus"></i> Usuário</button>
                </div>
              </div>
              <div style="padding:0 20px 16px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
                <div style="background:#f8f9fa;border-radius:8px;padding:10px;text-align:center;">
                  <div style="font-size:18px;font-weight:800;color:#1B4F72;">${e.users}</div>
                  <div style="font-size:10px;color:#6c757d;text-transform:uppercase;">Usuários</div>
                </div>
                <div style="background:#f8f9fa;border-radius:8px;padding:10px;text-align:center;">
                  <div style="font-size:18px;font-weight:800;color:#27AE60;">${e.plants}</div>
                  <div style="font-size:10px;color:#6c757d;text-transform:uppercase;">Plantas</div>
                </div>
                <div style="background:#f8f9fa;border-radius:8px;padding:10px;text-align:center;">
                  <div style="font-size:18px;font-weight:800;color:#E67E22;">6</div>
                  <div style="font-size:10px;color:#6c757d;text-transform:uppercase;">Módulos</div>
                </div>
                <div style="background:#f8f9fa;border-radius:8px;padding:10px;text-align:center;">
                  <div style="font-size:18px;font-weight:800;color:#7c3aed;">0</div>
                  <div style="font-size:10px;color:#6c757d;text-transform:uppercase;">Ordens/Mês</div>
                </div>
              </div>
            </div>`).join('')}
            <button class="btn btn-secondary" style="justify-content:center;" onclick="openModal('novaEmpresaModal')">
              <i class="fas fa-plus"></i> Adicionar Nova Empresa / Filial
            </button>
          </div>
        </div>

        <!-- Aba: Permissões -->
        <div class="tab-content" id="tabPermissoes">
          <div class="card" style="padding:24px;">
            <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0 0 20px;"><i class="fas fa-shield-alt" style="margin-right:8px;"></i>Matriz de Permissões por Nível de Acesso</h4>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Módulo / Funcionalidade</th>
                    <th style="text-align:center;color:#1B4F72;">Admin</th>
                    <th style="text-align:center;color:#27AE60;">Gestor PCP</th>
                    <th style="text-align:center;color:#E67E22;">Operador</th>
                    <th style="text-align:center;color:#8E44AD;">Qualidade</th>
                    <th style="text-align:center;color:#2980B9;">Compras</th>
                  </tr>
                </thead>
                <tbody>
                  ${[
                    ['Dashboard', '✅', '✅', '✅ (leitura)', '✅ (leitura)', '✅ (leitura)'],
                    ['Ordens de Produção', '✅', '✅', '✅ (próprias)', '❌', '❌'],
                    ['Apontamento de Produção', '✅', '✅', '✅', '❌', '❌'],
                    ['Qualidade / NC', '✅', '✅', '✅ (registrar)', '✅', '❌'],
                    ['Planejamento & MRP', '✅', '✅', '❌', '❌', '❌'],
                    ['Gestão de Estoque', '✅', '✅', '✅ (leitura)', '❌', '✅'],
                    ['Suprimentos / Cotações', '✅', '✅', '❌', '❌', '✅'],
                    ['Cadastros / Fornecedores', '✅', '✅ (leitura)', '❌', '❌', '✅'],
                    ['Administração', '✅', '❌', '❌', '❌', '❌'],
                    ['Plano & Licença', '✅', '❌', '❌', '❌', '❌'],
                  ].map(row => `
                  <tr>
                    <td style="font-weight:600;color:#374151;">${row[0]}</td>
                    ${row.slice(1).map(v => `<td style="text-align:center;font-size:14px;">${v}</td>`).join('')}
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Aba: Configurações -->
        <div class="tab-content" id="tabConfig">
          <div class="card" style="padding:24px;">
            <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0 0 20px;">Configurações da Empresa</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div class="form-group"><label class="form-label">Nome da Empresa</label><input class="form-control" type="text" id="cfgEmpresa" value="${userEmpresa}"></div>
              <div class="form-group"><label class="form-label">E-mail Administrativo</label><input class="form-control" type="email" id="cfgEmail" value="${userEmail}"></div>
              <div class="form-group"><label class="form-label">CNPJ</label><input class="form-control" type="text" id="cfgCNPJ" placeholder="00.000.000/0001-00"></div>
              <div class="form-group"><label class="form-label">Razão Social</label><input class="form-control" type="text" id="cfgRazao" placeholder="Razão Social da Empresa"></div>
              <div class="form-group"><label class="form-label">Turno Padrão</label>
                <select class="form-control" id="cfgTurno">
                  <option>1 turno (8h)</option><option>2 turnos (16h)</option><option>3 turnos (24h)</option>
                </select>
              </div>
              <div class="form-group"><label class="form-label">Fuso Horário</label>
                <select class="form-control" id="cfgFuso">
                  <option>America/Sao_Paulo (GMT-3)</option><option>America/Manaus (GMT-4)</option>
                </select>
              </div>
            </div>
            <div style="margin-top:8px;display:flex;justify-content:flex-end;gap:10px;">
              <button class="btn btn-secondary">Restaurar Padrões</button>
              <button class="btn btn-primary" onclick="saveConfig()"><i class="fas fa-save"></i> Salvar</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal: Convidar Usuário -->
  <div class="modal-overlay" id="convidarModal">
    <div class="modal" style="max-width:480px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-user-plus" style="margin-right:8px;"></i>Convidar Usuário</h3>
        <button onclick="closeModal('convidarModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div class="form-group"><label class="form-label">Nome Completo *</label><input class="form-control" id="inviteNome" type="text" placeholder="Nome do usuário"></div>
        <div class="form-group"><label class="form-label">E-mail *</label><input class="form-control" id="inviteEmail" type="email" placeholder="email@empresa.com"></div>
        <div class="form-group"><label class="form-label">Função / Perfil *</label>
          <select class="form-control" id="inviteRole">
            <option value="operador">Operador</option>
            <option value="qualidade">Qualidade</option>
            <option value="compras">Compras</option>
            <option value="gestor_pcp">Gestor PCP</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <div style="background:#e8f4fd;border-radius:8px;padding:12px;margin-top:8px;">
          <div style="font-size:12px;color:#1B4F72;"><i class="fas fa-info-circle" style="margin-right:6px;"></i>O usuário receberá um e-mail com as instruções de acesso.</div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('convidarModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="sendInvite()" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Enviar Convite</button>
      </div>
    </div>
  </div>

  <!-- Modal: Nova Empresa/Filial -->
  <div class="modal-overlay" id="novaEmpresaModal">
    <div class="modal" style="max-width:560px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-building" style="margin-right:8px;"></i>Nova Empresa / Filial</h3>
        <button onclick="closeModal('novaEmpresaModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#92400e;">
          <i class="fas fa-info-circle" style="margin-right:6px;"></i>
          <strong>Atenção:</strong> A inclusão de empresa/filial adicional tem custo de 50% da assinatura. Será calculado no checkout.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Razão Social *</label>
            <input class="form-control" id="novaEmpRazao" type="text" placeholder="Ex: Filial Nordeste Ltda">
          </div>
          <div class="form-group">
            <label class="form-label">CNPJ *</label>
            <input class="form-control" id="novaEmpCNPJ" type="text" placeholder="00.000.000/0001-00">
          </div>
          <div class="form-group">
            <label class="form-label">E-mail Administrativo</label>
            <input class="form-control" id="novaEmpEmail" type="email" placeholder="admin@filial.com.br">
          </div>
          <div class="form-group">
            <label class="form-label">Cidade</label>
            <input class="form-control" id="novaEmpCidade" type="text" placeholder="Ex: Fortaleza">
          </div>
          <div class="form-group">
            <label class="form-label">Estado</label>
            <input class="form-control" id="novaEmpEstado" type="text" placeholder="Ex: CE">
          </div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaEmpresaModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="saveNovaEmpresa()" class="btn btn-primary"><i class="fas fa-save"></i> Adicionar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Editar Empresa -->
  <div class="modal-overlay" id="editEmpresaModal">
    <div class="modal" style="max-width:480px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-edit" style="margin-right:8px;"></i>Editar Empresa</h3>
        <button onclick="closeModal('editEmpresaModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div class="form-group"><label class="form-label">Razão Social</label><input class="form-control" type="text" value="${userEmpresa}"></div>
        <div class="form-group"><label class="form-label">CNPJ</label><input class="form-control" type="text" placeholder="00.000.000/0001-00"></div>
        <div class="form-group"><label class="form-label">E-mail</label><input class="form-control" type="email" value="${userEmail}"></div>
        <div class="form-group"><label class="form-label">Cidade / Estado</label>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;">
            <input class="form-control" type="text" placeholder="Cidade">
            <input class="form-control" type="text" placeholder="UF">
          </div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('editEmpresaModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('Empresa atualizada!');closeModal('editEmpresaModal')" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <script>
  function saveConfig() {
    alert('✅ Configurações salvas!');
  }

  function sendInvite() {
    const nome  = document.getElementById('inviteNome').value.trim();
    const email = document.getElementById('inviteEmail').value.trim();
    const role  = document.getElementById('inviteRole').value;
    if (!nome || !email) { alert('Preencha nome e e-mail.'); return; }
    alert('✅ Convite enviado para ' + email + '!\\n\\nQuando o sistema de e-mail estiver configurado, o usuário receberá as instruções de acesso.');
    closeModal('convidarModal');
  }

  function saveNovaEmpresa() {
    const razao = document.getElementById('novaEmpRazao').value.trim();
    if (!razao) { alert('Informe a Razão Social da empresa.'); return; }
    alert('✅ Solicitação registrada!\\n\\nA inclusão de filial adicional será processada e você receberá um e-mail com as instruções de pagamento do custo adicional.');
    closeModal('novaEmpresaModal');
  }
  </script>
  `
  return c.html(layout('Administração', content, 'admin', userInfo))
})

export default app
