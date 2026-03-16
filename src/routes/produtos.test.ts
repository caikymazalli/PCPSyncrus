/**
 * produtos.test.ts
 *
 * Source-code guardrail tests for the Produtos module.
 * Verifies that inline HTML event handler functions are properly
 * defined in the client-side script and exposed on the global `window`
 * object, and that header buttons use data-action attributes instead of
 * inline onclick handlers (prevents SyntaxError / openImportModal is not defined).
 *
 * Also verifies that server-side HTML generation properly escapes product and
 * supplier data (name, code, description) to prevent SyntaxError when data
 * contains apostrophes, quotes, angle brackets, etc.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import app from './produtos'
import { sessions, tenants } from '../userStore'

const src = readFileSync(resolve(__dirname, 'produtos.ts'), 'utf8')

// ── Inline handler function definitions ──────────────────────────────────────

describe('produtos.ts source-code: funções de handler inline estão definidas', () => {
  it('openImportModal está definida como função no script client-side', () => {
    expect(src).toContain('function openImportModal(')
  })

  it('updateStatusPreview está definida como função no script client-side', () => {
    expect(src).toContain('function updateStatusPreview(')
  })

  it('salvarNovoProduto está definida como função no script client-side', () => {
    expect(src).toContain('function salvarNovoProduto(')
  })
})

// ── Window assignments for inline HTML event attributes ──────────────────────

describe('produtos.ts source-code: inline handler functions são expostas via window', () => {
  it('openImportModal é atribuída a window para acesso via onclick', () => {
    expect(src).toContain('window.openImportModal = openImportModal')
  })

  it('updateStatusPreview é atribuída a window para acesso via oninput', () => {
    expect(src).toContain('window.updateStatusPreview = updateStatusPreview')
  })

  it('salvarNovoProduto é atribuída a window para acesso via onclick', () => {
    expect(src).toContain('window.salvarNovoProduto = salvarNovoProduto')
  })
})

// ── Header buttons use data-action (no inline onclick) ───────────────────────

describe('produtos.ts source-code: botões do header usam data-action em vez de onclick inline', () => {
  it('botão Importar Planilha usa data-action="open-import"', () => {
    expect(src).toContain('data-action="open-import"')
  })

  it('botão Config. Limites usa data-action="open-config-limites"', () => {
    expect(src).toContain('data-action="open-config-limites"')
  })

  it('botão Novo Produto usa data-action="open-novo-prod"', () => {
    expect(src).toContain('data-action="open-novo-prod"')
  })
})

// ── Event delegation handles header data-actions ─────────────────────────────

describe('produtos.ts source-code: event delegation trata os data-actions do header', () => {
  it('delegation chama openImportModal() para open-import', () => {
    expect(src).toContain("action === 'open-import'")
    expect(src).toContain('openImportModal()')
  })

  it('delegation chama openModal para open-config-limites', () => {
    expect(src).toContain("action === 'open-config-limites'")
    expect(src).toContain("openModal('configLimitesModal')")
  })

  it('delegation chama openModal para open-novo-prod', () => {
    expect(src).toContain("action === 'open-novo-prod'")
    expect(src).toContain("openModal('novoProdModal')")
  })
})

// ── campos oninput e botão Salvar ainda usam onclick (não são header buttons) ─

describe('produtos.ts source-code: campos e modais internos mantêm handlers inline', () => {
  it('campos de estoque chamam updateStatusPreview() via oninput', () => {
    expect(src).toContain('oninput="updateStatusPreview()"')
  })

  it('botão Salvar no modal de novo produto chama salvarNovoProduto()', () => {
    expect(src).toContain('onclick="salvarNovoProduto()"')
  })
})

// ── escHtml helper para evitar XSS / SyntaxError em HTML gerado ──────────────

describe('produtos.ts source-code: helper escHtml está definido e usado', () => {
  it('escHtml está definida no script client-side', () => {
    expect(src).toContain('function escHtml(')
  })

  it('escHtml escapa & para &amp;', () => {
    expect(src).toContain(".replace(/&/g, '&amp;')")
  })

  it('escHtml escapa < para &lt;', () => {
    expect(src).toContain(".replace(/</g, '&lt;')")
  })

  it('escHtml escapa > para &gt;', () => {
    expect(src).toContain(".replace(/>/g, '&gt;')")
  })

  it('escHtml escapa " para &quot;', () => {
    expect(src).toContain(".replace(/\"/g, '&quot;')")
  })

  it('escHtml é usada nas células do draft (ex.: row notes no title)', () => {
    expect(src).toContain("escHtml(row['notes']")
  })

  it('escHtml é usada no relatório de importação (r.code, r.name, r.message)', () => {
    expect(src).toContain('escHtml(r.code)')
    expect(src).toContain('escHtml(r.name)')
    expect(src).toContain('escHtml(r.message)')
  })
})

// ── Botão de remover linha usa data-action (não onclick inline) ───────────────

describe('produtos.ts source-code: botão remover linha usa data-action', () => {
  it('botão remover usa data-action="import-remove-row"', () => {
    expect(src).toContain('data-action="import-remove-row"')
  })

  it('botão remover não usa onclick="importRemoveRow(', () => {
    expect(src).not.toContain('onclick="importRemoveRow(')
  })

  it('event delegation trata import-remove-row chamando importRemoveRow()', () => {
    expect(src).toContain("action === 'import-remove-row'")
    expect(src).toContain('importRemoveRow(idx)')
  })
})

// ── Server-side escHtml helper para geração de HTML segura ───────────────────

describe('produtos.ts source-code: helper escHtml server-side protege atributos HTML', () => {
  it('escHtml server-side está definida antes do route handler', () => {
    // The server-side escHtml is a TypeScript function (not inside <script>)
    expect(src).toContain('function escHtml(s: string | null | undefined): string')
  })

  it('escHtml server-side escapa \' para &#39; (previne quebra em atributos JS inline)', () => {
    expect(src).toContain(".replace(/'/g, '&#39;')")
  })

  it('nameEsc usa escHtml() para evitar injeção de dados no HTML', () => {
    expect(src).toContain('const nameEsc = escHtml(p.name)')
  })

  it('descEsc usa escHtml() para evitar injeção de dados no HTML', () => {
    expect(src).toContain('const descEsc = escHtml(p.description)')
  })

  it('codeEsc usa escHtml() para evitar injeção de dados no HTML', () => {
    expect(src).toContain('const codeEsc = escHtml(p.code)')
  })

  it('data-search usa nameEsc.toLowerCase() para evitar quebra de atributo', () => {
    expect(src).toContain("' data-search=\"' + nameEsc.toLowerCase()")
    // Guardrail: não deve usar (p.name || '').toLowerCase() diretamente no data-search
    expect(src).not.toContain("data-search=\"' + (p.name || '').toLowerCase()")
  })

  it('supplier badge title usa sNameEsc (nome do fornecedor escapado)', () => {
    expect(src).toContain('const sNameEsc = escHtml(s.name)')
    expect(src).toContain("title=\"' + labels[idx] + ': ' + sNameEsc + '\">'")
  })

  it('criticalStockPopup usa escHtml(p.name) para nome do produto', () => {
    expect(src).toContain('${escHtml(p.name)}')
  })
})

// ── Functional: geração de HTML com produto cujo nome contém caracteres especiais ──

const TEST_TOKEN_PROD = 'test-token-produtos-special-chars'
const TEST_USER_PROD  = 'test-user-produtos-special-chars'

afterEach(() => {
  delete sessions[TEST_TOKEN_PROD]
  delete tenants[TEST_USER_PROD]
})

function setupProdutosSession(products: any[] = [], suppliers: any[] = []) {
  sessions[TEST_TOKEN_PROD] = {
    token: TEST_TOKEN_PROD,
    userId: TEST_USER_PROD,
    email: 'test-produtos@test.com',
    nome: 'Test User',
    empresa: 'Test Corp',
    plano: 'starter',
    role: 'admin',
    isDemo: false,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 3_600_000,
    empresaId: '1',
    grupoId: null,
  }
  tenants[TEST_USER_PROD] = {
    plants: [], machines: [], workbenches: [],
    products,
    productionOrders: [], productionEntries: [],
    stockItems: [], nonConformances: [],
    suppliers,
    quotations: [], purchaseOrders: [], imports: [],
    boms: [], instructions: [], qualityChecks: [], users: [],
    kpis: {}, chartData: {},
    bomItems: [], productSuppliers: [], workOrders: [], routes: [],
    serialNumbers: [], serialPendingItems: [],
    warehouses: [], separationOrders: [], stockExits: [],
    supplierCategories: [], productSupplierLinks: [],
    quotationNegotiations: [],
    workInstructions: [], workInstructionVersions: [],
    workInstructionSteps: [], workInstructionPhotos: [],
    workInstructionAuditLog: [],
  } as any
}

describe('produtos: HTML gerado é seguro quando dados contêm caracteres especiais', () => {
  it("produto com apóstrofo no nome (O'RING) não quebra o atributo data-search", async () => {
    setupProdutosSession([{
      id: 'prod-oring-001',
      name: "O'RING",
      code: 'OR-001',
      unit: 'un',
      stockMin: 10,
      stockCurrent: 20,
      stockStatus: 'normal',
      serialControlled: false,
      controlType: '',
      description: '',
      supplierId: '',
    }])
    const res = await app.request('/', {
      headers: { Cookie: 'pcp_session=' + TEST_TOKEN_PROD },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    // apostrophe must be escaped as &#39; in the data-search attribute
    expect(html).toContain("data-search=\"o&#39;ring or-001\"")
    // raw apostrophe must NOT appear inside a double-quoted attribute value
    expect(html).not.toContain("data-search=\"o'ring")
  })

  it("produto com aspas duplas no código não quebra o atributo data-search", async () => {
    setupProdutosSession([{
      id: 'prod-quote-001',
      name: 'Test Product',
      code: 'CODE"001',
      unit: 'un',
      stockMin: 0,
      stockCurrent: 5,
      stockStatus: 'normal',
      serialControlled: false,
      controlType: '',
      description: '',
      supplierId: '',
    }])
    const res = await app.request('/', {
      headers: { Cookie: 'pcp_session=' + TEST_TOKEN_PROD },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    // double quote must be escaped as &quot; in the attribute
    expect(html).toContain('data-search="test product code&quot;001"')
    // raw double quote must NOT appear inside the data-search attribute value
    expect(html).not.toMatch(/data-search="[^"]*CODE"/)
  })

  it("produto com nome contendo < e > não injeta HTML no data-search", async () => {
    setupProdutosSession([{
      id: 'prod-angle-001',
      name: 'Size <10mm>',
      code: 'SZ-001',
      unit: 'un',
      stockMin: 0,
      stockCurrent: 3,
      stockStatus: 'normal',
      serialControlled: false,
      controlType: '',
      description: '',
      supplierId: '',
    }])
    const res = await app.request('/', {
      headers: { Cookie: 'pcp_session=' + TEST_TOKEN_PROD },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('data-search="size &lt;10mm&gt; sz-001"')
  })

  it("fornecedor com apóstrofo no nome não quebra atributo title do badge", async () => {
    const supplier = { id: 'sup-001', name: "D'Angelo Ltda", type: 'nacional', deliveryLeadDays: 7 }
    setupProdutosSession([{
      id: 'prod-with-sup-001',
      name: 'Produto Teste',
      code: 'PT-001',
      unit: 'un',
      stockMin: 0,
      stockCurrent: 5,
      stockStatus: 'normal',
      serialControlled: false,
      controlType: '',
      description: '',
      supplier_id_1: 'sup-001',
    }], [supplier])
    const res = await app.request('/', {
      headers: { Cookie: 'pcp_session=' + TEST_TOKEN_PROD },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    // apostrophe in supplier name must be escaped in title attribute
    expect(html).toContain("title=\"Princ.: D&#39;Angelo Ltda\"")
    expect(html).not.toContain("title=\"Princ.: D'Angelo")
  })

  it("página carrega sem SyntaxError quando produto tem apóstrofo no nome", async () => {
    setupProdutosSession([{
      id: 'prod-apos-001',
      name: "Tampa D'Água",
      code: 'TDA-001',
      unit: 'un',
      stockMin: 5,
      stockCurrent: 2,
      stockStatus: 'critical',
      serialControlled: false,
      controlType: '',
      description: "Descrição com 'aspas' e \"duplas\"",
      supplierId: '',
    }])
    const res = await app.request('/', {
      headers: { Cookie: 'pcp_session=' + TEST_TOKEN_PROD },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    // The <script> block must be present and intact
    expect(html).toContain('function openImportModal(')
    expect(html).toContain('window.openImportModal = openImportModal')
    // Critical stock popup must use escaped product name
    expect(html).toContain('Tampa D&#39;\u00c1gua')
  })
})

// ── Inline handler function definitions ──────────────────────────────────────

describe('produtos.ts source-code: funções de handler inline estão definidas', () => {
  it('openImportModal está definida como função no script client-side', () => {
    expect(src).toContain('function openImportModal(')
  })

  it('updateStatusPreview está definida como função no script client-side', () => {
    expect(src).toContain('function updateStatusPreview(')
  })

  it('salvarNovoProduto está definida como função no script client-side', () => {
    expect(src).toContain('function salvarNovoProduto(')
  })
})

// ── Window assignments for inline HTML event attributes ──────────────────────

describe('produtos.ts source-code: inline handler functions são expostas via window', () => {
  it('openImportModal é atribuída a window para acesso via onclick', () => {
    expect(src).toContain('window.openImportModal = openImportModal')
  })

  it('updateStatusPreview é atribuída a window para acesso via oninput', () => {
    expect(src).toContain('window.updateStatusPreview = updateStatusPreview')
  })

  it('salvarNovoProduto é atribuída a window para acesso via onclick', () => {
    expect(src).toContain('window.salvarNovoProduto = salvarNovoProduto')
  })
})

// ── Header buttons use data-action (no inline onclick) ───────────────────────

describe('produtos.ts source-code: botões do header usam data-action em vez de onclick inline', () => {
  it('botão Importar Planilha usa data-action="open-import"', () => {
    expect(src).toContain('data-action="open-import"')
  })

  it('botão Config. Limites usa data-action="open-config-limites"', () => {
    expect(src).toContain('data-action="open-config-limites"')
  })

  it('botão Novo Produto usa data-action="open-novo-prod"', () => {
    expect(src).toContain('data-action="open-novo-prod"')
  })
})

// ── Event delegation handles header data-actions ─────────────────────────────

describe('produtos.ts source-code: event delegation trata os data-actions do header', () => {
  it('delegation chama openImportModal() para open-import', () => {
    expect(src).toContain("action === 'open-import'")
    expect(src).toContain('openImportModal()')
  })

  it('delegation chama openModal para open-config-limites', () => {
    expect(src).toContain("action === 'open-config-limites'")
    expect(src).toContain("openModal('configLimitesModal')")
  })

  it('delegation chama openModal para open-novo-prod', () => {
    expect(src).toContain("action === 'open-novo-prod'")
    expect(src).toContain("openModal('novoProdModal')")
  })
})

// ── campos oninput e botão Salvar ainda usam onclick (não são header buttons) ─

describe('produtos.ts source-code: campos e modais internos mantêm handlers inline', () => {
  it('campos de estoque chamam updateStatusPreview() via oninput', () => {
    expect(src).toContain('oninput="updateStatusPreview()"')
  })

  it('botão Salvar no modal de novo produto chama salvarNovoProduto()', () => {
    expect(src).toContain('onclick="salvarNovoProduto()"')
  })
})

// ── escHtml helper para evitar XSS / SyntaxError em HTML gerado ──────────────

describe('produtos.ts source-code: helper escHtml está definido e usado', () => {
  it('escHtml está definida no script client-side', () => {
    expect(src).toContain('function escHtml(')
  })

  it('escHtml escapa & para &amp;', () => {
    expect(src).toContain(".replace(/&/g, '&amp;')")
  })

  it('escHtml escapa < para &lt;', () => {
    expect(src).toContain(".replace(/</g, '&lt;')")
  })

  it('escHtml escapa > para &gt;', () => {
    expect(src).toContain(".replace(/>/g, '&gt;')")
  })

  it('escHtml escapa " para &quot;', () => {
    expect(src).toContain(".replace(/\"/g, '&quot;')")
  })

  it('escHtml é usada nas células do draft (ex.: row notes no title)', () => {
    expect(src).toContain("escHtml(row['notes']")
  })

  it('escHtml é usada no relatório de importação (r.code, r.name, r.message)', () => {
    expect(src).toContain('escHtml(r.code)')
    expect(src).toContain('escHtml(r.name)')
    expect(src).toContain('escHtml(r.message)')
  })
})

// ── Botão de remover linha usa data-action (não onclick inline) ───────────────

describe('produtos.ts source-code: botão remover linha usa data-action', () => {
  it('botão remover usa data-action="import-remove-row"', () => {
    expect(src).toContain('data-action="import-remove-row"')
  })

  it('botão remover não usa onclick="importRemoveRow(', () => {
    expect(src).not.toContain('onclick="importRemoveRow(')
  })

  it('event delegation trata import-remove-row chamando importRemoveRow()', () => {
    expect(src).toContain("action === 'import-remove-row'")
    expect(src).toContain('importRemoveRow(idx)')
  })
})
