import React, { useState, useEffect } from 'react';
import { colors } from './Theme';

interface SupplyResult {
  iggId: number;
  ok: boolean;
  message: string;
}

interface Props {
  socket: any;
  iggIds: number[];
  players: Record<number, { playerName: string; power: number }>;
  resources: Record<number, { wheat: number; stone: number; wood: number; mineral: number; gold: number }>;
  inventory: Record<number, { itemId: number; amount: number }[]>;
  items: { values: Record<number, number>; ids: Record<string, number[]> };
  onClose: () => void;
}

const RES_ROWS = [
  { key: 'trigo', field: 'wheat', icon: '🌾', label: 'Trigo' },
  { key: 'piedra', field: 'stone', icon: '🪨', label: 'Piedra' },
  { key: 'madera', field: 'wood', icon: '🪵', label: 'Madera' },
  { key: 'mineral', field: 'mineral', icon: '⛏', label: 'Mineral' },
  { key: 'oro', field: 'gold', icon: '💰', label: 'Oro' },
] as const;

type ResKey = (typeof RES_ROWS)[number]['key'];

const formatRes = (v: number) => {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toString();
};

/** '' → null (no enviar); '500m'/'1.5b'/'12345' → número; basura → NaN */
function parseAmount(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)\s*([kmb])?$/i.exec(s);
  if (!m) return NaN;
  const suffix = (m[2] || '').toLowerCase();
  const mult = suffix === 'k' ? 1e3 : suffix === 'm' ? 1e6 : suffix === 'b' ? 1e9 : 1;
  return Math.floor(Number(m[1]) * mult);
}

