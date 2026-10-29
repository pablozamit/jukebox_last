"""Exercise vote aggregation without importing Firebase startup or Kodi."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock


SOURCE = Path(__file__).resolve().parents[1] / "bridge.py"
TREE = ast.parse(SOURCE.read_text(encoding="utf-8"))
FUNCTION = next(
    node for node in TREE.body
    if isinstance(node, ast.FunctionDef) and node.name == "aggregate_vote_event"
)


class _Outbox:
    def has_event(self, *args):
        return True

    def peak_is_synced(self, *args):
        return True


class VoteEventProfileRaceTests(unittest.TestCase):
    def run_event(
        self, *, title="Song", counted_session=None, session_key="session-a",
        user_exists=True, event_ts=1_000_000, event_session_start=900_000,
        active_session_start=900_000,
    ):
        data = {
            "ts": event_ts,
            "userId": "stable-uid",
            "songId": "song",
            "title": title,
            "voterName": "Historical DJ name",
        }
        if counted_session is not None:
            data["countedSession"] = counted_session

        event = Mock(id="event-1")
        event.get.return_value = SimpleNamespace(exists=True, to_dict=lambda: dict(data))
        user = SimpleNamespace(exists=user_exists, to_dict=lambda: {"djName": "Renamed DJ"})
        song = SimpleNamespace(exists=True, to_dict=lambda: {"votes": 2}, create_time=None)
        db = Mock()
        db.collection.return_value.document.return_value.get.side_effect = [user, song]
        tx = db.transaction.return_value
        tx.get.return_value = iter([SimpleNamespace(to_dict=lambda: dict(data))])
        firestore = SimpleNamespace(
            Increment=lambda n: n,
            transactional=lambda function: function,
        )
        namespace = {
            "db": db,
            "CATALOG_CACHE": {"song": "Song"},
            "logger": Mock(),
            "datetime": __import__("datetime").datetime,
            "timezone": __import__("datetime").timezone,
            "time": SimpleNamespace(time=lambda: 123),
            "firestore": firestore,
            "session_start_ms": lambda occurred_at: event_session_start,
            "SOCIAL_OUTBOX": _Outbox(),
        }
        exec(compile(ast.Module(body=[FUNCTION], type_ignores=[]), str(SOURCE), "exec"), namespace)
        result = namespace["aggregate_vote_event"](event, session_key, active_session_start)
        return result, db, event

    def test_profile_rename_does_not_discard_historical_event(self):
        result, db, event = self.run_event()

        self.assertTrue(result)
        db.transaction.assert_called_once()
        event.delete.assert_not_called()

    def test_catalog_mismatch_keeps_event_for_later_reconciliation(self):
        result, db, event = self.run_event(title="Catalog title changed")

        self.assertFalse(result)
        db.transaction.assert_not_called()
        event.delete.assert_not_called()

    def test_missing_user_reference_is_rejected(self):
        result, db, event = self.run_event(user_exists=False)

        self.assertFalse(result)
        db.transaction.assert_not_called()
        event.delete.assert_called_once()

    def test_lagging_session_watcher_leaves_newer_session_event_available(self):
        result, db, event = self.run_event(
            event_ts=1_000_000,
            event_session_start=1_000_000,
            active_session_start=900_000,
        )

        self.assertFalse(result)
        db.transaction.assert_not_called()
        event.delete.assert_not_called()

    def test_event_counted_for_another_session_cannot_be_counted_again(self):
        result, db, event = self.run_event(
            counted_session="session-a",
            session_key="session-b",
        )

        self.assertFalse(result)
        db.transaction.assert_not_called()
        event.delete.assert_not_called()


if __name__ == "__main__":
    unittest.main()
