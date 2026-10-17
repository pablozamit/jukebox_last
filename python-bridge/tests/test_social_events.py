import tempfile
import unittest
import sys
import itertools
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from social_events import (
    LocalOutbox,
    certified_playback_attribution,
    certified_support_uids,
    effective_peak_votes,
    event_in_queue_generation,
    event_id,
    night_close_events,
    peak_event,
    playback_capture_snapshot,
    participation_event,
    playback_event_id,
    playback_events,
    playback_settlement_id,
    complete_night_close,
    publish_certified,
    queue_identity_matches,
    social_session_id,
    settlement_changes,
    should_track_playback_settlement,
)


class FakeDocument:
    def __init__(self, collection, key):
        self.collection, self.key = collection, key

    def set(self, payload):
        if self.collection.fail:
            raise OSError("offline")
        self.collection.documents[self.key] = payload
        if self.key not in self.collection.processed:
            self.collection.processed.add(self.key)
            self.collection.adjudications += 1
        if self.collection.crash_after_write_once:
            self.collection.crash_after_write_once = False
            raise OSError("connection dropped after server applied write")


class FakeCollection:
    def __init__(self):
        self.documents = {}
        self.fail = False
        self.processed = set()
        self.adjudications = 0
        self.crash_after_write_once = False

    def document(self, key):
        return FakeDocument(self, key)


