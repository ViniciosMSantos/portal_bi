# Dashboard Hub - Especificações do Projeto

Este arquivo contém as especificações técnicas e regras de negócio do projeto **Dashboard Hub**.

## Fluxo de Trabalho Obrigatório

**Antes de qualquer mudança no código, sempre seguir esta ordem:**

1. **Ler** os arquivos afetados pela mudança
2. **Planejar** em texto o que será alterado, por quê e quais arquivos serão tocados
3. **Aguardar confirmação** do usuário antes de editar
4. **Implementar** somente o que foi planejado — sem escopo extra
5. **Validar** rodando o servidor ou teste relevante após a mudança

Nunca editar arquivos sem antes apresentar o plano. Nunca ampliar o escopo além do que foi acordado no plano.

**Regra crítica:** Só fazer commit e push quando o usuário pedir explicitamente.

## Padrões de HTML/CSS

- **Sempre usar `id` nos elementos HTML** — facilita identificação e estilização no CSS
- No CSS, estilizar sempre por `#id`, nunca por classe quando o elemento já tem id
- Nomenclatura de ids: `kebab-case` descritivo (ex: `sidebar-logo`, `nav-home`, `content`)

## Visão Geral

Portal corporativo de dashboards com controle de acesso por tags e painel administrativo para gerentes. Roda como **Databricks App** com backend Flask, banco de dados **Lakebase** (PostgreSQL gerenciado pelo Databricks) e frontend HTML + CSS + JS vanilla servido pelo Jinja2.

## Stack Técnica

| Camada | Tecnologia |
|---|---|
| Runtime | Python 3.11 |
| Framework | Flask (factory pattern com Blueprints) |
| Banco de dados | Databricks Lakebase (PostgreSQL via `psycopg[binary]` + `psycopg_pool`) |
| Auth no banco | OAuth2 client_credentials → JWT → senha do psycopg |
| Auth do usuário | Databricks Apps injeta `X-Forwarded-Email` no header |
| IA | Databricks Genie Conversation API (`app/services/genie.py`) |
| Frontend | HTML + CSS + JS vanilla (Jinja2 templates) |
| Design System | Padrão próprio do Portal de Dashboards |
| Deploy | Databricks Apps via `app.yml` (gunicorn) |
| Dev local | `python run.py` (Flask debug server) |

> **Importante:** usar `psycopg[binary]` (não `psycopg` puro) — o binário evita dependência de `libpq-dev` no Linux do Databricks Apps.

## Estrutura de Arquivos

```
├── app/
│   ├── __init__.py              # Factory: create_app(), context_processor com current_user
│   ├── routes.py                # Blueprint "main" — todas as rotas Flask
│   ├── services/
│   │   ├── databricks.py        # Camada de dados: pool OAuth + todo o CRUD
│   │   └── genie.py             # Integração Genie API: query(message, conversation_id)
│   ├── static/
│   │   ├── css/
│   │   │   ├── styles.css       # Design system (sidebar, cards, modais, config panel, genie chat)
│   │   │   └── request.css      # Estilos das páginas de solicitação/pendente
│   │   ├── icons/               # Ícones PNG (pasta, casa, soma, ampulheta)
│   │   ├── img/                 # Logos (branco e preto, com e sem fundo)
│   │   └── js/
│   │       ├── sidebar.js       # Árvore de pastas, busca, goHome(), goConfig(), loadFolderContent(), chat Genie
│   │       ├── folders.js       # Modal Nova Pasta: openFolderModal(), submitFolder()
│   │       ├── dashboards.js    # Modal Novo Dashboard: openDashboardModal(), submitDashboard()
│   │       └── config.js        # Painel de configuração: loadConfigPanel(), toggleUserIA()
│   └── templates/
│       ├── base.html            # Layout base: sidebar, nav, busca, user info (Jinja2 extends)
│       ├── index.html           # Página principal (SPA): FABs + modais (só ADMIN/MANAGER) + FAB Genie
│       ├── dashboard.html       # Placeholder do painel de configuração (rota /dashboard)
│       ├── request.html         # Formulário de solicitação de acesso
│       └── pending.html         # Página de aguardando aprovação
├── run.py                       # Entry point dev: from app import create_app
├── app.yml                      # Databricks Apps: gunicorn run:app
└── CLAUDE.md                    # Este arquivo
```

