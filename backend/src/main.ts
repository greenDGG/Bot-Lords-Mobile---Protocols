import 'reflect-metadata';
import { initLogger } from './logger';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './api/app.module';
import { AppGateway } from './api/app.gateway';
import { configService } from './config/config.service';
import { databaseService } from './database/database.service';
import { flushAllLogs } from './bot/core/account-manager';
import { startClockSync } from './utils/clock-sync';
import * as fs from 'fs';
import * as path from 'path';

// Iniciar logger ANTES de todo — captura console.log/error/warn a archivo
initLogger();

// Vaciar logs de bots persistentes al cerrar el proceso
process.on('exit', () => flushAllLogs());
process.on('SIGINT', () => { flushAllLogs(); process.exit(0); });
process.on('SIGTERM', () => { flushAllLogs(); process.exit(0); });

/** Upsert idempotente de los eventos iniciales (los del doc de investigación) */
async function seedEvents(): Promise<void> {
  const SEED_EVENTS = [
    { eventId: 'encargos-helados', name: 'Encargos helados', action: 'encargos-helados', claimProto: 11632, claimPayload: '0101', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
    { eventId: 'linternas', name: 'Expedición encantada (linternas)', action: 'linternas', claimProto: 11157, claimPayload: '7000b609e5050f00000100', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
    { eventId: 'monedas-castillo', name: 'Castillo emergente (monedas)', action: 'monedas-castillo', claimProto: 11157, claimPayload: '7500280a2f033200000100', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
    { eventId: 'arena-caos', name: 'Arena del caos', action: 'arena-caos', claimProto: 11692, claimPayload: '0101', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
    { eventId: 'evento-solitario', name: 'Evento solitario', action: 'evento-solitario', claimProto: 3609, claimPayload: '0006', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
    { eventId: 'evento-infierno', name: 'Evento infierno', action: 'evento-infierno', claimProto: 3609, claimPayload: '0106', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
    { eventId: 'desafio', name: 'Evento Desafío', action: 'desafio', claimProto: 3619, claimPayload: '040006', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
    { eventId: 'magmante', name: 'Desafío Magmante', action: 'magmante', claimProto: 7030, claimPayload: '01', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
    { eventId: 'laberinto', name: 'Laberinto 26', action: 'laberinto', claimProto: 7001, claimPayload: '', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
    { eventId: 'estrellas-sagradas', name: 'Estrellas sagradas', action: 'estrellas-sagradas', claimProto: 7003, claimPayload: '01', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
    { eventId: 'arena-dragon', name: 'Arena del dragón', action: 'arena-dragon', claimProto: 9308, claimPayload: '01', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
    { eventId: 'caja-misteriosa', name: 'Caja misteriosa', action: 'caja-misteriosa', claimProto: 1117, claimPayload: '', cooldownSeconds: 6 * 3600, startAt: 0, endAt: 0 },
    { eventId: 'bono-acceso', name: 'Bono de acceso diario', action: 'bono-acceso', claimProto: 3655, claimPayload: '00', cooldownSeconds: 24 * 3600, startAt: 0, endAt: 0 },
  ];
  for (const evt of SEED_EVENTS) {
    await databaseService.EventModel.updateOne(
      { eventId: evt.eventId },
      { $set: { ...evt, active: true } },
      { upsert: true }
    );
  }
  console.log(`[BotIgg] ${SEED_EVENTS.length} eventos sembrados`);
}

async function bootstrap() {
  // Conectar a MongoDB (reintentos con backoff en database.service)
  await databaseService.connect();
  console.log('[BotIgg] MongoDB conectado');

  // Sincronizar reloj con UTC (cada 5 minutos)
  startClockSync(300000);
  console.log('[BotIgg] Clock sync iniciado');

  // Sembrar eventos globales si la colección está vacía (upsert idempotente)
  try {
    const count = await databaseService.EventModel.countDocuments({});
    if (count === 0) await seedEvents();
  } catch (err) {
    console.warn('[BotIgg] Seed de eventos falló:', (err as Error).message);
  }

  const app = await NestFactory.create(AppModule);
  app.enableCors();

  // ── Log de peticiones HTTP entrantes (para diagnosticar conexiones) ──
  app.use((req: any, res: any, next: any) => {
    const ip = req.socket?.remoteAddress || req.headers?.['x-forwarded-for'] || '?';
    const ts = new Date().toISOString();
    res.on('finish', () => {
      console.log(`[HTTP] ${ts} ${req.method} ${req.originalUrl || req.url} -> ${res.statusCode} (${ip})`);
    });
    next();
  });

  // ── CRUD de eventos globales (para agregar eventos cuando sea, sin tocar código) ──
  const http = app.getHttpAdapter();
  http.get('/events', async (_req: any, res: any) => {
    try {
      const events = await databaseService.EventModel.find({}).sort({ eventId: 1 }).lean();
      res.json({ ok: true, events });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  http.post('/events', async (req: any, res: any) => {
    try {
      const { eventId, name, action, claimProto, claimPayload, cooldownSeconds, active, startAt, endAt } = req.body || {};
      if (!eventId) return res.status(400).json({ ok: false, error: 'eventId es requerido' });
      if (!action && !claimProto) return res.status(400).json({ ok: false, error: 'Se requiere una acción (action) o un claimProto de respaldo' });
      const s = Number(startAt) || 0;
      const e = Number(endAt) || 0;
      if (s && e && e <= s) return res.status(400).json({ ok: false, error: 'endAt debe ser mayor a startAt' });
      const doc = await databaseService.EventModel.updateOne(
        { eventId },
        {
          $set: {
            name: name || '',
            action: action || '',
            claimProto: claimProto || 0,
            claimPayload: claimPayload || '00',
            cooldownSeconds: cooldownSeconds || 3600,
            startAt: s,
            endAt: e,
            active: active !== false,
          },
        },
        { upsert: true }
      );
      res.json({ ok: true, upserted: doc.upsertedCount, modified: doc.modifiedCount });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  http.delete('/events/:eventId', async (req: any, res: any) => {
    try {
      await databaseService.EventModel.deleteOne({ eventId: req.params.eventId });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  const appHttp = app.getHttpServer();
  app.getHttpAdapter().get('/debug', (req: any, res: any) => {
    const accessExists = fs.existsSync(configService.accessDir);
    const accounts = accessExists ? fs.readdirSync(configService.accessDir) : [];
    res.json({
      accessDir: configService.accessDir,
      accessExists,
      accounts,
      cwd: process.cwd(),
    });
  });

  // ── FCM: registro de tokens para notificaciones push ──
  http.post('/fcm/token', async (req: any, res: any) => {
    try {
      const { token, label } = req.body || {};
      if (!token) return res.status(400).json({ ok: false, error: 'token requerido' });
      await databaseService.FCMTokenModel.updateOne(
        { token },
        { $set: { token, label: label || '' } },
        { upsert: true }
      );
      console.log(`[FCM] Token registrado: ${token.substring(0, 20)}...`);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  http.delete('/fcm/token', async (req: any, res: any) => {
    try {
      const { token } = req.body || {};
      if (!token) return res.status(400).json({ ok: false, error: 'token requerido' });
      await databaseService.FCMTokenModel.deleteOne({ token });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  http.get('/fcm/tokens', async (_req: any, res: any) => {
    try {
      const tokens = await databaseService.FCMTokenModel.find({}).sort({ createdAt: -1 }).lean();
      res.json({ ok: true, tokens });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Logs: listar cuentas ──
  const logsBase = process.env.LOG_DIR || path.join(path.dirname(process.cwd()), 'logs');
  console.log(`[LOGS] logDir resuelto: ${logsBase} (cwd=${process.cwd()})`);

  http.get('/logs/debug', async (_req: any, res: any) => {
    try {
      const exists = fs.existsSync(logsBase);
      let entries: string[] = [];
      if (exists) {
        entries = fs.readdirSync(logsBase, { withFileTypes: true }).map(e => `${e.name}${e.isDirectory() ? '/' : ''}`);
      }
      res.json({ logsBase, cwd: process.cwd(), exists, entries });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  http.get('/logs', async (_req: any, res: any) => {
    try {
      const logDir = logsBase;
      if (!fs.existsSync(logDir)) return res.json({ ok: true, accounts: [] });
      const entries = fs.readdirSync(logDir, { withFileTypes: true });
      const accounts = entries.filter(e => e.isDirectory()).map(e => {
        const iggId = e.name;
        const dir = path.join(logDir, iggId);
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.log')).sort().reverse();
        return { iggId, files };
      });
      res.json({ ok: true, accounts });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Logs: listar archivos de una cuenta ──
  http.get('/logs/:iggId', async (req: any, res: any) => {
    try {
      const iggId = req.params.iggId;
      const logDir = logsBase;
      const accountDir = path.join(logDir, iggId);
      if (!fs.existsSync(accountDir)) return res.json({ ok: true, files: [] });
      const files = fs.readdirSync(accountDir).filter(f => f.endsWith('.log')).sort();
      res.json({ ok: true, files });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Logs: leer archivo de una cuenta ──
  http.get('/logs/:iggId/:filename', async (req: any, res: any) => {
    try {
      const { iggId, filename } = req.params;
      const search = (req.query.search as string) || '';
      const tail = parseInt(req.query.tail as string) || 0;
      const logDir = logsBase;
      const filePath = path.join(logDir, iggId, filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ ok: false, error: 'Archivo no encontrado' });

      let content = fs.readFileSync(filePath, 'utf-8');
      let lines = content.split('\n').filter(l => l.trim());

      if (search) {
        const term = search.toLowerCase();
        lines = lines.filter(l => l.toLowerCase().includes(term));
      }

      if (tail > 0 && !search) {
        lines = lines.slice(-tail);
      }

      res.json({ ok: true, lines, total: lines.length });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  await app.listen(3100);
  console.log('[BotIgg] Backend corriendo en http://localhost:3100');
  console.log('[BotIgg] Debug: http://localhost:3100/debug');

  // ── Auto-arranque: iniciar cuentas con config.autoStart = true (sin bloquear el bootstrap) ──
  try {
    const gateway = app.get(AppGateway);
    void gateway.autoStartFromDB();
  } catch (err) {
    console.warn('[BotIgg] AutoStart no disponible:', (err as Error).message);
  }
}
bootstrap();
