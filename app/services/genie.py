import os
import re
import time
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


def _extract_results(w, space, conv_id, msg_id, msg_data):
    answer_text = ""
    query_description = ""
    has_query = False

    for att in getattr(msg_data, "attachments", None) or []:
        if getattr(att, "text", None):
            answer_text = getattr(att.text, "content", "") or ""
        if getattr(att, "query", None):
            has_query = True
            query_description = getattr(att.query, "description", "") or ""

    columns = []
    rows = []
    if has_query:
        try:
            qr = w.genie.get_message_query_result(space, conv_id, msg_id)
            stmt = getattr(qr, "statement_response", None)
            if stmt:
                manifest_cols = (
                    getattr(getattr(getattr(stmt, "manifest", None), "schema", None), "columns", None) or []
                )
                data_array = (
                    getattr(getattr(stmt, "result", None), "data_typed_array", None) or []
                )
                columns = [getattr(c, "name", "") for c in manifest_cols]
                for row in data_array:
                    values = [
                        getattr(v, "str", "") or ""
                        for v in (getattr(row, "values", None) or [])
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


def query(message, conversation_id=None, timeout=90):
    w = _get_client()
    space = _space_id()

    if conversation_id:
        msg = w.genie.create_message(space, conversation_id, content=message)
        conv_id = conversation_id
        msg_id = msg.id
    else:
        resp = w.genie.start_conversation(space, content=message)
        conv_id = resp.conversation_id
        msg_id = resp.message.id
        if getattr(resp.message, "status", "") == "COMPLETED":
            result = _extract_results(w, space, conv_id, msg_id, resp.message)
            result["conversation_id"] = conv_id
            return result

    # Poll until completed or timeout
    terminal = {"COMPLETED", "FAILED", "CANCELLED", "QUERY_RESULT_EXPIRED"}
    deadline = time.time() + timeout
    msg_data = None

    while time.time() < deadline:
        time.sleep(1.5)
        msg_data = w.genie.get_message(space, conv_id, msg_id)
        if getattr(msg_data, "status", "") in terminal:
            break

    status = getattr(msg_data, "status", "timeout") if msg_data else "timeout"
    if status != "COMPLETED":
        raise RuntimeError(f"Genie status: {status}")

    result = _extract_results(w, space, conv_id, msg_id, msg_data)
    result["conversation_id"] = conv_id
    return result
