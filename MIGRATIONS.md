# PCP Syncrus — Guia de Migrations D1

## Visão Geral

Este projeto usa **Cloudflare D1** como banco de dados relacional. As migrations
ficam em `migrations/` e são aplicadas sequencialmente pelo Wrangler.

Todos os ambientes (produção e staging/pages.dev) devem ter **todas** as migrations
aplicadas para evitar erros 500 por colunas ausentes.

---

## Como Aplicar Migrations

### 1. Ver o estado atual

```bash
# Lista quais migrations já foram aplicadas no banco remoto
wrangler d1 migrations list <DB_NAME> --remote
```

### 2. Aplicar migrations pendentes

```bash
# Aplica todas as migrations que ainda não foram executadas
wrangler d1 migrations apply <DB_NAME> --remote
```

> **Nota:** O Wrangler rastreia quais migrations foram aplicadas internamente.
> Use sempre `migrations apply` em vez de executar arquivos `.sql` manualmente.

### 3. Verificar schema de uma tabela específica

```bash
wrangler d1 execute <DB_NAME> --remote \
  --command "PRAGMA table_info(workbenches)"
```

---

## Tabelas Tenant (`empresa_id`)

O modelo multi-empresa do PCP Syncrus isola dados por `empresa_id`. As seguintes
tabelas **devem** ter a coluna `empresa_id` para que o app funcione corretamente:

| Tabela | Migration que adicionou `empresa_id` |
|---|---|
| `plants` | 0001 (criação) |
| `users` | 0001 (criação) |
| `suppliers` | 0001 (criação) |
| `products` | 0001 (criação) |
| `almoxarifados` | 0001 (criação) |
| `stock_items` | 0001 (criação) |
| `production_orders` | 0001 (criação) |
| `non_conformances` | 0001 (criação) |
| `quotations` | 0001 (criação) |
| `purchase_orders` | 0001 (criação) |
| `imports` | 0001 (criação) |
| `machines` | 0011 |
| `workbenches` | 0011 |
| `boms` | 0011 |
| `apontamentos` | 0011 |
| `separation_orders` | 0011 |
| `stock_exits` | 0011 |
| `supplier_categories` | 0011 |
| `product_suppliers` | 0015 / 0017 |
| `work_instructions` | 0020 (criação) |
| `work_instruction_versions` | 0020 (criação) |
| `work_instruction_steps` | 0020 (criação) |
| `work_instruction_photos` | 0020 (criação) |
| `work_instruction_audit_log` | 0020 (criação) |

---

## Migration 0022 — Catch-up para `empresa_id`

A migration `0022_empresa_id_everywhere.sql` é uma migration de "catch-up" criada
para ambientes cujo schema foi gerado de forma parcial (ex.: criação manual sem
Wrangler ou migrations 0011–0017 nunca aplicadas).

### Quando aplicar

- Aplique se o endpoint `POST /recursos/bancadas` (ou qualquer rota tenant) retornar
  erro 500 por coluna ausente.
- Confirme a ausência da coluna antes:

```bash
wrangler d1 execute <DB_NAME> --remote \
  --command "PRAGMA table_info(workbenches)"
```

Se `empresa_id` **não aparecer** na saída, aplique as migrations pendentes:

```bash
wrangler d1 migrations apply <DB_NAME> --remote
```

### Comportamento em ambientes já atualizados

Se as migrations 0011–0021 já foram aplicadas, os comandos `ALTER TABLE` dentro
da migration 0022 irão falhar com:

```
duplicate column name: empresa_id
```

Isso é **esperado e seguro** — significa que o schema já está correto. Os
comandos `UPDATE` (normalização de nulos) ainda serão executados normalmente.

### Aplicação manual por tabela

Caso seja necessário aplicar tabela a tabela (ex.: ambiente com schema parcial
sem suporte ao Wrangler migration tracker):

```bash
# Verificar quais colunas existem
wrangler d1 execute <DB_NAME> --remote \
  --command "PRAGMA table_info(workbenches)"

# Adicionar empresa_id se ausente
wrangler d1 execute <DB_NAME> --remote \
  --command "ALTER TABLE workbenches ADD COLUMN empresa_id TEXT DEFAULT '1'"

# Normalizar registros existentes
wrangler d1 execute <DB_NAME> --remote \
  --command "UPDATE workbenches SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = ''"

# Repita para: machines, boms, apontamentos, separation_orders,
#              stock_exits, supplier_categories, product_suppliers
```

---

## Verificação Rápida do Schema

Script para verificar todas as tabelas tenant de uma vez:

```bash
for TABLE in workbenches machines boms apontamentos separation_orders \
             stock_exits supplier_categories product_suppliers \
             plants users suppliers products almoxarifados stock_items \
             production_orders non_conformances quotations purchase_orders \
             imports work_instructions; do
  echo "--- $TABLE ---"
  wrangler d1 execute <DB_NAME> --remote \
    --command "PRAGMA table_info(\"$TABLE\")" 2>&1 | grep empresa_id || echo "MISSING empresa_id!"
done
```

---

## Ambientes

| Ambiente | Banco | Como Aplicar |
|---|---|---|
| Produção | binding `DB` em `wrangler.toml` | `wrangler d1 migrations apply <DB_NAME> --remote` |
| Preview (pages.dev) | binding `DB` no Pages project | `wrangler d1 migrations apply <DB_NAME> --remote` ou via dashboard do Cloudflare Pages |

> **Importante:** Sempre aplique migrations em **produção** após qualquer deploy
> que inclua novos arquivos em `migrations/`.
