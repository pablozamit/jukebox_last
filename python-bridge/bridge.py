import asyncio, json, os, glob, random, time, logging, uuid, threading, sys, faulthandler
from logging.handlers import RotatingFileHandler
from pathlib import Path
from datetime import datetime, time as dt_time, timedelta, timezone
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore
import websockets
from bridge_runtime import ExponentialBackoff, InstanceLock, SubscriptionRegistry
from social_events import LocalOutbox, certified_playback_attribution, certified_support_uids, complete_night_close, effective_peak_votes, event_id, event_in_queue_generation, participation_event, peak_event, playback_capture_snapshot, playback_events, playback_settlement_id, publish_certified, queue_generation_matches, settlement_changes, should_track_playback_settlement, social_session_id, song_peak_document_id, token_snapshot_version, utc_iso

load_dotenv()

KODI_IP = os.getenv("KODI_IP", "127.0.0.1")
KODI_PORT = int(os.getenv("KODI_PORT", 9090))
KODI_USER = os.getenv("KODI_USER", "kodi")
KODI_PASS = os.getenv("KODI_PASS", "kodi")
VIDEO_FOLDER_PATH = os.getenv("VIDEO_FOLDER_PATH", "C:/Users/lacat/Videos/Videoclips")
VIDEO_ROOT = Path(VIDEO_FOLDER_PATH).expanduser().resolve()
FIREBASE_CRED_PATH = os.getenv("FIREBASE_CREDENTIALS_JSON", "./serviceAccountKey.json")
BRIDGE_VERSION = "2.4.0-bridge-candidate"
SOCIAL_OUTBOX_PATH = Path(os.getenv(
    "SOCIAL_EVENTS_OUTBOX_PATH",
    str(Path.home() / ".jukebox-social" / "social-events-outbox.json"),
))
SOCIAL_OUTBOX = LocalOutbox(SOCIAL_OUTBOX_PATH)
SOCIAL_PUBLISH_LOCK = threading.Lock()
SOCIAL_CLOSE_LOCK = threading.RLock()
SETTLEMENT_LOCK = threading.RLock()
pending_kodi_requests = {}
active_connection_tasks = set()
playback_lock = asyncio.Lock()
logger = logging.getLogger("jukebox-bridge")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler("bridge.log", encoding="utf-8")],
)

# Registro de errores aparte (v2.3.0): bridge_errors.log guarda solo WARNING o
# superior, con traza completa, rotado (5 x 2 MB) para que no crezca sin limite.
# Pensado para pegarlo tal cual a quien arregle el puente.
_err_handler = RotatingFileHandler("bridge_errors.log", maxBytes=2_000_000, backupCount=5, encoding="utf-8")
_err_handler.setLevel(logging.WARNING)
_err_handler.setFormatter(logging.Formatter(
    "%(asctime)s [%(levelname)s] [v" + BRIDGE_VERSION + "] [%(threadName)s] %(message)s"))
logging.getLogger().addHandler(_err_handler)

def report_error(context, error):
    logger.exception("%s: %s", context, error)

def _sys_excepthook(exc_type, exc, tb):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc, tb)
        return
    logger.critical("Excepcion no capturada, el puente puede haberse parado", exc_info=(exc_type, exc, tb))

def _thread_excepthook(args):
    logger.error("Excepcion no capturada en hilo %s", getattr(args.thread, "name", "?"),
                 exc_info=(args.exc_type, args.exc_value, args.exc_traceback))

def _asyncio_exception_handler(loop, context):
    logger.error("Error asyncio: %s", context.get("message", ""), exc_info=context.get("exception"))

sys.excepthook = _sys_excepthook
threading.excepthook = _thread_excepthook
try:
    # Si el proceso muere de forma brusca (fallo nativo), deja la traza aqui.
    _fault_file = open("bridge_crash.log", "a", encoding="utf-8")
    faulthandler.enable(file=_fault_file)
except Exception:
    pass
logger.info("Puente %s arrancando (errores en bridge_errors.log)", BRIDGE_VERSION)

def flush_social_outbox():
    with SOCIAL_PUBLISH_LOCK:
        try:
            return publish_certified(SOCIAL_OUTBOX, db.collection('socialEvents'), logger)
        except Exception as error:
            report_error("Outbox social local no disponible; quedan gaps de evidencia", error)
            return (0, 1)

async def social_outbox_retry_loop():
    """Retry certified social events without making music depend on Firestore."""
    while True:
        try:
            await asyncio.to_thread(flush_social_outbox)
            pending_closures = await asyncio.to_thread(SOCIAL_OUTBOX.pending_night_closures)
            for pending in pending_closures:
                await asyncio.to_thread(
                    close_social_night, None, pending["sessionId"],
                    pending.get("eventStartMs"), pending.get("eventEndMs"),
                )
            pending_settlements = await asyncio.to_thread(SOCIAL_OUTBOX.pending_settlements)
            for settlement in pending_settlements:
                await asyncio.to_thread(process_playback_settlement, settlement)
        except Exception as error:
            report_error("No se pudo recorrer outbox social; nuevo intento en 30s", error)
        await asyncio.sleep(30)

def close_social_night(occurred_at=None, session_id=None, event_start_ms=None, event_end_ms=None):
    with SOCIAL_CLOSE_LOCK:
        return _close_social_night(occurred_at, session_id, event_start_ms, event_end_ms)

def _close_social_night(occurred_at=None, session_id=None, event_start_ms=None, event_end_ms=None):
    occurred_at = occurred_at or datetime.now(timezone.utc)
    session_id = session_id or social_session_id(occurred_at - timedelta(seconds=1))
    key = f"night-close:{session_id}"
    if event_start_ms is not None and event_end_ms is not None:
        SOCIAL_OUTBOX.put_if_absent(key, {
            "status": "pending_close", "kind": "night_close", "sessionId": session_id,
            "occurredAt": utc_iso(occurred_at), "eventStartMs": event_start_ms,
            "eventEndMs": event_end_ms, "events": [],
        })
    pending = SOCIAL_OUTBOX.get(key)
    event_start_ms = (pending or {}).get("eventStartMs", event_start_ms)
    event_end_ms = (pending or {}).get("eventEndMs", event_end_ms)
    if event_start_ms is not None and event_end_ms is not None:
        try:
            drain_session_vote_events(event_start_ms, event_end_ms)
        except Exception as error:
            logger.exception("No se puede drenar la jornada %s; se conserva el cierre para reintento: %s", session_id, error)
            return False
    flush_social_outbox()
    def read_durable_peaks():
        peaks = {}
        for snapshot in db.collection('socialSongPeaks').where('sessionId', '==', session_id).stream():
            peak = snapshot.to_dict() or {}
            song_id = peak.get('songId')
            if not song_id:
                continue
            peaks[song_id] = peak
        return peaks

    events = complete_night_close(
        SOCIAL_OUTBOX, session_id, occurred_at, read_durable_peaks,
        event_start_ms=event_start_ms, event_end_ms=event_end_ms,
    )
    if events is None:
        logger.warning("Cierre social %s persistido como pendiente; reintento al recuperar conexión", session_id)
        return True
    if not events:
        logger.info("Sin propuestas con votos en la jornada %s; no se concede logro de máximo", session_id)
        return True
    _, failed = flush_social_outbox()
    if not failed and not any(entry.get("key") == key for entry in SOCIAL_OUTBOX.entries()):
        SOCIAL_OUTBOX.clear_nightly(session_id)
    return True

