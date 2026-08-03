"""
Generador de preguntas de trivia a partir del catálogo real de La Catrina.

Lee catalog/full_list de Firestore, extrae el artista de cada canción
(formato "Artista - Título") y genera 100 preguntas estilo Kahoot:

    "¿De qué banda o artista es la canción 'X'?"  con 4 opciones.

Salida: web-app/src/triviaQuestions.js (array de objetos con la canción,
las 4 opciones barajadas y el índice de la respuesta correcta).

Uso (desde la raíz del repo):
    python python-bridge/generate_trivia.py
"""
import json
import os
import random
import re
import sys
from collections import defaultdict

import firebase_admin
from firebase_admin import credentials, firestore

NUM_QUESTIONS = int(os.getenv("TRIVIA_NUM_QUESTIONS", "100"))
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "web-app", "src", "triviaQuestions.js")


def clean_artist(a):
    """Limpia el nombre del artista: quita feat., paréntesis finales, etc."""
    a = a.strip()
    a = re.sub(r"\s+\(feat\..*?\)", "", a, flags=re.I).strip()
    a = re.sub(r"\s+feat\..*$", "", a, flags=re.I).strip()
    a = re.sub(r"\s*\([^)]*\)\s*$", "", a).strip()
    return a


def clean_song(song):
    """Limpia el título de la canción: quita sufijos numéricos del catálogo
    ('True Faith-1') y convierte guiones bajos en apóstrofes ('I Ain_t The Same')."""
    song = re.sub(r"-\d+$", "", song).strip()
    song = song.replace("_", "'").strip()
    return song


def parse_title(title):
    for sep in [" - ", " – ", " — "]:
        if sep in title:
            artist, song = title.split(sep, 1)
            artist = clean_artist(artist)
            song = clean_song(song)
            # Evita títulos kilométricos que no cabrían en la tarjeta
            if artist and song and len(song) <= 60 and len(artist) <= 40:
                return artist, song
    return None, None


def main():
    cred = credentials.Certificate(os.path.join(os.path.dirname(__file__), "serviceAccountKey.json"))
    app = firebase_admin.initialize_app(cred, name="trivia-gen")
    db = firestore.client(app)

    cat = db.collection("catalog").document("full_list").get()
    songs = cat.to_dict().get("songs", []) if cat.exists else []
    print(f"Catálogo: {len(songs)} canciones")

    by_artist = defaultdict(list)
    parsed = 0
    for s in songs:
        artist, song = parse_title(s.get("title", ""))
        if artist and song:
            by_artist[artist].append(song)
            parsed += 1
    print(f"Parseadas: {parsed} canciones, {len(by_artist)} artistas distintos")

    if len(by_artist) < 4:
        print("ERROR: no hay suficientes artistas para generar opciones.")
        sys.exit(1)

    # Prioriza artistas con más canciones (más conocidos en el bar).
    ranked = sorted(by_artist.items(), key=lambda kv: len(kv[1]), reverse=True)

    random.seed(2026)
    questions = []
    # 1 canción del artista más popular, 2ª canción si hace falta llegar a 100.
    for artist, pool in ranked:
        if len(questions) >= NUM_QUESTIONS:
            break
        for song in random.sample(pool, min(2, len(pool))):
            if len(questions) >= NUM_QUESTIONS:
                break
            questions.append((artist, song))
    print(f"Preguntas a generar: {len(questions)}")

    all_artists = list(by_artist.keys())
    qs = []
    for artist, song in questions:
        distractors = random.sample([a for a in all_artists if a != artist], 3)
        options = [artist] + distractors
        random.shuffle(options)
        answer = options.index(artist)
        qs.append({"song": song, "artist": artist, "options": options, "answer": answer})

    # Validación final: 4 opciones únicas y la respuesta correcta en rango.
    for q in qs:
        assert len(set(q["options"])) == 4, q
        assert 0 <= q["answer"] <= 3, q

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write("// Generado automáticamente por python-bridge/generate_trivia.py desde el catálogo real.\n")
        f.write("// Pregunta: '¿De qué banda o artista es la canción X?' con 4 opciones.\n")
        f.write("export const triviaQuestions = [\n")
        for q in qs:
            opts = json.dumps(q["options"], ensure_ascii=False)
            f.write(
                f"  {{ song: {json.dumps(q['song'], ensure_ascii=False)}, "
                f"artist: {json.dumps(q['artist'], ensure_ascii=False)}, "
                f"options: {opts}, answer: {q['answer']} }},\n"
            )
        f.write("];\n\nexport default triviaQuestions;\n")

    firebase_admin.delete_app(app)
    print(f"OK -> {os.path.normpath(OUT_PATH)} ({len(qs)} preguntas)")


if __name__ == "__main__":
    main()
