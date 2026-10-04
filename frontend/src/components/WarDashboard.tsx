import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { colors } from './Theme';

interface WarEvent {
  iggId: number;
  active: boolean;
  coordX: number;
  coordY: number;
  rallyLeader: string;
  enemyName: string;
  timeRemainingSec: number;
  warTimestamp: string;
  index: number;
  type: string;
  /** 6611: 'own' = propias del gremio, 'against' = en contra */
  side?: 'own' | 'against';
  level?: number;
  inMarch?: boolean;
  troopsCurrent?: number;
  troopsMax?: number;
}

interface TroopInfo { type: number; tier: number; count: number; }

interface Props {
  socket: Socket;
  bots: number[];
}

interface Group {
  wars: WarEvent[];
  rallyLeader: string;
  enemyName: string;
  coordX: number;
  coordY: number;
  type: string;
  side?: 'own' | 'against';
  timeRemainingSec: number;
  warTimestamp: string;
  level?: number;
  inMarch?: boolean;
  troopsCurrent?: number;
  troopsMax?: number;
}

const PRESETS_KEY = 'war_presets';
const TROOPS_PER_ACCOUNT = 200000;

// El lado (6611) va en la clave: la misma torre/líder puede existir en ambas
// listas (propias y en contra) y son entradas distintas.
const groupKey = (g: Group) => `${g.rallyLeader}|${g.coordX}|${g.coordY}|${g.type}|${g.side || ''}`;

// El "enemigo" real: para fortalezas es la propia fortaleza (enemyName viene vacío
// y rallyLeader es el aliado que inició la agrupación)
const enemyLabel = (g: Group) =>
  g.enemyName || (g.type === 'fortress' ? `Fortaleza${g.level ? ` ${g.level}` : ''}` : g.rallyLeader);

const TYPE_LABEL: Record<string, string> = { castle: 'Castillo', tower: 'Torre', fortress: 'Fortaleza' };

const SIDE_LABEL: Record<string, { text: string; color: string }> = {
  own: { text: 'PROPIAS', color: '#22c55e' },
  against: { text: 'EN CONTRA', color: '#ef4444' },
};

function loadPresets(): string[] {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]'); } catch { return []; }
}
function savePresets(p: string[]) { localStorage.setItem(PRESETS_KEY, JSON.stringify(p)); }

function parseRatio(input: string): { inf: number; art: number; cav: number } | null {
  const d = input.replace(/\D/g, '');
  if (d.length < 2 || d.length > 3) return null;
  const nums = d.split('').map(Number);
  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum === 0) return null;
  const u = TROOPS_PER_ACCOUNT / sum;
  return { inf: Math.round(u * nums[0]), art: Math.round(u * nums[1]), cav: Math.round(u * (nums[2] ?? 0)) };
}

function formatNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'K';
  return n.toString();
}

// Tope por campo: como mucho el disponible, y nunca más de 200k (lo que cabe
// en una cuenta). Si el disponible es 0/desconocido se permite hasta 200k.
function fieldMax(available: number): number {
  return available > 0 ? Math.min(available, TROOPS_PER_ACCOUNT) : TROOPS_PER_ACCOUNT;
}

function formatCountdown(remaining: number): string {
  if (remaining <= 0) return '0s';
  const m = Math.floor(remaining / 60);
  const s = Math.floor(remaining % 60);
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

function urgencyColor(remaining: number): string {
  if (remaining <= 60) return '#ef4444';
  if (remaining <= 300) return '#eab308';
  if (remaining <= 900) return '#22c55e';
  return colors.textSecondary;
}

function UrgencyBar({ warTimestamp, timeRemainingSec }: { warTimestamp: string; timeRemainingSec: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const elapsed = (now - new Date(warTimestamp).getTime()) / 1000;
  const remaining = Math.max(0, timeRemainingSec - elapsed);
  const color = urgencyColor(remaining);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        fontVariantNumeric: 'tabular-nums',
        fontSize: 13, fontWeight: 600, color,
        transition: 'color 0.3s',
      }}>
        {formatCountdown(remaining)}
      </span>
      <div style={{ flex: 1, height: 3, borderRadius: 2, background: '#1e293b', overflow: 'hidden', minWidth: 40 }}>
        <div style={{
          height: '100%', borderRadius: 2, background: color,
          width: `${Math.max(0, Math.min(100, (1 - remaining / timeRemainingSec) * 100))}%`,
          transition: 'width 1s linear, background 0.3s',
        }} />
      </div>
    </div>
  );
}