def drain_session_vote_events(start_ms, end_ms):
    """Validate all prior-session events before rollover clears user token arrays."""
    session_key = str(start_ms)
    events = [
        snapshot for snapshot in db.collection_group('voteEvents').stream()
        if (snapshot.to_dict() or {}).get('kind') == 'vote_event'
        and start_ms <= int((snapshot.to_dict() or {}).get('ts', 0) or 0) < end_ms
    ]
    for snapshot in events:
        aggregate_vote_event(snapshot.reference, session_key, start_ms, raise_on_social_error=True)

def drain_song_vote_events(song_id, session_start):
    """Make pending valid contributions visible before a song is certified as played."""
    song_snapshot = db.collection('songs').document(song_id).get()
    queue_created_at = song_snapshot.create_time if song_snapshot.exists else None
    for snapshot in db.collection('songs').document(song_id).collection('voteEvents').stream():
        data = snapshot.to_dict() or {}
        event_ts = int(data.get('ts', 0) or 0)
        if data.get('kind') == 'vote_event' and event_ts >= session_start and event_in_queue_generation(snapshot.create_time, queue_created_at):
            aggregate_vote_event(snapshot.reference, str(session_start), session_start, raise_on_social_error=True)

def update_social_song_peak(session_id, song_id, peak_votes, proposer_uids=None, occurred_at=None, source_id=None):
    """Keep a private, durable per-session peak independent of participation dedupe."""
    ref = db.collection('socialSongPeaks').document(song_peak_document_id(session_id, song_id))
    transaction = db.transaction()

    @firestore.transactional
    def apply(tx):
        snapshot = next(tx.get(ref), None)
        current = snapshot.to_dict() if snapshot and snapshot.exists else {}
        proposers = set(current.get('proposerUids', []) or []) | set(proposer_uids or [])
        peak = max(int(current.get('peakVotes', 0) or 0), int(peak_votes or 0))
        tx.set(ref, {
            'sessionId': session_id,
            'songId': song_id,
            'peakVotes': peak,
            'proposerUids': sorted(proposers),
            'updatedAt': int(time.time() * 1000),
        }, merge=False)
        return {'peakVotes': peak, 'proposerUids': sorted(proposers)}

    result = apply(transaction)
    if result['peakVotes'] >= 10:
        for uid in result['proposerUids']:
            event = peak_event(
                uid=uid, song_id=song_id, session_id=session_id,
                occurred_at=occurred_at or datetime.now(timezone.utc),
                peak_votes=result['peakVotes'], source_id=source_id or song_peak_document_id(session_id, song_id),
            )
            if SOCIAL_OUTBOX.add_certified_event(f"peak:{event['id']}", event):
                flush_social_outbox()

def certified_song_support_uids(song_id, session_key, queue_created_at=None):
    """Unique current token holders with vote/proposal events already validated by the bridge."""
    events = db.collection('songs').document(song_id).collection('voteEvents').where(
        'countedSession', '==', str(session_key),
    ).stream()
    certified_uids = {
        str(data['userId'])
        for snapshot in events
        if event_in_queue_generation(snapshot.create_time, queue_created_at)
        and (data := (snapshot.to_dict() or {})).get('kind') == 'vote_event'
        and data.get('type') in ('vote', 'proposal') and data.get('userId')
    }
    users_ref = db.collection('users')
    token_uids = {
        snapshot.id for snapshot in users_ref.where('proposals', 'array_contains', song_id).stream()
    }
    token_uids.update(
        snapshot.id for snapshot in users_ref.where('votes', 'array_contains', song_id).stream()
    )
    return certified_support_uids(certified_uids, token_uids)

def session_start_ms(now=None):
    now = now or datetime.now()
    boundary = datetime.combine(now.date(), dt_time(2, 0))
    if now < boundary:
        boundary -= timedelta(days=1)
    return int(boundary.timestamp() * 1000)

print("Inicializando Firebase...")
cred = credentials.Certificate(FIREBASE_CRED_PATH)
if not firebase_admin._apps: firebase_admin.initialize_app(cred)
db = firestore.client()

# ===== Estado global compartido entre asyncio y los watchers de Firestore =====
MAIN_LOOP = None                  # Bucle asyncio principal (para marshaling desde hilos de watchers)
CATALOG_CACHE = {}                # {songId: title}; evita releer catalog/full_list (~200 KB) por cada voto
SESSION_STATE = {'start': None}   # Inicio de la jornada en ms; lo mantiene el watchdog
SESSION_USER_IDS = set()          # Usuarios que han participado hoy (derivado de los eventos, sin leer 'users')
PROGRESS_STATE = {'file': None, 'total': -1}

def clean_title(filename):
    if not filename: return "Cargando..."
    name = os.path.basename(filename)
    return name[:-4] if name.lower().endswith(".mp4") else name

def sync_local_files():
    global CATALOG_CACHE
    search_path = os.path.join(VIDEO_FOLDER_PATH, "*.mp4")
    local_filenames = [os.path.basename(f) for f in glob.glob(search_path)]

    catalog_list = []
    for fname in local_filenames:
        catalog_list.append({
            'id': fname,
            'title': clean_title(fname),
            'available': True
        })

    CATALOG_CACHE = {song['id']: song['title'] for song in catalog_list}

    db.collection('catalog').document('full_list').set({'songs': catalog_list})
    print(f"Catálogo sincronizado: {len(catalog_list)} canciones guardadas en 1 solo documento.")
    return local_filenames

async def catalog_cache_refresher():
    """Refresca la caché de catálogo cada 10 min (1 lectura) por si el panel
    de administración cambia el catálogo con el bridge en marcha."""
    global CATALOG_CACHE
    while True:
        await asyncio.sleep(600)
        try:
            doc_snap = db.collection('catalog').document('full_list').get()
            songs = (doc_snap.to_dict() or {}).get('songs', []) if doc_snap.exists else []
            new_cache = {song.get('id'): song.get('title') for song in songs if song.get('id')}
            if new_cache:
                CATALOG_CACHE = new_cache
        except Exception as e:
            report_error("Error refrescando caché de catálogo", e)

