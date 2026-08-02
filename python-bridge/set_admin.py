"""
Script para añadir un usuario como administrador en la colección 'admins' de Firestore.

Uso:
    python set_admin.py <email_del_admin>

Ejemplo:
    python set_admin.py admin@lacatrina.com

Requisitos:
    - serviceAccountKey.json en la misma carpeta
    - firebase-admin instalado (pip install firebase-admin)
    - El usuario debe existir previamente en Firebase Auth
      (creado desde la consola de Firebase: Authentication > Users > Add user)
"""

import sys
import firebase_admin
from firebase_admin import credentials, auth, firestore

FIREBASE_CRED_PATH = "./serviceAccountKey.json"


def set_admin(email):
    """Añade el UID del usuario a la colección 'admins' de Firestore."""
    cred = credentials.Certificate(FIREBASE_CRED_PATH)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)

    try:
        user = auth.get_user_by_email(email)
        db = firestore.client()

        # Añadir el UID del usuario como documento en la colección 'admins'
        db.collection('admins').document(user.uid).set({
            'email': email,
            'createdAt': firestore.SERVER_TIMESTAMP
        })

        print(f"✅ Usuario {email} añadido como administrador.")
        print(f"   UID: {user.uid}")
        print(f"   Documento creado en: admins/{user.uid}")
        print()
        print("NOTA: El usuario ya puede iniciar sesión en /admin con su email y contraseña.")
    except firebase_admin.auth.UserNotFoundError:
        print(f"❌ No se encontro ningun usuario con el email: {email}")
        print("   Crea el usuario primero en Firebase Console > Authentication > Users.")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python set_admin.py <email_del_admin>")
        print("Ejemplo: python set_admin.py admin@lacatrina.com")
        sys.exit(1)
    set_admin(sys.argv[1])
