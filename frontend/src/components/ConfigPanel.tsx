import React, { useState, useEffect, useRef } from 'react';
import { MISSION_IDS } from '../data/extravagant-mission-ids';

const HERO_LIST: Record<number, string> = {
  1: 'Guardian',
  3: 'Sabio de Viento',
  4: 'Reina De La Nieve',
  5: 'Prima Donna',
  6: 'Incineradora',
  9: 'Arquera Letal',
  13: 'Rayo Escarlata',
  16: 'Tasgo Dinamita',
  17: 'Cuervo Nocturno',
  18: 'Matademonios',
  20: 'Escudero del Mar',
  23: 'Rastreadora',
  29: 'Caballera Rosa',
};

export function getDeep(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

export function setDeep(obj: any, path: string, value: any): any {
  const parts = path.split('.');
  const clone = { ...obj };
  let cur = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur[k] = { ...cur[k] };
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return clone;
}

const modifiedStyle: React.CSSProperties = { color: '#fbbf24', fontWeight: 600 };

function Toggle({ value, onChange, label, modified }: { value: boolean; onChange: (v: boolean) => void; label: string; modified?: boolean }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} style={{ accentColor: '#4ade80' }} />
      {modified && <span style={{ color: '#fbbf24' }}>●</span>}
      <span style={modified ? modifiedStyle : undefined}>{label}</span>
    </label>
  );
}

function NumInput({ value, onChange, label, suffix, modified }: { value: number; onChange: (v: number) => void; label: string; suffix?: string; modified?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ whiteSpace: 'nowrap', ...(modified ? modifiedStyle : {}) }}>{modified ? '● ' : ''}{label}:</span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: 120, padding: '2px 6px' }}
      />
      {suffix && <span style={{ color: '#888' }}>{suffix}</span>}
    </div>
  );
}

function TextInput({ value, onChange, label, modified }: { value: string; onChange: (v: string) => void; label: string; modified?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ whiteSpace: 'nowrap', ...(modified ? modifiedStyle : {}) }}>{modified ? '● ' : ''}{label}:</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: 160, padding: '2px 6px' }}
      />
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: '1px solid #333', borderRadius: 6, padding: 12,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#4ade80', marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

interface ConfigPanelProps {
  config: any;
  socket: any;
  iggId: number;
  colors: any;
  /** Cuando se pasa, guardar aplica SOLO los campos modificados
   *  (delta) a estas cuentas en vez de guardar la config completa. */
  applyTo?: number[];
}