async def clear_all_data(session_start=None):
    """Limpia la jornada una sola vez y deja una marca idempotente."""
    try:
        print(" [SISTEMA] Realizando limpieza de nueva jornada...")
        batch = db.batch()
        count = 0

        songs_ref = db.collection('songs').stream()
        for song in songs_ref:
            batch.delete(song.reference)
            count += 1
            if count >= 400:
                batch.commit(); batch = db.batch(); count = 0

        today_iso = datetime.now().isoformat()
        users_ref = db.collection('users').stream()
        for user in users_ref:
            # lastResetSeen marca la última jornada en la que existió el usuario;
            # permite purgar después solo sesiones anónimas abandonadas.
            batch.update(user.reference, {'proposals': [], 'votes': [], 'lastResetSeen': today_iso})
            count += 1
            if count >= 400:
                batch.commit(); batch = db.batch(); count = 0

        batch.delete(db.collection('state').document('cooldowns'))
        count += 1

        now = datetime.now()
        stats_ref = db.collection('statistics')

        batch.delete(stats_ref.document('plays_hoy'))
        batch.delete(stats_ref.document('votes_hoy'))
        batch.delete(stats_ref.document('time_hoy'))
        count += 3

        if now.weekday() == 0:
            batch.delete(stats_ref.document('plays_semana'))
            batch.delete(stats_ref.document('votes_semana'))
            batch.delete(stats_ref.document('time_semana'))
            batch.delete(db.collection('leaderboard').document('semana'))
            count += 4

        batch.delete(db.collection('leaderboard').document('noche'))
        count += 1

        if now.day == 1:
            batch.delete(stats_ref.document('plays_mes'))
            batch.delete(stats_ref.document('votes_mes'))
            count += 2

            # Purga mensual de sesiones anónimas abandonadas hace más de 30 días:
            # sin email, sin nombre DJ, sin puntos ni logros y sin marca reciente.
            # Los perfiles registrados y los usuarios con historial nunca se borran.
            cutoff_ms = int(time.time() * 1000) - 30 * 24 * 3600 * 1000
            for user in db.collection('users').stream():
                d = user.to_dict() or {}
                if d.get('email') or (d.get('djName') or '').strip():
                    continue
                if d.get('points') or d.get('achievements'):
                    continue
                if d.get('proposals') or d.get('votes'):
                    continue
                last_seen = d.get('lastResetSeen')
                if not last_seen:
                    continue  # Sin marca todavía: se marcará esta noche
                try:
                    if datetime.fromisoformat(last_seen).timestamp() * 1000 > cutoff_ms:
                        continue
                except ValueError:
                    continue
                batch.delete(user.reference)
                count += 1
                if count >= 400:
                    batch.commit(); batch = db.batch(); count = 0

        if count > 0:
            batch.commit()

        if session_start is not None:
            db.collection('state').document('nowPlaying').set({
                'sessionStart': session_start,
                'lastActive': int(time.time() * 1000),
            }, merge=True)
        print(" [SISTEMA] ¡Base de datos reseteada para la nueva sesión!")
        return True
    except Exception as e:
        report_error("Error en limpieza total", e)
        return False

async def check_for_new_session():
    """Comprueba si toca resetear según la fecha de calendario (pasadas las 2 AM)."""
    try:
        now = datetime.now()
        reset_hour = 2 # Hora del día en que se debe realizar el reset (2 AM)

        state_doc = db.collection('state').document('nowPlaying').get()
        state = state_doc.to_dict() if state_doc.exists else {}

        last_reset_date_str = state.get('lastResetDate')
        last_reset_dt = None

        if last_reset_date_str:
            try:
                # Firestore no guarda la zona horaria, se asume que lastResetDate fue guardado en la misma TZ que 'now'
                last_reset_dt = datetime.fromisoformat(last_reset_date_str)
            except ValueError:
                # Si el formato es incorrecto, lo tratamos como si nunca se hubiera reseteado
                print(f" [SISTEMA] Advertencia: lastResetDate '{last_reset_date_str}' no es ISO. Forzando chequeo de reseteo.")
                last_reset_dt = None # Forzar el reseteo si es necesario

        should_reset = False
        if not last_reset_dt:
            # A missing marker may have been erased by an older bridge. Never
            # infer permission to delete the live queue from missing metadata.
            # Start a new baseline and resume rollover at the next boundary.
            current_session_start_ms = session_start_ms(now)
            db.collection('state').document('nowPlaying').set({
                'lastResetDate': now.isoformat(),
                'sessionStart': current_session_start_ms,
                'lastActive': int(time.time() * 1000),
            }, merge=True)
            SESSION_STATE['start'] = current_session_start_ms
            logger.warning("Falta marcador de jornada: se conserva la cola y se inicia una nueva referencia")
            return
        else:
            # Comprobar si ha pasado al menos un día y ya son las 2 AM
            is_new_day = (now.date() > last_reset_dt.date())
            is_past_reset_hour = (now.hour >= reset_hour)
            was_reset_before_2am_today = (now.date() == last_reset_dt.date() and last_reset_dt.hour < reset_hour and now.hour >= reset_hour)

            if (is_new_day and is_past_reset_hour) or was_reset_before_2am_today:
                should_reset = True
        
        # current_session solo se usa como argumento en clear_all_data
        current_session_start_ms = session_start_ms(now)

        if should_reset:
            print(f" [SISTEMA] Nueva jornada detectada ({now.strftime('%Y-%m-%d %H:%M')}). Realizando limpieza total.")
            try:
                prior_session_id = social_session_id(
                    datetime.fromtimestamp(current_session_start_ms / 1000, tz=timezone.utc) - timedelta(milliseconds=1)
                )
                prior_start_local = datetime.fromtimestamp(current_session_start_ms / 1000) - timedelta(days=1)
                prior_start_ms = int(prior_start_local.timestamp() * 1000)
                closed = await asyncio.to_thread(
                    close_social_night, datetime.now(timezone.utc), prior_session_id,
                    prior_start_ms, current_session_start_ms,
                )
                if closed is False:
                    logger.warning("Rollover pospuesto: quedan voteEvents anteriores por drenar")
                    return
            except Exception as error:
                # Preserve the old queue and token arrays so a later retry can certify them.
                report_error("No se pudo drenar la jornada social; rollover se reintentará", error)
                return
            if not await clear_all_data(current_session_start_ms):
                logger.warning("Rollover incompleto: se reintentará sin marcar lastResetDate")
                return
            # Guardar la fecha y hora actual como la última vez que se realizó el reset
            db.collection('state').document('nowPlaying').set({
                'lastResetDate': now.isoformat(),
                'lastActive': int(time.time() * 1000), # También actualizamos lastActive
            }, merge=True)
            print(" [SISTEMA] ¡Base de datos reseteada para la nueva jornada!")
            SESSION_STATE['start'] = current_session_start_ms
            SESSION_USER_IDS.clear()
        else:
            SESSION_STATE['start'] = current_session_start_ms
            # progress_tracker publishes the heartbeat; avoid a second write.
            logger.debug("Continuidad detectada; no se requiere limpieza de jornada")

    except Exception as e:
        report_error("Error al comprobar sesión", e)