class SocialEventTests(unittest.TestCase):
    def test_participation_deduplicates_per_user_song_day_and_kind(self):
        when = datetime(2026, 10, 16, 23, 15, tzinfo=timezone.utc)
        first = participation_event(kind="vote", uid="u1", song_id="s1", occurred_at=when, source_id="vote-1")
        replay = participation_event(kind="vote", uid="u1", song_id="s1", occurred_at=when, source_id="vote-2")
        proposal = participation_event(kind="proposal", uid="u1", song_id="s1", occurred_at=when, source_id="vote-3")
        other_song = participation_event(kind="vote", uid="u1", song_id="s2", occurred_at=when, source_id="vote-4")
        self.assertEqual(first["id"], replay["id"])
        self.assertNotEqual(first["id"], proposal["id"])
        self.assertNotEqual(first["id"], other_song["id"])
        self.assertEqual(first["id"], event_id("vote", "u1", "s1", first["sessionId"]))
        self.assertEqual(first["sourceId"], "vote-1")

    def test_published_event_ledger_prevents_requeue_and_peak_has_stable_milestone_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            outbox = LocalOutbox(Path(tmp) / "outbox.json")
            when = datetime(2026, 10, 17, 20, tzinfo=timezone.utc)
            event = peak_event(uid="u1", song_id="s1", session_id="2026-10-17", occurred_at=when,
                               peak_votes=10, source_id="vote-event-10")
            self.assertTrue(outbox.add_certified_event(f"peak:{event['id']}", event))
            self.assertFalse(outbox.add_certified_event(f"peak:{event['id']}", event))
            collection = FakeCollection()
            self.assertEqual(publish_certified(outbox, collection), (1, 0))
            self.assertFalse(outbox.add_certified_event(f"peak:{event['id']}", event))
            self.assertEqual(collection.adjudications, 1)
            self.assertEqual(event["kind"], "peak")
            self.assertEqual(event["peakVotes"], 10)

    def test_peak_threshold_requires_distinct_counted_events_and_current_user_tokens(self):
        # Token-only client mutations cannot certify support; event-only rows
        # whose token was removed cannot inflate the current tally.
        supporters = certified_support_uids(
            ["valid-a", "valid-b", "valid-b", "event-only"],
            ["valid-a", "valid-b", "token-only"],
        )
        self.assertEqual(supporters, {"valid-a", "valid-b"})
        self.assertEqual(effective_peak_votes(99, supporters), 2)
        self.assertEqual(effective_peak_votes(1, supporters), 1)

    def test_capture_keeps_raw_queue_identity_but_certifies_reward_peak(self):
        raw_votes = 10
        reward_peak, queue_identity = playback_capture_snapshot(
            raw_votes, {"certified-user"},
            {"firstVotedAt": 1234, "votes": raw_votes}, "queue-generation-1",
        )
        self.assertEqual(reward_peak, 1)
        self.assertEqual(queue_identity["votes"], raw_votes)
        self.assertTrue(queue_identity_matches(queue_identity, {
            "firstVotedAt": 1234, "votes": raw_votes, "bridgeQueueId": "queue-generation-1",
        }))

    def test_play_evidence_excludes_uncertified_array_only_tokens(self):
        attribution = [
            {"uid": "valid", "role": "proposer", "certified": True},
            {"uid": "array-only", "role": "proposer", "certified": False},
        ]
        social = certified_playback_attribution(attribution)
        self.assertEqual([person["uid"] for person in social], ["valid"])
        events = playback_events(
            playback_id="ack-1", song_id="song.mp4", session_id="2026-10-17",
            occurred_at=datetime(2026, 10, 17, 18, tzinfo=timezone.utc),
            certified_at=datetime(2026, 10, 17, 18, tzinfo=timezone.utc),
            source_id="ack-1", peak_votes=10, attribution=social,
        )
        self.assertEqual([event["uid"] for event in events], ["valid"])

    def test_old_nested_vote_events_do_not_certify_requeued_song(self):
        old = datetime(2026, 10, 17, 16, tzinfo=timezone.utc)
        requeued = datetime(2026, 10, 17, 18, tzinfo=timezone.utc)
        self.assertFalse(event_in_queue_generation(old, requeued))
        self.assertTrue(event_in_queue_generation(requeued, requeued))
        self.assertTrue(event_in_queue_generation(requeued, None))

    def test_social_day_uses_madrid_two_am_boundary_and_dst(self):
        self.assertEqual(social_session_id(datetime(2026, 1, 5, 0, 30, tzinfo=timezone.utc)), "2026-01-04")
        self.assertEqual(social_session_id(datetime(2026, 1, 5, 1, 30, tzinfo=timezone.utc)), "2026-01-05")
        # Autumn clock change: both folds remain on the same local social day.
        self.assertEqual(social_session_id(datetime(2026, 10, 25, 0, 30, tzinfo=timezone.utc)), "2026-10-25")
        self.assertEqual(social_session_id(datetime(2026, 10, 25, 1, 30, tzinfo=timezone.utc)), "2026-10-25")
        # Spring-forward skips from 01:59 to 03:00; it does not create a false day.
        self.assertEqual(social_session_id(datetime(2026, 3, 29, 0, 30, tzinfo=timezone.utc)), "2026-03-28")
        self.assertEqual(social_session_id(datetime(2026, 3, 29, 1, 30, tzinfo=timezone.utc)), "2026-03-29")

    def test_intent_survives_restart_and_unacknowledged_intent_is_not_published(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "outbox.json"
            LocalOutbox(path).put("playback-1", {"status": "intent", "playbackId": "playback-1"})
            restarted = LocalOutbox(path)
            collection = FakeCollection()
            self.assertEqual(publish_certified(restarted, collection), (0, 0))
            self.assertEqual(collection.documents, {})
            self.assertEqual(restarted.entries()[0]["status"], "intent")

    def test_only_certified_playback_emits_stable_events_and_retry_survives_outage(self):
        with tempfile.TemporaryDirectory() as tmp:
            outbox = LocalOutbox(Path(tmp) / "outbox.json")
            start = datetime(2026, 10, 17, 19, 0, tzinfo=timezone.utc)
            ack = datetime(2026, 10, 17, 19, 0, 1, tzinfo=timezone.utc)
            events = playback_events(
                playback_id="p-123", song_id="song.mp4", session_id="2026-10-17",
                occurred_at=start, certified_at=ack, source_id="p-123", peak_votes=8,
                attribution=[{"uid": "u1", "role": "proposer"}, {"uid": "u2", "role": "voter"}],
            )
            self.assertEqual(events[0]["id"], playback_event_id("p-123", "u1"))
            self.assertEqual(events[0]["kind"], "play")
            self.assertEqual(events[0]["peakVotes"], 8)
            self.assertEqual(events[0]["role"], "proposer")
            outbox.put("p-123", {"status": "certified", "events": events})
            collection = FakeCollection()
            collection.fail = True
            self.assertEqual(publish_certified(outbox, collection), (0, 1))
            self.assertEqual(len(outbox.entries()), 1)
            collection.fail = False
            restarted = LocalOutbox(Path(tmp) / "outbox.json")
            self.assertEqual(publish_certified(restarted, collection), (2, 0))
            self.assertEqual(len(collection.documents), 2)
            self.assertEqual(restarted.entries(), [])

    def test_equal_nightly_peak_is_preserved_as_same_peak_for_all_attributed_users(self):
        entries = playback_events(
            playback_id="p-peak", song_id="s", session_id="2026-10-17",
            occurred_at=datetime(2026, 10, 17, 20, tzinfo=timezone.utc),
            certified_at=datetime(2026, 10, 17, 20, 0, 1, tzinfo=timezone.utc),
            source_id="p-peak", peak_votes=12,
            attribution=[{"uid": "u1", "role": "voter"}, {"uid": "u2", "role": "voter"}],
        )
        self.assertEqual([entry["peakVotes"] for entry in entries], [12, 12])

    def test_peak_summary_rises_on_replayed_deduplicated_participation_and_ties_close(self):
        with tempfile.TemporaryDirectory() as tmp:
            outbox = LocalOutbox(Path(tmp) / "outbox.json")
            at = datetime(2026, 10, 17, 20, tzinfo=timezone.utc)
            first = participation_event(kind="proposal", uid="u1", song_id="song-a", occurred_at=at,
                                        source_id="event-1", peak_votes=5)
            replay = participation_event(kind="proposal", uid="u1", song_id="song-a", occurred_at=at,
                                         source_id="event-1", peak_votes=9)
            tie = participation_event(kind="proposal", uid="u2", song_id="song-b", occurred_at=at,
                                      source_id="event-2", peak_votes=9)
            # Stable participation IDs remain deduplicated; the independent summary retains a later peak.
            self.assertEqual(first["id"], replay["id"])
            outbox.put("event-a", {"status": "certified", "events": [first]})
            outbox.put("event-a", {"status": "certified", "events": [replay]})
            outbox.put("event-b", {"status": "certified", "events": [tie]})
            summary = outbox.nightly_summary(first["sessionId"])
            self.assertEqual(summary["song-a"]["peakVotes"], 9)
            closed = night_close_events(session_id=first["sessionId"], occurred_at=at, peak_summary=summary)
            self.assertEqual({event["songId"] for event in closed}, {"song-a", "song-b"})
            self.assertTrue(all(event["kind"] == "night_close" for event in closed))

    def test_zero_vote_night_emits_no_winner(self):
        self.assertEqual(night_close_events(
            session_id="2026-10-17", occurred_at=datetime(2026, 10, 18, 0, tzinfo=timezone.utc),
            peak_summary={"song.mp4": {"peakVotes": 0, "proposerUids": ["u1"]}},
        ), [])

    def test_failed_night_read_persists_across_restart_then_certifies_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "outbox.json"
            outbox = LocalOutbox(path)
            occurred = datetime(2026, 10, 17, 23, 0, tzinfo=timezone.utc)
            session = "2026-10-17"
            outbox.put("proposal", {"status": "certified", "events": [participation_event(
                kind="proposal", uid="u1", song_id="song-a", occurred_at=occurred,
                source_id="vote-event", peak_votes=11,
            )]})

            def offline_read():
                raise OSError("Firestore unavailable")

            self.assertIsNone(complete_night_close(
                outbox, session, occurred, offline_read, event_start_ms=1000, event_end_ms=2000,
            ))
            pending = outbox.pending_night_closures()[0]
            self.assertEqual(pending["sessionId"], session)
            self.assertEqual((pending["eventStartMs"], pending["eventEndMs"]), (1000, 2000))
            outbox.remove("proposal")  # The bridge flushes validated events before closing.

            restarted = LocalOutbox(path)
            later_retry_time = datetime(2026, 10, 18, 0, 20, tzinfo=timezone.utc)
            events = complete_night_close(
                restarted, session, later_retry_time,
                lambda: {"song-a": {"peakVotes": 11, "proposerUids": ["u1"]}},
            )
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["kind"], "night_close")
            self.assertEqual(events[0]["occurredAt"], "2026-10-17T23:00:00.000Z")
            self.assertEqual(restarted.entries()[0]["status"], "certified")
            repeated_close = complete_night_close(
                restarted, session, later_retry_time,
                lambda: {"song-b": {"peakVotes": 99, "proposerUids": ["u2"]}},
            )
            self.assertEqual([event["id"] for event in repeated_close], [event["id"] for event in events])

            collection = FakeCollection()
            collection.crash_after_write_once = True
            self.assertEqual(publish_certified(restarted, collection), (0, 1))
            self.assertEqual(publish_certified(LocalOutbox(path), collection), (1, 0))
            self.assertEqual(collection.adjudications, 1)
            self.assertEqual(collection.documents[events[0]["id"]]["sourceId"], events[0]["sourceId"])
            self.assertEqual(LocalOutbox(path).entries(), [])

    def test_settlement_receipt_and_mutation_are_idempotent_and_preserve_10_5_awards(self):
        proposal = {"proposals": ["s"], "votes": ["s"], "points": 40, "totalPointsEarned": 100}
        vote = {"proposals": [], "votes": ["s"], "points": 40, "totalPointsEarned": 100}
        self.assertEqual(settlement_changes(proposal, "s", "2026-10-17")["award"], 10)
        self.assertEqual(settlement_changes(vote, "s", "2026-10-17")["award"], 5)
        self.assertEqual(settlement_changes(proposal, "s", "2026-10-17")["proposals"], [])
        self.assertEqual(settlement_changes(proposal, "s", "2026-10-17")["votes"], [])
        # A rollover may clear the arrays before retry; the captured award survives.
        self.assertEqual(settlement_changes({"proposals": [], "votes": [], "points": 10}, "s", "2026-10-17", 10)["award"], 10)
        self.assertEqual(settlement_changes({"proposals": [], "votes": [], "points": 10}, "s", "2026-10-17", 5)["award"], 5)
        self.assertIsNone(settlement_changes(settlement_changes(proposal, "s", "2026-10-17"), "s", "2026-10-17"))
        self.assertEqual(playback_settlement_id("playback", "uid"), playback_settlement_id("playback", "uid"))
        self.assertNotEqual(playback_settlement_id("playback-a", "uid"), playback_settlement_id("playback-b", "uid"))

    def test_settlement_serializes_safely_with_purchase_and_vote_redemption(self):
        # Firestore conflicts on the shared user document; every serial order must
        # re-read the balance before applying the purchase/redemption transaction.
        for order in itertools.permutations(("settle", "buy", "redeem")):
            user = {"proposals": ["song"], "votes": [], "points": 55,
                    "totalPointsEarned": 200, "freeVotes": 0}
            receipt_ids = set()
            settlement_receipt = playback_settlement_id("play-1", "user-1")
            for operation in order:
                if operation == "settle":
                    if settlement_receipt not in receipt_ids:
                        change = settlement_changes(user, "song", "2026-10-17")
                        if change:
                            user.update({key: value for key, value in change.items() if key != "award" and key != "visitDate"})
                            receipt_ids.add(settlement_receipt)
                elif operation == "buy" and user["points"] >= 20:
                    user["points"] -= 20
                elif operation == "redeem" and user["points"] >= 50:
                    user["points"] -= 50
                    user["freeVotes"] += 1
            self.assertEqual(user["totalPointsEarned"], 210)
            self.assertGreaterEqual(user["points"], 0)
            self.assertEqual(user["proposals"], [])
            self.assertEqual(receipt_ids, {settlement_receipt})

    def test_settlement_intent_survives_restart_and_does_not_match_a_new_same_song_queue(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "outbox.json"
            first = LocalOutbox(path)
            identity = {"firstVotedAt": 1000, "votes": 3}
            first.put_settlement("play-1", "song", identity, ["u1", "u2"], {"u1": 10, "u2": 5})
            first.mark_settlement_user("play-1", "u1")

            restarted = LocalOutbox(path)
            pending = restarted.pending_settlements()[0]
            self.assertEqual(pending["settledUids"], ["u1"])
            self.assertEqual(pending["awards"], {"u1": 10, "u2": 5})
            self.assertTrue(queue_identity_matches(identity, {"firstVotedAt": 1000, "votes": 3}))
            self.assertFalse(queue_identity_matches(identity, {"firstVotedAt": 2000, "votes": 3}))
            self.assertFalse(queue_identity_matches(identity, {"firstVotedAt": 1000, "votes": 4}))
            self.assertFalse(queue_identity_matches(None, {"firstVotedAt": 1000, "votes": 3}))

    def test_random_track_without_queue_or_users_does_not_create_a_settlement(self):
        self.assertFalse(should_track_playback_settlement(None, []))
        self.assertTrue(should_track_playback_settlement(None, ["u1"]))
        self.assertTrue(should_track_playback_settlement({"firstVotedAt": 1000}, []))


if __name__ == "__main__":
    unittest.main()
