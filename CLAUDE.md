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
| Banco de dados | Databricks Lakebase (PostgreSQL via `psycopg` + `psycopg_pool`) |
| Auth no banco | OAuth2 client_credentials → JWT → senha do psycopg |
| Auth do usuário | Databricks Apps injeta `X-Forwarded-Email` no header |
| Frontend | HTML + CSS + JS vanilla (Jinja2 templates) |
| CSS Framework | Bootstrap 5.3.3 (CDN jsDelivr) |
| Design System | Padrão BHub |
| Deploy | Databricks Apps via `app.yml` (gunicorn) |
| Dev local | `python run.py` (Flask debug server) |

## Estrutura de Arquivos

```
├── app/
│   ├── __init__.py              # Factory: create_app(), context_processor com current_user
│   ├── routes.py                # Blueprint "main" — todas as rotas Flask
│   ├── services/
│   │   └── databricks.py        # Camada de dados: pool OAuth + todo o CRUD
│   ├── static/
│   │   ├── css/
│   │   │   ├── styles.css       # Design system BHub (sidebar, cards, modais, config panel)
│   │   │   └── request.css      # Estilos das páginas de solicitação/pendente
│   │   ├── icons/               # Ícones PNG (pasta, casa, soma, ampulheta)
│   │   ├── img/                 # Logos BHub (branco e preto, com e sem fundo)
│   │   └── js/
│   │       ├── sidebar.js       # Árvore de pastas, goHome(), goConfig(), loadFolderContent()
│   │       ├── folders.js       # Modal Nova Pasta: openFolderModal(), submitFolder()
│   │       ├── dashboards.js    # Modal Novo Dashboard: openDashboardModal(), submitDashboard()
│   │       └── config.js        # Painel de configuração: loadConfigPanel(), tabbed nav
│   └── templates/
│       ├── base.html            # Layout base: sidebar, nav, user info (Jinja2 extends)
│       ├── index.html           # Página principal (SPA): FABs + modais (só ADMIN/MANAGER)
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
- **Serviços:** toda lógica de banco fica em `app/services/databricks.py` — rotas só orquestram
- **JSON API:** rotas que o JS chama retornam `jsonify({"ok": True, "data": ...})` ou `jsonify({"ok": False, "error": "..."}), status`
- **Rotas de página:** retornam `render_template("index.html", **ctx)` com dados iniciais embutidos
- **Sem ORM:** usar `psycopg` + `sql.SQL()` diretamente — já está implementado em `services/databricks.py`
- **Variáveis de ambiente:** lidas via `os.getenv()` com `python-dotenv` para dev local

## Autenticação do Usuário

O Databricks Apps injeta automaticamente o email do usuário logado no header de cada request:

```python
# Em qualquer rota Flask:
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
    # ex: "bhub_portal_schema_abc123def"
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
users:               email PK | name | role (USER|BA|MANAGER|ADMIN) | tags[] | is_active | created_at
tags:                id PK | name | description | color | dashboard_ids[] | created_at
dashboards:          id PK | title | url | link_type (DASHBOARD|GITHUB|N8N|OTHER) | description
                     | public_notes | private_notes | folder_id | thumbnail_url
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

## Arquitetura do Frontend

O portal é uma **SPA** baseada em `base.html` (layout) + `index.html` (conteúdo). A navegação entre Início, pastas e Painel de Configuração é feita via JS sem reload de página. A comunicação com o backend é via **fetch/AJAX** (JSON).

### Arquivos JS e responsabilidades

| Arquivo | Responsabilidade |
|---|---|
| `sidebar.js` | Árvore de pastas (build/render/expand), `goHome()`, `goConfig()`, `loadFolderContent()`, `reloadFolders()` |
| `folders.js` | Modal Nova Pasta: `openFolderModal()`, `closeFolderModal()`, `submitFolder()` |
| `dashboards.js` | Modal Novo Dashboard: `openDashboardModal()`, `closeDashboardModal()`, `submitDashboard()` |
| `config.js` | Painel admin: `loadConfigPanel()`, `switchConfigTab()`, `approveRequest()`, `rejectRequest()`, `toggleUserActive()`, `changeUserRole()` |

### Navegação SPA

- `goHome(e)` — previne reload, limpa seleção de pastas, restaura estado "Início"
- `goConfig(e)` — previne reload, chama `loadConfigPanel()` que busca dados via fetch
- `loadFolderContent(folderId, folderName)` — renderiza subpastas + dashboards da pasta selecionada
- Ambos verificam se `#folder-content` existe antes de `e.preventDefault()` — se não existir (página diferente), permite navegação normal

