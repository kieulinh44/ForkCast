"""Environment-only configuration; importing never contacts services."""
from dataclasses import dataclass, field
from pathlib import Path
import os
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]

@dataclass(frozen=True)
class Service:
    base_url: str = ''
    api_key: str = field(default='', repr=False)
    model: str = ''

    @property
    def configured(self):
        return all((self.base_url, self.api_key, self.model))

@dataclass(frozen=True)
class Settings:
    db_path: Path = ROOT / 'data' / 'forkcast.sqlite3'
    secure_cookie: bool = False
    allowed_hosts: tuple[str, ...] = ('localhost', '127.0.0.1', 'testserver')
    text: Service = field(default_factory=Service)
    vision: Service = field(default_factory=Service)

    @classmethod
    def from_env(cls):
        env = {**dotenv_values(ROOT / '.env'), **os.environ}
        def service(name):
            return Service(*(env.get(f'FORKCAST_{name}_{part}', '') or '' for part in ('BASE_URL', 'API_KEY', 'MODEL')))
        path = Path(env.get('FORKCAST_DB_PATH') or ROOT / 'data/forkcast.sqlite3')
        if not path.is_absolute():
            path = ROOT / path
        return cls(db_path=path,
                   secure_cookie=str(env.get('FORKCAST_SECURE_COOKIE', 'false')).lower() in ('1', 'true', 'yes'),
                   allowed_hosts=tuple(x.strip() for x in str(env.get('FORKCAST_ALLOWED_HOSTS', 'localhost,127.0.0.1,testserver')).split(',') if x.strip()),
                   text=service('TEXT'), vision=service('VISION'))
