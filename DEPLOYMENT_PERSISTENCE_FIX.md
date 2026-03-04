# 🚀 Fix: Deployment Persistence Issues — Changes Not Applied After Merge & Deploy

## 📋 Problema Identificado

Modificações solicitadas desapareciam após merge e deploy em produção. As alterações salvavam localmente (em memory) mas não persistiam após reinício dos workers (deploy).

---

## 🎯 Raiz do Problema

### 1. Ordem de Operação Invertida

| ❌ ANTES | ✅ DEPOIS |
|---------|----------|
| Salvar em memory → tentar persistir em D1 → ignorar falha | Validar persistência em D1 PRIMEIRO → confirmar sucesso → salvar em memory |

### 2. Cache de Hydration Muito Agressivo

- Skip de re-hydration quando havia writes recentes (janela de até 30s)
- Impedia que D1 fosse a fonte de verdade após deploy
- **Solução**: Force reset de cache na primeira request após startup do worker

### 3. Validação de Escrita Fraca

- Funções `dbInsert`/`dbUpdate` não tinham o resultado validado pelo caller
- Handler não sabia se a persistência falhou, levando a inconsistência silenciosa

---

## 🔧 Mudanças Implementadas

### 1. Validação Obrigatória de Persistência

**Padrão aplicado em**: `src/routes/cadastros.ts`, `src/routes/recursos.ts`

```typescript
// ❌ ANTES — ignora falha
await dbInsert(db, 'plants', { ... })
tenant.plants.push(planta)  // Salva em memory mesmo que D1 falhou!

// ✅ DEPOIS — valida antes de confirmar
const inserted = await dbInsert(db, 'plants', { ... })
if (!inserted) {
  console.error(`[CRÍTICO] Falha ao inserir planta ${id} em D1`)
  return err(c, 'Falha ao salvar em D1. Tente novamente.', 500)
}
tenant.plants.push(planta)  // Salva em memory SÓ SE D1 sucedeu
```

**Por que funciona:**
- D1 é validado ANTES de memory ser atualizado
- Se D1 falha, user recebe erro claro (não silencioso)
- Não gera inconsistência entre DB e memory

### 2. Force Re-hydration no Startup do Worker

**Arquivos afetados**: `src/index.tsx`, `src/userStore.ts`

**Lógica:**
- Função `resetTenantHydrationCache()` em `userStore.ts`
- Middleware em `index.tsx` dispara reset na primeira request após deploy
- Cache é limpo → `loadTenantFromDB()` carrega D1 completo (não cacheado)
- Subsequentes requests usam cache por 10s (performance)

```typescript
// src/index.tsx — middleware de startup
const tenantStartupResetDone = new Set<string>()

app.use('*', async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (token && c.env?.DB) {
    // ...
    if (session && !session.isDemo) {
      const tenantId = getEffectiveTenantId(session)
      // 🔥 Force re-hydration on first request per worker instance (after deploy)
      if (!tenantStartupResetDone.has(tenantId)) {
        tenantStartupResetDone.add(tenantId)
        resetTenantHydrationCache(tenantId)
      }
      await loadTenantFromDB(tenantId, c.env.DB, session.empresaId)
    }
  }
  await next()
})
```

### 3. Skip de Hydration Inteligente

**Arquivo**: `src/userStore.ts`

```typescript
// ❌ ANTES — skip por qualquer write recente (até 30s)
if (lastWrite > lastHydration) return  // SKIP! Impede reload pós-deploy

// ✅ DEPOIS — skip SÓ se write muito recente (< 2s)
if (lastWrite && now - lastWrite < 2000) return  // SKIP por 2s apenas
```

**Por que funciona:**
- Novo request > 2s após write? Carrega D1 (propagação garantida)
- Write muito recente (< 2s)? Salta para evitar sobrescrever dados em trânsito
- Balanço entre consistência e performance

### 4. Handlers Corrigidos (Ordem: D1 → Memory)

**Padrão aplicado em TODOS os handlers:**

```
1. Validar entrada
2. Preparar dados
3. ⭐ PERSISTIR EM D1 PRIMEIRO (validar sucesso)
4. SE D1 sucedeu: salvar em memory
5. Marcar tenant como modificado
```

**Handlers modificados:**
- `POST /api/supplier/create` — suppliers
- `PUT /api/supplier/:id` — suppliers
- `POST /plantas` — plants
- `PUT /plantas/:id` — plants
- `POST /maquinas` — machines
- `PUT /maquinas/:id` — machines
- `POST /bancadas` — workbenches
- `PUT /bancadas/:id` — workbenches

### 5. Logs de Hydration para Diagnóstico

**Arquivo**: `src/userStore.ts`

Log messages presentes após todas as correções aplicadas:

```
[HYDRATION] Cache limpo para <userId> - forçará re-load de D1
[HYDRATION] Loading tenant <userId> from D1
[HYDRATION] ✅ X produtos carregados com multi-fornecedores  ← implementado anteriormente
[HYDRATION] ✅ X fornecedores carregados                     ← adicionado nesta correção
[HYDRATION] ✅ X plantas carregadas                          ← adicionado nesta correção
[HYDRATION] ✅ X máquinas carregadas                         ← adicionado nesta correção
[HYDRATION] ✅ X bancadas carregadas                         ← adicionado nesta correção
```

---

## 📊 Comparação: Antes vs. Depois

