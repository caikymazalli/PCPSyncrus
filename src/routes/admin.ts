import { Hono } from 'hono'
import { layout } from '../layout'
import { mockData } from '../data'

const app = new Hono()

app.get('/', (c) => {
  const { users } = mockData

  const roleLabel: Record<string, string> = {
    admin: 'Administrador', gestor_pcp: 'Gestor PCP', qualidade: 'Qualidade', operador: 'Operador'
  }
  const roleColor: Record<string, string> = {
    admin: '#1B4F72', gestor_pcp: '#27AE60', qualidade: '#8E44AD', operador: '#E67E22'
  }

  const content = `
  <div class="section-header">
    <div style="font-size:14px;color:#6c757d;">Configurações da empresa e gestão de usuários</div>
    <button class="btn btn-primary" onclick="openModal('convidarModal')" title="Convidar novo usuário para a empresa"><i class="fas fa-user-plus"></i> Convidar Usuário</button>
  </div>

  <div style="display:grid;grid-template-columns:300px 1fr;gap:20px;">
    <!-- Left sidebar -->
    <div style="display:flex;flex-direction:column;gap:16px;">
      <!-- Company card with logo upload -->
      <div class="card" style="padding:20px;text-align:center;">
        <!-- Logo upload area -->
        <div style="position:relative;width:80px;height:80px;margin:0 auto 12px;cursor:pointer;" onclick="document.getElementById('companyLogoInput').click()" title="Clique para fazer upload da logo da empresa">
          <div id="companyLogoWrapper" style="width:80px;height:80px;border-radius:16px;background:linear-gradient(135deg,#2980B9,#1B4F72);display:flex;align-items:center;justify-content:center;overflow:hidden;">
            <img id="companyLogoImg" src="" alt="" style="display:none;width:100%;height:100%;object-fit:contain;border-radius:16px;">
            <i id="companyLogoIcon" class="fas fa-industry" style="color:white;font-size:32px;"></i>
          </div>
          <div style="position:absolute;bottom:-4px;right:-4px;width:24px;height:24px;background:#27AE60;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;">
            <i class="fas fa-camera" style="color:white;font-size:10px;"></i>
          </div>
        </div>
        <input type="file" id="companyLogoInput" accept="image/*" style="display:none;" onchange="uploadCompanyLogo(event)">
        <div style="font-size:10px;color:#9ca3af;margin-bottom:8px;">Clique no ícone para carregar logo</div>

        <div style="font-size:17px;font-weight:800;color:#1B4F72;">Empresa Alpha</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">empresa@alpha.com.br</div>
        <div style="margin:12px 0;"><span class="badge badge-warning">Trial — 11 dias restantes</span></div>
        <button class="btn btn-secondary btn-sm" style="width:100%;" onclick="openModal('editEmpresaModal')" title="Editar informações da empresa"><i class="fas fa-edit"></i> Editar Empresa</button>
      </div>

      <!-- Plan info -->
      <div class="card" style="padding:20px;">
        <div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:12px;"><i class="fas fa-credit-card" style="margin-right:8px;"></i>Plano Atual</div>
        <div style="background:linear-gradient(135deg,#1B4F72,#2980B9);border-radius:10px;padding:14px;color:white;margin-bottom:12px;">
          <div style="font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:1px;">Trial Gratuito</div>
          <div style="font-size:20px;font-weight:800;margin-top:4px;">R$ 0<span style="font-size:13px;font-weight:400;opacity:0.7;">/mês</span></div>
          <div style="font-size:11px;opacity:0.7;margin-top:4px;">1 usuário • Recursos básicos</div>
        </div>
        <a href="/assinatura" class="btn btn-primary" style="width:100%;justify-content:center;" title="Ver planos disponíveis"><i class="fas fa-arrow-up"></i> Fazer Upgrade</a>
      </div>

      <!-- Quick Stats -->
      <div class="card" style="padding:20px;">
        <div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:12px;"><i class="fas fa-chart-bar" style="margin-right:8px;"></i>Resumo do Sistema</div>
        ${[
          { icon: 'fa-users', label: 'Usuários', value: users.length },
          { icon: 'fa-clipboard-list', label: 'Ordens Totais', value: mockData.productionOrders.length },
          { icon: 'fa-box', label: 'Produtos', value: mockData.products.length },
          { icon: 'fa-building', label: 'Plantas', value: mockData.plants.length },
          { icon: 'fa-cog', label: 'Máquinas', value: mockData.machines.length },
        ].map(s => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f3f5;">
          <div style="display:flex;align-items:center;gap:8px;">
            <i class="fas ${s.icon}" style="color:#9ca3af;font-size:13px;width:16px;"></i>
            <span style="font-size:13px;color:#6c757d;">${s.label}</span>
          </div>
          <span style="font-size:14px;font-weight:700;color:#1B4F72;">${s.value}</span>
        </div>`).join('')}
      </div>
    </div>

    <!-- Right content -->
    <div>
      <div data-tab-group="admin">
        <div class="tab-nav">
          <button class="tab-btn active" onclick="switchTab('tabUsuarios','admin')"><i class="fas fa-users" style="margin-right:6px;"></i>Usuários (${users.length})</button>
          <button class="tab-btn" onclick="switchTab('tabConfig','admin')"><i class="fas fa-sliders-h" style="margin-right:6px;"></i>Configurações</button>
          <button class="tab-btn" onclick="switchTab('tabLog','admin')"><i class="fas fa-history" style="margin-right:6px;"></i>Log de Atividades</button>
        </div>

        <!-- Usuários Tab -->
        <div class="tab-content active" id="tabUsuarios">
          <div class="card" style="overflow:hidden;">
            <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
              <h4 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;">Membros da Equipe</h4>
              <button class="btn btn-primary btn-sm" onclick="openModal('convidarModal')" title="Convidar novo usuário"><i class="fas fa-user-plus"></i> Convidar</button>
            </div>
            <div style="padding:8px 0;">
              ${users.map(u => `
              <div style="display:flex;align-items:center;gap:14px;padding:12px 20px;border-bottom:1px solid #f8f9fa;">
                <!-- Avatar with photo upload -->
                <div style="position:relative;cursor:pointer;" onclick="document.getElementById('userPhotoInput_${u.id}').click()" title="Clique para alterar foto do usuário">
                  <div class="avatar" id="avatar_${u.id}" style="background:${roleColor[u.role] || '#9ca3af'};">${u.name.split(' ').map(n => n[0]).slice(0,2).join('')}</div>
                  <div style="position:absolute;bottom:-2px;right:-2px;width:16px;height:16px;background:#27AE60;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1.5px solid white;">
                    <i class="fas fa-camera" style="color:white;font-size:7px;"></i>
                  </div>
                </div>
                <input type="file" id="userPhotoInput_${u.id}" accept="image/*" style="display:none;" onchange="uploadUserPhoto(event,'${u.id}')">
                <div style="flex:1;">
                  <div style="font-size:14px;font-weight:600;color:#374151;">${u.name}</div>
                  <div style="font-size:12px;color:#9ca3af;">${u.email}</div>
                </div>
                <span class="badge badge-primary" style="background:${roleColor[u.role] || '#9ca3af'}1A;color:${roleColor[u.role] || '#9ca3af'};">${roleLabel[u.role] || u.role}</span>
                <div style="display:flex;gap:4px;">
                  <div class="tooltip-wrap" data-tooltip="Editar usuário"><button class="btn btn-secondary btn-sm" onclick="openModal('editUserModal')"><i class="fas fa-edit"></i></button></div>
                  ${u.role !== 'admin' ? `<div class="tooltip-wrap" data-tooltip="Remover usuário"><button class="btn btn-danger btn-sm" onclick="if(confirm('Remover ${u.name}?')) alert('Usuário removido.')"><i class="fas fa-user-times"></i></button></div>` : ''}
                </div>
              </div>`).join('')}
            </div>
          </div>
        </div>

        <!-- Configurações Tab -->
        <div class="tab-content" id="tabConfig">
          <div class="card" style="padding:24px;">
            <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0 0 20px;">Configurações da Empresa</h4>

            <!-- Logo section in config -->
            <div style="display:flex;align-items:center;gap:20px;padding:16px;background:#f8f9fa;border-radius:10px;margin-bottom:20px;">
              <div style="position:relative;">
                <div id="configLogoWrapper" style="width:70px;height:70px;border-radius:12px;background:linear-gradient(135deg,#2980B9,#1B4F72);display:flex;align-items:center;justify-content:center;overflow:hidden;">
                  <img id="configLogoImg" src="" style="display:none;width:100%;height:100%;object-fit:contain;border-radius:12px;">
                  <i id="configLogoIcon" class="fas fa-industry" style="color:white;font-size:28px;"></i>
                </div>
              </div>
              <div style="flex:1;">
                <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:6px;">Logo da Empresa</div>
                <div style="font-size:12px;color:#6c757d;margin-bottom:10px;">Formatos: PNG, JPG, SVG • Recomendado: 200×200px</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  <button class="btn btn-secondary btn-sm" onclick="document.getElementById('configLogoInput').click()" title="Fazer upload de nova logo">
                    <i class="fas fa-upload"></i> Upload Logo
                  </button>
                  <input type="file" id="configLogoInput" accept="image/*" style="display:none;" onchange="uploadConfigLogo(event)">
                  <button class="btn btn-secondary btn-sm" onclick="alert('Câmera ativada para foto da logo!')" title="Tirar foto">
                    <i class="fas fa-camera"></i> Câmera
                  </button>
                  <button class="btn btn-danger btn-sm" onclick="removeCompanyLogo()" title="Remover logo atual">
                    <i class="fas fa-trash"></i> Remover
                  </button>
                </div>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div class="form-group"><label class="form-label">Nome da Empresa</label><input class="form-control" type="text" value="Empresa Alpha"></div>
              <div class="form-group"><label class="form-label">E-mail Administrativo</label><input class="form-control" type="email" value="empresa@alpha.com.br"></div>
              <div class="form-group"><label class="form-label">Cor Primária</label>
                <div style="display:flex;gap:8px;align-items:center;">
                  <input type="color" value="#1B4F72" style="width:40px;height:36px;border:1.5px solid #d1d5db;border-radius:6px;cursor:pointer;" title="Selecionar cor primária">
                  <input class="form-control" type="text" value="#1B4F72" style="font-family:monospace;">
                </div>
              </div>
              <div class="form-group"><label class="form-label">Cor de Destaque</label>
                <div style="display:flex;gap:8px;align-items:center;">
                  <input type="color" value="#E67E22" style="width:40px;height:36px;border:1.5px solid #d1d5db;border-radius:6px;cursor:pointer;" title="Selecionar cor de destaque">
                  <input class="form-control" type="text" value="#E67E22" style="font-family:monospace;">
                </div>
              </div>
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
              <button class="btn btn-secondary" title="Restaurar configurações padrão">Restaurar Padrões</button>
              <button class="btn btn-primary" onclick="alert('Configurações salvas!')" title="Salvar alterações"><i class="fas fa-save"></i> Salvar Configurações</button>
            </div>
          </div>
        </div>

        <!-- Log Tab -->
        <div class="tab-content" id="tabLog">
          <div class="card" style="overflow:hidden;">
            <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;">
              <h4 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;">Atividades Recentes</h4>
            </div>
            <div style="padding:8px 0;">
              ${[
                { user: 'Carlos Silva', action: 'criou a Ordem de Produção', target: 'OP-2024-007', time: 'há 2h', icon: 'fa-plus', color: '#27AE60' },
                { user: 'Ana Souza', action: 'atualizou o status de', target: 'OP-2024-002 para Em Progresso', time: 'há 3h', icon: 'fa-edit', color: '#3498DB' },
                { user: 'João Ferreira', action: 'registrou apontamento na', target: 'OP-2024-002', time: 'há 5h', icon: 'fa-check', color: '#27AE60' },
                { user: 'Carlos Silva', action: 'fez upload da logo da empresa', target: 'Empresa Alpha', time: 'há 6h', icon: 'fa-image', color: '#8E44AD' },
                { user: 'Maria Santos', action: 'aprovou instrução', target: 'IT-CNC-001', time: 'há 2d', icon: 'fa-thumbs-up', color: '#27AE60' },
                { user: 'Ana Souza', action: 'gerou relatório MRP para', target: 'Fevereiro 2024', time: 'há 2d', icon: 'fa-chart-bar', color: '#8E44AD' },
              ].map(log => `
              <div style="display:flex;gap:12px;padding:12px 20px;border-bottom:1px solid #f8f9fa;">
                <div style="width:32px;height:32px;border-radius:50%;background:${log.color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <i class="fas ${log.icon}" style="color:${log.color};font-size:13px;"></i>
                </div>
                <div style="flex:1;">
                  <div style="font-size:13px;color:#374151;"><strong>${log.user}</strong> ${log.action} <strong style="color:#1B4F72;">${log.target}</strong></div>
                  <div style="font-size:11px;color:#9ca3af;margin-top:2px;">${log.time}</div>
                </div>
              </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Edit User Modal (with photo) -->
  <div class="modal-overlay" id="editUserModal">
    <div class="modal" style="max-width:440px;">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-user-edit" style="margin-right:8px;"></i>Editar Usuário</h3>
        <button onclick="closeModal('editUserModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:24px;">
        <!-- Profile Photo -->
        <div style="text-align:center;margin-bottom:20px;">
          <div style="position:relative;width:80px;height:80px;margin:0 auto;">
            <div id="editUserAvatar" style="width:80px;height:80px;border-radius:50%;background:#2980B9;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:white;overflow:hidden;">
              CS
            </div>
            <div style="position:absolute;bottom:0;right:0;width:24px;height:24px;background:#27AE60;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;cursor:pointer;" onclick="document.getElementById('editUserPhotoInput').click()" title="Alterar foto do perfil">
              <i class="fas fa-camera" style="color:white;font-size:10px;"></i>
            </div>
          </div>
          <input type="file" id="editUserPhotoInput" accept="image/*" style="display:none;" onchange="previewEditUserPhoto(event)">
          <div style="font-size:11px;color:#9ca3af;margin-top:8px;">Clique no ícone para alterar foto</div>
        </div>
        <div class="form-group"><label class="form-label">Nome Completo</label><input class="form-control" type="text" value="Carlos Silva"></div>
        <div class="form-group"><label class="form-label">E-mail</label><input class="form-control" type="email" value="carlos@empresa.com"></div>
        <div class="form-group"><label class="form-label">Função / Perfil</label>
          <select class="form-control">
            <option value="operador">Operador</option>
            <option value="qualidade">Qualidade</option>
            <option value="gestor_pcp">Gestor PCP</option>
            <option value="admin" selected>Administrador</option>
          </select>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('editUserModal')" class="btn btn-secondary">Cancelar</button>
        <button onclick="alert('Usuário atualizado!');closeModal('editUserModal')" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <!-- Convidar Modal -->
  <div class="modal-overlay" id="convidarModal">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:#1B4F72;"><i class="fas fa-user-plus" style="margin-right:8px;"></i>Convidar Usuário</h3>
        <button onclick="closeModal('convidarModal')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">×</button>
      </div>
      <div style="padding:20px 24px;">
        <div class="form-group"><label class="form-label">Nome Completo *</label><input class="form-control" type="text" placeholder="Nome do usuário"></div>
        <div class="form-group"><label class="form-label">E-mail *</label><input class="form-control" type="email" placeholder="email@empresa.com"></div>
        <div class="form-group"><label class="form-label">Função / Perfil *</label>
          <select class="form-control">
            <option value="operador">Operador</option>
            <option value="qualidade">Qualidade</option>
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
        <button onclick="alert('Convite enviado!');closeModal('convidarModal')" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Enviar Convite</button>
      </div>
    </div>
  </div>

  <script>
  function uploadCompanyLogo(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.getElementById('companyLogoImg');
      const icon = document.getElementById('companyLogoIcon');
      img.src = e.target.result;
      img.style.display = 'block';
      icon.style.display = 'none';
      // Also update config tab logo
      document.getElementById('configLogoImg').src = e.target.result;
      document.getElementById('configLogoImg').style.display = 'block';
      document.getElementById('configLogoIcon').style.display = 'none';
      alert('✅ Logo da empresa carregada com sucesso!');
    };
    reader.readAsDataURL(file);
  }

  function uploadConfigLogo(event) {
    uploadCompanyLogo(event);
  }

  function removeCompanyLogo() {
    if (!confirm('Remover a logo da empresa?')) return;
    document.getElementById('companyLogoImg').style.display = 'none';
    document.getElementById('companyLogoIcon').style.display = '';
    document.getElementById('configLogoImg').style.display = 'none';
    document.getElementById('configLogoIcon').style.display = '';
    alert('Logo removida.');
  }

  function uploadUserPhoto(event, userId) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const avatarEl = document.getElementById('avatar_' + userId);
      if (avatarEl) {
        avatarEl.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
      }
      alert('✅ Foto do usuário atualizada!');
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
