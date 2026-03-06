/**
 * d1-guardrails.test.ts
 *
 * Global static-analysis guardrails to prevent D1 persistence regressions
 * in production route handlers (app.post / app.put / app.delete).
 *
 * Two categories of violations are detected:
 *
 * 1. SILENT D1 WRITE FAILURES
 *    Empty `catch {}` blocks or `.catch(() => {})` chains that silently swallow
 *    errors from `dbInsert`, `dbUpdate`, `dbDelete`, or `dbInsertWithRetry`
 *    inside a production guard (`if (db && userId !== 'demo-tenant')`).
 *
 * 2. MEMORY-FIRST MUTATIONS
 *    Mutating `tenant.*` (push / splice / Object.assign) at handler scope
 *    *before* the D1 production block runs in the same handler.
 *    If D1 later fails, in-memory state has already diverged from the DB.
 *
 * Both detectors are validated below with inline fixture strings before the
 * file-scanning tests run, ensuring the detector logic itself is correct.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve, join } from 'path'

// ── Constants ─────────────────────────────────────────────────────────────────

const ROUTES_DIR = resolve(__dirname, '.')

const D1_WRITE_RE = /\b(dbInsert|dbUpdate|dbDelete|dbInsertWithRetry)\s*\(/
const D1_PROD_BLOCK_RE = /if\s*\(\s*db\s*&&\s*userId\s*!==\s*['"]demo-tenant['"]/
const HANDLER_RE = /\bapp\.(post|put|delete)\s*\(/i
const TENANT_MUTATION_RE =
  /tenant\.[a-zA-Z]+\.(push|splice)\s*\(|Object\.assign\s*\(\s*tenant\./

/** Patterns for a truly empty catch block (no logging, no comment). */
const SILENT_CATCH_RE =
  /\}\s*catch\s*\{\s*\}|\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/

// ── Helper: get leading-whitespace length ─────────────────────────────────────

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

// ── Helper: count net brace depth of a single line ───────────────────────────

function braceDepth(line: string): number {
  let depth = 0
  for (const ch of line) {
    if (ch === '{') depth++
    else if (ch === '}') depth--
  }
  return depth
}

// ── Helper: extract handler bodies ───────────────────────────────────────────

interface HandlerBlock {
  /** 1-indexed line number in the source file where the handler starts. */
  startLine: number
  /** All lines belonging to the handler, including the opening `app.post(…)` line. */
  lines: string[]
}

function extractHandlers(source: string): HandlerBlock[] {
  const srcLines = source.split('\n')
  const handlers: HandlerBlock[] = []

  let i = 0
  while (i < srcLines.length) {
    if (HANDLER_RE.test(srcLines[i])) {
      const startLine = i + 1 // 1-indexed
      const handlerLines: string[] = [srcLines[i]]
      let depth = braceDepth(srcLines[i])
      i++

      while (i < srcLines.length && depth > 0) {
        handlerLines.push(srcLines[i])
        depth += braceDepth(srcLines[i])
        i++
      }

      handlers.push({ startLine, lines: handlerLines })
    } else {
      i++
    }
  }

  return handlers
}

// ── Detector 1: silent catches around D1 write helpers ───────────────────────

/**
 * Returns a list of violation descriptions for silent catches that swallow
 * D1 write-helper errors.
 *
 * Detection strategy:
 *   For each line with an empty catch, look backward within a 12-line window
 *   for both a D1 production guard and a D1 write-helper call. If both are
 *   present, the catch is wrapping a D1 write silently.
 */
export function findSilentD1WriteCatches(
  source: string,
  label = '<source>'
): string[] {
  const violations: string[] = []
  const lines = source.split('\n')

  for (let i = 0; i < lines.length; i++) {
    if (!SILENT_CATCH_RE.test(lines[i])) continue

    const windowStart = Math.max(0, i - 12)
    const context = lines.slice(windowStart, i + 1).join('\n')

    if (D1_WRITE_RE.test(context) && D1_PROD_BLOCK_RE.test(context)) {
      violations.push(
        `${label}:${i + 1}: silent catch swallows D1 write — ${lines[i].trim()}`
      )
    }
  }

  return violations
}

// ── Detector 2: memory-first mutations ───────────────────────────────────────

/**
 * Returns violation descriptions for handler-scope `tenant.*` mutations that
 * appear *before* the D1 production block in the same handler.
 *
 * Only flags mutations whose indentation level matches (≤) the D1 block line,
 * which excludes nested fallback-load patterns inside inner `if (db && …)`
 * conditions.
 */
export function findMemoryFirstMutations(
  source: string,
  label = '<source>'
): string[] {
  const violations: string[] = []
  const handlers = extractHandlers(source)

  for (const handler of handlers) {
    // Find the first D1 production block within this handler
    const d1Idx = handler.lines.findIndex(l => D1_PROD_BLOCK_RE.test(l))
    if (d1Idx === -1) continue

    // Verify the D1 block actually contains a write-helper call (not just a read)
    const d1Window = handler.lines
      .slice(d1Idx, Math.min(d1Idx + 15, handler.lines.length))
      .join('\n')
    if (!D1_WRITE_RE.test(d1Window)) continue

    const d1Indent = indentOf(handler.lines[d1Idx])

    // Check every line before the D1 block for handler-scope mutations
    for (let j = 0; j < d1Idx; j++) {
      const line = handler.lines[j]
      if (!TENANT_MUTATION_RE.test(line)) continue

      // Skip mutations that are more deeply nested than the D1 block itself
      // (e.g., fallback-load pushes inside `if (stepIdx === -1 && db && …)`)
      if (indentOf(line) > d1Indent) continue

      const fileLineNo = handler.startLine + j
      violations.push(
        `${label}:${fileLineNo}: memory-first mutation before D1 block — ${line.trim()}`
      )
    }
  }

  return violations
}

