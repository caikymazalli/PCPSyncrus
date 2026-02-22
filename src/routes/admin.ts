import { Hono } from 'hono'
import { layout } from '../layout'
import { mockData } from '../data'

const app = new Hono()

app.get('/', (c) => {
  const { users } = mockData

  const roleLabel: Record<string, string> = {
    admin: 'Administrador', gestor_pcp: 'Gestor PCP', qualidade: 'Qualidade',
    operador: 'Operador', compras: 'Compras', grupo_admin: 'Admin do Grupo'
  }
  const roleColor: Record<string, string> = {
    admin: '#1B4F72', gestor_pcp: '#27AE60', qualidade: '#8E44AD',
    operador: '#E67E22', compras: '#2980B9', grupo_admin: '#dc2626'
  }

  // Mock grupo/empresas
  const grupo = { id: 'g1', name: 'Grupo Industrial Alpha', cnpj: '00.000.000/0000-00', since: '2018' }
  const empresas = [
    { id: 'e1', name: 'Empresa Alpha Ltda', cnpj: '12.345.678/0001-90', city: 'São Paulo', state: 'SP', type: 'matriz', status: 'ativa', users: 4, plants: 2 },
    { id: 'e2', name: 'Alpha Nordeste Ltda', cnpj: '98.765.432/0001-10', city: 'Fortaleza', state: 'CE', type: 'filial', status: 'ativa', users: 2, plants: 1 },
    { id: 'e3', name: 'Alpha Sul Ind. e Com.', cnpj: '11.222.333/0001-44', city: 'Porto Alegre', state: 'RS', type: 'filial', status: 'ativa', users: 3, plants: 1 },
  ]

  const usersEx = [
    ...users,
    { id: 'u6', name: 'Fernanda Costa', email: 'fernanda@alpha-nordeste.com.br', role: 'gestor_pcp', empresa: 'e2', empresaName: 'Alpha Nordeste', scope: 'empresa' },
    { id: 'u7', name: 'Ricardo Mendes', email: 'ricardo@alphasul.com.br', role: 'operador', empresa: 'e3', empresaName: 'Alpha Sul', scope: 'empresa' },
    { id: 'u8', name: 'Grupo Admin', email: 'admin@grupoalpha.com.br', role: 'grupo_admin', empresa: null, empresaName: 'Grupo (todas)', scope: 'grupo' },
  ].map((u: any) => ({ ...u, empresa: u.empresa || 'e1', empresaName: u.empresaName || 'Empresa Alpha', scope: u.scope || 'empresa' }))

  const content = `
  <div class="section-header">
    <div style="font-size:14px;color:#6c757d;">Gestão do grupo, empresas e usuários</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-secondary" onclick="openModal('novaEmpresaModal')"><i class="fas fa-building"></i> Nova Empresa/Filial</button>
      <button class="btn btn-primary" onclick="openModal('convidarModal')"><i class="fas fa-user-plus"></i> Convidar Usuário</button>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:300px 1fr;gap:20px;">
    <!-- Coluna esquerda -->
    <div style="display:flex;flex-direction:column;gap:16px;">

      <!-- Card do Grupo -->
      <div class="card" style="padding:20px;border-top:4px solid #1B4F72;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
          <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#1B4F72,#2980B9);display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-layer-group" style="color:white;font-size:20px;"></i>
          </div>
          <div>
            <div style="font-size:15px;font-weight:800;color:#1B4F72;">${grupo.name}</div>
            <div style="font-size:11px;color:#9ca3af;">CNPJ: ${grupo.cnpj} · Desde ${grupo.since}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">
          <div style="text-align:center;background:#f8f9fa;border-radius:8px;padding:10px;">
            <div style="font-size:20px;font-weight:800;color:#1B4F72;">${empresas.length}</div>
            <div style="font-size:10px;color:#6c757d;">Empresas</div>
          </div>
          <div style="text-align:center;background:#f8f9fa;border-radius:8px;padding:10px;">
            <div style="font-size:20px;font-weight:800;color:#27AE60;">${usersEx.length}</div>
            <div style="font-size:10px;color:#6c757d;">Usuários</div>
          </div>
          <div style="text-align:center;background:#f8f9fa;border-radius:8px;padding:10px;">
            <div style="font-size:20px;font-weight:800;color:#E67E22;">${mockData.plants.length}</div>
            <div style="font-size:10px;color:#6c757d;">Plantas</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" style="width:100%;" onclick="openModal('editGrupoModal')">
          <i class="fas fa-edit"></i> Editar Grupo
        </button>
      </div>

      <!-- Lista de Empresas -->
      <div class="card" style="padding:0;overflow:hidden;">
        <div style="padding:14px 16px;border-bottom:1px solid #f1f3f5;font-size:13px;font-weight:700;color:#1B4F72;">
          <i class="fas fa-building" style="margin-right:6px;"></i>Empresas do Grupo
        </div>
        ${empresas.map(e => `
        <div style="padding:12px 16px;border-bottom:1px solid #f8f9fa;cursor:pointer;" onclick="selectEmpresa('${e.id}','${e.name}')" id="empCard_${e.id}">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:32px;height:32px;border-radius:8px;background:${e.type==='matriz'?'#e8f4fd':'#f0fdf4'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="fas fa-${e.type==='matriz'?'star':'code-branch'}" style="font-size:13px;color:${e.type==='matriz'?'#2980B9':'#27AE60'};"></i>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:700;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.name}</div>
              <div style="font-size:11px;color:#9ca3af;">${e.city}/${e.state} · ${e.users} usuários</div>
            </div>
            <span class="badge" style="font-size:10px;background:${e.type==='matriz'?'#e8f4fd':'#f0fdf4'};color:${e.type==='matriz'?'#2980B9':'#27AE60'};">${e.type==='matriz'?'Matriz':'Filial'}</span>
          </div>
        </div>`).join('')}
        <div style="padding:10px 16px;">
          <button class="btn btn-secondary btn-sm" style="width:100%;" onclick="openModal('novaEmpresaModal')">
            <i class="fas fa-plus"></i> Adicionar Empresa/Filial
          </button>
        </div>
      </div>

      <!-- Plano atual -->
      <div class="card" style="padding:20px;">
        <div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:12px;"><i class="fas fa-credit-card" style="margin-right:8px;"></i>Plano Atual</div>
        <div style="background:linear-gradient(135deg,#27AE60,#1e8449);border-radius:10px;padding:14px;color:white;margin-bottom:8px;">
          <div style="font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:1px;">Trial — Plano Starter</div>
          <div style="font-size:20px;font-weight:800;margin-top:4px;">R$ 0<span style="font-size:13px;font-weight:400;opacity:0.7;">/mês</span></div>
          <div style="font-size:11px;opacity:0.7;margin-top:4px;">1 CNPJ · Até 3 usuários · 1 planta</div>
        </div>
        <div style="font-size:11px;color:#9ca3af;text-align:center;margin-bottom:10px;">
          <i class="fas fa-clock" style="margin-right:4px;color:#E67E22;"></i>11 dias restantes · Sem cartão de crédito
        </div>
        <a href="/assinatura" class="btn btn-primary" style="width:100%;justify-content:center;"><i class="fas fa-arrow-up"></i> Fazer Upgrade</a>
      </div>
    </div>

    <!-- Coluna direita: abas -->
    <div>
      <div data-tab-group="admin">
        <div class="tab-nav">
          <button class="tab-btn active" onclick="switchTab('tabUsuarios','admin')"><i class="fas fa-users" style="margin-right:6px;"></i>Usuários (${usersEx.length})</button>
          <button class="tab-btn" onclick="switchTab('tabEmpresas','admin')"><i class="fas fa-building" style="margin-right:6px;"></i>Empresas (${empresas.length})</button>
          <button class="tab-btn" onclick="switchTab('tabPermissoes','admin')"><i class="fas fa-shield-alt" style="margin-right:6px;"></i>Permissões</button>
          <button class="tab-btn" onclick="switchTab('tabConfig','admin')"><i class="fas fa-sliders-h" style="margin-right:6px;"></i>Configurações</button>
          <button class="tab-btn" onclick="switchTab('tabLog','admin')"><i class="fas fa-history" style="margin-right:6px;"></i>Log</button>
        </div>

        <!-- Aba: Usuários -->
        <div class="tab-content active" id="tabUsuarios">
          <div class="card" style="overflow:hidden;">
            <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <h4 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;">Membros e Colaboradores</h4>
              <div style="display:flex;gap:8px;">
                <select class="form-control" style="font-size:12px;padding:5px 8px;width:auto;" id="filterEmpresaUser" onchange="filterUsersByEmpresa()">
                  <option value="">Todas as empresas</option>
                  <option value="grupo">Nível de Grupo</option>
                  ${empresas.map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
                </select>
                <button class="btn btn-primary btn-sm" onclick="openModal('convidarModal')"><i class="fas fa-user-plus"></i> Convidar</button>
              </div>
            </div>
            <div style="padding:8px 0;" id="usersListContainer">
              ${usersEx.map(u => `
              <div class="user-row" data-empresa="${(u as any).empresa || 'e1'}" data-scope="${(u as any).scope || 'empresa'}" style="display:flex;align-items:center;gap:14px;padding:12px 20px;border-bottom:1px solid #f8f9fa;">
                <div style="position:relative;cursor:pointer;" onclick="document.getElementById('userPhotoInput_${u.id}').click()" title="Alterar foto">
                  <div class="avatar" id="avatar_${u.id}" style="background:${roleColor[(u as any).role] || '#9ca3af'};">${u.name.split(' ').map((n: string) => n[0]).slice(0,2).join('')}</div>
                  <div style="position:absolute;bottom:-2px;right:-2px;width:16px;height:16px;background:#27AE60;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1.5px solid white;">
                    <i class="fas fa-camera" style="color:white;font-size:7px;"></i>
                  </div>
                </div>
                <input type="file" id="userPhotoInput_${u.id}" accept="image/*" style="display:none;" onchange="uploadUserPhoto(event,'${u.id}')">
                <div style="flex:1;">
                  <div style="font-size:14px;font-weight:600;color:#374151;">${u.name}</div>
                  <div style="font-size:12px;color:#9ca3af;">${(u as any).email}</div>
                </div>
                <!-- Empresa vinculada -->
                <div style="text-align:center;min-width:100px;">
                  <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;">Empresa</div>
                  <span class="badge" style="font-size:10px;background:${(u as any).scope==='grupo'?'#fef2f2':'#e8f4fd'};color:${(u as any).scope==='grupo'?'#dc2626':'#2980B9'};">
                    <i class="fas fa-${(u as any).scope==='grupo'?'layer-group':'building'}" style="font-size:8px;"></i>
                    ${(u as any).empresaName || 'Empresa Alpha'}
                  </span>
                </div>
                <!-- Nível de acesso -->
                <div style="text-align:center;min-width:90px;">
                  <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;">Acesso</div>
                  <span class="badge" style="font-size:10px;background:${(u as any).scope==='grupo'?'#fef2f2':'#f5f3ff'};color:${(u as any).scope==='grupo'?'#dc2626':'#7c3aed'};">
                    ${(u as any).scope==='grupo'?'<i class="fas fa-globe" style="font-size:8px;"></i> Grupo Completo':'<i class="fas fa-lock" style="font-size:8px;"></i> Só Empresa'}
                  </span>
                </div>
                <span class="badge badge-primary" style="background:${roleColor[(u as any).role] || '#9ca3af'}1A;color:${roleColor[(u as any).role] || '#9ca3af'};">${roleLabel[(u as any).role] || (u as any).role}</span>
                <div style="display:flex;gap:4px;">
                  <div class="tooltip-wrap" data-tooltip="Editar usuário"><button class="btn btn-secondary btn-sm" onclick="openModal('editUserModal')"><i class="fas fa-edit"></i></button></div>
                  ${(u as any).role !== 'admin' && (u as any).role !== 'grupo_admin' ? `<div class="tooltip-wrap" data-tooltip="Remover usuário"><button class="btn btn-danger btn-sm" onclick="if(confirm('Remover ${u.name}?')) alert('Usuário removido.')"><i class="fas fa-user-times"></i></button></div>` : ''}
                </div>
              </div>`).join('')}
            </div>
          </div>
        </div>

        <!-- Aba: Empresas -->
        <div class="tab-content" id="tabEmpresas">
          <div style="display:flex;flex-direction:column;gap:16px;">
            ${empresas.map(e => `
            <div class="card" style="padding:0;overflow:hidden;border-left:4px solid ${e.type==='matriz'?'#2980B9':'#27AE60'};">
              <div style="padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                <div style="display:flex;align-items:center;gap:14px;">
                  <div style="width:48px;height:48px;border-radius:12px;background:${e.type==='matriz'?'#e8f4fd':'#f0fdf4'};display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-${e.type==='matriz'?'star':'code-branch'}" style="font-size:20px;color:${e.type==='matriz'?'#2980B9':'#27AE60'};"></i>
                  </div>
                  <div>
                    <div style="font-size:16px;font-weight:800;color:#1B4F72;">${e.name}</div>
                    <div style="font-size:12px;color:#6c757d;">CNPJ: ${e.cnpj} · ${e.city}/${e.state}</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span class="badge" style="background:${e.type==='matriz'?'#e8f4fd':'#f0fdf4'};color:${e.type==='matriz'?'#2980B9':'#27AE60'};">${e.type==='matriz'?'Matriz':'Filial'}</span>
                  <span class="badge badge-success">${e.status}</span>
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
                  <div style="font-size:18px;font-weight:800;color:#E67E22;">${e.type==='matriz'?'6':'3'}</div>
                  <div style="font-size:10px;color:#6c757d;text-transform:uppercase;">Módulos</div>
                </div>
                <div style="background:#f8f9fa;border-radius:8px;padding:10px;text-align:center;">
                  <div style="font-size:18px;font-weight:800;color:#7c3aed;">${e.type==='matriz'?'47':'12'}</div>
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
            <div style="background:#e8f4fd;border-radius:8px;padding:14px;margin-bottom:20px;">
              <div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:8px;"><i class="fas fa-info-circle" style="margin-right:6px;"></i>Como funciona o controle de acesso?</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div style="background:white;border-radius:8px;padding:12px;border-left:4px solid #dc2626;">
                  <div style="font-size:12px;font-weight:700;color:#dc2626;margin-bottom:6px;"><i class="fas fa-layer-group" style="margin-right:6px;"></i>Nível de GRUPO</div>
                  <div style="font-size:12px;color:#374151;">Visualiza e gerencia <strong>todas as empresas</strong> do grupo. Acessa dashboards consolidados, relatórios multi-empresa e configurações globais.</div>
                </div>
                <div style="background:white;border-radius:8px;padding:12px;border-left:4px solid #7c3aed;">
                  <div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:6px;"><i class="fas fa-building" style="margin-right:6px;"></i>Nível de EMPRESA</div>
                  <div style="font-size:12px;color:#374151;">Acessa apenas a empresa à qual está vinculado. Visualiza somente dados, indicadores e ordens da própria empresa.</div>
                </div>
              </div>
            </div>

            <!-- Tabela de permissões -->
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Módulo / Funcionalidade</th>
                    <th style="text-align:center;color:#dc2626;">Admin Grupo</th>
                    <th style="text-align:center;color:#1B4F72;">Admin Empresa</th>
                    <th style="text-align:center;color:#27AE60;">Gestor PCP</th>
                    <th style="text-align:center;color:#E67E22;">Operador</th>
                    <th style="text-align:center;color:#8E44AD;">Qualidade</th>
                    <th style="text-align:center;color:#2980B9;">Compras</th>
                  </tr>
                </thead>
                <tbody>
                  ${[
                    ['Dashboard consolidado (todas empresas)', '✅', '❌', '❌', '❌', '❌', '❌'],
                    ['Dashboard da empresa', '✅', '✅', '✅', '✅ (leitura)', '✅ (leitura)', '✅ (leitura)'],
                    ['Ordens de Produção', '✅', '✅', '✅', '✅ (próprias)', '❌', '❌'],
                    ['Apontamento de Produção', '✅', '✅', '✅', '✅', '❌', '❌'],
                    ['Qualidade / NC', '✅', '✅', '✅', '✅ (registrar)', '✅', '❌'],
                    ['Planejamento & MRP', '✅', '✅', '✅', '❌', '❌', '❌'],
                    ['Gestão de Estoque', '✅', '✅', '✅', '✅ (leitura)', '❌', '✅'],
                    ['Transferência entre filiais', '✅', '✅', '✅', '❌', '❌', '✅'],
                    ['Suprimentos / Cotações', '✅', '✅', '❌', '❌', '❌', '✅'],
                    ['Importação', '✅', '✅', '❌', '❌', '❌', '✅'],
                    ['Cadastros / Fornecedores', '✅', '✅', '✅ (leitura)', '❌', '❌', '✅'],
                    ['Administração (Grupo)', '✅', '❌', '❌', '❌', '❌', '❌'],
                    ['Administração (Empresa)', '✅', '✅', '❌', '❌', '❌', '❌'],
                    ['Plano & Licença', '✅', '✅', '❌', '❌', '❌', '❌'],
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
            <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0 0 20px;">Configurações da Empresa Ativa</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div class="form-group"><label class="form-label">Nome da Empresa</label><input class="form-control" type="text" value="Empresa Alpha Ltda"></div>
              <div class="form-group"><label class="form-label">E-mail Administrativo</label><input class="form-control" type="email" value="empresa@alpha.com.br"></div>
              <div class="form-group"><label class="form-label">CNPJ</label><input class="form-control" type="text" value="12.345.678/0001-90"></div>
              <div class="form-group"><label class="form-label">Razão Social</label><input class="form-control" type="text" value="Empresa Alpha Ltda"></div>
              <div class="form-group"><label class="form-label">Turno Padrão</label>
                <select class="form-control">
                  <option>1 turno (8h)</option><option>2 turnos (16h)</option><option>3 turnos (24h)</option>
                </select>
              </div>
              <div class="form-group"><label class="form-label">Fuso Horário</label>
                <select class="form-control">
                  <option>America/Sao_Paulo (GMT-3)</option><option>America/Manaus (GMT-4)</option>
                </select>
              </div>
            </div>
            <div style="margin-top:8px;display:flex;justify-content:flex-end;gap:10px;">
              <button class="btn btn-secondary">Restaurar Padrões</button>
              <button class="btn btn-primary" onclick="alert('Configurações salvas!')"><i class="fas fa-save"></i> Salvar</button>
            </div>
          </div>
        </div>

        <!-- Aba: Log -->
        <div class="tab-content" id="tabLog">
          <div class="card" style="overflow:hidden;">
            <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
              <h4 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;">Atividades Recentes</h4>
              <select class="form-control" style="width:auto;font-size:12px;padding:4px 8px;">
                <option>Todas as empresas</option>
                ${empresas.map(e => `<option>${e.name}</option>`).join('')}
              </select>
            </div>
            <div style="padding:8px 0;">
              ${[
                { user: 'Carlos Silva', empresa: 'Empresa Alpha', action: 'criou a Ordem de Produção', target: 'OP-2024-007', time: 'há 2h', icon: 'fa-plus', color: '#27AE60' },
                { user: 'Fernanda Costa', empresa: 'Alpha Nordeste', action: 'atualizou status de', target: 'OP-2024-010 para Em Progresso', time: 'há 3h', icon: 'fa-edit', color: '#3498DB' },
                { user: 'Ricardo Mendes', empresa: 'Alpha Sul', action: 'registrou apontamento na', target: 'OP-2024-011', time: 'há 4h', icon: 'fa-check', color: '#27AE60' },
                { user: 'Grupo Admin', empresa: 'Grupo (Global)', action: 'adicionou filial', target: 'Alpha Sul Ind. e Com.', time: 'há 1d', icon: 'fa-building', color: '#1B4F72' },
                { user: 'Ana Souza', empresa: 'Empresa Alpha', action: 'gerou relatório MRP para', target: 'Fevereiro 2024', time: 'há 2d', icon: 'fa-chart-bar', color: '#8E44AD' },
              ].map(log => `
              <div style="display:flex;gap:12px;padding:12px 20px;border-bottom:1px solid #f8f9fa;">
                <div style="width:32px;height:32px;border-radius:50%;background:${log.color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <i class="fas ${log.icon}" style="color:${log.color};font-size:13px;"></i>
                </div>
                <div style="flex:1;">
                  <div style="font-size:13px;color:#374151;"><strong>${log.user}</strong> <span style="background:#f1f3f5;color:#6c757d;font-size:10px;padding:1px 6px;border-radius:4px;">${log.empresa}</span> ${log.action} <strong style="color:#1B4F72;">${log.target}</strong></div>
                  <div style="font-size:11px;color:#9ca3af;margin-top:2px;">${log.time}</div>
                </div>
              </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal: Editar Usuário -->
  <div class="modal-overlay" id="editUserModal">
    <div class="modal" style="max-width:480px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-user-edit" style="margin-right:8px;"></i>Editar Usuário</h3>
        <button onclick="closeModal('editUserModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="position:relative;width:80px;height:80px;margin:0 auto;">
            <div id="editUserAvatar" style="width:80px;height:80px;border-radius:50%;background:#2980B9;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:white;overflow:hidden;">CS</div>
            <div style="position:absolute;bottom:0;right:0;width:24px;height:24px;background:#27AE60;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;cursor:pointer;" onclick="document.getElementById('editUserPhotoInput').click()">
              <i class="fas fa-camera" style="color:white;font-size:10px;"></i>
            </div>
          </div>
          <input type="file" id="editUserPhotoInput" accept="image/*" style="display:none;" onchange="previewEditUserPhoto(event)">
        </div>
        <div class="form-group"><label class="form-label">Nome Completo</label><input class="form-control" type="text" value="Carlos Silva"></div>
        <div class="form-group"><label class="form-label">E-mail</label><input class="form-control" type="email" value="carlos@empresa.com"></div>
        <div class="form-group"><label class="form-label">Função / Perfil</label>
          <select class="form-control">
            <option value="operador">Operador</option>
            <option value="qualidade">Qualidade</option>
            <option value="compras">Compras</option>
            <option value="gestor_pcp">Gestor PCP</option>
            <option value="admin" selected>Administrador</option>
            <option value="grupo_admin">Admin do Grupo</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Nível de Acesso</label>
          <select class="form-control" id="editUserScope" onchange="onEditScopeChange()">
            <option value="empresa">Empresa específica</option>
            <option value="grupo">Grupo completo (todas as empresas)</option>
          </select>
        </div>
        <div class="form-group" id="editUserEmpresaGroup">
          <label class="form-label">Empresa Vinculada</label>
          <select class="form-control">
            ${empresas.map(e => `<option value="${e.id}">${e.name} (${e.type})</option>`).join('')}
          </select>
        </div>
        <div id="editScopeInfo" style="display:none;background:#fef2f2;border-radius:8px;padding:10px;margin-top:8px;">
          <div style="font-size:12px;color:#dc2626;"><i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i><strong>Atenção:</strong> Nível de Grupo permite visualizar e gerenciar TODAS as empresas. Use com cuidado.</div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('editUserModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('Usuário atualizado!');closeModal('editUserModal')" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
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
        <div class="form-group"><label class="form-label">Nome Completo *</label><input class="form-control" type="text" placeholder="Nome do usuário"></div>
        <div class="form-group"><label class="form-label">E-mail *</label><input class="form-control" type="email" placeholder="email@empresa.com"></div>
        <div class="form-group"><label class="form-label">Função / Perfil *</label>
          <select class="form-control">
            <option value="operador">Operador</option>
            <option value="qualidade">Qualidade</option>
            <option value="compras">Compras</option>
            <option value="gestor_pcp">Gestor PCP</option>
            <option value="admin">Administrador</option>
            <option value="grupo_admin">Admin do Grupo</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Nível de Acesso *</label>
          <select class="form-control" id="inviteScope" onchange="onInviteScopeChange()">
            <option value="empresa">Empresa específica</option>
            <option value="grupo">Grupo completo (todas as empresas)</option>
          </select>
        </div>
        <div class="form-group" id="inviteEmpresaGroup">
          <label class="form-label">Empresa *</label>
          <select class="form-control">
            ${empresas.map(e => `<option value="${e.id}">${e.name} (${e.type})</option>`).join('')}
          </select>
        </div>
        <div style="background:#e8f4fd;border-radius:8px;padding:12px;margin-top:8px;">
          <div style="font-size:12px;color:#1B4F72;"><i class="fas fa-info-circle" style="margin-right:6px;"></i>O usuário receberá um e-mail com as instruções de acesso.</div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('convidarModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('Convite enviado!');closeModal('convidarModal')" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Enviar Convite</button>
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
          <strong>Atenção:</strong> A inclusão de CNPJ/empresa adicional tem custo de 50% da assinatura escolhida. Isso será calculado no checkout.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="form-group">
            <label class="form-label">Tipo *</label>
            <select class="form-control" id="empTipo">
              <option value="filial">Filial</option>
              <option value="matriz">Matriz</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-control">
              <option value="ativa">Ativa</option>
              <option value="inativa">Inativa</option>
            </select>
          </div>
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Razão Social *</label>
            <input class="form-control" type="text" placeholder="Ex: Alpha Nordeste Ltda">
          </div>
          <div class="form-group">
            <label class="form-label">CNPJ *</label>
            <input class="form-control" type="text" placeholder="00.000.000/0001-00">
          </div>
          <div class="form-group">
            <label class="form-label">E-mail Administrativo</label>
            <input class="form-control" type="email" placeholder="admin@filial.com.br">
          </div>
          <div class="form-group">
            <label class="form-label">Cidade</label>
            <input class="form-control" type="text" placeholder="Ex: Fortaleza">
          </div>
          <div class="form-group">
            <label class="form-label">Estado</label>
            <input class="form-control" type="text" placeholder="Ex: CE">
          </div>
          <div class="form-group" style="grid-column:span 2;">
            <label class="form-label">Empresa Vinculada ao Grupo</label>
            <select class="form-control">
              <option value="g1">${grupo.name}</option>
            </select>
          </div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('novaEmpresaModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('✅ Empresa/filial adicionada ao grupo!\\n\\nO custo adicional de 50% da assinatura será aplicado no próximo ciclo de cobrança.');closeModal('novaEmpresaModal')" class="btn btn-primary"><i class="fas fa-save"></i> Adicionar</button>
      </div>
    </div>
  </div>

  <!-- Modal: Editar Grupo -->
  <div class="modal-overlay" id="editGrupoModal">
    <div class="modal" style="max-width:480px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-layer-group" style="margin-right:8px;"></i>Editar Grupo</h3>
        <button onclick="closeModal('editGrupoModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <div class="form-group"><label class="form-label">Nome do Grupo *</label><input class="form-control" type="text" value="${grupo.name}"></div>
        <div class="form-group"><label class="form-label">CNPJ do Grupo (Holding)</label><input class="form-control" type="text" value="${grupo.cnpj}"></div>
        <div class="form-group"><label class="form-label">E-mail do Grupo</label><input class="form-control" type="email" value="grupo@grupoalpha.com.br"></div>
        <div class="form-group"><label class="form-label">Responsável</label><input class="form-control" type="text" value="Grupo Admin"></div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('editGrupoModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('Grupo atualizado!');closeModal('editGrupoModal')" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
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
        <div class="form-group"><label class="form-label">Razão Social</label><input class="form-control" type="text" value="Empresa Alpha Ltda"></div>
        <div class="form-group"><label class="form-label">CNPJ</label><input class="form-control" type="text" value="12.345.678/0001-90"></div>
        <div class="form-group"><label class="form-label">E-mail</label><input class="form-control" type="email" value="empresa@alpha.com.br"></div>
        <div class="form-group"><label class="form-label">Cidade / Estado</label>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;">
            <input class="form-control" type="text" value="São Paulo">
            <input class="form-control" type="text" value="SP">
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
  function filterUsersByEmpresa() {
    const val = document.getElementById('filterEmpresaUser').value;
    document.querySelectorAll('.user-row').forEach(row => {
      if (!val) { row.style.display = ''; return; }
      if (val === 'grupo') { row.style.display = row.dataset.scope === 'grupo' ? '' : 'none'; }
      else { row.style.display = row.dataset.empresa === val ? '' : 'none'; }
    });
  }

  function selectEmpresa(id, name) {
    document.querySelectorAll('[id^="empCard_"]').forEach(c => c.style.background = '');
    const card = document.getElementById('empCard_'+id);
    if (card) card.style.background = '#e8f4fd';
  }

  function onEditScopeChange() {
    const v = document.getElementById('editUserScope').value;
    document.getElementById('editUserEmpresaGroup').style.display = v === 'empresa' ? '' : 'none';
    document.getElementById('editScopeInfo').style.display = v === 'grupo' ? 'block' : 'none';
  }

  function onInviteScopeChange() {
    const v = document.getElementById('inviteScope').value;
    document.getElementById('inviteEmpresaGroup').style.display = v === 'empresa' ? '' : 'none';
  }

  function uploadCompanyLogo(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      alert('✅ Logo carregada com sucesso!');
    };
    reader.readAsDataURL(file);
  }

  function uploadUserPhoto(event, userId) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const avatarEl = document.getElementById('avatar_' + userId);
      if (avatarEl) avatarEl.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
      alert('✅ Foto atualizada!');
    };
    reader.readAsDataURL(file);
  }

  function previewEditUserPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('editUserAvatar').innerHTML = '<img src="' + e.target.result + '" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">';
    };
    reader.readAsDataURL(file);
  }
  </script>
  `
  return c.html(layout('Administração', content, 'admin'))
})

export default app
