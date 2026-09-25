/**
 * Configuración de Firebase para el frontend.
 *
 * TODO: Reemplaza los valores de placeholder con tu configuración de Firebase Console:
 *   1. Ve a Firebase Console → Proyecto → Configuración (icono engranaje)
 *   2. "Tus apps" → Web app → Copia el objeto de configuración
 *   3. Reemplaza el contenido de firebaseConfig abajo
 */
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: 'TU_API_KEY',
  authDomain: 'TU_PROJECT.firebaseapp.com',
  projectId: 'TU_PROJECT_ID',
  storageBucket: 'TU_PROJECT.appspot.com',
  messagingSenderId: 'TU_SENDER_ID',
  appId: 'TU_APP_ID',
};

let app: ReturnType<typeof initializeApp> | null = null;
let messaging: ReturnType<typeof getMessaging> | null = null;

export function initFirebase(): void {
  try {
    app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
    console.log('[FCM] Firebase inicializado');
  } catch (err: any) {
    console.warn('[FCM] Error inicializando Firebase:', err?.message);
  }
}

/** Solicitar permiso y obtener token FCM */
export async function requestFCMToken(): Promise<string | null> {
  if (!messaging) {
    console.warn('[FCM] Messaging no inicializado');
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[FCM] Permiso de notificaciones denegado');
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey: 'TU_VAPID_KEY', // Firebase Console → Cloud Messaging → Web push certificates
    });

    if (token) {
      console.log('[FCM] Token obtenido:', token.substring(0, 20) + '...');
      return token;
    }
    return null;
  } catch (err: any) {
    console.warn('[FCM] Error obteniendo token:', err?.message);
    return null;
  }
}

/** Escuchar notificaciones cuando la app está en primer plano */
export function onForegroundMessage(callback: (payload: any) => void): void {
  if (!messaging) return;
  onMessage(messaging, callback);
}
