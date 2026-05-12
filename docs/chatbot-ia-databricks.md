# Chatbot IA com Databricks — Guia Técnico

**Portal de Dashboards BHub** | Pesquisa realizada em 2026-05-12

---

## Sumário Executivo

Para o objetivo de ter um chat que responda "onde acho dados de vendas?" e execute análises via SQL no Databricks, há 7 tecnologias disponíveis. A recomendação é uma **arquitetura em 3 fases** evolutivas:

| Fase | Tecnologia | Prazo estimado | O que entrega |
|---|---|---|---|
| 1 — MVP | Foundation Model API + busca SQL | 1–2 dias | Chat recomenda dashboards por texto |
| 2 — RAG | Vector Search + Foundation Model API | 1–2 semanas | Busca semântica (vendas = receita = faturamento) |
| 3 — SQL | Genie Conversation API | 2–4 semanas | NL→SQL gerenciado com guard-rails |

---

## 1. Databricks Foundation Model APIs

### O que é
Endpoints LLM pré-configurados no workspace, pagos por token, **100% compatíveis com a API OpenAI** (mesmo formato de request/response). Nenhuma infraestrutura para gerenciar.

### Documentação oficial
- AWS: https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/
- Azure: https://learn.microsoft.com/en-us/azure/databricks/machine-learning/foundation-model-apis/
- Modelos disponíveis: https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/supported-models
- Referência da API: https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/api-reference
- Limites: https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/limits
- Preços: https://www.databricks.com/product/pricing/foundation-model-serving

### Modelos disponíveis (seleção)

| Modelo | Endpoint name | Contexto | Uso |
|---|---|---|---|
| Claude Sonnet 4.6 | `databricks-claude-sonnet-4-6` | — | Chat/raciocínio |
| Claude Haiku 4.5 | `databricks-claude-haiku-4-5` | — | Chat rápido/barato |
| Llama 3.3 70B | `databricks-meta-llama-3-3-70b-instruct` | 128K | Open source, sem custo extra |
| Llama 3.1 8B | `databricks-meta-llama-3-1-8b-instruct` | 128K | Mais barato |
| GTE Large (embed) | `databricks-gte-large-en` | 8192 | Embeddings para RAG |
| BGE Large (embed) | `databricks-bge-large-en` | 512 | Embeddings menores |

### Rate limits (por workspace)
- 200.000 input tokens/minuto
- 20.000 output tokens/minuto
- 200 requests/segundo

### Autenticação
Bearer token (PAT) ou service principal OAuth. No Databricks App o SDK autentica automaticamente.

### Exemplo Python (via cliente OpenAI — recomendado)
```python
from openai import OpenAI
import os

client = OpenAI(
    api_key=os.getenv("DATABRICKS_TOKEN"),
    base_url=f"{os.getenv('DATABRICKS_HOST')}/serving-endpoints",
)

response = client.chat.completions.create(
    model="databricks-claude-sonnet-4-6",
    messages=[
        {
            "role": "system",
            "content": "Você é um assistente que ajuda usuários a achar dashboards relevantes. "
                       "Responda em português. Quando recomendar um dashboard, sempre inclua o link."
        },
        {"role": "user", "content": "Onde acho dados de vendas mensais?"}
    ],
    max_tokens=512,
)

print(response.choices[0].message.content)
```

### Endpoint URL
```
POST https://<workspace-host>/serving-endpoints/<model-name>/invocations
```

### Exemplo cURL
```bash
curl -X POST \
  -H "Authorization: Bearer $DATABRICKS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Onde acho dados de vendas?"}],
    "max_tokens": 256
  }' \
  "https://$DATABRICKS_HOST/serving-endpoints/databricks-claude-sonnet-4-6/invocations"
```

---

## 2. Databricks AI/BI Genie — Conversation API

### O que é
Interface NL→SQL gerenciada pela Databricks. Você define um **Genie Space** associado a tabelas e um SQL Warehouse, e a API traduz perguntas em linguagem natural para SQL, executa, e retorna a resposta + o SQL gerado. Mantém contexto conversacional.