export default function SupplyModal({ socket, iggIds, players, resources, inventory, items, onClose }: Props) {
  const [targetPlayer, setTargetPlayer] = useState('');
  const [amounts, setAmounts] = useState<Record<ResKey, string>>({ trigo: '', piedra: '', madera: '', mineral: '', oro: '' });
  const [useBag, setUseBag] = useState(false);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SupplyResult[]>([]);
  const [started, setStarted] = useState<Set<number>>(new Set());
  const [stopping, setStopping] = useState<Set<number>>(new Set());
  const [batchResult, setBatchResult] = useState<{ total: number; sent: number; failed: number; targetPlayer: string; shortfall?: Record<string, number> } | null>(null);

  useEffect(() => {
    if (!socket) return;
    const onSupplyResult = (data: SupplyResult) => {
      setResults(prev => [...prev, data]);
      setStopping(prev => { const n = new Set(prev); n.delete(data.iggId); return n; });
    };
    const onSupplyStarted = (data: { iggId: number }) => {
      setStarted(prev => new Set(prev).add(data.iggId));
    };
    const onSupplyStopped = (data: { iggId: number; stopped: boolean }) => {
      if (!data.stopped) setStopping(prev => { const n = new Set(prev); n.delete(data.iggId); return n; });
    };
    const onSupplyBatch = (data: { total: number; sent: number; failed: number; targetPlayer: string; shortfall?: Record<string, number> }) => {
      setSending(false);
      setBatchResult(data);
    };
    socket.on('supplyResult', onSupplyResult);
    socket.on('supplyStarted', onSupplyStarted);
    socket.on('supplyStopped', onSupplyStopped);
    socket.on('supplyBatchResult', onSupplyBatch);
    return () => {
      socket.off('supplyResult', onSupplyResult);
      socket.off('supplyStarted', onSupplyStarted);
      socket.off('supplyStopped', onSupplyStopped);
      socket.off('supplyBatchResult', onSupplyBatch);
    };
  }, [socket]);

  const storeSum = (field: string) =>
    iggIds.reduce((acc, id) => acc + ((resources[id] as any)?.[field] || 0), 0);

  const bagSum = (resKey: string) => {
    const itemIds = items.ids[resKey] || [];
    if (itemIds.length === 0) return 0;
    let total = 0;
    for (const id of iggIds) {
      for (const item of inventory[id] || []) {
        const value = items.values[item.itemId];
        if (value && itemIds.includes(item.itemId)) total += item.amount * value;
      }
    }
    return total;
  };

  const available = (row: (typeof RES_ROWS)[number]) => {
    const store = storeSum(row.field);
    return useBag ? store + bagSum(row.key) : store;
  };

  const setAmount = (key: ResKey, v: string) => setAmounts(prev => ({ ...prev, [key]: v }));

  const setAll = (key: ResKey) => {
    const row = RES_ROWS.find(r => r.key === key)!;
    setAmount(key, String(available(row)));
  };

  const parsed: Partial<Record<ResKey, number | null>> = {};
  let invalid = false;
  for (const row of RES_ROWS) {
    const v = parseAmount(amounts[row.key]);
    parsed[row.key] = v;
    if (v !== null && Number.isNaN(v)) invalid = true;
  }
  const anyAmount = RES_ROWS.some(row => (parsed[row.key] ?? 0) > 0);

  const send = () => {
    if (!targetPlayer.trim() || sending || invalid || !anyAmount) return;
    setSending(true);
    setResults([]);
    setStarted(new Set());
    setStopping(new Set());
    setBatchResult(null);
    const sendAmounts: Record<string, number> = {};
    for (const row of RES_ROWS) {
      const v = parsed[row.key];
      if (typeof v === 'number' && !Number.isNaN(v) && v > 0) sendAmounts[row.key] = v;
    }
    socket.emit('sendManualSupply', {
      iggIds,
      targetPlayer: targetPlayer.trim(),
      amounts: sendAmounts,
      useBag,
    });
  };

  const stopOne = (id: number) => {
    if (!socket || stopping.has(id)) return;
    setStopping(prev => new Set(prev).add(id));
    socket.emit('stopManualSupply', { iggId: id });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1001, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3vh 16px', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 20, maxWidth: 640, width: '100%' }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>🚛 Supply Global</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: colors.textSecondary, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>
          Enviar un TOTAL por recurso desde {iggIds.length} bot(s): se reparte en partes iguales y lo que una cuenta no pueda dar se reasigna a las demás.
        </div>

        {/* Bots seleccionados */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Bots ({iggIds.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 110, overflowY: 'auto' }}>
            {iggIds.map(id => {
              const p = players[id];
              const r = resources[id];
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0d1117', border: `1px solid ${colors.border}`, borderRadius: 5, padding: '5px 10px', fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>IGG {id}</span>
                  <span style={{ color: colors.textSecondary }}>{p?.playerName || '...'}</span>
                  {r && <span style={{ color: colors.textSecondary, marginLeft: 'auto' }}>
                    🌾{formatRes(r.wheat)} 🪨{formatRes(r.stone)} 🪵{formatRes(r.wood)} ⛏{formatRes(r.mineral)} 💰{formatRes(r.gold)}
                  </span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Target player */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Jugador objetivo</div>
          <input
            type="text"
            value={targetPlayer}
            onChange={e => setTargetPlayer(e.target.value)}
            placeholder="Nombre del jugador"
            style={{ width: '100%', padding: '8px 10px', background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>

        {/* Montos por recurso */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Montos totales (vacío = no enviar · sufijos K/M/B)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {RES_ROWS.map(row => {
              const raw = parsed[row.key];
              const bad = raw !== null && Number.isNaN(raw);
              const want = bad ? 0 : (raw || 0);
              const avail = available(row);
              const over = want > avail;
              const bag = useBag ? bagSum(row.key) : 0;
              return (
                <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 92, fontSize: 13 }}>{row.icon} {row.label}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amounts[row.key]}
                    onChange={e => setAmount(row.key, e.target.value)}
                    placeholder="0"
                    style={{
                      width: 130, padding: '6px 8px', background: colors.bg, color: colors.text,
                      border: `1px solid ${bad ? '#f87171' : over ? '#fbbf24' : colors.border}`,
                      borderRadius: 4, fontSize: 13, textAlign: 'right',
                    }}
                  />
                  <button
                    onClick={() => setAll(row.key)}
                    title={`Enviar todo lo disponible (${formatRes(avail)})`}
                    style={{ background: 'none', border: `1px solid ${colors.border}`, color: colors.textSecondary, borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
                  >
                    todo
                  </button>
                  <span style={{ fontSize: 11, color: over ? '#fbbf24' : colors.textSecondary }}>
                    disp. {formatRes(avail)}{useBag && bag > 0 && <span style={{ color: '#fbbf24' }}> ({formatRes(storeSum(row.field))} + {formatRes(bag)} bolsa)</span>}
                  </span>
                  {bad && <span style={{ fontSize: 11, color: '#f87171' }}>número inválido</span>}
                  {over && !bad && <span style={{ fontSize: 11, color: '#fbbf24' }}>se enviará {formatRes(avail)}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Completar con bolsa */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.textSecondary, cursor: 'pointer', marginBottom: 14 }}>
          <input type="checkbox" checked={useBag} onChange={e => setUseBag(e.target.checked)} style={{ accentColor: '#4ade80' }} />
          Abrir items de la bolsa (inventario) para completar lo que falte en el almacén
        </label>

        {/* Results */}
        {batchResult && (
          <div style={{
            padding: '10px 14px', borderRadius: 6, marginBottom: 12, fontSize: 13,
            background: batchResult.failed === 0 ? '#1b5e2033' : '#b71c1c33',
            color: batchResult.failed === 0 ? '#4ade80' : '#fbbf24',
            border: `1px solid ${batchResult.failed === 0 ? '#4ade8044' : '#fbbf2444'}`,
          }}>
            <div>
              {batchResult.sent}/{batchResult.total} bots enviaron supply a "{batchResult.targetPlayer}"
              {batchResult.failed > 0 && ` (${batchResult.failed} fallaron)`}
            </div>
            {batchResult.shortfall && Object.keys(batchResult.shortfall).length > 0 && (
              <div style={{ marginTop: 4, color: '#f87171' }}>
                ⚠ Capacidad total insuficiente, faltó enviar: {Object.entries(batchResult.shortfall).map(([k, v]) => `${formatRes(v)} ${k}`).join(', ')}
              </div>
            )}
          </div>
        )}

        {(sending || results.length > 0) && (
          <div style={{ marginBottom: 12, maxHeight: 160, overflowY: 'auto' }}>
            {iggIds.map(id => {
              const done = results.filter(r => r.iggId === id).pop();
              if (!done && !sending) return null;
              const stoppingThis = stopping.has(id);
              const color = done ? (done.ok ? '#4ade80' : '#f87171') : stoppingThis ? '#fbbf24' : started.has(id) ? '#fbbf24' : colors.textSecondary;
              const msg = done ? done.message : stoppingThis ? '⏹ deteniendo…' : started.has(id) ? '⏳ orden activada, enviando…' : 'esperando turno…';
              return (
                <div key={id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', fontSize: 12, color,
                }}>
                  <span style={{ fontWeight: 600 }}>IGG {id}</span>
                  <span>{msg}</span>
                  {sending && !done && (
                    <button
                      onClick={() => stopOne(id)}
                      disabled={stoppingThis}
                      style={{
                        marginLeft: 'auto', background: 'none', border: `1px solid ${stoppingThis ? colors.border : '#f8717166'}`,
                        color: stoppingThis ? colors.textSecondary : '#f87171', borderRadius: 4, padding: '1px 8px',
                        fontSize: 11, cursor: stoppingThis ? 'default' : 'pointer',
                      }}
                    >
                      ⏹ Parar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: colors.textSecondary, marginRight: 'auto' }}>
            {!anyAmount && 'Elegí al menos un monto'}
          </span>
          <button onClick={onClose}>Cerrar</button>
          <button
            className="primary"
            disabled={sending || !targetPlayer.trim() || iggIds.length === 0 || invalid || !anyAmount}
            onClick={send}
          >
            {sending ? 'Enviando...' : `Enviar a ${iggIds.length} bot(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
