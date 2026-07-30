import { Hono } from 'hono'
import { layout } from '../layout'
import { getCtxTenant, getCtxUserInfo, getCtxDB, getCtxEmpresaId } from '../sessionHelper'
import { genId, ok, err } from '../dbHelpers'
import { listRules, previewNextSerial, type SerialFormatType, type SerialResetPolicy } from '../lib/serialNumbering'

const app = new Hono()

// Apenas o administrador da empresa (role 'admin') pode configurar a numeração de série.
// Nota: aqui "admin" é a role mais alta dentro da empresa do usuário (equivalente ao
// que às vezes é chamado de "master" pelo negócio) — não confundir com o painel
// interno /master, que é o painel de desenvolvedor da Syncrus.
function isAllowed(role: string): boolean {
  return role === 'admin'
}

app.use('*', async (c, next) => {
  const userInfo = getCtxUserInfo(c)
  if (['POST', 'PUT', 'DELETE'].includes(c.req.method) && !isAllowed(userInfo.role || '')) {
    return err(c, 'Acesso restrito ao administrador da empresa', 403)
  }
  return next()
})

const FORMAT_LABEL: Record<SerialFormatType, string> = {
  sequencial: 'Sequencial direto',
  data_sequencial: 'Data de fabricação + sequencial',
  mascara: 'Máscara customizada (letras e números)',
}
const RESET_LABEL: Record<SerialResetPolicy, string> = {
  never: 'Nunca reinicia',
  yearly: 'Reinicia por ano',
  monthly: 'Reinicia por mês',
  daily: 'Reinicia por dia',
}

