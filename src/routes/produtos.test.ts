/**
 * produtos.test.ts
 *
 * Source-code guardrail tests for the Produtos module.
 * Verifies that inline HTML event handler functions are properly
 * defined in the client-side script and exposed on the global `window`
 * object so they can be called from HTML event attributes (onclick, oninput).
 *
 * Background: Without explicit window assignments, function declarations
 * inside a <script> block may not be accessible as inline event handlers
 * in certain browser contexts, producing:
 *   - Uncaught ReferenceError: openImportModal is not defined
 *   - Uncaught ReferenceError: updateStatusPreview is not defined
 *   - Uncaught ReferenceError: salvarNovoProduto is not defined
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

// ── Inline HTML event attribute callers ──────────────────────────────────────

describe('produtos.ts source-code: inline HTML event attributes chamam as funções corretas', () => {
  it('botão Importar chama openImportModal()', () => {
    expect(src).toContain('onclick="openImportModal()"')
  })

  it('campos de estoque chamam updateStatusPreview() via oninput', () => {
    expect(src).toContain('oninput="updateStatusPreview()"')
  })

  it('botão Salvar no modal de novo produto chama salvarNovoProduto()', () => {
    expect(src).toContain('onclick="salvarNovoProduto()"')
  })
})