def capture_playback_attribution(filename):
    """Read the final queue tally and users before the bridge clears their arrays."""
    current_session_start = SESSION_STATE['start'] or session_start_ms()
    drain_song_vote_events(filename, current_session_start)
    song_ref = db.collection('songs').document(filename)
    song_snap = song_ref.get()
    song_data = song_snap.to_dict() or {} if song_snap.exists else {}
    queue_created_at = song_snap.create_time if song_snap.exists else None
    queue_id = song_data.get('bridgeQueueId')
    if song_snap.exists and not queue_id:
        candidate = uuid.uuid4().hex
        transaction = db.transaction()

        @firestore.transactional
        def ensure_queue_id(tx):
            current = next(tx.get(song_ref), None)
            if not current or not current.exists:
                return None
            current_data = current.to_dict() or {}
            existing = current_data.get('bridgeQueueId')
            if existing:
                return existing, current_data, current.create_time
            tx.update(song_ref, {'bridgeQueueId': candidate})
            return candidate, current_data, current.create_time

        ensured = ensure_queue_id(transaction)
        if ensured is None:
            # The queue was removed before it could be tagged.
            song_data, queue_id, queue_created_at = {}, None, None
            song_snap = None
        else:
            queue_id, song_data, queue_created_at = ensured
    raw_votes = max(0, int(song_data.get('votes', 0) or 0))
    certified_uids = certified_song_support_uids(filename, str(current_session_start), queue_created_at)
    peak_votes, queue_identity = playback_capture_snapshot(
        raw_votes,
        certified_uids,
        song_data if song_snap and song_snap.exists else None,
        queue_id,
    )
    users_ref = db.collection('users')
    people = {}
    for snapshot in users_ref.where('proposals', 'array_contains', filename).stream():
        people[snapshot.id] = {'uid': snapshot.id, 'role': 'proposer', 'certified': snapshot.id in certified_uids,
                               'tokenVersion': token_snapshot_version(snapshot.update_time)}
    for snapshot in users_ref.where('votes', 'array_contains', filename).stream():
        version = token_snapshot_version(snapshot.update_time)
        existing = people.get(snapshot.id)
        if existing is None:
            people[snapshot.id] = {'uid': snapshot.id, 'role': 'voter', 'certified': snapshot.id in certified_uids,
                                   'tokenVersion': version}
        elif existing['tokenVersion'] != version:
            # Reads from the two queries straddled a user update; do not guess.
            existing['tokenVersion'] = None
    return peak_votes, list(people.values()), queue_identity


def settle_playback_user(filename, playback_id, uid, captured_award=None, queue_identity=None, token_version=None):
    """Atomically remove a user's token and grant their existing 10/5 points once."""
    user_ref = db.collection('users').document(uid)
    song_ref = db.collection('songs').document(filename)
    receipt_id = playback_settlement_id(playback_id, uid)
    receipt_ref = db.collection('playbackSettlements').document(receipt_id)
    night_ref = db.collection('leaderboard').document('noche')
    week_ref = db.collection('leaderboard').document('semana')
    today = datetime.now().astimezone().strftime('%Y-%m-%d')
    transaction = db.transaction()

    @firestore.transactional
    def apply(tx):
        receipt = next(tx.get(receipt_ref), None)
        if receipt and receipt.exists:
            return 0
        user = next(tx.get(user_ref), None)
        if not user or not user.exists:
            return 0
        song = next(tx.get(song_ref), None)
        song_data = song.to_dict() if song and song.exists else None
        same_generation = queue_generation_matches(queue_identity, song_data)
        if not queue_identity or not (queue_identity.get('bridgeQueueId') or queue_identity.get('firstVotedAt') is not None):
            return None  # Insufficient evidence to associate this token with playback.
        if song_data and not same_generation and not (
            queue_identity.get('bridgeQueueId') and song_data.get('bridgeQueueId')
        ):
            return None  # A legacy queue cannot safely be classified as a new generation.
        if same_generation and (token_version is None or token_snapshot_version(user.update_time) != token_version):
            return None  # User changed after capture: preserve the token for review.
        user_data = user.to_dict() or {}
        changes = settlement_changes(user_data, filename, today, captured_award, consume_token=same_generation)
        if changes is None:
            return 0
        removed = ((filename in (user_data.get('proposals') or [])) +
                   (filename in (user_data.get('votes') or []))) if same_generation else 0
        remaining = int((song_data or {}).get('votes', 0) or 0) - removed
        if same_generation and (removed == 0 or remaining < 0):
            return None
        points = changes['award']
        night = next(tx.get(night_ref), None)
        week = next(tx.get(week_ref), None)
        night_data = night.to_dict() if night and night.exists else {}
        week_data = week.to_dict() if week and week.exists else {}
        name = user_data.get('djName') or 'Anónimo'
        for data in (night_data, week_data):
            data.setdefault('points', {})[uid] = int(data.get('points', {}).get(uid, 0) or 0) + points
            data.setdefault('names', {})[uid] = name
        if same_generation:
            if remaining:
                tx.update(song_ref, {'votes': remaining})
            else:
                tx.delete(song_ref)
        tx.update(user_ref, {
            'proposals': changes['proposals'],
            'votes': changes['votes'],
            'points': changes['points'],
            'totalPointsEarned': changes['totalPointsEarned'],
            'visitDates': firestore.ArrayUnion([changes['visitDate']]),
        })
        tx.set(night_ref, night_data, merge=True)
        tx.set(week_ref, week_data, merge=True)
        tx.set(receipt_ref, {
            'playbackId': playback_id,
            'uid': uid,
            'songId': filename,
            'points': points,
            'settledAt': int(time.time() * 1000),
        })
        return points

    return apply(transaction)


def process_playback_settlement(settlement):
    """Retry persisted credits safely; receipt checks prevent replayed increments."""
    with SETTLEMENT_LOCK:
        return _process_playback_settlement(settlement)


def _process_playback_settlement(settlement):
    playback_id = settlement['playbackId']
    filename = settlement['songId']
    settled = set(settlement.get('settledUids', []))
    needs_review = set(settlement.get('needsReview', {}))
    if not settlement.get('uids') and settlement.get('queueIdentity'):
        SOCIAL_OUTBOX.mark_settlement_review(playback_id, '__queue__', 'no-attribution')
        logger.warning("Cola %s sin atribuciones fiables; requiere revisión", filename)
        return False
    for uid in settlement.get('uids', []):
        if uid in settled or uid in needs_review:
            continue
        try:
            outcome = settle_playback_user(filename, playback_id, uid, settlement.get('awards', {}).get(uid),
                                           settlement.get('queueIdentity'), settlement.get('tokenVersions', {}).get(uid))
            if outcome is None:
                SOCIAL_OUTBOX.mark_settlement_review(playback_id, uid, 'token-or-queue-changed')
                logger.warning("Liquidación %s/%s requiere revisión; no se modificaron turnos", playback_id, uid)
                needs_review.add(uid)
                continue
            SOCIAL_OUTBOX.mark_settlement_user(playback_id, uid)
            settled.add(uid)
        except Exception as error:
            logger.exception("Liquidación pendiente %s/%s; se reintentará sin repetir Kodi: %s", playback_id, uid, error)
            return False
    if settled >= set(settlement.get('uids', [])):
        # Queue changes were performed atomically with each matching token.
        # Never delete residual votes belonging to later or unknown users.
        SOCIAL_OUTBOX.remove_settlement(playback_id)
        return True
    return False


