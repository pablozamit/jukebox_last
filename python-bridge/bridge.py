import asyncio
import json
import os
import glob
import random
import time
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore
import websockets

# Cargar variables de entorno
load_dotenv()

KODI_IP = os.getenv("KODI_IP", "127.0.0.1")
KODI_PORT = int(os.getenv("KODI_PORT", 9090))
VIDEO_FOLDER_PATH = os.getenv("VIDEO_FOLDER_PATH", "./videos")
FIREBASE_CRED_PATH = os.getenv("FIREBASE_CREDENTIALS_JSON", "./serviceAccountKey.json")

# Inicializar Firebase
print("Inicializando Firebase...")
cred = credentials.Certificate(FIREBASE_CRED_PATH)
firebase_admin.initialize_app(cred)
db = firestore.client()

def clean_title(filename):
    name = os.path.basename(filename)
    if name.lower().endswith(".mp4"):
        name = name[:-4]
    return name

def sync_local_files():
    print("Sincronizando archivos locales con Firebase. Esto puede tardar si hay miles de archivos...")
    songs_ref = db.collection('songs')
    existing_docs = {doc.id for doc in songs_ref.select([]).stream()} # Solo IDs
    
    search_path = os.path.join(VIDEO_FOLDER_PATH, "*.mp4")
    local_files = glob.glob(search_path)
    local_filenames = [os.path.basename(f) for f in local_files]
    
    batch = db.batch()
    batch_count = 0
    added = 0
    
    for fname in local_filenames:
        if fname not in existing_docs:
            doc_ref = songs_ref.document(fname)
            batch.set(doc_ref, {
                'title': clean_title(fname),
                'votes': 0,
                'firstVotedAt': 0
            })
            batch_count += 1
            added += 1
            
            # Subir en lotes de 500 (límite de Firestore)
            if batch_count >= 500:
                batch.commit()
                batch = db.batch()
                batch_count = 0
                
    if batch_count > 0:
        batch.commit()
        
    print(f"Sincronización completa. Añadidas {added} nuevas canciones.")
    return local_filenames

async def get_next_song(local_filenames):
    """Obtiene la canción con más votos o una al azar."""
    songs_ref = db.collection('songs')
    query = songs_ref.where("votes", ">", 0).order_by("votes", direction=firestore.Query.DESCENDING).order_by("firstVotedAt", direction=firestore.Query.ASCENDING).limit(1)
    
    docs = query.stream()
    top_song = next(docs, None)
    
    if top_song:
        return top_song.id
    else:
        # random
        if not local_filenames:
            return None
        return random.choice(local_filenames)

async def play_song_on_kodi(ws, filename):
    filepath = os.path.join(VIDEO_FOLDER_PATH, filename)
    filepath = filepath.replace("\\", "/") # Kodi prefers forward slashes or valid paths
    
    payload = {
        "jsonrpc": "2.0",
        "method": "Player.Open",
        "params": {
            "item": { "file": filepath }
        },
        "id": 1
    }
    print(f"Reproduciendo: {filename}")
    await ws.send(json.dumps(payload))

async def handle_song_started(filename):
    """Recuperación de Tokens y reseteo de votos de la canción."""
    print(f"Evento OnPlay detectado para: {filename}")
    
    # 1. Resetear votos de la canción a 0
    song_ref = db.collection('songs').document(filename)
    song_doc = song_ref.get()
    
    if getattr(song_doc, 'exists', getattr(song_doc, '_exists', False)) and song_doc.to_dict().get('votes', 0) > 0:
        song_ref.update({'votes': 0, 'firstVotedAt': 0})
        
    # 2. Recuperar tokens de usuarios que votaron por esta canción
    users_ref = db.collection('users')
    query = users_ref.where("activeVote", "==", filename)
    user_docs = query.stream()
    
    batch = db.batch()
    batch_count = 0
    restored = 0
    for udoc in user_docs:
        batch.update(udoc.reference, {'activeVote': None})
        batch_count += 1
        restored += 1
        if batch_count >= 500:
            batch.commit()
            batch = db.batch()
            batch_count = 0
    if batch_count > 0:
        batch.commit()
        
    if restored > 0:
        print(f"Tokens devueltos a {restored} usuarios.")

