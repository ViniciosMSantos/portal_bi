import os
from flask import Flask, request, jsonify

def create_app():
    # Factory principal do Flask. Registra blueprint, roda migrations e define context_processor e error handlers.
    app = Flask(__name__)
    app.secret_key = os.getenv("SECRET_KEY", "dev-secret-bhub-change-in-prod")

    from .routes import main
    app.register_blueprint(main)

    try:
        from app.services.databricks import init_database
        init_database()
    except Exception:
        pass

    _ROLE_LABELS = {
        "USER": "Usuário",
        "BA": "Analista",
        "MANAGER": "Gerente",
        "ADMIN": "Administrador",
    }

    @app.context_processor
    def inject_current_user():
        # Injeta current_user em todos os templates. Lê email do header X-Forwarded-Email
        # (Databricks Apps) ou DEV_USER_EMAIL em dev local.
        from app.services.databricks import get_user
        email = (
            request.headers.get("X-Forwarded-Email")
            or os.getenv("DEV_USER_EMAIL", "usuario@bhub.ai")
        )
        parts = email.split("@")[0].replace(".", " ").replace("_", " ").split()
        initials = (parts[0][0] + parts[-1][0]).upper() if len(parts) > 1 else parts[0][:2].upper()
        role = "Usuário"
        raw_role = "USER"
        try:
            db_user = get_user(email)
            if db_user:
                raw_role = db_user["role"]
                role = _ROLE_LABELS.get(raw_role, "Usuário")
        except Exception:
            pass
        is_admin = raw_role in ("ADMIN", "MANAGER")
        ia_enabled = is_admin or bool(db_user and db_user.get("ia_enabled"))
        return {"current_user": {"email": email, "initials": initials, "role": role, "is_admin": is_admin, "ia_enabled": ia_enabled}}

    @app.errorhandler(404)
    def not_found(e):
        # Retorna JSON para rotas /api/ em vez do HTML padrão do Flask.
        if request.path.startswith("/api/"):
            return jsonify({"ok": False, "error": "Rota não encontrada"}), 404
        return e

    @app.errorhandler(500)
    def internal_error(e):
        # Retorna JSON para rotas /api/ em vez do HTML padrão do Flask.
        if request.path.startswith("/api/"):
            return jsonify({"ok": False, "error": "Erro interno do servidor"}), 500
        return e

    @app.errorhandler(Exception)
    def unhandled_exception(e):
        # Captura exceções não tratadas. Para /api/ retorna JSON; para páginas relança a exceção.
        if request.path.startswith("/api/"):
            return jsonify({"ok": False, "error": str(e)}), 500
        raise e

    return app