import React from 'react';
import { colors } from './Theme';

interface Props {
  iggId: number;
  isRunning: boolean;
  isStarting?: boolean;
  playerInfo?: { playerName: string; power: number };
  shield?: { remaining: number; name: string };
  selected: boolean;
  onSelect: (iggId: number, checked: boolean) => void;
  onStart: () => void;
  onStop: () => void;
  onOpen: () => void;
}

function formatShield(ms: number): string {
  if (ms <= 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export default function AccountCard({ iggId, isRunning, isStarting, playerInfo, shield, selected, onSelect, onStart, onStop, onOpen }: Props) {
  return (
    <div style={{
      background: colors.surface,
      border: `1px solid ${isStarting ? '#f59e0b' : colors.border}`,
      borderRadius: 8,
      padding: 16,
      cursor: 'pointer',
      transition: 'border-color 0.2s',
    }} onClick={onOpen}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onSelect(iggId, e.target.checked)} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>IGG {iggId}</span>
          <span style={{
            display: 'inline-block', width: 8, height: 8,
            borderRadius: '50%', background: isStarting ? '#f59e0b' : isRunning ? colors.success : colors.textSecondary,
            animation: isStarting ? 'pulse 1s infinite' : undefined,
          }} />
          <span style={{ fontSize: 11, color: isStarting ? '#f59e0b' : colors.textSecondary }}>
            {isStarting ? 'CONECTANDO...' : isRunning ? 'EN LÍNEA' : 'OFF'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {isStarting ? (
            <button disabled style={{ padding: '4px 10px', fontSize: 12, background: '#f59e0b', color: '#000', border: 'none', borderRadius: 4, opacity: 0.7, cursor: 'not-allowed' }}>
              ⏳ Conectando...
            </button>
          ) : !isRunning ? (
            <button className="primary" style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={(e) => { e.stopPropagation(); onStart(); }}>
              ▶ Iniciar
            </button>
          ) : (
            <button className="danger" style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={(e) => { e.stopPropagation(); onStop(); }}>
              ⏹ Detener
            </button>
          )}
        </div>
      </div>

      <div style={{ fontSize: 13, color: colors.textSecondary }}>
        <div style={{ marginBottom: 4 }}>
          {playerInfo?.playerName || '—'}
          {playerInfo && playerInfo.power > 0 && (
            <span style={{ color: colors.warning, marginLeft: 8 }}>⚡ {playerInfo.power.toLocaleString()}</span>
          )}
        </div>
        <div>
          🛡 Escudo: <span style={{ color: shield && shield.remaining > 0 ? colors.success : colors.textSecondary }}>
            {shield && shield.remaining > 0 ? formatShield(shield.remaining) : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