app.get('/', async (c) => {
  const tenant = getCtxTenant(c)
  const userInfo = getCtxUserInfo(c)
  const db = getCtxDB(c)
  const empresaId = getCtxEmpresaId(c)

  if (!isAllowed(userInfo.role || '')) {
    const content = `
    <div class="card" style="max-width:520px;margin:60px auto;text-align:center;padding:40px 32px;">
      <i class="fas fa-lock" style="font-size:36px;color:#9ca3af;margin-bottom:16px;"></i>
      <h3 style="margin-bottom:8px;">Acesso restrito</h3>
      <p style="color:#6c757d;">A configuração de numeração de série é exclusiva do administrador da empresa.</p>
    </div>`
    return c.html(layout('Numeração de Série', content, 'admin', userInfo))
  }

  const rules = await listRules(db, empresaId)
  const defaultRule = rules.find(r => !r.productCode) || null
  const productRules = rules.filter(r => !!r.productCode)

  const serialProducts = (tenant.products || []).filter((p: any) => p.serialControlled && p.controlType === 'serie')
  const productsWithoutOverride = serialProducts.filter((p: any) => !productRules.some(r => r.productCode === p.code))

  const defaultPreview = await previewNextSerial(db, empresaId, null, defaultRule || undefined)

  const escA = (s: string) => String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

  const ruleFormFields = (prefix: string, r: any) => `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="form-group">
        <label class="form-label">Tipo de formato</label>
        <select class="form-control" id="${prefix}FormatType" onchange="toggleSerialFields('${prefix}')">
          <option value="sequencial" ${r?.formatType==='sequencial'?'selected':''}>Sequencial direto</option>
          <option value="data_sequencial" ${r?.formatType==='data_sequencial'?'selected':''}>Data de fabricação + sequencial</option>
          <option value="mascara" ${r?.formatType==='mascara'?'selected':''}>Máscara customizada</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Prefixo</label>
        <input class="form-control" id="${prefix}Prefix" type="text" maxlength="8" placeholder="Ex: SN" value="${escA(r?.prefix ?? 'SN')}">
      </div>
      <div class="form-group" id="${prefix}DateFmtWrap">
        <label class="form-label">Formato da data</label>
        <select class="form-control" id="${prefix}DateFormat">
          <option value="YYYYMMDD" ${r?.dateFormat==='YYYYMMDD'?'selected':''}>AAAAMMDD (20260728)</option>
          <option value="YYMMDD" ${r?.dateFormat==='YYMMDD'?'selected':''}>AAMMDD (260728)</option>
          <option value="YYYYMM" ${r?.dateFormat==='YYYYMM'?'selected':''}>AAAAMM (202607)</option>
          <option value="YYMM" ${r?.dateFormat==='YYMM'?'selected':''}>AAMM (2607)</option>
          <option value="YYYY" ${r?.dateFormat==='YYYY'?'selected':''}>AAAA (2026)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Separador</label>
        <input class="form-control" id="${prefix}Separator" type="text" maxlength="3" placeholder="-" value="${escA(r?.separator ?? '-')}">
      </div>
      <div class="form-group">
        <label class="form-label">Tamanho do sequencial (zeros à esquerda)</label>
        <input class="form-control" id="${prefix}SeqLength" type="number" min="1" max="12" value="${r?.seqLength ?? 6}">
      </div>
      <div class="form-group">
        <label class="form-label">Reinício do contador</label>
        <select class="form-control" id="${prefix}SeqReset">
          <option value="never" ${r?.seqReset==='never'?'selected':''}>Nunca reinicia</option>
          <option value="yearly" ${r?.seqReset==='yearly'?'selected':''}>Reinicia por ano</option>
          <option value="monthly" ${r?.seqReset==='monthly'?'selected':''}>Reinicia por mês</option>
          <option value="daily" ${r?.seqReset==='daily'?'selected':''}>Reinicia por dia</option>
        </select>
      </div>
      <div class="form-group" style="grid-column:span 2;" id="${prefix}MaskWrap">
        <label class="form-label">Máscara customizada</label>
        <input class="form-control" id="${prefix}Mask" type="text" placeholder="{PREFIXO}{AAAA}{MM}-{SEQ}" value="${escA(r?.mask ?? '')}">
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Tokens disponíveis: <code>{PREFIXO}</code> <code>{AAAA}</code> <code>{AA}</code> <code>{MM}</code> <code>{DD}</code> <code>{SEQ}</code></div>
      </div>
    </div>`

  const content = `
  <div class="section-header">
    <div>
      <div style="font-size:14px;color:#6c757d;margin-bottom:4px;">Administração • Somente administrador da empresa</div>
      <h2 style="margin:0;">Numeração Automática de Série</h2>
    </div>
  </div>

  <div class="card" style="margin-bottom:20px;padding:16px 20px;background:#eff6ff;border:1px solid #bfdbfe;">
    <div style="display:flex;gap:12px;align-items:flex-start;">
      <i class="fas fa-circle-info" style="color:#2980B9;margin-top:2px;"></i>
      <div style="font-size:13px;color:#1e3a5f;line-height:1.5;">
        Esta configuração define como os números de série são gerados <b>automaticamente</b> ao criar uma nova Ordem de Produção.
        O sequencial de cada regra é controlado internamente e nunca se repete dentro do mesmo período de reinício.
        <br><b>Importante:</b> a inclusão em massa via planilha (cadastro inicial de produtos) continua permitindo digitação manual do serial — esta regra vale apenas para as OPs criadas a partir de agora.
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:24px;">
    <div class="card-header"><h3><i class="fas fa-sliders-h" style="margin-right:8px;color:#1B4F72;"></i>Regra padrão da empresa</h3></div>
    <div style="padding:20px;">
      <div style="margin-bottom:16px;padding:10px 14px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;color:#5b21b6;">Próximo número (regra padrão):</span>
        <span style="font-family:monospace;font-weight:700;color:#5b21b6;font-size:15px;" id="defaultPreviewLabel">${escA(defaultPreview)}</span>
      </div>
      ${ruleFormFields('default', defaultRule)}
      <div style="margin-top:16px;text-align:right;">
        <button class="btn btn-primary" onclick="salvarRegraSerial(null)"><i class="fas fa-save"></i> Salvar regra padrão</button>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
      <h3><i class="fas fa-box-open" style="margin-right:8px;color:#1B4F72;"></i>Regras específicas por produto (opcional)</h3>
      ${productsWithoutOverride.length ? `<button class="btn btn-secondary btn-sm" onclick="openNovaRegraProduto()"><i class="fas fa-plus"></i> Nova regra por produto</button>` : ''}
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Produto</th><th>Formato</th><th>Prefixo</th><th>Reinício</th><th>Ações</th></tr></thead>
        <tbody>
          ${productRules.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:20px;">Nenhum override cadastrado — todos os produtos com controle de série usam a regra padrão acima.</td></tr>' : ''}
          ${productRules.map(r => {
            const prod = serialProducts.find((p: any) => p.code === r.productCode)
            return `<tr>
              <td><b>${escA(prod?.name || r.productCode)}</b><div style="font-size:11px;color:#9ca3af;">${escA(r.productCode || '')}</div></td>
              <td>${FORMAT_LABEL[r.formatType]}</td>
              <td><code>${escA(r.prefix)}</code></td>
              <td>${RESET_LABEL[r.seqReset]}</td>
              <td>
                <button class="btn btn-secondary btn-sm" onclick='editarRegraProduto(${JSON.stringify(r).replace(/'/g, "&#39;")})'><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-sm" onclick="excluirRegraProduto('${r.id}', '${escA(prod?.name || r.productCode || '')}')"><i class="fas fa-trash"></i></button>
              </td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Modal: nova/editar regra por produto -->
  <div class="modal" id="regraProdutoModal">
    <div class="modal-content" style="max-width:640px;">
      <div class="modal-header">
        <h3 id="regraProdutoModalTitle">Nova regra por produto</h3>
        <button class="modal-close" onclick="closeModal('regraProdutoModal')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group" style="margin-bottom:14px;">
          <label class="form-label">Produto *</label>
          <select class="form-control" id="rpProductCode">
            <option value="">Selecione...</option>
            ${serialProducts.map((p: any) => `<option value="${escA(p.code)}">${escA(p.name)} (${escA(p.code)})</option>`).join('')}
          </select>
        </div>
        ${ruleFormFields('rp', null)}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('regraProdutoModal')">Cancelar</button>
        <button class="btn btn-primary" id="rpSaveBtn" onclick="salvarRegraSerial('rp')"><i class="fas fa-save"></i> Salvar</button>
      </div>
    </div>
  </div>

  <script>
    function toggleSerialFields(prefix) {
      const type = document.getElementById(prefix + 'FormatType').value;
      document.getElementById(prefix + 'DateFmtWrap').style.display = (type === 'data_sequencial') ? '' : 'none';
      document.getElementById(prefix + 'MaskWrap').style.display = (type === 'mascara') ? '' : 'none';
    }
    ['default','rp'].forEach(p => { if (document.getElementById(p + 'FormatType')) toggleSerialFields(p); });

    function openNovaRegraProduto() {
      document.getElementById('regraProdutoModalTitle').textContent = 'Nova regra por produto';
      document.getElementById('rpProductCode').value = '';
      document.getElementById('rpProductCode').disabled = false;
      document.getElementById('rpFormatType').value = 'sequencial';
      document.getElementById('rpPrefix').value = 'SN';
      document.getElementById('rpDateFormat').value = 'YYYYMMDD';
      document.getElementById('rpSeparator').value = '-';
      document.getElementById('rpSeqLength').value = 6;
      document.getElementById('rpSeqReset').value = 'never';
      document.getElementById('rpMask').value = '';
      toggleSerialFields('rp');
      openModal('regraProdutoModal');
    }

    function editarRegraProduto(r) {
      document.getElementById('regraProdutoModalTitle').textContent = 'Editar regra do produto';
      document.getElementById('rpProductCode').value = r.productCode;
      document.getElementById('rpProductCode').disabled = true;
      document.getElementById('rpFormatType').value = r.formatType;
      document.getElementById('rpPrefix').value = r.prefix;
      document.getElementById('rpDateFormat').value = r.dateFormat;
      document.getElementById('rpSeparator').value = r.separator;
      document.getElementById('rpSeqLength').value = r.seqLength;
      document.getElementById('rpSeqReset').value = r.seqReset;
      document.getElementById('rpMask').value = r.mask || '';
      toggleSerialFields('rp');
      openModal('regraProdutoModal');
    }

    async function salvarRegraSerial(prefix) {
      const p = prefix || 'default';
      const productCode = prefix ? (document.getElementById('rpProductCode')?.value || '') : null;
      if (prefix && !productCode) { showToast('Selecione o produto!', 'error'); return; }
      const payload = {
        productCode,
        formatType: document.getElementById(p + 'FormatType').value,
        prefix: document.getElementById(p + 'Prefix').value.trim(),
        dateFormat: document.getElementById(p + 'DateFormat').value,
        separator: document.getElementById(p + 'Separator').value,
        seqLength: parseInt(document.getElementById(p + 'SeqLength').value) || 6,
        seqReset: document.getElementById(p + 'SeqReset').value,
        mask: document.getElementById(p + 'Mask').value,
      };
      try {
        const res = await fetch('/admin/serial-config/api/rules', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.ok) {
          showToast('✅ Regra de série salva!');
          closeModal('regraProdutoModal');
          setTimeout(() => location.reload(), 700);
        } else {
          showToast(data.error || 'Erro ao salvar regra', 'error');
        }
      } catch (e) { showToast('Erro de conexão', 'error'); }
    }

    async function excluirRegraProduto(id, nome) {
      if (!confirm('Remover a regra específica de "' + nome + '"? O produto passará a usar a regra padrão da empresa.')) return;
      try {
        const res = await fetch('/admin/serial-config/api/rules/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (data.ok) { showToast('Regra removida.'); setTimeout(() => location.reload(), 600); }
        else showToast(data.error || 'Erro ao remover', 'error');
      } catch (e) { showToast('Erro de conexão', 'error'); }
    }
  </script>
  `

  return c.html(layout('Numeração de Série', content, 'admin', userInfo))
})

// ── API: POST /admin/serial-config/api/rules — cria/atualiza regra (padrão ou por produto) ──
app.post('/api/rules', async (c) => {
  const db = getCtxDB(c)
  const empresaId = getCtxEmpresaId(c)
  const body = await c.req.json().catch(() => null)
  if (!body) return err(c, 'Dados inválidos')
  if (!db) return err(c, 'Banco de dados indisponível neste modo (demo)')

  const productCode: string | null = body.productCode || null
  const data = {
    format_type: body.formatType || 'sequencial',
    prefix: body.prefix || '',
    date_format: body.dateFormat || 'YYYYMMDD',
    separator: body.separator ?? '-',
    seq_length: parseInt(body.seqLength) || 6,
    seq_reset: body.seqReset || 'never',
    mask: body.mask || '',
  }

  try {
    const existing = await db.prepare(
      productCode
        ? 'SELECT id FROM serial_numbering_rules WHERE empresa_id = ? AND product_code = ?'
        : 'SELECT id FROM serial_numbering_rules WHERE empresa_id = ? AND product_code IS NULL'
    ).bind(...(productCode ? [empresaId, productCode] : [empresaId])).first<{ id: string }>()

    if (existing) {
      await db.prepare(
        `UPDATE serial_numbering_rules SET format_type=?, prefix=?, date_format=?, separator=?, seq_length=?, seq_reset=?, mask=?, updated_at=datetime('now') WHERE id=?`
      ).bind(data.format_type, data.prefix, data.date_format, data.separator, data.seq_length, data.seq_reset, data.mask, existing.id).run()
    } else {
      const id = genId('snr')
      await db.prepare(
        `INSERT INTO serial_numbering_rules (id, empresa_id, product_code, format_type, prefix, date_format, separator, seq_length, seq_reset, mask, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      ).bind(id, empresaId, productCode, data.format_type, data.prefix, data.date_format, data.separator, data.seq_length, data.seq_reset, data.mask).run()
    }
    return ok(c)
  } catch (e: any) {
    console.error('[serial-config] erro ao salvar regra:', e)
    return err(c, 'Erro ao salvar regra de numeração')
  }
})

// ── API: DELETE /admin/serial-config/api/rules/:id — remove override de produto ──
app.delete('/api/rules/:id', async (c) => {
  const db = getCtxDB(c)
  const empresaId = getCtxEmpresaId(c)
  const id = c.req.param('id')
  if (!db) return err(c, 'Banco de dados indisponível neste modo (demo)')
  try {
    await db.prepare('DELETE FROM serial_numbering_rules WHERE id = ? AND empresa_id = ? AND product_code IS NOT NULL')
      .bind(id, empresaId).run()
    return ok(c)
  } catch (e) {
    return err(c, 'Erro ao remover regra')
  }
})

export default app
