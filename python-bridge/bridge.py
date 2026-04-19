import os
import glob
import random
import time
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore
import requests
from requests.auth import HTTPBasicAuth

load_dotenv()

KODI_HOST = os.getenv("KODI_HOST", "127.0.0.1")
KODI_PORT = int(os.getenv("KODI_PORT", 8080))
KODI_USER = os.getenv("KODI_USER", "kodi")
KODI_PASS = os.getenv("KODI_PASS", "1936")
VIDEO_FOLDER_PATH = os.getenv("VIDEO_FOLDER_PATH", "C:/Videos")
FIREBASE_CRED_PATH = os.getenv("FIREBASE_CREDENTIALS_PATH", "serviceAccountKey.json")

KODI_URL = f"http://{KODI_HOST}:{KODI_PORT}/jsonrpc"
KODI_AUTH = HTTPBasicAuth(KODI_USER, KODI_PASS)

if not firebase_admin._apps:
    cred = credentials.Certificate(FIREBASE_CRED_PATH)
    firebase_admin.initialize_app(cred)
db = firestore.client()


def clean_title(filename):
    if not filename:
        return "Desconocido"
    name = os.path.basename(filename)
    if name.lower().endswith(".mp4"):
        name = name[:-4]
    return name


def sync_local_files(local_filenames):
    print("Sincronizando archivos...")
    songs_ref = db.collection('songs')

    # Registrar nuevas canciones
    for fname in local_filenames:
        doc_ref = songs_ref.document(fname)
        snap = doc_ref.get()
        if not snap.exists:
            doc_ref.set({'title': clean_title(fname), 'votes': 0, 'firstVotedAt': 0, 'available': True})
        elif snap.to_dict().get('available') is False:
            doc_ref.update({'available': True})

    # Marcar como no disponibles las que ya no están en disco y limpiar orphans con votos
    for snap in songs_ref.stream():
        if snap.id not in local_filenames:
            data = snap.to_dict()
            updates = {}
            if data.get('available') is not False:
                updates['available'] = False
            
            if data.get('votes', 0) > 0:
                print(f" [LIMPIEZA] '{snap.id}' no está localmente. Limpiando votos...")
                updates['votes'] = 0
                updates['firstVotedAt'] = 0
                # Devolver token a los usuarios que votaron
                batch = db.batch()
                for udoc in db.collection('users').where(
                    filter=firestore.FieldFilter("activeVote", "==", snap.id)
                ).stream():
                    batch.update(udoc.reference, {'activeVote': None})
                batch.commit()
            
            if updates:
                snap.reference.update(updates)

    print(f"Sincronización lista. {len(local_filenames)} archivos locales detectados.")
    return list(local_filenames)


def kodi_rpc(method, params=None):
    payload = {"jsonrpc": "2.0", "method": method, "params": params or {}, "id": 1}
    try:
        r = requests.post(KODI_URL, json=payload, auth=KODI_AUTH, timeout=2)
        return r.json()
    except Exception as e:
        print(f" [KODI ERROR] {e}")
        return None


def get_next_song(local_filenames):
    local_set = set(local_filenames)
    try:
        query = db.collection('songs').where(
            filter=firestore.FieldFilter("votes", ">", 0)
        ).order_by("votes", direction=firestore.Query.DESCENDING).order_by(
            "firstVotedAt", direction=firestore.Query.ASCENDING
        )
        for doc in query.stream():
            if doc.id in local_set:
                print(f" [COLA] Siguiente votada: {clean_title(doc.id)}")
                return doc.id
    except Exception as e:
        print(f" [ERROR query] {e}")

    chosen = random.choice(local_filenames) if local_filenames else None
    if chosen:
        print(f" [COLA] Sin votos, al azar: {clean_title(chosen)}")
    return chosen


def reset_votes(filename):
    db.collection('songs').document(filename).update({'votes': 0, 'firstVotedAt': 0})
    batch = db.batch()
    for udoc in db.collection('users').where(
        filter=firestore.FieldFilter("activeVote", "==", filename)
    ).stream():
        batch.update(udoc.reference, {'activeVote': None})
    batch.commit()
    print(f" [VOTOS] Limpiados para: {clean_title(filename)}")


