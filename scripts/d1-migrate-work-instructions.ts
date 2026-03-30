#!/usr/bin/env node
/**
 * d1-migrate-work-instructions.ts
 *
 * Idempotent migration script for work instructions schema and data.
 *
 * Usage:
 *   npx vite-node scripts/d1-migrate-work-instructions.ts [DB_NAME] [--local]
 *
 * Arguments:
 *   DB_NAME   Name of the D1 database (default: $D1_DB_NAME or "pcpsyncrus-production")
 *   --local   Target a local D1 database instead of the remote (production) one
 *
 * What it does (all steps are idempotent / safe to re-run):
 *
 *   Step 1 — Ensure work_instructions has empresa_id column
 *   Step 2 — Ensure visibility column exists
 *   Step 3 — Ensure normalized tables exist
 *   Step 4 — Seed version rows for instructions without a current version
 *   Step 5 — Convert legacy JSON steps
 *   Step 6 — Propagate empresa_id to dependent tables
 *
 * Exit codes:
 *   0  — completed successfully (even if no changes were needed)
 *   1  — a critical step could not be completed (see error output)
 */

import { execSync } from 'child_process'

// ── Parse CLI arguments ───────────────────────────────────────────────────────

const args = process.argv.slice(2)
const isLocal = args.includes('--local')
const positional = args.filter(a => !a.startsWith('--'))

const dbName: string =
  positional[0] ?? process.env.D1_DB_NAME ?? 'pcpsyncrus-production'

const remoteFlag = isLocal ? '--local' : '--remote'

console.log(`\n🔧  PCP Syncrus — D1 migrate-work-instructions`)
console.log(`   Database : ${dbName}`)
console.log(`   Target   : ${isLocal ? 'local' : 'remote (production)'}`)
console.log(`${'─'.repeat(60)}\n`)

// ── Helpers ───────────────────────────────────────────────────────────────────

