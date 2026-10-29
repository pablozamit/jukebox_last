"""Regression test: missing session metadata must not clear the live queue."""
import ast
import asyncio
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock


SOURCE = Path(__file__).resolve().parents[1] / "bridge.py"
TREE = ast.parse(SOURCE.read_text(encoding="utf-8"))
FUNCTION = next(
    node for node in TREE.body
    if isinstance(node, ast.AsyncFunctionDef) and node.name == "check_for_new_session"
)


class _Document:
    def __init__(self, data):
        self.data = dict(data)
        self.set_calls = []

    def get(self):
        return SimpleNamespace(exists=True, to_dict=lambda: dict(self.data))

    def set(self, data, merge=False):
        self.set_calls.append((dict(data), merge))
        if merge:
            self.data.update(data)
        else:
            self.data = dict(data)


class _Database:
    def __init__(self, state_doc):
        self.state_doc = state_doc

    def collection(self, name):
        if name != "state":
            raise AssertionError(f"unexpected collection: {name}")
        return SimpleNamespace(document=lambda name: self._document(name))

    def _document(self, name):
        if name != "nowPlaying":
            raise AssertionError(f"unexpected document: {name}")
        return self.state_doc


class MissingSessionMarkerTests(unittest.TestCase):
    def test_missing_marker_at_1800_sets_baseline_without_clearing_queue(self):
        class FixedDateTime(datetime):
            @classmethod
            def now(cls, tz=None):
                return cls(2026, 10, 28, 18, 0, 0, tzinfo=tz)

        queue = ["one.mp4", "two.mp4"]
        state_doc = _Document({"queue": queue, "songId": "one.mp4"})
        clear_all_data = AsyncMock(return_value=True)
        namespace = {
            "datetime": FixedDateTime,
            "asyncio": asyncio,
            "time": SimpleNamespace(time=lambda: 1_798_000_000),
            "db": _Database(state_doc),
            "SESSION_STATE": {"start": None},
            "session_start_ms": lambda now: 1_798_000_000_000,
            "clear_all_data": clear_all_data,
            "logger": Mock(),
            "report_error": Mock(),
        }
        exec(compile(ast.Module(body=[FUNCTION], type_ignores=[]), str(SOURCE), "exec"), namespace)

        asyncio.run(namespace["check_for_new_session"]())

        self.assertEqual(state_doc.data["queue"], queue)
        self.assertEqual(state_doc.data["songId"], "one.mp4")
        self.assertEqual(state_doc.data["lastResetDate"], "2026-10-28T18:00:00")
        self.assertEqual(state_doc.data["sessionStart"], 1_798_000_000_000)
        self.assertEqual(namespace["SESSION_STATE"]["start"], 1_798_000_000_000)
        self.assertEqual(len(state_doc.set_calls), 1)
        self.assertTrue(state_doc.set_calls[0][1])
        clear_all_data.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
