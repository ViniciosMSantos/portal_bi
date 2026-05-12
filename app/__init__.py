import os
from flask import Flask, request

def create_app():
    app = Flask(__name__)
    app.secret_key = os.getenv("SECRET_KEY", "dev-secret-bhub-change-in-prod")

    from .routes import main
    app.register_blueprint(main)

    _ROLE_LABELS = {
        "USER": "Usuário",
        "BA": "Analista",
        "MANAGER": "Gerente",
        "ADMIN": "Administrador",
    }

    @app.context_processor
    def inject_current_user():
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
        return {"current_user": {"email": email, "initials": initials, "role": role, "is_admin": is_admin}}

    return app