/**
 * d1-schema.test.ts
 *
 * Static guardrail: verifies that every table used with `empresa_id` in the
 * route handlers has the column covered by at least one migration file.
 *
 * Coverage check strategy (no live D1 needed):
 *  - A table is considered "covered" if any `.sql` file in `migrations/`
 *    contains either:
 *      a) A CREATE TABLE statement that already includes an `empresa_id` column, OR
 *      b) An ALTER TABLE … ADD COLUMN empresa_id statement for that table.
 *
 * This test fails fast if a developer adds a new table that stores tenant data
 * but forgets to add the matching `empresa_id` migration.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve, join } from 'path'

// ── Directories ───────────────────────────────────────────────────────────────

const MIGRATIONS_DIR = resolve(__dirname, '../migrations')

// ── Required tables ───────────────────────────────────────────────────────────
//
// These are all the tables that the application reads or writes with
// `empresa_id` for multi-tenant data isolation.
// If you add a new tenant table, add its name to this list AND add a migration
// that includes `empresa_id` in the CREATE TABLE or as an ALTER TABLE ADD COLUMN.

const REQUIRED_EMPRESA_ID_TABLES: string[] = [
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Escapes special regex metacharacters in a literal string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Returns the concatenated content of all migration .sql files. */
function loadAllMigrations(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
  return files.join('\n')
}

/**
 * Returns true if any migration covers `empresa_id` for `table`, either via:
 *  a) CREATE TABLE <table> (...empresa_id...) — column present at creation, or
 *  b) ALTER TABLE <table> ADD COLUMN empresa_id — column added later.
 */
function isCoveredByMigration(table: string, allMigrationsContent: string): boolean {
  const escapedTable = escapeRegex(table)

  // Pattern (a): CREATE TABLE with empresa_id in same block
  // We look for CREATE TABLE <table> followed (within ~50 lines) by empresa_id
  const createBlockRe = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${escapedTable}\\b[^;]*?empresa_id`,
    'si'
  )
  if (createBlockRe.test(allMigrationsContent)) {
    return true
  }

  // Pattern (b): ALTER TABLE <table> ADD COLUMN empresa_id
  const alterRe = new RegExp(
    `ALTER\\s+TABLE\\s+${escapedTable}\\s+ADD\\s+COLUMN\\s+empresa_id`,
    'i'
  )
  if (alterRe.test(allMigrationsContent)) {
    return true
  }

  return false
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('D1 schema — empresa_id coverage in migrations', () => {
  const allMigrations = loadAllMigrations()

  for (const table of REQUIRED_EMPRESA_ID_TABLES) {
    it(`table "${table}" has empresa_id covered in some migration`, () => {
      const covered = isCoveredByMigration(table, allMigrations)
      expect(
        covered,
        `Table "${table}" is used with empresa_id in route handlers but no migration ` +
          `adds the column. Add an ALTER TABLE ${table} ADD COLUMN empresa_id TEXT DEFAULT '1' ` +
          `to a new migration file in migrations/.`
      ).toBe(true)
    })
  }
})