## Regras Técnicas do Flask

- **Blueprints:** todas as rotas ficam em `app/routes.py` no blueprint `main`
- **Factory:** `create_app()` em `app/__init__.py` — nunca instanciar `Flask` fora dela
- **Init DB:** `init_database()` é chamado automaticamente no `create_app()` com try/except — roda migrations `ALTER TABLE ADD COLUMN IF NOT EXISTS` a cada startup
- **Serviços:** toda lógica de banco fica em `app/services/databricks.py` — rotas só orquestram
- **JSON API:** rotas que o JS chama retornam `jsonify({"ok": True, "data": ...})` ou `jsonify({"ok": False, "error": "..."}), status`
- **Error handlers:** registrados em `__init__.py` — rotas `/api/` retornam JSON mesmo em 404/500
- **Sem ORM:** usar `psycopg` + `sql.SQL()` diretamente — já está implementado em `services/databricks.py`
- **Variáveis de ambiente:** lidas via `os.getenv()` com `python-dotenv` para dev local

## Autenticação do Usuário

O Databricks Apps injeta automaticamente o email do usuário logado no header de cada request:

```python
user_email = request.headers.get("X-Forwarded-Email", "")
```

- Em **dev local**, o header não existe — usar fallback configurável via `.env` (`DEV_USER_EMAIL`)
- **Nunca** confiar em parâmetros do frontend para identificar o usuário — sempre ler o header
- O papel do usuário (role) vem do banco (`users.role`), não do Databricks

## Camada de Banco (`app/services/databricks.py`)

### Conexão OAuth

O Lakebase exige JWT obtido via `client_credentials`. A classe `_OAuthConnection` faz isso automaticamente antes de cada nova conexão no pool:

```python
# Variáveis de ambiente necessárias:
DATABRICKS_HOST          # URL do workspace
DATABRICKS_CLIENT_ID     # Service principal client id
DATABRICKS_CLIENT_SECRET # Service principal client secret (prod)
PGHOST / PGPORT / PGDATABASE / PGUSER / PGSSLMODE / PGAPPNAME
```

Em dev local, a VS Code Databricks Extension cria `.databricks/.databricks.env` com `DATABRICKS_AUTH_TYPE=metadata-service`, dispensando o `CLIENT_SECRET`.

### Schema Isolado

Todas as tabelas ficam em um schema próprio, gerado dinamicamente:

```python
def _schema():
    return f"{PGAPPNAME}_schema_{PGUSER.replace('-', '')}"
```

### Funções disponíveis (não reimplementar)

| Grupo | Funções |
|---|---|
| Init | `init_database()` |
| Usuários | `get_user(email)`, `ensure_user(email, name)`, `get_all_users()`, `update_user(email, **kwargs)` |
| Dashboards | `get_all_dashboards()`, `create_dashboard(**kwargs)`, `update_dashboard(id, **kwargs)`, `delete_dashboard(id)` |
| Tags | `get_all_tags()`, `create_tag(name, desc, color)`, `update_tag(id, **kwargs)`, `delete_tag(id)` |
| Pastas | `get_all_folders()`, `create_folder(name, desc, parent_id)`, `update_folder(id, **kwargs)`, `delete_folder(id)` |
| Solicitações | `create_access_request(email, name, msg)`, `get_pending_requests()`, `get_all_requests()`, `has_pending_request(email)`, `approve_request(id, reviewer, tags)`, `reject_request(id, reviewer, note)` |
| Favoritos | `get_favorites(email)`, `toggle_favorite(email, dashboard_id)` |
| Acesso individual | `get_individual_access(email)`, `grant_individual_access(user, dash, by)`, `revoke_individual_access(user, dash)`, `sync_individual_access(user, ids, by)` |
| Notificações | `get_notifications(email)`, `count_unread_notifications(email)`, `mark_notification_read(id)`, `create_notification(email, title, msg, type)` |
| Auditoria | `log_audit(email, action, entity, entity_id, details)`, `get_audit_log(limit)` |
| Settings | `get_settings()`, `set_setting(key, value)` |

