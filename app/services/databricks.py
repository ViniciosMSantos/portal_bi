import os
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv

# app/services/databricks.py → services/ → app/ → project root
_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv(os.path.join(_root, ".env"))

# VS Code Databricks Extension mantém DATABRICKS_AUTH_TYPE=metadata-service aqui
_db_env = os.path.join(_root, ".databricks", ".databricks.env")
if os.path.exists(_db_env):
    load_dotenv(_db_env, override=True)

import psycopg
from psycopg import sql
from psycopg_pool import ConnectionPool
from databricks import sdk

_workspace_client = None
_pool = None


def _wc():
    global _workspace_client
    if _workspace_client is None:
        _workspace_client = sdk.WorkspaceClient()
    return _workspace_client


class _OAuthConnection(psycopg.Connection):
    @classmethod
    def connect(cls, conninfo="", **kwargs):
        import requests as _req
        pat = os.getenv("DATABRICKS_TOKEN")
        if pat:
            kwargs["password"] = pat
            return super().connect(conninfo, **kwargs)
        host = os.getenv("DATABRICKS_HOST", "").rstrip("/")
        if not host.startswith("http"):
            host = f"https://{host}"
        resp = _req.post(
            f"{host}/oidc/v1/token",
            data={
                "grant_type": "client_credentials",
                "scope": os.getenv("DATABRICKS_OAUTH_SCOPE", "all-apis"),
            },
            auth=(os.getenv("DATABRICKS_CLIENT_ID"), os.getenv("DATABRICKS_CLIENT_SECRET")),
        )
        resp.raise_for_status()
        kwargs["password"] = resp.json()["access_token"]
        return super().connect(conninfo, **kwargs)


def get_pool():
    global _pool
    if _pool is None:
        conn_string = (
            f"dbname={os.getenv('PGDATABASE')} "
            f"user={os.getenv('PGUSER')} "
            f"host={os.getenv('PGHOST')} "
            f"port={os.getenv('PGPORT')} "
            f"sslmode={os.getenv('PGSSLMODE')} "
            f"application_name={os.getenv('PGAPPNAME')}"
        )
        _pool = ConnectionPool(
            conn_string,
            connection_class=_OAuthConnection,
            min_size=int(os.getenv("PGPOOL_MIN", "2")),
            max_size=int(os.getenv("PGPOOL_MAX", "10")),
        )
    return _pool


def get_conn():
    return get_pool().connection()


def _schema():
    app = os.getenv("PGAPPNAME", "").replace("-", "_")
    user = os.getenv("PGUSER", "").replace("-", "")
    return f"{app}_schema_{user}"


def gen_id(prefix=""):
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    suffix = uuid.uuid4().hex[:6]
    return f"{prefix}{ts}{suffix}"


# ── Init ───────────────────────────────────────────────────────────────────────