def check_commands(local_filenames):
    """Comprueba comandos de admin en Firestore. Devuelve ('force', filename) o ('skip', None) o (None, None)."""
    try:
        force_doc = db.collection('commands').document('forcePlay').get()
        if force_doc.exists:
            data = force_doc.to_dict()
            filename = data.get('filename')
            if filename and filename in set(local_filenames):
                db.collection('commands').document('forcePlay').delete()
                print(f" [ADMIN] Forzar reproducción: {clean_title(filename)}")
                return ('force', filename)
            elif filename:
                db.collection('commands').document('forcePlay').delete()

        skip_doc = db.collection('commands').document('skipCurrent').get()
        if skip_doc.exists:
            db.collection('commands').document('skipCurrent').delete()
            print(" [ADMIN] Saltar canción actual")
            return ('skip', None)
    except Exception as e:
        print(f" [ERROR commands] {e}")
    return (None, None)


def play_file(filename):
    full_path = os.path.join(VIDEO_FOLDER_PATH, filename)
    kodi_rpc("Player.Open", {"item": {"file": full_path}})


def bridge_loop():
    local_filenames_set = set()
    local_filenames_list = []
    last_file = None
    last_play_attempt = 0

    print("\nPuente Jukebox ACTIVADO.")
    print("--------------------------")

    while True:
        try:
            # Comprobar si hay cambios en la carpeta local
            current_local_files = set(os.path.basename(f) for f in glob.glob(os.path.join(VIDEO_FOLDER_PATH, "*.mp4")))
            if current_local_files != local_filenames_set:
                local_filenames_set = current_local_files
                local_filenames_list = sync_local_files(local_filenames_set)

            # Comprobar comandos de admin primero
            cmd, cmd_data = check_commands(local_filenames_set)
            if cmd == 'force':
                play_file(cmd_data)
                last_file = None
                last_play_attempt = time.time()
                time.sleep(1)
                continue
            elif cmd == 'skip':
                kodi_rpc("Player.Stop", {"playerid": 1})
                last_file = None
                last_play_attempt = 0
                time.sleep(1)
                continue

            # Ver si Kodi está reproduciendo
            active = kodi_rpc("Player.GetActivePlayers")

            if active and active.get('result'):
                playerid = active['result'][0]['playerid']

                item_res = kodi_rpc("Player.GetItem", {
                    "playerid": playerid,
                    "properties": ["file"]
                })
                time_res = kodi_rpc("Player.GetProperties", {
                    "playerid": playerid,
                    "properties": ["time", "totaltime"]
                })

                current_file = ""
                if item_res and 'result' in item_res:
                    file_path = item_res['result'].get('item', {}).get('file', '')
                    current_file = os.path.basename(file_path)

                cur_sec, tot_sec = 0, 0
                if time_res and 'result' in time_res:
                    t = time_res['result'].get('time', {})
                    tt = time_res['result'].get('totaltime', {})
                    cur_sec = t.get('hours', 0) * 3600 + t.get('minutes', 0) * 60 + t.get('seconds', 0)
                    tot_sec = tt.get('hours', 0) * 3600 + tt.get('minutes', 0) * 60 + tt.get('seconds', 0)

                if current_file:
                    if current_file != last_file:
                        print(f"\n >>> REPRODUCIENDO: {clean_title(current_file)}")
                        reset_votes(current_file)
                        last_file = current_file

                    # Actualizar Firebase para la web
                    db.collection('state').document('nowPlaying').set({
                        'title': clean_title(current_file),
                        'currentTime': cur_sec,
                        'totalTime': tot_sec
                    })

            else:
                # Nada suena — buscar el siguiente (máx 1 vez cada 5 seg)
                now = time.time()
                if now - last_play_attempt > 5:
                    next_s = get_next_song(local_filenames_list)
                    if next_s:
                        play_file(next_s)
                        last_play_attempt = now
                        last_file = None

        except Exception as e:
            print(f" [ERROR] {e}")

        time.sleep(1)


if __name__ == "__main__":
    bridge_loop()
