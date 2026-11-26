"""Transactional schema-two migration and conservative connection settings."""
import sqlite3
import os


def connect(settings):
    settings.db_path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    db = sqlite3.connect(settings.db_path, timeout=1)
    try:
        if os.name == 'posix':
            settings.db_path.chmod(0o600)
        db.execute('PRAGMA busy_timeout=1000')
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA journal_mode=WAL')
        with db:
            db.execute('BEGIN IMMEDIATE')
            version = db.execute('PRAGMA user_version').fetchone()[0]
            if version > 2:
                raise sqlite3.DatabaseError('Unsupported schema')
            if version == 0:
                db.execute('CREATE TABLE IF NOT EXISTS guests (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, state TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL)')
            if version < 2:
                db.execute('CREATE TABLE workflows (guest_id TEXT PRIMARY KEY REFERENCES guests(id) ON DELETE CASCADE, revision INTEGER NOT NULL DEFAULT 0, menu TEXT, recommendations TEXT, context_digest TEXT)')
                db.execute('PRAGMA user_version=2')
        return db
    except BaseException:
        db.close()
        raise
