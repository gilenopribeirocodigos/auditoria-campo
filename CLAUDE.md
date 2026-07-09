# CLAUDE.md — auditoria-campo

## 1. Contexto do Projeto
Sistema de Auditoria Operacional de Campo da DPL Construções (contrato 1021/2024 com
Equatorial Energia Piauí). Inspetores de campo usam o app (PWA instalável no celular)
para registrar auditorias de segurança e registros operacionais, com checklists,
fotos com marca d'água, captura de GPS e assinatura digital (inclusive remota via
link com token). Funciona offline (fila local em IndexedDB) e sincroniza quando a
conexão volta.

## 2. Stack Técnico
- React 18 + Vite 5 (`@vitejs/plugin-react`)
- PWA via `vite-plugin-pwa` + Workbox (`workbox-window`), `registerType: 'prompt'`
- Supabase (`@supabase/supabase-js`) — banco Postgres + Auth + Storage (bucket `fotos-auditoria`)
- IndexedDB (API nativa do browser) para fila offline — sem lib de terceiros
- `html2canvas` (impressão/PDF de telas) e `xlsx` (exportação de planilhas)
- CSS puro (`src/index.css`) + estilos inline em componentes — **sem Tailwind, sem CSS Modules, sem styled-components**
- Sem gerenciador de estado global — estado local via `useState`/props (ver seção 9)
- Hospedagem: **Render.com** (ver nota na seção 13 sobre referências antigas a Vercel/Netlify)

## 3. Estrutura do Repositório
```
auditoria-campo/
├── src/
│   ├── App.jsx                  # Shell do app de Auditorias (estado raiz, navegação por steps)
│   ├── RegistrosApp.jsx         # Shell do app de Registros Operacionais
│   ├── main.jsx                 # Entry point
│   ├── index.css                # CSS global (mobile-first)
│   ├── components/
│   │   ├── Shared.jsx           # Componentes reutilizáveis (Field, Textarea, NavBar, etc.)
│   │   ├── PainelFiltros.jsx    # Filtros por permissão/processo/regional
│   │   └── ModalLinkAssinatura.jsx # Modal de geração de link de assinatura remota
│   ├── data/
│   │   ├── checklists.js        # Checklists de Auditoria (CORTE, ANEXO, RELIGA, EMERGENCIAL...) + lógica PAI/FILHO
│   │   └── registros_config.js  # Config dos 6 tipos de Registro Operacional
│   ├── lib/
│   │   ├── supabase.js          # Client Supabase + funções de auditorias (CRUD)
│   │   ├── auth.js              # Login, sessão, permissões (perfil + processo + regional)
│   │   ├── offline.js           # Fila offline (IndexedDB) — módulo Auditorias
│   │   ├── registros_offline.js # Fila offline (IndexedDB) — módulo Registros Operacionais
│   │   ├── registros.js         # CRUD de registros operacionais
│   │   ├── assinaturas.js       # Tokens de assinatura remota, assinaturas coletadas
│   │   ├── rastreio.js          # Rastreamento GPS em tempo real do fiscal (ver seção 4.3)
│   │   ├── numeroAS.js          # Geração do "Número AS" (ver seção 4.2)
│   │   └── pautas.js            # Pautas de auditoria (agenda do fiscal)
│   ├── pages/                   # Telas: Dashboard, HistoricoAuditorias, GestaoUsuarios,
│   │                             # GestaoPauta, RegistrosOperacionais, MapaFiscais,
│   │                             # RelatorioEquipe/Evidencias, Metas, Login, etc.
│   └── steps/
│       ├── S0..S6                # Wizard de Auditoria (Seleção → GPS → Checklist → Fotos → Assinatura → Resultado)
│       └── R0..R6                # Wizard de Registro Operacional (Tipo → Identificação → Conteúdo → Evidências → Resultado)
├── sql/                         # Scripts de migração SQL (ver seção 5.3)
├── public/                      # Assets estáticos, ícones PWA, `_redirects` (resíduo de Netlify — ver seção 13)
├── vite.config.js               # Config Vite + PWA (manifest, workbox, injeta __APP_VERSION__)
└── package.json
```

