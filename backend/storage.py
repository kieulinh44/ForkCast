"""SQLite guest storage: opaque identifiers, transactional revisions."""
import hashlib
import json
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from .main_db import connect

TTL = 30 * 24 * 60 * 60

def empty_state():
    return {'profile': {}, 'mood': '', 'craving': '', 'feedback': [], 'menuUrl': ''}


def guest_id(cookie):
    if not cookie or not re.fullmatch(r'[A-Za-z0-9_-]{43}', cookie):
        return None
    return hashlib.sha256(cookie.encode()).hexdigest()


@contextmanager
def connection(settings):
    db = connect(settings)
    try:
        with db:
            yield db
    finally:
        db.close()


def get_state(settings, cookie):
    now = int(time.time())
    ident = guest_id(cookie)
    with connection(settings) as db:
        row = db.execute('SELECT state, revision FROM guests WHERE id=? AND expires_at>?', (ident, now)).fetchone()
        if row:
            return {'state': json.loads(row[0]), 'revision': row[1]}, None
        cookie = secrets.token_urlsafe(32)
        state = empty_state()
        db.execute('INSERT INTO guests VALUES (?, ?, ?, ?, ?)', (guest_id(cookie), now + TTL, json.dumps(state), 0, now))
        db.execute('DELETE FROM guests WHERE expires_at<=?', (now,))
        return {'state': state, 'revision': 0}, cookie


def write_state(settings, cookie, state, revision, clear=False):
    from fastapi import HTTPException
    now = int(time.time())
    with connection(settings) as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT revision FROM guests WHERE id=? AND expires_at>?', (guest_id(cookie), now)).fetchone()
        if not row:
            raise HTTPException(403, 'Guest session required')
        if row[0] != revision:
            raise HTTPException(409, 'State changed; reload before retrying')
        if clear:
            db.execute('DELETE FROM workflows WHERE guest_id=?', (guest_id(cookie),))
        db.execute('UPDATE guests SET state=?, revision=?, updated_at=? WHERE id=?', (json.dumps(state), revision + 1, now, guest_id(cookie)))
    return {'state': state, 'revision': revision + 1}