### Documentação oficial
- AWS: https://docs.databricks.com/aws/en/genie/conversation-api
- Azure: https://learn.microsoft.com/en-us/azure/databricks/genie/conversation-api
- Referência REST: https://docs.databricks.com/api/workspace/genie
- Integração com Databricks Apps: https://docs.databricks.com/aws/en/dev-tools/databricks-apps/genie
- Blog anúncio (Public Preview): https://www.databricks.com/blog/genie-conversation-apis-public-preview

### Endpoints REST
```
POST /api/2.0/genie/spaces/{space_id}/start-conversation
POST /api/2.0/genie/spaces/{space_id}/conversations/{conversation_id}/messages
GET  /api/2.0/genie/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}
GET  /api/2.0/genie/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}/query-result/{attachment_id}
```

### Rate limits
- **5 perguntas por minuto** por workspace (apenas POSTs)
- GETs de polling não contam
- Máximo 10.000 conversas por space

### Exemplo Python (SDK Databricks — recomendado para Flask)
```python
import os
from databricks.sdk import WorkspaceClient

w = WorkspaceClient()  # autentica automaticamente no Databricks App
space_id = os.getenv("GENIE_SPACE_ID")

# start_conversation_and_wait faz o polling internamente
response = w.genie.start_conversation_and_wait(
    space_id=space_id,
    content="Quais foram as vendas do último trimestre por região?"
)

for attachment in response.attachments:
    if attachment.text:
        print("Resposta:", attachment.text.content)
    if attachment.query:
        print("SQL gerado:", attachment.query.query)
        # Os dados tabulares ficam em attachment.query.result
```

### Configurar no app.yml
```yaml
env:
  - name: GENIE_SPACE_ID
    valueFrom: genie-space   # nome do recurso configurado no App
```

### Pré-requisitos
1. Criar um Genie Space no workspace (UI → AI/BI → Genie)
2. Associar ao SQL Warehouse e às tabelas desejadas
3. O service principal do app precisa de `USE CATALOG`, `USE SCHEMA`, `SELECT` nas tabelas
4. As tabelas devem estar no Unity Catalog (não no Lakebase diretamente — ver seção de Arquitetura)

### Disponível no Azure: **SIM**

---

## 3. SQL Statement Execution API

### O que é
API REST para executar SQL arbitrário em um SQL Warehouse sem driver JDBC/ODBC. Ideal para **queries fixas pré-definidas** (KPIs, relatórios padronizados).

### Documentação oficial
- Tutorial AWS: https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial
- Tutorial Azure: https://learn.microsoft.com/en-us/azure/databricks/dev-tools/sql-execution-tutorial
- Referência REST: https://docs.databricks.com/api/workspace/statementexecution

### Endpoints
```
POST  /api/2.0/sql/statements                                    # executa
GET   /api/2.0/sql/statements/{statement_id}                     # status/resultado
POST  /api/2.0/sql/statements/{statement_id}/cancel              # cancela
GET   /api/2.0/sql/statements/{statement_id}/result/chunks/{n}   # chunks grandes
```

### Estados de execução
`PENDING → RUNNING → SUCCEEDED | FAILED | CANCELED`

### Exemplo Python (com polling automático)
```python
import requests, time, os

HOST  = os.getenv("DATABRICKS_HOST")
TOKEN = os.getenv("DATABRICKS_TOKEN")
WH_ID = os.getenv("DATABRICKS_WAREHOUSE_ID")
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

def run_sql(statement: str, params: list = None) -> list:
    """Executa SQL e retorna lista de linhas. Usa parâmetros para evitar injection."""
    resp = requests.post(
        f"https://{HOST}/api/2.0/sql/statements",
        headers=HEADERS,
        json={
            "warehouse_id": WH_ID,
            "statement": statement,
            "parameters": params or [],
            "wait_timeout": "30s",    # síncrono até 30s, depois polling
            "disposition": "INLINE",  # resultado embutido na resposta (até 25 MiB)
        }
    )
    resp.raise_for_status()
    data = resp.json()
    sid = data["statement_id"]

    # Polling se não terminou no wait_timeout
    while data["status"]["state"] in ("PENDING", "RUNNING"):
        time.sleep(2)
        data = requests.get(
            f"https://{HOST}/api/2.0/sql/statements/{sid}", headers=HEADERS
        ).json()

    if data["status"]["state"] != "SUCCEEDED":
        raise RuntimeError(data["status"].get("error", {}).get("message"))

    return data.get("result", {}).get("data_array", [])


# Uso seguro com parâmetros (OBRIGATÓRIO — previne SQL injection)
rows = run_sql(
    "SELECT title, url FROM dashboards WHERE regiao = :reg LIMIT :lim",
    params=[
        {"name": "reg", "value": "Sul",  "type": "STRING"},
        {"name": "lim", "value": "10",   "type": "INT"},
    ]
)
```

