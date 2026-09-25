/**
 * Logger persistente: tee de console.log/error/warn a archivo + terminal.
 * Importar lo antes posible en main.ts para capturar todo.
 */
import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = process.env.LOG_DIR || path.resolve(__dirname, '../../../logs');
const APP_LOG = path.join(LOG_DIR, 'app.log');

let stream: fs.WriteStream | null = null;

function ensureStream(): fs.WriteStream {
  if (stream) return stream;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {}
  stream = fs.createWriteStream(APP_LOG, { flags: 'a' });
  return stream;
}

function writeToFile(prefix: string, args: any[]): void {
  try {
    const s = ensureStream();
    const ts = new Date().toISOString();
    const msg = args
      .map(a => (typeof a === 'string' ? a : JSON.stringify(a, null, 2)))
      .join(' ');
    s.write(`[${ts}] ${prefix} ${msg}\n`);
  } catch {}
}

function patchConsole(): void {
  const origLog = console.log.bind(console);
  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.log = (...args: any[]) => {
    origLog(...args);
    writeToFile('[LOG]', args);
  };

  console.error = (...args: any[]) => {
    origError(...args);
    writeToFile('[ERR]', args);
  };

  console.warn = (...args: any[]) => {
    origWarn(...args);
    writeToFile('[WRN]', args);
  };
}

function flushSync(): void {
  if (stream) {
    try {
      // Forzar flush del buffer del stream
      const fd = fs.openSync(APP_LOG, 'a');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
    } catch {}
  }
}

/** Inicializar logger — llamar al inicio de main.ts */
export function initLogger(): void {
  patchConsole();

  process.on('exit', () => flushSync());
  process.on('SIGINT', () => { flushSync(); process.exit(0); });
  process.on('SIGTERM', () => { flushSync(); process.exit(0); });
  process.on('uncaughtException', (err) => {
    writeToFile('[CRASH]', [err?.message, err?.stack]);
    flushSync();
  });
}
