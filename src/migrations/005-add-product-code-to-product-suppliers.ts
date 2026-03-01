export async function migrate(db: D1Database, userId: string): Promise<void> {
  try {
    console.log('[MIGRATION] Verificando se coluna product_code existe em product_suppliers...')

    const tableInfo = await db.prepare('PRAGMA table_info(product_suppliers)').all()

    if (!tableInfo.results || tableInfo.results.length === 0) {
      console.log('[MIGRATION] Tabela product_suppliers não existe ou está vazia')
      return
    }

    const hasProductCode = tableInfo.results.some((col: any) => col.name === 'product_code')
    const hasCode = tableInfo.results.some((col: any) => col.name === 'code')

    if (hasProductCode) {
      console.log('[MIGRATION] ✅ Coluna product_code já existe')
      return
    }

    if (hasCode && !hasProductCode) {
      console.log('[MIGRATION] Renomeando coluna code → product_code')
      try {
        await db.prepare('ALTER TABLE product_suppliers RENAME COLUMN code TO product_code').run()
        console.log('[MIGRATION] ✅ Coluna renomeada com sucesso')
      } catch (renameError: any) {
        // SQLite antigo não suporta RENAME COLUMN, criar nova coluna como fallback
        console.log('[MIGRATION] ⚠️ RENAME COLUMN não suportado, criando nova coluna...')
        await db.prepare('ALTER TABLE product_suppliers ADD COLUMN product_code TEXT').run()
        await db.prepare('UPDATE product_suppliers SET product_code = code WHERE product_code IS NULL').run()
        console.log('[MIGRATION] ✅ Coluna product_code criada e preenchida')
      }
    } else {
      console.log('[MIGRATION] Criando coluna product_code')
      await db.prepare('ALTER TABLE product_suppliers ADD COLUMN product_code TEXT').run()
      console.log('[MIGRATION] ✅ Coluna product_code criada')
    }
  } catch (error: any) {
    console.error('[MIGRATION][ERROR] Erro ao migrar product_suppliers:', error.message)
    throw error
  }
}
