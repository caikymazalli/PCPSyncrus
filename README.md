# pcpsyncrus-support-consumer

Worker Cloudflare responsável por consumir a fila `pcpsyncrus` e persistir tickets de suporte no D1.

## Arquitetura

```
Pages (pcpsyncrus)           Cloudflare Queue          Worker (este)
POST /suporte/api/tickets  →  queue: pcpsyncrus     →  consume → INSERT support_tickets (D1)
                               ↓ falhas repetidas
                               DLQ: pcpsyncrus-support-dlq
```

- **Pages**: apenas producer — enfileira quando D1 falha, retorna 202
- **Este Worker**: consumer — processa em batch (até 10 mensagens) e persiste no D1

## Pré-requisitos

1. Crie a fila principal (se ainda não existir):
   ```bash
   npx wrangler queues create pcpsyncrus
   ```

2. Crie a Dead Letter Queue:
   ```bash
   npx wrangler queues create pcpsyncrus-support-dlq
   ```

3. Aplique as migrations D1 (tabela `support_tickets`):
   ```bash
   npx wrangler d1 migrations apply pcpsyncrus-production --remote
   ```

## Deploy

```bash
cd workers/support-consumer
npx wrangler deploy
```

## Variáveis / Bindings

| Binding | Tipo       | Nome                    |
|---------|-----------|-------------------------|
| `DB`    | D1         | `pcpsyncrus-production` |
| —       | Queue consumer | `pcpsyncrus`        |
