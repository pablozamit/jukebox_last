import asyncio, json, os, glob, random, time, logging
from pathlib import Path
from datetime import datetime, time as dt_time, timedelta
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore
import websockets

load_dotenv()

KODI_IP = os.getenv("KODI_IP", "127.0.0.1")
KODI_PORT = int(os.getenv("KODI_PORT", 9090))
KODI_USER = os.getenv("KODI_USER", "kodi")
KODI_PASS = os.getenv("KODI_PASS", "kodi")
VIDEO_FOLDER_PATH = os.getenv("VIDEO_FOLDER_PATH", "C:/Users/lacat/Videos/Videoclips")
VIDEO_ROOT = Path(VIDEO_FOLDER_PATH).expanduser().resolve()
FIREBASE_CRED_PATH = os.getenv("FIREBASE_CREDENTIALS_JSON", "./serviceAccountKey.json")
BRIDGE_VERSION = "2.2.0"
pending_kodi_requests = {}
active_connection_tasks = set()
playback_lock = asyncio.Lock()
logger = logging.getLogger("jukebox-bridge")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler("bridge.log", encoding="utf-8")],
)

def report_error(context, error):
    logger.exception("%s: %s", context, error)

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
    search_path = os.path.join(VIDEO_FOLDER_PATH, "*.mp4")
    local_filenames = [os.path.basename(f) for f in glob.glob(search_path)]

    catalog_list = []
    for fname in local_filenames:
        catalog_list.append({
            'id': fname,
            'title': clean_title(fname),
            'available': True
        })

    CATALOG_CACHE.clear()
    for song in catalog_list:
        CATALOG_CACHE[song['id']] = song['title']

    db.collection('catalog').document('full_list').set({'songs': catalog_list})
    print(f"Catálogo sincronizado: {len(catalog_list)} canciones guardadas en 1 solo documento.")
    return local_filenames

async def catalog_cache_refresher():
    """Refresca la caché de catálogo cada 10 min (1 lectura) por si el panel
    de administración cambia el catálogo con el bridge en marcha."""
    while True:
        await asyncio.sleep(600)
        try:
            doc_snap = db.collection('catalog').document('full_list').get()
            songs = (doc_snap.to_dict() or {}).get('songs', []) if doc_snap.exists else []
            new_cache = {song.get('id'): song.get('title') for song in songs if song.get('id')}
            if new_cache:
                CATALOG_CACHE.clear()
                CATALOG_CACHE.update(new_cache)
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
    except Exception as e:
        report_error("Error en limpieza total", e)

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
            # Si no hay fecha de último reset, es la primera ejecución o un dato corrupto.
            # Se fuerza el reset si ya es la hora de reset.
            if now.hour >= reset_hour:
                should_reset = True
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
            await clear_all_data(current_session_start_ms)
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
            # Solo actualizar lastActive si no se hizo un reset para evitar sobrescribir 'sessionStart'
            db.collection('state').document('nowPlaying').set({'lastActive': int(time.time() * 1000)}, merge=True)
            print(" [SISTEMA] Continuidad detectada. No se requiere limpieza de jornada.")

    except Exception as e:
        report_error("Error al comprobar sesión", e)