function TierSquare({ tier, count, active, onClick }: { tier: number; count: number; active: boolean; onClick: () => void }) {
  const tierColors: Record<number, string> = { 1: '#6b7280', 2: '#3b82f6', 3: '#22c55e', 4: '#eab308', 5: '#ef4444' };
  const tc = tierColors[tier] || colors.border;
  return (
    <div onClick={onClick} style={{
      width: 80, height: 80, borderRadius: 8, border: `2px solid ${active ? tc : colors.border}`,
      background: active ? `${tc}22` : '#0f172a', cursor: 'pointer', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
    }}>
      <div style={{ fontSize: 11, color: colors.textSecondary }}>T{tier}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: active ? tc : colors.text }}>{formatNum(count)}</div>
    </div>
  );
}

function AccountSquare({ iggId, troops, selected, onClick }: { iggId: number; troops: TroopInfo[]; selected: boolean; onClick: () => void }) {
  const tierTotals: Record<number, number> = {};
  for (const t of troops) {
    if (t.count > 0) tierTotals[t.tier] = (tierTotals[t.tier] || 0) + t.count;
  }
  return (
    <div onClick={onClick} style={{
      padding: '10px 12px', borderRadius: 8, border: `2px solid ${selected ? colors.primary : colors.border}`,
      background: selected ? `${colors.primary}22` : '#0f172a', cursor: 'pointer', transition: 'all 0.15s', minWidth: 140,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: selected ? colors.primary : colors.text }}>{iggId}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {[5, 4, 3, 2, 1].map(t => tierTotals[t] ? (
          <span key={t} style={{ fontSize: 10, color: colors.textSecondary }}>T{t}:{formatNum(tierTotals[t])}</span>
        ) : null)}
      </div>
    </div>
  );
}

