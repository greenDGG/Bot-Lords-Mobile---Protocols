/**
 * Servicio de notificaciones push via Firebase Cloud Messaging.
 *
 * Requiere:
 *   - Variable de entorno FIREBASE_SERVICE_ACCOUNT con el JSON de la service account
 *   - El JSON puede ser una ruta a archivo o el JSON inline
 *
 * La inicialización es lazy: solo se init Firebase cuando se necesita enviar.
 */
import * as fs from 'fs';
import * as path from 'path';
import { databaseService } from '../../database/database.service';

let firebaseApp: any = null;
let messaging: any = null;

function initFirebase(): void {
  if (firebaseApp) return;

  try {
    const admin = require('firebase-admin');
    const { getMessaging } = require('firebase-admin/messaging');

    if (admin.getApps().length > 0) {
      firebaseApp = admin.getApp();
      messaging = getMessaging();
      return;
    }

    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
    if (!serviceAccountRaw) {
      console.warn('[FCM] FIREBASE_SERVICE_ACCOUNT no configurada — notificaciones deshabilitadas');
      return;
    }

    let serviceAccount: any;
    if (serviceAccountRaw.startsWith('{')) {
      serviceAccount = JSON.parse(serviceAccountRaw);
    } else {
      const resolved = path.resolve(serviceAccountRaw);
      if (!fs.existsSync(resolved)) {
        console.warn(`[FCM] Archivo no encontrado: ${resolved} — notificaciones deshabilitadas`);
        return;
      }
      serviceAccount = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    }

    firebaseApp = admin.initializeApp({
      credential: admin.cert(serviceAccount),
    });
    messaging = getMessaging();
    console.log('[FCM] Firebase Admin inicializado correctamente');
  } catch (err: any) {
    console.error('[FCM] Error inicializando Firebase:', err?.message);
    firebaseApp = null;
    messaging = null;
  }
}

/** Enviar notificación push a todos los tokens registrados */
export async function sendPushNotification(title: string, body: string, data?: Record<string, string>): Promise<void> {
  initFirebase();
  if (!messaging) return;

  try {
    const tokens = await databaseService.FCMTokenModel.find({}).lean();
    if (tokens.length === 0) {
      console.log('[FCM] No hay tokens registrados, saltando notificación');
      return;
    }

    const tokenList = tokens.map((t: any) => t.token);

    const message = {
      notification: { title, body },
      data: data || {},
      tokens: tokenList,
    };

    const response = await messaging.sendEachForMulticast(message);

    // Limpiar tokens inválidos
    if (response.failureCount > 0) {
      const invalidTokens: string[] = [];
      response.responses.forEach((resp: any, idx: number) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered') {
            invalidTokens.push(tokenList[idx]);
          }
        }
      });
      if (invalidTokens.length > 0) {
        await databaseService.FCMTokenModel.deleteMany({ token: { $in: invalidTokens } });
        console.log(`[FCM] ${invalidTokens.length} tokens inválidos eliminados`);
      }
    }

    console.log(`[FCM] Notificación enviada: ${response.successCount}/${tokenList.length} éxitos`);
  } catch (err: any) {
    console.error('[FCM] Error enviando notificación:', err?.message);
  }
}

/** Notificar fallo de conexión de un bot */
export async function notifyBotConnectionFailed(iggId: number, reason: string): Promise<void> {
  await sendPushNotification(
    `Bot ${iggId} — Conexión fallida`,
    reason,
    { iggId: String(iggId), type: 'connectionFailed' }
  );
}
