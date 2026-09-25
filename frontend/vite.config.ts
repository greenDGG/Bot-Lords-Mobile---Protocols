import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import type { Connect } from 'vite';

let mitmProcess: ChildProcess | null = null;
let captureWatcher: fs.FSWatcher | null = null;
let capturing = false;
const url = "http://localhost:3100"//"http://192.168.18.31:3100";
function startCapture(backendUrl: string) {
  if (capturing) return { error: 'Ya hay una captura en curso' };

  const scriptPath = path.join(process.cwd(), 'capture_account.py');
  if (!fs.existsSync(scriptPath)) return { error: 'capture_account.py no encontrado' };

  try {
    // abrimos mitmproxy en su propia ventana de consola (necesita TTY)
    // argumentos separados para evitar problemas de quoting con cmd.exe /c start
    mitmProcess = spawn('cmd.exe', ['/c', 'start', '', '/wait', 'mitmproxy', '--mode', 'local', '-s', scriptPath], {
      stdio: 'ignore',
      windowsHide: false,
    });

    mitmProcess.on('exit', () => {
      capturing = false;
      mitmProcess = null;
    });

    capturing = true;

    const watchDir = process.cwd();
    captureWatcher = fs.watch(watchDir, (eventType, filename) => {
      // Windows puede emitir 'change' o 'rename' al crear archivos
      if (!filename || !filename.startsWith('capture_') || !filename.endsWith('.json')) return;
      console.log(`[CAPTURE WATCH] Detectado: ${filename} (event=${eventType})`);
      const filePath = path.join(watchDir, filename);
      const tryImport = (attempt: number) => {
        if (attempt > 10) return;
        try {
          const stat = fs.statSync(filePath);
          if (stat.size === 0) { setTimeout(() => tryImport(attempt + 1), 300); return; }
          const content = fs.readFileSync(filePath, 'utf-8');
          JSON.parse(content);
          importCapture(content, filePath, backendUrl);
        } catch {
          setTimeout(() => tryImport(attempt + 1), 300);
        }
      };
      setTimeout(() => tryImport(0), 300);
    });

    return { ok: true };
  } catch (err: any) {
    capturing = false;
    return { error: `Error iniciando mitmproxy: ${err.message}` };
  }
}

function stopCapture() {
  if (captureWatcher) { captureWatcher.close(); captureWatcher = null; }
  if (mitmProcess) {
    try { mitmProcess.kill(); } catch {}
    mitmProcess = null;
  }
  // matar todos los mitmproxy (por si la ventana quedo huerfana)
  try { spawn('taskkill', ['/F', '/IM', 'mitmproxy.exe'], { stdio: 'ignore' }); } catch {}
  capturing = false;
}

async function importCapture(json: string, filePath: string, backendUrl: string) {
  try {
    const { io } = await import('socket.io-client');
    console.log(`[CAPTURE SOCKET] Conectando a ${backendUrl}...`);
    const socket = io(backendUrl);
    socket.on('connect', () => {
      console.log(`[CAPTURE SOCKET] Conectado, enviando importCapture...`);
      socket.emit('importCapture', { json });
      socket.on('accountCaptured', (data) => {
        console.log(`[CAPTURE SOCKET] accountCaptured recibido:`, data);
        socket.close();
        try { fs.unlinkSync(filePath); } catch {}
      });
      socket.on('captureError', (msg) => {
        console.error(`[CAPTURE SOCKET] Error:`, msg);
        socket.close();
      });
      setTimeout(() => {
        console.log(`[CAPTURE SOCKET] Timeout`);
        socket.close();
      }, 10000);
    });
    socket.on('connect_error', (err) => {
      console.error(`[CAPTURE SOCKET] Error de conexión:`, err.message);
    });
  } catch (err) {
    console.error('Error enviando captura al backend:', err);
  }
}

export default defineConfig({
  plugins: [react(), {
    name: 'capture-server',
    configureServer(server) {
      const backendUrl = url;

      server.middlewares.use('/api/capture/start', async (req: Connect.IncomingMessage, res: any, next: Connect.NextFunction) => {
        if (req.method !== 'POST') return next();
        const result = startCapture(backendUrl);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
      });

      server.middlewares.use('/api/capture/stop', async (req: Connect.IncomingMessage, res: any, next: Connect.NextFunction) => {
        if (req.method !== 'POST') return next();
        stopCapture();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      });

      server.middlewares.use('/api/capture/status', async (req: Connect.IncomingMessage, res: any, next: Connect.NextFunction) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ capturing }));
      });
    },
  }],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: url,
        ws: true,
      },
      '/events': {
        target: url,
      },
      '/fcm': {
        target: url,
      },
      '/api': {
        target: url,
      },
      '/logs': {
        target: url,
      },
    },
  },
});
