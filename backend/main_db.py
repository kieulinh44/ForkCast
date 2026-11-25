"""Version-one SQLite migration and conservative connection settings."""
import sqlite3
import os


def connect(settings):
    settings.db_path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    db = sqlite3.connect(settings.db_path, timeout=1)
    try:
        if os.name == 'posix':
            settings.db_path.chmod(0o600)
        db.execute('PRAGMA busy_timeout=1000')
        version = db.execute('PRAGMA user_version').fetchone()[0]
        if version > 1:
            raise sqlite3.DatabaseError('Unsupported schema')
        db.execute('PRAGMA journal_mode=WAL')
        if version == 0:
            with db:
                db.execute('CREATE TABLE IF NOT EXISTS guests (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, state TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL)')
                db.execute('PRAGMA user_version=1')
        return db
    except BaseException:
        db.close()
        raise
