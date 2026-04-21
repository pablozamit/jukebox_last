import asyncio, json, os, glob, random, time
from datetime import datetime, time as dt_time
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
FIREBASE_CRED_PATH = os.getenv("FIREBASE_CREDENTIALS_JSON", "./serviceAccountKey.json")

print("Inicializando Firebase...")
cred = credentials.Certificate(FIREBASE_CRED_PATH)
if not firebase_admin._apps: firebase_admin.initialize_app(cred)
db = firestore.client()

def clean_title(filename):
    if not filename: return "Cargando..."
    name = os.path.basename(filename)
    return name[:-4] if name.lower().endswith(".mp4") else name

def sync_local_files():
    search_path = os.path.join(VIDEO_FOLDER_PATH, "*.mp4")
    local_filenames = [os.path.basename(f) for f in glob.glob(search_path)]
   
    # Empaquetar todo el catálogo en una sola lista para el Documento Único
    catalog_list = []
    for fname in local_filenames:
        catalog_list.append({
            'id': fname,
            'title': clean_title(fname),
            'available': True
        })
   
    # Guardar la lista entera en 1 sola operación/documento
    db.collection('catalog').document('full_list').set({'songs': catalog_list})
    print(f"Catálogo sincronizado: {len(catalog_list)} canciones guardadas en 1 solo documento.")
    return local_filenames

async def clear_all_data():
    """Limpia absolutamente todo: cola de canciones, tokens de usuarios y cooldowns."""
    try:
        print(" [SISTEMA] Realizando limpieza de nueva jornada...")
        batch = db.batch()
        count = 0
        
        # 1. Borrar todos los documentos de la cola de canciones
        songs_ref = db.collection('songs').stream()
        for song in songs_ref:
            batch.delete(song.reference)
            count += 1
            if count >= 400:
                batch.commit(); batch = db.batch(); count = 0
        
        # 2. Resetear propuestas y votos de TODOS los usuarios
        users_ref = db.collection('users').stream()
        for user in users_ref:
            batch.update(user.reference, {'proposals': [], 'votes': []})
            count += 1
            if count >= 400:
                batch.commit(); batch = db.batch(); count = 0
        
        # 3. Limpiar el documento de cooldowns (bloqueos de 1 hora)
        batch.delete(db.collection('state').document('cooldowns'))
        
        if count > 0:
            batch.commit()
            
        print(" [SISTEMA] ¡Base de datos reseteada para la nueva sesión!")
    except Exception as e:
        print(f" Error en limpieza total: {e}")

async def check_for_new_session():
    """Comprueba si toca resetear según la hora de la última activación."""
    try:
        now = datetime.now()
        state_doc = db.collection('state').document('nowPlaying').get()
        
        if state_doc.exists:
            last_active_ms = state_doc.to_dict().get('lastActive', 0)
            if last_active_ms:
                last_active_dt = datetime.fromtimestamp(last_active_ms / 1000.0)
                
                # Límite: las 2:00 AM del día actual
                limite_hoy_2am = datetime.combine(now.date(), dt_time(2, 0))
                
                if last_active_dt < limite_hoy_2am and now > limite_hoy_2am:
                    await clear_all_data()
                else:
                    print(" [SISTEMA] Continuidad detectada. No se requiere limpieza.")
    except Exception as e:
        print(f" Error al comprobar sesión: {e}")

async def reset_song_and_tokens(filename):
    """Limpieza absoluta de votos y tokens de usuario en listas."""
    try:
        # Borramos el documento de la cola en lugar de ponerlo a 0, para no acumular basura
        db.collection('songs').document(filename).delete()
       
        users_ref = db.collection('users')
        batch = db.batch()
        c = 0
       
        # 1. Liberar el token de "Propuestas" a quienes la añadieron
        prop_docs = users_ref.where("proposals", "array_contains", filename).stream()
        for udoc in prop_docs:
            batch.update(udoc.reference, {'proposals': firestore.ArrayRemove([filename])})
            c += 1
            if c >= 400:
                batch.commit(); batch = db.batch(); c = 0
               
        # 2. Liberar el token de "Votos" a quienes la votaron
        vote_docs = users_ref.where("votes", "array_contains", filename).stream()
        for udoc in vote_docs:
            batch.update(udoc.reference, {'votes': firestore.ArrayRemove([filename])})
            c += 1
            if c >= 400:
                batch.commit(); batch = db.batch(); c = 0
               
        if c > 0: batch.commit()
        print(f" [LIMPIEZA] Votos y tokens reseteados para {filename}")
    except Exception as e: 
        print(f" Error limpieza: {e}")

