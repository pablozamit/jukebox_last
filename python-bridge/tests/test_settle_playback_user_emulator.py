"""Firestore emulator integration tests for the production settlement transaction.

Set ``FIRESTORE_EMULATOR_HOST=127.0.0.1:19080`` to run against the dedicated
Firestore emulator. The test refuses other hosts and ports and always uses the
isolated ``demo-bridge-test`` project with anonymous credentials. It extracts
the production function to avoid bridge startup, Firebase production
credentials, and Kodi connections.
"""
import ast
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import os
from pathlib import Path
import re
import time
import unittest
import uuid

import firebase_admin
from firebase_admin import firestore
from google.auth.credentials import AnonymousCredentials

from social_events import (
    playback_settlement_id,
    queue_generation_matches,
    settlement_changes,
    token_snapshot_version,
)


SOURCE = Path(__file__).resolve().parents[1] / "bridge.py"
TREE = ast.parse(SOURCE.read_text(encoding="utf-8"))
FUNCTION = next(
    node for node in TREE.body
    if isinstance(node, ast.FunctionDef) and node.name == "settle_playback_user"
)
PROJECT_ID = "demo-bridge-test"
EMULATOR_HOST = os.environ.get("FIRESTORE_EMULATOR_HOST", "")
HOST_MATCH = re.fullmatch(r"(127\.0\.0\.1|localhost):(\d{1,5})", EMULATOR_HOST)


class SettlePlaybackUserEmulatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if HOST_MATCH is None or int(HOST_MATCH.group(2)) != 19080:
            raise unittest.SkipTest(
                "requires the dedicated FIRESTORE_EMULATOR_HOST at 127.0.0.1:19080"
            )
        os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT_ID
        cls.app = firebase_admin.initialize_app(
            AnonymousCredentials(),
            options={"projectId": PROJECT_ID},
            name=f"bridge-settlement-{uuid.uuid4().hex}",
        )
        cls.db = firestore.client(app=cls.app)
        cls.namespace = {
            "db": cls.db,
            "firestore": firestore,
            "datetime": datetime,
            "time": time,
            "playback_settlement_id": playback_settlement_id,
            "queue_generation_matches": queue_generation_matches,
            "token_snapshot_version": token_snapshot_version,
            "settlement_changes": settlement_changes,
        }
        exec(
            compile(ast.Module(body=[FUNCTION], type_ignores=[]), str(SOURCE), "exec"),
            cls.namespace,
        )

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "app"):
            firebase_admin.delete_app(cls.app)

    def setUp(self):
        self.uid = f"test_{uuid.uuid4().hex}"
        self.song_id = f"song_{uuid.uuid4().hex}.mp4"
        self.playback_id = f"play_{uuid.uuid4().hex}"
        self.generation = f"generation_{uuid.uuid4().hex}"
        self.extra_user_refs = []
        self.extra_receipts = []
        self.user_ref = self.db.collection("users").document(self.uid)
        self.song_ref = self.db.collection("songs").document(self.song_id)
        self.night_ref = self.db.collection("leaderboard").document("noche")
        self.week_ref = self.db.collection("leaderboard").document("semana")
        self.queue_identity = {
            "bridgeQueueId": self.generation,
            "firstVotedAt": 1_800_000_000_000,
            "votes": 1,
        }

    def tearDown(self):
        self.user_ref.delete()
        self.song_ref.delete()
        self.db.collection("playbackSettlements").document(
            playback_settlement_id(self.playback_id, self.uid)
        ).delete()
        for ref in self.extra_user_refs:
            ref.delete()
        for receipt in self.extra_receipts:
            receipt.delete()
        self._remove_leaderboard_uid(self.night_ref, self.uid)
        self._remove_leaderboard_uid(self.week_ref, self.uid)
        for ref in self.extra_user_refs:
            uid = ref.id
            self._remove_leaderboard_uid(self.night_ref, uid)
            self._remove_leaderboard_uid(self.week_ref, uid)

    def _remove_leaderboard_uid(self, ref, uid):
        snapshot = ref.get()
        if not snapshot.exists:
            return
        data = snapshot.to_dict() or {}
        for key in ("points", "names"):
            values = dict(data.get(key) or {})
            values.pop(uid, None)
            data[key] = values
        ref.set(data)

    def _seed(self, *, tokens=None, votes=1, generation=None, points=0, earned=0):
        self.user_ref.set({
            "djName": "Integration DJ",
            "proposals": list((tokens or {}).get("proposals", [])),
            "votes": list((tokens or {}).get("votes", [])),
            "points": points,
            "totalPointsEarned": earned,
            "visitDates": [],
        })
        self.song_ref.set({
            "votes": votes,
            "firstVotedAt": self.queue_identity["firstVotedAt"],
            "bridgeQueueId": generation or self.generation,
        })
        user_snapshot = self.user_ref.get()
        return token_snapshot_version(user_snapshot.update_time)

    def _settle(self, *, award=5, identity=None, token_version=None, playback_id=None):
        return self.namespace["settle_playback_user"](
            self.song_id,
            playback_id or self.playback_id,
            self.uid,
            award,
            identity or self.queue_identity,
            token_version,
        )

    def _settle_with_emulator_contention_retry(self, token_version, playback_id=None):
        # The emulator can exhaust the production transaction's five attempts
        # when identical transactions hold the same document lock. Retry at the
        # outbox boundary, matching the bridge's durable retry behavior.
        for attempt in range(3):
            try:
                return self._settle(token_version=token_version, playback_id=playback_id)
            except ValueError as error:
                if "Failed to commit transaction" not in str(error) or attempt == 2:
                    raise
                time.sleep(0.05 * (attempt + 1))

    def _read_tokens(self):
        data = self.user_ref.get().to_dict()
        return data["proposals"], data["votes"], data["points"], data["totalPointsEarned"]

    def test_normal_vote_settlement_consumes_token_and_awards_points(self):
        token_version = self._seed(tokens={"votes": [self.song_id]}, votes=1)

        points = self._settle(token_version=token_version)

        self.assertEqual(points, 5)
        self.assertEqual(self._read_tokens(), ([], [], 5, 5))
        self.assertFalse(self.song_ref.get().exists)
        receipt = self.db.collection("playbackSettlements").document(
            playback_settlement_id(self.playback_id, self.uid)
        ).get()
        self.assertTrue(receipt.exists)

    def test_late_vote_from_another_uid_remains_in_queue(self):
        other_uid = f"test_{uuid.uuid4().hex}"
        other_user_ref = self.db.collection("users").document(other_uid)
        token_version = self._seed(tokens={"votes": [self.song_id]}, votes=2)
        other_user_ref.set({"votes": [self.song_id], "proposals": []})
        self.addCleanup(other_user_ref.delete)

        points = self._settle(token_version=token_version)

        self.assertEqual(points, 5)
        self.assertEqual(self._read_tokens(), ([], [], 5, 5))
        self.assertEqual(self.song_ref.get().to_dict()["votes"], 1)
        self.assertEqual(other_user_ref.get().to_dict()["votes"], [self.song_id])

    def test_changed_user_token_version_returns_none_without_writes(self):
        captured_version = self._seed(tokens={"votes": [self.song_id]}, votes=1)
        changed_token = f"later_{uuid.uuid4().hex}.mp4"
        self.user_ref.update({"votes": [changed_token]})

        outcome = self._settle(token_version=captured_version)

        self.assertIsNone(outcome)
        self.assertEqual(self._read_tokens(), ([], [changed_token], 0, 0))
        self.assertEqual(self.song_ref.get().to_dict()["votes"], 1)
        self.assertFalse(self.db.collection("playbackSettlements").document(
            playback_settlement_id(self.playback_id, self.uid)
        ).get().exists)

    def test_new_queue_generation_preserves_existing_token(self):
        token_version = self._seed(
            tokens={"votes": [self.song_id]},
            votes=3,
            generation=f"new_{uuid.uuid4().hex}",
        )

        points = self._settle(token_version=token_version)

        self.assertEqual(points, 5)
        self.assertEqual(self._read_tokens(), ([], [self.song_id], 5, 5))
        self.assertEqual(self.song_ref.get().to_dict()["votes"], 3)

    def test_proposal_and_vote_consume_two_queue_votes(self):
        token_version = self._seed(
            tokens={"proposals": [self.song_id], "votes": [self.song_id]},
            votes=2,
        )

        points = self._settle(award=10, token_version=token_version)

        self.assertEqual(points, 10)
        self.assertEqual(self._read_tokens(), ([], [], 10, 10))
        self.assertFalse(self.song_ref.get().exists)

    def test_playback_receipt_makes_settlement_idempotent(self):
        token_version = self._seed(tokens={"votes": [self.song_id]}, votes=1)

        first = self._settle(token_version=token_version)
        second = self._settle(token_version=token_version)

        self.assertEqual((first, second), (5, 0))
        self.assertEqual(self._read_tokens(), ([], [], 5, 5))
        night = self.night_ref.get().to_dict()
        self.assertEqual(night["points"][self.uid], 5)

    def test_concurrent_duplicate_settlement_awards_once_and_decrements_once(self):
        token_version = self._seed(tokens={"votes": [self.song_id]}, votes=1)

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [
                executor.submit(self._settle_with_emulator_contention_retry, token_version)
                for _ in range(2)
            ]
            outcomes = [future.result(timeout=20) for future in futures]

        self.assertEqual(sum(outcomes), 5)
        self.assertCountEqual(outcomes, [0, 5])
        self.assertEqual(self._read_tokens(), ([], [], 5, 5))
        self.assertFalse(self.song_ref.get().exists)
        night = self.night_ref.get().to_dict()
        self.assertEqual(night["points"][self.uid], 5)

    def test_concurrent_distinct_users_settle_same_song_without_losing_votes(self):
        first_version = self._seed(tokens={"votes": [self.song_id]}, votes=2)
        other_uid = f"test_{uuid.uuid4().hex}"
        other_ref = self.db.collection("users").document(other_uid)
        other_ref.set({
            "djName": "Second DJ",
            "proposals": [],
            "votes": [self.song_id],
            "points": 0,
            "totalPointsEarned": 0,
            "visitDates": [],
        })
        self.extra_user_refs.append(other_ref)
        other_version = token_snapshot_version(other_ref.get().update_time)
        playback_id = f"play_{uuid.uuid4().hex}"
        first_receipt = self.db.collection("playbackSettlements").document(
            playback_settlement_id(playback_id, self.uid)
        )
        second_receipt = self.db.collection("playbackSettlements").document(
            playback_settlement_id(playback_id, other_uid)
        )
        self.extra_receipts.extend([first_receipt, second_receipt])

        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(
                self._settle_with_emulator_contention_retry,
                first_version,
                playback_id,
            )
            second = executor.submit(
                self._settle_for_user_with_emulator_contention_retry,
                other_uid, playback_id, other_version,
            )
            outcomes = [first.result(timeout=20), second.result(timeout=20)]

        self.assertEqual(outcomes, [5, 5])
        self.assertEqual(self._read_tokens(), ([], [], 5, 5))
        self.assertEqual(other_ref.get().to_dict()["votes"], [])
        self.assertFalse(self.song_ref.get().exists)
        self.assertTrue(first_receipt.get().exists)
        self.assertTrue(second_receipt.get().exists)
        night = self.night_ref.get().to_dict()
        self.assertEqual(night["points"][self.uid], 5)
        self.assertEqual(night["points"][other_uid], 5)

    def _settle_for_user_with_emulator_contention_retry(self, uid, playback_id, token_version):
        for attempt in range(3):
            try:
                return self.namespace["settle_playback_user"](
                    self.song_id, playback_id, uid, 5, self.queue_identity, token_version,
                )
            except ValueError as error:
                if "Failed to commit transaction" not in str(error) or attempt == 2:
                    raise
                time.sleep(0.05 * (attempt + 1))


if __name__ == "__main__":
    unittest.main()
