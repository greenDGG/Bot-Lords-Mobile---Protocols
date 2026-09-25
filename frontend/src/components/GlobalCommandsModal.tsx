import React, { useState, useEffect } from 'react';
import { colors } from './Theme';

interface Command {
  name: string;
  proto: number;
  hex: string;
  kind?: string;
}

interface SeqCmd {
  proto: number;
  hex: string;
  label: string;
}

interface Sequence {
  name: string;
  commands: SeqCmd[];
  delayMs: number;
}

export default function GlobalCommandsModal({ socket, onClose }: { socket: any; onClose: () => void }) {
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);

  // -- Comandos sueltos --
  const [name, setName] = useState('');
  const [proto, setProto] = useState('');
  const [hex, setHex] = useState('');
  const [kind, setKind] = useState('packet');
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState('');

  // -- Secuencias --
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [seqTab, setSeqTab] = useState<'list' | 'edit'>('list');
  const [seqName, setSeqName] = useState('');
  const [seqDelay, setSeqDelay] = useState(500);
  const [seqCmds, setSeqCmds] = useState<SeqCmd[]>([]);
  const [seqTarget, setSeqTarget] = useState<number | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newProto, setNewProto] = useState('');
  const [newHex, setNewHex] = useState('');
  const [seqProgress, setSeqProgress] = useState<{ name: string; step: number; total: number; status: string } | null>(null);
  const [seqDone, setSeqDone] = useState<{ name: string; total: number; accounts: number } | null>(null);

  useEffect(() => {
    if (!socket) return;
    const onCommands = (data: Command[]) => { setCommands(data || []); setLoading(false); };
    const onSeqs = (data: Sequence[]) => setSequences(data || []);
    const onError = (data: { message: string }) => { setError(data.message); setTimeout(() => setError(''), 4000); };
    const onChestBulk = (data: { accounts: number }) => { setError(`Cofres de guerra: abriendo en ${data.accounts ?? 0} cuenta(s)`); setTimeout(() => setError(''), 6000); };
    const onSeqProgress = (data: { name: string; step: number; total: number; status: string }) => { setSeqProgress(data); setSeqDone(null); };
    const onSeqDone = (data: { name: string; total: number; accounts: number }) => { setSeqProgress(null); setSeqDone(data); setTimeout(() => setSeqDone(null), 5000); };

    socket.on('globalCommands', onCommands);
    socket.on('planSequences', onSeqs);
    socket.on('error', onError);
    socket.on('chestBulkResult', onChestBulk);
    socket.on('planSequenceProgress', onSeqProgress);
    socket.on('planSequenceDone', onSeqDone);
    socket.emit('listGlobalCommands');
    socket.emit('listPlanSequences');
    return () => {
      socket.off('globalCommands', onCommands);
      socket.off('planSequences', onSeqs);
      socket.off('error', onError);
      socket.off('chestBulkResult', onChestBulk);
      socket.off('planSequenceProgress', onSeqProgress);
      socket.off('planSequenceDone', onSeqDone);
    };
  }, [socket]);

  // -- Comandos sueltos --
  const add = () => {
    if (!name.trim()) { setError('Nombre requerido'); return; }
    const h = hex.replace(/\s+/g, '');
    if (kind === 'chests') { socket.emit('addGlobalCommand', { name: name.trim(), proto: 0, hex: '00', kind }); setName(''); return; }
    const p = parseInt(proto);
    if (!p || p <= 0) { setError('Proto inválido'); return; }
    if (!h || h.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(h)) { setError('Hex inválido'); return; }
    socket.emit('addGlobalCommand', { name: name.trim(), proto: p, hex: h.toLowerCase(), kind });
    setName(''); setProto(''); setHex('');
  };
  const remove = (cmd: Command) => socket.emit('removeGlobalCommand', { name: cmd.name });
  const launch = (cmd: Command) => {
    if (cmd.kind === 'chests') { socket.emit('openAllWarChests'); return; }
    setSending(cmd.name);
    socket.emit('globalCommand', { proto: cmd.proto, body: cmd.hex });
    setTimeout(() => setSending(null), 1500);
  };

  // -- Secuencias --
  const startNewSeq = () => { setSeqTab('edit'); setSeqName(''); setSeqDelay(500); setSeqCmds([]); };
  const editSeq = (s: Sequence) => { setSeqTab('edit'); setSeqName(s.name); setSeqDelay(s.delayMs); setSeqCmds([...s.commands]); };
  const addSeqCmd = () => {
    const p = parseInt(newProto);
    if (!p || p <= 0) { setError('Proto inválido'); return; }
    const h = newHex.replace(/\s+/g, '');
    if (h && (h.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(h))) { setError('Hex inválido'); return; }
    setSeqCmds([...seqCmds, { proto: p, hex: h.toLowerCase(), label: newLabel.trim() || `#${p}` }]);
    setNewLabel(''); setNewProto(''); setNewHex('');
  };
  const saveSeq = () => {
    if (!seqName.trim()) { setError('Nombre de secuencia requerido'); return; }
    socket.emit('savePlanSequence', { name: seqName.trim(), commands: seqCmds, delayMs: seqDelay });
    setSeqTab('list');
  };
  const execSeq = (name: string, iggId?: number) => {
    setSeqProgress({ name, step: 0, total: 0, status: 'Iniciando...' });
    setSeqDone(null);
    socket.emit('executePlanSequence', { name, iggId: seqTarget || undefined });
  };
  const delSeq = (name: string) => socket.emit('deletePlanSequence', { name });

  const allIggIds = [...new Set(commands.map(() => 0))]; // placeholder, we'll pass via prop later

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1001, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3vh 16px', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 20, maxWidth: 760, width: '100%' }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>⚡ Comandos Globales</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: colors.textSecondary, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {error && <div style={{ background: '#3d1f1f', border: `1px solid ${colors.danger}`, borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{error}</div>}

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {(['comandos', 'secuencias'] as const).map(tab => (
            <button key={tab} onClick={() => { if (tab === 'secuencias') setSeqTab('list'); }}
              style={{
                padding: '8px 16px', borderRadius: 6, border: `1px solid ${colors.border}`,
                background: (tab === 'comandos' || (tab === 'secuencias' && seqTab !== undefined)) ? '#0f172a' : 'transparent',
                color: colors.text, fontSize: 13, cursor: 'pointer', textTransform: 'capitalize',
              }}>{tab === 'comandos' ? 'Comandos' : 'Secuencias'}</button>
          ))}
        </div>

        {/* ── COMANDOS ── */}
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', fontSize: 13 }}>
            <input placeholder="Nombre" value={name} onChange={e => setName(e.target.value)} style={{ width: 160 }} />
            <select value={kind} onChange={e => setKind(e.target.value)} style={{ background: '#000', color: '#fff', border: `1px solid ${colors.border}`, borderRadius: 4, padding: '4px 8px', fontSize: 13 }}>
              <option value="packet">Paquete (proto+hex)</option>
              <option value="chests">Abrir cajas de guerra</option>
            </select>
            <input placeholder="Proto" value={proto} onChange={e => setProto(e.target.value)} disabled={kind === 'chests'} style={{ width: 80 }} />
            <input placeholder="Hex (ej: 030100fb03)" value={hex} onChange={e => setHex(e.target.value)} disabled={kind === 'chests'} style={{ flex: 1, minWidth: 180 }} />
            <button className="primary" onClick={add}>＋ Agregar</button>
          </div>

          {loading ? (
            <div style={{ color: colors.textSecondary, padding: '24px 0', textAlign: 'center' }}>Cargando...</div>
          ) : commands.length === 0 ? (
            <div style={{ color: colors.textSecondary, padding: '24px 0', textAlign: 'center' }}>Sin comandos guardados</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {commands.map(cmd => (
                <div key={cmd.name} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0d1117', border: `1px solid ${colors.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 13 }}>
                  <span style={{ fontWeight: 600, minWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cmd.name}</span>
                  <span style={{ color: colors.primary, minWidth: 50 }}>{cmd.kind === 'chests' ? '📦' : `#${cmd.proto}`}</span>
                  <code style={{ color: colors.textSecondary, flex: 1, fontFamily: 'monospace' }}>{cmd.kind === 'chests' ? 'abre todas las cajas de guerra (3073)' : cmd.hex}</code>
                  <button className="primary" onClick={() => launch(cmd)} disabled={sending === cmd.name}>{sending === cmd.name ? '...' : '▶'}</button>
                  <button className="danger" onClick={() => remove(cmd)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${colors.border}`, margin: '20px 0 16px' }} />

        {/* ── SECUENCIAS ── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Secuencias</div>

        {seqProgress && (
          <div style={{ background: '#0f172a', border: `1px solid ${colors.primary}`, borderRadius: 8, padding: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{seqProgress.name}</div>
            <div style={{ height: 5, borderRadius: 3, background: '#1e293b', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${seqProgress.total > 0 ? (seqProgress.step / seqProgress.total) * 100 : 0}%`, background: colors.primary, borderRadius: 3, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 3 }}>{seqProgress.status}</div>
          </div>
        )}
        {seqDone && (
          <div style={{ background: '#0f2a0f', border: `1px solid #22c55e`, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>
            ✔ {seqDone.name}: {seqDone.total} pasos → {seqDone.accounts} cuenta(s)
          </div>
        )}

        {seqTab === 'list' ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {sequences.length === 0 && <div style={{ color: colors.textSecondary, fontSize: 12 }}>Sin secuencias guardadas</div>}
              {sequences.map(s => (
                <div key={s.name} style={{ background: '#0d1117', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: colors.textSecondary }}>{s.commands.length} cmds · {s.delayMs}ms</span>
                  <span onClick={() => editSeq(s)} style={{ cursor: 'pointer', color: colors.primary, fontSize: 12 }}>✎</span>
                  <span onClick={() => execSeq(s.name)} style={{ cursor: 'pointer', color: '#22c55e', fontSize: 14 }}>▶</span>
                  <span onClick={() => delSeq(s.name)} style={{ cursor: 'pointer', color: colors.danger, fontSize: 12 }}>✕</span>
                </div>
              ))}
            </div>
            <button onClick={startNewSeq} style={{ fontSize: 12, padding: '6px 14px' }}>+ Nueva secuencia</button>
          </>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 3 }}>Nombre</div>
                <input value={seqName} onChange={e => setSeqName(e.target.value)} placeholder="Mi secuencia"
                  style={{ width: '100%', padding: '8px', borderRadius: 6, border: `1px solid ${colors.border}`, background: '#0f172a', color: colors.text, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ width: 90 }}>
                <div style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 3 }}>Delay ms</div>
                <input type="number" min={100} step={100} value={seqDelay} onChange={e => setSeqDelay(parseInt(e.target.value) || 500)}
                  style={{ width: '100%', padding: '8px', borderRadius: 6, border: `1px solid ${colors.border}`, background: '#0f172a', color: colors.text, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Pasos ({seqCmds.length})</div>

            {seqCmds.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
                {seqCmds.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1117', borderRadius: 5, padding: '5px 10px', fontSize: 12 }}>
                    <span style={{ color: colors.textSecondary, minWidth: 20, textAlign: 'center' }}>{i + 1}</span>
                    <span style={{ color: colors.primary, minWidth: 45 }}>{c.proto}</span>
                    <code style={{ color: colors.textSecondary, flex: 1, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.hex}</code>
                    <span style={{ color: colors.text, fontSize: 11 }}>{c.label}</span>
                    <span onClick={() => { const a = [...seqCmds]; if (i > 0) { [a[i - 1], a[i]] = [a[i], a[i - 1]]; setSeqCmds(a); } }} style={{ cursor: 'pointer', color: colors.textSecondary }}>▲</span>
                    <span onClick={() => { const a = [...seqCmds]; if (i < a.length - 1) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; setSeqCmds(a); } }} style={{ cursor: 'pointer', color: colors.textSecondary }}>▼</span>
                    <span onClick={() => setSeqCmds(seqCmds.filter((_, j) => j !== i))} style={{ cursor: 'pointer', color: colors.danger }}>✕</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Label" style={{ width: 80, padding: '6px 8px', borderRadius: 4, border: `1px solid ${colors.border}`, background: '#0f172a', color: colors.text, fontSize: 12 }} />
              <input value={newProto} onChange={e => setNewProto(e.target.value)} placeholder="Proto" style={{ width: 70, padding: '6px 8px', borderRadius: 4, border: `1px solid ${colors.border}`, background: '#0f172a', color: colors.text, fontSize: 12 }} />
              <input value={newHex} onChange={e => setNewHex(e.target.value)} placeholder="Hex" style={{ flex: 1, minWidth: 100, padding: '6px 8px', borderRadius: 4, border: `1px solid ${colors.border}`, background: '#0f172a', color: colors.text, fontSize: 12 }} />
              <button onClick={addSeqCmd} style={{ fontSize: 12, padding: '6px 10px' }}>+ Paso</button>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setSeqTab('list')}>Cancelar</button>
              <button className="primary" onClick={saveSeq}>Guardar</button>
              {seqName && <button className="primary" onClick={() => execSeq(seqName)} disabled={seqProgress !== null}>▶ Ejecutar</button>}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
