import os
import time
import requests

_HOST = None
_SPACE_ID = None


def _host():
    # Retorna a URL base do workspace Databricks (singleton, normalizado com https://).
    global _HOST
    if _HOST is None:
        _HOST = os.getenv("DATABRICKS_HOST", "").rstrip("/")
        if not _HOST.startswith("http"):
            _HOST = f"https://{_HOST}"
    return _HOST


def _space_id():
    # Retorna o ID do Genie Space configurado via GENIE_ESPACE_ID (singleton).
    global _SPACE_ID
    if _SPACE_ID is None:
        _SPACE_ID = os.getenv("GENIE_ESPACE_ID", "")
    return _SPACE_ID


def _get_token():
    # Obtém token de autenticação: usa DATABRICKS_TOKEN (PAT) se disponível, caso contrário faz OAuth client_credentials.
    pat = os.getenv("DATABRICKS_TOKEN")
    if pat:
        return pat
    resp = requests.post(
        f"{_host()}/oidc/v1/token",
        data={
            "grant_type": "client_credentials",
            "scope": os.getenv("DATABRICKS_OAUTH_SCOPE", "all-apis"),
        },
        auth=(os.getenv("DATABRICKS_CLIENT_ID"), os.getenv("DATABRICKS_CLIENT_SECRET")),
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def _headers(token):
    # Monta os headers HTTP com Authorization Bearer para chamadas à API Genie.
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _poll_message(host, space, conv_id, msg_id, headers, timeout=90):
    # Faz polling até a mensagem ficar COMPLETED ou atingir o timeout. Retorna dados da mensagem e URL base.
    msg_url = f"{host}/api/2.0/genie/spaces/{space}/conversations/{conv_id}/messages/{msg_id}"
    deadline = time.time() + timeout
    msg_data = {}
    status = ""

    while status not in ("COMPLETED", "FAILED", "CANCELLED", "QUERY_RESULT_EXPIRED") and time.time() < deadline:
        time.sleep(1.5)
        pr = requests.get(msg_url, headers=headers, timeout=15)
        pr.raise_for_status()
        msg_data = pr.json()
        status = msg_data.get("status", "")

    if status != "COMPLETED":
        raise RuntimeError(f"Genie status: {status}")

    return msg_data, msg_url


def _extract_results(msg_data, msg_url, headers):
    # Extrai o texto da resposta e, se houver query, busca os dados tabulares via /query-result.
    answer_text = ""
    query_description = ""
    has_query = False

    for att in msg_data.get("attachments") or []:
        if "text" in att:
            answer_text = att["text"].get("content", "")
        if "query" in att:
            has_query = True
            query_description = att["query"].get("description", "")

    rows = []
    columns = []
    if has_query:
        qr = requests.get(f"{msg_url}/query-result", headers=headers, timeout=15)
        if qr.ok:
            qr_body = qr.json()
            manifest = (
                qr_body.get("statement_response", {})
                .get("manifest", {})
                .get("schema", {})
                .get("columns") or []
            )
            data_array = (
                qr_body.get("statement_response", {})
                .get("result", {})
                .get("data_typed_array") or []
            )
            columns = [c.get("name", "") for c in manifest]
            for row in data_array:
                values = [
                    v.get("str", "") if isinstance(v, dict) else str(v or "")
                    for v in (row.get("values") or [])
                ]
                rows.append(dict(zip(columns, values)))

    return {
        "answer": answer_text,
        "query_description": query_description,
        "columns": columns,
        "rows": rows,
    }


def query(message, conversation_id=None, timeout=90):
    # Ponto de entrada público. Envia mensagem ao Genie, aguarda resposta e retorna answer + dados + conversation_id.
    token = _get_token()
    host = _host()
    space = _space_id()
    h = _headers(token)

    if conversation_id:
        # Continue existing conversation
        r = requests.post(
            f"{host}/api/2.0/genie/spaces/{space}/conversations/{conversation_id}/messages",
            json={"content": message},
            headers=h,
            timeout=15,
        )
        r.raise_for_status()
        body = r.json()
        msg_id = body.get("id") or body.get("message_id") or body["id"]
        conv_id = conversation_id
    else:
        # Start new conversation
        r = requests.post(
            f"{host}/api/2.0/genie/spaces/{space}/start-conversation",
            json={"content": message},
            headers=h,
            timeout=15,
        )
        r.raise_for_status()
        body = r.json()
        conv_id = body["conversation_id"]
        msg_id = body["message"]["id"]

        # Check if already completed on start
        initial_status = body["message"].get("status", "")
        if initial_status == "COMPLETED":
            result = _extract_results(body["message"],
                f"{host}/api/2.0/genie/spaces/{space}/conversations/{conv_id}/messages/{msg_id}", h)
            result["conversation_id"] = conv_id
            return result

    msg_data, msg_url = _poll_message(host, space, conv_id, msg_id, h, timeout)
    result = _extract_results(msg_data, msg_url, h)
    result["conversation_id"] = conv_id
    return result
