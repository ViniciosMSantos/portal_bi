import os
from flask import Blueprint, render_template, redirect, url_for, request, jsonify
from app.services.databricks import (
    get_user, has_pending_request, create_access_request, ensure_user,
    create_folder, get_all_folders, create_dashboard, get_all_dashboards,
    get_all_users, update_user, get_pending_requests, approve_request, reject_request,
)

main = Blueprint("main", __name__)


def _email():
    return (
        request.headers.get("X-Forwarded-Email")
        or os.getenv("DEV_USER_EMAIL", "usuario@bhub.ai")
    )


def _check_access():
    email = _email()
    user = get_user(email)

    if user is None or not user["is_active"]:
        if has_pending_request(email):
            return redirect(url_for("main.pending"))
        return redirect(url_for("main.request_access"))

    return None


@main.route("/")
def home():
    block = _check_access()
    if block:
        return block
    return render_template("index.html")


@main.route("/dashboard")
def dashboard():
    block = _check_access()
    if block:
        return block
    return render_template("dashboard.html")


@main.route("/solicitar-acesso", methods=["GET", "POST"])
def request_access():
    email = _email()
    user = get_user(email)

    if user and user["is_active"]:
        return redirect(url_for("main.home"))

    if has_pending_request(email):
        return redirect(url_for("main.pending"))

    if request.method == "POST":
        name = request.form.get("name", "").strip()
        message = request.form.get("message", "").strip()

        if not name:
            return render_template("request.html", error="Por favor, informe seu nome.")

        ensure_user(email, name)
        create_access_request(email, name, message)
        return redirect(url_for("main.pending"))

    return render_template("request.html")


@main.route("/api/folders", methods=["GET", "POST"])
def api_folders():
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403

    if request.method == "GET":
        return jsonify({"ok": True, "data": {
            "folders": get_all_folders(),
            "dashboards": get_all_dashboards(),
        }})

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    desc = (data.get("description") or "").strip()
    parent_id = (data.get("parent_id") or "").strip() or None

    if not name:
        return jsonify({"ok": False, "error": "Nome da pasta é obrigatório"}), 400

    folder = create_folder(name, desc, parent_id=parent_id)
    return jsonify({"ok": True, "data": folder})


@main.route("/api/dashboards", methods=["POST"])
def api_create_dashboard():
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403

    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    url = (data.get("url") or "").strip()
    link_type = (data.get("link_type") or "DASHBOARD").strip().upper()
    description = (data.get("description") or "").strip()
    folder_id = (data.get("folder_id") or "").strip() or None

    if not title:
        return jsonify({"ok": False, "error": "Título é obrigatório"}), 400
    if not url:
        return jsonify({"ok": False, "error": "URL é obrigatória"}), 400
    if not folder_id:
        return jsonify({"ok": False, "error": "Pasta é obrigatória"}), 400
    if link_type not in ("DASHBOARD", "GITHUB", "N8N", "OTHER"):
        link_type = "DASHBOARD"

    dashboard = create_dashboard(title=title, url=url, link_type=link_type, description=description, folder_id=folder_id)
    return jsonify({"ok": True, "data": dashboard})


@main.route("/api/users", methods=["GET"])
def api_users():
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403
    return jsonify({"ok": True, "data": get_all_users()})


@main.route("/api/users/<path:email>", methods=["PUT"])
def api_update_user(email):
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403
    data = request.get_json(silent=True) or {}
    allowed = {"is_active", "role", "name", "tags"}
    kwargs = {k: v for k, v in data.items() if k in allowed}
    if not kwargs:
        return jsonify({"ok": False, "error": "Nenhum campo válido"}), 400
    update_user(email, **kwargs)
    return jsonify({"ok": True})


@main.route("/api/requests", methods=["GET"])
def api_requests():
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403
    return jsonify({"ok": True, "data": get_pending_requests()})


@main.route("/api/requests/<req_id>/approve", methods=["POST"])
def api_approve_request(req_id):
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403
    data = request.get_json(silent=True) or {}
    approve_request(req_id, _email(), data.get("tags", []))
    return jsonify({"ok": True})


@main.route("/api/requests/<req_id>/reject", methods=["POST"])
def api_reject_request(req_id):
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403
    data = request.get_json(silent=True) or {}
    reject_request(req_id, _email(), data.get("note", ""))
    return jsonify({"ok": True})


@main.route("/aguardando")
def pending():
    email = _email()
    user = get_user(email)

    if user and user["is_active"]:
        return redirect(url_for("main.home"))

    if not has_pending_request(email):
        return redirect(url_for("main.request_access"))

    return render_template("pending.html")