### ⚠️ Segurança importante
- **SEMPRE** usar parâmetros nomeados (`:name`) — nunca f-strings com input do usuário
- Para resultados > 25 MiB usar `"disposition": "EXTERNAL_LINKS"` (retorna presigned URLs S3/ADLS)
- Usar service principal com permissões mínimas (não admin)

### Disponível no Azure: **SIM**

---

## 4. Databricks Vector Search (RAG)

### O que é
Serviço gerenciado de vector store para **Retrieval-Augmented Generation**. Sincroniza automaticamente com tabela Delta, computa embeddings com modelos do próprio Databricks e responde queries de similaridade semântica.

### Documentação oficial
- AWS: https://docs.databricks.com/aws/en/vector-search/vector-search
- Azure: https://learn.microsoft.com/en-us/azure/databricks/vector-search/vector-search
- RAG overview: https://docs.databricks.com/aws/en/generative-ai/retrieval-augmented-generation
- LangChain integration: https://docs.langchain.com/oss/python/integrations/vectorstores/databricks_vector_search

### Tipos de índice

| Tipo | Quando usar |
|---|---|
| Delta Sync + managed embeddings | Databricks computa embeddings automaticamente — recomendado |
| Delta Sync + pre-computed embeddings | Você fornece os vetores |
| Direct Vector Access | Inserção manual via API |
| Full-text Search BM25 (Beta) | Busca por palavra-chave |

### Pré-requisitos
- Unity Catalog habilitado
- Serverless compute
- Change Data Feed ativo na tabela Delta source

### Exemplo Python (via LangChain — o mais usado para chatbots)
```python
from databricks.vector_search.client import VectorSearchClient
from databricks_langchain import DatabricksVectorSearch, DatabricksEmbeddings

client = VectorSearchClient()

# 1. Criar endpoint (uma vez)
client.create_endpoint(name="portal-dashboards-ep", endpoint_type="STANDARD")

# 2. Criar índice sincronizando com tabela Delta de dashboards
client.create_delta_sync_index(
    endpoint_name="portal-dashboards-ep",
    index_name="catalog.schema.dashboards_search_idx",
    source_table_name="catalog.schema.dashboards_delta",  # espelho do Lakebase
    pipeline_type="TRIGGERED",        # ou CONTINUOUS para sync em tempo real
    primary_key="id",
    embedding_source_column="searchable_text",  # title + " " + description
    embedding_model_endpoint_name="databricks-gte-large-en",
)

# 3. Busca semântica durante o chat
embeddings = DatabricksEmbeddings(endpoint="databricks-gte-large-en")
store = DatabricksVectorSearch(
    endpoint="portal-dashboards-ep",
    index_name="catalog.schema.dashboards_search_idx",
    embedding=embeddings,
    text_column="searchable_text",
    columns=["id", "title", "url", "description", "folder_id"],
)

results = store.similarity_search("onde acho dados de vendas", k=5)
for doc in results:
    print(f"- {doc.metadata['title']} → {doc.metadata['url']}")
```

### Instalação
```bash
pip install databricks-vectorsearch databricks-langchain langchain
```

### Disponível no Azure: **SIM**

---

## 5. Mosaic AI Agent Framework

### O que é
Framework Databricks para criar, avaliar e fazer deploy de AI agents. Suporta LangChain, LangGraph, LlamaIndex e OpenAI Agents SDK. Integra Vector Search, Genie e Unity Catalog functions como ferramentas.