interface PragmaColumn {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

interface WranglerResult {
  results: any[]
  success: boolean
}

/** Escape a string value for use in a SQL literal (single-quoted). */
function sqlEscape(val: string | null | undefined): string {
  if (val == null) return 'NULL'
  // Escape single quotes and remove NUL bytes which SQLite rejects
  return val.replace(/\x00/g, '').replace(/'/g, "''")
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

function getTableColumns(table: string): string[] {
  try {
    const results = wranglerExec(`PRAGMA table_info(${table})`)
    const rows: PragmaColumn[] = results[0]?.results ?? []
    return rows.map(r => r.name)
  } catch {
    return []
  }
}

function tableExists(table: string): boolean {
  try {
    const results = wranglerExec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`
    )
    return (results[0]?.results?.length ?? 0) > 0
  } catch {
    return false
  }
}

// ── Step 1: Ensure empresa_id column in work_instructions ────────────────────

console.log('Step 1 — Ensuring empresa_id column in work_instructions ...')

if (!tableExists('work_instructions')) {
  console.log('  ⚠️  Table work_instructions does not exist — creating ...')
  wranglerExecSilent(`
    CREATE TABLE IF NOT EXISTS work_instructions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      empresa_id TEXT,
      code TEXT,
      title TEXT,
      description TEXT,
      current_version TEXT,
      status TEXT,
      visibility TEXT DEFAULT 'creator',
      created_at TEXT,
      created_by TEXT,
      updated_at TEXT,
      updated_by TEXT
    )
  `)
  console.log('  ✅  work_instructions created.')
} else {
  const cols = getTableColumns('work_instructions')
  if (cols.includes('empresa_id')) {
    console.log('  ✓  empresa_id already present in work_instructions')
  } else {
    console.log('  ⚠️  empresa_id missing — adding column ...')
    wranglerExecSilent(
      `ALTER TABLE work_instructions ADD COLUMN empresa_id TEXT`
    )
    console.log('  ✅  empresa_id column added.')
  }

  // Fill empresa_id from registered_users for legacy rows
  console.log('  Filling empresa_id from registered_users for legacy rows ...')
  wranglerExecSilent(`
    UPDATE work_instructions
    SET empresa_id = (
      SELECT ru.empresa_id FROM registered_users ru
      WHERE ru.id = work_instructions.user_id LIMIT 1
    )
    WHERE empresa_id IS NULL OR empresa_id = ''
  `)
  console.log('  ✅  empresa_id fill done.')
}

// ── Step 2: Ensure visibility column in work_instructions ────────────────────

console.log('\nStep 2 — Ensuring visibility column in work_instructions ...')
const wiCols = getTableColumns('work_instructions')
if (!wiCols.includes('visibility')) {
  console.log('  ⚠️  visibility missing — adding column ...')
  wranglerExecSilent(
    `ALTER TABLE work_instructions ADD COLUMN visibility TEXT DEFAULT 'creator'`
  )
  console.log('  ✅  visibility column added.')
} else {
  console.log('  ✓  visibility already present')
}

// ── Step 3: Ensure normalized tables exist ───────────────────────────────────

console.log('\nStep 3 — Ensuring normalized tables exist ...')

const normalizedTables: { name: string; ddl: string }[] = [
  {
    name: 'work_instruction_versions',
    ddl: `CREATE TABLE IF NOT EXISTS work_instruction_versions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      empresa_id TEXT,
      instruction_id TEXT NOT NULL,
      version TEXT,
      title TEXT,
      description TEXT,
      is_current INTEGER DEFAULT 0,
      status TEXT,
      created_at TEXT,
      created_by TEXT,
      FOREIGN KEY (instruction_id) REFERENCES work_instructions(id)
    )`,
  },
  {
    name: 'work_instruction_steps',
    ddl: `CREATE TABLE IF NOT EXISTS work_instruction_steps (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      empresa_id TEXT,
      version_id TEXT NOT NULL,
      step_number INTEGER,
      title TEXT,
      description TEXT,
      observation TEXT,
      created_at TEXT,
      created_by TEXT,
      FOREIGN KEY (version_id) REFERENCES work_instruction_versions(id)
    )`,
  },
  {
    name: 'work_instruction_photos',
    ddl: `CREATE TABLE IF NOT EXISTS work_instruction_photos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      empresa_id TEXT,
      step_id TEXT NOT NULL,
      photo_url TEXT,
      file_name TEXT,
      object_key TEXT,
      content_type TEXT,
      uploaded_at TEXT,
      uploaded_by TEXT,
      FOREIGN KEY (step_id) REFERENCES work_instruction_steps(id)
    )`,
  },
  {
    name: 'work_instruction_audit_log',
    ddl: `CREATE TABLE IF NOT EXISTS work_instruction_audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      empresa_id TEXT,
      instruction_id TEXT,
      action TEXT,
      details TEXT,
      changed_by TEXT,
      changed_at TEXT,
      ip_address TEXT,
      FOREIGN KEY (instruction_id) REFERENCES work_instructions(id)
    )`,
  },
]

for (const t of normalizedTables) {
  process.stdout.write(`  ${t.name.padEnd(40)} `)
  wranglerExecSilent(t.ddl)
  console.log('✅')
}

// ── Step 4: Seed version rows for instructions without a current version ──────

console.log('\nStep 4 — Seeding version rows for instructions without versions ...')

wranglerExecSilent(`
  INSERT OR IGNORE INTO work_instruction_versions
    (id, user_id, empresa_id, instruction_id, version, title, description,
     is_current, status, created_at, created_by)
  SELECT
    'wiv_' || wi.id,
    wi.user_id,
    wi.empresa_id,
    wi.id,
    COALESCE(wi.current_version, '1.0'),
    wi.title,
    wi.description,
    1,
    COALESCE(wi.status, 'draft'),
    COALESCE(wi.created_at, datetime('now')),
    wi.created_by
  FROM work_instructions wi
  WHERE NOT EXISTS (
    SELECT 1 FROM work_instruction_versions wiv
    WHERE wiv.instruction_id = wi.id AND wiv.is_current = 1
  )
`)
console.log('  ✅  Version rows seeded (INSERT OR IGNORE).')

// ── Step 5: Convert legacy JSON steps ────────────────────────────────────────

console.log('\nStep 5 — Checking for legacy JSON steps column ...')

const wiColsAfter = getTableColumns('work_instructions')
if (!wiColsAfter.includes('steps')) {
  console.log('  ✓  No legacy `steps` column — nothing to convert.')
} else {
  console.log('  ⚠️  Legacy `steps` column found — fetching rows with JSON steps ...')

  // Fetch all instructions that have JSON steps
  const rows = wranglerExec(`
    SELECT id, user_id, empresa_id, steps FROM work_instructions
    WHERE steps IS NOT NULL AND steps != '' AND steps != '[]'
  `)

  const instructions: any[] = rows[0]?.results ?? []
  console.log(`  Found ${instructions.length} instruction(s) with legacy steps.`)

  let converted = 0
  let skipped = 0
  let errors = 0

  for (const instr of instructions) {
    let steps: any[]
    try {
      steps = JSON.parse(instr.steps)
      if (!Array.isArray(steps)) steps = []
    } catch {
      console.warn(`  ⚠️  Could not parse steps JSON for instruction ${instr.id}`)
      errors++
      continue
    }

    const versionId = `wiv_${instr.id}`

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]
      const stepId = `wis_${instr.id}_${i}`
      const stepNumber = s.step_number ?? s.stepNumber ?? i + 1
      const title = sqlEscape(s.title ?? '')
      const description = sqlEscape(s.description ?? '')
      const observation = sqlEscape(s.observation ?? '')
      const createdAt = sqlEscape(s.created_at ?? s.createdAt ?? new Date().toISOString())
      const createdBy = sqlEscape(s.created_by ?? s.createdBy ?? instr.user_id ?? '')
      const userId = sqlEscape(instr.user_id)
      const empresaId = sqlEscape(instr.empresa_id ?? '')
      const versionIdEscaped = sqlEscape(`wiv_${instr.id}`)
      const escapedStepId = sqlEscape(stepId)

      try {
        wranglerExecSilent(`
          INSERT OR IGNORE INTO work_instruction_steps
            (id, user_id, empresa_id, version_id, step_number, title,
             description, observation, created_at, created_by)
          VALUES (
            '${escapedStepId}',
            '${userId}',
            '${empresaId}',
            '${versionIdEscaped}',
            ${Number(stepNumber)},
            '${title}',
            '${description}',
            '${observation}',
            '${createdAt}',
            '${createdBy}'
          )
        `)
        converted++
      } catch (err) {
        console.warn(`  ⚠️  Failed to insert step ${stepId}: ${err}`)
        errors++
      }
    }

    if (steps.length === 0) skipped++
  }

  console.log(`  ✅  Converted: ${converted} steps | Skipped (empty): ${skipped} | Errors: ${errors}`)
}

// ── Step 6: Propagate empresa_id to dependent tables ─────────────────────────

console.log('\nStep 6 — Propagating empresa_id to dependent tables ...')

const propagateQueries: { label: string; sql: string }[] = [
  {
    label: 'work_instruction_versions',
    sql: `UPDATE work_instruction_versions
          SET empresa_id = (
            SELECT wi.empresa_id FROM work_instructions wi
            WHERE wi.id = work_instruction_versions.instruction_id LIMIT 1
          )
          WHERE empresa_id IS NULL OR empresa_id = ''`,
  },
  {
    label: 'work_instruction_steps',
    sql: `UPDATE work_instruction_steps
          SET empresa_id = (
            SELECT wiv.empresa_id FROM work_instruction_versions wiv
            WHERE wiv.id = work_instruction_steps.version_id LIMIT 1
          )
          WHERE empresa_id IS NULL OR empresa_id = ''`,
  },
  {
    label: 'work_instruction_photos',
    sql: `UPDATE work_instruction_photos
          SET empresa_id = (
            SELECT wis.empresa_id FROM work_instruction_steps wis
            WHERE wis.id = work_instruction_photos.step_id LIMIT 1
          )
          WHERE empresa_id IS NULL OR empresa_id = ''`,
  },
  {
    label: 'work_instruction_audit_log',
    sql: `UPDATE work_instruction_audit_log
          SET empresa_id = (
            SELECT wi.empresa_id FROM work_instructions wi
            WHERE wi.id = work_instruction_audit_log.instruction_id LIMIT 1
          )
          WHERE empresa_id IS NULL OR empresa_id = ''`,
  },
]

for (const q of propagateQueries) {
  process.stdout.write(`  ${q.label.padEnd(40)} `)
  try {
    wranglerExecSilent(q.sql)
    console.log('✅')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.split('\n')[0] : String(err)
    console.log(`⚠️  ${msg}`)
  }
}

console.log(`\n${'─'.repeat(60)}`)
console.log('✅  Work instructions migration complete.\n')