// ── Helper: list route files to scan ─────────────────────────────────────────

function getRouteFiles(): string[] {
  return readdirSync(ROUTES_DIR)
    .filter(f => f.endsWith('.ts') && !f.includes('.test.') && !f.includes('.spec.'))
    .map(f => join(ROUTES_DIR, f))
    .sort()
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION A — Detector unit tests (inline fixtures)
// These tests validate the detector logic itself against known-bad patterns.
// ════════════════════════════════════════════════════════════════════════════

describe('Detector internals — silent-catch fixture', () => {
  it('detects .catch(() => {}) around a D1 write helper inside a prod block', () => {
    const fixture = `
app.post('/test', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'table', data).catch(() => {})
  }
  return ok(c)
})`
    const violations = findSilentD1WriteCatches(fixture, 'fixture')
    expect(violations.length).toBeGreaterThan(0)
  })

  it('does NOT flag .catch(() => null) used for body parsing', () => {
    const fixture = `
app.post('/test', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'table', data)
  }
  return ok(c)
})`
    const violations = findSilentD1WriteCatches(fixture, 'fixture')
    expect(violations.length).toBe(0)
  })

  it('detects empty catch{} block wrapping a D1 write helper', () => {
    const fixture = `
app.delete('/test/:id', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  if (db && userId !== 'demo-tenant') {
    try {
      await dbDelete(db, 'table', id, userId)
    } catch {}
  }
  return ok(c)
})`
    const violations = findSilentD1WriteCatches(fixture, 'fixture')
    expect(violations.length).toBeGreaterThan(0)
  })

  it('does NOT flag empty catch{} that does NOT involve a D1 write helper', () => {
    const fixture = `
app.get('/test', async (c) => {
  const db = getCtxDB(c)
  try {
    const row = await db.prepare('SELECT * FROM t').first()
  } catch {}
  return ok(c)
})`
    const violations = findSilentD1WriteCatches(fixture, 'fixture')
    expect(violations.length).toBe(0)
  })
})

describe('Detector internals — memory-first fixture', () => {
  it('detects tenant.push() before D1 block in POST handler', () => {
    const fixture = `
app.post('/test', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const tenant = getCtxTenant(c)
  const item = { id: '1', name: 'x' }
  tenant.items.push(item)
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'items', item)
  }
  return ok(c, { item })
})`
    const violations = findMemoryFirstMutations(fixture, 'fixture')
    expect(violations.length).toBeGreaterThan(0)
  })

  it('does NOT flag tenant.push() that appears AFTER the D1 block', () => {
    const fixture = `
app.post('/test', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const tenant = getCtxTenant(c)
  const item = { id: '1', name: 'x' }
  if (db && userId !== 'demo-tenant') {
    await dbInsert(db, 'items', item)
  }
  tenant.items.push(item)
  return ok(c, { item })
})`
    const violations = findMemoryFirstMutations(fixture, 'fixture')
    expect(violations.length).toBe(0)
  })

  it('detects Object.assign(tenant.) before D1 block in PUT handler', () => {
    const fixture = `
app.put('/test/:id', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const tenant = getCtxTenant(c)
  Object.assign(tenant.items[0], body)
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'items', id, userId, body)
  }
  return ok(c, { item: tenant.items[0] })
})`
    const violations = findMemoryFirstMutations(fixture, 'fixture')
    expect(violations.length).toBeGreaterThan(0)
  })

  it('does NOT flag nested push inside an inner db-guarded fallback-load block', () => {
    // This pattern is used to lazily populate memory from D1 (a cache load,
    // not a user-data mutation). It must NOT be flagged.
    const fixture = `
app.put('/test/:id', async (c) => {
  const db = getCtxDB(c)
  const userId = getCtxUserId(c)
  const tenant = getCtxTenant(c)
  let idx = tenant.items.findIndex((i) => i.id === id)
  if (idx === -1 && db && userId !== 'demo-tenant') {
    const row = await db.prepare('SELECT * FROM items WHERE id = ?').bind(id).first()
    if (row) {
      tenant.items.push(row)
      idx = tenant.items.length - 1
    }
  }
  if (idx === -1) return err(c, 'Not found', 404)
  if (db && userId !== 'demo-tenant') {
    await dbUpdate(db, 'items', id, userId, body)
  }
  tenant.items[idx] = { ...tenant.items[idx], ...body }
  return ok(c, { item: tenant.items[idx] })
})`
    const violations = findMemoryFirstMutations(fixture, 'fixture')
    expect(violations.length).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// SECTION B — File-scan tests: scan every route file for violations
// ════════════════════════════════════════════════════════════════════════════

describe('D1 guardrails — no silent write failures in route files', () => {
  const routeFiles = getRouteFiles()

  for (const filePath of routeFiles) {
    it(`${filePath.split('/').at(-1)} has no silent D1 write catches`, () => {
      const source = readFileSync(filePath, 'utf8')
      const violations = findSilentD1WriteCatches(source, filePath)
      expect(violations, violations.join('\n')).toHaveLength(0)
    })
  }
})

describe('D1 guardrails — no memory-first mutations in route files', () => {
  const routeFiles = getRouteFiles()

  for (const filePath of routeFiles) {
    it(`${filePath.split('/').at(-1)} has no memory-first mutations before D1 block`, () => {
      const source = readFileSync(filePath, 'utf8')
      const violations = findMemoryFirstMutations(source, filePath)
      expect(violations, violations.join('\n')).toHaveLength(0)
    })
  }
})
