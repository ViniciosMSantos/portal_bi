import os
from flask import Blueprint, render_template, redirect, url_for, request, jsonify
from app.services.databricks import (
    get_user, has_pending_request, create_access_request, ensure_user,
    create_folder, get_all_folders, get_accessible_folders, create_dashboard, get_all_dashboards,
    get_accessible_dashboards,
    get_all_users, update_user, get_pending_requests, approve_request, reject_request,
    get_all_tags, create_tag, update_tag, delete_tag,
    get_individual_access, sync_individual_access,
)

main = Blueprint("main", __name__)


def _email():
    # Lê o email do usuário logado do header injetado pelo Databricks Apps ou da env DEV_USER_EMAIL em dev.
    return (
        request.headers.get("X-Forwarded-Email")
        or os.getenv("DEV_USER_EMAIL", "usuario@bhub.ai")
    )


def _check_access():
    # Verifica se o usuário tem acesso ativo. Redireciona para /solicitar-acesso ou /aguardando se não tiver.
    email = _email()
    user = get_user(email)

    if user is None or not user["is_active"]:
        if has_pending_request(email):
            return redirect(url_for("main.pending"))
        return redirect(url_for("main.request_access"))

    return None


@main.route("/")
def home():
    # Rota principal — renderiza index.html se o usuário tiver acesso ativo.
    block = _check_access()
    if block:
        return block
    return render_template("index.html")


@main.route("/dashboard")
def dashboard():
    # Rota do painel de configuração — renderiza dashboard.html.
    block = _check_access()
    if block:
        return block
    return render_template("dashboard.html")


