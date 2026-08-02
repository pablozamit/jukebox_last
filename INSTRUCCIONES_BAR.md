# MANUAL DE INSTALACIÓN Y ARRANQUE EN EL BAR

Este documento es tu billete para que todo funcione sin sorpresas cuando llegues al local. Llévalo abierto en el móvil o sigue los pasos desde allí.

## 📦 1. QUÉ TIENES QUE LLEVAR EN EL PENDRIVE EXACTAMENTE

Para no depender de descargar cosas pesadas con el internet del bar, mete esto en tu USB desde casa y pásalo a una carpeta cualquiera en el escritorio del PC del bar (ej: `Carpeta Jukebox`):

1. **El archivo `bridge.py`**: Está dentro de la carpeta `python-bridge` de tu proyecto.
2. **El archivo `set_admin.py`**: También en `python-bridge`. Lo necesitarás para dar permisos de admin (solo una vez).
3. **Este propio documento (`INSTRUCCIONES_BAR.md`)**: Para poder abrirlo y leerlo allí.
4. **`serviceAccountKey.json`**: Tu clave secreta de administrador (ya está en la carpeta `python-bridge`).
5. **El archivo `.env`**: Tu configuración del puente (cópialo de `.env.example` y rellena los valores del bar).
6. *(Opcional pero recomendado)* **El instalador de Python**: Descárgalo desde python.org en casa y mételo al pendrive por si el PC del bar no lo tuviera instalado.
7. *(Opcional)* **El instalador de Kodi**: Por si tuvieras que instalarlo de cero.

**Nota:** Los archivos `bridge.py`, `set_admin.py`, el `.env` y el `.json` **deben estar juntos** en la misma carpeta cuando los pegues en el PC del bar. Y por supuesto, asegúrate de que el disco duro externo o la carpeta con todos los **archivos de vídeo de karaoke/música** esté conectada al PC.

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

### Desplegar las reglas de seguridad

1. En Firebase Console, ve a **Firestore Database > Rules**.
2. Copia el contenido de `security-rules.txt` de tu proyecto.
3. Pégalo en el editor y haz clic en **Publish**.

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

1. Saca tu móvil y entra como Admin en el enlace web real de tu Jukebox añadiendo `/admin` al final (por ejemplo: `https://jukebox-last.vercel.app/admin`).
2. **Inicia sesión** con el email y contraseña que creaste en el paso 2 (ej: `admin@lacatrina.com`).
3. En el PC del bar (con Kodi minimizado por detrás), abre la consola de Windows y colócate en la carpeta donde metiste el `bridge.py`, el `.env` y la contraseña json.
4. Ejecuta esto:
   ```cmd
   python bridge.py
   ```
5. La consola dirá *"Puente Jukebox ACTIVADO"* y empezará a escanear tu disco duro en milisegundos.
6. Verás iluminarse tu móvil al instante con todas las canciones de tu carpeta. Prueba a darle al botón Verde (Force Play) a cualquier canción nueva y maravíllate viendo a Kodi empezar a reproducirla a los 2 segundos.

¡Y ya está! 🍷 Tírate una caña. Has creado el sistema y está funcionando local y remotamente de forma síncrona. Todo el bar puede entrar a tu Vercel y jugar con la máquina.