## Modelo de Dados

```
users:               email PK | name | role (USER|BA|MANAGER|ADMIN) | tags[] | is_active | ia_enabled | created_at
tags:                id PK | name | description | color | dashboard_ids[] | created_at
dashboards:          id PK | title | url | link_type (DASHBOARD|GITHUB|N8N|OTHER) | description
                     | documentation | public_notes | private_notes | folder_id | thumbnail_url
                     | is_active | order_num | platform | visibility | created_at
folders:             id PK | name | description | parent_id (self-ref) | order_num | created_at
access_requests:     id PK | requester_email | requester_name | status (PENDING|APPROVED|REJECTED)
                     | message | reviewer_email | reviewed_at | review_note | created_at
user_dashboard_access: id PK | user_email | dashboard_id | granted_by | granted_at
notifications:       id PK | user_email | title | message | type | is_read | metadata | created_at
user_favorites:      id PK | user_email | dashboard_id
audit_log:           id PK | user_email | action | entity | entity_id | details (JSONB) | created_at
settings:            key PK | value
```

> Colunas adicionadas via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` no `init_database()`:
> - `dashboards.documentation TEXT DEFAULT ''`
> - `users.ia_enabled BOOLEAN DEFAULT FALSE`

## Arquitetura do Frontend

O portal é uma **SPA** baseada em `base.html` (layout) + `index.html` (conteúdo). A navegação entre Início, pastas e Painel de Configuração é feita via JS sem reload de página. A comunicação com o backend é via **fetch/AJAX** (JSON).

### Arquivos JS e responsabilidades

| Arquivo | Responsabilidade |
|---|---|
| `sidebar.js` | Árvore de pastas, busca local, `goHome()`, `goConfig()`, `loadFolderContent()`, `reloadFolders()`, chat Genie (`openGenieChat()`, `_triggerGenieQuery()`, `_sendGenieMessage()`) |
| `folders.js` | Modal Nova Pasta: `openFolderModal()`, `closeFolderModal()`, `submitFolder()` |
| `dashboards.js` | Modal Novo Dashboard: `openDashboardModal()`, `closeDashboardModal()`, `submitDashboard()`, FileReader para upload de .md |
| `config.js` | Painel admin: `loadConfigPanel()`, `switchConfigTab()`, `approveRequest()`, `rejectRequest()`, `toggleUserActive()`, `changeUserRole()`, `toggleUserIA()` |

### Navegação SPA

- `goHome(e)` — previne reload, limpa seleção de pastas, restaura estado "Início"
- `goConfig(e)` — previne reload, chama `loadConfigPanel()` que busca dados via fetch
- `loadFolderContent(folderId, folderName)` — renderiza subpastas + dashboards da pasta selecionada
- Ambos verificam se `#folder-content` existe antes de `e.preventDefault()`
- `openGenieChat()` — abre o chat de IA (ou retoma conversa existente)

### Variáveis globais em sidebar.js

```javascript
var _allDashboards = [];       // cache de todos os dashboards
var _allFoldersMap = {};       // mapa id → folder para navegação de breadcrumb
var _selectedFolderId = null;  // pasta ativa no momento
var _genieConversationId = null; // ID da conversa Genie ativa
var _genieHistory = [];        // histórico de mensagens do chat
```

### Busca na sidebar

- **Digitando** → filtra `_allFoldersMap` e `_allDashboards` localmente, renderiza em `#folder-content`
- **Enter ou botão ✦** → envia para Genie via `POST /api/genie/query` (apenas se `ia_enabled`)
- Limpar campo → restaura tela de Início

### Chat Genie

- Memória de conversa: `_genieConversationId` é mantido entre mensagens da mesma sessão
- "Nova conversa" reseta `_genieConversationId` e `_genieHistory`
- `#folder-content.genie-mode` ativa layout flex com chat scrollável e input fixo no rodapé
- `_mdToHtml()` renderiza markdown básico da resposta (bold, italic, listas, code inline)

### Padrão de chamada ao backend (nos arquivos JS)

```javascript
var res = await fetch("/api/endpoint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
});
var data = await res.json();
if (!data.ok) throw new Error(data.error || "Erro desconhecido");
```

### Padrões Importantes