Não há pasta `supabase/` (sem Supabase CLI, sem migrations formais, sem `supabase/functions/`) —
as migrações vivem em `sql/` como scripts `.sql` avulsos (ver seção 5.3).

## 4. Padrões Importantes de Negócio

### 4.1 Lógica PAI/FILHO nos Checklists
Em `src/data/checklists.js`, alguns itens fazem parte de um grupo "casado"
(`marriedGroup` + `marriedRole: 'pai' | 'filho'`), por exemplo:

```js
// src/data/checklists.js (linhas ~116-119)
{ id: 5, cat: 'DESEMPENHO', p: 'Houve instalação de medidor?',              marriedGroup: 'medidor', marriedRole: 'pai'   },
{ id: 6, cat: 'QUALIDADE',  p: 'Equipe lançou instalação do medidor na OS?', marriedGroup: 'medidor', marriedRole: 'filho' },
```

**Comportamento real (confirmado em código, não é auto-preenchimento):**
- O item **PAI conta sempre como conforme na nota**, independente da resposta SIM/NÃO —
  ele só existe para servir de referência ao FILHO:
  ```js
  // src/data/checklists.js, isItemConforme() — linhas 386-388
  if (item.marriedGroup && item.marriedRole === 'pai') {
    return true   // sempre conforme, seja SIM ou NÃO
  }
  ```
- O item **FILHO é quem efetivamente pontua**: ele só é conforme se a resposta bater
  com a do PAI (`rPai === r`):
  ```js
  // src/data/checklists.js, isItemConforme() — linhas 390-395
  if (item.marriedGroup && item.marriedRole === 'filho') {
    const pai  = items.find(p => p.marriedGroup === item.marriedGroup && p.marriedRole === 'pai')
    const rPai = pai ? respostas[pai.id] : undefined
    if (rPai === undefined || rPai === null) return true
    return rPai === r
  }
  ```
- Se PAI e FILHO divergem (ex.: PAI = SIM, FILHO = NÃO), o FILHO conta como
  **não conforme** na pontuação e a UI mostra um aviso visual (fundo âmbar), mas
  **não bloqueia** o salvamento nem impede o usuário de continuar:
  ```js
  // src/steps/S3Checklist.jsx — linhas 151-157
  } else if (item.marriedGroup && item.marriedRole === 'filho') {
    const pai  = items.find(i => i.marriedGroup === item.marriedGroup && i.marriedRole === 'pai')
    const rPai = pai ? form.respostas[pai.id] : undefined
    isConforme    = rPai !== undefined && r !== undefined && rPai === r
    isNaoConforme = rPai !== undefined && r !== undefined && rPai !== r
    if (rPai === true  && r === false) marriedWarning = '⚠️ Inconsistência: houve instalação mas não foi lançada na OS!'
    if (rPai === false && r === true)  marriedWarning = '⚠️ Inconsistência: não houve instalação mas foi lançada na OS!'
  ```

**⚠️ Dívida técnica:** essa lógica está **duplicada** entre `src/data/checklists.js`
(`isItemConforme`, linhas 386-395) e `src/steps/S3Checklist.jsx` (linhas 151-157).
Qualquer alteração futura na regra PAI/FILHO precisa ser feita **nos dois lugares**.

### 4.2 Número AS — "Auditoria de Serviço"
"AS" é terminologia **interna do projeto** (criada por Gileno, não é vocabulário
oficial da Equatorial). Funciona como um número único de rastreabilidade para cada
auditoria, no formato `AS-YYYYMMDD-HHMMSS-XXXX` (timezone América/Fortaleza):

```js
// src/lib/numeroAS.js — linhas 1-19
export function gerarNumeroAS() {
  // ... monta data/hora no timezone America/Fortaleza + sufixo aleatório
  return `AS-${data}-${hora}-${sufixo}`
}
```

A função `gerarNumeroASLegado()` existe só para retrocompatibilidade — deriva um
número a partir de dados antigos (id/data/hora) para pautas/auditorias que ainda
não têm um `numero_as` salvo. Usado em `GestaoPauta.jsx`, `HistoricoAuditorias.jsx`,
`pautas.js`, `S0Selecao.jsx`, `S6Resultado.jsx` e `App.jsx`.

