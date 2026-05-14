import os
import time
import requests
from databricks import sdk as _sdk

_HOST = None
_WC = None
_SPACE_ID_CACHE = None


def _host():
    # Returns the Databricks workspace base URL (singleton, normalized with https://).
    global _HOST
    if _HOST is None:
        _HOST = os.getenv("DATABRICKS_HOST", "").rstrip("/")
        if not _HOST.startswith("http"):
            _HOST = f"https://{_HOST}"
    return _HOST


def _space_id():
    global _SPACE_ID_CACHE
    if _SPACE_ID_CACHE:
        return _SPACE_ID_CACHE

    # Try all known naming variants injected by Databricks Apps
    sid = (
        os.getenv("GENIE_SPACE_SPACE_ID", "").strip()
        or os.getenv("GENIE_SPACE_ID", "").strip()
        or os.getenv("GENIE_ESPACE_ID", "").strip()
    )

    if not sid:
        # Log available env vars to help diagnose the correct variable name
        genie_vars = {k: v for k, v in os.environ.items() if "GENIE" in k or "SPACE" in k}
        raise RuntimeError(
            f"Genie Space ID not found. "
            f"Env vars with GENIE/SPACE: {genie_vars or 'none found'}. "
            f"Declare the 'genie-space' resource in app.yml or set GENIE_ESPACE_ID in .env."
        )

    _SPACE_ID_CACHE = sid
    return sid


def _get_token():
    # Uses the Databricks SDK WorkspaceClient — works automatically in Databricks Apps
    # (metadata-service / databricks-apps auth) and locally without needing CLIENT_SECRET.
    global _WC
    if _WC is None:
        _WC = _sdk.WorkspaceClient()
    auth_headers = _WC.config.authenticate()
    auth = auth_headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    raise RuntimeError("Could not obtain token via Databricks SDK")


def _headers(token):
    # Builds HTTP headers with Bearer Authorization for Genie API calls.
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _poll_message(host, space, conv_id, msg_id, headers, timeout=90):
    # Polls until the message is COMPLETED or the timeout is reached. Returns message data and base URL.
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
    # Extracts the response text and, if a query exists, fetches tabular data via /query-result.
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
    # Public entry point. Sends a message to Genie, waits for the response, and returns answer + data + conversation_id.
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