### Documentação oficial
- Criar agente: https://docs.databricks.com/aws/en/generative-ai/agent-framework/create-agent
- Unstructured data tools: https://docs.databricks.com/aws/en/generative-ai/agent-framework/unstructured-retrieval-tools
- Custom tools: https://docs.databricks.com/aws/en/generative-ai/agent-framework/create-custom-tool
- Capacidades: https://docs.databricks.com/aws/en/generative-ai/guide/mosaic-ai-gen-ai-capabilities
- Blog React + Mosaic Agents: https://www.databricks.com/blog/building-databricks-apps-react-and-mosaic-ai-agents-enterprise-chat-solutions

### Exemplo: agente com Vector Search + Genie como ferramentas
```python
from databricks_langchain import ChatDatabricks, VectorSearchRetrieverTool
from databricks_langchain.genie import GenieAgent

# Ferramenta 1: busca semântica em dashboards
dash_tool = VectorSearchRetrieverTool(
    index_name="catalog.schema.dashboards_search_idx",
    tool_name="search_dashboards",
    tool_description="Busca dashboards relevantes por título ou descrição.",
    columns=["title", "url", "description"],
)

# Ferramenta 2: Genie Space para análises SQL
genie = GenieAgent(
    genie_space_id=os.getenv("GENIE_SPACE_ID"),
    genie_agent_name="analise_dados",
)

llm = ChatDatabricks(endpoint="databricks-claude-sonnet-4-6")
agent = llm.bind_tools([dash_tool, genie])
```

### Managed MCP Servers (alternativa moderna)
```
# Genie via MCP
https://<host>/api/2.0/mcp/genie/{space_id}

# Vector Search via MCP
https://<host>/api/2.0/mcp/vector-search/{catalog}/{schema}/{index_name}

# UC Functions via MCP
https://<host>/api/2.0/mcp/functions/{catalog}/{schema}
```

### Quando usar o Agent Framework
- Precisar de raciocínio multi-step (ex: "quais vendas caíram e onde está o dashboard de causa raiz?")
- Querer compartilhar o agente entre apps via Model Serving
- Precisar de avaliação automática (MLflow AgentEval) e rastreamento

Para o MVP do portal, **não é necessário** — Foundation Model API + busca simples já atendem.

---

## 6. Databricks Apps + IA (Padrões)

### Documentação oficial
- Adicionar Genie Space ao App: https://docs.databricks.com/aws/en/dev-tools/databricks-apps/genie
- Template chatbot Next.js: https://github.com/databricks/app-templates/tree/main/e2e-chatbot-app-next
- Construir chat UI (Azure): https://learn.microsoft.com/en-us/azure/databricks/generative-ai/agent-framework/chat-app

### app.yml com recursos de IA
```yaml
command: ["gunicorn", "-b", "0.0.0.0:$DATABRICKS_APP_PORT", "run:app"]

resources:
  - name: genie-space
    genie_space:
      id: "<genie-space-id>"
  - name: sql-warehouse
    sql_warehouse:
      id: "<warehouse-id>"

env:
  - name: GENIE_SPACE_ID
    valueFrom: genie-space
  - name: DATABRICKS_WAREHOUSE_ID
    valueFrom: sql-warehouse
  - name: LLM_ENDPOINT
    value: "databricks-claude-sonnet-4-6"
```

### Padrão de autenticação no App
```python
from databricks.sdk import WorkspaceClient

# WorkspaceClient() sem parâmetros usa o service principal do App automaticamente
# Não precisa de DATABRICKS_TOKEN explícito quando rodando no Databricks App
w = WorkspaceClient()
```

---

## 7. Arquitetura Recomendada (3 Fases)

### Fase 1 — MVP (1–2 dias de implementação)

**Objetivo:** chat recomenda dashboards com base em busca por texto no Lakebase + LLM formata a resposta.