### 4.3 Rastreamento GPS em Tempo Real
`src/lib/rastreio.js` é o motor de rastreamento de localização do fiscal em campo:
- Captura GPS a cada 8 segundos (`INTERVALO_MS`) e grava na tabela `localizacoes`.
- Mantém um heartbeat de presença via upsert em `fiscais_presenca` (última posição
  conhecida de cada fiscal), consumido pelo `MapaFiscais.jsx`.
- Tem fila offline própria em IndexedDB (banco `rastreio_fila`), **separada** dos
  bancos `auditoria-dpl` usados por `offline.js`/`registros_offline.js`.
- Usa a Wake Lock API para tentar manter a tela acesa, e os eventos
  `visibilitychange`/`online` para capturar/reenviar assim que o app volta ao
  foco ou a conexão retorna.
- Importado só em `App.jsx` (`iniciarRastreio`/`pararRastreio`) — específico do
  módulo de Auditorias.

### 4.4 Módulo Offline-First (IndexedDB)
- Auditorias (`src/lib/offline.js`) e Registros Operacionais
  (`src/lib/registros_offline.js`) usam o **mesmo banco** IndexedDB (`auditoria-dpl`),
  mas em **stores separados** (`fila_offline` e `fila_registros`).
- Sincronização usa o campo `sincronizado: 0|1` — **não usar boolean**: IndexedDB
  não aceita `true`/`false` como chave de índice, por isso o padrão é `0`/`1`.
- Qualquer feature nova deve funcionar sem internet (ver seção 11).

## 5. Banco de Dados

### 5.1 Schemas
- `public` = produção (branch `main`)
- `dev` = staging/desenvolvimento (branch `desenvolvimento`)
- O schema usado pelo client é definido por `VITE_SUPABASE_SCHEMA` em `src/lib/supabase.js` (default `'dev'`)
- Nunca fazer alterações direto em `public` sem passar por `dev` antes

### 5.2 Padrão RLS + GRANTS
O padrão de acesso do projeto é:

```sql
ALTER TABLE nome_da_tabela DISABLE ROW LEVEL SECURITY;
GRANT ALL ON nome_da_tabela TO anon, authenticated;
```

Não se usa policies RLS complexas — o controle de acesso é feito na camada de
aplicação (ver `src/lib/auth.js`: permissões por perfil + processo + regional).

**Onde esse padrão realmente vive:** ele é aplicado **manualmente** direto no
Supabase (schemas `dev` e `public`) através do ChatGPT Codex — uma ferramenta
externa que Gileno usa em paralelo ao Claude Code. **Não está versionado** nos
scripts de `sql/` deste repositório — isso é uma decisão consciente para evitar
conflito com o que o Codex aplica (ver seção 6).

**Regras para o Claude Code:**
- Ao criar uma tabela nova numa migration em `sql/`, **sempre incluir** os dois
  comandos acima (`DISABLE ROW LEVEL SECURITY` + `GRANT ALL ... TO anon, authenticated`)
  ao final do script.
- Ao alterar uma tabela existente, verificar via `pg_tables`/`information_schema`
  se o padrão já está aplicado antes de sugerir mudanças de permissão.
- **Nunca** rodar esses comandos automaticamente contra o banco (via MCP, script,
  etc.) sem aprovação explícita do Gileno — só escrever no arquivo `.sql`.

### 5.3 Migrations
- Ficam em `sql/`, um arquivo por alteração
- Nomenclatura observada no repo: `YYYY-MM-DD_descricao.sql` (ex.: `2026-07-08_usuarios_regionais.sql`)
  — difere do padrão `YYYYMMDDHHMMSS_descricao.sql` do Supabase CLI; siga o padrão
  já usado no repo para consistência
- Os scripts costumam criar/alterar a mesma tabela nos dois schemas (`dev.` e `public.`) no mesmo arquivo
- Aplicar sempre primeiro em `dev`, depois em `public`

## 6. Fluxo de Trabalho e Coexistência com o ChatGPT Codex
O Codex do ChatGPT trabalha em paralelo ao Claude Code neste projeto, aplicando
SQL diretamente no Supabase (schemas `dev` e `public`) — mas **não versiona** esse
SQL no repositório (escolha consciente do Gileno).

