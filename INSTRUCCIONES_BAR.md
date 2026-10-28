# MANUAL DE INSTALACIÓN Y ARRANQUE EN EL BAR (v2)

Este documento es tu billete para que todo funcione sin sorpresas cuando llegues al local. Llévalo abierto en el móvil o sigue los pasos desde allí.

> **Versión candidata:** validada con pruebas locales, no con Kodi ni el ordenador del bar. Una liquidación ambigua puede dejar una canción bloqueada para revisión; resuelve la operativa de revisión y prueba el recorrido real antes de usarla durante el servicio.

> **Actualización desde v1:** Si hay una instalación v1 en el bar, sigue la sección [🔁 Actualizar de v1 a v2](#-actualizar-de-v1-a-v2) para reemplazar el puente y sus módulos.

---

## 📦 1. QUÉ TIENES QUE LLEVAR EN EL PENDRIVE EXACTAMENTE

Para no depender de descargar cosas pesadas con el internet del bar, mete esto en tu USB desde casa y pásalo a una carpeta cualquiera en el escritorio del PC del bar (ej: `Carpeta Jukebox`):

1. **`bridge.py`, `social_events.py`, `bridge_runtime.py` y `requirements.txt`**, desde `python-bridge`.
2. **`set_admin.py`**, si aún necesitas conceder permisos a la cuenta admin.
3. Este documento (`INSTRUCCIONES_BAR.md`).
4. El archivo `.env` con la configuración local del bar.
5. La credencial de Firebase, solo si el responsable la ha preparado y autorizado para ese equipo.
6. *(Opcional)* Instaladores de Python y Kodi.

**Nota:** Conserva juntos `bridge.py`, `social_events.py`, `bridge_runtime.py` y los módulos Python requeridos y `.env`. Mantén las credenciales protegidas y conecta el disco o carpeta de vídeos.

**Estado:** este manual no confirma que el puente esté instalado, arrancado o probado en el bar. Valida esos pasos allí antes de dar el sistema por operativo.

---

## 🔁 ACTUALIZAR DE v1 A v2

Si existe una instalación v1 del puente en el bar, estos son los archivos que hay que actualizar:

### ¿Qué archivos tengo que reemplazar?

Solo necesitas copiar estos archivos nuevos a la carpeta del bar (sobrescribiendo los antiguos):

| Archivo | Acción |
|---|---|
| `bridge.py` | **Sobrescribir** — tiene funciones nuevas (contador de usuarios activos, watchdog de sesión, limpieza inteligente) |
| `social_events.py` | **Añadir** — módulo requerido por la versión actual del puente |
| `bridge_runtime.py` | **Añadir** — módulo requerido por la versión actual del puente |

**El `.env` y `serviceAccountKey.json` NO cambian.** Déjalos como están.

### ¿Tengo que instalar algo nuevo con pip?

Comprueba e instala las dependencias de `requirements.txt`, incluida `tzdata` para el horario de Madrid en Windows.

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

### Reglas de seguridad

Este manual no despliega ni valida reglas de Firebase. No ejecutes desde el bar scripts de despliegue o pruebas de reglas contra producción. Cualquier cambio requiere el procedimiento autorizado del proyecto y validación en emuladores.

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
   pip install -r requirements.txt
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

1. Saca tu móvil y entra como Admin en el enlace web real de tu Jukebox añadiendo `/admin` al final (por ejemplo: `https://jukebox-last.vercel.app/admin`).
2. **Inicia sesión** con el email y contraseña que creaste en el paso 2 (ej: `admin@lacatrina.com`).
3. En el PC del bar (con Kodi minimizado por detrás), abre la consola de Windows y colócate en la carpeta donde metiste `bridge.py`, sus módulos Python, `.env` y la credencial autorizada.
4. Ejecuta esto:
   ```cmd
   python bridge.py
   ```
5. La consola mostrará:
   - `Inicializando Firebase...`
   - `Catálogo sincronizado: XXX canciones guardadas en 1 solo documento.`
   - `[SISTEMA]` mensajes de estado
   - `Conectado a Kodi.`
6. Verás iluminarse tu móvil al instante con todas las canciones de tu carpeta. Prueba a darle al botón Verde (Force Play) a cualquier canción nueva y maravíllate viendo a Kodi empezar a reproducirla a los 2 segundos.

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

Detén el puente y consulta al responsable del proyecto. No despliegues reglas ni ejecutes pruebas de reglas contra producción desde el PC del bar.

### Kodi no responde

- Asegúrate de que Kodi está abierto y en la pantalla principal (no en un menú).
- Verifica que en Ajustes > Servicios > Control está activado "Permitir control remoto por HTTP".
- Verifica que `KODI_PORT` en `.env` es `9090` (NO `8080` — el 8080 es el puerto web, el 9090 es el de WebSocket).
- El arranque del bridge no confirma reproducción: marca Kodi como probado solo tras observar una canción de prueba en el equipo del bar.

### Liquidación pendiente de revisión

Una liquidación ambigua se conserva en el outbox local y la canción queda excluida de la selección mientras necesite revisión. No borres ni edites el outbox a ciegas; consulta al responsable y revisa `bridge_errors.log` para el diagnóstico.

Un cambio en el perfil durante la liquidación puede activar esta revisión incluso cuando el voto no ha cambiado. No hay resolución automática. Si falta el marcador de jornada, el bridge conserva la cola y reanuda el cierre en la siguiente jornada. Detén cualquier bridge antiguo antes de iniciar el nuevo; el bloqueo de instancia solo protege las copias que comparten la carpeta del outbox.

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

Al completar la instalación, registra qué componentes arrancaron y qué comprobaciones hiciste en el propio bar. Este documento no demuestra que el puente esté instalado o validado allí.
