import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { colors } from './Theme';

interface Props {
  /** Si se pasa, bloquea a esa cuenta y muestra modo Archivos */
  iggId?: number;
  /** Logs en vivo por socket */
  logs?: string[];
  logsEndRef?: React.RefObject<HTMLDivElement | null>;
  socket?: Socket;
}

interface BatchCmd {
  proto: string;
  body: string;
  seq: boolean;
}

export default function LogViewer({ iggId, logs = [], logsEndRef, socket }: Props) {
  const [mode, setMode] = useState<'live' | 'files'>(iggId ? 'files' : 'live');
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [tailMode, setTailMode] = useState(true);
  const [tailLines, setTailLines] = useState(500);
  const containerRef = useRef<HTMLDivElement>(null);
  const liveContainerRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wasAtBottomRef = useRef(true);
  const [cmdProto, setCmdProto] = useState('');
  const [cmdBody, setCmdBody] = useState('');
  const [cmdSeq, setCmdSeq] = useState(true);
  const [batchCmds, setBatchCmds] = useState<BatchCmd[]>([]);
  const [batchDelay, setBatchDelay] = useState(500);
  const [cmdResult, setCmdResult] = useState('');
  const [autoRunning, setAutoRunning] = useState(true);
  const [cmdExpanded, setCmdExpanded] = useState(false);

  useEffect(() => {
    if (!socket || !iggId) return;
    socket.emit('getAutoActionsState', { iggId });
    const onState = (data: { iggId: number; running: boolean }) => {
      if (data.iggId === iggId) setAutoRunning(data.running);
    };
    socket.on('autoActionsState', onState);
    return () => { socket.off('autoActionsState', onState); };
  }, [socket, iggId]);

  // Cargar archivos de la cuenta
  useEffect(() => {
    if (!iggId) return;
    fetch(`/logs/${iggId}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.files) {
          setFiles(d.files);
          if (d.files.length > 0 && !selectedFile) {
            setSelectedFile(d.files[d.files.length - 1]);
          }
        }
      })
      .catch(() => {});
  }, [iggId]);

  // Cargar contenido de archivo
  const loadFile = useCallback(() => {
    if (!iggId || !selectedFile) { setLines([]); return; }
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (tailMode && !search && tailLines > 0) params.set('tail', String(tailLines));
    fetch(`/logs/${iggId}/${selectedFile}?${params}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setLines(d.lines); })
      .catch(() => setLines([]))
      .finally(() => setLoading(false));
  }, [iggId, selectedFile, search, tailMode, tailLines]);

  useEffect(() => { if (mode === 'files') loadFile(); }, [mode, loadFile]);

  // Auto-refresh en modo archivos
  useEffect(() => {
    if (mode !== 'files' || !tailMode) return;
    const id = setInterval(loadFile, 5000);
    return () => clearInterval(id);
  }, [mode, tailMode, loadFile]);

  // Auto-scroll en vivo — solo si estás al final
  useEffect(() => {
    if (mode === 'live' && liveContainerRef.current && wasAtBottomRef.current) {
      liveContainerRef.current.scrollTop = liveContainerRef.current.scrollHeight;
    }
  }, [logs, mode]);

  // Detectar si el usuario scrolleo arriba en vivo
  const onLiveScroll = () => {
    const el = liveContainerRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  };

  // Auto-scroll en archivos — solo si estás al final
  useEffect(() => {
    if (mode === 'files' && containerRef.current && wasAtBottomRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, mode]);

  // Detectar si el usuario scrolleo arriba en archivos
  const onFileScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  };

  const onSearch = (v: string) => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setSearch(v), 400);
  };

  const highlight = (line: string) => {
    if (!search) return line;
    const re = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = line.split(re);
    return parts.map((p, i) =>
      i % 2 === 1
        ? <span key={i} style={{ background: '#fbbf24', color: '#000', borderRadius: 2, padding: '0 2px' }}>{p}</span>
        : p
    );
  };

  const lineColor = (line: string) => {
    if (line.includes('[-]') || line.includes('error') || line.includes('Error')) return colors.danger;
    if (line.includes('[+]') || line.includes('OK')) return colors.success;
    if (line.includes('[*]') || line.includes('[AUTO]')) return colors.primary;
    if (line.includes('[COLISEO]')) return '#a78bfa';
    if (line.includes('[ATALAYA]') || line.includes('[CONTRA]')) return '#f59e0b';
    if (line.includes('[ESCUDO]')) return '#06b6d4';
    return '#9ca3af';
  };

  const barHeight = 36;

  const sendSingle = () => {
    if (!socket || !iggId || !cmdProto) return;
    socket.emit('sendRawProto', { iggId, proto: parseInt(cmdProto), body: cmdBody || '', seq: cmdSeq });
    setCmdResult(`→ Proto ${cmdProto} enviado`);
    setTimeout(() => setCmdResult(''), 3000);
  };

  const addBatch = () => {
    if (!cmdProto) return;
    setBatchCmds(prev => [...prev, { proto: cmdProto, body: cmdBody, seq: cmdSeq }]);
    setCmdProto('');
    setCmdBody('');
  };

  const sendBatch = () => {
    if (!socket || !iggId || batchCmds.length === 0) return;
    const commands = batchCmds.map(c => ({ proto: parseInt(c.proto), body: c.body || '', seq: c.seq }));
    socket.emit('sendRawBatch', { iggId, commands, delayMs: batchDelay });
    setCmdResult(`▶ Enviando ${commands.length} comandos...`);
    setTimeout(() => setCmdResult(''), 3000);
  };

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const onDragStart = (idx: number) => { dragItem.current = idx; };
  const onDragEnter = (idx: number) => { dragOverItem.current = idx; };
  const onDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }
    setBatchCmds(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragItem.current!, 1);
      next.splice(dragOverItem.current!, 0, moved);
      return next;
    });
    dragItem.current = null;
    dragOverItem.current = null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 500 }}>
      {/* Barra superior */}
      <div style={{
        display: 'flex', gap: 6, alignItems: 'center', padding: '6px 0',
        borderBottom: `1px solid ${colors.border}`, flexWrap: 'wrap',
      }}>
        {iggId ? (
          <span style={{ fontSize: 12, color: colors.primary, fontWeight: 600 }}>Cuenta {iggId}</span>
        ) : (
          <select defaultValue="" style={{ padding: '4px 6px', fontSize: 12, background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 4 }}>
            <option value="">Seleccionar cuenta...</option>
          </select>
        )}

        <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: `1px solid ${colors.border}` }}>
          <button
            onClick={() => setMode('live')}
            style={{
              padding: '4px 10px', fontSize: 12, border: 'none', cursor: 'pointer',
              background: mode === 'live' ? colors.primary : colors.surface,
              color: mode === 'live' ? '#fff' : colors.text,
            }}
          >En vivo</button>
          <button
            onClick={() => setMode('files')}
            style={{
              padding: '4px 10px', fontSize: 12, border: 'none', borderLeft: `1px solid ${colors.border}`, cursor: 'pointer',
              background: mode === 'files' ? colors.primary : colors.surface,
              color: mode === 'files' ? '#fff' : colors.text,
            }}
          >Archivos</button>
        </div>

        {mode === 'files' && (
          <>
            <select value={selectedFile} onChange={e => setSelectedFile(e.target.value)}
              style={{ padding: '4px 6px', fontSize: 12, background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 4 }}>
              {files.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <input type="text" placeholder="Buscar..." onChange={e => onSearch(e.target.value)}
              style={{ flex: 1, minWidth: 100, padding: '4px 6px', fontSize: 12, background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 4 }} />
            <label style={{ fontSize: 11, color: colors.textSecondary, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={tailMode} onChange={e => setTailMode(e.target.checked)} style={{ accentColor: '#4ade80' }} />
              Auto-refresh
            </label>
            <select value={tailLines} onChange={e => setTailLines(Number(e.target.value))}
              style={{ padding: '4px 6px', fontSize: 11, background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 4 }}>
              <option value={0}>Todas</option>
              <option value={200}>200 líneas</option>
              <option value={500}>500 líneas</option>
              <option value={1000}>1000 líneas</option>
              <option value={2000}>2000 líneas</option>
              <option value={5000}>5000 líneas</option>
            </select>
          </>
        )}
      </div>

      {/* Contenido */}
      {mode === 'live' ? (
        <div ref={liveContainerRef} onScroll={onLiveScroll} style={{
          flex: 1, overflow: 'auto', background: '#0a0a0a', borderRadius: 4, padding: 6,
          fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5, height: 350,
        }}>
          {logs.length === 0 && <span style={{ color: colors.textSecondary }}>Esperando eventos...</span>}
          {logs.map((msg, i) => (
            <div key={i} style={{ color: lineColor(msg), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {msg}
            </div>
          ))}
          {logsEndRef && <div ref={logsEndRef} />}
        </div>
      ) : (
        <div ref={containerRef} onScroll={onFileScroll} style={{
          flex: 1, overflow: 'auto', background: '#0a0a0a', borderRadius: 4, padding: 6,
          fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5, height: 350,
        }}>
          {loading && <div style={{ color: colors.textSecondary }}>Cargando...</div>}
          {!loading && lines.length === 0 && <div style={{ color: colors.textSecondary }}>Sin resultados</div>}
          {lines.map((l, i) => (
            <div key={i} style={{ color: lineColor(l), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {highlight(l)}
            </div>
          ))}
        </div>
      )}

      {mode === 'files' && (
        <div style={{ fontSize: 11, color: colors.textSecondary, paddingTop: 4 }}>
          {lines.length} líneas {search && `— filtrado por "${search}"`}
        </div>
      )}

      {iggId && socket && (
        <div style={{
          borderTop: `1px solid ${colors.border}`, paddingTop: 8, marginTop: 4,
        }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <button onClick={() => { socket.emit('toggleAutoActions', { iggId }); }}
              style={{
                padding: '4px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 4, cursor: 'pointer',
                background: autoRunning ? '#dc2626' : '#22c55e', color: '#fff',
              }}>
              {autoRunning ? '⏹ Parar Auto' : '▶ Reanudar Auto'}
            </button>
            <span style={{ fontSize: 11, color: autoRunning ? '#4ade80' : colors.danger }}>
              {autoRunning ? 'Loop activo' : 'Loop pausado'}
            </span>
            <button onClick={() => setCmdExpanded(!cmdExpanded)}
              style={{
                marginLeft: 'auto', padding: '3px 10px', fontSize: 11, border: `1px solid ${colors.border}`,
                borderRadius: 4, cursor: 'pointer', background: cmdExpanded ? colors.primary : colors.surface,
                color: cmdExpanded ? '#fff' : colors.textSecondary,
              }}>
              {cmdExpanded ? '▾ Comandos' : '▸ Comandos'}
            </button>
          </div>
          {cmdExpanded && (<>
          <div style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>Comando raw (proto + hex body)</div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="number" placeholder="Proto" value={cmdProto} onChange={e => setCmdProto(e.target.value)}
              style={{ width: 70, padding: '4px 6px', fontSize: 12, background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 4 }} />
            <input type="text" placeholder="Body hex (opcional)" value={cmdBody} onChange={e => setCmdBody(e.target.value)}
              style={{ flex: 1, minWidth: 150, padding: '4px 6px', fontSize: 12, fontFamily: 'monospace', background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 4 }}
              onKeyDown={e => { if (e.key === 'Enter' && cmdProto) sendSingle(); }} />
            <label style={{ fontSize: 11, color: colors.textSecondary, display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
              <input type="checkbox" checked={cmdSeq} onChange={e => setCmdSeq(e.target.checked)} style={{ accentColor: '#4ade80' }} />
              Seq
            </label>
            <button onClick={sendSingle} disabled={!cmdProto}
              style={{ padding: '4px 10px', fontSize: 12, background: cmdProto ? colors.primary : '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: cmdProto ? 'pointer' : 'default' }}>
              Enviar
            </button>
            <button onClick={addBatch} disabled={!cmdProto}
              style={{ padding: '4px 10px', fontSize: 12, background: cmdProto ? '#6366f1' : '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: cmdProto ? 'pointer' : 'default' }}>
              + Cola
            </button>
          </div>

          {batchCmds.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: colors.textSecondary }}>Cola ({batchCmds.length}) — delay:</span>
                <input type="number" value={batchDelay} onChange={e => setBatchDelay(Number(e.target.value))} min={100} max={5000} step={100}
                  style={{ width: 60, padding: '2px 4px', fontSize: 11, background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 4 }} />
                <span style={{ fontSize: 11, color: colors.textSecondary }}>ms</span>
                <button onClick={sendBatch}
                  style={{ padding: '3px 10px', fontSize: 11, background: '#22c55e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginLeft: 'auto' }}>
                  ▶ Ejecutar cola
                </button>
                <button onClick={() => setBatchCmds([])}
                  style={{ padding: '3px 6px', fontSize: 11, background: colors.danger, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                  Limpiar
                </button>
              </div>
              {batchCmds.map((c, i) => (
                <div key={i}
                  draggable
                  onDragStart={() => onDragStart(i)}
                  onDragEnter={() => onDragEnter(i)}
                  onDragEnd={onDragEnd}
                  onDragOver={e => e.preventDefault()}
                  style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, fontFamily: 'monospace', color: colors.textSecondary, padding: '2px 4px', cursor: 'grab', borderRadius: 3, background: dragItem.current === i ? '#1e3a5f' : 'transparent', border: `1px solid ${dragOverItem.current === i ? colors.primary : 'transparent'}`, transition: 'background 0.15s' }}>
                  <span style={{ color: '#555', cursor: 'grab', userSelect: 'none' }}>⠿</span>
                  <span style={{ color: colors.primary, minWidth: 18 }}>{i + 1}.</span>
                  <span style={{ color: '#f59e0b' }}>P{c.proto}</span>
                  <span style={{ color: colors.text }}>{c.body || '(sin body)'}</span>
                  <span style={{ color: c.seq ? '#4ade80' : '#666' }}>{c.seq ? 'SEQ' : 'RAW'}</span>
                  <button onClick={() => setBatchCmds(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: 11, padding: '0 2px' }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {cmdResult && (
            <div style={{ fontSize: 11, color: colors.success, marginTop: 4 }}>{cmdResult}</div>
          )}
          </>)}
        </div>
      )}
    </div>
  );
}
