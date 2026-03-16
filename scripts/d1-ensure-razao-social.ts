#!/usr/bin/env node
/**
 * d1-ensure-razao-social.ts
 *
 * Idempotent script to ensure the `razao_social` column exists in the
 * `empresas` table in the Cloudflare D1 database.
 *
 * Usage:
 *   npx vite-node scripts/d1-ensure-razao-social.ts [DB_NAME] [--local]
 *
 * Arguments:
 *   DB_NAME   Name of the D1 database (default: $D1_DB_NAME or "pcpsyncrus-production")
 *   --local   Target a local D1 database instead of the remote (production) one
 *
 * What it does:
 *   1. Runs PRAGMA table_info(empresas) to inspect current columns.
 *   2. If `razao_social` is already present → exits successfully (idempotent).
 *   3. If `razao_social` is missing → runs:
 *        ALTER TABLE empresas ADD COLUMN razao_social TEXT;
 *   4. Prints a clear summary at the end.
 *
 * Exit codes:
 *   0  — completed successfully (even if no changes were needed)
 *   1  — the column could not be added (see error output)
 *
 * This is equivalent to migration 0035_empresa_razao_social.sql but safe to
 * run in any environment regardless of whether the migration has already been
 * applied by the Wrangler migration tracker.
 */

import { execSync } from 'child_process'

// ── Parse CLI arguments ───────────────────────────────────────────────────────

const args = process.argv.slice(2)
const isLocal = args.includes('--local')
const positional = args.filter(a => !a.startsWith('--'))

const dbName: string =
  positional[0] ?? process.env.D1_DB_NAME ?? 'pcpsyncrus-production'

const remoteFlag = isLocal ? '--local' : '--remote'

console.log(`\n🔧  PCP Syncrus — D1 ensure-razao-social`)
console.log(`   Database : ${dbName}`)
console.log(`   Target   : ${isLocal ? 'local' : 'remote (production)'}`)
console.log(`${'─'.repeat(60)}\n`)

// ── Helpers ───────────────────────────────────────────────────────────────────

interface PragmaRow { name: string; type: string }
interface WranglerResult { results: PragmaRow[]; success: boolean }

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

process.stdout.write(`  Checking empresas.razao_social      `)

try {
  // Step 1 — inspect existing columns in empresas
  const results = wranglerExec('PRAGMA table_info(empresas)')
  const rows: PragmaRow[] = results[0]?.results ?? []
  const hasRazaoSocial = rows.some(r => r.name === 'razao_social')

  if (hasRazaoSocial) {
    console.log('✓  already exists')
    console.log(`\n${'─'.repeat(60)}`)
    console.log('📊  Summary')
    console.log('   Status : razao_social already present in empresas — no changes needed.')
    console.log('\n✅  Schema is up to date.\n')
    process.exit(0)
  }

  // Step 2 — add the column
  process.stdout.write('⚠  missing — adding ...')
  wranglerExecSilent('ALTER TABLE empresas ADD COLUMN razao_social TEXT')
  console.log(' done ✅')

  console.log(`\n${'─'.repeat(60)}`)
  console.log('📊  Summary')
  console.log('   Columns added : razao_social  (empresas)')
  console.log('\n✅  razao_social added to empresas. Schema is now up to date.\n')
  process.exit(0)
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  console.log(' ❌  ERROR')
  console.error(`\n${message.split('\n')[0]}`)
  console.log(`\n${'─'.repeat(60)}`)
  console.error('❌  Could not ensure razao_social column. Check the error above.\n')
  process.exit(1)
}
