import ast
import asyncio
from pathlib import Path
import random
import subprocess
import sys
import threading
import tempfile
import unittest

from bridge_runtime import ExponentialBackoff, InstanceLock, SubscriptionRegistry


class ExponentialBackoffTests(unittest.TestCase):
    def test_delay_grows_exponentially_and_stays_at_cap(self):
        backoff = ExponentialBackoff(initial_delay=2, max_delay=9, multiplier=2)

        self.assertEqual([backoff.next_delay() for _ in range(6)], [2, 4, 8, 9, 9, 9])

    def test_successful_connection_resets_sequence(self):
        backoff = ExponentialBackoff(initial_delay=0.5, max_delay=8)
        self.assertEqual(backoff.next_delay(), 0.5)
        self.assertEqual(backoff.next_delay(), 1)

        backoff.reset()

        self.assertEqual(backoff.next_delay(), 0.5)

    def test_rejects_invalid_configuration(self):
        for kwargs in (
            {"initial_delay": 0},
            {"initial_delay": -1},
            {"initial_delay": 3, "max_delay": 2},
            {"multiplier": 0.5},
        ):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                ExponentialBackoff(**kwargs)


class _Watch:
    def __init__(self, error=None):
        self.unsubscribe_calls = 0
        self.error = error

    def unsubscribe(self):
        self.unsubscribe_calls += 1
        if self.error:
            raise self.error


class SubscriptionRegistryTests(unittest.TestCase):
    def test_close_unsubscribes_every_handle_once_and_is_idempotent(self):
        first, second = _Watch(), _Watch()
        registry = SubscriptionRegistry()
        registry.add(first)
        registry.add(second)

        self.assertEqual(len(registry), 2)
        self.assertEqual(registry.close(), [])
        self.assertEqual(registry.close(), [])

        self.assertTrue(registry.closed)
        self.assertEqual(len(registry), 0)
        self.assertEqual((first.unsubscribe_calls, second.unsubscribe_calls), (1, 1))

    def test_one_unsubscribe_error_does_not_skip_remaining_handles(self):
        first = _Watch(RuntimeError("listener already stopped"))
        second = _Watch()
        registry = SubscriptionRegistry()
        registry.add(first)
        registry.add(second)

        errors = registry.close()

        self.assertEqual(len(errors), 1)
        self.assertEqual(str(errors[0]), "listener already stopped")
        self.assertEqual((first.unsubscribe_calls, second.unsubscribe_calls), (1, 1))
        self.assertEqual(registry.close(), [])

    def test_handle_added_after_close_is_immediately_unsubscribed(self):
        registry = SubscriptionRegistry()
        registry.close()
        watch = _Watch()

        self.assertIs(registry.add(watch), watch)

        self.assertEqual(watch.unsubscribe_calls, 1)
        self.assertEqual(len(registry), 0)

    def test_rejects_handle_without_unsubscribe(self):
        registry = SubscriptionRegistry()

        with self.assertRaises(TypeError):
            registry.add(object())

        self.assertEqual(len(registry), 0)

    def test_add_close_race_never_leaves_a_live_untracked_handle(self):
        registry = SubscriptionRegistry()
        start = threading.Barrier(3)
        watch = _Watch()

        def add_watch():
            start.wait()
            registry.add(watch)

        def close_registry():
            start.wait()
            registry.close()

        add_thread = threading.Thread(target=add_watch)
        close_thread = threading.Thread(target=close_registry)
        add_thread.start()
        close_thread.start()
        start.wait()
        add_thread.join()
        close_thread.join()

        # If add wins, close owns the handle; if close wins, add unsubscribes it.
        self.assertEqual(watch.unsubscribe_calls, 1)
        self.assertEqual(len(registry), 0)