@main.route("/solicitar-acesso", methods=["GET", "POST"])
def request_access():
    # GET: exibe formulário de solicitação. POST: cria o usuário e a solicitação, redireciona para /aguardando.
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
    # GET: lista todas as pastas e dashboards. POST: cria uma nova pasta.
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403

    if request.method == "GET":
        email = _email()
        return jsonify({"ok": True, "data": {
            "folders": get_accessible_folders(email),
            "dashboards": get_accessible_dashboards(email),
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
    # Cria um novo dashboard com título, URL, tipo, pasta, descrição e documentação.
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403

    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    url = (data.get("url") or "").strip()
    link_type = (data.get("link_type") or "DASHBOARD").strip().upper()
    description = (data.get("description") or "").strip()
    documentation = (data.get("documentation") or "").strip()
    folder_id = (data.get("folder_id") or "").strip() or None

    if not title:
        return jsonify({"ok": False, "error": "Título é obrigatório"}), 400
    if not url:
        return jsonify({"ok": False, "error": "URL é obrigatória"}), 400
    if not folder_id:
        return jsonify({"ok": False, "error": "Pasta é obrigatória"}), 400
    if link_type not in ("DASHBOARD", "GITHUB", "N8N", "OTHER"):
        link_type = "DASHBOARD"

    dashboard = create_dashboard(
        title=title, url=url, link_type=link_type,
        description=description, documentation=documentation, folder_id=folder_id,
    )
    return jsonify({"ok": True, "data": dashboard})


@main.route("/api/users", methods=["GET"])
def api_users():
    # Lista todos os usuários para o painel de configuração.
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403
    return jsonify({"ok": True, "data": get_all_users()})


@main.route("/api/users/<path:email>", methods=["PUT"])
def api_update_user(email):
    # Atualiza campos permitidos de um usuário: is_active, role, name, tags, ia_enabled.
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403
    data = request.get_json(silent=True) or {}
    allowed = {"is_active", "role", "name", "tags", "ia_enabled"}
    kwargs = {k: v for k, v in data.items() if k in allowed}
    if not kwargs:
        return jsonify({"ok": False, "error": "Nenhum campo válido"}), 400
    update_user(email, **kwargs)
    return jsonify({"ok": True})


@main.route("/api/requests", methods=["GET"])
def api_requests():
    # Lista solicitações de acesso pendentes.
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403
    return jsonify({"ok": True, "data": get_pending_requests()})


@main.route("/api/requests/<req_id>/approve", methods=["POST"])
def api_approve_request(req_id):
    # Aprova uma solicitação de acesso, opcionalmente atribuindo tags ao novo usuário.
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403
    data = request.get_json(silent=True) or {}
    approve_request(req_id, _email(), data.get("tags", []))
    return jsonify({"ok": True})


@main.route("/api/requests/<req_id>/reject", methods=["POST"])
def api_reject_request(req_id):
    # Rejeita uma solicitação de acesso com nota opcional.
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403
    data = request.get_json(silent=True) or {}
    reject_request(req_id, _email(), data.get("note", ""))
    return jsonify({"ok": True})


@main.route("/api/tags", methods=["GET", "POST"])
def api_tags():
    # GET: lista todas as tags. POST: cria uma nova tag com nome, descrição e cor.
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403

    if request.method == "GET":
        return jsonify({"ok": True, "data": get_all_tags()})

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    description = (data.get("description") or "").strip()
    color = (data.get("color") or "#1B2CC1").strip()

    if not name:
        return jsonify({"ok": False, "error": "Nome da tag é obrigatório"}), 400

    tag_id = create_tag(name, description, color)
    return jsonify({"ok": True, "data": {"id": tag_id}})


@main.route("/api/tags/<tag_id>", methods=["PUT", "DELETE"])
def api_tag(tag_id):
    # PUT: atualiza nome, descrição e/ou cor de uma tag. DELETE: remove a tag.
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403

    if request.method == "DELETE":
        delete_tag(tag_id)
        return jsonify({"ok": True})

    data = request.get_json(silent=True) or {}
    allowed = {"name", "description", "color", "dashboard_ids", "folder_ids"}
    kwargs = {k: v for k, v in data.items() if k in allowed}
    if not kwargs:
        return jsonify({"ok": False, "error": "Nenhum campo válido"}), 400
    update_tag(tag_id, **kwargs)
    return jsonify({"ok": True})


@main.route("/api/users/<path:email>/access", methods=["GET", "PUT"])
def api_user_access(email):
    # GET: retorna tags e dashboards individuais do usuário. PUT: atualiza tags e acesso individual.
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403

    if request.method == "GET":
        user = get_user(email)
        if not user:
            return jsonify({"ok": False, "error": "Usuário não encontrado"}), 404
        return jsonify({"ok": True, "data": {
            "tags": user.get("tags", []),
            "individual_dashboards": get_individual_access(email),
        }})

    data = request.get_json(silent=True) or {}
    tags = data.get("tags", [])
    dashboard_ids = list(data.get("dashboard_ids", []))
    folder_ids = data.get("folder_ids", [])

    # Resolve pastas → dashboards individuais
    if folder_ids:
        for d in get_all_dashboards():
            if d.get("folder_id") in folder_ids and d["id"] not in dashboard_ids:
                dashboard_ids.append(d["id"])

    update_user(email, tags=tags)
    sync_individual_access(email, dashboard_ids, _email())
    return jsonify({"ok": True})


@main.route("/api/genie/query", methods=["POST"])
def api_genie_query():
    # Envia uma mensagem ao Genie e retorna a resposta em texto. Mantém contexto via conversation_id.
    block = _check_access()
    if block:
        return jsonify({"ok": False, "error": "Sem acesso"}), 403
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"ok": False, "error": "Mensagem vazia"}), 400
    try:
        from app.services.genie import query as genie_query
        conversation_id = (data.get("conversation_id") or "").strip() or None
        result = genie_query(message, conversation_id=conversation_id)
        return jsonify({"ok": True, "data": result})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@main.route("/aguardando")
def pending():
    # Exibe página de aguardando aprovação. Redireciona se o usuário já foi aprovado ou não tem solicitação.
    email = _email()
    user = get_user(email)

    if user and user["is_active"]:
        return redirect(url_for("main.home"))

    if not has_pending_request(email):
        return redirect(url_for("main.request_access"))

    return render_template("pending.html")
