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
  onClose: () => void;
}

export default function SupplyModal({ socket, iggIds, players, resources, onClose }: Props) {
  const [targetPlayer, setTargetPlayer] = useState('');
  const [selectedRes, setSelectedRes] = useState<Set<string>>(new Set(['trigo', 'piedra', 'madera', 'mineral', 'oro']));
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SupplyResult[]>([]);
  const [batchResult, setBatchResult] = useState<{ total: number; sent: number; failed: number; targetPlayer: string } | null>(null);

  useEffect(() => {
    if (!socket) return;
    const onSupplyResult = (data: SupplyResult) => {
      setResults(prev => [...prev, data]);
    };
    const onSupplyBatch = (data: { total: number; sent: number; failed: number; targetPlayer: string }) => {
      setSending(false);
      setBatchResult(data);
    };
    socket.on('supplyResult', onSupplyResult);
    socket.on('supplyBatchResult', onSupplyBatch);
    return () => {
      socket.off('supplyResult', onSupplyResult);
      socket.off('supplyBatchResult', onSupplyBatch);
    };
  }, [socket]);

  const toggleRes = (r: string) => {
    setSelectedRes(prev => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  };

  const send = () => {
    if (!targetPlayer.trim() || sending) return;
    setSending(true);
    setResults([]);
    setBatchResult(null);
    socket.emit('sendManualSupply', {
      iggIds,
      targetPlayer: targetPlayer.trim(),
      resources: selectedRes.size > 0 ? Array.from(selectedRes) : undefined,
    });
  };

  const formatRes = (v: number) => {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toString();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1001, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3vh 16px', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 20, maxWidth: 600, width: '100%' }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>🚛 Supply Global</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: colors.textSecondary, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>
          Enviar recursos a un jugador desde {iggIds.length} bot(s) seleccionado(s).
        </div>

        {/* Bots seleccionados */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Bots ({iggIds.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
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

        {/* Resource selection */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Recursos</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['trigo', 'piedra', 'madera', 'mineral', 'oro'] as const).map(r => (
              <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', padding: '4px 8px', borderRadius: 4, background: selectedRes.has(r) ? '#1b5e2033' : 'transparent', border: `1px solid ${selectedRes.has(r) ? '#4ade8044' : colors.border}` }}>
                <input type="checkbox" checked={selectedRes.has(r)} onChange={() => toggleRes(r)} style={{ accentColor: '#4ade80' }} />
                {r}
              </label>
            ))}
          </div>
        </div>

        {/* Results */}
        {batchResult && (
          <div style={{
            padding: '10px 14px', borderRadius: 6, marginBottom: 12, fontSize: 13,
            background: batchResult.failed === 0 ? '#1b5e2033' : '#b71c1c33',
            color: batchResult.failed === 0 ? '#4ade80' : '#fbbf24',
            border: `1px solid ${batchResult.failed === 0 ? '#4ade8044' : '#fbbf2444'}`,
          }}>
            {batchResult.sent}/{batchResult.total} bots enviaron supply a "{batchResult.targetPlayer}"
            {batchResult.failed > 0 && ` (${batchResult.failed} fallaron)`}
          </div>
        )}

        {results.length > 0 && (
          <div style={{ marginBottom: 12, maxHeight: 160, overflowY: 'auto' }}>
            {results.map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', fontSize: 12,
                color: r.ok ? '#4ade80' : '#f87171',
              }}>
                <span style={{ fontWeight: 600 }}>IGG {r.iggId}</span>
                <span>{r.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cerrar</button>
          <button
            className="primary"
            disabled={sending || !targetPlayer.trim() || iggIds.length === 0}
            onClick={send}
          >
            {sending ? 'Enviando...' : `Enviar a ${iggIds.length} bot(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
