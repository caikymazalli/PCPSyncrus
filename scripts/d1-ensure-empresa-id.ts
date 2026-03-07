#!/usr/bin/env node
/**
 * d1-ensure-empresa-id.ts
 *
 * Idempotent script to ensure that every tenant table in the Cloudflare D1
 * database has the `empresa_id` column.
 *
 * Usage:
 *   npx vite-node scripts/d1-ensure-empresa-id.ts [DB_NAME] [--local]
 *
 * Arguments:
 *   DB_NAME   Name of the D1 database (default: $D1_DB_NAME or "pcpsyncrus-production")
 *   --local   Target a local D1 database instead of the remote (production) one
 *
 * What it does for each table in the allowlist:
 *   1. Runs PRAGMA table_info(<table>) to inspect current columns.
 *   2. If `empresa_id` is already present → skips (idempotent).
 *   3. If `empresa_id` is missing → runs:
 *        ALTER TABLE <table> ADD COLUMN empresa_id TEXT DEFAULT '1';
 *        UPDATE <table> SET empresa_id='1' WHERE empresa_id IS NULL OR empresa_id='';
 *   4. Prints a clear summary at the end.
 *
 * Exit codes:
 *   0  — completed successfully (even if no changes were needed)
 *   1  — one or more tables could not be processed (see error output)
 */

import { execSync } from 'child_process'

// ── Allowlist of tenant tables that must have `empresa_id` ───────────────────
//
// Keep this list in sync with REQUIRED_EMPRESA_ID_TABLES in src/d1-schema.test.ts
// and the table in MIGRATIONS.md.

const TENANT_TABLES: string[] = [
  // Created with empresa_id in migration 0001
  'plants',
  'users',
  'suppliers',
  'products',
  'almoxarifados',
  'stock_items',
  'production_orders',
  'non_conformances',
  'quotations',
  'purchase_orders',
  'imports',

  // empresa_id added via ALTER TABLE in migration 0011
  'machines',
  'workbenches',
  'boms',
  'apontamentos',
  'separation_orders',
  'stock_exits',
  'supplier_categories',

  // empresa_id added via ALTER TABLE in migrations 0015 / 0017
  'product_suppliers',

  // Created with empresa_id in migration 0020
  'work_instructions',
  'work_instruction_versions',
  'work_instruction_steps',
  'work_instruction_photos',
  'work_instruction_audit_log',
]

// ── Parse CLI arguments ───────────────────────────────────────────────────────

const args = process.argv.slice(2)
const isLocal = args.includes('--local')
const positional = args.filter(a => !a.startsWith('--'))

const dbName: string =
  positional[0] ?? process.env.D1_DB_NAME ?? 'pcpsyncrus-production'

const remoteFlag = isLocal ? '--local' : '--remote'

console.log(`\n🔧  PCP Syncrus — D1 ensure-empresa-id`)
console.log(`   Database : ${dbName}`)
console.log(`   Target   : ${isLocal ? 'local' : 'remote (production)'}`)
console.log(`   Tables   : ${TENANT_TABLES.length}`)
console.log(`${'─'.repeat(60)}\n`)

// ── Helper: run a wrangler D1 command and return parsed JSON rows ─────────────

interface PragmaRow {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

interface WranglerResult {
  results: PragmaRow[]
  success: boolean
}

function wranglerExec(sql: string): WranglerResult[] {
  const cmd = `npx wrangler d1 execute ${dbName} ${remoteFlag} --json --command ${JSON.stringify(sql)}`
  const raw = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  return JSON.parse(raw) as WranglerResult[]
}

function wranglerExecSilent(sql: string): void {
  const cmd = `npx wrangler d1 execute ${dbName} ${remoteFlag} --command ${JSON.stringify(sql)}`
  execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
}

// ── Main logic ────────────────────────────────────────────────────────────────

const altered: string[] = []
const skipped: string[] = []
const failed: string[] = []

for (const table of TENANT_TABLES) {
  process.stdout.write(`  Checking ${table.padEnd(35)} `)

  try {
    // Step 1 — inspect existing columns
    const results = wranglerExec(`PRAGMA table_info(${table})`)
    const rows: PragmaRow[] = results[0]?.results ?? []
    const hasEmpresaId = rows.some(r => r.name === 'empresa_id')

    if (hasEmpresaId) {
      // Column already present — nothing to do
      console.log('✓  already has empresa_id')
      skipped.push(table)
      continue
    }

    // Step 2 — add the column
    process.stdout.write('⚠  missing — adding ...')
    wranglerExecSilent(
      `ALTER TABLE ${table} ADD COLUMN empresa_id TEXT DEFAULT '1'`
    )

    // Step 3 — normalise existing NULL / empty values
    wranglerExecSilent(
      `UPDATE ${table} SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = ''`
    )

    console.log(' done ✅')
    altered.push(table)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(` ❌  ERROR`)
    console.error(`     ${message.split('\n')[0]}`)
    failed.push(table)
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`)
console.log(`📊  Summary`)
console.log(`   Already correct : ${skipped.length}  (${skipped.join(', ') || 'none'})`)
console.log(`   Columns added   : ${altered.length}  (${altered.join(', ') || 'none'})`)
console.log(`   Errors          : ${failed.length}  (${failed.join(', ') || 'none'})`)
console.log()

if (failed.length > 0) {
  console.error('❌  Some tables could not be processed. Check the errors above.')
  process.exit(1)
}

if (altered.length > 0) {
  console.log(`✅  empresa_id added to ${altered.length} table(s). Schema is now up to date.`)
} else {
  console.log('✅  All tables already have empresa_id. No changes needed.')
}