async def reset_song_and_tokens(filename, playback_id, captured_attribution=None):
    """Persist settlement intent before applying points and conditionally deleting its queue."""
    try:
        peak_votes, attribution, queue_identity = captured_attribution or capture_playback_attribution(filename)
        uids = [person['uid'] for person in attribution if person.get('uid')]
        awards = {
            person['uid']: (10 if person.get('role') == 'proposer' else 5)
            for person in attribution
            if person.get('uid') and person.get('role') in ('proposer', 'voter')
        }
        if not should_track_playback_settlement(queue_identity, uids):
            logger.info("Tema aleatorio %s sin cola ni atribuciones; no requiere liquidación", filename)
            return
        token_versions = {person['uid']: person.get('tokenVersion') for person in attribution if person.get('uid')}
        SOCIAL_OUTBOX.put_settlement(playback_id, filename, queue_identity, uids, awards, token_versions)
        settlement = next((item for item in SOCIAL_OUTBOX.pending_settlements()
                           if item.get('playbackId') == playback_id), None)
        if settlement:
            await asyncio.to_thread(process_playback_settlement, settlement)
        logger.info("[LIMPIEZA] Liquidación registrada para %s (%d atribuciones; pico %d)",
                    filename, len(uids), peak_votes)
    except Exception as error:
        # The intent remains retryable if its local journal write succeeded.
        report_error("No se pudo persistir liquidación de reproducción", error)


async def capture_playback_attribution_bounded(filename, timeout=2):
    try:
        return await asyncio.wait_for(asyncio.to_thread(capture_playback_attribution, filename), timeout=timeout)
    except Exception as error:
        report_error("Captura social de atribución agotó tiempo; reproducción continúa con gap", error)
        return None

def safe_video_path(filename):
    """Devuelve una ruta de vídeo confinada al directorio configurado."""
    if not filename or os.path.basename(filename) != filename:
        return None
    candidate = (VIDEO_ROOT / filename).resolve()
    try:
        candidate.relative_to(VIDEO_ROOT)
    except ValueError:
        return None
    if candidate.suffix.lower() != '.mp4' or not candidate.is_file():
        return None
    return candidate

async def play_song_on_kodi(ws, filename, current_playing_file):
    try:
        if filename in SOCIAL_OUTBOX.blocked_song_ids():
            logger.warning("Tema %s con liquidación pendiente; se evita una reproducción duplicada", filename)
            return False
    except Exception as error:
        report_error("No se pudo consultar la revisión local de liquidaciones", error)
    if playback_lock.locked():
        logger.info("Reproducción ya en curso; se ignora la solicitud duplicada: %s", filename)
        return False
    async with playback_lock:
        return await _play_song_on_kodi(ws, filename, current_playing_file)

async def _play_song_on_kodi(ws, filename, current_playing_file):
    video_path = safe_video_path(filename)
    if video_path is None:
        logger.error("Archivo inválido, fuera de la carpeta o inexistente; no se consume el voto: %s", filename)
        return False

    filepath = video_path.as_posix()
    playback_id = uuid.uuid4().hex
    command_id = f"play:{playback_id}"
    payload = {"jsonrpc": "2.0", "method": "Player.Open", "params": { "item": { "file": filepath } }, "id": command_id}

    occurred_at = datetime.now(timezone.utc)
    session_id = social_session_id(occurred_at)
    captured_attribution = await capture_playback_attribution_bounded(filename)
    if captured_attribution is not None:
        peak_votes, attribution, queue_identity = captured_attribution
    else:
        # Continue playback; the durable record explicitly marks attribution missing.
        captured_attribution = None
        peak_votes, attribution, queue_identity = 0, [], None
    captured_attribution = (peak_votes, attribution, queue_identity)
    try:
        SOCIAL_OUTBOX.put(playback_id, {
            "status": "intent",
            "playbackId": playback_id,
            "songId": filename,
            "sessionId": session_id,
            "occurredAt": utc_iso(occurred_at),
            "peakVotes": peak_votes,
            "attribution": attribution,
            "queueIdentity": queue_identity,
            "attributionMissing": not bool(attribution),
        })
    except Exception as error:
        # Local evidence failure must not block the music command.
        report_error("No se pudo persistir intención de reproducción; gap social", error)

    loop = asyncio.get_running_loop()
    response_future = loop.create_future()
    pending_kodi_requests[command_id] = response_future
    try:
        await ws.send(json.dumps(payload))
        try:
            response = await asyncio.wait_for(response_future, timeout=8)
        except asyncio.TimeoutError:
            logger.error("Timeout esperando confirmación de Kodi: %s", filename)
            try:
                SOCIAL_OUTBOX.update(playback_id, status="uncertain", resolution="ack_timeout")
            except Exception as error:
                report_error("No se pudo marcar intención Kodi incierta en el outbox", error)
            return False
        if response.get("error") or response.get("result") not in ("OK", True):
            logger.error("Kodi rechazó la reproducción de %s: %s", filename, response)
            try:
                SOCIAL_OUTBOX.update(playback_id, status="rejected", resolution="kodi_rejected")
            except Exception as error:
                report_error("No se pudo marcar rechazo Kodi en el outbox", error)
            return False
    finally:
        pending_kodi_requests.pop(command_id, None)

    current_playing_file[0] = filename
    certified_at = datetime.now(timezone.utc)
    try:
        final_capture = await capture_playback_attribution_bounded(filename)
        if final_capture is None:
            raise TimeoutError("capture timeout")
        final_peak, final_attribution, queue_identity = final_capture
        peak_votes = max(peak_votes, final_peak)
        people_by_uid = {person['uid']: person for person in attribution}
        for person in final_attribution:
            existing = people_by_uid.get(person['uid'])
            if existing and existing.get('role') == 'proposer':
                person = {**person, 'role': 'proposer'}
            people_by_uid[person['uid']] = person
        attribution = list(people_by_uid.values())
        captured_attribution = (peak_votes, attribution, queue_identity)
    except Exception as error:
        report_error("No se pudo completar atribución tras ACK; se usa captura previa y se registra gap", error)
    # Settle the captured tokens before publishing social achievements, whose
    # own updates to the user document would invalidate the captured version.
    await reset_song_and_tokens(filename, playback_id, captured_attribution)
    try:
        social_attribution = certified_playback_attribution(attribution)
        events = playback_events(
            playback_id=playback_id,
            song_id=filename,
            session_id=session_id,
            occurred_at=occurred_at,
            certified_at=certified_at,
            source_id=playback_id,
            peak_votes=peak_votes,
            attribution=social_attribution,
        )
        try:
            await asyncio.to_thread(
                update_social_song_peak,
                session_id, filename, peak_votes,
                [person['uid'] for person in social_attribution if person.get('role') == 'proposer'],
                occurred_at, playback_id,
            )
        except Exception as error:
            # The local outbox still retains the peak and attribution for recovery.
            report_error(f"No se pudo actualizar máximo durable de {filename}; gap potencial", error)
        SOCIAL_OUTBOX.update(playback_id, status="certified", certifiedAt=utc_iso(certified_at),
                             events=events, queueIdentity=queue_identity)
        await asyncio.to_thread(flush_social_outbox)
    except Exception as error:
        # ACK is real, but a failed disk write cannot be reported as a certified event.
        report_error("Kodi confirmó, pero no se pudo guardar evento social; gap de evidencia", error)
    db.collection('state').document('nowPlaying').set({
        'songId': filename,
        'title': clean_title(filename),
        'currentTime': 0,
        'startedAt': int(time.time() * 1000),
        'totalTime': 0,
        'lastActive': int(time.time() * 1000)
    }, merge=True)
    PROGRESS_STATE['file'] = filename
    PROGRESS_STATE['total'] = -1
    db.collection('state').document('cooldowns').set({filename: int(time.time() * 1000)}, merge=True)
    try:
        stats_ref = db.collection('statistics')
        increment_data = {filename: firestore.Increment(1)}
        stats_ref.document('plays_hoy').set(increment_data, merge=True)
        stats_ref.document('plays_semana').set(increment_data, merge=True)
        stats_ref.document('plays_mes').set(increment_data, merge=True)
        stats_ref.document('plays_total').set(increment_data, merge=True)
    except Exception as e:
        report_error("Error actualizando estadisticas de reproduccion", e)

    try:
        hist_ref = db.collection('state').document('played_history')
        hist_doc = hist_ref.get()
        songs = hist_doc.to_dict().get('songs', []) if hist_doc.exists else []
        songs.insert(0, {'title': clean_title(filename), 'ts': int(time.time() * 1000)})
        hist_ref.set({'songs': songs[:10]})
    except Exception as e:
        report_error("Error historial", e)

    logger.info("REPRODUCIENDO: %s", clean_title(filename))
    return True