### Variáveis globais em sidebar.js

```javascript
var _allDashboards = [];      // cache de todos os dashboards
var _allFoldersMap = {};      // mapa id → folder para navegação de breadcrumb
var _selectedFolderId = null; // pasta ativa no momento
```

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
- **Permissões no frontend:** usar `{% if current_user.is_admin %}` no Jinja2 para esconder elementos admin (FABs, Painel de Configuração)
- **`_escHtml(str)`:** sempre sanitizar strings do banco antes de inserir no `innerHTML`

## Lógica de Permissões (aplicada nas rotas Flask)

```
Dashboard acessível = (está em tag do usuário) OU (tem acesso individual em user_dashboard_access)
Pasta visível       = (contém dashboard acessível) OU (é ancestral de pasta visível)
ADMIN / MANAGER     = acesso total
```

## Perfis de Usuário

| Role | Acesso |
|---|---|
| USER | Apenas dashboards autorizados, info pública |
| BA | Tudo do USER + funcionalidades extras de análise |
| MANAGER | Tudo + painel admin completo |
| ADMIN | Tudo + painel admin completo |

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
| POST | `/api/dashboards` | Cria dashboard |
| GET | `/api/users` | Lista todos os usuários |
| PUT | `/api/users/<email>` | Atualiza usuário (role, is_active, name, tags) |
| GET | `/api/requests` | Lista solicitações pendentes |
| POST | `/api/requests/<id>/approve` | Aprova solicitação (ativa usuário) |
| POST | `/api/requests/<id>/reject` | Rejeita solicitação |

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

## Design System BHub

### Cores

| Token | Hex | Uso |
|---|---|---|
| `--primary` | `#1B2CC1` | Botões, links, ícones ativos |
| `--primary-hover` | `#1520A0` | Hover em primary |
| `--primary-light` | `#EEF0FF` | Backgrounds suaves, badges |
| `--accent` | `#00C2A8` | CTAs secundários, sidebar active |
| `--accent-light` | `#E6FAF7` | Background accent |
| `--dark` | `#0D0D2B` | Sidebar, overlays |
| `--surface` | `#F7F8FC` | Background da página |
| `--card` | `#FFFFFF` | Cards, modais |
| `--text` | `#1A1D2E` | Texto principal |
| `--text-secondary` | `#6B7280` | Labels, descrições |
| `--text-muted` | `#9CA3AF` | Placeholders |
| `--border` | `#E5E7EB` | Bordas, separadores |
| `--success` | `#10B981` | Aprovado, ativo |
| `--warning` | `#F59E0B` | Pendente |
| `--error` | `#EF4444` | Erro, rejeitado |

### Tipografia

- Fonte única: **Inter** (Google Fonts) — weights 400, 500, 600, 700
- Escala: H1 24px | H2 20px | H3 16px | Body 14px | Small 12px | Label 11px

### Componentes

- **Sidebar:** 260px fixa, fundo `#111827`, item ativo com borda esquerda 3px `#fff`
- **Cards:** `border-radius: 12px`, `box-shadow: 0 2px 8px rgba(0,0,0,0.06)`, hover eleva 2px
- **Botões:** `border-radius: 8px`, primary fundo `--primary`
- **Modais:** overlay `rgba(13,13,43,0.5)` com `backdrop-blur`, card `max-width: 540px`, `border-radius: 16px`
- **Espaçamento:** grid de 8px (8, 16, 24, 32, 48)

## Deploy

### Databricks Apps (`app.yml`)

```yaml
command: ["gunicorn", "-b", "0.0.0.0:$DATABRICKS_APP_PORT", "run:app"]
```

- `$DATABRICKS_APP_PORT` é injetado automaticamente pelo Databricks Apps
- O gunicorn aponta para `run:app` (`run.py` → `app = create_app()`)
- Secrets (CLIENT_ID, CLIENT_SECRET, PG*) configurados como variáveis de ambiente no App

### Dev Local

```bash
python run.py       # Flask dev server com hot reload
# ou
flask --app run run --debug
```

Criar `.env` na raiz com:
```
DEV_USER_EMAIL=seu.email@bhub.ai
DATABRICKS_HOST=https://...
DATABRICKS_CLIENT_ID=...
DATABRICKS_CLIENT_SECRET=...
PGHOST=... PGPORT=5432 PGDATABASE=... PGUSER=... PGSSLMODE=require PGAPPNAME=bhub_portal
```