### Regra fundamental sobre banco de dados
A **estrutura** (DDL: `CREATE TABLE`, `ALTER TABLE`, colunas, tipos, constraints) é
aplicada **simultaneamente** nos schemas `dev` e `public` — a estrutura é sempre
idêntica nos dois, o que muda é só o **dado** (teste em `dev`, real em `public`).
Isso garante que código testado em `dev` funciona igual em produção, já que o PWA
aponta para o schema via `VITE_SUPABASE_SCHEMA`.

### Divisão de responsabilidades
**Claude Code:**
- Trabalha apenas em código React/PWA (JS, JSX, CSS)
- Trabalha apenas no branch `desenvolvimento`
- Gera arquivos `.sql` no repositório para versionamento — **não executa**
- Nunca promove código para `main` sem pedido explícito
- Nunca executa SQL contra o banco Supabase
- Sugere alterações de banco para o Gileno aplicar via Codex

**ChatGPT Codex (ferramenta externa, em paralelo):**
- Aplica SQL nos schemas `dev` e `public` simultaneamente
- Aplica o padrão RLS + GRANTS (seção 5.2) após criar tabelas
- Não altera código React/PWA
- Não versiona os SQLs no repositório

**Fonte da verdade:**
- Estrutura real das tabelas → **o Supabase**, não o repositório (os scripts em
  `sql/` podem estar defasados em relação ao banco real)
- Código do PWA → **o repositório**

Por isso, antes de mexer em qualquer tabela ou assumir um schema, o Claude Code
deve **sempre consultar a estrutura atual no Supabase** em vez de confiar apenas
no que está em `sql/`.

### Ciclo típico de uma alteração
1. Gileno pede alteração ao Claude Code
2. Claude Code altera código no branch `desenvolvimento`
3. Se envolver banco: Claude Code gera `.sql` no repo (não executa)
4. Gileno passa o `.sql` para o Codex aplicar em `dev` + `public`
5. Render deploya automaticamente o push em `desenvolvimento`
6. Gileno testa em `https://auditoria-campo-dev.onrender.com/`
7. Se OK: Gileno pede ao Claude Code para promover para `main` → PR
   `desenvolvimento` → `main` → Render deploya `main` em produção → `public`
   já está pronto para receber dados reais (mesma estrutura de `dev`)
8. Se erro: Claude Code corrige código em `desenvolvimento`; se for erro de
   banco, Codex corrige em `dev` **e** `public` simultaneamente; volta ao passo 5

### Alertas importantes
- Deploy em dev é **automático** — cada push em `desenvolvimento` já sobe para
  `auditoria-campo-dev.onrender.com`
- Deploy em prod é **automático ao merge** — cuidado com PRs para `main`
- Sempre confirmar com o Gileno antes de fazer merge para `main`
- Nunca fazer `git push --force`
- Ao criar tabelas via `.sql`, incluir comentário no início do arquivo:
  `-- Aplicar em ambos schemas: dev e public via Codex`

## 7. Ambientes

### 7.1 Ambientes Claude Code
- `auditoria-campo-dev` (atual) → schema `dev`, branch `desenvolvimento` — ambiente padrão de trabalho
- `auditoria-campo-prod` (futuro) → schema `public`, branch `main` — só para deploys
- Migração de `dev` → `public`/`main` é feita manualmente pelo Gileno via PR no GitHub

### 7.2 Deploy (Render)
**Desenvolvimento (staging):**
- URL: `https://auditoria-campo-dev.onrender.com/`
- Branch monitorado: `desenvolvimento`
- Schema Supabase apontado: `dev`
- Deploy: automático via Render a cada push em `desenvolvimento` (~2-3 minutos)
- Dados: apenas dados de teste
- Uso: validação de features antes de promover para produção

**Produção:**
- URL: `https://auditoria-campo.onrender.com/`
- Branch monitorado: `main`
- Schema Supabase apontado: `public`
- Deploy: automático via Render a cada merge de PR `desenvolvimento` → `main` (~2-3 minutos)
- Dados: reais — inspetores da Equatorial em campo
- Uso: sistema em produção

## 8. Regras de Git
- Trabalho normal: sempre no branch `desenvolvimento`
- NUNCA commitar direto no `main`
- Deploy em produção: PR `desenvolvimento` → `main`, revisado manualmente
- Commits em português, formato: `tipo: descrição` (feat/fix/chore/docs)