async def reset_song_and_tokens(filename):
    """Limpieza de votos y tokens + puntos y leaderboard (DJ de la noche/semana)."""
    try:
        db.collection('songs').document(filename).delete()

        users_ref = db.collection('users')
        batch = db.batch()
        c = 0
        affected = []  # (uid, name, pts)

        prop_docs = users_ref.where("proposals", "array_contains", filename).stream()
        for udoc in prop_docs:
            batch.update(udoc.reference, {'proposals': firestore.ArrayRemove([filename])})
            affected.append((udoc.id, udoc.to_dict().get('djName') or 'Anónimo', 10))
            c += 1
            if c >= 400:
                batch.commit(); batch = db.batch(); c = 0
        proposer_ids = {uid for uid, _, _ in affected}

        vote_docs = users_ref.where("votes", "array_contains", filename).stream()
        for udoc in vote_docs:
            if udoc.id not in proposer_ids:
                batch.update(udoc.reference, {'votes': firestore.ArrayRemove([filename])})
                affected.append((udoc.id, udoc.to_dict().get('djName') or 'Anónimo', 5))
                c += 1
                if c >= 400:
                    batch.commit(); batch = db.batch(); c = 0

        if c > 0: batch.commit()

        try:
            today = datetime.now().strftime('%Y-%m-%d')
            night_ref = db.collection('leaderboard').document('noche')
            night_doc = night_ref.get()
            if not night_doc.exists:
                night_ref.set({'points': {}, 'names': {}}, merge=False) # Inicializar si no existe

            week_ref = db.collection('leaderboard').document('semana')
            week_doc = week_ref.get()
            if not week_doc.exists:
                week_ref.set({'points': {}, 'names': {}}, merge=False) # Inicializar si no existe

            for uid, name, pts in affected:
                night_ref.update({
                    f'points.{uid}': firestore.Increment(pts),
                    f'names.{uid}': name
                })
                week_ref.update({
                    f'points.{uid}': firestore.Increment(pts),
                    f'names.{uid}': name
                })
                users_ref.document(uid).update({
                    'points': firestore.Increment(pts),
                    'totalPointsEarned': firestore.Increment(pts),
                    'visitDates': firestore.ArrayUnion([today]),
                })
        except Exception as e:
            print(f" Error puntos/leaderboard: {e}")

        print(f" [LIMPIEZA] Votos y tokens reseteados para {filename} (+{sum(p for _, _, p in affected)} pts a {len(affected)} DJs)")
    except Exception as e:
        report_error("Error limpieza", e)

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
    command_id = f"play:{filename}:{time.time_ns()}"
    payload = {"jsonrpc": "2.0", "method": "Player.Open", "params": { "item": { "file": filepath } }, "id": command_id}

    loop = asyncio.get_running_loop()
    response_future = loop.create_future()
    pending_kodi_requests[command_id] = response_future
    try:
        await ws.send(json.dumps(payload))
        try:
            response = await asyncio.wait_for(response_future, timeout=8)
        except asyncio.TimeoutError:
            logger.error("Timeout esperando confirmación de Kodi: %s", filename)
            return False
        if response.get("error") or response.get("result") not in ("OK", True, None):
            logger.error("Kodi rechazó la reproducción de %s: %s", filename, response)
            return False
    finally:
        pending_kodi_requests.pop(command_id, None)

    current_playing_file[0] = filename
    await reset_song_and_tokens(filename)

    db.collection('state').document('nowPlaying').set({
        'songId': filename,
        'title': clean_title(filename),
        'currentTime': 0,
        'startedAt': int(time.time() * 1000),
        'totalTime': 0,
        'lastActive': int(time.time() * 1000)
    })
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
        print(f" Error actualizando estadísticas de reproducción: {e}")

    try:
        hist_ref = db.collection('state').document('played_history')
        hist_doc = hist_ref.get()
        songs = hist_doc.to_dict().get('songs', []) if hist_doc.exists else []
        songs.insert(0, {'title': clean_title(filename), 'ts': int(time.time() * 1000)})
        hist_ref.set({'songs': songs[:10]})
    except Exception as e:
        print(f" Error historial: {e}")

    logger.info("REPRODUCIENDO: %s", clean_title(filename))
    return True

async def get_next_song(local_filenames):
    try:
        query = db.collection('songs').where("votes", ">", 0).order_by("votes", direction=firestore.Query.DESCENDING).order_by("firstVotedAt", direction=firestore.Query.ASCENDING).limit(1)
        top_song = next(query.stream(), None)
        if top_song: return top_song.id
    except Exception as e:
        report_error("Error obteniendo siguiente canción", e)
    return random.choice(local_filenames) if local_filenames else None

def submit_to_loop(coro):
    """Ejecuta una corrutina en el bucle principal desde el hilo de un watcher."""
    if MAIN_LOOP and MAIN_LOOP.is_running():
        asyncio.run_coroutine_threadsafe(coro, MAIN_LOOP)

def setup_commands_watchers(ws, current_playing_file):
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

    commands_ref.document('forcePlay').on_snapshot(on_force)
    commands_ref.document('skipCurrent').on_snapshot(on_skip)

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

def aggregate_vote_event(event_ref, session_key, session_start):
    """Cuenta un vote_event una sola vez por jornada, dentro de una transacción."""
    event_snapshot = event_ref.get()
    if not event_snapshot.exists:
        return False
    data = event_snapshot.to_dict() or {}
    event_ts = int(data.get('ts', 0) or 0)
    if data.get('countedSession') == session_key or event_ts < session_start:
        return False

    user_snapshot = db.collection('users').document(data.get('userId', '')).get()
    if not user_snapshot.exists:
        logger.warning('Evento descartado por referencias inexistentes: %s', event_ref.id)
        event_ref.delete()
        return False
    user_data = user_snapshot.to_dict() or {}
    expected_name = user_data.get('djName') or 'ANONYMOUS'
    # Catálogo en memoria (lo mantienen sync_local_files y el refresco periódico):
    # evita releer un documento de ~200 KB por cada voto agregado.
    catalog_title = CATALOG_CACHE.get(data.get('songId'))
    if catalog_title is None or catalog_title != data.get('title') or data.get('voterName') != expected_name:
        logger.warning('Evento descartado por metadatos incoherentes: %s', event_ref.id)
        event_ref.delete()
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
        if current_data.get('countedSession') == session_key:
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

    return apply_event(transaction)

