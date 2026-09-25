import React, { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../hooks/useSocket';
import { colors } from './Theme';
import AccountCard from './AccountCard';
import WarDashboard from './WarDashboard';
import EventsManager from './EventsManager';
import { setItemsData } from '../data/items';
import GlobalConfigModal from './GlobalConfigModal';
import GlobalCommandsModal from './GlobalCommandsModal';
import ProxyAuthModal from './ProxyAuthModal';
import SupplyModal from './SupplyModal';

let ITEM_VALUES: Record<number, number> = {};
let RESOURCE_ITEM_IDS: Record<string, number[]> = {};


interface Account {
  iggId: string;
  token: any;
  config: any;
}

interface PlayerInfo {
  playerId: number;
  playerName: string;
  power: number;
  gems: number;
  kills: number;
}

interface Resources {
  wheat: number; stone: number; wood: number; mineral: number; gold: number;
  wheatProd: number; stoneProd: number; woodProd: number; mineralProd: number; goldProd: number;
}

export default function MainPage({ onSelectBot }: { onSelectBot: (id: number, name?: string) => void }) {
  const { socket, connected } = useSocket();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [logs, setLogs] = useState<{ iggId: number; msg: string }[]>([]);
  const [bots, setBots] = useState<Record<number, boolean>>({});
  const [startingBots, setStartingBots] = useState<Set<number>>(new Set());
  const [players, setPlayers] = useState<Record<number, PlayerInfo>>({});
  const [shields, setShields] = useState<Record<number, { remaining: number; name: string }>>({});
  const [resources, setResources] = useState<Record<number, Resources>>({});
  const [inventory, setInventory] = useState<Record<number, { itemId: number; amount: number }[]>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [launching, setLaunching] = useState<Set<number>>(new Set());
  const [showWarModal, setShowWarModal] = useState(false);
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showCommandsModal, setShowCommandsModal] = useState(false);
  const [showProxyAuthModal, setShowProxyAuthModal] = useState(false);
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureAlert, setCaptureAlert] = useState<{ show: boolean; msg: string; ok?: boolean } | null>(null);

  // Permanent socket listeners (registered once, survive reconnects)
  useEffect(() => {
    if (!socket) return;
    const onRunningBots = (data: any) => {
      if (data && typeof data === 'object' && 'running' in data) {
        setBots(data.running || {});
        setPlayers(data.players || {});
        setShields(data.shields || {});
        setResources(data.resources || {});
        setInventory(data.inventory || {});
      } else {
        setBots(data || {});
      }
    };
    const onLog = (data: { iggId: number; msg: string }) => {
      setLogs(prev => [...prev.slice(-199), data]);
    };
    const onStatusChanged = (data: { iggId: number; online: boolean }) => {
      setBots(prev => ({ ...prev, [data.iggId]: data.online }));
    };
    const onBotStarted = (data: { iggId: number }) => {
      setBots(prev => ({ ...prev, [data.iggId]: true }));
      setStartingBots(prev => { const next = new Set(prev); next.delete(data.iggId); return next; });
    };
    const onBotStopped = (data: { iggId: number }) => {
      setBots(prev => ({ ...prev, [data.iggId]: false }));
    };
    const onConnectionFailed = (data: { iggId: number; message?: string }) => {
      setBots(prev => ({ ...prev, [data.iggId]: false }));
      setLogs(prev => [...prev.slice(-199), { iggId: data.iggId, msg: `[-] Error de conexión: ${data.message || 'desconocido'}` }]);
    };
    const onPlayerInfo = (data: { iggId: number; info: PlayerInfo }) => {
      setPlayers(prev => ({ ...prev, [data.iggId]: data.info }));
    };
    const onShield = (data: { iggId: number; remaining: number; name: string }) => {
      setShields(prev => ({ ...prev, [data.iggId]: { remaining: data.remaining, name: data.name } }));
    };
    const onResources = (data: { iggId: number; resources: Resources }) => {
      setResources(prev => ({ ...prev, [data.iggId]: data.resources }));
    };
    const onInventory = (data: { iggId: number; inventory: { itemId: number; amount: number }[] }) => {
      setInventory(prev => ({ ...prev, [data.iggId]: data.inventory }));
    };

    socket.on('runningBots', onRunningBots);
    socket.on('log', onLog);
    socket.on('statusChanged', onStatusChanged);
    socket.on('botStarting', (data: { iggId: number }) => {
      setStartingBots(prev => new Set(prev).add(data.iggId));
    });
    socket.on('botStarted', onBotStarted);
    socket.on('botStopped', onBotStopped);
    socket.on('connectionFailed', (data: { iggId: number; message?: string }) => {
      setStartingBots(prev => { const next = new Set(prev); next.delete(data.iggId); return next; });
      setBots(prev => ({ ...prev, [data.iggId]: false }));
      setLogs(prev => [...prev.slice(-199), { iggId: data.iggId, msg: `[-] Error de conexión: ${data.message || 'desconocido'}` }]);
    });
    socket.on('playerInfo', onPlayerInfo);
    socket.on('shield', onShield);
    socket.on('resources', onResources);
    socket.on('inventory', onInventory);
    socket.on('captureError', (msg: string) => {
      setCapturing(false);
      setCaptureAlert({ show: true, msg: `❌ ${msg}`, ok: false });
      setTimeout(() => setCaptureAlert(null), 5000);
    });
    socket.on('accountCaptured', (data: { iggId: number }) => {
      setCapturing(false);
      socket.emit('listAccounts');
      socket.emit('getRunningBots');
      setCaptureAlert({ show: true, msg: `✅ Cuenta ${data.iggId} agregada correctamente`, ok: true });
      setTimeout(() => setCaptureAlert(null), 3000);
    });
    socket.on('globalCommandResult', (data: { sent: number; proto: number }) => {
      setLogs(prev => [...prev.slice(-199), { iggId: 0, msg: `[GLOBAL] Proto ${data.proto} enviado a ${data.sent} cuenta(s)` }]);
    });
    socket.on('items', (data: any) => {
      setItemsData(data);
      ITEM_VALUES = {};
      for (const [k, v] of Object.entries(data.ITEM_VALUES)) ITEM_VALUES[Number(k)] = v as number;
      RESOURCE_ITEM_IDS = {};
      for (const [k, v] of Object.entries(data.RESOURCE_ITEM_IDS)) RESOURCE_ITEM_IDS[k] = v as number[];
    });
    socket.emit('getItems');
  }, [socket]);

  // Decrement shield timers every second
  useEffect(() => {
    const interval = setInterval(() => {
      setShields(prev => {
        const next: Record<number, { remaining: number; name: string }> = {};
        let changed = false;
        for (const id in prev) {
          const s = prev[id];
          const rem = Math.max(0, s.remaining - 1000);
          next[id] = { remaining: rem, name: s.name };
          if (rem !== s.remaining) changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Poll capture status
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/capture/status');
        const data = await res.json();
        if (data.capturing !== capturing) setCapturing(data.capturing);
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [capturing]);

  // On connect, fetch accounts and running state (listeners already registered)
  useEffect(() => {
    if (!connected) return;
    socket.emit('listAccounts');
    socket.emit('getRunningBots');
    const onAccounts = (data: Account[]) => setAccounts(data);
    socket.on('accounts', onAccounts);
    return () => { socket.off('accounts', onAccounts); };
  }, [connected, socket]);

  const onSelect = useCallback((iggId: number, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(iggId); else next.delete(iggId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(prev => {
      if (prev.size === accounts.length) return new Set();
      return new Set(accounts.map(a => parseInt(a.iggId)));
    });
  }, [accounts]);

  const startBot = useCallback((iggId: number) => {
    socket.emit('startBot', { iggId });
  }, [socket]);

  const stopBot = useCallback((iggId: number) => {
    socket.emit('stopBot', { iggId });
  }, [socket]);

  const launchSelected = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setLaunching(new Set(ids));
    for (const iggId of ids) {
      await new Promise<void>((resolve) => {
        const onDone = (data: { iggId: number }) => {
          if (data.iggId === iggId) {
            socket.off('botStarted', onDone);
            socket.off('connectionFailed', onDone);
            resolve();
          }
        };
        socket.on('botStarted', onDone);
        socket.on('connectionFailed', onDone);
        socket.emit('startBot', { iggId });
      });
    }
    setLaunching(new Set());
  }, [selected, socket]);

  return (
    <>
      <div style={{ padding: '20px', maxWidth: 1400, margin: '0 auto', paddingBottom: selected.size > 0 ? 64 : 20 }}>
        <header style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 24, borderBottom: `1px solid ${colors.border}`, paddingBottom: 16,
        }}>
          <div>
            <h1 style={{ fontSize: 24, color: colors.primary }}>BotIgg</h1>
            <span style={{ color: colors.textSecondary, fontSize: 13 }}>
              Lords Mobile Bot · {connected ? '🟢 Conectado' : '🔴 Desconectado'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={selectAll}>
              {selected.size === accounts.length ? '☐ Deseleccionar Todos' : '☑ Seleccionar Todos'}
            </button>
            <button className="primary"
              onClick={launchSelected}
              disabled={selected.size === 0 || launching.size > 0}>
              {launching.size > 0 ? `⏳ Iniciando (${launching.size})...` : `▶ Iniciar Seleccionados (${selected.size})`}
            </button>
            <button className="danger" onClick={() => Object.keys(bots).forEach(id => stopBot(parseInt(id)))}>
              ⏹ Detener Todos
            </button>
            <button className="primary" onClick={() => { if (selected.size > 0) { setShowWarModal(true); Array.from(selected).forEach(id => { socket.emit('requestWarData', { iggId: id }); socket.emit('setWarViewing', { iggId: id, viewing: true }); }) } }}>
              ⚔️ Agrupaciones ({selected.size})
            </button>
            <button className="primary" onClick={() => setShowEventsModal(true)}>
              🎯 Eventos
            </button>
            <button className="primary" onClick={() => setShowProxyAuthModal(true)}>
              🔐 Proxy Auth
            </button>
            <button className="primary" onClick={() => { if (selected.size > 0) setShowConfigModal(true); }}>
              ⚙️ Config Global ({selected.size})
            </button>
            <button className={capturing ? 'danger' : 'primary'} onClick={async () => {
              if (capturing) {
                await fetch('/api/capture/stop', { method: 'POST' });
                setCapturing(false);
              } else {
                const res = await fetch('/api/capture/start', { method: 'POST' });
                const data = await res.json();
                if (data.error) { alert(data.error); return; }
                setCapturing(true);
              }
            }}>
              {capturing ? '■ Detener captura' : '➕ Agregar cuenta'}
            </button>
          </div>
        </header>

        <div style={{
          display: 'flex', gap: 8, marginBottom: 16, padding: 8,
          background: colors.surface, borderRadius: 6, border: `1px solid ${colors.border}`,
          fontSize: 13,
        }}>
          <span style={{ color: colors.textSecondary, whiteSpace: 'nowrap', lineHeight: '28px' }}>🌐 CMD Global:</span>
          <input
            placeholder="Proto"
            id="globalProto"
            style={{ width: 80, background: '#000', color: '#fff', border: `1px solid ${colors.border}`, borderRadius: 4, padding: '4px 8px' }}
          />
          <input
            placeholder="Body en hex (ej: 030100fb03)"
            id="globalBody"
            style={{ flex: 1, background: '#000', color: '#fff', border: `1px solid ${colors.border}`, borderRadius: 4, padding: '4px 8px' }}
          />
          <button onClick={() => {
            const proto = parseInt((document.getElementById('globalProto') as HTMLInputElement)?.value);
            const body = (document.getElementById('globalBody') as HTMLInputElement)?.value;
            if (!proto || !body) return;
            socket.emit('globalCommand', { proto, body });
          }}>Enviar</button>
          <button className="primary" onClick={() => setShowCommandsModal(true)}>⚡ Comandos</button>
          <button className="primary" onClick={() => { if (selected.size > 0) setShowSupplyModal(true); }} disabled={selected.size === 0} style={{ opacity: selected.size === 0 ? 0.5 : 1 }}>🚛 Supply</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {accounts.map(acc => (
            <AccountCard
              key={acc.iggId}
              iggId={parseInt(acc.iggId)}
              isRunning={!!bots[parseInt(acc.iggId)]}
              isStarting={startingBots.has(parseInt(acc.iggId))}
              playerInfo={players[parseInt(acc.iggId)]}
              shield={shields[parseInt(acc.iggId)]}
              selected={selected.has(parseInt(acc.iggId))}
              onSelect={onSelect}
              onStart={() => startBot(parseInt(acc.iggId))}
              onStop={() => stopBot(parseInt(acc.iggId))}
               onOpen={() => onSelectBot(parseInt(acc.iggId), players[parseInt(acc.iggId)]?.playerName)}
            />
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <ResourceSummary selected={selected} resources={resources} players={players} inventory={inventory} />
      )}

      {showConfigModal && selected.size > 0 && (
        <GlobalConfigModal
          socket={socket}
          ids={Array.from(selected)}
          onClose={() => setShowConfigModal(false)}
        />
      )}

      {showCommandsModal && (
        <GlobalCommandsModal socket={socket} onClose={() => setShowCommandsModal(false)} />
      )}
      {showProxyAuthModal && (
        <ProxyAuthModal socket={socket} onClose={() => setShowProxyAuthModal(false)} />
      )}

      {showSupplyModal && (
        <SupplyModal
          socket={socket}
          iggIds={Array.from(selected)}
          players={players}
          resources={resources}
          onClose={() => setShowSupplyModal(false)}
        />
      )}

      {captureAlert?.show && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 2000,
          background: captureAlert.ok ? '#1b5e20' : '#b71c1c',
          color: '#fff', padding: '16px 24px', borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          fontSize: 14, fontWeight: 500,
          pointerEvents: 'none',
        }}>
          {captureAlert.msg}
        </div>
      )}

      {capturing && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', zIndex: 1001,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: 8, padding: 32, maxWidth: 440, width: '90%',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📡</div>
            <h3 style={{ margin: '0 0 8px', color: colors.text }}>Capturando cuenta...</h3>
            <p style={{ margin: '0 0 20px', color: colors.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
              Se abrió una ventana de <strong>mitmproxy</strong>.<br />
              Iniciá sesión en el juego a través del proxy.<br />
              Cuando se detecte el token, la ventana se cerrará automáticamente.
            </p>
            <button className="danger" onClick={async () => {
              await fetch('/api/capture/stop', { method: 'POST' });
              setCapturing(false);
            }}>
              ■ Cancelar captura
            </button>
          </div>
        </div>
      )}

      {showWarModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', zIndex: 1001,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => { Array.from(selected).forEach(id => socket.emit('setWarViewing', { iggId: id, viewing: false })); setShowWarModal(false); }}>
          <div style={{
            background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: 8, padding: 24, maxWidth: 800, width: '90%', maxHeight: '80vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>⚔️ Agrupaciones Global</h3>
              <button onClick={() => { Array.from(selected).forEach(id => socket.emit('setWarViewing', { iggId: id, viewing: false })); setShowWarModal(false); }}>Cerrar</button>
            </div>
            <WarDashboard socket={socket} bots={Array.from(selected)} />
          </div>
        </div>
      )}

      {showEventsModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', zIndex: 1001,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowEventsModal(false)}>
          <div style={{
            background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: 8, padding: 24, maxWidth: 860, width: '92%', maxHeight: '82vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>🎯 Eventos Globales</h3>
              <button onClick={() => setShowEventsModal(false)}>Cerrar</button>
            </div>
            <EventsManager onClose={() => setShowEventsModal(false)} />
          </div>
        </div>
      )}
    </>
  );
}

const formatRes = (v: number) => {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toString();
};

// (imported from data/items.json via module-level constants)

function ResourceSummary({ selected, resources, players, inventory }: {
  selected: Set<number>;
  resources: Record<number, Resources>;
  players: Record<number, PlayerInfo>;
  inventory: Record<number, { itemId: number; amount: number }[]>;
}) {
  const ids = Array.from(selected).filter(id => resources[id]);

  const sum = (key: keyof Resources) => ids.reduce((acc, id) => acc + (resources[id]?.[key] || 0), 0);

  const bagTotal = (resKey: string) => {
    const itemIds = RESOURCE_ITEM_IDS[resKey] || [];
    let total = 0;
    for (const id of ids) {
      const inv = inventory[id] || [];
      for (const item of inv) {
        const value = ITEM_VALUES[item.itemId];
        if (value && itemIds.includes(item.itemId)) {
          total += item.amount * value;
        }
      }
    }
    return total;
  };

  const rows = [
    { name: '🌾 Trigo', key: 'wheat' as const, prodKey: 'wheatProd' as const },
    { name: '🪵 Madera', key: 'wood' as const, prodKey: 'woodProd' as const },
    { name: '🪨 Piedra', key: 'stone' as const, prodKey: 'stoneProd' as const },
    { name: '⛏ Mineral', key: 'mineral' as const, prodKey: 'mineralProd' as const },
    { name: '🪙 Oro', key: 'gold' as const, prodKey: 'goldProd' as const },
  ];

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: colors.surface, borderTop: `2px solid ${colors.primary}`,
      padding: '12px 24px', zIndex: 1000,
      display: 'flex', alignItems: 'center', gap: 24, fontSize: 13,
    }}>
      <span style={{ fontWeight: 600, color: colors.primary, whiteSpace: 'nowrap' }}>
        📦 {ids.length} cuenta{ids.length !== 1 ? 's' : ''}
      </span>
      {rows.map(r => {
        const total = sum(r.key);
        const prod = sum(r.prodKey);
        const bag = bagTotal(r.key);
        return (
          <span key={r.key} style={{ whiteSpace: 'nowrap' }}>
            {r.name.split(' ')[1]} <strong>{formatRes(total)}</strong>
            <span style={{ color: colors.textSecondary, marginLeft: 4 }}>
              (+{formatRes(Math.max(0, prod))}/h)
            </span>
            {bag > 0 && <span style={{ color: colors.warning, marginLeft: 4 }}>+{formatRes(bag)}bolsa</span>}
          </span>
        );
      })}
      <span style={{ flex: 1 }} />
    </div>
  );
}