export default function WarDashboard({ socket, bots }: Props) {
  const [wars, setWars] = useState<WarEvent[]>([]);
  const [troopStates, setTroopStates] = useState<Map<number, TroopInfo[]>>(new Map());
  const [statusMsg, setStatusMsg] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [expandedSnapshot, setExpandedSnapshot] = useState<Group | null>(null);
  const requestedBotsRef = useRef('');
  const botsKey = [...bots].sort((a, b) => a - b).join(',');
  const [selectedAccounts, setSelectedAccounts] = useState<Set<number>>(new Set());
  const [tier, setTier] = useState(4);
  const [ratioInput, setRatioInput] = useState('');
  const [inf, setInf] = useState(0);
  const [art, setArt] = useState(0);
  const [cav, setCav] = useState(0);
  const [presets, setPresets] = useState<string[]>(loadPresets);
  const [presetName, setPresetName] = useState('');

  useEffect(() => {
    if (!socket) return;
    const onWars = (data: { iggId: number; wars: WarEvent[] }) => {
      setWars(prev => [...prev.filter(w => w.iggId !== data.iggId), ...data.wars]);
    };
    const onWarStatus = (data: { iggId: number; status: string }) => {
      setStatusMsg(`[IGG ${data.iggId}] ${data.status}`);
    };
    const onTroops = (data: { iggId: number; troopState: { troops: TroopInfo[] } }) => {
      setTroopStates(prev => { const next = new Map(prev); next.set(data.iggId, data.troopState.troops); return next; });
    };
    socket.on('wars', onWars);
    socket.on('warStatus', onWarStatus);
    socket.on('troops', onTroops);

    // Re-fetch on mount / cuando cambia el conjunto de cuentas (no en cada re-render)
    if (requestedBotsRef.current !== botsKey) {
      requestedBotsRef.current = botsKey;
      for (const id of bots) socket.emit('requestWarData', { iggId: id });
    }

    return () => { socket.off('wars', onWars); socket.off('warStatus', onWarStatus); socket.off('troops', onTroops); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, botsKey]);

  const activeWars = wars.filter(w => w.active && bots.includes(w.iggId));

  const groups = new Map<string, Group>();
  for (const w of activeWars) {
    const key = `${w.rallyLeader}|${w.coordX}|${w.coordY}|${w.type}|${w.side || ''}`;
    if (!groups.has(key)) groups.set(key, { wars: [], rallyLeader: w.rallyLeader, enemyName: w.enemyName, coordX: w.coordX, coordY: w.coordY, type: w.type, side: w.side, timeRemainingSec: w.timeRemainingSec, warTimestamp: w.warTimestamp, level: w.level, inMarch: w.inMarch, troopsCurrent: w.troopsCurrent, troopsMax: w.troopsMax });
    const g = groups.get(key)!;
    g.wars.push(w);
    if (w.inMarch) g.inMarch = true;
  }

  const liveGroup = expandedKey ? groups.get(expandedKey) || null : null;
  // Si el grupo abierto desaparece momentáneamente de los datos en vivo, se mantiene
  // en la lista con la última copia (snapshot) para que el panel no se cierre ni se
  // reinicie mientras se está configurando el envío.
  if (!liveGroup && expandedKey && expandedSnapshot) groups.set(expandedKey, expandedSnapshot);

  // Orden por timestamp de inicio (constante) para que las filas no salten con cada actualización
  const sortedGroups = [...groups.values()].sort((a, b) =>
    new Date(a.warTimestamp).getTime() - new Date(b.warTimestamp).getTime() || groupKey(a).localeCompare(groupKey(b))
  );
  const expandedGroup = expandedKey ? sortedGroups.find(g => groupKey(g) === expandedKey) || null : null;

  const liveSig = liveGroup ? `${groupKey(liveGroup)}|${liveGroup.wars.map(w => w.iggId).sort((a, b) => a - b).join(',')}` : '';
  useEffect(() => {
    if (liveSig && liveGroup) setExpandedSnapshot(liveGroup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSig]);

  const getTierTroops = useCallback((iggId: number, t: number) => {
    const troops = troopStates.get(iggId) || [];
    const r = { infantry: 0, artillery: 0, cavalry: 0 };
    for (const tr of troops) {
      if (tr.tier !== t || tr.count === 0) continue;
      if (tr.type === 0) r.infantry += tr.count;
      else if (tr.type === 1) r.artillery += tr.count;
      else if (tr.type === 2) r.cavalry += tr.count;
    }
    return r;
  }, [troopStates]);

  const getTierAvail = useCallback((t: number) => {
    const r = { infantry: 0, artillery: 0, cavalry: 0 };
    for (const id of selectedAccounts) {
      const tr = getTierTroops(id, t);
      r.infantry += tr.infantry;
      r.artillery += tr.artillery;
      r.cavalry += tr.cavalry;
    }
    return r;
  }, [selectedAccounts, getTierTroops]);

  const avail = getTierAvail(tier);

  // Si el disponible baja (dato nuevo de tropas), recorta lo ya escrito
  useEffect(() => {
    setInf(v => Math.min(v, fieldMax(avail.infantry)));
    setArt(v => Math.min(v, fieldMax(avail.artillery)));
    setCav(v => Math.min(v, fieldMax(avail.cavalry)));
  }, [avail.infantry, avail.artillery, avail.cavalry]);

  const total = inf + art + cav;
  // `total` ya es la cantidad que CADA cuenta envía (tope 200k por cuenta),
  // no un acumulado de todas las cuentas.
  const perAccount = total;

  const applyRatio = (input: string) => {
    setRatioInput(input);
    const r = parseRatio(input);
    if (r) { setInf(r.inf); setArt(r.art); setCav(r.cav); }
  };

  const constrainAndUpdate = (changed: 'inf' | 'art' | 'cav', newVal: number) => {
    const curr = { inf, art, cav };
    curr[changed] = newVal;
    const otherKeys = (['inf', 'art', 'cav'] as const).filter(k => k !== changed);
    const otherTotal = curr[otherKeys[0]] + curr[otherKeys[1]];
    const maxOther = TROOPS_PER_ACCOUNT - newVal;
    if (maxOther <= 0) {
      curr[otherKeys[0]] = 0;
      curr[otherKeys[1]] = 0;
    } else if (otherTotal > maxOther && otherTotal > 0) {
      const scale = maxOther / otherTotal;
      curr[otherKeys[0]] = Math.round(curr[otherKeys[0]] * scale);
      curr[otherKeys[1]] = maxOther - curr[otherKeys[0]];
    }
    const t = curr.inf + curr.art + curr.cav;
    if (t > TROOPS_PER_ACCOUNT) {
      const scale = TROOPS_PER_ACCOUNT / t;
      const inf2 = Math.round(curr.inf * scale);
      const art2 = Math.round(curr.art * scale);
      curr.inf = inf2;
      curr.art = art2;
      curr.cav = TROOPS_PER_ACCOUNT - inf2 - art2;
    }
    setInf(curr.inf);
    setArt(curr.art);
    setCav(curr.cav);
  };

  const savePreset = () => {
    const val = ratioInput.trim();
    if (!val) return;
    const next = [...new Set([...presets, val])];
    setPresets(next);
    savePresets(next);
    setPresetName('');
  };

  const removePreset = (p: string) => { const next = presets.filter(x => x !== p); setPresets(next); savePresets(next); };

  const expandGroup = (g: Group) => {
    const key = groupKey(g);
    if (expandedKey === key) {
      setExpandedKey(null);
      setExpandedSnapshot(null);
    } else {
      setExpandedKey(key);
      setExpandedSnapshot(g);
      setSelectedAccounts(new Set(g.wars.map(w => w.iggId)));
      setTier(4); setRatioInput(''); setInf(0); setArt(0); setCav(0);
      for (const w of g.wars) socket.emit('requestTroops', { iggId: w.iggId });
    }
  };

  const collapseGroup = () => {
    if (expandedGroup) {
      for (const w of expandedGroup.wars) socket.emit('requestWarData', { iggId: w.iggId });
    }
    setExpandedKey(null);
    setExpandedSnapshot(null);
  };

  const sendToAll = () => {
    if (!expandedGroup || total === 0 || selectedAccounts.size === 0) return;
    for (const w of expandedGroup.wars) {
      if (!selectedAccounts.has(w.iggId)) continue;
      socket.emit('sendWarTroops', {
        iggId: w.iggId, warIndex: w.index, rallyLeader: w.rallyLeader, tier,
        infantry: inf > 0, artillery: art > 0, cavalry: cav > 0,
        infantryCount: inf, artilleryCount: art, cavalryCount: cav,
      });
    }
    const ids = expandedGroup.wars.map(w => w.iggId);
    setExpandedKey(null);
    setExpandedSnapshot(null);
    for (const id of ids) socket.emit('requestWarData', { iggId: id });
  };

  return (
    <div>
      {statusMsg && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.primary}`, borderRadius: 8, padding: 8, marginBottom: 16, fontSize: 13 }}>{statusMsg}</div>
      )}

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8 }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {expandedGroup ? (
              <>
                <button onClick={collapseGroup} style={{ background: 'none', border: 'none', color: colors.textSecondary, fontSize: 16, cursor: 'pointer', padding: 0 }}>&larr;</button>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{enemyLabel(expandedGroup)}</span>
                  <span style={{ fontSize: 12, color: colors.textSecondary, marginLeft: 8 }}>[{expandedGroup.coordX},{expandedGroup.coordY}]</span>
                  {enemyLabel(expandedGroup) !== expandedGroup.rallyLeader && (
                    <span style={{ fontSize: 12, color: colors.textSecondary, marginLeft: 8 }}>por {expandedGroup.rallyLeader}</span>
                  )}
                </div>
              </>
            ) : (
              <>
                <h3 style={{ margin: 0, fontSize: 14 }}>Agrupaciones Global</h3>
                {sortedGroups.length > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: '#fff',
                    background: colors.primary, borderRadius: 10,
                    padding: '1px 8px', minWidth: 20, textAlign: 'center',
                  }}>
                    {sortedGroups.length}
                  </span>
                )}
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: '#22c55e',
              animation: 'pulse 2s infinite',
            }} />
            <span style={{ fontSize: 11, color: colors.textSecondary }}>Monitoreando {bots.length} cuentas</span>
          </div>
        </div>

        {/* Content */}
        {sortedGroups.length === 0 ? (
          <div style={{ padding: '24px 16px', borderTop: `1px solid ${colors.border}`, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: colors.textSecondary }}>Sin guerras activas</div>
            <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4, opacity: 0.6 }}>Las agrupaciones aparecen aqui cuando se detectan</div>
          </div>
        ) : (
          <div>
            {sortedGroups.map((g) => {
              const key = groupKey(g);
              const isExpanded = expandedKey === key;
              return (
                <React.Fragment key={key}>
                  <div
                    onClick={() => (isExpanded ? collapseGroup() : expandGroup(g))}
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr 180px 1fr', alignItems: 'center', gap: 12,
                      padding: '14px 16px', borderBottom: `1px solid ${colors.border}`, cursor: 'pointer',
                      background: isExpanded ? `${colors.primary}0a` : 'transparent', transition: 'background 0.15s',
                    }}
                  >
                    {/* Izquierda: aliado que agrupa */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ fontSize: 10, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Agrupa</div>
                        {g.side && SIDE_LABEL[g.side] && (
                          <span style={{
                            fontSize: 9, fontWeight: 800, letterSpacing: 1,
                            padding: '1px 6px', borderRadius: 8,
                            background: `${SIDE_LABEL[g.side].color}22`,
                            color: SIDE_LABEL[g.side].color,
                          }}>
                            {SIDE_LABEL[g.side].text}
                          </span>
                        )}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.rallyLeader || '—'}</div>
                      {g.troopsCurrent !== undefined || g.troopsMax ? (
                        <div style={{ fontSize: 11, color: colors.textSecondary }}>
                          {g.troopsMax
                            ? `${formatNum(g.troopsCurrent || 0)} / ${formatNum(g.troopsMax)} tropas`
                            : `${formatNum(g.troopsCurrent || 0)} tropas`}
                        </div>
                      ) : null}
                      <div style={{ fontSize: 11, color: colors.textSecondary }}>
                        [{g.coordX},{g.coordY}] · {g.wars.length} cuenta{g.wars.length !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {/* Centro: VS + tiempo */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: colors.textSecondary, letterSpacing: 4 }}>VS</div>
                      <div style={{ width: '100%', marginTop: 4 }}>
                        <UrgencyBar warTimestamp={g.warTimestamp} timeRemainingSec={g.timeRemainingSec} />
                      </div>
                    </div>

                    {/* Derecha: enemigo (fortaleza / castillo / torre) */}
                    <div style={{ minWidth: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{TYPE_LABEL[g.type] || g.type}</div>
                      <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{enemyLabel(g)}</div>
                      {g.inMarch !== undefined && (
                        <span style={{
                          display: 'inline-block', fontSize: 10, fontWeight: 700, marginTop: 3,
                          padding: '1px 7px', borderRadius: 8,
                          background: g.inMarch ? '#22c55e22' : '#f59e0b22',
                          color: g.inMarch ? '#22c55e' : '#f59e0b',
                        }}>
                          {g.inMarch ? 'EN VIAJE' : 'EN ESPERA'}
                        </span>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ background: '#0c1322', borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}`, padding: '16px 20px' }}>

                            {/* Accounts */}
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Cuentas</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {g.wars.map(w => (
                                  <AccountSquare key={w.iggId} iggId={w.iggId} troops={troopStates.get(w.iggId) || []}
                                    selected={selectedAccounts.has(w.iggId)}
                                    onClick={() => { const next = new Set(selectedAccounts); if (next.has(w.iggId)) next.delete(w.iggId); else next.add(w.iggId); setSelectedAccounts(next); }} />
                                ))}
                              </div>
                            </div>

                            {/* Tier */}
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Tier</div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                {[5, 4, 3, 2, 1].map(t => (
                                  <TierSquare key={t} tier={t} count={
                                    Object.values(getTierAvail(t)).reduce((a, b) => a + b, 0)
                                  } active={tier === t} onClick={() => { setTier(t); setInf(0); setArt(0); setCav(0); setRatioInput(''); }} />
                                ))}
                              </div>
                              <div style={{ marginTop: 6, fontSize: 12, color: colors.textSecondary }}>
                                Disponible T{tier}: Inf {formatNum(avail.infantry)} · Art {formatNum(avail.artillery)} · Cab {formatNum(avail.cavalry)}
                              </div>
                            </div>

                            {/* Formation */}
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Formacion</div>
                              <input value={ratioInput} onChange={e => applyRatio(e.target.value)} placeholder="947"
                                style={{ width: '100%', padding: '10px', borderRadius: 8, border: `1px solid ${colors.border}`, background: '#0f172a', color: colors.text, fontSize: 18, fontWeight: 700, letterSpacing: 6, textAlign: 'center', marginBottom: 10, boxSizing: 'border-box' }} />
                              <div style={{ display: 'flex', gap: 12 }}>
                                {[
                                  { label: 'Inf', value: inf, max: fieldMax(avail.infantry), key: 'inf' as const },
                                  { label: 'Art', value: art, max: fieldMax(avail.artillery), key: 'art' as const },
                                  { label: 'Cab', value: cav, max: fieldMax(avail.cavalry), key: 'cav' as const },
                                ].map(f => (
                                  <div key={f.label} style={{ flex: 1 }}>
                                    <div style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span>{f.label}</span>
                                      <input
                                        type="number" min={0} max={f.max} value={Math.min(f.value, f.max)}
                                        onChange={e => {
                                          const n = parseInt(e.target.value, 10);
                                          constrainAndUpdate(f.key, Math.max(0, Math.min(f.max, Number.isNaN(n) ? 0 : n)));
                                        }}
                                        style={{
                                          width: 76, textAlign: 'right', padding: '2px 5px', fontSize: 12, fontWeight: 600,
                                          background: '#0f172a', border: `1px solid ${colors.border}`, borderRadius: 5,
                                          color: colors.text, boxSizing: 'border-box',
                                        }}
                                      />
                                    </div>
                                    <input type="range" min={0} max={f.max} value={Math.min(f.value, f.max)} onChange={e => constrainAndUpdate(f.key, parseInt(e.target.value))} style={{ width: '100%' }} />
                                  </div>
                                ))}
                              </div>
                              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                <span>Total: <strong>{total.toLocaleString()}</strong> / {TROOPS_PER_ACCOUNT.toLocaleString()} por cuenta</span>
                                <span style={{ color: colors.textSecondary }}>x{selectedAccounts.size} cuentas · {perAccount.toLocaleString()}/cuenta</span>
                              </div>
                            </div>

                            {/* Presets */}
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                {presets.map(p => (
                                  <span key={p} onClick={() => applyRatio(p)} style={{
                                    background: ratioInput === p ? colors.primary : '#1e293b', color: ratioInput === p ? '#fff' : colors.text,
                                    borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                  }}>
                                    {p} <span onClick={e => { e.stopPropagation(); removePreset(p); }} style={{ fontSize: 9, opacity: 0.5 }}>x</span>
                                  </span>
                                ))}
                                {presets.length === 0 && <span style={{ fontSize: 11, color: colors.textSecondary }}>Sin presets</span>}
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="Guardar como..."
                                  style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: `1px solid ${colors.border}`, background: '#0f172a', color: colors.text, fontSize: 12 }}
                                  onKeyDown={e => { if (e.key === 'Enter') { setRatioInput(presetName); savePreset(); } }} />
                                <button onClick={() => { setRatioInput(presetName || ratioInput); savePreset(); }} style={{ fontSize: 11, padding: '5px 10px' }}>Guardar</button>
                              </div>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button onClick={collapseGroup}>Cancelar</button>
                              <button className="primary" onClick={sendToAll} disabled={total === 0 || selectedAccounts.size === 0}>
                                Enviar ({formatNum(total)} x {selectedAccounts.size})
                              </button>
                            </div>

                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
