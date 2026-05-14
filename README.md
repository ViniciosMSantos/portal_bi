# Portal de Dashboards — BHub

Portal corporativo para centralizar e controlar o acesso a dashboards, links e ferramentas internas. Roda como **Databricks App** com backend Flask e banco **Lakebase** (PostgreSQL gerenciado pelo Databricks).

## Funcionalidades

- Navegação SPA por pastas e subpastas (sem reload de página)
- Cards de dashboard com link direto, tipo e descrição
- **Campo de busca** na sidebar: filtro local em tempo real por nome/descrição
- **Chat de IA** integrado ao Databricks Genie:
  - Perguntas em linguagem natural sobre os dados dos dashboards
  - Memória de conversa (contexto mantido entre perguntas)
  - Acessível via botão ✦ na sidebar e FAB na tela principal
  - Habilitado por usuário — admin controla quem tem acesso
- Documentação por dashboard: campo para armazenar README.md/CLAUDE.md como fonte de dados para o LLM
- Solicitação de acesso para usuários novos (fluxo de aprovação)
- Painel de configuração para administradores (ADMIN/MANAGER):
  - Aprovar ou rejeitar solicitações de acesso pendentes
  - Ativar/desativar usuários
  - Alterar perfil de usuário (USER / BA / MANAGER / ADMIN)
  - Habilitar/desabilitar acesso à IA por usuário
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
| IA | Databricks Genie Conversation API |
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
GENIE_ESPACE_ID=id-do-espaco-genie
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
│   ├── databricks.py   # CRUD completo via psycopg + OAuth pool
│   └── genie.py        # Integração com Databricks Genie API
├── static/
│   ├── css/
│   │   ├── styles.css  # Design system BHub
│   │   └── request.css # Páginas de solicitação/pendente
│   ├── icons/          # Ícones PNG
│   ├── img/            # Logos BHub
│   └── js/
│       ├── sidebar.js  # Navegação SPA, busca, chat Genie
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

> ADMIN e MANAGER sempre têm acesso à IA. USER e BA só têm acesso se `ia_enabled = true` for configurado pelo admin.

## Governança de acesso

O acesso de usuários com role **USER** e **BA** segue as seguintes regras, avaliadas em conjunto:

### Via Tag

Cada tag pode ter dashboards e/ou pastas vinculados:

- **Tag com dashboard vinculado** → usuário vê apenas aquele dashboard
- **Tag com pasta vinculada** → usuário vê **todos os dashboards dentro daquela pasta** (dinâmico — inclui dashboards futuros adicionados à pasta)
- Tag pode combinar pastas e dashboards vinculados simultaneamente

### Via Acesso Individual (concedido pelo admin no modal "Acesso")

- **Acesso a pasta** → usuário vê todos os dashboards da pasta (resolvido no momento da concessão; dashboards futuros exigem nova concessão)
- **Acesso a dashboard específico** → usuário vê apenas aquele dashboard

### Regra geral

```
Dashboard visível = (está em tag do usuário via dashboard_ids)
                  OU (está em pasta vinculada à tag do usuário via folder_ids)
                  OU (tem acesso individual concedido em user_dashboard_access)

Pasta visível   = contém ao menos um dashboard visível ao usuário
                  OU é ancestral de pasta visível
```

ADMIN e MANAGER ignoram todas as regras acima e veem tudo.

## Genie — Chat de IA

O chat usa o **Databricks Genie Conversation API**. Configure um Genie Space no workspace com as tabelas relevantes (dashboards, dados de negócio) e informe o `GENIE_ESPACE_ID` no `.env`.

- Perguntas em linguagem natural → Genie executa SQL internamente → retorna resposta em texto
- Memória de conversa: cada sessão mantém o `conversation_id` para perguntas de acompanhamento
- "Nova conversa" reseta o contexto

## Deploy no Databricks Apps

O arquivo `app.yml` já está configurado:

```yaml
command: ["gunicorn", "-b", "0.0.0.0:$DATABRICKS_APP_PORT", "run:app"]
```

Configure as variáveis de ambiente (`PGHOST`, `PGUSER`, `GENIE_ESPACE_ID`, etc.) diretamente no painel do Databricks App antes de publicar.
