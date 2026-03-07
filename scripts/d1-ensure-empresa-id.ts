#!/usr/bin/env npx ts-node
/**
 * d1-ensure-empresa-id.ts
 *
 * Script idempotente para garantir que as colunas `empresa_id` existam
 * nas tabelas `machines` e `workbenches` do D1 (pcpsyncrus-production).
 *
 * PROBLEMA RESOLVIDO
 * ------------------
 * O SQLite/D1 não suporta `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
 * Isso significa que rodar `wrangler d1 migrations apply` em um
 * ambiente que já recebeu o hotfix manual falha com:
 *   "duplicate column name: empresa_id"
 *
 * Este script faz a verificação via `PRAGMA table_info` antes de
 * aplicar o `ALTER TABLE`, tornando a operação segura de executar
 * repetidas vezes.
 *
 * COMO USAR
 * ---------
 * 1. Certifique-se de ter o wrangler instalado e autenticado:
 *      npx wrangler login
 *
 * 2. Execute o script passando o nome do banco D1 como argumento:
 *      npx ts-node scripts/d1-ensure-empresa-id.ts pcpsyncrus-production
 *
 *    Ou com o shorthand:
 *      node --import tsx/esm scripts/d1-ensure-empresa-id.ts pcpsyncrus-production
 *
 * 3. Para ambiente local (miniflare/dev):
 *      npx ts-node scripts/d1-ensure-empresa-id.ts pcpsyncrus-production --local
 *
 * TABELAS COBERTAS
 * ----------------
 * - machines
 * - workbenches
 *
 * O script também normaliza registros com empresa_id NULL ou '' para '1'.
 */

import { execSync } from 'child_process'

const DB_NAME = process.argv[2]
const IS_LOCAL = process.argv.includes('--local')

if (!DB_NAME) {
  console.error('Uso: npx ts-node scripts/d1-ensure-empresa-id.ts <DB_NAME> [--local]')
  console.error('Exemplo: npx ts-node scripts/d1-ensure-empresa-id.ts pcpsyncrus-production')
  process.exit(1)
}

// Validate DB_NAME to prevent command injection (alphanumeric + hyphens/underscores only)
if (!/^[a-zA-Z0-9_-]+$/.test(DB_NAME)) {
  console.error(`Erro: nome de banco inválido: "${DB_NAME}". Use apenas letras, números, hífens e underscores.`)
  process.exit(1)
}

const remoteFlag = IS_LOCAL ? '--local' : '--remote'

function d1Execute(sql: string): { output: string; ok: boolean } {
  // Escape backslashes first, then double-quotes, to build a safe shell argument
  const safeSql = sql.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const cmd = `npx wrangler d1 execute ${DB_NAME} ${remoteFlag} --command "${safeSql}"`
  try {
    const output = execSync(cmd, { encoding: 'utf8' })
    return { output, ok: true }
  } catch (e: any) {
    const output = e.stdout || e.stderr || String(e)
    return { output, ok: false }
  }
}

function getColumns(table: string): string[] {
  const { output, ok } = d1Execute(`PRAGMA table_info(${table})`)
  if (!ok) {
    console.error(`[${table}] Falha ao consultar PRAGMA table_info:`, output.trim())
    return []
  }
  const matches = output.match(/"name":\s*"([^"]+)"/g) || []
  return matches.map(m => m.replace(/"name":\s*"/, '').replace(/"$/, ''))
}

function ensureEmpresaId(table: string): void {
  console.log(`\n[${table}] Verificando coluna empresa_id...`)
  const columns = getColumns(table)

  if (columns.includes('empresa_id')) {
    console.log(`[${table}] ✓ empresa_id já existe — nenhuma alteração necessária`)
  } else {
    console.log(`[${table}] ⚠ empresa_id AUSENTE — aplicando ALTER TABLE...`)
    const { output, ok } = d1Execute(`ALTER TABLE ${table} ADD COLUMN empresa_id TEXT DEFAULT '1'`)
    if (!ok) {
      console.error(`[${table}] Falha ao executar ALTER TABLE:`, output.trim())
      process.exit(1)
    }
    console.log(`[${table}] ALTER TABLE aplicado com sucesso`)
  }

  // Normalizar registros com empresa_id NULL ou '' (idempotente)
  console.log(`[${table}] Normalizando registros com empresa_id vazio...`)
  const { output, ok } = d1Execute(`UPDATE ${table} SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = ''`)
  if (!ok) {
    console.error(`[${table}] Falha ao normalizar registros:`, output.trim())
    process.exit(1)
  }
  console.log(`[${table}] Normalização concluída`)
}

console.log('='.repeat(60))
console.log('d1-ensure-empresa-id — Script idempotente')
console.log(`Banco: ${DB_NAME} (${IS_LOCAL ? 'local' : 'remoto'})`)
console.log('='.repeat(60))

ensureEmpresaId('machines')
ensureEmpresaId('workbenches')

console.log('\n' + '='.repeat(60))
console.log('✓ Concluído. Verifique o schema com:')
console.log(`  npx wrangler d1 execute ${DB_NAME} ${remoteFlag} --command "PRAGMA table_info(machines)"`)
console.log(`  npx wrangler d1 execute ${DB_NAME} ${remoteFlag} --command "PRAGMA table_info(workbenches)"`)
console.log('='.repeat(60))
