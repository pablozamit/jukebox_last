import asyncio, json, os, glob, random, time
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
    songs_ref = db.collection('songs')
    existing_docs = {doc.id for doc in songs_ref.select([]).stream()} 
    search_path = os.path.join(VIDEO_FOLDER_PATH, "*.mp4")
    local_filenames = [os.path.basename(f) for f in glob.glob(search_path)]
    batch = db.batch()
    count = 0
    for fname in local_filenames:
        if fname not in existing_docs:
            batch.set(songs_ref.document(fname), {'title': clean_title(fname), 'votes': 0, 'firstVotedAt': 0, 'available': True})
            count += 1
            if count >= 400:
                batch.commit(); batch = db.batch(); count = 0
    if count > 0: batch.commit()
    return local_filenames

async def reset_song_and_tokens(filename):
    """Limpieza absoluta de votos y tokens de usuario."""
    try:
        db.collection('songs').document(filename).update({'votes': 0, 'firstVotedAt': 0})
        users_ref = db.collection('users')
        user_docs = users_ref.where("activeVote", "==", filename).stream()
        batch = db.batch()
        c = 0
        for udoc in user_docs:
            batch.update(udoc.reference, {'activeVote': None})
            c += 1
            if c >= 400:
                batch.commit(); batch = db.batch(); c = 0
        if c > 0: batch.commit()
        print(f" [LIMPIEZA] Votos y tokens reseteados para {filename}")
    except Exception as e: print(f" Error limpieza: {e}")

async def play_song_on_kodi(ws, filename, current_playing_file):
    current_playing_file[0] = filename
    # LIMPIEZA INMEDIATA: No esperamos a que Kodi diga OnPlay
    await reset_song_and_tokens(filename)
    
    filepath = os.path.join(VIDEO_FOLDER_PATH, filename).replace("\\", "/") 
    payload = {"jsonrpc": "2.0", "method": "Player.Open", "params": { "item": { "file": filepath } }, "id": 1}
    
    db.collection('state').document('nowPlaying').set({'title': clean_title(filename), 'currentTime': 0, 'totalTime': 0})
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
        except: pass
        await asyncio.sleep(1)

async def main():
    local_filenames = sync_local_files()
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
                    db.collection('state').document('nowPlaying').set({'title': clean_title(current_playing_file[0]), 'currentTime': cur, 'totalTime': tot})

if __name__ == "__main__": asyncio.run(main())