async def get_next_song(local_filenames):
    try:
        blocked = SOCIAL_OUTBOX.blocked_song_ids()
    except Exception as error:
        report_error("No se pudo consultar la revisión local de liquidaciones", error)
        blocked = set()
    try:
        query = db.collection('songs').where("votes", ">", 0).order_by("votes", direction=firestore.Query.DESCENDING).order_by("firstVotedAt", direction=firestore.Query.ASCENDING).limit(len(blocked) + 1)
        top_song = next((song for song in query.stream() if song.id not in blocked), None)
        if top_song:
            return top_song.id
    except Exception as e:
        report_error("Error obteniendo siguiente canción", e)
    available = [filename for filename in local_filenames if filename not in blocked]
    return random.choice(available) if available else None

def submit_to_loop(coro):
    """Ejecuta una corrutina en el bucle principal desde el hilo de un watcher."""
    if MAIN_LOOP and MAIN_LOOP.is_running():
        asyncio.run_coroutine_threadsafe(coro, MAIN_LOOP)

def setup_commands_watchers(ws, current_playing_file, subscriptions):
    """Escucha en tiempo real los comandos del panel admin. Antes se sondeaban
    cada 2 s (~86.000 lecturas/día); con listeners el coste es cero si no hay
    comandos. El snapshot inicial consume comandos pendientes al arrancar."""
    commands_ref = db.collection('commands')

    def on_force(doc_snapshot, changes, read_time):
        for doc_snap in doc_snapshot:
            if not doc_snap.exists:
                continue
            fname = (doc_snap.to_dict() or {}).get('filename')
            try:
                doc_snap.reference.delete()
            except Exception as e:
                report_error("Error borrando comando forcePlay", e)
            if fname:
                submit_to_loop(play_song_on_kodi(ws, fname, current_playing_file))

    def on_skip(doc_snapshot, changes, read_time):
        for doc_snap in doc_snapshot:
            if not doc_snap.exists:
                continue
            try:
                doc_snap.reference.delete()
            except Exception as e:
                report_error("Error borrando comando skipCurrent", e)
            submit_to_loop(ws.send(json.dumps({"jsonrpc": "2.0", "method": "Player.Stop", "params": {"playerid": 1}, "id": "skip"})))

    subscriptions.add(commands_ref.document('forcePlay').on_snapshot(on_force))
    subscriptions.add(commands_ref.document('skipCurrent').on_snapshot(on_skip))

async def progress_tracker(ws, current_playing_file):
    """Sondea Kodi en local y escribe en Firestore lo mínimo:
    - heartbeat lastActive cada 60 s (antes cada 5 s = ~17.000 escrituras/día);
    - la duración la escribe el handler de 'progress' una vez por canción.
    La web calcula el progreso en local con 'startedAt'."""
    last_heartbeat_ms = 0
    while True:
        try:
            now_ms = int(time.time() * 1000)
            if current_playing_file[0]:
                await ws.send(json.dumps({"jsonrpc": "2.0", "method": "Player.GetProperties", "params": {"playerid": 1, "properties": ["time", "totaltime"]}, "id": "progress"}))
            if now_ms - last_heartbeat_ms >= 60000:
                last_heartbeat_ms = now_ms
                db.collection('state').document('nowPlaying').set({'lastActive': now_ms}, merge=True)
        except Exception as e:
            report_error("Error siguiendo progreso de Kodi", e)
        await asyncio.sleep(10)