- **Re-render após mutação:** após criar pasta ou dashboard, chamar `reloadFolders()`; após ação no painel de config, chamar `loadConfigPanel()`
- **URLs Jinja2 no JS:** usar `window._varName = "{{ url_for(...) }}"` no template e referenciar `window._varName` nos arquivos `.js`
- **Dependências JS:** apenas Google Fonts (Inter) — sem React, sem bundler, sem Bootstrap
- **Permissões no backend:** NUNCA confiar no frontend para filtrar — o servidor é a fonte de verdade
- **Permissões no frontend:** usar `{% if current_user.is_admin %}` e `{% if current_user.ia_enabled %}` no Jinja2
- **`_escHtml(str)`:** sempre sanitizar strings do banco antes de inserir no `innerHTML`

## Lógica de Permissões

ADMIN e MANAGER têm acesso irrestrito. Para USER e BA, o acesso é calculado em `get_accessible_dashboards(email)` em `databricks.py`:

### Via Tag (`users.tags[]` → `tags.dashboard_ids` / `tags.folder_ids`)

| Vínculo na tag | Resultado para o usuário |
|---|---|
| `dashboard_ids` | Acesso apenas aos dashboards listados |
| `folder_ids` | Acesso a **todos** os dashboards da pasta (dinâmico — inclui futuros) |
| Ambos | União dos dois conjuntos |

### Via Acesso Individual (`user_dashboard_access`)

Concedido pelo admin no modal **"Acesso"** do painel de configuração:

| Concessão | Resultado |
|---|---|
| Pasta selecionada | Dashboards da pasta resolvidos no momento da concessão e salvos em `user_dashboard_access` |
| Dashboard individual | Apenas aquele dashboard |

### Regra consolidada

```
Dashboard visível = (id em tag.dashboard_ids das tags do usuário)
                  OU (folder_id em tag.folder_ids das tags do usuário)   ← dinâmico
                  OU (id em user_dashboard_access do usuário)            ← estático

Pasta visível     = (contém dashboard visível) OU (é ancestral de pasta visível)
ADMIN / MANAGER   = acesso total + painel admin
ia_enabled        = ADMIN/MANAGER sempre TRUE | USER/BA conforme users.ia_enabled
```

### Função de filtragem

`get_accessible_dashboards(email)` em `app/services/databricks.py`:
1. Se ADMIN/MANAGER → retorna `get_all_dashboards()`
2. Busca tags do usuário → coleta `dashboard_ids` e `folder_ids` de todas as tags
3. Busca `user_dashboard_access` do usuário
4. Executa `SELECT * FROM dashboards WHERE id = ANY(dash_ids) OR folder_id = ANY(folder_ids)`

## Perfis de Usuário

| Role | Acesso |
|---|---|
| USER | Apenas dashboards autorizados, info pública |
| BA | Tudo do USER + funcionalidades extras de análise |
| MANAGER | Tudo + painel admin completo + IA |
| ADMIN | Tudo + painel admin completo + IA |

## context_processor (`app/__init__.py`)

```python
current_user = {
    "email": str,
    "initials": str,      # ex: "VS"
    "role": str,          # label PT: "Usuário", "Analista", "Gerente", "Administrador"
    "is_admin": bool,     # True para ADMIN e MANAGER
    "ia_enabled": bool,   # True para ADMIN/MANAGER ou se users.ia_enabled = True
}
```

## Integração Genie (`app/services/genie.py`)

```python
# Variável de ambiente necessária:
GENIE_ESPACE_ID   # ID do Genie Space no Databricks

# Função principal:
result = query(message, conversation_id=None, timeout=90)
# Retorna:
{
    "answer": str,              # Texto da resposta em markdown
    "query_description": str,   # Descrição do SQL executado
    "columns": list[str],       # Colunas do resultado
    "rows": list[dict],         # Linhas do resultado
    "conversation_id": str,     # ID para continuar a conversa
}
```

Fluxo interno:
1. Obtém token OAuth (reusa `_get_token()` — mesmo mecanismo do psycopg)
2. `POST /api/2.0/genie/spaces/{space_id}/start-conversation` (nova) ou `POST .../messages` (continuação)
3. Poll `GET .../messages/{msg_id}` até `status == "COMPLETED"`
4. `GET .../messages/{msg_id}/query-result` para buscar os dados