def init_database():
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(s)))

            cur.execute(sql.SQL("""
                CREATE TABLE IF NOT EXISTS {}.users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL,
                    name TEXT NOT NULL DEFAULT '',
                    role TEXT NOT NULL DEFAULT 'USER',
                    tags TEXT[] DEFAULT '{{}}',
                    is_active BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """).format(sql.Identifier(s)))

            cur.execute(sql.SQL("""
                CREATE TABLE IF NOT EXISTS {}.tags (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    color TEXT DEFAULT '#1B2CC1',
                    dashboard_ids TEXT[] DEFAULT '{{}}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """).format(sql.Identifier(s)))

            cur.execute(sql.SQL("""
                CREATE TABLE IF NOT EXISTS {}.dashboards (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    url TEXT NOT NULL,
                    link_type TEXT DEFAULT 'DASHBOARD',
                    description TEXT DEFAULT '',
                    public_notes TEXT DEFAULT '',
                    private_notes TEXT DEFAULT '',
                    folder_id TEXT DEFAULT '',
                    thumbnail_url TEXT DEFAULT '',
                    is_active BOOLEAN DEFAULT TRUE,
                    order_num INTEGER DEFAULT 0,
                    platform TEXT DEFAULT '',
                    visibility TEXT DEFAULT 'private',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """).format(sql.Identifier(s)))

            cur.execute(sql.SQL("""
                CREATE TABLE IF NOT EXISTS {}.folders (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    parent_id TEXT DEFAULT '',
                    order_num INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """).format(sql.Identifier(s)))

            cur.execute(sql.SQL("""
                CREATE TABLE IF NOT EXISTS {}.access_requests (
                    id TEXT PRIMARY KEY,
                    requester_email TEXT NOT NULL,
                    requester_name TEXT DEFAULT '',
                    status TEXT DEFAULT 'PENDING',
                    message TEXT DEFAULT '',
                    reviewer_email TEXT DEFAULT '',
                    reviewed_at TIMESTAMP,
                    review_note TEXT DEFAULT '',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """).format(sql.Identifier(s)))

            cur.execute(sql.SQL("""
                CREATE TABLE IF NOT EXISTS {}.user_dashboard_access (
                    id TEXT PRIMARY KEY,
                    user_email TEXT NOT NULL,
                    dashboard_id TEXT NOT NULL,
                    granted_by TEXT DEFAULT '',
                    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_email, dashboard_id)
                )
            """).format(sql.Identifier(s)))

            cur.execute(sql.SQL("""
                CREATE TABLE IF NOT EXISTS {}.notifications (
                    id TEXT PRIMARY KEY,
                    user_email TEXT NOT NULL,
                    title TEXT NOT NULL,
                    message TEXT DEFAULT '',
                    type TEXT DEFAULT 'INFO',
                    is_read BOOLEAN DEFAULT FALSE,
                    metadata JSONB DEFAULT '{{}}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """).format(sql.Identifier(s)))

            cur.execute(sql.SQL("""
                CREATE TABLE IF NOT EXISTS {}.user_favorites (
                    id TEXT PRIMARY KEY,
                    user_email TEXT NOT NULL,
                    dashboard_id TEXT NOT NULL,
                    UNIQUE(user_email, dashboard_id)
                )
            """).format(sql.Identifier(s)))

            cur.execute(sql.SQL("""
                CREATE TABLE IF NOT EXISTS {}.settings (
                    key TEXT PRIMARY KEY,
                    value TEXT DEFAULT ''
                )
            """).format(sql.Identifier(s)))

            cur.execute(sql.SQL("""
                CREATE TABLE IF NOT EXISTS {}.audit_log (
                    id TEXT PRIMARY KEY,
                    user_email TEXT NOT NULL,
                    action TEXT NOT NULL,
                    entity TEXT DEFAULT '',
                    entity_id TEXT DEFAULT '',
                    details JSONB DEFAULT '{{}}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """).format(sql.Identifier(s)))

            conn.commit()


# ── Users ──────────────────────────────────────────────────────────────────────

def get_user(email):
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT email, name, role, tags, is_active, created_at FROM {}.users WHERE email = %s"
                ).format(sql.Identifier(s)),
                (email,),
            )
            row = cur.fetchone()
            if row:
                return {
                    "email": row[0],
                    "name": row[1],
                    "role": row[2],
                    "tags": list(row[3] or []),
                    "is_active": row[4],
                    "created_at": row[5],
                }
    return None


def ensure_user(email, display_name=""):
    user = get_user(email)
    if user is None:
        s = _schema()
        name = display_name or email.split("@")[0]
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        "INSERT INTO {}.users (id, email, name, role, is_active) VALUES (%s, %s, %s, 'USER', FALSE)"
                        " ON CONFLICT DO NOTHING"
                    ).format(sql.Identifier(s)),
                    (gen_id("usr_"), email, name),
                )
                conn.commit()
        return get_user(email)
    return user


