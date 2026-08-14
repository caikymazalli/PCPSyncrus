/**
 * OmieClient — Integração com a API REST do Omie ERP
 * Documentação: https://developer.omie.com.br/service-list/
 *
 * Endpoints usados:
 *  - geral/clientes          → UpsertCliente
 *  - financas/contareceber   → ListarContasReceber, IncluirContaReceber, LancarRecebimento, CancelarContaReceber
 *  - financas/contareceberboleto → GerarBoleto, ObterBoleto, CancelarBoleto
 *  - servicos/nfse           → ListarNFSEs
 *  - servicos/osdocs         → ObterNFSe
 *  - servicos/contrato       → ListarContratos
 */

export interface OmieConfig {
  app_key: string
  app_secret: string
  conta_corrente?: string
  codigo_categoria?: string
  codigo_servico?: string
}

/** Converte ISO (YYYY-MM-DD) para formato Omie (DD/MM/YYYY) */
function toOmieDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = iso.slice(0, 10).split('-')
  if (d.length !== 3) return iso
  return `${d[2]}/${d[1]}/${d[0]}`
}

/** Converte data Omie (DD/MM/YYYY) para ISO (YYYY-MM-DD) */
function fromOmieDate(omie: string | null | undefined): string {
  if (!omie) return ''
  const p = omie.split('/')
  if (p.length !== 3) return omie
  return `${p[2]}-${p[1]}-${p[0]}`
}

/** Mapeia status Omie → status interno PCPSyncrus */
function omieStatus(s: string): string {
  const m: Record<string, string> = {
    'RECEBIDO': 'paid',
    'A VENCER': 'pending',
    'VENCIDO': 'overdue',
    'CANCELADO': 'cancelled',
  }
  return m[s?.toUpperCase()] ?? 'pending'
}

export class OmieClient {
  private cfg: OmieConfig
  private BASE = 'https://app.omie.com.br/api/v1'

  constructor(cfg: OmieConfig) {
    this.cfg = cfg
  }

  /** Chamada genérica à API Omie */
  async call<T = any>(
    endpoint: string,
    method: string,
    param: Record<string, any> = {}
  ): Promise<{ ok: boolean; data?: T; error?: string; faultCode?: string }> {
    const url = `${this.BASE}/${endpoint}/`
    const body = {
      call: method,
      app_key: this.cfg.app_key,
      app_secret: this.cfg.app_secret,
      param: [param],
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json() as any
      if (json.faultstring || json.faultcode) {
        return { ok: false, error: json.faultstring || 'Erro Omie', faultCode: json.faultcode }
      }
      return { ok: true, data: json as T }
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Erro de rede' }
    }
  }

  // ── Clientes ────────────────────────────────────────────────────────────────

