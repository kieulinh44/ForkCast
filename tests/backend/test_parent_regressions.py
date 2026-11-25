"""Parent integration review regressions, using only synthetic data."""
import os
import stat
import pytest
from pydantic import ValidationError
from backend.config import Settings
from backend.models import Feedback
from backend.storage import connection

@pytest.mark.parametrize('dish', ['', '   \t'])
def test_blank_dish_is_rejected_by_the_api_schema(dish):
    with pytest.raises(ValidationError):
        Feedback(dish=dish, rating=4, notes='Sample note')

@pytest.mark.skipif(os.name != 'posix', reason='POSIX permission check')
def test_database_file_is_private_to_the_server_user(tmp_path):
    path = tmp_path / 'private' / 'state.sqlite3'
    with connection(Settings(db_path=path)) as db:
        db.execute('SELECT 1').fetchone()
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