def get_all_users():
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT email, name, role, tags, is_active, created_at FROM {}.users ORDER BY created_at DESC"
                ).format(sql.Identifier(s))
            )
            cols = [d[0] for d in cur.description]
            rows = [dict(zip(cols, row)) for row in cur.fetchall()]
            for r in rows:
                r["tags"] = list(r["tags"] or [])
            return rows


def update_user(email, **kwargs):
    if not kwargs:
        return
    s = _schema()
    sets = [sql.SQL("{} = %s").format(sql.Identifier(k)) for k in kwargs]
    vals = list(kwargs.values()) + [email]
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("UPDATE {}.users SET {} WHERE email = %s").format(
                    sql.Identifier(s), sql.SQL(", ").join(sets)
                ),
                vals,
            )
            conn.commit()


# ── Dashboards ─────────────────────────────────────────────────────────────────

def get_all_dashboards():
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT * FROM {}.dashboards ORDER BY order_num, title"
                ).format(sql.Identifier(s))
            )
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]


def create_dashboard(**kwargs):
    s = _schema()
    kwargs.setdefault("id", gen_id("dash_"))
    kwargs.setdefault("created_at", datetime.now(timezone.utc))
    cols = list(kwargs.keys())
    vals = list(kwargs.values())
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("INSERT INTO {}.dashboards ({}) VALUES ({})").format(
                    sql.Identifier(s),
                    sql.SQL(", ").join(map(sql.Identifier, cols)),
                    sql.SQL(", ").join([sql.Placeholder()] * len(cols)),
                ),
                vals,
            )
            conn.commit()
    return kwargs["id"]


def update_dashboard(dash_id, **kwargs):
    if not kwargs:
        return
    s = _schema()
    sets = [sql.SQL("{} = %s").format(sql.Identifier(k)) for k in kwargs]
    vals = list(kwargs.values()) + [dash_id]
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("UPDATE {}.dashboards SET {} WHERE id = %s").format(
                    sql.Identifier(s), sql.SQL(", ").join(sets)
                ),
                vals,
            )
            conn.commit()


def delete_dashboard(dash_id):
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("DELETE FROM {}.dashboards WHERE id = %s").format(sql.Identifier(s)),
                (dash_id,),
            )
            conn.commit()


# ── Tags ───────────────────────────────────────────────────────────────────────

def get_all_tags():
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("SELECT * FROM {}.tags ORDER BY name").format(sql.Identifier(s))
            )
            cols = [d[0] for d in cur.description]
            rows = [dict(zip(cols, row)) for row in cur.fetchall()]
            for r in rows:
                r["dashboard_ids"] = list(r["dashboard_ids"] or [])
            return rows


def create_tag(name, description="", color="#1B2CC1"):
    s = _schema()
    tag_id = gen_id("tag_")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "INSERT INTO {}.tags (id, name, description, color) VALUES (%s, %s, %s, %s)"
                ).format(sql.Identifier(s)),
                (tag_id, name, description, color),
            )
            conn.commit()
    return tag_id


def update_tag(tag_id, **kwargs):
    if not kwargs:
        return
    s = _schema()
    sets = [sql.SQL("{} = %s").format(sql.Identifier(k)) for k in kwargs]
    vals = list(kwargs.values()) + [tag_id]
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("UPDATE {}.tags SET {} WHERE id = %s").format(
                    sql.Identifier(s), sql.SQL(", ").join(sets)
                ),
                vals,
            )
            conn.commit()


def delete_tag(tag_id):
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("DELETE FROM {}.tags WHERE id = %s").format(sql.Identifier(s)),
                (tag_id,),
            )
            conn.commit()


# ── Folders ────────────────────────────────────────────────────────────────────

def get_all_folders():
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT * FROM {}.folders ORDER BY order_num, name"
                ).format(sql.Identifier(s))
            )
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]


def create_folder(name, description="", parent_id=""):
    s = _schema()
    folder_id = gen_id("folder_")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "INSERT INTO {}.folders (id, name, description, parent_id) VALUES (%s, %s, %s, %s)"
                ).format(sql.Identifier(s)),
                (folder_id, name, description, parent_id),
            )
            conn.commit()
    return folder_id


