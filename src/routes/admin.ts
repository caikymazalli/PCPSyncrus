import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxSession } from '../sessionHelper'
import { resolveEmailConfig, sendEmail, templateInvite } from '../emailService'

const app = new Hono<{ Bindings: { DB: D1Database } }>()

// ── GET / — painel de administração ─────────────────────────────────────────────
app.get('/', async (c) => {
  const tenant   = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const session  = getCtxSession(c)
  const db       = c.env?.DB || null

  const userName    = userInfo.nome    || 'Usuário'
  const userEmail   = session?.email   || ''
  const userEmpresa = userInfo.empresa || 'Minha Empresa'
  const userPlano   = userInfo.plano   || 'starter'
  const userRole    = userInfo.role    || 'admin'
  const trialEnd    = userInfo.trialEnd || ''
  const isDemo      = userInfo.isDemo  || false
  const userId      = session?.userId  || ''

  const trialDaysLeft = trialEnd
    ? Math.max(0, Math.ceil((new Date(trialEnd).getTime() - Date.now()) / 86400000))
    : 14

  // Labels e cores de perfil
  const roleLabel: Record<string, string> = {
    admin: 'Administrador', gestor_pcp: 'Gestor PCP', qualidade: 'Qualidade',
    operador: 'Operador', compras: 'Compras', grupo_admin: 'Admin do Grupo',
    user: 'Usuário', viewer: 'Visualizador'
  }
  const roleColor: Record<string, string> = {
    admin: '#1B4F72', gestor_pcp: '#27AE60', qualidade: '#8E44AD',
    operador: '#E67E22', compras: '#2980B9', grupo_admin: '#dc2626',
    user: '#6c757d', viewer: '#9ca3af'
  }

  const plants  = tenant.plants  || []

  // ── Carregar membros da empresa do D1 ─────────────────────────────────────
  // Inclui: o próprio dono (owner_id IS NULL) + todos os convidados (owner_id = ownerId)
  // Se o usuário logado for um membro convidado (tem ownerId), usa o ownerId para buscar
  // os colegas de empresa. Caso contrário, usa o próprio userId como ownerId da empresa.

  // Determinar o "dono" da empresa:
  // Buscamos o owner_id do usuário logado no D1 para descobrir se ele é dono ou membro convidado
  let userOwnerId: string | null = null
  if (db && !isDemo && userId) {
    try {
      const myRow = await db.prepare(
        'SELECT owner_id FROM registered_users WHERE id = ? AND is_demo = 0'
      ).bind(userId).first() as any
      userOwnerId = myRow?.owner_id || null
    } catch {}
  }
  // Se não há owner_id, este usuário é o dono; caso contrário, o dono é quem o convidou
  const companyOwnerId = userOwnerId || userId   // userId do dono real da empresa
  const isOwnerAccount = !userOwnerId            // true se este usuário é o dono

  const currentUserEntry = {
    id:          userId,
    name:        userName,
    email:       userEmail,
    role:        userRole,
    empresaName: userEmpresa,
    isOwner:     isOwnerAccount,
    lastLogin:   null as string | null,
  }

  let dbMembers: Array<{
    id: string; name: string; email: string; role: string
    empresaName: string; isOwner: boolean; lastLogin: string | null
  }> = []

  if (db && !isDemo) {
    try {
      // Busca: o dono + todos os membros convidados (owner_id = companyOwnerId)
      const rows = await db.prepare(
        `SELECT id, nome, sobrenome, email, role, last_login, owner_id
         FROM registered_users
         WHERE (id = ? OR owner_id = ?) AND is_demo = 0
         ORDER BY owner_id ASC, created_at ASC`
      ).bind(companyOwnerId, companyOwnerId).all()

      for (const row of (rows.results || []) as any[]) {
        const isThisOwner = !row.owner_id // sem owner_id = é o dono
        dbMembers.push({
          id:          row.id,
          name:        row.nome + (row.sobrenome ? ' ' + row.sobrenome : ''),
          email:       row.email,
          role:        row.role || 'user',
          empresaName: userEmpresa,
          isOwner:     isThisOwner,
          lastLogin:   row.last_login || null,
        })
      }
    } catch {
      // Fallback: pelo menos o usuário atual
      dbMembers = [currentUserEntry]
    }
  } else {
    dbMembers = [currentUserEntry]
  }

  // Garantir que o usuário atual está sempre na lista
  if (!dbMembers.find(m => m.id === userId)) {
    dbMembers.unshift(currentUserEntry)
  }

  const allUsers = dbMembers
  const empresas = [{
    id: 'e1', name: userEmpresa, cnpj: '', city: '', state: '',
    type: 'matriz', status: 'ativa', users: allUsers.length, plants: plants.length
  }]

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

  // Carregar todos os convites do D1 (sempre usando o ID do dono da empresa)
  let pendingInvites: any[] = []
  let acceptedInvites: any[] = []
  if (db && !isDemo) {
    try {
      const rows = await db.prepare(
        `SELECT * FROM invites WHERE user_id = ? ORDER BY created_at DESC LIMIT 40`
      ).bind(companyOwnerId).all()
      const allInvites = rows.results as any[]
      pendingInvites  = allInvites.filter((i: any) => i.status === 'pending')
      acceptedInvites = allInvites.filter((i: any) => i.status === 'accepted').slice(0, 10)
    } catch {}
  }

  // Config de e-mail (sempre do dono da empresa)
  let emailConfigExists = false
  if (db && !isDemo) {
    try {
      const cfg = await db.prepare('SELECT id FROM email_config WHERE user_id = ? AND active = 1').bind(companyOwnerId).first()
      emailConfigExists = !!cfg
    } catch {}
  }

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

      <!-- Plano atual -->
      <div class="card" style="padding:20px;">
        <div style="font-size:13px;font-weight:700;color:#1B4F72;margin-bottom:12px;"><i class="fas fa-credit-card" style="margin-right:8px;"></i>Plano Atual</div>
        <div style="background:linear-gradient(135deg,${planoColor[userPlano]||'#27AE60'},${planoColor[userPlano]||'#1e8449'});border-radius:10px;padding:14px;color:white;margin-bottom:8px;">
          <div style="font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:1px;">${planoBilling}</div>
          <div style="font-size:20px;font-weight:800;margin-top:4px;">${planoValor[userPlano] || 'R$ 0'}<span style="font-size:13px;font-weight:400;opacity:0.7;">/mês</span></div>
        </div>
        ${!isDemo && trialDaysLeft > 0 ? `
        <div style="font-size:11px;color:#9ca3af;text-align:center;margin-bottom:10px;">
          <i class="fas fa-clock" style="margin-right:4px;color:#E67E22;"></i>${trialDaysLeft} dias restantes
        </div>
        <a href="/assinatura" class="btn btn-primary" style="width:100%;justify-content:center;"><i class="fas fa-arrow-up"></i> Fazer Upgrade</a>` : `
        <a href="/assinatura" class="btn btn-secondary" style="width:100%;justify-content:center;"><i class="fas fa-credit-card"></i> Gerenciar Plano</a>`}
      </div>

      <!-- Status e-mail -->
      <div class="card" style="padding:16px 20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:700;color:#1B4F72;"><i class="fas fa-envelope" style="margin-right:8px;"></i>E-mail</div>
          <span style="font-size:11px;padding:2px 8px;border-radius:6px;${emailConfigExists ? 'background:#f0fdf4;color:#16a34a;' : 'background:#fff7ed;color:#d97706;'}font-weight:700;">
            ${emailConfigExists ? '✓ Configurado' : '⚠ Não configurado'}
          </span>
        </div>
        <div style="font-size:12px;color:#6c757d;margin-bottom:10px;">
          ${emailConfigExists ? 'Convites e resets serão enviados por e-mail.' : 'Configure para enviar convites e resets por e-mail.'}
        </div>
        <button class="btn btn-secondary btn-sm" style="width:100%;" onclick="switchTab('tabEmail','admin')">
          <i class="fas fa-cog"></i> Configurar E-mail
        </button>
      </div>
    </div>

    <!-- Coluna direita: abas -->
    <div>
      <div data-tab-group="admin">
        <div class="tab-nav" style="overflow-x:auto;white-space:nowrap;">
          <button class="tab-btn active" onclick="switchTab('tabUsuarios','admin')"><i class="fas fa-users" style="margin-right:6px;"></i>Usuários</button>
          <button class="tab-btn" onclick="switchTab('tabConvites','admin')"><i class="fas fa-paper-plane" style="margin-right:6px;"></i>Convites ${pendingInvites.length > 0 ? `<span style="background:#dc2626;color:white;border-radius:10px;padding:1px 6px;font-size:10px;margin-left:4px;">${pendingInvites.length}</span>` : ''}</button>
          <button class="tab-btn" onclick="switchTab('tabEmpresas','admin')"><i class="fas fa-building" style="margin-right:6px;"></i>Empresas</button>
          <button class="tab-btn" onclick="switchTab('tabPermissoes','admin')"><i class="fas fa-shield-alt" style="margin-right:6px;"></i>Permissões</button>
          <button class="tab-btn" onclick="switchTab('tabEmail','admin')"><i class="fas fa-envelope" style="margin-right:6px;"></i>E-mail</button>
          <button class="tab-btn" onclick="switchTab('tabConfig','admin')"><i class="fas fa-sliders-h" style="margin-right:6px;"></i>Configurações</button>
        </div>

        <!-- Aba: Usuários -->
        <div class="tab-content active" id="tabUsuarios">
          <div class="card" style="overflow:hidden;">
            <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <h4 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;">
                <i class="fas fa-users" style="margin-right:8px;color:#2980B9;"></i>
                Membros e Colaboradores
                <span style="font-size:12px;font-weight:400;color:#9ca3af;margin-left:8px;">${allUsers.length} ${allUsers.length === 1 ? 'membro' : 'membros'}</span>
              </h4>
              <button class="btn btn-primary btn-sm" onclick="openModal('convidarModal')"><i class="fas fa-user-plus"></i> Convidar</button>
            </div>
            <div id="usersListContainer">
              ${allUsers.length === 0 ? `
              <div style="padding:40px 20px;text-align:center;color:#9ca3af;">
                <i class="fas fa-users" style="font-size:32px;margin-bottom:12px;display:block;opacity:0.3;"></i>
                <p style="margin:0;">Nenhum membro ainda.</p>
              </div>` : allUsers.map((u: any) => `
              <div style="display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid #f8f9fa;transition:background 0.1s;" onmouseenter="this.style.background='#f8f9fa'" onmouseleave="this.style.background=''">
                <!-- Avatar com iniciais -->
                <div style="width:40px;height:40px;border-radius:50%;background:${(roleColor as any)[u.role] || '#9ca3af'};color:white;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0;">
                  ${u.name.split(' ').filter(Boolean).slice(0,2).map((n: string) => n[0].toUpperCase()).join('')}
                </div>
                <!-- Info -->
                <div style="flex:1;min-width:0;">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="font-size:14px;font-weight:600;color:#374151;">${u.name}</span>
                    ${u.isOwner ? `<span style="font-size:10px;background:#e8f4fd;color:#2980B9;border-radius:4px;padding:1px 6px;font-weight:700;">DONO</span>` : ''}
                  </div>
                  <div style="font-size:12px;color:#9ca3af;margin-top:1px;">${u.email}</div>
                  ${u.lastLogin ? `<div style="font-size:11px;color:#d1d5db;margin-top:1px;"><i class="fas fa-clock" style="font-size:9px;"></i> Último acesso: ${new Date(u.lastLogin).toLocaleDateString('pt-BR')}</div>` : ''}
                </div>
                <!-- Empresa -->
                <div style="text-align:center;min-width:110px;">
                  <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:3px;">Empresa</div>
                  <span style="font-size:11px;background:#f8f9fa;color:#374151;border-radius:6px;padding:3px 8px;font-weight:600;">
                    <i class="fas fa-building" style="font-size:9px;color:#2980B9;"></i> ${u.empresaName || userEmpresa}
                  </span>
                </div>
                <!-- Perfil -->
                <div style="text-align:center;min-width:90px;">
                  <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:3px;">Perfil</div>
                  <span style="font-size:11px;padding:3px 10px;border-radius:20px;font-weight:700;background:${(roleColor as any)[u.role] || '#9ca3af'}18;color:${(roleColor as any)[u.role] || '#9ca3af'};">
                    ${(roleLabel as any)[u.role] || u.role}
                  </span>
                </div>
                <!-- Ações (apenas membros não-donos e conta real) -->
                ${!u.isOwner && !isDemo ? `
                <div style="display:flex;gap:6px;">
                  <button class="btn btn-secondary btn-sm" onclick="removeMember('${u.id}','${u.name.replace(/'/g,'')}')" title="Remover membro" style="color:#dc2626;border-color:#fecaca;">
                    <i class="fas fa-user-times"></i>
                  </button>
                </div>` : ''}
              </div>`).join('')}
            </div>
          </div>
        </div>

        <!-- Aba: Convites -->
        <div class="tab-content" id="tabConvites">
          <div class="card" style="overflow:hidden;">
            <div style="padding:14px 20px;border-bottom:1px solid #f1f3f5;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <h4 style="margin:0;font-size:15px;font-weight:700;color:#1B4F72;"><i class="fas fa-paper-plane" style="margin-right:8px;"></i>Convites Enviados</h4>
              <button class="btn btn-primary btn-sm" onclick="openModal('convidarModal')"><i class="fas fa-plus"></i> Novo Convite</button>
            </div>
            ${pendingInvites.length === 0 ? `
            <div style="padding:40px 20px;text-align:center;color:#9ca3af;">
              <i class="fas fa-paper-plane" style="font-size:32px;margin-bottom:12px;display:block;opacity:0.3;"></i>
              <p style="margin:0 0 12px;">Nenhum convite enviado ainda.</p>
              <button class="btn btn-primary btn-sm" onclick="openModal('convidarModal')">
                <i class="fas fa-user-plus"></i> Convidar Usuário
              </button>
            </div>` : `
            <div style="overflow-x:auto;">
              <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead><tr style="background:#f8f9fa;border-bottom:2px solid #e9ecef;">
                  <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">E-mail Convidado</th>
                  <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">Nome</th>
                  <th style="padding:10px 16px;text-align:center;font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">Função</th>
                  <th style="padding:10px 16px;text-align:center;font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">Status</th>
                  <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">Expira</th>
                  <th style="padding:10px 16px;text-align:center;font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;">Ações</th>
                </tr></thead>
                <tbody>
                  ${pendingInvites.map((inv: any) => {
                    const expDate = new Date(inv.expires_at)
                    const expired = expDate < new Date()
                    const roleL: Record<string,string> = { admin:'Admin', user:'Usuário', viewer:'Visualizador', operador:'Operador', gestor_pcp:'Gestor PCP', qualidade:'Qualidade', compras:'Compras' }
                    return `<tr style="border-bottom:1px solid #f1f3f5;">
                      <td style="padding:10px 16px;font-weight:600;color:#374151;">${inv.email}</td>
                      <td style="padding:10px 16px;color:#6c757d;">${inv.nome || '—'}</td>
                      <td style="padding:10px 16px;text-align:center;"><span class="badge" style="background:#e8f4fd;color:#2980B9;">${roleL[inv.role] || inv.role}</span></td>
                      <td style="padding:10px 16px;text-align:center;">
                        <span class="badge" style="${expired ? 'background:#fef2f2;color:#dc2626;' : 'background:#fff7ed;color:#d97706;'}">
                          ${expired ? 'Expirado' : 'Pendente'}
                        </span>
                      </td>
                      <td style="padding:10px 16px;font-size:11px;color:#9ca3af;">${expDate.toLocaleDateString('pt-BR')}</td>
                      <td style="padding:10px 16px;text-align:center;">
                        <button class="btn btn-secondary btn-sm" onclick="copyInviteLink('${inv.token}')" title="Copiar link">
                          <i class="fas fa-copy"></i>
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="cancelInvite('${inv.id}')" title="Cancelar" style="color:#dc2626;margin-left:4px;">
                          <i class="fas fa-times"></i>
                        </button>
                      </td>
                    </tr>`
                  }).join('')}
                </tbody>
              </table>
            </div>`}
          </div>
        </div>

        <!-- Aba: Empresas -->
        <div class="tab-content" id="tabEmpresas">
          <div style="display:flex;flex-direction:column;gap:16px;">
            ${empresas.map((e: any) => `
            <div class="card" style="padding:0;overflow:hidden;border-left:4px solid #2980B9;">
              <div style="padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                <div style="display:flex;align-items:center;gap:14px;">
                  <div style="width:48px;height:48px;border-radius:12px;background:#e8f4fd;display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-star" style="font-size:20px;color:#2980B9;"></i>
                  </div>
                  <div>
                    <div style="font-size:16px;font-weight:800;color:#1B4F72;">${e.name}</div>
                    <div style="font-size:12px;color:#6c757d;">${e.cnpj ? 'CNPJ: ' + e.cnpj : 'CNPJ não cadastrado'}</div>
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

        <!-- Aba: E-mail -->
        <div class="tab-content" id="tabEmail">
          <div class="card" style="padding:24px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
              <h4 style="font-size:15px;font-weight:700;color:#1B4F72;margin:0;">
                <i class="fas fa-envelope" style="margin-right:8px;"></i>Configuração de E-mail
              </h4>
              <span style="font-size:11px;padding:3px 10px;border-radius:6px;${emailConfigExists ? 'background:#f0fdf4;color:#16a34a;' : 'background:#fff7ed;color:#d97706;'}font-weight:700;">
                ${emailConfigExists ? '✓ Configurado' : '⚠ Não configurado'}
              </span>
            </div>

            <div style="background:#e8f4fd;border:1px solid #bae6fd;border-radius:10px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:#0369a1;">
              <i class="fas fa-info-circle" style="margin-right:8px;"></i>
              Configure sua chave Resend para enviar convites e resets de senha por e-mail.
              <a href="https://resend.com" target="_blank" style="color:#2980B9;font-weight:700;margin-left:4px;">
                Criar conta gratuita no Resend →
              </a>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div class="form-group" style="grid-column:span 2;">
                <label class="form-label">Resend API Key *</label>
                <div style="position:relative;">
                  <input class="form-control" type="password" id="cfgEmailApiKey" placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxx"
                    style="padding-right:80px;"
                    oninput="document.getElementById('apiKeyHint').style.display=this.value?'block':'none'">
                  <button type="button" onclick="toggleApiKeyVis()" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#9ca3af;font-size:12px;padding:4px 8px;">
                    <i class="fas fa-eye" id="apiKeyEye"></i>
                  </button>
                </div>
                <div id="apiKeyHint" style="display:none;font-size:11px;color:#16a34a;margin-top:4px;">
                  <i class="fas fa-check-circle"></i> Chave inserida
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">E-mail Remetente</label>
                <input class="form-control" type="email" id="cfgFromEmail" placeholder="noreply@suaempresa.com" value="noreply@pcpsyncrus.com.br">
              </div>
              <div class="form-group">
                <label class="form-label">Nome Remetente</label>
                <input class="form-control" type="text" id="cfgFromName" placeholder="PCP Syncrus" value="${userEmpresa}">
              </div>
              <div class="form-group" style="grid-column:span 2;">
                <label class="form-label">E-mail de Resposta (Reply-To)</label>
                <input class="form-control" type="email" id="cfgReplyTo" placeholder="suporte@suaempresa.com" value="${userEmail}">
              </div>
            </div>

            <div style="margin-top:16px;padding:14px 18px;background:#f8f9fa;border-radius:10px;">
              <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">Funcionalidades habilitadas com e-mail configurado:</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                ${[
                  ['fa-user-plus', 'Convite de usuários por link'],
                  ['fa-key', 'Reset de senha por e-mail'],
                  ['fa-bell', 'Notificações de sistema'],
                  ['fa-file-alt', 'Relatórios automáticos'],
                ].map(([icon, label]) => `
                <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#374151;">
                  <i class="fas ${icon}" style="color:#27AE60;width:14px;"></i>${label}
                </div>`).join('')}
              </div>
            </div>

            <div style="margin-top:20px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;">
              <button class="btn btn-secondary" onclick="testEmail()"><i class="fas fa-vial"></i> Testar Envio</button>
              <button class="btn btn-primary" onclick="saveEmailConfig()"><i class="fas fa-save"></i> Salvar Configuração</button>
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
        <div class="form-group"><label class="form-label">Nome do Convidado</label><input class="form-control" id="inviteNome" type="text" placeholder="Nome do usuário (opcional)"></div>
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
        <div id="inviteInfo" style="background:#e8f4fd;border-radius:8px;padding:12px;margin-top:4px;font-size:12px;color:#1B4F72;">
          <i class="fas fa-info-circle" style="margin-right:6px;"></i>
          O usuário receberá um link de convite por e-mail (se configurado) ou você poderá copiar e enviar manualmente.
        </div>
        <div id="inviteResult" style="display:none;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;margin-top:8px;">
          <div style="font-size:12px;font-weight:700;color:#16a34a;margin-bottom:6px;"><i class="fas fa-check-circle" style="margin-right:6px;"></i>Convite criado!</div>
          <div style="font-size:11px;color:#374151;margin-bottom:6px;">Copie e envie este link ao convidado:</div>
          <div style="display:flex;gap:6px;align-items:center;">
            <input type="text" id="inviteLinkInput" readonly style="flex:1;font-size:11px;padding:6px 10px;border:1px solid #e9ecef;border-radius:6px;background:#f8f9fa;">
            <button onclick="copyFromInput()" class="btn btn-secondary btn-sm"><i class="fas fa-copy"></i></button>
          </div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f3f5;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="closeModal('convidarModal')" class="btn btn-secondary">Fechar</button>
        <button onclick="sendInvite()" class="btn btn-primary" id="btnSendInvite"><i class="fas fa-paper-plane"></i> Enviar Convite</button>
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
          A inclusão de empresa/filial adicional tem custo de 50% da assinatura.
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
        <button onclick="showToast('Empresa atualizada!','success');closeModal('editEmpresaModal')" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <script>
  function saveConfig() { showToast('Configurações salvas!', 'success'); }

  async function sendInvite() {
    const email = document.getElementById('inviteEmail').value.trim();
    const nome  = document.getElementById('inviteNome').value.trim();
    const role  = document.getElementById('inviteRole').value;
    if (!email) { showToast('Informe o e-mail do convidado.', 'error'); return; }
    
    const btn = document.getElementById('btnSendInvite');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    try {
      const res = await fetch('/admin/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, nome, role })
      });
      const data = await res.json();
      if (data.ok) {
        document.getElementById('inviteResult').style.display = 'block';
        document.getElementById('inviteLinkInput').value = data.inviteUrl;
        document.getElementById('inviteInfo').style.display = 'none';
        btn.style.display = 'none';
        if (data.emailSent) {
          showToast('Convite enviado por e-mail para ' + email + '!', 'success');
        } else {
          showToast('Convite criado! Copie o link abaixo.', 'success');
        }
      } else {
        showToast(data.error || 'Erro ao criar convite.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Convite';
      }
    } catch {
      showToast('Erro de rede.', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Convite';
    }
  }

  function copyFromInput() {
    const inp = document.getElementById('inviteLinkInput');
    navigator.clipboard.writeText(inp.value).then(() => showToast('Link copiado!', 'success'));
  }

  function copyInviteLink(token) {
    const url = window.location.origin + '/invite/' + token;
    navigator.clipboard.writeText(url).then(() => showToast('Link copiado!', 'success'));
  }

  async function cancelInvite(id) {
    if (!confirm('Cancelar este convite?')) return;
    const res = await fetch('/admin/api/invite/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.ok) { showToast('Convite cancelado.', 'success'); setTimeout(() => location.reload(), 800); }
    else showToast(data.error || 'Erro.', 'error');
  }

  async function saveEmailConfig() {
    const apiKey   = document.getElementById('cfgEmailApiKey').value.trim();
    const from     = document.getElementById('cfgFromEmail').value.trim();
    const fromName = document.getElementById('cfgFromName').value.trim();
    const replyTo  = document.getElementById('cfgReplyTo').value.trim();
    if (!apiKey) { showToast('Informe a Resend API Key.', 'error'); return; }
    if (!from)   { showToast('Informe o e-mail remetente.', 'error'); return; }

    const res = await fetch('/admin/api/email-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, fromEmail: from, fromName, replyTo })
    });
    const data = await res.json();
    if (data.ok) { showToast('Configuração de e-mail salva!', 'success'); setTimeout(() => location.reload(), 1200); }
    else showToast(data.error || 'Erro ao salvar.', 'error');
  }

  async function testEmail() {
    const apiKey   = document.getElementById('cfgEmailApiKey').value.trim();
    const from     = document.getElementById('cfgFromEmail').value.trim();
    const fromName = document.getElementById('cfgFromName').value.trim();
    if (!apiKey) { showToast('Salve a configuração antes de testar.', 'error'); return; }
    showToast('Enviando e-mail de teste...', 'success');
    const res = await fetch('/admin/api/email-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, fromEmail: from, fromName })
    });
    const data = await res.json();
    if (data.ok) showToast('E-mail de teste enviado com sucesso!', 'success');
    else showToast('Falha: ' + (data.error || 'verifique a API key.'), 'error');
  }

  function toggleApiKeyVis() {
    const inp  = document.getElementById('cfgEmailApiKey');
    const icon = document.getElementById('apiKeyEye');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    icon.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
  }

  function saveNovaEmpresa() {
    const razao = document.getElementById('novaEmpRazao').value.trim();
    if (!razao) { showToast('Informe a Razão Social da empresa.', 'error'); return; }
    showToast('Solicitação registrada! Você receberá instruções por e-mail.', 'success');
    closeModal('novaEmpresaModal');
  }

  async function removeMember(id, name) {
    if (!confirm('Remover ' + name + ' da empresa? O acesso deste usuário será revogado.')) return;
    const res = await fetch('/admin/api/remove-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(name + ' removido da empresa.', 'success');
      setTimeout(() => location.reload(), 900);
    } else {
      showToast(data.error || 'Erro ao remover.', 'error');
    }
  }
  </script>
  `
  return c.html(layout('Administração', content, 'admin', userInfo))
})

// ── POST /api/invite — criar convite de usuário ────────────────────────────────
app.post('/api/invite', async (c) => {
  const session  = getCtxSession(c)
  const userInfo = getCtxUserInfo(c)
  const db       = c.env?.DB || null

  if (!session || session.isDemo) return c.json({ ok: false, error: 'Não autorizado.' }, 401)
  if (!db) return c.json({ ok: false, error: 'Banco indisponível.' }, 503)

  const body  = await c.req.json() as any
  const email = (body.email || '').trim().toLowerCase()
  const nome  = (body.nome  || '').trim()
  const role  = body.role   || 'user'

  if (!email) return c.json({ ok: false, error: 'E-mail obrigatório.' })

  // Verificar se já tem conta
  const exists = await db.prepare('SELECT id FROM registered_users WHERE email = ?').bind(email).first()
  if (exists) return c.json({ ok: false, error: 'Este e-mail já possui uma conta.' })

  // Verificar convite pendente
  const pending = await db.prepare(
    `SELECT id FROM invites WHERE email = ? AND user_id = ? AND status = 'pending' AND expires_at > datetime('now')`
  ).bind(email, session.userId).first()
  if (pending) return c.json({ ok: false, error: 'Já existe um convite pendente para este e-mail.' })

  // Criar token de convite
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  const token = Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('')
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString() // 7 dias
  const id = 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2,6)

  await db.prepare(
    'INSERT INTO invites (id, user_id, email, nome, role, token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, session.userId, email, nome || null, role, token, expiresAt).run()

  const origin    = new URL(c.req.url).origin
  const inviteUrl = `${origin}/invite/${token}`

  // Tentar enviar e-mail
  let emailSent = false
  const cfg = await resolveEmailConfig(c.env, db, session.userId)
  if (cfg) {
    const result = await sendEmail(cfg, {
      to:      email,
      subject: `Você foi convidado para o PCP Syncrus — ${userInfo.empresa || 'Empresa'}`,
      html:    templateInvite({
        inviterName: session.nome,
        empresa:     userInfo.empresa || 'PCP Syncrus',
        inviteUrl,
        role,
        expiresIn:   '7 dias',
      }),
      type:    'invite',
      userId:  session.userId,
    }, db)
    emailSent = result.ok
  }

  return c.json({ ok: true, inviteUrl, emailSent, token })
})

// ── POST /api/invite/cancel — cancelar convite ─────────────────────────────────
app.post('/api/invite/cancel', async (c) => {
  const session = getCtxSession(c)
  const db      = c.env?.DB || null
  if (!session || session.isDemo) return c.json({ ok: false, error: 'Não autorizado.' }, 401)
  if (!db) return c.json({ ok: false, error: 'Banco indisponível.' }, 503)

  const body = await c.req.json() as any
  await db.prepare(
    `UPDATE invites SET status = 'cancelled' WHERE id = ? AND user_id = ?`
  ).bind(body.id, session.userId).run()

  return c.json({ ok: true })
})

// ── POST /api/email-config — salvar configuração de e-mail ────────────────────
app.post('/api/email-config', async (c) => {
  const session = getCtxSession(c)
  const db      = c.env?.DB || null
  if (!session || session.isDemo) return c.json({ ok: false, error: 'Não autorizado.' }, 401)
  if (!db) return c.json({ ok: false, error: 'Banco indisponível.' }, 503)

  const body = await c.req.json() as any
  const { apiKey, fromEmail, fromName, replyTo } = body

  if (!apiKey || !fromEmail) return c.json({ ok: false, error: 'API key e e-mail remetente são obrigatórios.' })

  const id = 'ec_' + session.userId
  await db.prepare(`
    INSERT OR REPLACE INTO email_config (id, user_id, provider, api_key, from_email, from_name, reply_to, active, updated_at)
    VALUES (?, ?, 'resend', ?, ?, ?, ?, 1, datetime('now'))
  `).bind(id, session.userId, apiKey, fromEmail, fromName || 'PCP Syncrus', replyTo || null).run()

  return c.json({ ok: true })
})

// ── POST /api/email-test — testar envio de e-mail ─────────────────────────────
app.post('/api/email-test', async (c) => {
  const session = getCtxSession(c)
  const db      = c.env?.DB || null
  if (!session || session.isDemo) return c.json({ ok: false, error: 'Não autorizado.' }, 401)

  const body = await c.req.json() as any
  const cfg = {
    apiKey:    body.apiKey    || '',
    fromEmail: body.fromEmail || 'noreply@pcpsyncrus.com.br',
    fromName:  body.fromName  || 'PCP Syncrus',
  }
  if (!cfg.apiKey) return c.json({ ok: false, error: 'API key não informada.' })

  const result = await sendEmail(cfg, {
    to:      session.email,
    subject: 'Teste de E-mail — PCP Syncrus',
    html:    `<h2>Teste de E-mail</h2><p>Seu servidor de e-mail está funcionando corretamente!</p><p>Configurado por: <strong>${session.nome}</strong></p>`,
    type:    'notification',
    userId:  session.userId,
  }, db)

  return c.json(result)
})

// ── POST /api/remove-member — remover membro da empresa ───────────────────────
app.post('/api/remove-member', async (c) => {
  const session = getCtxSession(c)
  const db      = c.env?.DB || null
  if (!session || session.isDemo) return c.json({ ok: false, error: 'Não autorizado.' }, 401)
  if (!db) return c.json({ ok: false, error: 'Banco indisponível.' }, 503)

  const body = await c.req.json() as any
  const memberId = body.id

  if (!memberId) return c.json({ ok: false, error: 'ID do membro não informado.' })

  // Só pode remover membros que têm owner_id = userId do dono (evita remoção de outros)
  const member = await db.prepare(
    'SELECT id, email FROM registered_users WHERE id = ? AND owner_id = ?'
  ).bind(memberId, session.userId).first() as any

  if (!member) return c.json({ ok: false, error: 'Membro não encontrado ou não pertence a esta empresa.' })

  // Invalidar sessões ativas do membro
  await db.prepare('DELETE FROM sessions WHERE email = ?').bind(member.email).run()

  // Remover o usuário do D1
  await db.prepare('DELETE FROM registered_users WHERE id = ? AND owner_id = ?')
    .bind(memberId, session.userId).run()

  return c.json({ ok: true })
})

export default app
