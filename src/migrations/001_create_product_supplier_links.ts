/**
 * Migration: Criar tabela product_supplier_links
 * Executada automaticamente ao inicializar a aplicação
 */

export async function migrateProductSupplierLinks(db: D1Database): Promise<boolean> {
  console.log('[MIGRATION] Iniciando migração: product_supplier_links')

  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS product_supplier_links (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        empresa_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        supplier_name TEXT NOT NULL,
        supplier_email TEXT,
        supplier_phone TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT,

        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        UNIQUE(product_id, supplier_id, user_id)
      )
    `).run()

    await db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_product_supplier_links_user ON product_supplier_links(user_id, empresa_id)`
    ).run()
    await db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_product_supplier_links_product ON product_supplier_links(product_id)`
    ).run()
    await db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_product_supplier_links_supplier ON product_supplier_links(supplier_id)`
    ).run()

    console.log('[MIGRATION] ✅ product_supplier_links pronto')
    return true
  } catch (e) {
    console.error('[MIGRATION] ❌ Erro ao migrar:', (e as any).message)
    return false
  }
}
