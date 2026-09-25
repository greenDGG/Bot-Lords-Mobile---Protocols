import React, { useState, useEffect, useCallback } from 'react';
import { colors } from './Theme';

interface GameEvent {
  _id?: string;
  eventId: string;
  name: string;
  action: string;
  claimProto?: number;
  claimPayload?: string;
  cooldownSeconds: number;
  startAt: number;
  endAt: number;
  active: boolean;
}

const emptyForm = (): GameEvent => ({
  eventId: '',
  name: '',
  action: '',
  cooldownSeconds: 21600,
  startAt: 0,
  endAt: 0,
  active: true,
});

function toLocalInput(secs: number): string {
  if (!secs) return '';
  const d = new Date(secs * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : Math.floor(t / 1000);
}

export default function EventsManager({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<GameEvent>(emptyForm());
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/events');
      const data = await res.json();
      if (data.ok) setEvents(data.events || []);
    } catch (err: any) {
      setMsg({ ok: false, text: `Error cargando eventos: ${err.message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.eventId.trim()) { setMsg({ ok: false, text: 'Falta eventId' }); return; }
    if (!form.action.trim()) { setMsg({ ok: false, text: 'Falta la acción' }); return; }
    try {
      const res = await fetch('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        setMsg({ ok: true, text: editing ? 'Evento actualizado' : 'Evento agregado' });
        setForm(emptyForm());
        setEditing(null);
        load();
      } else {
        setMsg({ ok: false, text: data.error || 'Error guardando' });
      }
    } catch (err: any) {
      setMsg({ ok: false, text: `Error guardando: ${err.message}` });
    }
  };

  const remove = async (eventId: string) => {
    if (!window.confirm(`¿Eliminar evento "${eventId}"?`)) return;
    try {
      await fetch(`/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
      if (editing === eventId) { setForm(emptyForm()); setEditing(null); }
      load();
    } catch (err: any) {
      setMsg({ ok: false, text: `Error eliminando: ${err.message}` });
    }
  };

  const edit = (ev: GameEvent) => {
    setForm({ ...ev });
    setEditing(ev.eventId);
  };

  const input = (key: keyof GameEvent, type: 'text' | 'number' = 'text', placeholder?: string) => (
    <input
      type={type}
      placeholder={placeholder}
      value={String(form[key] ?? '')}
      onChange={(e) => setForm(prev => ({
        ...prev,
        [key]: type === 'number' ? parseInt(e.target.value, 10) || 0 : e.target.value,
      }))}
      style={{ width: '100%', background: '#000', color: '#fff', border: `1px solid ${colors.border}`, borderRadius: 4, padding: '4px 8px', fontSize: 13 }}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {msg && (
        <div style={{
          background: msg.ok ? '#1b5e20' : '#b71c1c', color: '#fff',
          padding: '8px 12px', borderRadius: 4, fontSize: 13,
        }}>
          {msg.text}
        </div>
      )}

      {/* Formulario agregar/editar */}
      <div style={{
        background: colors.surface, border: `1px solid ${colors.border}`,
        borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.primary }}>
          {editing ? `✏️ Editando: ${editing}` : '➕ Agregar evento'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
          <label style={{ color: colors.textSecondary, fontSize: 12 }}>eventId
            {input('eventId', 'text', 'ej: mi-evento')}
          </label>
          <label style={{ color: colors.textSecondary, fontSize: 12 }}>Nombre
            {input('name', 'text', 'ej: Evento de verano')}
          </label>
          <label style={{ color: colors.textSecondary, fontSize: 12 }}>Acción (nombre en código)
            {input('action', 'text', 'ej: caja-misteriosa')}
          </label>
          <label style={{ color: colors.textSecondary, fontSize: 12 }}>cooldown (segundos)
            {input('cooldownSeconds', 'number', '21600')}
          </label>
          <label style={{ color: colors.textSecondary, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={form.active} onChange={(e) => setForm(prev => ({ ...prev, active: e.target.checked }))} />
            Activo
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
          <label style={{ color: colors.textSecondary, fontSize: 12 }}>Inicio (vacío = sin ventana)
            <input
              type="datetime-local"
              value={toLocalInput(form.startAt)}
              onChange={(e) => setForm(prev => ({ ...prev, startAt: fromLocalInput(e.target.value) }))}
              style={{ width: '100%', background: '#000', color: '#fff', border: `1px solid ${colors.border}`, borderRadius: 4, padding: '4px 8px', fontSize: 13 }}
            />
          </label>
          <label style={{ color: colors.textSecondary, fontSize: 12 }}>Fin (vacío = sin ventana)
            <input
              type="datetime-local"
              value={toLocalInput(form.endAt)}
              onChange={(e) => setForm(prev => ({ ...prev, endAt: fromLocalInput(e.target.value) }))}
              style={{ width: '100%', background: '#000', color: '#fff', border: `1px solid ${colors.border}`, borderRadius: 4, padding: '4px 8px', fontSize: 13 }}
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="primary" onClick={save}>{editing ? 'Guardar cambios' : 'Agregar'}</button>
          {editing && <button onClick={() => { setForm(emptyForm()); setEditing(null); }}>Cancelar edición</button>}
        </div>
      </div>

      {/* Lista */}
      <div style={{
        background: colors.surface, border: `1px solid ${colors.border}`,
        borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 4 }}>
          📋 Eventos ({loading ? '...' : events.length})
        </div>
        {events.length === 0 && !loading && (
          <div style={{ color: colors.textSecondary, fontSize: 13, padding: '8px 0' }}>
            No hay eventos. Agregá el primero arriba.
          </div>
        )}
        {events.map(ev => (
          <div key={ev.eventId} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px',
            borderBottom: `1px solid ${colors.border}`, fontSize: 13,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: ev.active ? colors.success : colors.textSecondary,
            }} title={ev.active ? 'Activo' : 'Inactivo'} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: colors.text }}>
                {ev.name || ev.eventId}
                {!ev.active && <span style={{ color: colors.textSecondary, marginLeft: 6 }}>(inactivo)</span>}
              </div>
              <div style={{ color: colors.textSecondary, fontSize: 12 }}>
                acción {ev.action || 'sin acción'}
                {ev.claimProto ? ` · proto ${ev.claimProto}` : ''} · cd {Math.round((ev.cooldownSeconds || 0) / 3600)}h
                {ev.startAt || ev.endAt
                  ? ` · ${ev.startAt ? new Date(ev.startAt * 1000).toLocaleString() : 'ahora'} → ${ev.endAt ? new Date(ev.endAt * 1000).toLocaleString() : '∞'}`
                  : ''}
              </div>
            </span>
            <button onClick={() => edit(ev)}>✏️</button>
            <button className="danger" onClick={() => remove(ev.eventId)}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  );
}