class InstanceLockTests(unittest.TestCase):
    def test_exclusive_acquire_is_idempotent_and_release_is_repeatable(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bridge.lock"
            first = InstanceLock(path)
            second = InstanceLock(path)

            self.assertTrue(first.acquire())
            self.assertTrue(first.acquire())
            self.assertFalse(second.acquire())
            first.release()
            first.release()

            self.assertTrue(second.acquire())
            second.release()

    def test_separate_process_cannot_acquire_held_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bridge.lock"
            local = InstanceLock(path)
            self.assertTrue(local.acquire())
            script = (
                "import sys; from bridge_runtime import InstanceLock; "
                "sys.exit(0 if InstanceLock(sys.argv[1]).acquire() else 7)"
            )
            result = subprocess.run(
                [sys.executable, "-c", script, str(path)],
                cwd=Path(__file__).resolve().parents[1],
                timeout=5,
            )
            local.release()
            self.assertEqual(result.returncode, 7)

    def test_context_manager_releases_lock_on_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bridge.lock"
            other = InstanceLock(path)

            with InstanceLock(path) as held:
                self.assertTrue(held.acquire())
                self.assertFalse(other.acquire())

            self.assertTrue(other.acquire())
            other.release()

    def test_os_releases_lock_when_holder_process_exits(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bridge.lock"
            script = (
                "import os, sys; from bridge_runtime import InstanceLock; "
                "lock=InstanceLock(sys.argv[1]); "
                "os._exit(0 if lock.acquire() else 9)"
            )
            result = subprocess.run(
                [sys.executable, "-c", script, str(path)],
                cwd=Path(__file__).resolve().parents[1],
                timeout=5,
            )
            self.assertEqual(result.returncode, 0)

            local = InstanceLock(path)
            self.assertTrue(local.acquire())
            local.release()


class BridgeLifecycleStructureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        bridge_path = Path(__file__).resolve().parents[1] / "bridge.py"
        cls.tree = ast.parse(bridge_path.read_text(encoding="utf-8"))
        cls.functions = {
            node.name: node for node in cls.tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }

    @staticmethod
    def _calls(node, name):
        return [
            call for call in ast.walk(node)
            if isinstance(call, ast.Call)
            and (
                (isinstance(call.func, ast.Name) and call.func.id == name)
                or (isinstance(call.func, ast.Attribute) and call.func.attr == name)
            )
        ]

    def test_catalog_sync_and_watchers_are_inside_kodi_connection_scope(self):
        main = self.functions["main"]
        connection_blocks = [
            node for node in ast.walk(main)
            if isinstance(node, ast.AsyncWith)
            and any(
                isinstance(item.context_expr, ast.Call)
                and isinstance(item.context_expr.func, ast.Attribute)
                and isinstance(item.context_expr.func.value, ast.Name)
                and item.context_expr.func.value.id == "websockets"
                and item.context_expr.func.attr == "connect"
                for item in node.items
            )
        ]
        self.assertEqual(len(connection_blocks), 1)
        connection_body = connection_blocks[0]

        self.assertEqual(len(self._calls(connection_body, "sync_local_files")), 1)
        self.assertEqual(len(self._calls(connection_body, "setup_commands_watchers")), 1)
        self.assertEqual(len(self._calls(connection_body, "setup_vote_events_watch")), 1)

        # There must be no catalog scan/write or watcher setup before Kodi connects.
        main_prefix = [
            node for node in main.body
            if node is not connection_blocks[0]
            and getattr(node, "lineno", 0) < connection_blocks[0].lineno
        ]
        for node in main_prefix:
            self.assertFalse(self._calls(node, "sync_local_files"))
            self.assertFalse(self._calls(node, "setup_commands_watchers"))
            self.assertFalse(self._calls(node, "setup_vote_events_watch"))

    def test_each_connection_registers_three_watch_handles_for_cleanup(self):
        commands = self.functions["setup_commands_watchers"]
        vote_watch = self.functions["setup_vote_events_watch"]

        command_subscriptions = [
            call for call in self._calls(commands, "add")
            if isinstance(call.func, ast.Attribute)
            and isinstance(call.func.value, ast.Name)
            and call.func.value.id == "subscriptions"
        ]
        vote_subscriptions = [
            call for call in self._calls(vote_watch, "add")
            if isinstance(call.func, ast.Attribute)
            and isinstance(call.func.value, ast.Name)
            and call.func.value.id == "subscriptions"
        ]
        self.assertEqual(len(command_subscriptions), 2)
        self.assertEqual(len(vote_subscriptions), 1)

        run_forever = self.functions["run_forever"]
        self.assertEqual(len(self._calls(run_forever, "SubscriptionRegistry")), 1)
        self.assertEqual(len(self._calls(run_forever, "close")), 1)
        self.assertTrue(any(isinstance(node, ast.Try) and node.finalbody for node in ast.walk(run_forever)))


class BridgePlaybackSafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        bridge_path = Path(__file__).resolve().parents[1] / "bridge.py"
        cls.tree = ast.parse(bridge_path.read_text(encoding="utf-8"))
        cls.functions = {
            node.name: node for node in cls.tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }

    @classmethod
    def _load_functions(cls, names, namespace):
        nodes = [cls.functions[name] for name in names]
        module = ast.Module(body=nodes, type_ignores=[])
        exec(compile(module, "bridge.py", "exec"), namespace)
        return namespace

    def test_get_next_song_skips_pending_settlement_and_bounds_query(self):
        blocked_song = type("Song", (), {"id": "pending.mp4"})()
        safe_song = type("Song", (), {"id": "safe.mp4"})()

        class Query:
            requested_limit = None

            def where(self, *args):
                return self

            def order_by(self, *args, **kwargs):
                return self

            def limit(self, count):
                self.requested_limit = count
                return self

            def stream(self):
                return [blocked_song, safe_song]

        query = Query()
        namespace = {
            "SOCIAL_OUTBOX": type("Outbox", (), {
                "blocked_song_ids": lambda self: {"pending.mp4"},
            })(),
            "db": type("DB", (), {
                "collection": lambda self, name: type("Collection", (), {
                    "where": lambda self, *args: query,
                })(),
            })(),
            "firestore": type("Firestore", (), {
                "Query": type("QueryConstants", (), {"DESCENDING": "DESC", "ASCENDING": "ASC"}),
            }),
            "report_error": lambda *args: None,
            "random": random,
        }
        self._load_functions(["get_next_song"], namespace)

        result = asyncio.run(namespace["get_next_song"](["pending.mp4", "safe.mp4"]))

        self.assertEqual(result, "safe.mp4")
        self.assertEqual(query.requested_limit, 2)

    def test_query_fallback_never_chooses_song_with_pending_settlement(self):
        class BrokenQuery:
            def where(self, *args):
                raise RuntimeError("Firestore unavailable")

        chosen_from = []

        def choose(available):
            chosen_from.extend(available)
            return available[0] if available else self.fail("empty fallback must not choose")

        namespace = {
            "SOCIAL_OUTBOX": type("Outbox", (), {
                "blocked_song_ids": lambda self: {"pending.mp4"},
            })(),
            "db": type("DB", (), {
                "collection": lambda self, name: type("Collection", (), {
                    "where": lambda self, *args: BrokenQuery(),
                })(),
            })(),
            "firestore": type("Firestore", (), {
                "Query": type("QueryConstants", (), {"DESCENDING": "DESC", "ASCENDING": "ASC"}),
            }),
            "report_error": lambda *args: None,
            "random": type("Random", (), {"choice": staticmethod(choose)}),
        }
        self._load_functions(["get_next_song"], namespace)

        result = asyncio.run(namespace["get_next_song"](["pending.mp4", "safe.mp4"]))

        self.assertEqual(result, "safe.mp4")
        self.assertEqual(chosen_from, ["safe.mp4"])
        self.assertIsNone(asyncio.run(namespace["get_next_song"](["pending.mp4"])))
        self.assertEqual(chosen_from, ["safe.mp4"])

    def test_outbox_failure_does_not_block_requested_music(self):
        calls = []

        class AsyncLock:
            def locked(self):
                return False

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

        async def play(ws, filename, current_playing_file):
            calls.append(filename)
            return True

        namespace = {
            "SOCIAL_OUTBOX": type("Outbox", (), {
                "blocked_song_ids": lambda self: (_ for _ in ()).throw(OSError("outbox unavailable")),
            })(),
            "playback_lock": AsyncLock(),
            "_play_song_on_kodi": play,
            "report_error": lambda *args: None,
        }
        self._load_functions(["play_song_on_kodi"], namespace)

        result = asyncio.run(namespace["play_song_on_kodi"](None, "requested.mp4", [None]))

        self.assertTrue(result)
        self.assertEqual(calls, ["requested.mp4"])

    def test_direct_play_request_for_pending_song_is_skipped(self):
        calls = []

        class AsyncLock:
            def locked(self):
                return False

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

        async def play(ws, filename, current_playing_file):
            calls.append(filename)
            return True

        namespace = {
            "SOCIAL_OUTBOX": type("Outbox", (), {
                "blocked_song_ids": lambda self: {"pending.mp4"},
            })(),
            "playback_lock": AsyncLock(),
            "_play_song_on_kodi": play,
            "report_error": lambda *args: None,
            "logger": type("Logger", (), {"warning": lambda *args: None})(),
        }
        self._load_functions(["play_song_on_kodi"], namespace)

        result = asyncio.run(namespace["play_song_on_kodi"](None, "pending.mp4", [None]))

        self.assertFalse(result)
        self.assertEqual(calls, [])

    def test_settlement_skips_review_uid_but_processes_safe_uid(self):
        settle_calls = []
        marked_settled = []
        removed = []

        class Outbox:
            def mark_settlement_user(self, playback_id, uid):
                marked_settled.append((playback_id, uid))

            def mark_settlement_review(self, *args):
                self.fail("a UID already in review must not be retried")

            def remove_settlement(self, playback_id):
                removed.append(playback_id)

        namespace = {
            "SOCIAL_OUTBOX": Outbox(),
            "logger": type("Logger", (), {"warning": lambda *args: None, "exception": lambda *args: None})(),
            "settle_playback_user": lambda song_id, playback_id, uid, *args: settle_calls.append(uid) or True,
        }
        self._load_functions(["_process_playback_settlement"], namespace)
        settlement = {
            "playbackId": "playback-1",
            "songId": "song.mp4",
            "uids": ["review-user", "safe-user"],
            "settledUids": [],
            "needsReview": {"review-user": "token-changed"},
            "awards": {"safe-user": 5},
        }

        result = namespace["_process_playback_settlement"](settlement)

        self.assertFalse(result)
        self.assertEqual(settle_calls, ["safe-user"])
        self.assertEqual(marked_settled, [("playback-1", "safe-user")])
        self.assertEqual(removed, [])

    def test_settlement_with_queue_but_no_uids_is_held_for_review(self):
        review_marks = []
        settle_calls = []
        removed = []

        class Outbox:
            def mark_settlement_review(self, *args):
                review_marks.append(args)

            def remove_settlement(self, playback_id):
                removed.append(playback_id)

        namespace = {
            "SOCIAL_OUTBOX": Outbox(),
            "logger": type("Logger", (), {"warning": lambda *args: None, "exception": lambda *args: None})(),
            "settle_playback_user": lambda *args: settle_calls.append(args),
        }
        self._load_functions(["_process_playback_settlement"], namespace)
        settlement = {
            "playbackId": "playback-no-users",
            "songId": "song.mp4",
            "uids": [],
            "queueIdentity": {"createTime": "original"},
        }

        result = namespace["_process_playback_settlement"](settlement)

        self.assertFalse(result)
        self.assertEqual(review_marks, [("playback-no-users", "__queue__", "no-attribution")])
        self.assertEqual(settle_calls, [])
        self.assertEqual(removed, [])


if __name__ == "__main__":
    unittest.main()