| Aspecto | ❌ ANTES | ✅ DEPOIS |
|---------|----------|----------|
| **Ordem de operação** | Memory → D1 (ignora falha) | D1 validado → Memory |
| **Erro em D1** | Silencioso (memory modificado, D1 não) | Erro claro ao usuário, roll-back |
| **Deploy novo** | Cache impede reload D1 | Force reset cache na primeira request |
| **Consistência** | Memory ≠ D1 (divergência) | Memory = D1 (sempre sincronizados) |
| **Diagnóstico** | Logs insuficientes | Logs detalhados por entidade |

---

## 🧪 Teste Manual Após Deploy

### Ciclo 1: Sem Restart (Basic)

```
1. Login
2. Criar novo fornecedor
3. Recarregar página
✅ Fornecedor deve estar lá
```

### Ciclo 2: Com Restart (Deploy)

```
1. Login
2. Criar novo fornecedor
3. Parar servidor (Ctrl+C)
4. Iniciar servidor (npm run dev)
5. Acessar sem fazer login novo
✅ Fornecedor deve estar lá (cache reset funcionou)
6. Abrir DevTools → Console
✅ Procurar: "[HYDRATION] Cache limpo para" = OK
```

### Ciclo 3: Validar Console (Debug)

```
Abrir DevTools → Console
Procurar por:
- [HYDRATION] Loading tenant ... from D1
- [HYDRATION] ✅ X fornecedores carregados
- [HYDRATION] ✅ Y plantas carregadas
- [HYDRATION] ✅ Z máquinas carregadas
- [HYDRATION] ✅ W bancadas carregadas

Se alguma entidade não aparecer = PROBLEMA (ver seção Troubleshooting abaixo)
```

---

## 📝 Checklist Pré-Deploy

- [ ] Todos os handlers checam resultado de D1 ANTES de salvar em memory
- [ ] `resetTenantHydrationCache` está importado em `src/index.tsx`
- [ ] Middleware `app.use('*', ...)` tem lógica de reset cache com `tenantStartupResetDone`
- [ ] Nenhum `[HYDRATION] ERROR` ou `WARNING` inesperado no console
- [ ] Teste manual: criar → salvar → restart server → verificar

---

## 🆘 Troubleshooting

### Sintoma: "Dados desaparecem AINDA após deploy"

**Verificação:**

```
1. Abrir DevTools → Console
2. Após primeiro login pós-deploy, procurar:
   [HYDRATION] Cache limpo para <user-id> - forçará re-load de D1

Se NÃO aparecer = resetTenantHydrationCache não foi chamado
```

**Verificar em `src/index.tsx`:**

```typescript
// 1. ✅ Import?
import { resetTenantHydrationCache } from './userStore'

// 2. ✅ Set criado?
const tenantStartupResetDone = new Set<string>()

// 3. ✅ Middleware rodando?
app.use('*', async (c, next) => { ... })

// 4. ✅ Lógica ok?
if (!tenantStartupResetDone.has(tenantId)) {
  tenantStartupResetDone.add(tenantId)
  resetTenantHydrationCache(tenantId)
}
```

### Sintoma: "User recebe erro genérico ao salvar"

**Verificação:**

```
1. DevTools → Console (server-side logs)
2. Procurar:
   [CRÍTICO] Falha ao persistir [tipo] [id] em D1 após 3 tentativas: [erro]

   Anotar o erro exato
```

**Soluções por tipo de erro:**

| Erro | Causa | Solução |
|------|-------|---------|
| `UNIQUE constraint failed` | Dados já existem ou ID duplicado | Verificar se a migration rodou corretamente |
| `disk I/O error` | D1 temporariamente indisponível | Retry automático já implementado |
| `database locked` | Muitas writes simultâneas | Aguardar 5s e tentar novamente |
| `unknown database` | Migration não rodou | Executar migration pendente |

### Sintoma: "Rota retorna 404 mesmo após save"

**Verificação:**

```
DevTools → Network tab
Ao salvar, verificar qual URL foi chamada:
- /api/suppliers/create?         ❌ ERRADO
- /cadastros/api/supplier/create? ✅ CORRETO (relativo ao /cadastros)
- /recursos/plantas?              ✅ CORRETO (relativo ao /recursos)
```

### Sintoma: "Dados aparecem na primeira vez mas somem no reload"

**Causa provável:** Hydration overwriting memory com dados desatualizados do D1.

**Verificação:**

```
Console server-side:
[HYDRATION] Skipping re-hydration for <userId>: recent write Xms ago, will retry after 2s
```

Se X < 2000: comportamento esperado (write recente, aguardar propagação).
Se X > 2000: **problema** — hydration deveria ter ocorrido.

**Solução:** Verificar se `markTenantModified(userId)` está sendo chamado após cada write de memória.

---

## 📚 Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `src/userStore.ts` | `resetTenantHydrationCache()`, skip inteligente (< 2s), logs `[HYDRATION] ✅` para fornecedores/plantas/máquinas/bancadas ¹ |
| `src/index.tsx` | Middleware startup reset com `tenantStartupResetDone` Set ¹ |
| `src/routes/cadastros.ts` | Handlers supplier: D1 validado antes de memory ¹ |
| `src/routes/recursos.ts` | Handlers plants/machines/workbenches: D1 validado antes de memory ¹ |
| `src/dbHelpers.ts` | `dbInsert` retorna `boolean`, `dbInsertWithRetry` retorna `{success, attempts, error?}` ¹ |

> ¹ Itens marcados com ¹ correspondem ao conjunto completo de mudanças desta correção (inclui
> tanto as implementadas no PR #83 `copilot/force-rehydrate-on-startup` quanto as adições
> de logs de diagnóstico para fornecedores, plantas, máquinas e bancadas aplicadas neste PR).
