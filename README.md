# Portal de Dashboards — BHub

Portal corporativo para centralizar e controlar o acesso a dashboards, links e ferramentas internas. Roda como **Databricks App** com backend Flask e banco **Lakebase** (PostgreSQL gerenciado pelo Databricks).

## Funcionalidades

- Navegação SPA por pastas e subpastas (sem reload de página)
- Cards de dashboard com link direto, tipo e descrição
- Solicitação de acesso para usuários novos (fluxo de aprovação)
- Painel de configuração para administradores:
  - Aprovar ou rejeitar solicitações de acesso pendentes
  - Ativar/desativar usuários
  - Alterar perfil de usuário (USER / BA / MANAGER / ADMIN)
- Favicon adaptativo ao tema do sistema (claro/escuro)
- Controle de acesso por role: FABs e painel admin visíveis apenas para ADMIN/MANAGER

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Python 3.11 |
| Framework | Flask (factory pattern + Blueprints) |
| Banco de dados | Databricks Lakebase (PostgreSQL) |
| Auth do banco | OAuth2 client_credentials → JWT |
| Auth do usuário | Header `X-Forwarded-Email` (Databricks Apps) |
| Frontend | HTML + CSS + JS vanilla (Jinja2) |
| Fonte | Inter (Google Fonts) |
| Deploy | Databricks Apps (gunicorn) |

## Rodando localmente

### Pré-requisitos

- Python 3.11+
- Acesso ao workspace Databricks com Lakebase configurado
- VS Code Databricks Extension (para autenticação local via metadata-service)

### Instalação

```bash
pip install -r requirements.txt
```

### Configuração

Crie um arquivo `.env` na raiz do projeto:

```env
DEV_USER_EMAIL=seu.email@bhub.ai
DATABRICKS_HOST=https://seu-workspace.azuredatabricks.net
DATABRICKS_CLIENT_ID=seu-client-id
DATABRICKS_CLIENT_SECRET=seu-client-secret
PGHOST=seu-lakebase-host
PGPORT=5432
PGDATABASE=nome-do-banco
PGUSER=nome-do-usuario
PGSSLMODE=require
PGAPPNAME=bhub_portal
```

> Com a VS Code Databricks Extension ativa, `DATABRICKS_CLIENT_SECRET` pode ser omitido — a extensão usa `metadata-service` automaticamente.

### Executando

```bash
python run.py
```

Acesse `http://localhost:5000`.

## Estrutura do projeto

```
app/
├── __init__.py          # Factory create_app(), context_processor current_user
├── routes.py            # Todas as rotas Flask (Blueprint "main")
├── services/
│   └── databricks.py   # CRUD completo via psycopg + OAuth pool
├── static/
│   ├── css/
│   │   ├── styles.css  # Design system BHub
│   │   └── request.css # Páginas de solicitação/pendente
│   ├── icons/          # Ícones PNG
│   ├── img/            # Logos BHub
│   └── js/
│       ├── sidebar.js  # Navegação SPA + árvore de pastas
│       ├── folders.js  # Modal Nova Pasta
│       ├── dashboards.js # Modal Novo Dashboard
│       └── config.js   # Painel de configuração
└── templates/
    ├── base.html        # Layout base com sidebar
    ├── index.html       # Página principal
    ├── dashboard.html   # Painel de configuração
    ├── request.html     # Formulário de acesso
    └── pending.html     # Aguardando aprovação
run.py                   # Entry point
app.yml                  # Databricks Apps (gunicorn)
```

## Perfis de usuário

| Role | Acesso |
|---|---|
| USER | Dashboards autorizados por tag ou acesso individual |
| BA | Igual ao USER + funcionalidades de análise |
| MANAGER | Acesso total + painel admin |
| ADMIN | Acesso total + painel admin |

## Deploy no Databricks Apps

O arquivo `app.yml` já está configurado:

```yaml
command: ["gunicorn", "-b", "0.0.0.0:$DATABRICKS_APP_PORT", "run:app"]
```

Configure as variáveis de ambiente (`PGHOST`, `PGUSER`, etc.) diretamente no painel do Databricks App antes de publicar.
