# PCP Planner — SaaS para Programação e Controle da Produção Industrial

## Visão Geral
Sistema SaaS multi-tenant para gestão completa de produção industrial, com isolamento total de dados por cliente e persistência via Cloudflare D1.

## URLs de Acesso
- **Produção**: https://pcpsyncrus.pages.dev
- **Login**: https://pcpsyncrus.pages.dev/login
- **Cadastro (novo cliente)**: https://pcpsyncrus.pages.dev/cadastro
- **Painel Master**: https://pcpsyncrus.pages.dev/master/login

## Funcionalidades Implementadas

### Módulos com CRUD Completo
| Módulo | Criar | Editar | Excluir | API | Toast |
|--------|-------|--------|---------|-----|-------|
| Recursos (Plantas/Máquinas/Bancadas) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ordens de Produção | ✅ | ✅ | ✅ | ✅ | ✅ |
| Produtos | ✅ | ✅ | ✅ | ✅ | ✅ |
| Qualidade (NCs) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Estoque (Itens + Movimentação) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Suprimentos (Cotações + OCs) | ✅ | - | ✅ | ✅ | ✅ |
| Cadastros (Fornecedores) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Engenharia (BOM) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Instruções de Trabalho | ✅ | ✅ | ✅ | ✅ | ✅ |
| Apontamento | ✅ | - | ✅ | ✅ | ✅ |

### Módulos Read-Only (dados calculados)
- **Dashboard** — KPIs calculados em tempo real
- **Planejamento (MRP)** — cálculo de necessidades de materiais
- **Assinatura** — gestão de plano/trial

## Arquitetura de Escalabilidade

### Multi-Tenant com Cloudflare D1
```
Usuário A (empresa_A) → user_id: u_xxx → dados isolados em D1 com user_id = 'u_xxx'
Usuário B (empresa_B) → user_id: u_yyy → dados isolados em D1 com user_id = 'u_yyy'
Demo                  → user_id: 'demo-tenant' → dados em memória (read-only)
```

### Banco de Dados D1 (Cloudflare)
- **Nome**: pcpsyncrus-production
- **Tabelas principais**: registered_users, sessions, production_orders, products, stock_items, suppliers, non_conformances, quotations, purchase_orders, boms, work_instructions, apontamentos, plants, machines, workbenches, imports, kardex
- **Isolamento**: Todas as tabelas têm coluna `user_id` para filtragem por tenant

### Sessões Persistentes
- Sessões armazenadas em D1 (tabela `sessions`)
- Cache em memória para performance
- Carregamento automático do D1 se sessão não estiver em memória
- Expiração automática após 8 horas

### Capacidade de Escalabilidade
- **Cloudflare Workers**: distribuído globalmente em 300+ cidades
- **Cloudflare D1**: banco SQLite globalmente replicado (leitura)
- **Sem estado no worker**: dados sempre persistidos em D1
- **Isolamento total**: nenhum dado de cliente A vaza para cliente B
- **Concorrência**: Cloudflare Workers suporta 100.000+ requisições/segundo

## APIs CRUD Disponíveis

### Ordens de Produção
```
POST   /ordens/api/create       — Criar ordem
PUT    /ordens/api/:id          — Editar ordem
DELETE /ordens/api/:id          — Excluir ordem
GET    /ordens/api/list         — Listar ordens
```

### Produtos
```
POST   /produtos/api/create     — Criar produto
PUT    /produtos/api/:id        — Editar produto
DELETE /produtos/api/:id        — Excluir produto
GET    /produtos/api/list       — Listar produtos
```

### Qualidade (NCs)
```
POST   /qualidade/api/create    — Registrar NC
PUT    /qualidade/api/:id       — Atualizar NC
DELETE /qualidade/api/:id       — Excluir NC
GET    /qualidade/api/list      — Listar NCs
```

### Estoque
```
POST   /estoque/api/item/create — Cadastrar item
PUT    /estoque/api/item/:id    — Editar item
DELETE /estoque/api/item/:id    — Excluir item
POST   /estoque/api/movement    — Registrar movimentação (entrada/saída)
GET    /estoque/api/items       — Listar itens
```