def update_folder(folder_id, **kwargs):
    if not kwargs:
        return
    s = _schema()
    sets = [sql.SQL("{} = %s").format(sql.Identifier(k)) for k in kwargs]
    vals = list(kwargs.values()) + [folder_id]
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("UPDATE {}.folders SET {} WHERE id = %s").format(
                    sql.Identifier(s), sql.SQL(", ").join(sets)
                ),
                vals,
            )
            conn.commit()


def _collect_child_ids(folder_id, all_folders):
    children = [f["id"] for f in all_folders if f.get("parent_id") == folder_id]
    result = list(children)
    for child_id in children:
        result.extend(_collect_child_ids(child_id, all_folders))
    return result


def delete_folder(folder_id):
    s = _schema()
    all_folders = get_all_folders()
    ids_to_delete = [folder_id] + _collect_child_ids(folder_id, all_folders)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("DELETE FROM {}.folders WHERE id = ANY(%s)").format(sql.Identifier(s)),
                (ids_to_delete,),
            )
            conn.commit()


# ── Access Requests ────────────────────────────────────────────────────────────

def create_access_request(email, name, message=""):
    s = _schema()
    req_id = gen_id("req_")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "INSERT INTO {}.access_requests (id, requester_email, requester_name, message)"
                    " VALUES (%s, %s, %s, %s)"
                ).format(sql.Identifier(s)),
                (req_id, email, name, message),
            )
            conn.commit()
    return req_id


def get_pending_requests():
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT * FROM {}.access_requests WHERE status = 'PENDING' ORDER BY created_at"
                ).format(sql.Identifier(s))
            )
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]


def get_all_requests():
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT * FROM {}.access_requests ORDER BY created_at DESC"
                ).format(sql.Identifier(s))
            )
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]


def has_pending_request(email):
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT 1 FROM {}.access_requests WHERE requester_email = %s AND status = 'PENDING' LIMIT 1"
                ).format(sql.Identifier(s)),
                (email,),
            )
            return cur.fetchone() is not None


def approve_request(req_id, reviewer_email, tags):
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT requester_email FROM {}.access_requests WHERE id = %s"
                ).format(sql.Identifier(s)),
                (req_id,),
            )
            row = cur.fetchone()
            if not row:
                return
            requester = row[0]
            cur.execute(
                sql.SQL(
                    "UPDATE {}.access_requests SET status = 'APPROVED', reviewer_email = %s,"
                    " reviewed_at = NOW() WHERE id = %s"
                ).format(sql.Identifier(s)),
                (reviewer_email, req_id),
            )
            cur.execute(
                sql.SQL(
                    "UPDATE {}.users SET is_active = TRUE, tags = %s WHERE email = %s"
                ).format(sql.Identifier(s)),
                (tags, requester),
            )
            conn.commit()


def reject_request(req_id, reviewer_email, review_note=""):
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "UPDATE {}.access_requests SET status = 'REJECTED', reviewer_email = %s,"
                    " reviewed_at = NOW(), review_note = %s WHERE id = %s"
                ).format(sql.Identifier(s)),
                (reviewer_email, review_note, req_id),
            )
            conn.commit()


# ── Favorites ──────────────────────────────────────────────────────────────────

def get_favorites(email):
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT dashboard_id FROM {}.user_favorites WHERE user_email = %s"
                ).format(sql.Identifier(s)),
                (email,),
            )
            return [row[0] for row in cur.fetchall()]


def toggle_favorite(email, dashboard_id):
    s = _schema()
    favs = get_favorites(email)
    with get_conn() as conn:
        with conn.cursor() as cur:
            if dashboard_id in favs:
                cur.execute(
                    sql.SQL(
                        "DELETE FROM {}.user_favorites WHERE user_email = %s AND dashboard_id = %s"
                    ).format(sql.Identifier(s)),
                    (email, dashboard_id),
                )
            else:
                cur.execute(
                    sql.SQL(
                        "INSERT INTO {}.user_favorites (id, user_email, dashboard_id)"
                        " VALUES (%s, %s, %s) ON CONFLICT DO NOTHING"
                    ).format(sql.Identifier(s)),
                    (gen_id("fav_"), email, dashboard_id),
                )
            conn.commit()