def setup_vote_events_watch():
    """Escucha en tiempo real los eventos de voto. Antes se escaneaba toda la
    colección cada 3 s (la mayor fuente de lecturas de la factura, millones al
    mes); con listener solo se leen los eventos nuevos.
    Nota: si run_forever reinicia main(), se registra otro watcher; es inocuo
    porque aggregate_vote_event es idempotente (countedSession)."""
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
            if event_ts >= session_start and not data.get('countedSession'):
                try:
                    aggregate_vote_event(event.reference, str(session_start), session_start)
                except Exception as e:
                    report_error(f"Error agregando evento {event.id}", e)

    db.collection_group('voteEvents').on_snapshot(on_events)

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
            cutoff = int(time.time() * 1000) - (2 * 60 * 60 * 1000)
            for event in all_events:
                event_data = event.to_dict() or {}
                event_ts = int(event_data.get('ts', 0) or 0)
                if event_ts < session_start or (event_data.get('countedSession') and event_ts < cutoff):
                    event.reference.delete()
                elif event_ts >= session_start and not event_data.get('countedSession'):
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
                'sessionStart': session_start,
            })
        except Exception as e:
            report_error("Error publicando heartbeat", e)
        await asyncio.sleep(60)

async def active_users_writer():
    """Publica cada 120 s cuántos usuarios han participado en la jornada.
    Antes leía TODA la colección 'users' cada 15 s (millones de lecturas/mes);
    ahora el número se deriva de los eventos que ya escucha el watcher."""
    while True:
        try:
            db.collection('state').document('active_users').set({
                'count': len(SESSION_USER_IDS),
                'updatedAt': int(time.time() * 1000)
            })
        except Exception as e:
            print(f" Error contador usuarios activos: {e}")
        await asyncio.sleep(120)

async def session_watchdog():
    """Comprueba cada 60s si toca iniciar una nueva jornada (reset a las 2:00).
    Evita que los contadores de 'hoy' se queden con datos del día anterior si
    el PC del bar sigue encendido con el bridge corriendo."""
    while True:
        try:
            await check_for_new_session()
        except Exception as e:
            print(f" Error watchdog: {e}")
        await asyncio.sleep(60)

async def main():
    global MAIN_LOOP
    MAIN_LOOP = asyncio.get_running_loop()
    local_filenames = sync_local_files()
    connection_tasks = active_connection_tasks
    connection_tasks.clear()

    def spawn_connection_task(coro):
        task = asyncio.create_task(coro)
        connection_tasks.add(task)
        task.add_done_callback(connection_tasks.discard)
        return task

    await check_for_new_session()
    session_start = session_start_ms()
    SESSION_STATE['start'] = session_start

    uri = f"ws://{KODI_USER}:{KODI_PASS}@{KODI_IP}:{KODI_PORT}/jsonrpc"
    async with websockets.connect(uri) as ws:
        print("Conectado a Kodi.")
        current_playing_file = [None]
        for task_coro in (
            progress_tracker(ws, current_playing_file),
            session_watchdog(),
            active_users_writer(),
            vote_events_cleanup_loop(),
            bridge_status_writer(current_playing_file, session_start),
            catalog_cache_refresher(),
        ):
            spawn_connection_task(task_coro)
        # Watchers de Firestore: viven en hilos del SDK (no en el pool asyncio).
        setup_commands_watchers(ws, current_playing_file)
        setup_vote_events_watch()
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
    while True:
        try:
            await main()
        except KeyboardInterrupt:
            raise
        except Exception as e:
            for task in list(active_connection_tasks):
                task.cancel()
            if active_connection_tasks:
                await asyncio.gather(*active_connection_tasks, return_exceptions=True)
            active_connection_tasks.clear()
            pending_kodi_requests.clear()
            report_error("Bridge desconectado; reintentando en 5 segundos", e)
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
        await asyncio.sleep(5)

if __name__ == "__main__": asyncio.run(run_forever())
