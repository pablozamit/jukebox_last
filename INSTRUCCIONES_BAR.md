# MANUAL DE INSTALACIÓN Y ARRANQUE EN EL BAR

Este documento es tu billete para que todo funcione sin sorpresas cuando llegues al local. Llévalo abierto en el móvil o sigue los pasos desde allí.

## 📦 1. QUÉ TIENES QUE LLEVAR EN EL PENDRIVE EXACTAMENTE

Para no depender de descargar cosas pesadas con el internet del bar, mete esto en tu USB desde casa y pásalo a una carpeta cualquiera en el escritorio del PC del bar (ej: `Carpeta Jukebox`):

1. **El archivo `bridge.py`**: Está dentro de la carpeta `python-bridge` de tu proyecto.
2. **Este propio documento (`INSTRUCCIONES_BAR.md`)**: Para poder abrirlo y leerlo allí.
3. **`serviceAccountKey.json`**: Tu clave secreta de administrador (ya está en la carpeta `python-bridge`).

**Nota:** Esos dos archivos (`bridge.py` y el `.json`) **deben estar juntos** en la misma carpeta cuando los pegues en el PC del bar. Y por supuesto, asegúrate de que el disco duro externo o la carpeta con todos los **archivos de vídeo de karaoke/música** esté conectada al PC.

---

## 📺 2. CONFIGURAR EL KODI EN EL BAR

Una vez en el PC del bar, abre Kodi:
1. Ve a **Ajustes (el engranaje) > Servicios > Control**.
2. **Activa** "Permitir control remoto por HTTP".
3. Marca el puerto **8080**.
4. Escribe el **Usuario** y la **Contraseña** que quieras ponerle por seguridad a la app web interna de Kodi (ejemplo: usuario `kodi`, contraseña `kodi`).
5. Cierra Kodi para que guarde cambios, y vuelve a abrirlo (déjalo abierto siempre de fondo).

---

## 🐍 3. INSTALACIÓN DE PYTHON

En el PC físico del bar (es necesario que esté conectado al WiFi/cable):
1. Asegúrate de tener **Python** instalado (márcalo para añadir al PATH durante su instalación si no lo tienes).
2. Abre la consola de Windows (Buscador > `cmd`).
3. Lanza este comando para instalar lo que necesita tu programa Jukebox:
   ```cmd
   pip install requests firebase-admin
   ```

---

## 🔌 4. EDITAR EL SCRIPT CON LA RUTA Y CLAVES LOCALES

Abre el archivo `bridge.py` con el Bloc de notas. 
Justo al principio del archivo hallarás las variables que tienes que rellenar con lo del bar:

```python
# =======================================================
# CONFIGURACIÓN FÁCIL (Cambia estos valores según tu PC)
# =======================================================
KODI_HOST = "127.0.0.1"
KODI_PORT = 8080
KODI_USER = "EscribeAquíElUsuarioQuePusisteEnKodi"  
KODI_PASS = "EscribeAquíLaContraseña"               
VIDEO_FOLDER_PATH = "D:/Pon/Aqui/La/Ruta/A/Tus/Videos"  # Pon / en vez de \
FIREBASE_CRED_PATH = "serviceAccountKey.json"    # Asegura que coincida el nombre
# =======================================================
```
**Guarda el archivo**.

---

## 🚀 5. EL MOMENTO DE LA VERDAD (ESTRENO)

1. Saca tu móvil escaneando el QR y entra como Admin en el enlace web real de tu Jukebox añadiendo `/admin` al final (por ejemplo: `https://jukebox-catrinero.vercel.app/admin`).
2. En el PC del bar (con Kodi minimizado por detrás), abre la consola de Windows y colócate en la carpeta donde metiste el `bridge.py` y la contraseña json.
3. Ejecuta esto:
   ```cmd
   python bridge.py
   ```
4. La consola dirá *"Puente Jukebox ACTIVADO"* y empezará a escanear tu disco duro en milisegundos.
5. Verás iluminarse tu móvil al instante con todas las canciones de tu carpeta. Prueba a darle al botón Verde (Force Play) a cualquier canción nueva y maravíllate viendo a Kodi empezar a reproducirla a los 2 segundos.

¡Y ya está! 🍷 Tírate una caña. Has creado el sistema y está funcionando local y remotamente de forma síncrona. Todo el bar puede entrar a tu Vercel y jugar con la máquina.
