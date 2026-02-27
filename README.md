# PCP Planner — Sistema de Planejamento e Controle de Produção

## Visão Geral
Sistema SaaS multi-tenant para gestão industrial: PCP, qualidade, estoque, compras e fornecedores.

## URLs
- **Produção**: https://pcpsyncrus.pages.dev
- **Demo local**: https://3000-isf4rr7azmizxqtz6aq2n-583b4d74.sandbox.novita.ai

## Credenciais Demo
| E-mail | Cargo |
|--------|-------|
| carlos@empresa.com | Admin |
| ana@empresa.com | Gestor PCP |
| joao@empresa.com | Operador |
_(qualquer senha funciona para contas demo)_

## Módulos Implementados

### ✅ Dashboard `/`
- KPIs de produção, gráficos de ordens/semana, qualidade e status

### ✅ Ordens de Produção `/ordens`
- CRUD completo de ordens (criar, editar, iniciar, concluir, cancelar)
- Apontamento de produção com quantidade produzida/rejeitada

### ✅ Recursos `/recursos`
- Gestão de plantas, máquinas e bancadas de trabalho

### ✅ Engenharia `/engenharia`
- BOM (Lista de Materiais), roteiros de produção, instruções de trabalho

### ✅ Qualidade `/qualidade`
- **NC (Não Conformidades)**: criar, analisar, encerrar, deletar
- Filtros por status/severidade, evidências fotográficas
- API: `POST /qualidade/api/create`, `PUT /qualidade/api/:id`, `DELETE /qualidade/api/:id`

### ✅ Estoque `/estoque`
- Itens de estoque com controle de série/lote
- **Separação de Pedidos**: `POST /estoque/api/separation/create`
- **Baixas de Estoque**: `POST /estoque/api/exit/create`
- **4 Almoxarifados**: Principal, Matérias-Primas, Produtos Acabados, Filial Sul
- Kardex de rastreabilidade, transferências entre almoxarifados
- Liberação de S/N por estoque atual

### ✅ Cadastros/Fornecedores `/cadastros`
- CRUD de fornecedores (nacionais e importados)
- Vinculação fornecedor ↔ produto
- API: `POST /cadastros/api/supplier/create`, `PUT /cadastros/api/supplier/:id`, `DELETE /cadastros/api/supplier/:id`
- Botões: Visualizar, Editar, Solicitar Cotação, Inativar/Ativar

### ✅ Suprimentos `/suprimentos`
- Cotações, pedidos de compra, importações com landed cost

### ✅ Planejamento `/planejamento`
- MRP, capacidade de produção, análise de demanda

### ✅ Apontamento `/apontamento`
- Registro de produção por operador/máquina

## Arquitetura de Dados
- **Banco**: Cloudflare D1 (SQLite) — `pcpsyncrus-production`
- **Sessões**: Persistidas no D1 para funcionar em Workers stateless
- **Demo**: Dados em memória via `data.ts`, sessão salva no D1
- **Multi-tenant**: Todos os dados isolados por `user_id`

## Migrations (6 aplicadas)
| Arquivo | Conteúdo |
|---------|----------|
| 0001 | Schema inicial completo |
| 0002 | Usuários registrados + sessões |
| 0003 | Convites por e-mail + resets de senha |
| 0004 | Suporte a owner_id (contas convidadas) |
| 0005 | Colunas adicionais em products/suppliers |
| 0006 | Tabelas separation_orders e stock_exits |

## Stack Técnica
- **Runtime**: Cloudflare Workers (edge)
- **Framework**: Hono v4
- **Frontend**: TailwindCSS CDN + FontAwesome + vanilla JS
- **Build**: Vite + @hono/vite-cloudflare-pages
- **DB**: Cloudflare D1 (SQLite)

## Deploy
```bash
npm run build
npx wrangler pages deploy dist --project-name pcpsyncrus
npx wrangler d1 migrations apply pcpsyncrus-production --remote
```

## Desenvolvimento Local
```bash
npm run build
pm2 start ecosystem.config.cjs
# Acesse: http://localhost:3000
```

## Status
- **Produção**: ✅ Ativa em https://pcpsyncrus.pages.dev
- **Última atualização**: 27/02/2026
- **Versão**: 1.6.0