async def play_song_on_kodi(ws, filename, current_playing_file):
    current_playing_file[0] = filename
    await reset_song_and_tokens(filename)
   
    filepath = os.path.join(VIDEO_FOLDER_PATH, filename).replace("\\", "/")
    payload = {"jsonrpc": "2.0", "method": "Player.Open", "params": { "item": { "file": filepath } }, "id": 1}
   
    db.collection('state').document('nowPlaying').set({
        'title': clean_title(filename),
        'currentTime': 0,
        'totalTime': 0,
        'lastActive': int(time.time() * 1000)
    })
    db.collection('state').document('cooldowns').set({filename: int(time.time() * 1000)}, merge=True)
    await ws.send(json.dumps(payload))
    print(f" >>> REPRODUCIENDO: {clean_title(filename)}")

async def get_next_song(local_filenames):
    try:
        query = db.collection('songs').where("votes", ">", 0).order_by("votes", direction=firestore.Query.DESCENDING).order_by("firstVotedAt", direction=firestore.Query.ASCENDING).limit(1)
        top_song = next(query.stream(), None)
        if top_song: return top_song.id
    except: pass
    return random.choice(local_filenames) if local_filenames else None

async def admin_commands_listener(ws, local_filenames, current_playing_file):
    while True:
        try:
            force_ref = db.collection('commands').document('forcePlay')
            force_doc = force_ref.get()
            if force_doc.exists:
                fname = force_doc.to_dict().get('filename')
                force_ref.delete()
                if fname: await play_song_on_kodi(ws, fname, current_playing_file)

            skip_ref = db.collection('commands').document('skipCurrent')
            if skip_ref.get().exists:
                skip_ref.delete()
                await ws.send(json.dumps({"jsonrpc": "2.0", "method": "Player.Stop", "params": {"playerid": 1}, "id": "skip"}))
        except: pass
        await asyncio.sleep(2)

async def progress_tracker(ws, current_playing_file):
    while True:
        try:
            if current_playing_file[0]:
                await ws.send(json.dumps({"jsonrpc": "2.0", "method": "Player.GetProperties", "params": {"playerid": 1, "properties": ["time", "totaltime"]}, "id": "progress"}))
            else:
                # Si no hay nada sonando, igual actualizamos lastActive para que la web sepa que el puente vive
                db.collection('state').document('nowPlaying').set({'lastActive': int(time.time() * 1000)}, merge=True)
        except: pass
        # Frecuencia reducida a 5 segundos (Plan Blaze)
        await asyncio.sleep(5)

async def main():
    local_filenames = sync_local_files()
    
    # Comprobar si es necesario resetear datos por nueva jornada
    await check_for_new_session()
    
    uri = f"ws://{KODI_USER}:{KODI_PASS}@{KODI_IP}:{KODI_PORT}/jsonrpc"
    async with websockets.connect(uri) as ws:
        print("Conectado a Kodi.")
        current_playing_file = [None]
        asyncio.create_task(progress_tracker(ws, current_playing_file))
        asyncio.create_task(admin_commands_listener(ws, local_filenames, current_playing_file))
        await ws.send(json.dumps({"jsonrpc": "2.0", "method": "Player.GetActivePlayers", "id": "check_active"}))

        while True:
            data = json.loads(await ws.recv())
            if data.get("method") == "Player.OnPlay":
                filename = os.path.basename(data.get("params", {}).get("data", {}).get("item", {}).get("file", ""))
                if filename: current_playing_file[0] = filename
            elif data.get("method") == "Player.OnStop":
                n = await get_next_song(local_filenames)
                if n: await play_song_on_kodi(ws, n, current_playing_file)
            elif data.get("id") == "check_active" and not data.get("result"):
                n = await get_next_song(local_filenames)
                if n: await play_song_on_kodi(ws, n, current_playing_file)
            elif data.get("id") == "progress":
                res = data.get("result", {})
                if "time" in res and current_playing_file[0]:
                    cur = res["time"].get("seconds",0) + res["time"].get("minutes",0)*60
                    tot = res["totaltime"].get("seconds",0) + res["totaltime"].get("minutes",0)*60
                    db.collection('state').document('nowPlaying').set({
                        'title': clean_title(current_playing_file[0]),
                        'currentTime': cur,
                        'totalTime': tot,
                        'lastActive': int(time.time() * 1000)
                    })

if __name__ == "__main__": asyncio.run(main())