```
Usuário digita pergunta
        ↓
Flask POST /api/chat
        ↓
1. Busca no Lakebase (ILIKE ou tsvector full-text search nos campos title + description)
        ↓
2. Foundation Model API (Claude Sonnet) recebe:
   - System prompt: "Você ajuda a encontrar dashboards. Dados disponíveis: [JSON dos top-10]"
   - User message: pergunta original
        ↓
3. Resposta: texto em PT-BR com dashboards recomendados + links
```

**Código mínimo para o Flask:**
```python
# app/services/ai.py
from openai import OpenAI
import os, json

_client = None

def get_llm():
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=os.getenv("DATABRICKS_TOKEN"),
            base_url=f"{os.getenv('DATABRICKS_HOST')}/serving-endpoints",
        )
    return _client

def chat_recommend(question: str, dashboards: list) -> str:
    """Recebe pergunta + lista de dashboards do banco, retorna recomendação."""
    dash_json = json.dumps(
        [{"title": d["title"], "url": d["url"], "description": d.get("description", "")}
         for d in dashboards],
        ensure_ascii=False
    )
    resp = get_llm().chat.completions.create(
        model=os.getenv("LLM_ENDPOINT", "databricks-claude-sonnet-4-6"),
        messages=[
            {
                "role": "system",
                "content": (
                    "Você é um assistente do Portal de Dashboards BHub. "
                    "Analise a pergunta do usuário e recomende os dashboards mais relevantes "
                    "da lista abaixo. Inclua o link de cada recomendado. "
                    "Responda em português de forma clara e direta.\n\n"
                    f"Dashboards disponíveis:\n{dash_json}"
                ),
            },
            {"role": "user", "content": question},
        ],
        max_tokens=600,
    )
    return resp.choices[0].message.content
```

**Rota Flask:**
```python
# Em routes.py
@main.route("/api/chat", methods=["POST"])
def api_chat():
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403

    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    if not question:
        return jsonify({"ok": False, "error": "Pergunta é obrigatória"}), 400

    dashboards = get_all_dashboards()
    answer = chat_recommend(question, dashboards)
    return jsonify({"ok": True, "data": {"answer": answer}})
```

---

### Fase 2 — Busca Semântica com RAG (1–2 semanas)

**Objetivo:** "vendas" deve encontrar dashboards que mencionem "receita", "faturamento", "NPS de clientes" — busca por significado, não por texto exato.

**Pré-requisito:** sincronizar tabela `dashboards` do Lakebase para uma tabela Delta no Unity Catalog (via job agendado ou Lakebase Federation).

```
Usuário digita pergunta
        ↓
1. Embedding da pergunta (databricks-gte-large-en, 1024 dims)
        ↓
2. Vector Search similarity_search (top-5 dashboards mais similares)
        ↓
3. Foundation Model API com os 5 resultados no contexto
        ↓
4. Resposta formatada com links
```

**Dependências adicionais:**
```
databricks-vectorsearch==0.x
databricks-langchain==0.x
langchain==0.x
```

---

### Fase 3 — Análises SQL com Genie (2–4 semanas)

**Objetivo:** o chat consegue responder "qual foi a receita de abril?" executando SQL real nas tabelas de negócio.

**Pré-requisito:** criar um Genie Space com as tabelas relevantes no Unity Catalog.

```
Usuário digita pergunta
        ↓
LLM classifica intenção:
  ├─ "find_dashboard" → Fase 2 (busca semântica)
  └─ "analyze_data"   → Genie Conversation API
                              ↓
                        Genie traduz para SQL, executa no warehouse
                              ↓
                        Retorna texto + SQL gerado + dados tabulares
```

**⚠️ Por que usar Genie e não gerar SQL direto com o LLM?**
Gerar SQL com LLM e executar diretamente = risco alto (injection, queries pesadas sem LIMIT, schema desconhecido). Genie tem guard-rails nativos: só acessa tabelas autorizadas no Space, adiciona LIMIT automático, valida schema.

Reserve a **SQL Statement Execution API** para queries **fixas pré-definidas** (ex: KPIs cadastrados pelo admin do portal).

---

## 8. Variáveis de Ambiente Necessárias

