# MANUAL DE INSTALACIÓN Y ARRANQUE EN EL BAR (v2)

Este documento es tu billete para que todo funcione sin sorpresas cuando llegues al local. Llévalo abierto en el móvil o sigue los pasos desde allí.

> **⚠️ IMPORTANTE — Si ya tenías la v1 funcionando:** Esta es la v2, con muchas mejoras (trivia Kahoot cada 30 min, contador de usuarios activos en tiempo real, limpieza automática de jornada, leaderboard de DJ de la noche, etc.). Tienes que actualizar el bridge del bar. Sigue la sección [🔁 Actualizar de v1 a v2](#-actualizar-de-v1-a-v2) si YA tienes el bridge corriendo.

---

## 📦 1. QUÉ TIENES QUE LLEVAR EN EL PENDRIVE EXACTAMENTE

Para no depender de descargar cosas pesadas con el internet del bar, mete esto en tu USB desde casa y pásalo a una carpeta cualquiera en el escritorio del PC del bar (ej: `Carpeta Jukebox`):

1. **El archivo `bridge.py`** (nueva versión v2): Está dentro de la carpeta `python-bridge` de tu proyecto.
2. **El archivo `set_admin.py`**: También en `python-bridge`. Lo necesitarás para dar permisos de admin (solo una vez).
3. **Este propio documento (`INSTRUCCIONES_BAR.md`)**: Para poder abrirlo y leerlo allí.
4. **`serviceAccountKey.json`**: Tu clave secreta de administrador (ya está en la carpeta `python-bridge`).
5. **El archivo `.env`**: Tu configuración del puente (cópialo de `.env.example` y rellena los valores del bar).
6. **`deploy_rules.py`** (NUEVO en v2): Script para desplegar las reglas de seguridad actualizadas.
7. **`firestore.rules`** (NUEVO en v2): Reglas de seguridad canónicas. También puedes copiar `security-rules.txt` (idéntico, para pegado manual en la consola de Firebase).
8. **`firebase.json`** (NUEVO en v2): Configuración de Firebase Hosting.
9. *(Opcional pero recomendado)* **El instalador de Python**: Descárgalo desde python.org en casa y mételo al pendrive por si el PC del bar no lo tuviera instalado.
10. *(Opcional)* **El instalador de Kodi**: Por si tuvieras que instalarlo de cero.

**Nota:** Los archivos `bridge.py`, `set_admin.py`, `deploy_rules.py`, el `.env`, el `.json`, `firestore.rules` y `firebase.json` **deben estar juntos** en la misma carpeta cuando los pegues en el PC del bar. Y por supuesto, asegúrate de que el disco duro externo o la carpeta con todos los **archivos de vídeo de karaoke/música** esté conectada al PC.

---

## 🔁 ACTUALIZAR DE v1 A v2

Si ya tenías el bridge v1 corriendo en el bar, esto es lo que cambia:

### ¿Qué archivos tengo que reemplazar?

Solo necesitas copiar estos archivos nuevos a la carpeta del bar (sobrescribiendo los antiguos):

| Archivo | Acción |
|---|---|
| `bridge.py` | **Sobrescribir** — tiene funciones nuevas (contador de usuarios activos, watchdog de sesión, limpieza inteligente) |
| `deploy_rules.py` | **Nuevo** — cópialo (no existía en v1) |
| `firestore.rules` | **Nuevo** — cópialo (no existía en v1) |
| `firebase.json` | **Nuevo** — cópialo (no existía en v1) |
| `security-rules.txt` | **Sobrescribir** — reglas actualizadas para la trivia y votos gratis |

**El `.env` y `serviceAccountKey.json` NO cambian.** Déjalos como están.

### ¿Tengo que instalar algo nuevo con pip?

**No.** Las dependencias son las mismas. Si ya tenías instalado `firebase-admin`, `python-dotenv`, `websockets` y `requests`, no necesitas instalar nada más.

### Desplegar las nuevas reglas de seguridad (IMPORTANTE)

La v2 introduce nuevas funciones (trivia, propuestas gratis, contador de usuarios activos) que necesitan reglas de seguridad actualizadas. **Desde el PC del bar o desde casa**, con el bridge parado:

```cmd
python deploy_rules.py
```

Verás algo como:
```
✅ Reglas desplegadas correctamente. Ruleset: ...
```

Luego verifica que todo funciona (36/36 pruebas):

```cmd
python test_security_rules.py
```

Si ves `✅ 36/36`, estás listo.

### Arrancar el nuevo bridge

Paras el bridge antiguo (`Ctrl+C` en la consola) y ejecutas el nuevo:

```cmd
python bridge.py
```

Verás mensajes nuevos como:
- `[SISTEMA] Realizando limpieza de nueva jornada...`
- `[LIMPIEZA] Votos y tokens reseteados para ... (+15 pts a 3 DJs)`
- El contador de usuarios activos se actualiza cada 15s automáticamente

---

## 🔥 2. CONFIGURAR FIREBASE (UNA SOLA VEZ, DESDE CASA)

Antes de ir al bar, necesitas configurar Firebase Authentication para el panel de admin:

1. Ve a [Firebase Console](https://console.firebase.google.com/) > tu proyecto `jukebox-catrinero`.
2. En el menú lateral, ve a **Authentication > Sign-in method**.
3. Activa **Email/Password** (solo Password, no necesitas Email link).
4. Ve a **Authentication > Users** y haz clic en **Add user**.
5. Crea el usuario admin con un email (ej: `admin@lacatrina.com`) y una contraseña segura.
6. **Anota esas credenciales** — las necesitarás para entrar al panel admin en el bar.

### Dar permisos de admin al usuario

En tu PC de casa (con Python y `firebase-admin` instalado), desde la carpeta `python-bridge`:

```cmd
python set_admin.py admin@lacatrina.com
```

Esto añade el UID del usuario a la colección `admins` de Firestore. Solo necesita hacerse **una vez**.

### Reglas de seguridad (actualizadas para v2)

Las reglas de seguridad v2 están **desplegadas y verificadas** (36/36 pruebas). Los archivos canónicos son `firestore.rules` (para deploy automático) y `security-rules.txt` (idéntico, para pegado manual en la consola de Firebase).

**Es obligatorio desplegar las reglas nuevas** porque la v2 usa campos que la v1 no tenía (`freeProposals`, `lastTriviaAt`, etc.).

Para desplegarlas:

```cmd
python deploy_rules.py
```

Y verifica que todo sigue funcionando con:

```cmd
python test_security_rules.py
```

También puedes pegarlas a mano en **Firestore Database > Rules** de la consola de Firebase (copia el contenido de `security-rules.txt`). Si algo fallara tras un cambio, vuelve atrás con `python deploy_rules.py --rollback-to <ruleset_anterior>`.

---

## 📺 3. CONFIGURAR EL KODI EN EL BAR

Una vez en el PC del bar, abre Kodi:
1. Ve a **Ajustes (el engranaje) > Servicios > Control**.
2. **Activa** "Permitir control remoto por HTTP".
3. Marca el puerto **8080**.
4. Escribe el **Usuario** y la **Contraseña** que quieras ponerle por seguridad a la app web interna de Kodi (ejemplo: usuario `kodi`, contraseña `kodi`).
5. Cierra Kodi para que guarde cambios, y vuelve a abrirlo (déjalo abierto siempre de fondo).

---

## 🐍 4. INSTALACIÓN DE PYTHON

En el PC físico del bar (es necesario que esté conectado al WiFi/cable):
1. Asegúrate de tener **Python** instalado (márcalo para añadir al PATH durante su instalación si no lo tienes).
2. Abre la consola de Windows (Buscador > `cmd`).
3. Lanza este comando para instalar lo que necesita tu programa Jukebox:
   ```cmd
   pip install requests firebase-admin python-dotenv websockets
   ```

---

## 🔌 5. CREAR EL ARCHIVO .ENV CON LA CONFIGURACIÓN LOCAL

En la carpeta donde pegaste los archivos del pendrive, crea un archivo llamado `.env` (puedes copiar el `.env.example` y renombrarlo). Ábrelo con el Bloc de notas y rellena los valores:

```env
KODI_IP=127.0.0.1
KODI_PORT=9090
KODI_USER=kodi
KODI_PASS=kodi
VIDEO_FOLDER_PATH=D:/Pon/Aqui/La/Ruta/A/Tus/Videos
FIREBASE_CREDENTIALS_JSON=./serviceAccountKey.json
```

**Importante:**
- En `VIDEO_FOLDER_PATH` usa `/` en vez de `\`.
- El `KODI_USER` y `KODI_PASS` deben coincidir con los que pusiste en Kodi.
- **Guarda el archivo**.

---

## 🚀 6. EL MOMENTO DE LA VERDAD (ESTRENO)

1. **(NUEVO en v2)** Primero, despliega las reglas de seguridad:
   ```cmd
   python deploy_rules.py
   ```
   Y verifica: `python test_security_rules.py` (debe decir ✅ 36/36).

2. Saca tu móvil y entra como Admin en el enlace web real de tu Jukebox añadiendo `/admin` al final (por ejemplo: `https://jukebox-last.vercel.app/admin`).
3. **Inicia sesión** con el email y contraseña que creaste en el paso 2 (ej: `admin@lacatrina.com`).
4. En el PC del bar (con Kodi minimizado por detrás), abre la consola de Windows y colócate en la carpeta donde metiste el `bridge.py`, el `.env` y la contraseña json.
5. Ejecuta esto:
   ```cmd
   python bridge.py
   ```
6. La consola mostrará:
   - `Inicializando Firebase...`
   - `Catálogo sincronizado: XXX canciones guardadas en 1 solo documento.`
   - `[SISTEMA]` mensajes de estado
   - `Conectado a Kodi.`
7. Verás iluminarse tu móvil al instante con todas las canciones de tu carpeta. Prueba a darle al botón Verde (Force Play) a cualquier canción nueva y maravíllate viendo a Kodi empezar a reproducirla a los 2 segundos.

### Novedades de la v2 que verás en la web

- 🎁 **Trivia Kahoot**: Cada 30 minutos aparece una bolita de regalo en la esquina inferior derecha. Los usuarios pueden jugar una pregunta sobre grupos de la playlist y ganar +1 propuesta y +2 votos gratis si aciertan.
- 👥 **Contador de usuarios activos**: En la cabecera de la cola se muestra cuánta gente está participando en tiempo real.
- 🏆 **DJ de la noche**: Leaderboard que se resetea cada jornada. Los usuarios registrados acumulan puntos cuando suena su canción.
- 🎨 **Dos temas visuales**: Modo Catrina Rock (nuevo, estilo cantina retro) y Modo Neón (clásico). Los usuarios pueden cambiar con el toggle del header.
- 📊 **Estadísticas mejoradas**: Plays, votos y franjas horarias con limpieza automática diaria/semanal/mensual.

---

## 🩺 7. SOLUCIÓN DE PROBLEMAS

### El bridge no arranca

```cmd
pip install requests firebase-admin python-dotenv websockets
```
Asegúrate de que los 4 paquetes están instalados.

### Error de permisos en Firebase

Vuelve a desplegar las reglas:
```cmd
python deploy_rules.py
```

### Kodi no responde

- Asegúrate de que Kodi está abierto y en la pantalla principal (no en un menú).
- Verifica que en Ajustes > Servicios > Control está activado "Permitir control remoto por HTTP".
- Verifica que `KODI_PORT` en `.env` es `9090` (NO `8080` — el 8080 es el puerto web, el 9090 es el de WebSocket).

### La trivia no aparece en la web

Si el bridge no está corriendo, algunas funciones (como el contador de usuarios activos) no se actualizan pero la trivia funciona igual porque es 100% frontend. Si no ves la bolita 🎁, espera hasta la siguiente media hora (aparece en los primeros 10 minutos de cada bloque de 30 min: xx:00–xx:10 y xx:30–xx:40).

---

## 🧹 8. GENERAR NUEVAS PREGUNTAS DE TRIVIA (opcional, desde casa)

Si algún día añades muchas canciones nuevas al catálogo y quieres regenerar las preguntas:

```cmd
cd python-bridge
python generate_trivia.py
```

Esto lee el catálogo real de Firestore, extrae los artistas, y genera 100 preguntas nuevas en `web-app/src/triviaQuestions.js`. Luego haz commit y push para que Vercel las despliegue.

---

¡Y ya está! 🍷 Tírate una caña. Has creado el sistema y está funcionando local y remotamente de forma síncrona. Todo el bar puede entrar a tu Vercel y jugar con la máquina.