export default function ConfigPanel({ config, socket, iggId, colors, applyTo }: ConfigPanelProps) {
  const [draft, setDraft] = useState<any>(config);
  const [saved, setSaved] = useState(false);
  const [changed, setChanged] = useState(false);
  const [changedPaths, setChangedPaths] = useState<Set<string>>(new Set());
  // Si hay cambios sin guardar, ignoramos los refrescos de config (ticks, tab,
  // configUpdated de otros clientes) para no pisar lo que está editando el usuario.
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (dirtyRef.current) return;
    setDraft(config);
    setChanged(false);
    setChangedPaths(new Set());
  }, [config]);

  const save = () => {
    if (applyTo && applyTo.length > 0) {
      let delta: any = {};
      for (const p of changedPaths) delta = setDeep(delta, p, getDeep(draft, p));
      if (Object.keys(delta).length === 0) return;
      for (const id of applyTo) socket.emit('saveConfig', { iggId: id, config: delta });
    } else {
      socket.emit('saveConfig', { iggId, config: draft });
    }
    dirtyRef.current = false;
    setSaved(true);
    setChanged(false);
    setChangedPaths(new Set());
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = () => {
    dirtyRef.current = false;
    setDraft(config);
    setChanged(false);
    setChangedPaths(new Set());
  };

  const touch = (path: string, v: any) => {
    dirtyRef.current = true;
    setDraft((d: any) => setDeep(d, path, v));
    setChanged(true);
    setChangedPaths(prev => {
      const next = new Set(prev);
      if (getDeep(config, path) !== v) next.add(path); else next.delete(path);
      return next;
    });
  };

  const set = (path: string) => ({
    value: getDeep(draft, path),
    modified: changedPaths.has(path),
    onChange: (v: any) => touch(path, v),
  });

  const bool = (path: string) => ({
    value: !!getDeep(draft, path),
    modified: changedPaths.has(path),
    onChange: (v: any) => touch(path, Boolean(v)),
  });

  return (
    <div style={{
      background: colors.surface, border: `1px solid ${colors.border}`,
      borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
      fontSize: 13, maxHeight: '70vh', overflowY: 'auto',
    }}>
      {applyTo && applyTo.length > 0 && (
        <div style={{
          background: '#10243a', border: `1px solid ${colors.primary}`,
          borderRadius: 6, padding: '8px 12px', fontSize: 13,
        }}>
          ⚙️ Modo global: se aplicarán <strong>{changedPaths.size}</strong> campo(s) modificado(s) a{' '}
          <strong>{applyTo.length}</strong> cuenta(s). El resto queda igual.
        </div>
      )}

      <Section title="General">
        <Toggle label="Inicio automático" {...bool('autoStart')} />
        <TextInput label="Reset diario" {...set('dailyResetTime')} />
        <NumInput label="Límite entrenamiento" {...set('limitTrain')} />
        <NumInput label="Reconexión (s)" {...set('reconnectTime')} />
        <Toggle label="Auto Ayuda" {...bool('sendHelp')} />
        <Toggle label="War Mode" {...bool('warMode')} />
        <NumInput label="Índice traje guerra" {...set('costumeWar')} />
        <NumInput label="Índice traje normal" {...set('costumeNormal')} />
      </Section>

      <Section title="Entrenamiento">
        <Toggle label="Activo" {...bool('train.enable')} />
        <TextInput label="Tipo" {...set('train.type')} />
        <NumInput label="Velocidad" {...set('train.velTrain')} />
        <NumInput label="Subsidios %" {...set('train.subsidiosPorcentaje')} />
      </Section>

      <Section title="Escudo">
        <Toggle label="Activo" {...bool('shield.enable')} />
        <TextInput label="Tipo" {...set('shield.type')} />
        <TextInput label="Repliegue" {...set('shield.redeployTime')} />
      </Section>

      <Section title="Regalo Diario">
        <Toggle label="Auto-reclamar" {...bool('giftDaily.autoreclaim')} />
        <NumInput label="Índice" {...set('giftDaily.index')} />
        <NumInput label="Próximo (unix)" {...set('giftDaily.next')} />
      </Section>

      <Section title="Caja Misteriosa">
        <Toggle label="Activo" {...bool('mysteryBox.enable')} />
      </Section>

      <Section title="Barco">
        <Toggle label="Intercambio" {...bool('ship.intercambio')} />
        <Toggle label="Reclamar" {...bool('ship.reclaim')} />
      </Section>

      <Section title="Forja">
        <Toggle label="Activo" {...bool('forgeGift.enable')} />
      </Section>

      <Section title="Cofre VIP">
        <Toggle label="Activo" {...bool('chestVip.enable')} />
      </Section>

      <Section title="Feria de Artefactos">
        <Toggle label="Activo" {...bool('artifactFair.enable')} />
      </Section>

      <Section title="Refinar Maná">
        <Toggle label="Activo" {...bool('refineMana.enable')} />
      </Section>

      <Section title="Cofre del Gremio">
        <Toggle label="Activo" {...bool('openGuildChest.enable')} />
      </Section>

      <Section title="Tesoro Eterno">
        <Toggle label="Activo" {...bool('eternalTreasure.enable')} />
      </Section>

      <Section title="Cámara del Tesoro">
        <Toggle label="Activo (reclamar/reinvertir)" {...bool('treasureChamber.enable')} />
      </Section>

      <Section title="Misiones">
        <Toggle label="Admin" {...bool('adminQuest.enable')} />
        <Toggle label="Gremio" {...bool('guildQuest.enable')} />
      </Section>

      <Section title="Límite de Recursos">
        <NumInput label="Trigo" {...set('resourceLimit.wheat')} />
        <NumInput label="Madera" {...set('resourceLimit.wood')} />
        <NumInput label="Piedra" {...set('resourceLimit.stone')} />
        <NumInput label="Mineral" {...set('resourceLimit.ore')} />
        <NumInput label="Oro" {...set('resourceLimit.gold')} />
      </Section>

      <Section title="Suministros">
        <Toggle label="Activo" {...bool('supply.enable')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ whiteSpace: 'nowrap', ...(changedPaths.has('supply.targetPlayer') ? modifiedStyle : {}) }}>
            {changedPaths.has('supply.targetPlayer') ? '● ' : ''}Jugador objetivo:
          </span>
          <input
            type="text"
            value={getDeep(draft, 'supply.targetPlayer') ?? ''}
            onChange={e => touch('supply.targetPlayer', e.target.value)}
            placeholder="Nombre del jugador"
            style={{ flex: 1, padding: '2px 6px' }}
          />
        </div>
        <NumInput label="Umbral" {...set('supply.threshold')} />
        <NumInput label="Límite caravanas" {...set('supply.caravanLimit')} />
        <div style={{ fontSize: 12, color: '#888' }}>
          La capacidad por caravana no es configurable: sale del stat "Capacidad de suministro +" de
          cada cuenta (Puesto Comercial + Bolsas más grandes).
        </div>
      </Section>

      <Section title="Coliseo">
        <Toggle label="Reclamar gemas automáticamente" {...bool('coliseum.reclaimGems')} />
        <Toggle label="Auto-atacar rivales" {...bool('coliseum.autoAttack')} />
        <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Héroes para pelear:</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[0, 1, 2, 3, 4].map(i => {
            const val = getDeep(draft, `coliseum.hero${i}`) || 0;
            return (
              <select
                key={i}
                value={val}
                onChange={e => touch(`coliseum.hero${i}`, Number(e.target.value))}
                style={{ padding: '4px 6px', fontSize: 12, background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 4 }}
              >
                <option value={0}>#{i + 1} — vacío</option>
                {Object.entries(HERO_LIST).map(([id, name]) => (
                  <option key={id} value={Number(id)}>#{i + 1} — {name}</option>
                ))}
              </select>
            );
          })}
        </div>
      </Section>

      <Section title="Barrido (Sweep)">
        <Toggle label="Activar barrido automático" {...bool('sweep.enable')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 13 }}>Payload hex:</span>
          <input
            type="text"
            value={getDeep(draft, 'sweep.payload') || ''}
            onChange={e => touch('sweep.payload', e.target.value)}
            placeholder="0202010001"
            style={{ width: 140, padding: '4px 8px', fontSize: 13, fontFamily: 'monospace', background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 4 }}
          />
        </div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
          Formato: tipo(01=x1,02=x10) etapa(01=Normal,02=Elite,03=Desafío) capítulo unknown
        </div>
      </Section>

      <Section title="Caza (monstruos 2488)">
        <Toggle label="Caza automática" {...bool('hunt.enable')} />
        <NumInput label="Cooldown entre golpes" {...set('hunt.cooldown')} suffix="s" />
        <NumInput label="Radio de escaneo del mapa" {...set('hunt.scanRadius')} suffix="tiles" />
        <Toggle label="Squad compartido (varios bots al mismo bicho)" {...bool('hunt.squad.enable')} />
        <NumInput label="Máx. bots por bicho" {...set('hunt.squad.max')} />
        <div style={{ fontSize: 12, color: '#888' }}>
          Los bots calculan cuántos golpes faltan por el HP restante y el daño medio: con el bicho
          casi muerto va 1 solo; con HP alto se reparten. Con squad apagado, cada bicho lo caza 1 bot
          y los demás van a otro.
        </div>
        <div style={{ fontSize: 13, color: '#888' }}>
          Por nivel: hex del 2488 <strong>sin</strong> la coord (va 3 bytes de coord al frente). Dos
          hex: el que se usa depende de contra qué es débil el bicho (Noceros = magia, Buen Apetito =
          físico). El costo de energía por golpe se calcula solo (base del nivel − ahorro de
          investigación).
        </div>
        {(getDeep(draft, 'hunt.levels') || []).map((lv: any, idx: number) => {
          const levels: any[] = getDeep(draft, 'hunt.levels') || [];
          const upd = (patch: any) => touch('hunt.levels', levels.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
          return (
            <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Nivel</span>
              <input
                type="number" value={lv.level ?? 0} onChange={e => upd({ level: Number(e.target.value) })}
                style={{ width: 56, padding: '2px 6px', background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 4 }}
              />
              <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Magia</span>
              <input
                type="text" value={lv.payloadHexMagia || lv.payloadHex || ''} onChange={e => upd({ payloadHexMagia: e.target.value })}
                placeholder="hex si el bicho es débil contra magia"
                style={{ flex: 1, minWidth: 180, padding: '2px 6px', fontSize: 12, fontFamily: 'monospace', background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 4 }}
              />
              <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Físico</span>
              <input
                type="text" value={lv.payloadHexFisico || lv.payloadHex || ''} onChange={e => upd({ payloadHexFisico: e.target.value })}
                placeholder="hex si el bicho es débil contra físico"
                style={{ flex: 1, minWidth: 180, padding: '2px 6px', fontSize: 12, fontFamily: 'monospace', background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 4 }}
              />
              <button
                onClick={() => touch('hunt.levels', levels.filter((_, i) => i !== idx))}
                style={{ padding: '2px 7px', cursor: 'pointer' }}
              >X</button>
            </div>
          );
        })}
        <button
          onClick={() => {
            const levels: any[] = getDeep(draft, 'hunt.levels') || [];
            touch('hunt.levels', [...levels, { level: (levels[levels.length - 1]?.level ?? 1) + 1, payloadHexMagia: '', payloadHexFisico: '' }]);
          }}
          style={{ padding: '4px 8px', cursor: 'pointer', alignSelf: 'flex-start' }}
        >
          + Agregar nivel
        </button>
      </Section>

      <Section title="Cartas de la Suerte">
        <Toggle label="Buscar cartas automáticamente" {...bool('luckyCards.enable')} />
        <NumInput label="Intervalo entre ciclos" {...set('luckyCards.intervalSec')} suffix="s" />
        <NumInput label="Cofres por ciclo" {...set('luckyCards.maxPerCycle')} />
        <div style={{ fontSize: 12, color: '#888' }}>
          Si hay cofres de Carta de la Suerte en el mapa, cada bot consulta el cofre (2202) y si
          todavía no lo reclamó manda la tropa a buscar la carta (9866). Una búsqueda por cuenta
          hasta que la tropa vuelve. Con 3 nueves en mano canjea solo (9864, p.ej. 999 gems) y deja
          de buscar cofres hasta el próximo evento.
        </div>
      </Section>

      <Section title="Misiones">
        <Toggle label="Auto-eliminar misiones no deseadas" {...bool('missions.autoEliminate')} />
        <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Misiones que quiero (se mantienen y notifican):</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(getDeep(draft, 'missions.wantedMissionIds') || []).map((id: number, idx: number) => (
            <div key={idx} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <select
                value={id}
                onChange={e => {
                  const newIds = [...(getDeep(draft, 'missions.wantedMissionIds') || [])];
                  newIds[idx] = Number(e.target.value);
                  touch('missions.wantedMissionIds', newIds);
                }}
                style={{ flex: 1, padding: '4px 6px', fontSize: 12, background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 4 }}
              >
                {Object.entries(MISSION_IDS).map(([missionId, name]) => (
                  <option key={missionId} value={missionId}>{name} (#{missionId})</option>
                ))}
              </select>
              <button
                onClick={() => {
                  const newIds = (getDeep(draft, 'missions.wantedMissionIds') || []).filter((_: number, i: number) => i !== idx);
                  touch('missions.wantedMissionIds', newIds);
                }}
                style={{ padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}
              >
                X
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const current = getDeep(draft, 'missions.wantedMissionIds') || [];
              const availableIds = Object.keys(MISSION_IDS).map(Number).filter(id => !current.includes(id));
              if (availableIds.length > 0) {
                touch('missions.wantedMissionIds', [...current, availableIds[0]]);
              }
            }}
            style={{ padding: '4px 8px', fontSize: 12, cursor: 'pointer', alignSelf: 'flex-start' }}
          >
            + Agregar misión
          </button>
        </div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
          Las demás misiones se eliminan automáticamente (solo si están desbloqueadas)
        </div>
      </Section>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
        <button onClick={save} disabled={!changed} style={{ padding: '6px 18px', cursor: changed ? 'pointer' : 'not-allowed', opacity: changed ? 1 : 0.5 }}>
          {applyTo && applyTo.length > 0 ? 'Aplicar a seleccionados' : 'Guardar'}
        </button>
        <button onClick={reset} disabled={!changed} style={{ padding: '6px 14px', cursor: changed ? 'pointer' : 'not-allowed', opacity: changed ? 1 : 0.5 }}>
          Restablecer
        </button>
        {saved && <span style={{ color: '#4ade80' }}>✓ Aplicado</span>}
        {changed && !saved && <span style={{ color: '#fbbf24' }}>Hay cambios sin guardar</span>}
      </div>
    </div>
  );
}