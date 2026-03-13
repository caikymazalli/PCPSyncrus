/**
 * produtos.test.ts
 *
 * Source-code guardrail tests for the Produtos module.
 * Verifies that inline HTML event handler functions are properly
 * defined in the client-side script and exposed on the global `window`
 * object, and that header buttons use data-action attributes instead of
 * inline onclick handlers (prevents SyntaxError / openImportModal is not defined).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

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