# ── Individual Access ──────────────────────────────────────────────────────────

def get_individual_access(email):
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT dashboard_id FROM {}.user_dashboard_access WHERE user_email = %s"
                ).format(sql.Identifier(s)),
                (email,),
            )
            return [row[0] for row in cur.fetchall()]


def grant_individual_access(user_email, dashboard_id, granted_by):
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "INSERT INTO {}.user_dashboard_access (id, user_email, dashboard_id, granted_by)"
                    " VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING"
                ).format(sql.Identifier(s)),
                (gen_id("acc_"), user_email, dashboard_id, granted_by),
            )
            conn.commit()


def revoke_individual_access(user_email, dashboard_id):
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "DELETE FROM {}.user_dashboard_access WHERE user_email = %s AND dashboard_id = %s"
                ).format(sql.Identifier(s)),
                (user_email, dashboard_id),
            )
            conn.commit()


def sync_individual_access(user_email, dashboard_ids, granted_by):
    current = set(get_individual_access(user_email))
    desired = set(dashboard_ids)
    for d in desired - current:
        grant_individual_access(user_email, d, granted_by)
    for d in current - desired:
        revoke_individual_access(user_email, d)


# ── Notifications ──────────────────────────────────────────────────────────────

def get_notifications(email):
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT id, title, message, type, is_read, created_at"
                    " FROM {}.notifications WHERE user_email = %s"
                    " ORDER BY created_at DESC LIMIT 20"
                ).format(sql.Identifier(s)),
                (email,),
            )
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]


def count_unread_notifications(email):
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT COUNT(*) FROM {}.notifications WHERE user_email = %s AND is_read = FALSE"
                ).format(sql.Identifier(s)),
                (email,),
            )
            return cur.fetchone()[0]


def mark_notification_read(notif_id):
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("UPDATE {}.notifications SET is_read = TRUE WHERE id = %s").format(
                    sql.Identifier(s)
                ),
                (notif_id,),
            )
            conn.commit()


def create_notification(user_email, title, message, notif_type="INFO"):
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "INSERT INTO {}.notifications (id, user_email, title, message, type)"
                    " VALUES (%s, %s, %s, %s, %s)"
                ).format(sql.Identifier(s)),
                (gen_id("notif_"), user_email, title, message, notif_type),
            )
            conn.commit()


# ── Audit Log ──────────────────────────────────────────────────────────────────

def log_audit(user_email, action, entity="", entity_id="", details=None):
    import json
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "INSERT INTO {}.audit_log (id, user_email, action, entity, entity_id, details)"
                    " VALUES (%s, %s, %s, %s, %s, %s)"
                ).format(sql.Identifier(s)),
                (
                    gen_id("log_"),
                    user_email,
                    action,
                    entity,
                    entity_id,
                    json.dumps(details or {}),
                ),
            )
            conn.commit()


def get_audit_log(limit=100):
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT id, user_email, action, entity, entity_id, details, created_at"
                    " FROM {}.audit_log ORDER BY created_at DESC LIMIT %s"
                ).format(sql.Identifier(s)),
                (limit,),
            )
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]


# ── Settings ───────────────────────────────────────────────────────────────────

def get_settings():
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("SELECT key, value FROM {}.settings").format(sql.Identifier(s))
            )
            return {row[0]: row[1] for row in cur.fetchall()}


def set_setting(key, value):
    s = _schema()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "INSERT INTO {}.settings (key, value) VALUES (%s, %s)"
                    " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
                ).format(sql.Identifier(s)),
                (key, value),
            )
            conn.commit()