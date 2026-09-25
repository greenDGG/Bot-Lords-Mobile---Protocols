import React, { useState, useEffect } from 'react';
import { colors } from './Theme';

interface ProxyAuthBytes {
  byte0C: number;
  byte0D: number;
  byte0E: number;
  byte0F: number;
  byte10: number;
  byte11: number;
}

const FIELDS: { key: keyof ProxyAuthBytes; label: string; note: string }[] = [
  { key: 'byte0C', label: '0x0C', note: 'actual C8' },
  { key: 'byte0D', label: '0x0D', note: 'actual 02' },
  { key: 'byte0E', label: '0x0E', note: 'actual 37' },
  { key: 'byte0F', label: '0x0F', note: 'actual 01' },
  { key: 'byte10', label: '0x10', note: 'actual 05' },
  { key: 'byte11', label: '0x11', note: 'actual 01' },
];

const toHexInput = (v: number | undefined) => (v === undefined || v === null ? '' : v.toString(16).toUpperCase().padStart(2, '0'));

export default function ProxyAuthModal({ socket, onClose }: { socket: any; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onData = (data: ProxyAuthBytes) => {
      const next: Record<string, string> = {};
      for (const f of FIELDS) next[f.key] = toHexInput(data?.[f.key]);
      setValues(next);
      setLoading(false);
    };
    const onSaved = () => {
      setSaving(false);
      setMsg('Guardado en DB. Se aplica en la próxima conexión de cada bot.');
      setTimeout(() => setMsg(''), 6000);
    };
    const onError = (data: { message: string }) => {
      setSaving(false);
      setError(data?.message || 'Error');
      setTimeout(() => setError(''), 5000);
    };
    socket.on('proxyAuthData', onData);
    socket.on('proxyAuthSaved', onSaved);
    socket.on('error', onError);
    socket.emit('getProxyAuth');
    return () => {
      socket.off('proxyAuthData', onData);
      socket.off('proxyAuthSaved', onSaved);
      socket.off('error', onError);
    };
  }, [socket]);

  const save = () => {
    const payload: Record<string, number> = {};
    for (const f of FIELDS) {
      const raw = (values[f.key] || '').trim().replace(/^0x/i, '');
      if (!/^[0-9a-fA-F]{1,2}$/.test(raw)) {
        setError(`${f.label}: valor hex inválido (00-FF)`);
        setTimeout(() => setError(''), 5000);
        return;
      }
      payload[f.key] = parseInt(raw, 16);
    }
    setSaving(true);
    socket.emit('saveProxyAuth', payload);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', zIndex: 1001,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 16px', overflowY: 'auto',
    }} onClick={onClose}>
      <div style={{
        background: colors.surface, border: `1px solid ${colors.border}`,
        borderRadius: 8, padding: 20, maxWidth: 560, width: '100%',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3>🔐 Proxy Auth (global)</h3>
          <button onClick={onClose}>Cerrar</button>
        </div>
        <p style={{ color: colors.textSecondary, fontSize: 12, margin: '0 0 16px' }}>
          Bytes del paquete de autenticación con el proxy. Es una config global para todas las cuentas
          (se lee de la DB en cada conexión). Cambialos cuando IGG actualice versiones.
        </p>

        {(error || msg) && (
          <div style={{
            background: error ? '#3d1f1f' : '#1f3d24',
            border: `1px solid ${error ? colors.danger : colors.primary}`,
            borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 13,
          }}>
            {error || msg}
          </div>
        )}

        {loading ? (
          <div style={{ color: colors.textSecondary, padding: '24px 0', textAlign: 'center' }}>Cargando...</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {FIELDS.map(f => (
                <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span style={{ color: colors.textSecondary }}>
                    Byte {f.label} <span style={{ opacity: 0.6 }}>({f.note})</span>
                  </span>
                  <input
                    value={values[f.key] ?? ''}
                    onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value.toUpperCase() }))}
                    placeholder="C8"
                    maxLength={2}
                    style={{
                      background: '#000', color: '#fff', border: `1px solid ${colors.border}`,
                      borderRadius: 4, padding: '6px 8px', fontFamily: 'monospace', fontSize: 14,
                    }}
                  />
                </label>
              ))}
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={onClose}>Cancelar</button>
              <button className="primary" onClick={save} disabled={saving}>
                {saving ? 'Guardando...' : '💾 Guardar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