def aggregate_vote_event(event_ref, session_key, session_start, raise_on_social_error=False):
    """Cuenta un vote_event una sola vez por jornada, dentro de una transacción."""
    event_snapshot = event_ref.get()
    if not event_snapshot.exists:
        return False
    data = event_snapshot.to_dict() or {}
    event_ts = int(data.get('ts', 0) or 0)
    # Do not assign a new day's event to a lagging previous-session watcher.
    # It remains available for the next reconciliation, rather than being lost.
    if event_ts < session_start or session_start_ms(datetime.fromtimestamp(event_ts / 1000.0)) != session_start:
        return False
    already_counted = data.get('countedSession') == session_key
    if data.get('countedSession') and not already_counted:
        return False

    # Once both social effects have been durably recorded, repeated hourly
    # reconciliation and MODIFIED notifications need no extra Firestore reads.
    if already_counted and data.get('type') in ('vote', 'proposal') and data.get('songId') and data.get('userId'):
        occurred_at = datetime.fromtimestamp(event_ts / 1000.0, tz=timezone.utc)
        social_session = social_session_id(occurred_at)
        social_id = event_id(data['type'], data['userId'], data['songId'], social_session)
        if SOCIAL_OUTBOX.has_event(social_id, social_session) and SOCIAL_OUTBOX.peak_is_synced(event_ref.id, social_session):
            return False

    user_snapshot = db.collection('users').document(data.get('userId', '')).get()
    if not user_snapshot.exists:
        logger.warning('Evento descartado por referencias inexistentes: %s', event_ref.id)
        event_ref.delete()
        return False
    # voterName is a historical display label, not identity. The UID and
    # catalog identify this event; a later profile rename must not erase it.
    # Catálogo en memoria (lo mantienen sync_local_files y el refresco periódico):
    # evita releer un documento de ~200 KB por cada voto agregado.
    catalog_title = CATALOG_CACHE.get(data.get('songId'))
    if catalog_title is None or catalog_title != data.get('title'):
        # A stale cache or a catalog edit is not proof that a valid event is
        # fraudulent. Leave it for reconciliation instead of deleting evidence.
        logger.warning('Evento pendiente por metadatos de catálogo: %s', event_ref.id)
        return False

    event_dt = datetime.fromtimestamp(event_ts / 1000.0)
    hour = event_dt.hour
    day = event_dt.weekday() + 1
    if day == 7:
        day = 0
    if hour < 2:
        day = 6 if day == 0 else day - 1

    stats_ref = db.collection('statistics')
    increment_data = {data.get('songId'): firestore.Increment(1)}
    time_data = {str(hour): firestore.Increment(1)}
    week_time_data = {str(day): firestore.Increment(1)}
    transaction = db.transaction()

    @firestore.transactional
    def apply_event(tx):
        current = next(tx.get(event_ref), None)
        current_data = current.to_dict() if current else {}
        if current_data.get('countedSession'):
            return False
        tx.set(stats_ref.document('votes_hoy'), increment_data, merge=True)
        tx.set(stats_ref.document('votes_semana'), increment_data, merge=True)
        tx.set(stats_ref.document('votes_mes'), increment_data, merge=True)
        tx.set(stats_ref.document('votes_total'), increment_data, merge=True)
        tx.set(stats_ref.document('time_hoy'), time_data, merge=True)
        tx.set(stats_ref.document('time_semana'), week_time_data, merge=True)
        tx.update(event_ref, {
            'countedSession': session_key,
            'countedAt': int(time.time() * 1000),
        })
        return True

    counted = apply_event(transaction)
    current_event = {} if counted or already_counted else (event_ref.get().to_dict() or {})
    if counted or already_counted or current_event.get('countedSession') == session_key:
        try:
            kind = data.get('type')
            song_id = data.get('songId')
            uid = data.get('userId')
            if kind in ('vote', 'proposal') and song_id and uid:
                occurred_at = datetime.fromtimestamp(event_ts / 1000.0, tz=timezone.utc)
                session_id = social_session_id(occurred_at)
                social_id = event_id(kind, uid, song_id, session_id)
                needs_event = not SOCIAL_OUTBOX.has_event(social_id, session_id)
                source_id = event_ref.id
                needs_peak_sync = not SOCIAL_OUTBOX.peak_is_synced(source_id, session_id)
                if not needs_event and not needs_peak_sync:
                    return counted
                song_snapshot = db.collection('songs').document(song_id).get()
                raw_votes = max(0, int((song_snapshot.to_dict() or {}).get('votes', 0) or 0)) if song_snapshot.exists else 0
                supporters = certified_song_support_uids(song_id, session_key, song_snapshot.create_time if song_snapshot.exists else None)
                peak_votes = effective_peak_votes(raw_votes, supporters)
                event = participation_event(
                    kind=kind,
                    uid=uid,
                    song_id=song_id,
                    occurred_at=occurred_at,
                    source_id=event_ref.id,
                    peak_votes=peak_votes,
                )
                if needs_peak_sync:
                    current_queue_event = song_snapshot.exists and event_in_queue_generation(event_snapshot.create_time, song_snapshot.create_time)
                    update_social_song_peak(
                        event['sessionId'], song_id, peak_votes,
                        [uid] if kind == 'proposal' and current_queue_event else [], occurred_at, source_id,
                    )
                    SOCIAL_OUTBOX.mark_peak_synced(source_id, session_id)
                added = SOCIAL_OUTBOX.add_certified_event(
                    f"participation:{event['id']}", event, kind=kind,
                ) if needs_event else False
                if added:
                    flush_social_outbox()
        except Exception as error:
            # The existing vote statistics remain authoritative; report the social evidence gap.
            report_error(f"Evento musical validado pero outbox social falló: {event_ref.id}", error)
            if raise_on_social_error:
                raise
    return counted

def setup_vote_events_watch(subscriptions):
    """Escucha en tiempo real los eventos de voto. Antes se escaneaba toda la
    colección cada 3 s (la mayor fuente de lecturas de la factura, millones al
    mes); con listener solo se leen los eventos nuevos.
    La suscripción se cierra antes de volver a conectar Kodi."""
    def on_events(col_snapshot, changes, read_time):
        session_start = SESSION_STATE['start'] or session_start_ms()
        docs = ([change.document for change in changes if change.type.name in ('ADDED', 'MODIFIED')]
                if changes is not None else list(col_snapshot))
        for event in docs:
            data = event.to_dict() or {}
            if data.get('kind') != 'vote_event':
                continue
            if data.get('userId'):
                SESSION_USER_IDS.add(data['userId'])
            event_ts = int(data.get('ts', 0) or 0)
            if event_ts >= session_start:
                try:
                    aggregate_vote_event(event.reference, str(session_start), session_start)
                except Exception as e:
                    report_error(f"Error agregando evento {event.id}", e)

    subscriptions.add(db.collection_group('voteEvents').on_snapshot(on_events))

async def vote_events_cleanup_loop():
    """Limpieza y red de seguridad, ahora cada hora (antes cada 3 s):
    - elimina eventos legacy en statistics (migración) y eventos caducados;
    - re-agrega eventos sin contar por si el watcher hubiera perdido alguno."""
    while True:
        try:
            session_start = SESSION_STATE['start'] or session_start_ms()
            for legacy_event in db.collection('statistics').stream():
                if (legacy_event.to_dict() or {}).get('kind') == 'vote_event':
                    legacy_event.reference.delete()
            all_events = [event for event in db.collection_group('voteEvents').stream()
                          if (event.to_dict() or {}).get('kind') == 'vote_event']
            for event in all_events:
                event_data = event.to_dict() or {}
                event_ts = int(event_data.get('ts', 0) or 0)
                # Current-session events certify support until playback or rollover.
                if event_ts < session_start:
                    event.reference.delete()
                elif event_ts >= session_start:
                    try:
                        aggregate_vote_event(event.reference, str(session_start), session_start)
                    except Exception as e:
                        report_error(f"Error agregando evento {event.id}", e)
        except Exception as e:
            report_error("Error en limpieza de eventos de voto", e)
        await asyncio.sleep(3600)