### Fornecedores
```
POST   /cadastros/api/supplier/create  — Cadastrar fornecedor
PUT    /cadastros/api/supplier/:id     — Editar fornecedor
DELETE /cadastros/api/supplier/:id     — Excluir fornecedor
GET    /cadastros/api/suppliers        — Listar fornecedores
```

### Suprimentos
```
POST   /suprimentos/api/quotation/create — Criar cotação
DELETE /suprimentos/api/quotation/:id    — Excluir cotação
POST   /suprimentos/api/order/create     — Criar pedido de compra
DELETE /suprimentos/api/order/:id        — Excluir pedido
GET    /suprimentos/api/list             — Listar todos
```

### Engenharia (BOM)
```
POST   /engenharia/api/bom/create — Adicionar componente
PUT    /engenharia/api/bom/:id    — Editar componente
DELETE /engenharia/api/bom/:id    — Remover componente
GET    /engenharia/api/boms       — Listar BOM
```

### Instruções de Trabalho
```
POST   /instrucoes/api/create   — Criar instrução
PUT    /instrucoes/api/:id      — Atualizar instrução
DELETE /instrucoes/api/:id      — Excluir instrução
GET    /instrucoes/api/list     — Listar instruções
```

### Apontamento
```
POST   /apontamento/api/create  — Registrar apontamento
DELETE /apontamento/api/:id     — Excluir apontamento
GET    /apontamento/api/list    — Listar apontamentos
```

### Recursos
```
POST   /recursos/plantas           — Criar planta
PUT    /recursos/plantas/:id       — Editar planta
DELETE /recursos/plantas/:id       — Excluir planta
POST   /recursos/maquinas          — Criar máquina
PUT    /recursos/maquinas/:id      — Editar máquina
DELETE /recursos/maquinas/:id      — Excluir máquina
POST   /recursos/bancadas          — Criar bancada
PUT    /recursos/bancadas/:id      — Editar bancada
DELETE /recursos/bancadas/:id      — Excluir bancada
```

## Fluxo de Onboarding de Novo Cliente

1. **Acesse**: https://pcpsyncrus.pages.dev/cadastro
2. **Step 1**: Nome, sobrenome, e-mail, telefone, senha
3. **Step 2**: Razão social, CNPJ, setor, porte da empresa
4. **Step 3**: Escolha do plano (Starter / Professional / Enterprise)
5. **Após cadastro**: Redirecionado para `/novo` — **dashboard 100% vazio**
6. **Começar**: Cadastrar recursos → produtos → ordens → apontamentos

## Guia de Uso

### Para Administradores de Empresa
1. Faça login em `/login`
2. Acesse **Admin** → configure grupo, empresa e usuários
3. Acesse **Recursos** → cadastre plantas, máquinas e bancadas
4. Acesse **Cadastros** → cadastre fornecedores
5. Acesse **Produtos** → cadastre produtos e defina BOM em Engenharia
6. Acesse **Ordens** → crie ordens de produção
7. Acesse **Apontamento** → registre produção realizada
8. Acompanhe KPIs no **Dashboard**

### Para Operadores
1. Faça login com credenciais fornecidas pelo admin
2. Registre apontamentos de produção
3. Registre não conformidades em Qualidade

## Stack Tecnológica
- **Runtime**: Cloudflare Workers (edge computing global)
- **Framework**: Hono v4 (TypeScript)
- **Banco de Dados**: Cloudflare D1 (SQLite distribuído)
- **Sessões**: Cloudflare D1 (persistente) + memória (cache)
- **Frontend**: HTML + TailwindCSS + Chart.js (via CDN)
- **Build**: Vite + @hono/vite-cloudflare-pages
- **Deploy**: Cloudflare Pages

## Status de Implantação
- **Plataforma**: Cloudflare Pages ✅
- **Banco D1**: pcpsyncrus-production ✅
- **Migrations**: 2 migrations aplicadas ✅
- **Última atualização**: 2026-02-24

## Notas de Segurança
- Senhas com hash SHA-256 + salt
- Sessões com TTL de 8 horas
- Isolamento total por `user_id` em todas as tabelas D1
- HttpOnly cookies para sessão
- Dados de demo nunca são expostos para usuários reais