```env
# Já existentes
DATABRICKS_HOST=https://adb-xxx.azuredatabricks.net
DATABRICKS_CLIENT_ID=xxx
DATABRICKS_CLIENT_SECRET=xxx

# Fase 1 (adicionar)
LLM_ENDPOINT=databricks-claude-sonnet-4-6
# DATABRICKS_TOKEN é gerado automaticamente pelo Databricks App via SDK

# Fase 3 (adicionar)
GENIE_SPACE_ID=xxx          # ID do Genie Space criado no workspace
DATABRICKS_WAREHOUSE_ID=xxx # ID do SQL Warehouse

# Fase 2 (adicionar)
VECTOR_SEARCH_ENDPOINT=portal-dashboards-ep
VECTOR_SEARCH_INDEX=catalog.schema.dashboards_search_idx
```

---

## 9. Tabela Comparativa

| Tecnologia | Caso de uso | Esforço | Custo | Azure | Fase |
|---|---|---|---|---|---|
| **Foundation Model APIs** | Chat LLM genérico, recomendação | Muito baixo | DBU/token | ✅ | 1 |
| **SQL Statement Execution** | Queries fixas via REST | Baixo | DBU do warehouse | ✅ | 1 |
| **Vector Search** | Busca semântica (RAG) em metadados | Médio | Endpoint/hora + queries | ✅ | 2 |
| **Genie Conversation API** | NL→SQL gerenciado com guard-rails | Médio | DBU do warehouse | ✅ | 3 |
| **Mosaic AI Agent Framework** | Agente multi-tool, multi-step | Alto | Compute + LLM | ✅ | Futuro |
| **Model Serving (custom)** | Deploy de agente próprio como endpoint | Alto | Compute serverless | ✅ | Futuro |

---

## 10. Fontes Completas

### Genie Conversation API
- https://docs.databricks.com/aws/en/genie/conversation-api
- https://learn.microsoft.com/en-us/azure/databricks/genie/conversation-api
- https://docs.databricks.com/api/workspace/genie
- https://www.databricks.com/blog/genie-conversation-apis-public-preview
- https://docs.databricks.com/aws/en/dev-tools/databricks-apps/genie

### Foundation Model APIs
- https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/
- https://learn.microsoft.com/en-us/azure/databricks/machine-learning/foundation-model-apis/
- https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/supported-models
- https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/api-reference
- https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/limits
- https://www.databricks.com/product/pricing/foundation-model-serving
- https://docs.databricks.com/aws/en/machine-learning/model-serving/query-chat-models

### SQL Statement Execution API
- https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial
- https://learn.microsoft.com/en-us/azure/databricks/dev-tools/sql-execution-tutorial
- https://docs.databricks.com/api/workspace/statementexecution

### Vector Search
- https://docs.databricks.com/aws/en/vector-search/vector-search
- https://learn.microsoft.com/en-us/azure/databricks/vector-search/vector-search
- https://docs.databricks.com/aws/en/generative-ai/retrieval-augmented-generation
- https://docs.langchain.com/oss/python/integrations/vectorstores/databricks_vector_search

### Mosaic AI Agent Framework
- https://docs.databricks.com/aws/en/generative-ai/agent-framework/create-agent
- https://docs.databricks.com/aws/en/generative-ai/agent-framework/unstructured-retrieval-tools
- https://docs.databricks.com/aws/en/generative-ai/agent-framework/create-custom-tool
- https://docs.databricks.com/aws/en/generative-ai/guide/mosaic-ai-gen-ai-capabilities

### Databricks Apps + Chat UI
- https://docs.databricks.com/aws/en/dev-tools/databricks-apps/genie
- https://learn.microsoft.com/en-us/azure/databricks/generative-ai/agent-framework/chat-app
- https://github.com/databricks/app-templates/tree/main/e2e-chatbot-app-next
- https://www.databricks.com/blog/building-databricks-apps-react-and-mosaic-ai-agents-enterprise-chat-solutions

### LangChain + Databricks
- https://docs.langchain.com/oss/python/integrations/chat/databricks
- https://docs.langchain.com/oss/python/integrations/vectorstores/databricks_vector_search