async def bridge_status_writer(current_playing_file, session_start):
    """Publica un heartbeat para diagnóstico desde el panel y la web."""
    status_ref = db.collection('state').document('bridgeStatus')
    while True:
        try:
            filename = current_playing_file[0]
            status_ref.set({
                'version': BRIDGE_VERSION,
                'lastHeartbeat': int(time.time() * 1000),
                'connectedToFirebase': True,
                'connectedToKodi': True,
                'currentSongId': filename,
                'currentSongTitle': clean_title(filename) if filename else None,
                'sessionStart': SESSION_STATE['start'] or session_start,
            })
        except Exception as e:
            report_error("Error publicando heartbeat", e)
        await asyncio.sleep(60)

async def active_users_writer():
    """Publica cada 120 s cuántos usuarios han participado en la jornada.
    Antes leía TODA la colección 'users' cada 15 s (millones de lecturas/mes);
    ahora el número se deriva de los eventos que ya escucha el watcher."""
    last_count = None
    while True:
        try:
            current_count = len(SESSION_USER_IDS)
            if current_count != last_count:
                db.collection('state').document('active_users').set({
                    'count': current_count,
                    'updatedAt': int(time.time() * 1000)
                })
                last_count = current_count
        except Exception as e:
            report_error("Error contador usuarios activos", e)
        await asyncio.sleep(120)

async def session_watchdog():
    """Comprueba cada 60s si toca iniciar una nueva jornada (reset a las 2:00).
    Evita que los contadores de 'hoy' se queden con datos del día anterior si
    el PC del bar sigue encendido con el bridge corriendo."""
    while True:
        try:
            await check_for_new_session()
        except Exception as e:
            report_error("Error watchdog", e)
        await asyncio.sleep(60)

async def main(subscriptions):
    global MAIN_LOOP
    MAIN_LOOP = asyncio.get_running_loop()
    MAIN_LOOP.set_exception_handler(_asyncio_exception_handler)
    connection_tasks = active_connection_tasks
    connection_tasks.clear()

    def spawn_connection_task(coro):
        task = asyncio.create_task(coro)
        connection_tasks.add(task)
        task.add_done_callback(connection_tasks.discard)
        return task

    uri = f"ws://{KODI_USER}:{KODI_PASS}@{KODI_IP}:{KODI_PORT}/jsonrpc"
    async with websockets.connect(uri) as ws:
        print("Conectado a Kodi.")
        # Do not rescan or rewrite the catalog while Kodi is unavailable.
        local_filenames = sync_local_files()
        await check_for_new_session()
        session_start = session_start_ms()
        SESSION_STATE['start'] = session_start
        current_playing_file = [None]
        for task_coro in (
            progress_tracker(ws, current_playing_file),
            session_watchdog(),
            active_users_writer(),
            vote_events_cleanup_loop(),
            bridge_status_writer(current_playing_file, session_start),
            catalog_cache_refresher(),
            social_outbox_retry_loop(),
        ):
            spawn_connection_task(task_coro)
        # Watchers de Firestore: viven en hilos del SDK (no en el pool asyncio).
        setup_commands_watchers(ws, current_playing_file, subscriptions)
        setup_vote_events_watch(subscriptions)
        await ws.send(json.dumps({"jsonrpc": "2.0", "method": "Player.GetActivePlayers", "id": "check_active"}))

        while True:
            data = json.loads(await ws.recv())
            response_id = data.get("id")
            if response_id in pending_kodi_requests:
                future = pending_kodi_requests[response_id]
                if not future.done():
                    future.set_result(data)
                continue
            if data.get("method") == "Player.OnPlay":
                filename = os.path.basename(data.get("params", {}).get("data", {}).get("item", {}).get("file", ""))
                if filename: current_playing_file[0] = filename
            elif data.get("method") == "Player.OnStop":
                n = await get_next_song(local_filenames)
                if n: spawn_connection_task(play_song_on_kodi(ws, n, current_playing_file))
            elif data.get("id") == "check_active" and not data.get("result"):
                n = await get_next_song(local_filenames)
                if n: spawn_connection_task(play_song_on_kodi(ws, n, current_playing_file))
            elif data.get("id") == "progress":
                res = data.get("result", {})
                if "time" in res and current_playing_file[0]:
                    cur = res["time"].get("seconds",0) + res["time"].get("minutes",0)*60
                    tot = res["totaltime"].get("seconds",0) + res["totaltime"].get("minutes",0)*60
                    now_ms = int(time.time() * 1000)
                    # Solo se escribe cuando cambia la duración conocida (una vez
                    # por canción): la web calcula el progreso con startedAt.
                    if tot and (current_playing_file[0] != PROGRESS_STATE['file'] or tot != PROGRESS_STATE['total']):
                        PROGRESS_STATE['file'] = current_playing_file[0]
                        PROGRESS_STATE['total'] = tot
                        db.collection('state').document('nowPlaying').set({
                            'songId': current_playing_file[0],
                            'title': clean_title(current_playing_file[0]),
                            'currentTime': cur,
                            'totalTime': tot,
                            'startedAt': now_ms - int(cur * 1000),
                            'lastActive': now_ms
                        }, merge=True)
    for task in connection_tasks:
        task.cancel()
    if connection_tasks:
        await asyncio.gather(*connection_tasks, return_exceptions=True)

async def run_forever():
    backoff = ExponentialBackoff(initial_delay=5, max_delay=300)
    while True:
        subscriptions = SubscriptionRegistry()
        started = time.monotonic()
        try:
            await main(subscriptions)
        except KeyboardInterrupt:
            raise
        except Exception as e:
            report_error("Bridge desconectado; se reintentará con espera progresiva", e)
            try:
                db.collection('state').document('bridgeStatus').set({
                    'version': BRIDGE_VERSION,
                    'lastHeartbeat': int(time.time() * 1000),
                    'connectedToFirebase': True,
                    'connectedToKodi': False,
                    'currentSongId': None,
                    'currentSongTitle': None,
                })
            except Exception as status_error:
                report_error("No se pudo publicar estado desconectado", status_error)
        finally:
            for error in subscriptions.close():
                logger.warning("No se pudo cerrar un listener de Firestore: %s", error)
            for task in list(active_connection_tasks):
                task.cancel()
            if active_connection_tasks:
                await asyncio.gather(*active_connection_tasks, return_exceptions=True)
            active_connection_tasks.clear()
            pending_kodi_requests.clear()
        # Brief connects followed by immediate disconnects also back off.
        if time.monotonic() - started >= 60:
            backoff.reset()
        await asyncio.sleep(backoff.next_delay())

if __name__ == "__main__":
    instance_lock = InstanceLock(SOCIAL_OUTBOX_PATH.parent / "bridge.lock")
    if not instance_lock.acquire():
        logger.error("Ya hay un puente ejecutándose en este ordenador; no se inicia otro")
        sys.exit(1)
    try:
        asyncio.run(run_forever())
    finally:
        instance_lock.release()