  async upsertCliente(cliente: {
    codigo_cliente_integracao: string
    razao_social: string
    nome_fantasia?: string
    cnpj_cpf?: string
    email?: string
    endereco?: string
    endereco_numero?: string
    bairro?: string
    complemento?: string
    estado?: string
    cidade?: string
    cep?: string
    codigo_pais?: string
    optante_simples_nacional?: string
    contribuinte?: string
    telefone1_ddd?: string
    telefone1_numero?: string
  }): Promise<{ ok: boolean; codigo?: number; error?: string }> {
    const r = await this.call<any>('geral/clientes', 'UpsertCliente', {
      codigo_cliente_integracao: cliente.codigo_cliente_integracao,
      razao_social: cliente.razao_social,
      nome_fantasia: cliente.nome_fantasia || cliente.razao_social,
      cnpj_cpf: cliente.cnpj_cpf || '',
      email: cliente.email || '',
      endereco: cliente.endereco || 'N/I',
      endereco_numero: cliente.endereco_numero || 'S/N',
      bairro: cliente.bairro || 'N/I',
      complemento: cliente.complemento || '',
      estado: cliente.estado || 'SP',
      cidade: cliente.cidade || 'São Paulo',
      cep: cliente.cep || '00000-000',
      codigo_pais: cliente.codigo_pais || '1058',
      optante_simples_nacional: cliente.optante_simples_nacional || 'N',
      contribuinte: cliente.contribuinte || 'N',
      telefone1_ddd: cliente.telefone1_ddd || '',
      telefone1_numero: cliente.telefone1_numero || '',
      pessoa_fisica: (cliente.cnpj_cpf?.replace(/\D/g, '').length || 0) <= 11 ? 'S' : 'N',
    })
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, codigo: r.data?.codigo_cliente_omie || r.data?.codigo_cliente }
  }

  // ── Contas a Receber ────────────────────────────────────────────────────────

  async listarContasReceber(filtros: {
    pagina?: number
    registros_por_pagina?: number
    data_vencimento_de?: string
    data_vencimento_ate?: string
    status_titulo?: string
    apenas_importado_api?: string
  } = {}): Promise<{ ok: boolean; data?: any[]; total?: number; error?: string }> {
    const param: Record<string, any> = {
      pagina: filtros.pagina || 1,
      registros_por_pagina: filtros.registros_por_pagina || 50,
      apenas_importado_api: filtros.apenas_importado_api || 'N',
    }
    if (filtros.data_vencimento_de) param.data_vencimento_de = toOmieDate(filtros.data_vencimento_de)
    if (filtros.data_vencimento_ate) param.data_vencimento_ate = toOmieDate(filtros.data_vencimento_ate)
    if (filtros.status_titulo) param.status_titulo = filtros.status_titulo
    const r = await this.call<any>('financas/contareceber', 'ListarContasReceber', param)
    if (!r.ok) return { ok: false, error: r.error }
    return {
      ok: true,
      data: r.data?.conta_receber_cadastro || [],
      total: r.data?.total_de_registros || 0,
    }
  }

  async incluirContaReceber(dados: {
    id_integracao: string
    codigo_cliente: number
    valor: number
    vencimento: string
    categoria?: string
    observacao?: string
    numero_documento?: string
  }): Promise<{ ok: boolean; codigo_lancamento?: number; error?: string }> {
    const param: Record<string, any> = {
      codigo_lancamento_integracao: dados.id_integracao,
      codigo_cliente_fornecedor: dados.codigo_cliente,
      data_vencimento: toOmieDate(dados.vencimento),
      data_previsao: toOmieDate(dados.vencimento),
      valor_documento: dados.valor,
      codigo_categoria: dados.categoria || this.cfg.codigo_categoria || '1.01.02',
      observacao: dados.observacao || '',
    }
    if (dados.numero_documento) param.numero_documento = dados.numero_documento
    if (this.cfg.conta_corrente) param.id_conta_corrente = Number(this.cfg.conta_corrente)
    const r = await this.call<any>('financas/contareceber', 'IncluirContaReceber', param)
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, codigo_lancamento: r.data?.codigo_lancamento }
  }

  async lancarRecebimento(dados: {
    codigo_lancamento: number
    valor: number
    data: string
    observacao?: string
  }): Promise<{ ok: boolean; error?: string }> {
    const r = await this.call<any>('financas/contareceber', 'LancarRecebimento', {
      codigo_lancamento: dados.codigo_lancamento,
      codigo_baixa: 0,
      codigo_conta_corrente: Number(this.cfg.conta_corrente || 0),
      valor: dados.valor,
      data: toOmieDate(dados.data),
      observacao: dados.observacao || 'Baixa via PCPSyncrus',
    })
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true }
  }

  async cancelarContaReceber(codigoLancamento: number): Promise<{ ok: boolean; error?: string }> {
    const r = await this.call<any>('financas/contareceber', 'CancelarContaReceber', {
      codigo_lancamento: codigoLancamento,
    })
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true }
  }

  // ── Boletos ─────────────────────────────────────────────────────────────────

  async gerarBoleto(params: {
    nCodTitulo?: number
    cCodIntTitulo?: string
  }): Promise<{ ok: boolean; data?: any; error?: string }> {
    const r = await this.call<any>('financas/contareceberboleto', 'GerarBoleto', {
      nCodTitulo: params.nCodTitulo || 0,
      cCodIntTitulo: params.cCodIntTitulo || '',
    })
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, data: r.data }
  }

  async obterBoleto(params: {
    nCodTitulo?: number
    cCodIntTitulo?: string
  }): Promise<{ ok: boolean; data?: any; error?: string }> {
    const r = await this.call<any>('financas/contareceberboleto', 'ObterBoleto', {
      nCodTitulo: params.nCodTitulo || 0,
      cCodIntTitulo: params.cCodIntTitulo || '',
    })
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, data: r.data }
  }

  async cancelarBoleto(params: {
    nCodTitulo?: number
    cCodIntTitulo?: string
  }): Promise<{ ok: boolean; error?: string }> {
    const r = await this.call<any>('financas/contareceberboleto', 'CancelarBoleto', {
      nCodTitulo: params.nCodTitulo || 0,
      cCodIntTitulo: params.cCodIntTitulo || '',
    })
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true }
  }

  // ── NFS-e ───────────────────────────────────────────────────────────────────

  async listarNFSes(filtros: {
    pagina?: number
    registros_por_pagina?: number
    data_inicial?: string
    data_final?: string
    status?: string
    codigo_cliente?: number
  } = {}): Promise<{ ok: boolean; data?: any[]; error?: string }> {
    const param: Record<string, any> = {
      nPagina: filtros.pagina || 1,
      nRegPorPagina: filtros.registros_por_pagina || 50,
    }
    if (filtros.data_inicial) param.dEmiInicial = toOmieDate(filtros.data_inicial)
    if (filtros.data_final) param.dEmiFinal = toOmieDate(filtros.data_final)
    if (filtros.status) param.cStatusNFSe = filtros.status
    if (filtros.codigo_cliente) param.nCodigoCliente = filtros.codigo_cliente
    const r = await this.call<any>('servicos/nfse', 'ListarNFSEs', param)
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, data: r.data?.nfseListarResponse?.nfse || r.data?.nfse || [] }
  }

  async obterNFSe(nIdNf: number): Promise<{ ok: boolean; data?: any; error?: string }> {
    const r = await this.call<any>('servicos/osdocs', 'ObterNFSe', { nIdNf })
    if (!r.ok) return { ok: false, error: r.error }
    return {
      ok: true,
      data: { nCodNF: nIdNf, cPdfNFSe: r.data?.cPdfNFSe, cXmlNFSe: r.data?.cXmlNFSe },
    }
  }

  // ── Contratos (recorrentes) ─────────────────────────────────────────────────

  async listarContratos(filtros: {
    pagina?: number
    registros_por_pagina?: number
    status?: string
  } = {}): Promise<{ ok: boolean; data?: any[]; total?: number; error?: string }> {
    const r = await this.call<any>('servicos/contrato', 'ListarContratos', {
      pagina: filtros.pagina || 1,
      registros_por_pagina: filtros.registros_por_pagina || 50,
      ...(filtros.status ? { cCodSit: filtros.status } : {}),
    })
    if (!r.ok) return { ok: false, error: r.error }
    return {
      ok: true,
      data: r.data?.contratos || [],
      total: r.data?.total_de_registros || 0,
    }
  }

  // ── Pull completo de contas a receber ───────────────────────────────────────

  async pullContasReceber(meses = 3): Promise<{ ok: boolean; registros: any[]; error?: string }> {
    const hoje = new Date()
    const inicio = new Date(hoje)
    inicio.setMonth(inicio.getMonth() - meses)
    const fim = new Date(hoje)
    fim.setMonth(fim.getMonth() + 1)

    const result = await this.listarContasReceber({
      registros_por_pagina: 200,
      data_vencimento_de: inicio.toISOString().slice(0, 10),
      data_vencimento_ate: fim.toISOString().slice(0, 10),
    })
    if (!result.ok) return { ok: false, registros: [], error: result.error }

    const registros = (result.data || []).map((r: any) => ({
      omie_codigo_lancamento: r.codigo_lancamento || 0,
      omie_codigo_integracao: r.codigo_lancamento_integracao || '',
      valor: r.valor_documento || 0,
      vencimento: fromOmieDate(r.data_vencimento),
      status: omieStatus(r.status_titulo || ''),
      pago_em: r.data_pagamento ? fromOmieDate(r.data_pagamento) : null,
      observacao: r.observacao || '',
    }))
    return { ok: true, registros }
  }
}

/** Cria OmieClient a partir das configurações do banco D1 */
export async function createOmieClient(db: D1Database): Promise<OmieClient | null> {
  const row = await db
    .prepare(
      'SELECT omie_app_key,omie_app_secret,omie_conta_corrente,omie_codigo_categoria,omie_codigo_servico,omie_enabled FROM platform_settings WHERE id=?'
    )
    .bind('singleton')
    .first<any>()

  if (!row || !row.omie_enabled || !row.omie_app_key || !row.omie_app_secret) return null

  return new OmieClient({
    app_key: row.omie_app_key,
    app_secret: row.omie_app_secret,
    conta_corrente: row.omie_conta_corrente || undefined,
    codigo_categoria: row.omie_codigo_categoria || '1.01.02',
    codigo_servico: row.omie_codigo_servico || undefined,
  })
}

export { toOmieDate, fromOmieDate, omieStatus }
