/**
 * Hook para manejar notificaciones push.
 * Solicita permiso, obtiene token FCM, lo registra en el backend,
 * y muestra notificaciones cuando llegan en primer plano.
 */
import { useEffect, useRef } from 'react';
import { initFirebase, requestFCMToken, onForegroundMessage } from '../firebase-config';

const API_BASE = '/api';

export function useNotifications() {
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    registered.current = true;

    // Inizar Firebase
    initFirebase();

    // Obtener token y registrar en backend
    requestFCMToken().then(async (token) => {
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/fcm/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, label: navigator.userAgent }),
        });
        const data = await res.json();
        if (data.ok) {
          console.log('[FCM] Token registrado en backend');
        }
      } catch (err: any) {
        console.warn('[FCM] Error registrando token:', err?.message);
      }
    });

    // Escuchar notificaciones en primer plano
    onForegroundMessage((payload) => {
      console.log('[FCM] Notificación recibida:', payload);
      const { title, body } = payload.notification || {};
      if (title && body) {
        new Notification(title, { body, icon: '/favicon.ico' });
      }
    });
  }, []);
}