## 9. Padrões de Código
### Componentes React
- Componentes funcionais com hooks (`useState`, `useEffect`, `useRef`) — sem classes
- Wizards multi-step (Auditoria em `src/steps/S*`, Registros em `src/steps/R*`) recebem
  `form`, `upd`/`setForm`, `next`, `prev` como props e são orquestrados pelo componente raiz
  (`App.jsx` / `RegistrosApp.jsx`), que guarda o estado do formulário inteiro
- Componentes compartilhados em `src/components/Shared.jsx` (Field, Textarea, InfoRow, NavBar, SectionTitle)

### Estilo
- CSS puro em `src/index.css` (mobile-first) + estilos inline (`style={{ ... }}`) diretamente nos componentes
- **Sem Tailwind, sem CSS Modules, sem styled-components**

### Estado global
- Não há biblioteca de estado global (sem Context API estruturado, Redux, Zustand, etc.)
- Estado vive no componente raiz de cada app (`App.jsx` para Auditorias, `RegistrosApp.jsx`
  para Registros Operacionais) e desce via props para steps/páginas
- Sessão do usuário logado e permissões ficam em `localStorage` (`src/lib/auth.js`)

## 10. Regras de Segurança
- NUNCA usar `SUPABASE_SERVICE_ROLE_KEY` em código do cliente
- SEMPRE usar `VITE_SUPABASE_ANON_KEY` no frontend
- Verificar sanitização de inputs antes de queries
- Fotos e assinaturas: armazenar com marca d'água/hash
  (ver `adicionarWatermark` em `src/steps/R5Evidencias.jsx` — aplica fiscal, data/hora e GPS na imagem)

## 11. O que Claude deve SEMPRE fazer
- Ler este arquivo antes de qualquer alteração significativa
- Confirmar schema (`dev`/`public`) antes de queries destrutivas
- Preservar a lógica PAI/FILHO (`marriedGroup`/`marriedRole`) nos checklists — e
  alterá-la nos **dois lugares** (`checklists.js` e `S3Checklist.jsx`) quando necessário
- Manter offline-first: qualquer nova feature deve funcionar sem internet
- Escrever comentários em português
- Ao criar tabelas novas em `sql/`, incluir `DISABLE ROW LEVEL SECURITY` + `GRANT ALL ... TO anon, authenticated`
- Consultar a estrutura real do banco no Supabase antes de assumir schema de uma tabela

## 12. O que Claude NUNCA deve fazer
- Commitar em `main` sem pedido explícito
- Usar `service_role_key` em código cliente
- Deletar migrations existentes em `sql/`
- Alterar dados em produção (schema `public`) sem confirmação explícita
- Desabilitar o offline-first
- Remover marca d'água de fotos
- Fazer push forçado (`--force`)
- Rodar comandos de RLS/GRANT diretamente contra o Supabase sem aprovação explícita do Gileno

## 13. Dívidas Técnicas Conhecidas
- **Lógica PAI/FILHO duplicada**: mesma regra implementada em `src/data/checklists.js`
  (`isItemConforme`, linhas 386-395) e `src/steps/S3Checklist.jsx` (linhas 151-157).
- **RLS + GRANTS não versionados no repo**: aplicados manualmente via ChatGPT Codex
  direto no Supabase, fora do controle de versão (ver seções 5.2 e 6).
- **README desatualizado**: menciona deploy via Vercel, mas a hospedagem real é
  Render.com. TODO: limpar referências antigas no README.
- **`public/_redirects`**: resíduo de configuração Netlify, não é usado/necessário no Render.
- **`.gitignore` menciona `pnpm-lock.yaml`/`pnpm-workspace.yaml`**, mas o projeto
  usa `npm` (`package-lock.json`) — [VERIFICAR: confirmar se é resíduo de configuração
  antiga ou se há uso pontual de pnpm em algum ambiente].
- `src/lib/rastreio.js` mantém seu próprio banco IndexedDB (`rastreio_fila`),
  separado dos bancos usados pelas filas offline de auditorias/registros — não é bug,
  mas é bom ter em mente ao investigar problemas de sincronização.