## Rotas Flask implementadas

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Página principal (index.html) |
| GET | `/dashboard` | Painel de configuração (dashboard.html) |
| GET | `/solicitar-acesso` | Formulário de solicitação de acesso |
| POST | `/solicitar-acesso` | Envia solicitação |
| GET | `/aguardando` | Página de aguardando aprovação |
| GET | `/api/folders` | Lista pastas + dashboards |
| POST | `/api/folders` | Cria pasta |
| POST | `/api/dashboards` | Cria dashboard (aceita `documentation`) |
| GET | `/api/users` | Lista todos os usuários |
| PUT | `/api/users/<email>` | Atualiza usuário (role, is_active, name, tags, ia_enabled) |
| GET | `/api/requests` | Lista solicitações pendentes |
| POST | `/api/requests/<id>/approve` | Aprova solicitação |
| POST | `/api/requests/<id>/reject` | Rejeita solicitação |
| POST | `/api/genie/query` | Consulta Genie (aceita `message` + `conversation_id`) |

### Rotas planejadas (ainda não implementadas)

| Método | Rota | Descrição |
|---|---|---|
| PUT | `/api/folders/<id>` | Atualiza pasta |
| DELETE | `/api/folders/<id>` | Remove pasta |
| PUT | `/api/dashboards/<id>` | Atualiza dashboard |
| DELETE | `/api/dashboards/<id>` | Remove dashboard |
| GET | `/api/tags` | Lista tags |
| POST/PUT/DELETE | `/api/tags/<id>` | CRUD de tags |
| POST | `/api/favorites/<dash_id>` | Toggle favorito |
| GET | `/api/notifications` | Lista notificações |
| GET | `/api/audit` | Audit log (ADMIN) |

## Design System

### Cores

| Token | Hex | Uso |
|---|---|---|
| `--primary` | `#1B2CC1` | Botões, links, ícones ativos, mensagens do usuário no chat |
| `--primary-hover` | `#1520A0` | Hover em primary |
| `--primary-light` | `#EEF0FF` | Backgrounds suaves, badges, respostas IA |
| `--accent` | `#00C2A8` | CTAs secundários |
| `--dark` | `#0D0D2B` | Sidebar, FAB Genie |
| `--surface` | `#F7F8FC` | Background da página, respostas IA |
| `--card` | `#FFFFFF` | Cards, modais |
| `--text` | `#1A1D2E` | Texto principal |
| `--text-secondary` | `#6B7280` | Labels, descrições |
| `--border` | `#E5E7EB` | Bordas, separadores |
| `--success` | `#10B981` | Aprovado, ativo |
| `--warning` | `#F59E0B` | Pendente |
| `--error` | `#EF4444` | Erro, rejeitado |

### Tipografia

- Fonte única: **Inter** (Google Fonts) — weights 400, 500, 600, 700
- Escala: H1 24px | H2 20px | H3 16px | Body 14px | Small 13px | Label 11px

### Componentes

- **Sidebar:** 300px fixa, fundo `#111827`, item ativo com borda esquerda 3px `#fff`
- **Cards:** `border-radius: 12px`, `box-shadow: 0 2px 8px rgba(0,0,0,0.06)`, hover eleva 2px
- **Botões:** `border-radius: 8px`, primary fundo `--primary`
- **Modais:** overlay `rgba(13,13,43,0.5)` com `backdrop-blur`, card `max-width: 540px`
- **FAB Genie:** botão circular 52px, fundo `#0D0D2B`, hover azul primary
- **Chat IA:** mensagens do usuário azul à direita, respostas IA com fundo `#F7F8FC` à esquerda
- **Toggle IA:** switch 36×20px, azul quando ativo

## Deploy

### Databricks Apps (`app.yml`)

```yaml
command: ["gunicorn", "-b", "0.0.0.0:$DATABRICKS_APP_PORT", "run:app"]
```

### Dev Local

```bash
python run.py
```

Criar `.env` na raiz com todas as variáveis listadas na seção de Stack Técnica, incluindo `GENIE_ESPACE_ID`.
