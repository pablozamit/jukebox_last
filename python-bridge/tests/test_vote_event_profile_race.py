"""Exercise the real aggregation function without importing startup/Kodi/secrets."""
import ast
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

SOURCE = Path(__file__).resolve().parents[1] / 'bridge.py'
TREE = ast.parse(SOURCE.read_text())
FUNCTION = next(node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name == 'aggregate_vote_event')

class VoteEventProfileRaceTests(unittest.TestCase):
    def run_event(self, current_name, event_name, *, title='Song', user_exists=True):
        data = {'ts': 2000, 'userId': 'stable-uid', 'songId': 'song', 'title': title, 'voterName': event_name}
        event = Mock(id='event-1')
        event.get.return_value = SimpleNamespace(exists=True, to_dict=lambda: data)
        user = SimpleNamespace(exists=user_exists, to_dict=lambda: {'djName': current_name})
        db = Mock()
        db.collection.return_value.document.return_value.get.return_value = user
        tx = db.transaction.return_value
        # Already counted inside the transaction: no further social/Kodi effects.
        tx.get.return_value = iter([SimpleNamespace(to_dict=lambda: {'countedSession': 'today'})])
        namespace = {'db': db, 'CATALOG_CACHE': {'song': 'Song'}, 'logger': Mock(),
                     'datetime': datetime, 'firestore': SimpleNamespace(Increment=lambda n: n, transactional=lambda fn: fn)}
        exec(compile(ast.Module(body=[FUNCTION], type_ignores=[]), str(SOURCE), 'exec'), namespace)
        namespace['aggregate_vote_event'](event, 'today', 1000)
        return db, event

    def test_renamed_profile_does_not_discard_historical_event(self):
        db, event = self.run_event('New DJ', 'Old DJ')
        db.transaction.assert_called_once()
        event.delete.assert_not_called()

    def test_unchanged_profile_remains_accepted(self):
        db, event = self.run_event('DJ', 'DJ')
        db.transaction.assert_called_once()
        event.delete.assert_not_called()

    def test_missing_profile_still_rejected(self):
        db, event = self.run_event('DJ', 'DJ', user_exists=False)
        db.transaction.assert_not_called()
        event.delete.assert_called_once()

    def test_catalog_mismatch_still_rejected(self):
        db, event = self.run_event('New DJ', 'Old DJ', title='Forged title')
        db.transaction.assert_not_called()
        event.delete.assert_called_once()
