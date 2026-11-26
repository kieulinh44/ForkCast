"""Guest-isolated workflow persistence with transactional compare-and-swap."""
import hashlib
import json
import secrets
import time
from fastapi import HTTPException
from .storage import connection, guest_id


def context_digest(state):
    relevant = {key: state.get(key) for key in ('profile', 'mood', 'craving')}
    return hashlib.sha256(json.dumps(relevant, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def snapshot(db, ident, version=None):
    row = db.execute('SELECT state, revision FROM guests WHERE id=? AND expires_at>?', (ident, int(time.time()))).fetchone()
    if not row:
        raise HTTPException(403, 'Guest session required')
    state, state_revision = json.loads(row[0]), row[1]
    workflow = db.execute('SELECT revision, menu, recommendations, context_digest FROM workflows WHERE guest_id=?', (ident,)).fetchone()
    revision, menu, recs, digest = workflow or (0, None, None, None)
    if version and (version.state_revision != state_revision or version.menu_revision != revision):
        raise HTTPException(409, 'State or menu changed; reload before retrying')
    changed = digest is not None and digest != context_digest(state)
    envelope = {'menu_revision':revision, 'state_revision':state_revision, 'menu':json.loads(menu) if menu else None, 'recommendations':json.loads(recs) if recs and not changed else None, 'context_changed':changed}
    return envelope, state


def read_workflow(settings, cookie, version=None):
    with connection(settings) as db:
        return snapshot(db, guest_id(cookie), version)


def write_workflow(settings, cookie, version, menu, recommendations=None, digest=None):
    ident = guest_id(cookie)
    with connection(settings) as db:
        db.execute('BEGIN IMMEDIATE')
        envelope, _ = snapshot(db, ident, version)
        revision = envelope['menu_revision'] + 1
        db.execute('INSERT INTO workflows (guest_id, revision, menu, recommendations, context_digest) VALUES (?,?,?,?,?) ON CONFLICT(guest_id) DO UPDATE SET revision=excluded.revision, menu=excluded.menu, recommendations=excluded.recommendations, context_digest=excluded.context_digest', (ident, revision, json.dumps(menu) if menu else None, json.dumps(recommendations) if recommendations is not None else None, digest))
        return snapshot(db, ident)[0]


def reviewed_menu(settings, cookie, body):
    old, _ = read_workflow(settings, cookie, body)
    menu = body.menu.model_dump()
    for item in menu['items']:
        item['id'] = item['id'] or secrets.token_urlsafe(12)
    menu.update(reviewed=True, source='manual' if body.manual_replacement or not old['menu'] else old['menu']['source'], warnings=[])
    return write_workflow(settings, cookie, body, menu)
