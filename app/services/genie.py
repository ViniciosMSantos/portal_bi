import os
import re
import time
import requests as _requests
from databricks import sdk as _sdk

_WC = None
_SPACE_ID_CACHE = None


def _get_client():
    global _WC
    if _WC is None:
        _WC = _sdk.WorkspaceClient()
    return _WC


def _space_id():
    global _SPACE_ID_CACHE
    if _SPACE_ID_CACHE:
        return _SPACE_ID_CACHE

    # 1. Env vars — for local dev or manual configuration
    sid = (
        os.getenv("GENIE_SPACE_SPACE_ID", "").strip()
        or os.getenv("GENIE_SPACE_ID", "").strip()
        or os.getenv("GENIE_ESPACE_ID", "").strip()
    )

    # 2. Read from app.yml — Databricks does not inject env vars for genie_space resources
    if not sid:
        try:
            yml_path = os.path.normpath(
                os.path.join(os.path.dirname(__file__), "..", "..", "app.yml")
            )
            with open(yml_path) as f:
                content = f.read()
            match = re.search(
                r"genie_space:\s*\n\s*id:\s*[\"']?([0-9a-f\-]+)[\"']?", content
            )
            if match:
                sid = match.group(1).strip()
        except Exception:
            pass

    if not sid:
        raise RuntimeError(
            "Genie Space ID not found. "
            "Add the 'genie-space' resource in app.yml or set GENIE_ESPACE_ID in .env."
        )

    _SPACE_ID_CACHE = sid
    return sid


def _do(w, method, path, body=None):
    """Call Databricks API with SDK auth. GET requests omit Content-Type."""
    host = w.config.host.rstrip("/")
    url = f"{host}{path}"
    auth_headers = w.config.authenticate()

    if method.upper() == "GET":
        headers = {**auth_headers}
    else:
        headers = {**auth_headers, "Content-Type": "application/json"}

    resp = _requests.request(
        method, url, json=body, headers=headers,
        timeout=30, allow_redirects=False,
    )

    if resp.is_redirect:
        raise RuntimeError(
            f"Genie redirect {resp.status_code} → {resp.headers.get('Location', '?')} | url={url}"
        )
    if not resp.ok:
        raise RuntimeError(f"Genie HTTP {resp.status_code} | url={url} | {resp.text[:300]}")

    text = resp.text.strip().lstrip('﻿')
    if text.startswith("<"):
        ct = resp.headers.get("Content-Type", "")
        raise RuntimeError(
            f"Genie HTML {resp.status_code} ({ct}) | url={url} | {text[:300]}"
        )
    return resp.json()


def _extract_results(w, space, conv_id, msg_id, msg_data):
    answer_text = ""
    query_description = ""
    has_query = False

    for att in msg_data.get("attachments") or []:
        if "text" in att:
            answer_text = att["text"].get("content", "")
        if "query" in att:
            has_query = True
            query_description = att["query"].get("description", "")

    columns = []
    rows = []
    if has_query:
        try:
            qr = _do(w, "GET",
                f"/api/2.0/genie/spaces/{space}/conversations/{conv_id}/messages/{msg_id}/query-result")
            manifest = (
                qr.get("statement_response", {})
                .get("manifest", {})
                .get("schema", {})
                .get("columns") or []
            )
            data_array = (
                qr.get("statement_response", {})
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
        except Exception:
            pass

    return {
        "answer": answer_text,
        "query_description": query_description,
        "columns": columns,
        "rows": rows,
    }


def query(message, conversation_id=None, timeout=270):
    w = _get_client()
    space = _space_id()

    if conversation_id:
        body = _do(w, "POST",
            f"/api/2.0/genie/spaces/{space}/conversations/{conversation_id}/messages",
            body={"content": message})
        msg_id = body.get("id") or body.get("message_id")
        conv_id = conversation_id
    else:
        body = _do(w, "POST",
            f"/api/2.0/genie/spaces/{space}/start-conversation",
            body={"content": message})
        conv_id = body.get("conversation_id") or (body.get("conversation") or {}).get("id", "")
        nested_msg = body.get("message") or {}
        msg_id = nested_msg.get("id") or body.get("message_id")
        if not msg_id:
            raise RuntimeError(f"Genie: no message_id in start-conversation response. Keys: {list(body.keys())}")
        if nested_msg.get("status") == "COMPLETED":
            result = _extract_results(w, space, conv_id, msg_id, nested_msg)
            result["conversation_id"] = conv_id
            return result

    # Poll until completed or timeout
    terminal = {"COMPLETED", "FAILED", "CANCELLED", "QUERY_RESULT_EXPIRED"}
    deadline = time.time() + timeout
    msg_data = {}

    while time.time() < deadline:
        time.sleep(3)
        msg_data = _do(w, "GET",
            f"/api/2.0/genie/spaces/{space}/conversations/{conv_id}/messages/{msg_id}")
        if msg_data.get("status") in terminal:
            break

    if msg_data.get("status") != "COMPLETED":
        raise RuntimeError(f"Genie status: {msg_data.get('status', 'timeout')}")

    result = _extract_results(w, space, conv_id, msg_id, msg_data)
    result["conversation_id"] = conv_id
    return result
