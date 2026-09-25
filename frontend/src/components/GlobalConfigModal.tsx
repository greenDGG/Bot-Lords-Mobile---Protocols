import React, { useState, useEffect } from 'react';
import ConfigPanel from './ConfigPanel';
import { colors } from './Theme';

export default function GlobalConfigModal({ socket, ids, onClose }: { socket: any; ids: number[]; onClose: () => void }) {
  const [template, setTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Capturamos las cuentas una sola vez al abrir: MainPage se re-renderiza cada
  // segundo (tick de escudos) y pasa un array nuevo de ids en cada render.
  const [stableIds] = useState(() => ids.slice());

  useEffect(() => {
    if (stableIds.length === 0) return;
    const first = stableIds[0];
    const onConfigData = (data: any) => {
      if (String(data.iggId) !== String(first)) return;
      if (data.config) {
        setTemplate(data.config);
        setLoading(false);
      }
    };
    socket.on('configData', onConfigData);
    socket.emit('getConfigOffline', { iggId: first });
    return () => { socket.off('configData', onConfigData); };
  }, [socket, stableIds]);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', zIndex: 1001,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 16px', overflowY: 'auto',
    }} onClick={onClose}>
      <div style={{
        background: colors.surface, border: `1px solid ${colors.border}`,
        borderRadius: 8, padding: 20, maxWidth: 760, width: '100%',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3>⚙️ Configuración Global ({ids.length} cuenta{ids.length !== 1 ? 's' : ''})</h3>
          <button onClick={onClose}>Cerrar</button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.textSecondary }}>
          Solo se aplican a las cuentas seleccionadas los campos que modifiques. Los que no toques quedan igual.
        </p>
        {loading ? (
          <div style={{ color: colors.textSecondary, padding: '24px 0', textAlign: 'center' }}>
            Cargando configuración base...
          </div>
        ) : template ? (
          <ConfigPanel config={template} socket={socket} iggId={ids[0]} colors={colors} applyTo={ids} />
        ) : (
          <div style={{ color: colors.danger, padding: '24px 0', textAlign: 'center' }}>
            No se pudo cargar la configuración base.
          </div>
        )}
      </div>
    </div>
  );
}