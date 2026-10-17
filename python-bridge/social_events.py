"""Pure social-event contracts and a small durable local outbox.

This module deliberately has no Firebase, Kodi, or environment side effects so
its persistence and event contracts can be tested without importing bridge.py.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import threading
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


SCHEMA_VERSION = 1
MADRID = ZoneInfo("Europe/Madrid")


def utc_iso(value: datetime | None = None) -> str:
    value = value or datetime.now(timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def social_session_id(value: datetime | None = None) -> str:
    """Return the Europe/Madrid social day, which rolls over at 02:00 local."""
    value = value or datetime.now(timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=MADRID)
    local = value.astimezone(MADRID)
    day = local.date() - (timedelta(days=1) if local.timetz().replace(tzinfo=None) < time(2, 0) else timedelta())
    return day.isoformat()


def event_id(kind: str, uid: str, song_id: str, session_id: str) -> str:
    return hashlib.sha256(json.dumps(
        [kind, uid, song_id, session_id], ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")).hexdigest()


def playback_event_id(playback_id: str, uid: str) -> str:
    return hashlib.sha256(json.dumps(
        ["play", playback_id, uid], ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")).hexdigest()


def song_peak_document_id(session_id: str, song_id: str) -> str:
    return hashlib.sha256(json.dumps(
        [session_id, song_id], ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")).hexdigest()


def playback_settlement_id(playback_id: str, uid: str) -> str:
    return hashlib.sha256(json.dumps(
        [playback_id, uid], ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")).hexdigest()


def peak_event(*, uid: str, song_id: str, session_id: str, occurred_at: datetime,
               peak_votes: int, source_id: str) -> dict:
    if int(peak_votes) < 10:
        raise ValueError("peak event requires at least 10 votes")
    record = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "peak",
        "uid": uid,
        "songId": song_id,
        "sessionId": session_id,
        "occurredAt": utc_iso(occurred_at),
        "certifiedAt": utc_iso(),
        "sourceId": source_id,
        "peakVotes": int(peak_votes),
    }
    return {"id": event_id("peak", uid, song_id, session_id), **record}


def settlement_changes(user_data: dict, song_id: str, today: str, captured_award: int | None = None) -> dict | None:
    """Compute the legacy token removal and 10/5 point grant from a transaction snapshot."""
    proposals = list(user_data.get("proposals") or [])
    votes = list(user_data.get("votes") or [])
    if captured_award in (10, 5):
        award = captured_award
    elif song_id in proposals:
        award = 10
    elif song_id in votes:
        award = 5
    else:
        return None
    return {
        "award": award,
        "proposals": [song for song in proposals if song != song_id],
        "votes": [song for song in votes if song != song_id],
        "points": int(user_data.get("points", 0) or 0) + award,
        "totalPointsEarned": int(user_data.get("totalPointsEarned", 0) or 0) + award,
        "visitDate": today,
    }


def effective_peak_votes(raw_votes: int, support_uids) -> int:
    """Cap a client-writable tally by distinct users with an actual token."""
    return min(max(0, int(raw_votes or 0)), len(set(support_uids or [])))


def playback_capture_snapshot(raw_votes: int, support_uids, song_data: dict | None,
                              queue_id: str | None) -> tuple[int, dict | None]:
    """Keep queue identity raw while separately certifying the reward tally."""
    peak_votes = effective_peak_votes(raw_votes, support_uids)
    if song_data is None:
        return peak_votes, None
    queue_identity = {
        "firstVotedAt": song_data.get("firstVotedAt"),
        "bridgeQueueId": queue_id,
        "votes": max(0, int(raw_votes or 0)),
    }
    return peak_votes, queue_identity


def certified_support_uids(event_uids, token_uids) -> set[str]:
    """Require both a bridge-counted event and a current per-user song token."""
    return set(event_uids or []) & set(token_uids or [])


def event_in_queue_generation(event_created_at, queue_created_at) -> bool:
    """An old nested vote event must not certify a newly created song document."""
    return queue_created_at is None or (event_created_at is not None and event_created_at >= queue_created_at)


def certified_playback_attribution(attribution: list[dict]) -> list[dict]:
    """Only bridge-validated song tokens may produce social play evidence."""
    return [person for person in attribution if person.get("certified") is True]


def should_track_playback_settlement(queue_identity: dict | None, uids) -> bool:
    """A random catalog track with no queue and no attributed users needs no receipt."""
    return bool(queue_identity) or bool(set(uids or []))


def queue_identity_matches(captured: dict | None, current: dict | None) -> bool:
    """Guard against deleting a newer same-song queue after delayed settlement."""
    if not captured or not current or captured.get("firstVotedAt") is None:
        return False
    queue_id = captured.get("bridgeQueueId")
    if queue_id and current.get("bridgeQueueId") != queue_id:
        return False
    return (
        current.get("firstVotedAt") == captured["firstVotedAt"]
        and int(current.get("votes", 0) or 0) == int(captured.get("votes", -1))
    )


def night_close_events(*, session_id: str, occurred_at: datetime, peak_summary: dict) -> list[dict]:
    """Build a winner event for every tied song peak, with each known proposer."""
    songs = peak_summary or {}
    maximum = max((int(value.get("peakVotes", 0) or 0) for value in songs.values()), default=0)
    if maximum <= 0:
        return []
    records = []
    certified_at = utc_iso()
    for song_id, value in sorted(songs.items()):
        if int(value.get("peakVotes", 0) or 0) != maximum:
            continue
        for uid in sorted(set(value.get("proposerUids", []))):
            record = {
                "schemaVersion": SCHEMA_VERSION,
                "kind": "night_close",
                "uid": uid,
                "songId": song_id,
                "sessionId": session_id,
                "occurredAt": utc_iso(occurred_at),
                "certifiedAt": certified_at,
                "sourceId": f"night-close:{session_id}:{song_id}:{uid}",
                "peakVotes": maximum,
            }
            records.append({"id": event_id("night_close", uid, song_id, session_id), **record})
    return records


def participation_event(*, kind: str, uid: str, song_id: str, occurred_at: datetime,
                        source_id: str, peak_votes: int | None = None) -> dict:
    if kind not in ("vote", "proposal"):
        raise ValueError("participation kind must be vote or proposal")
    session_id = social_session_id(occurred_at)
    record = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": kind,
        "uid": uid,
        "songId": song_id,
        "sessionId": session_id,
        "occurredAt": utc_iso(occurred_at),
        "certifiedAt": utc_iso(),
        "sourceId": source_id,
    }
    if peak_votes is not None:
        record["peakVotes"] = max(0, int(peak_votes))
    return {"id": event_id(kind, uid, song_id, session_id), **record}


def playback_events(*, playback_id: str, song_id: str, session_id: str,
                    occurred_at: datetime, certified_at: datetime,
                    source_id: str, peak_votes: int,
                    attribution: list[dict]) -> list[dict]:
    result = []
    for person in attribution:
        uid = str(person.get("uid", ""))
        if not uid:
            continue
        role = person.get("role")
        record = {
            "schemaVersion": SCHEMA_VERSION,
            "kind": "play",
            "uid": uid,
            "songId": song_id,
            "sessionId": session_id,
            "occurredAt": utc_iso(occurred_at),
            "certifiedAt": utc_iso(certified_at),
            "sourceId": source_id,
            "playbackId": playback_id,
            "peakVotes": max(0, int(peak_votes)),
        }
        if role in ("proposer", "voter"):
            record["role"] = role
        result.append({"id": playback_event_id(playback_id, uid), **record})
    return result


class LocalOutbox:
    """Atomically replace a small JSON journal; never stores credentials."""

    def __init__(self, path: str | os.PathLike):
        self.path = Path(path)
        self._lock = threading.RLock()

    def _read(self) -> dict:
        if not self.path.exists():
            return {"schemaVersion": SCHEMA_VERSION, "entries": {}, "nightly": {}, "published": {}, "peakSynced": {}, "settlements": {}}
        data = json.loads(self.path.read_text(encoding="utf-8"))
        if data.get("schemaVersion") != SCHEMA_VERSION or not isinstance(data.get("entries"), dict):
            raise ValueError("unsupported or malformed social outbox")
        data.setdefault("nightly", {})
        data.setdefault("published", {})
        data.setdefault("peakSynced", {})
        data.setdefault("settlements", {})
        return data

    @staticmethod
    def _accumulate(data: dict, events: list[dict]) -> None:
        for event in events:
            session_id, song_id = event.get("sessionId"), event.get("songId")
            if not session_id or not song_id:
                continue
            session = data["nightly"].setdefault(session_id, {})
            song = session.setdefault(song_id, {"peakVotes": 0, "proposerUids": []})
            song["peakVotes"] = max(int(song.get("peakVotes", 0) or 0), int(event.get("peakVotes", 0) or 0))
            uid = event.get("uid")
            if uid and (event.get("kind") in ("proposal", "peak") or event.get("role") == "proposer"):
                song["proposerUids"] = sorted(set(song.get("proposerUids", [])) | {uid})

    def _write(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(prefix=f".{self.path.name}.", suffix=".tmp", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as temp:
                json.dump(data, temp, ensure_ascii=False, separators=(",", ":"))
                temp.flush()
                os.fsync(temp.fileno())
            os.replace(temp_name, self.path)
            # Flush the containing directory on platforms that support it.
            try:
                directory_fd = os.open(self.path.parent, os.O_RDONLY)
                try:
                    os.fsync(directory_fd)
                finally:
                    os.close(directory_fd)
            except (OSError, AttributeError):
                pass
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)

    def put(self, key: str, entry: dict) -> None:
        with self._lock:
            data = self._read()
            data["entries"][key] = entry
            if entry.get("status") == "certified":
                self._accumulate(data, entry.get("events", []))
            self._write(data)

    def add_certified_event(self, key: str, event: dict, **metadata) -> bool:
        """Durably enqueue an event once per session, including after a restart."""
        with self._lock:
            data = self._read()
            event_id_value = event["id"]
            session_id = event.get("sessionId", "")
            published = set(data["published"].get(session_id, []))
            queued = {
                item["id"]
                for entry in data["entries"].values()
                for item in entry.get("events", [])
            }
            if event_id_value in published or event_id_value in queued:
                return False
            entry = data["entries"].setdefault(key, {"status": "certified", **metadata, "events": []})
            entry.update({"status": "certified", **metadata})
            entry.setdefault("events", []).append(event)
            self._accumulate(data, [event])
            self._write(data)
            return True

    def mark_event_entry_published(self, key: str) -> None:
        with self._lock:
            data = self._read()
            entry = data["entries"].pop(key, None)
            if not entry:
                return
            for event in entry.get("events", []):
                session_id, event_id_value = event.get("sessionId", ""), event.get("id")
                if session_id and event_id_value:
                    ids = set(data["published"].get(session_id, []))
                    ids.add(event_id_value)
                    data["published"][session_id] = sorted(ids)
            # Keep recent IDs for restart/replay protection without unbounded growth.
            for old_session in sorted(data["published"])[:-35]:
                data["published"].pop(old_session, None)
            self._write(data)

    def has_event(self, event_id_value: str, session_id: str) -> bool:
        with self._lock:
            data = self._read()
            if event_id_value in data["published"].get(session_id, []):
                return True
            return any(
                event.get("id") == event_id_value
                for entry in data["entries"].values()
                for event in entry.get("events", [])
            )

    def peak_is_synced(self, event_id_value: str, session_id: str) -> bool:
        with self._lock:
            return event_id_value in self._read()["peakSynced"].get(session_id, [])

    def mark_peak_synced(self, event_id_value: str, session_id: str) -> None:
        with self._lock:
            data = self._read()
            synced = set(data["peakSynced"].get(session_id, []))
            synced.add(event_id_value)
            data["peakSynced"][session_id] = sorted(synced)
            for old_session in sorted(data["peakSynced"])[:-35]:
                data["peakSynced"].pop(old_session, None)
            self._write(data)

    def put_if_absent(self, key: str, entry: dict) -> dict:
        with self._lock:
            data = self._read()
            if key not in data["entries"]:
                data["entries"][key] = entry
                self._write(data)
            return dict(key=key, **data["entries"][key])

    def update(self, key: str, **fields) -> None:
        with self._lock:
            data = self._read()
            if key not in data["entries"]:
                raise KeyError(key)
            data["entries"][key].update(fields)
            if data["entries"][key].get("status") == "certified":
                self._accumulate(data, fields.get("events", []))
            self._write(data)

    def entries(self) -> list[dict]:
        with self._lock:
            return [dict(key=key, **value) for key, value in self._read()["entries"].items()]

    def get(self, key: str) -> dict | None:
        with self._lock:
            value = self._read()["entries"].get(key)
            return dict(key=key, **value) if value is not None else None

    def pending_night_closures(self) -> list[dict]:
        with self._lock:
            return [
                dict(key=key, **value)
                for key, value in self._read()["entries"].items()
                if value.get("status") == "pending_close"
            ]

    def nightly_summary(self, session_id: str) -> dict:
        with self._lock:
            data = self._read()
            return json.loads(json.dumps(data["nightly"].get(session_id, {})))

    def clear_nightly(self, session_id: str) -> None:
        with self._lock:
            data = self._read()
            data["nightly"].pop(session_id, None)
            self._write(data)

    def remove(self, key: str) -> None:
        with self._lock:
            data = self._read()
            data["entries"].pop(key, None)
            self._write(data)

    def put_settlement(self, playback_id: str, song_id: str, queue_identity: dict | None,
                       uids: list[str], awards: dict[str, int] | None = None) -> None:
        with self._lock:
            data = self._read()
            data["settlements"].setdefault(playback_id, {
                "playbackId": playback_id,
                "songId": song_id,
                "queueIdentity": queue_identity,
                "uids": sorted(set(uids)),
                "awards": {uid: int(award) for uid, award in (awards or {}).items() if int(award) in (5, 10)},
                "settledUids": [],
            })
            data["settlements"][playback_id].setdefault(
                "awards", {uid: int(award) for uid, award in (awards or {}).items() if int(award) in (5, 10)}
            )
            self._write(data)

    def pending_settlements(self) -> list[dict]:
        with self._lock:
            return [dict(**value) for value in self._read()["settlements"].values()]

    def mark_settlement_user(self, playback_id: str, uid: str) -> None:
        with self._lock:
            data = self._read()
            settlement = data["settlements"].get(playback_id)
            if settlement is None:
                return
            settlement["settledUids"] = sorted(set(settlement.get("settledUids", [])) | {uid})
            self._write(data)

    def remove_settlement(self, playback_id: str) -> None:
        with self._lock:
            data = self._read()
            data["settlements"].pop(playback_id, None)
            self._write(data)


def complete_night_close(outbox: LocalOutbox, session_id: str, occurred_at: datetime,
                         read_durable_peaks, event_start_ms: int | None = None,
                         event_end_ms: int | None = None) -> list[dict] | None:
    """Persist closure intent before the fallible read; None means retry is required."""
    key = f"night-close:{session_id}"
    pending = outbox.put_if_absent(key, {
        "status": "pending_close",
        "kind": "night_close",
        "sessionId": session_id,
        "occurredAt": utc_iso(occurred_at),
        "eventStartMs": event_start_ms,
        "eventEndMs": event_end_ms,
        "events": [],
    })
    if pending.get("status") == "certified":
        return pending.get("events", [])
    try:
        durable = read_durable_peaks()
    except Exception:
        return None

    summary = outbox.nightly_summary(session_id)
    for song_id, peak in (durable or {}).items():
        local = summary.setdefault(song_id, {"peakVotes": 0, "proposerUids": []})
        local["peakVotes"] = max(int(local.get("peakVotes", 0) or 0), int(peak.get("peakVotes", 0) or 0))
        local["proposerUids"] = sorted(set(local.get("proposerUids", [])) | set(peak.get("proposerUids", [])))
    close_time = datetime.fromisoformat(pending["occurredAt"].replace("Z", "+00:00"))
    events = night_close_events(session_id=session_id, occurred_at=close_time, peak_summary=summary)
    if events:
        unseen = [
            event for event in events
            if not outbox.has_event(event["id"], session_id)
        ]
        if not unseen:
            outbox.remove(key)
            outbox.clear_nightly(session_id)
            return []
        outbox.put(key, {
            "status": "certified", "kind": "night_close", "sessionId": session_id,
            "occurredAt": pending["occurredAt"], "events": unseen,
        })
        events = unseen
    else:
        outbox.remove(key)
        outbox.clear_nightly(session_id)
    return events


def publish_certified(outbox: LocalOutbox, collection, logger=None) -> tuple[int, int]:
    """Publish certified entries with deterministic IDs; leave failed entries for retry."""
    sent = failed = 0
    for entry in outbox.entries():
        if entry.get("status") != "certified":
            continue
        for record in entry.get("events", []):
            event_key = record["id"]
            payload = {key: value for key, value in record.items() if key != "id"}
            try:
                collection.document(event_key).set(payload)
                sent += 1
            except Exception as exc:
                failed += 1
                if logger:
                    logger.exception("No se pudo publicar evento social %s: %s", event_key, exc)
                break
        else:
            outbox.mark_event_entry_published(entry["key"])
    return sent, failed
