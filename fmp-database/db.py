"""Connexion SQLite + fonctions d'écriture, partagées par discover.py et ingest.py."""
import sqlite3
import json
from datetime import datetime, timezone

import config


def get_connection():
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH)
    with open(config.MODULE_DIR / "schema.sql", encoding="utf-8") as f:
        conn.executescript(f.read())
    return conn


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _guess_item_date(item):
    """Cherche un champ date plausible dans un objet JSON — best-effort, ne bloque
    jamais l'import si rien n'est trouvé (item_date reste alors NULL, toujours
    interrogeable via payload avec json_extract())."""
    if not isinstance(item, dict):
        return None
    for field in ("date", "fiscalDate", "fillingDate", "acceptedDate", "period", "calendarYear"):
        if item.get(field):
            return str(item[field])
    year, quarter = item.get("year"), item.get("quarter")
    if year and quarter:
        return f"{year}Q{quarter}"
    return None


def replace_category_rows(conn, category, symbol, period, items):
    """Remplace TOUTES les lignes existantes pour (category, symbol, period) par les
    nouvelles — stratégie simple et idempotente : relancer l'import ne duplique jamais
    rien, pas besoin d'une clé de dédoublonnage fine par ligne."""
    conn.execute(
        "DELETE FROM raw_data WHERE category=? AND symbol=? AND (period=? OR (period IS NULL AND ? IS NULL))",
        (category, symbol, period, period),
    )
    ts = now_iso()
    rows = []
    if isinstance(items, list):
        for item in items:
            rows.append((category, symbol, period, _guess_item_date(item), json.dumps(item, ensure_ascii=False), ts))
    elif items is not None:
        rows.append((category, symbol, period, _guess_item_date(items), json.dumps(items, ensure_ascii=False), ts))
    if rows:
        conn.executemany(
            "INSERT INTO raw_data (category, symbol, period, item_date, payload, fetched_at) VALUES (?,?,?,?,?,?)",
            rows,
        )
    conn.commit()
    return len(rows)


def log_fetch(conn, category, symbol, period, status, http_status=None, error_message=None, item_count=None):
    conn.execute(
        "INSERT INTO fetch_log (category, symbol, period, status, http_status, error_message, item_count, fetched_at) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (category, symbol, period, status, http_status, error_message, item_count, now_iso()),
    )
    conn.commit()