async def progress_tracker(ws):
    """ Bucle que actualiza Firebase con el progreso cada 1s. """
    state_ref = db.collection('state').document('nowPlaying')
    
    while True:
        try:
            # Reclamamos la info del reproductor 1 (video o audio en Kodi)
            req = {
                "jsonrpc": "2.0",
                "method": "Player.GetProperties",
                "params": {"playerid": 1, "properties": ["time", "totaltime", "title"]},
                "id": "progress"
            }
            await ws.send(json.dumps(req))
        except Exception:
            pass
        await asyncio.sleep(1)

async def main():
    local_filenames = sync_local_files()
    if not local_filenames:
        print("ERROR: No se encontraron videos en la carpeta especificada.")
        return

    uri = f"ws://{KODI_IP}:{KODI_PORT}/jsonrpc"
    print(f"Conectando a Kodi en {uri}...")
    
    async with websockets.connect(uri) as ws:
        print("Conectado a Kodi.")
        
        # Iniciar bucle de seguimiento de progreso
        asyncio.create_task(progress_tracker(ws))
        
        # Chequear si está inactivo para forzar inicio
        try:
            check_req = {
                "jsonrpc": "2.0",
                "method": "Player.GetActivePlayers",
                "id": "check_active"
            }
            await ws.send(json.dumps(check_req))
        except Exception as e:
            print("Error inicial:", e)

        current_playing_file = None

        while True:
            response = await ws.recv()
            try:
                data = json.loads(response)
                
                # Gestión de Player.OnPlay
                if data.get("method") == "Player.OnPlay":
                    item = data.get("params", {}).get("data", {}).get("item", {})
                    # Kodi manda file info a veces, si no, intentamos sacar el nombre
                    filename = item.get("file", "")
                    if not filename:
                        filename = item.get("title", "") + ".mp4"
                    else:
                        filename = os.path.basename(filename)
                    
                    if filename:
                        current_playing_file = filename
                        await handle_song_started(filename)

                # Gestión de Player.OnStop (canción terminó)
                elif data.get("method") == "Player.OnStop":
                    print("La canción ha terminado. Buscando siguiente...")
                    next_song = await get_next_song(local_filenames)
                    if next_song:
                        await play_song_on_kodi(ws, next_song)

                # Respuesta a check_active inicial
                elif data.get("id") == "check_active":
                    result = data.get("result", [])
                    if len(result) == 0:
                        # Nada reproduciendo, lanzar la primera
                        next_song = await get_next_song(local_filenames)
                        if next_song:
                            await play_song_on_kodi(ws, next_song)

                # Respuestas al tracker de progreso
                elif data.get("id") == "progress":
                    result = data.get("result", {})
                    if "time" in result and "totaltime" in result:
                        t = result["time"]
                        tt = result["totaltime"]
                        cur_sec = t.get("hours", 0)*3600 + t.get("minutes", 0)*60 + t.get("seconds", 0)
                        tot_sec = tt.get("hours", 0)*3600 + tt.get("minutes", 0)*60 + tt.get("seconds", 0)
                        
                        # Extraer título si viene de Kodi, si no usar el de archivo cacheado
                        title_str = clean_title(current_playing_file) if current_playing_file else "Desconocido"
                        
                        # Set to firebase
                        db.collection('state').document('nowPlaying').set({
                            'title': title_str,
                            'currentTime': cur_sec,
                            'totalTime': tot_sec
                        })
            except Exception as e:
                pass # print(f"Error procesando mensaje: {e}")

if __name__ == "__main__":
    asyncio.run(main())
