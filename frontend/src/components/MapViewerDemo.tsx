import React, { useRef, useEffect, useState, useCallback } from 'react';
import { colors } from './Theme';

// ── Mock tile data ──

type TileType = 'grass' | 'water' | 'road' | 'forest' | 'mountain' | 'resource' | 'monster' | 'castle' | 'guild';
type EntityType = 'npc' | 'player' | 'enemy' | 'resource_node' | 'monster_camp' | 'dark';

interface MockTile {
  x: number;
  y: number;
  type: TileType;
  entity?: {
    name: string;
    type: EntityType;
    level: number;
    owner?: string;
  };
}

function generateMockTiles(size: number): MockTile[] {
  const tiles: MockTile[] = [];
  for (let y = -size; y <= size; y++) {
    for (let x = -size; x <= size; x++) {
      const dist = Math.sqrt(x * x + y * y);
      let type: TileType = 'grass';
      if (dist < 3) type = 'water';
      else if (dist > 14) type = 'forest';
      else if (dist > 10 && dist < 12) { type = 'mountain'; }
      // roads along axes
      if ((Math.abs(x) < 2 && y === 0) || (Math.abs(y) < 2 && x === 0)) type = 'road';
      if (x === 0 && y === 0) type = 'castle';
      // random resource tiles
      if (type === 'grass' && Math.abs(x) % 3 === 0 && Math.abs(y) % 3 === 0 && (x !== 0 || y !== 0)) {
        type = 'resource';
      }
      // random monster camps
      if (type === 'grass' && Math.abs(x) % 5 === 0 && Math.abs(y) % 5 === 0 && Math.abs(x) > 4 && Math.abs(y) > 4) {
        type = 'monster';
      }
      // random guild towers
      if (type === 'grass' && Math.abs(x) === 7 && Math.abs(y) === 7) {
        type = 'guild';
      }
      tiles.push({ x, y, type });
    }
  }
  return tiles;
}

function buildEntity(x: number, y: number): MockTile['entity'] | undefined {
  if (x === 0 && y === 0) return { name: 'Mi Castillo', type: 'player', level: 25, owner: 'Player' };
  if (x === 7 && y === 7) return { name: 'Torre del Gremio', type: 'npc', level: 3, owner: 'Guild A' };
  if (x === -7 && y === -7) return { name: 'Torre del Gremio', type: 'npc', level: 2, owner: 'Guild B' };
  if (x === 3 && y === 0) return { name: 'Mina de Oro', type: 'resource_node', level: 6 };
  if (x === 0 && y === 3) return { name: 'Aserradero', type: 'resource_node', level: 5 };
  if (x === -3 && y === 0) return { name: 'Cantera', type: 'resource_node', level: 7 };
  if (x === 0 && y === -3) return { name: 'Granja', type: 'resource_node', level: 4 };
  if (x === 5 && y === 5) return { name: 'Monstruo Oscuro', type: 'monster_camp', level: 4 };
  if (x === -5 && y === -5) return { name: 'Jefe del Bosque', type: 'monster_camp', level: 3 };
  if (x === 5 && y === -3) return { name: 'Campamento Enemigo', type: 'enemy', level: 22, owner: 'Enemy123' };
  return undefined;
}

// Assign entities to specific tiles
function assignEntities(tiles: MockTile[]): MockTile[] {
  return tiles.map(t => {
    const entity = buildEntity(t.x, t.y);
    return entity ? { ...t, entity } : t;
  });
}

// ── Tile colors ──

const TILE_COLORS: Record<TileType, { fill: string; stroke: string; height: number }> = {
  grass:     { fill: '#2d5a27', stroke: '#3a7a32', height: 0 },
  water:     { fill: '#1a3d5c', stroke: '#2a5d8c', height: 0 },
  road:      { fill: '#6b5b4a', stroke: '#8b7b5a', height: 0 },
  forest:    { fill: '#1e4a1e', stroke: '#2d6a2d', height: 0 },
  mountain:  { fill: '#4a4a4a', stroke: '#6a6a6a', height: 12 },
  resource:  { fill: '#8a6a2a', stroke: '#aa8a3a', height: 0 },
  monster:   { fill: '#5a1a2a', stroke: '#8a2a3a', height: 0 },
  castle:    { fill: '#3a5a8a', stroke: '#5a8aba', height: 16 },
  guild:     { fill: '#5a3a8a', stroke: '#7a5aba', height: 10 },
};

// ── Palette de capas ──

const MAP_BG = '#0a0a12';
const PANEL_BG = '#12121c';

// ── Isometric rendering constants ──

const TILE_W = 64;
const TILE_H = 32;
const GRID_SIZE = 20;

// ── LOD / labels ──

const LABEL_MIN_ZOOM = 0.75;
const LABEL_PAD_X = 6;
const LABEL_PAD_Y = 2;
const LABEL_BG = 'rgba(10,10,20,0.75)';
const LABEL_RADIUS = 4;

interface Rect { x0: number; y0: number; x1: number; y1: number }

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── Convertir tiles reales (backend) a formato renderizable ──

interface RealTile {
  id: number;
  x: number;
  y: number;
  type?: number;
  name?: string;
  guild?: string;
  resource?: { type: number; level: number; amount: number };
  monster?: { level: number; id: string; hp: number };
  castle?: { kingdom: number; level: number; darkness: boolean; shield: boolean; skin: string };
  empty: boolean;
  rawData?: number[];
  text?: string;
  entityType?: number;
}

function realTileToRender(t: RealTile): MockTile {
  // Determinar tipo visual según el tipo real del tile
  let type: TileType = t.empty ? 'grass' : 'resource';
  let entity: MockTile['entity'];

  if (t.empty) {
    type = 'grass';
  } else if (t.type && t.type >= 1 && t.type <= 5) {
    // Veta de recurso (1=Trigo 2=Piedra 3=Mineral 4=Madera 5=Oro)
    type = 'resource';
    entity = { name: t.name || `Recurso ${t.type}`, type: 'resource_node', level: t.resource?.level || 0 };
  } else if (t.type === 8) {
    if (t.castle?.darkness) {
      // Nido de monstruo (Dark.nest)
      type = 'monster';
      entity = { name: t.name || 'Darkness', type: 'dark', level: t.castle.level };
    } else {
      // Castillo de jugador
      type = 'castle';
      entity = { name: t.name || 'Castillo', type: 'player', level: t.castle?.level || 0, owner: t.guild };
    }
  } else if (t.type === 10) {
    // Monstruo (0x0a): [coord][0a][nivel][id 6B][hp% float32 LE]
    type = 'monster';
    entity = { name: t.name || `Monstruo L${t.monster?.level ?? 0}`, type: 'monster_camp', level: t.monster?.level || 0 };
  } else if (t.type === 5) {
    // Monstruo con dueño
    type = 'monster';
    entity = { name: t.name || 'Monstruo', type: 'monster_camp', level: 0, owner: t.guild };
  } else if (t.type) {
    // Otros tipos de entidad
    type = 'resource';
    entity = { name: t.name || `Tipo ${t.type}`, type: 'npc', level: 0 };
  }

  return { x: t.x, y: t.y, type, entity };
}

// ── Prioridad de etiquetas (para colisión) ──

function labelPriority(tile: MockTile): number {
  const lv = tile.entity?.level || 0;
  switch (tile.type) {
    case 'castle': return 1000 + lv;
    case 'guild': return 900 + lv;
    case 'monster': return (tile.entity?.type === 'dark' ? 650 : 500) + lv;
    case 'resource': return 300 + lv;
    default: return 100;
  }
}

function entityGlyph(tile: MockTile): string {
  switch (tile.entity!.type) {
    case 'player': return '▲';
    case 'dark': return '☠';
    case 'monster_camp': return '⚔';
    case 'resource_node': return '◆';
    case 'npc': return '⬢';
    case 'enemy': return '✚';
  }
}

function drawLabel(ctx: CanvasRenderingContext2D, cand: {
  sx: number;
  baseline: number;
  rect: Rect;
  color: string;
  lv: number;
  text: string;
}, zoom: number) {
  const { sx, baseline, rect, color, lv, text } = cand;

  // Fondo semitransparente
  roundRectPath(ctx, rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0, LABEL_RADIUS);
  ctx.fillStyle = LABEL_BG;
  ctx.fill();

  // Texto
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, sx, baseline);

  // Píldora de nivel (pegada a la derecha del label)
  if (lv > 0) {
    const pillText = `Lv${lv}`;
    ctx.font = `bold ${Math.max(8, 10 * zoom)}px sans-serif`;
    const pw = ctx.measureText(pillText).width;
    const pillH = rect.y1 - rect.y0;
    const px = rect.x1 + 3;
    roundRectPath(ctx, px, rect.y0, pw + 12, pillH, LABEL_RADIUS);
    ctx.fillStyle = 'rgba(10,10,20,0.85)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(pillText, px + (pw + 12) / 2, rect.y0 + pillH / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }
}

// ── Marchas (proto 2220 variante march) ──

interface MapMarch {
  id: string;
  name: string;
  guild: string;
  origin: { x: number; y: number };
  destination: { x: number; y: number };
  startTime: number;
  duration: number;
  progress: number;
}

function worldToScreen(x: number, y: number, cx: number, cy: number, tw: number, th: number): { sx: number; sy: number } {
  return {
    sx: cx + (x - y) * tw / 2,
    sy: cy + (x + y) * th / 2,
  };
}

// ── Component ──

export default function MapViewerDemo({ tiles: realTiles = [], marches = [], onRequestRegion, home }: { tiles?: RealTile[]; marches?: MapMarch[]; onRequestRegion?: (x: number, y: number) => void; home?: { x: number; y: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [offsetStart, setOffsetStart] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null);
  const [selectedTile, setSelectedTile] = useState<MockTile | null>(null);
  const [searchX, setSearchX] = useState('');
  const [searchY, setSearchY] = useState('');
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const mockTiles = assignEntities(generateMockTiles(GRID_SIZE));
  const realRendered = realTiles.map(realTileToRender);
  const tiles: MockTile[] = realRendered.length > 0 ? realRendered : mockTiles;

  // ── Canvas drawing ──

  const screenToGrid = useCallback((sx: number, sy: number): { gx: number; gy: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = sx - rect.left - canvas.width / 2 - offset.x;
    const my = sy - rect.top - canvas.height / 2 - offset.y;
    const gx = Math.round((mx / (TILE_W * zoom / 2) + my / (TILE_H * zoom / 2)) / 2);
    const gy = Math.round((my / (TILE_H * zoom / 2) - mx / (TILE_W * zoom / 2)) / 2);
    return { gx, gy };
  }, [offset, zoom]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = MAP_BG;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2 + offset.x;
    const cy = h / 2 + offset.y;
    const tw = TILE_W * zoom;
    const th = TILE_H * zoom;

    // Sort tiles by depth (back to front)
    const sorted = [...tiles].sort((a, b) => (a.x + a.y) - (b.x + b.y));

    // ── Pass 1: tiles + íconos (sin texto) ──
    for (const tile of sorted) {
      const sx = cx + (tile.x - tile.y) * tw / 2;
      const sy = cy + (tile.x + tile.y) * th / 2;

      // Frustum culling
      if (sx < -tw || sx > w + tw || sy < -th * 3 || sy > h + th * 2) continue;

      const c = TILE_COLORS[tile.type];
      const hh = c.height * zoom;

      // Distinguir dark nest del resto del rombo rojo
      const isDark = tile.entity?.type === 'dark';
      const fillColor = isDark ? '#3d1d52' : c.fill;
      const strokeColor = isDark ? '#7a3a9a' : c.stroke;

      // ── Base diamond ──
      ctx.beginPath();
      ctx.moveTo(sx, sy - th / 2 - hh);
      ctx.lineTo(sx + tw / 2, sy - hh);
      ctx.lineTo(sx, sy + th / 2 - hh);
      ctx.lineTo(sx - tw / 2, sy - hh);
      ctx.closePath();

      // Height sides (left and right)
      if (hh > 0) {
        // Left side
        ctx.beginPath();
        ctx.moveTo(sx - tw / 2, sy - hh);
        ctx.lineTo(sx - tw / 2, sy);
        ctx.lineTo(sx, sy + th / 2);
        ctx.lineTo(sx, sy + th / 2 - hh);
        ctx.closePath();
        ctx.fillStyle = darken(fillColor, 30);
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Right side
        ctx.beginPath();
        ctx.moveTo(sx + tw / 2, sy - hh);
        ctx.lineTo(sx + tw / 2, sy);
        ctx.lineTo(sx, sy + th / 2);
        ctx.lineTo(sx, sy + th / 2 - hh);
        ctx.closePath();
        ctx.fillStyle = darken(fillColor, 20);
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Top face
      ctx.beginPath();
      ctx.moveTo(sx, sy - th / 2 - hh);
      ctx.lineTo(sx + tw / 2, sy - hh);
      ctx.lineTo(sx, sy + th / 2 - hh);
      ctx.lineTo(sx - tw / 2, sy - hh);
      ctx.closePath();

      // Hover/selection highlight
      if (selectedTile?.x === tile.x && selectedTile?.y === tile.y) {
        ctx.fillStyle = 'rgba(88, 166, 255, 0.4)';
      } else if (hoveredTile?.x === tile.x && hoveredTile?.y === tile.y) {
        ctx.fillStyle = 'rgba(88, 166, 255, 0.2)';
      } else {
        ctx.fillStyle = fillColor;
      }
      ctx.fill();
      ctx.strokeStyle = showGrid ? strokeColor : 'transparent';
      ctx.lineWidth = showGrid ? 0.5 : 0;
      ctx.stroke();

      // ── Entity icon (dot + glyph + glow por nivel) ──
      if (tile.entity) {
        const lv = tile.entity.level || 0;
        const iconSize = (8 + Math.min(lv, 30) / 30 * 5) * zoom;
        const iconY = sy - th / 2 - hh - iconSize - 2;
        const color = entityColor(tile.entity.type);

        // Glow para niveles altos (Lv20+)
        ctx.save();
        if (lv >= 20) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 10 * zoom;
        }
        ctx.beginPath();
        ctx.arc(sx, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();

        // Glyph en el centro del dot
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(7, 9 * zoom)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(entityGlyph(tile), sx, iconY + iconSize / 2 + 0.5);
      }

      // Overlays para tiles mock sin entidad
      if (tile.type === 'resource' && !tile.entity) {
        ctx.fillStyle = 'rgba(218, 165, 32, 0.6)';
        ctx.font = `bold ${Math.max(8, 10 * zoom)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('◆', sx, sy - th / 2 - hh - 4);
      }
      if (tile.type === 'monster' && !tile.entity) {
        ctx.fillStyle = 'rgba(248, 81, 73, 0.6)';
        ctx.font = `bold ${Math.max(10, 12 * zoom)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('⚔', sx, sy - th / 2 - hh - 4);
      }
    }

    // ── Marchas: línea origen→destino + marcador animado ──
    const nowSec = Math.floor(Date.now() / 1000);
    for (const m of marches) {
      const elapsed = nowSec - m.startTime;
      if (elapsed < 0 || elapsed > m.duration) continue;
      const p = m.duration > 0 ? elapsed / m.duration : 0;

      const a = worldToScreen(m.origin.x, m.origin.y, cx, cy, tw, th);
      const b = worldToScreen(m.destination.x, m.destination.y, cx, cy, tw, th);

      // Frustum culling rough
      if (Math.max(a.sx, b.sx) < -tw || Math.min(a.sx, b.sx) > w + tw) continue;
      if (Math.max(a.sy, b.sy) < -th * 3 || Math.min(a.sy, b.sy) > h + th * 2) continue;

      // Línea punteada
      ctx.save();
      ctx.strokeStyle = 'rgba(88, 166, 255, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy - 8);
      ctx.lineTo(b.sx, b.sy - 8);
      ctx.stroke();
      ctx.setLineDash([]);

      // Origen y destino (puntos)
      ctx.fillStyle = 'rgba(88, 166, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(a.sx, a.sy - 8, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(63, 185, 80, 0.9)';
      ctx.beginPath();
      ctx.arc(b.sx, b.sy - 8, 3, 0, Math.PI * 2);
      ctx.fill();

      // Marcador animado en el punto actual del progreso
      const mx = a.sx + (b.sx - a.sx) * p;
      const my = a.sy + (b.sy - a.sy) * p - 8;

      // Glow
      ctx.shadowColor = '#58a6ff';
      ctx.shadowBlur = 10 * zoom;
      ctx.fillStyle = '#58a6ff';
      ctx.beginPath();
      ctx.arc(mx, my, 5 * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Núcleo blanco
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(mx, my, 2 * zoom, 0, Math.PI * 2);
      ctx.fill();

      // Etiqueta del marchero
      if (zoom >= LABEL_MIN_ZOOM) {
        const label = m.guild ? `${m.name} [${m.guild}]` : m.name;
        const text = label.substring(0, 16);
        ctx.font = `${Math.max(9, 10 * zoom)}px sans-serif`;
        const textW = ctx.measureText(text).width;
        const baseline = my - 12;
        const rect: Rect = {
          x0: mx - textW / 2 - LABEL_PAD_X,
          x1: mx + textW / 2 + LABEL_PAD_X,
          y0: baseline - 14 - LABEL_PAD_Y,
          y1: baseline + LABEL_PAD_Y,
        };
        roundRectPath(ctx, rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0, LABEL_RADIUS);
        ctx.fillStyle = LABEL_BG;
        ctx.fill();
        ctx.fillStyle = '#58a6ff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(text, mx, baseline);
      }
      ctx.restore();
    }

    // ── Pass 2: labels con LOD + colisión ──
    if (zoom >= LABEL_MIN_ZOOM) {
      const labelFontSize = Math.max(9, 11 * zoom);
      ctx.font = `${labelFontSize}px sans-serif`;
      const candidates: {
        tile: MockTile;
        sx: number;
        baseline: number;
        rect: Rect;
        color: string;
        lv: number;
        text: string;
        forced: boolean;
        priority: number;
      }[] = [];

      for (const tile of sorted) {
        if (!tile.entity) continue;
        const sx = cx + (tile.x - tile.y) * tw / 2;
        const sy = cy + (tile.x + tile.y) * th / 2;
        if (sx < -tw || sx > w + tw || sy < -th * 3 || sy > h + th * 2) continue;
        const c = TILE_COLORS[tile.type];
        const hh = c.height * zoom;
        const lv = tile.entity.level || 0;
        const iconSize = (8 + Math.min(lv, 30) / 30 * 5) * zoom;
        const iconY = sy - th / 2 - hh - iconSize - 2;
        const text = tile.entity.name.substring(0, 14);
        const textW = ctx.measureText(text).width;
        const lineH = labelFontSize * 1.2;
        const baseline = iconY - 2;
        const rect: Rect = {
          x0: sx - textW / 2 - LABEL_PAD_X,
          x1: sx + textW / 2 + LABEL_PAD_X,
          y0: baseline - lineH - LABEL_PAD_Y,
          y1: baseline + LABEL_PAD_Y,
        };
        const isHovered = hoveredTile?.x === tile.x && hoveredTile?.y === tile.y;
        const isSelected = selectedTile?.x === tile.x && selectedTile?.y === tile.y;
        candidates.push({
          tile,
          sx,
          baseline,
          rect,
          color: entityColor(tile.entity.type),
          lv,
          text,
          forced: isHovered || isSelected,
          priority: labelPriority(tile),
        });
      }

      const nonForced = candidates.filter(c => !c.forced).sort((a, b) => b.priority - a.priority);
      const forced = candidates.filter(c => c.forced);
      const drawn: Rect[] = [];

      for (const cand of nonForced) {
        if (drawn.some(r => rectsOverlap(cand.rect, r))) continue;
        drawLabel(ctx, cand, zoom);
        drawn.push(cand.rect);
      }
      // Hover/selected siempre visibles por encima
      for (const cand of forced) {
        drawLabel(ctx, cand, zoom);
      }
    }

    // Crosshair at center
    ctx.strokeStyle = 'rgba(88, 166, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx, cy + 20);
    ctx.stroke();
    ctx.setLineDash([]);

    // Coordinates at center
    const centerTile = screenToGrid(document.body.clientWidth / 2, 100);
    if (centerTile) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`(${centerTile.gx}, ${centerTile.gy})`, cx, cy + 30);
    }

  }, [tiles, marches, offset, zoom, showGrid, hoveredTile, selectedTile, screenToGrid]);

  // ── Resize ──

  useEffect(() => {
    if (!mounted) return;
    const container = containerRef.current;
    if (!container) return;
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [mounted]);

  // ── Render loop (con tick para animar marchas) ──

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    if (marches.length === 0) return;
    const id = setInterval(draw, 1000 / 15);
    return () => clearInterval(id);
  }, [marches.length, draw]);

  // ── Mouse events ──

  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setOffsetStart({ ...offset });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setOffset({ x: offsetStart.x + dx, y: offsetStart.y + dy });
    } else {
      const grid = screenToGrid(e.clientX, e.clientY);
      if (grid) {
        setHoveredTile({ x: grid.gx, y: grid.gy });
      } else {
        setHoveredTile(null);
      }
    }
  };

  const onMouseUp = () => {
    setDragging(false);
  };

  const onClick = (e: React.MouseEvent) => {
    if (dragging) return;
    const grid = screenToGrid(e.clientX, e.clientY);
    if (!grid) return;
    const tile = tiles.find(t => t.x === grid.gx && t.y === grid.gy);
    setSelectedTile(tile || null);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.3, Math.min(4, z * factor)));
  };

  // ── Controls ──

  const centerMap = () => setOffset({ x: 0, y: 0 });

  const zoomIn = () => setZoom(z => Math.min(4, z * 1.2));
  const zoomOut = () => setZoom(z => Math.max(0.3, z / 1.2));

  const handleSearch = () => {
    const x = parseInt(searchX);
    const y = parseInt(searchY);
    if (isNaN(x) || isNaN(y)) return;
    const target = tiles.find(t => t.x === x && t.y === y);
    setSelectedTile(target || null);
    // Center on the coordinate
    const canvas = canvasRef.current;
    if (!canvas) return;
    const tw = TILE_W * zoom;
    const th = TILE_H * zoom;
    // Calculate offset to center this tile
    const targetSx = (x - y) * tw / 2;
    const targetSy = (x + y) * th / 2;
    setOffset({ x: -targetSx, y: -targetSy });
    // Pedir la región real del servidor (proto 2201) alrededor de esa coordenada
    if (onRequestRegion) onRequestRegion(x, y);
  };

  // ── Centrar automáticamente en el castillo (home) al cargar ──
  const centeredOnHome = useRef(false);
  useEffect(() => {
    if (!mounted || !home || centeredOnHome.current) return;
    centeredOnHome.current = true;
    const tw = TILE_W * zoom;
    const th = TILE_H * zoom;
    const targetSx = (home.x - home.y) * tw / 2;
    const targetSy = (home.x + home.y) * th / 2;
    setOffset({ x: -targetSx, y: -targetSy });
    if (onRequestRegion) onRequestRegion(home.x, home.y);
  }, [mounted, home, zoom, onRequestRegion]);

  if (!mounted) return null;

  // ── Compute center tile for inspector ──

  const inspectorTile = selectedTile || (hoveredTile ? tiles.find(t => t.x === hoveredTile.x && t.y === hoveredTile.y) : null);
  const centerTile = screenToGrid(window.innerWidth / 2, 300);

  return (
    <div style={{
      display: 'flex', gap: 12, height: 'calc(100vh - 200px)', minHeight: 500,
    }}>
      <style>{`
        .mv-badge { font-size: 12px; padding: 7px 10px; border-radius: 6px; font-family: monospace; }
        .mv-input { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; padding: 7px 10px; font-size: 12px; }
        .mv-input:focus { border-color: #58a6ff; outline: none; }
        .mv-btn { background: #21262d; border: 1px solid #30363d; color: #c9d1d9; padding: 7px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: all 0.15s ease; }
        .mv-btn:hover { background: #2d333b; border-color: #58a6ff; color: #58a6ff; }
        .mv-btn:active { transform: translateY(1px); }
        .mv-btn-primary { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 600; }
        .mv-btn-primary:hover { background: #388bfd; border-color: #388bfd; color: #fff; }
        .mv-ctrl { background: rgba(22,27,34,0.9); border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; cursor: pointer; transition: all 0.15s ease; }
        .mv-ctrl:hover { background: #21262d; border-color: #58a6ff; color: #58a6ff; }
        .mv-ctrl:active { transform: translateY(1px); }
      `}</style>

      {/* ── Map Canvas ── */}
      <div ref={containerRef} style={{
        flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 8,
        border: `1px solid ${colors.border}`, background: MAP_BG, cursor: dragging ? 'grabbing' : 'grab',
      }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={onClick}
        onWheel={onWheel}
      >
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

        {/* ── Controls overlay ── */}
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10 }}>
          <button className="mv-ctrl" style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }} onClick={zoomIn} title="Zoom +">+</button>
          <button className="mv-ctrl" style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }} onClick={zoomOut} title="Zoom -">−</button>
          <button className="mv-ctrl" style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }} onClick={centerMap} title="Centrar">⌖</button>
          <button
            className="mv-ctrl"
            style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, borderColor: showGrid ? colors.primary : undefined, color: showGrid ? colors.primary : undefined }}
            onClick={() => setShowGrid(!showGrid)} title="Cuadrícula"
          >▦</button>
        </div>

        {/* Zoom indicator */}
        <div style={{ position: 'absolute', bottom: 12, right: 12, fontSize: 11, color: colors.textSecondary, fontFamily: 'monospace', background: 'rgba(10,10,18,0.8)', padding: '3px 7px', borderRadius: 4 }}>
          {Math.round(zoom * 100)}%
        </div>

        {/* LOD hint */}
        {zoom < LABEL_MIN_ZOOM && (
          <div style={{ position: 'absolute', bottom: 12, left: 12, fontSize: 11, color: colors.textSecondary, background: 'rgba(10,10,18,0.8)', padding: '3px 7px', borderRadius: 4 }}>
            Acercá el mapa para ver etiquetas
          </div>
        )}
      </div>

      {/* ── Inspector Panel ── */}
      <div style={{
        width: 284, flexShrink: 0,
        background: PANEL_BG, border: `1px solid ${colors.border}`, borderRadius: 8,
        padding: 16, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13,
        overflowY: 'auto',
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.primary, paddingBottom: 10, borderBottom: `1px solid ${colors.border}` }}>🗺 Inspector de Mapa</div>

        {/* Source indicator */}
        <div
          className="mv-badge"
          style={{ marginTop: 10, background: realTiles.length > 0 ? 'rgba(63,185,80,0.12)' : 'rgba(255,255,255,0.04)', color: realTiles.length > 0 ? colors.success : colors.textSecondary }}
        >
          {realTiles.length > 0 ? `Datos reales: ${realTiles.length} tiles` : 'Mostrando datos de ejemplo (mock)'}
        </div>

        {/* Search */}
        <PanelSection title="Buscar coordenada" icon="🔍">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="mv-input" type="number" placeholder="X" value={searchX} onChange={e => setSearchX(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <input
              className="mv-input" type="number" placeholder="Y" value={searchY} onChange={e => setSearchY(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button className="mv-btn mv-btn-primary" onClick={handleSearch} style={{ flexShrink: 0 }}>Ir</button>
          </div>

          {inspectorTile && (
            <div style={{ marginTop: 8, fontSize: 12, color: colors.textSecondary, padding: '6px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 4, fontFamily: 'monospace' }}>
              Cursor: ({inspectorTile.x}, {inspectorTile.y})
            </div>
          )}
        </PanelSection>

        {/* Decodificador */}
        <PanelSection title="Decodificador de bytes" icon="🧩">
          <CoordDecoder />
        </PanelSection>

        {/* Selected tile info */}
        <PanelSection title="Tile seleccionado" icon="🎯">
          {selectedTile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <InfoRow label="Coordenada" value={`X: ${selectedTile.x}  Y: ${selectedTile.y}`} />
              <InfoRow label="Terreno" value={terrainName(selectedTile.type)} />
              <InfoRow label="Vacío" value={realTiles.some(t => t.x === selectedTile.x && t.y === selectedTile.y && t.empty) ? 'Sí' : 'No'} />
              {selectedTile.entity ? (
                <>
                  <InfoRow label="Entidad" value={selectedTile.entity.name} />
                  <InfoRow label="Tipo" value={entityTypeName(selectedTile.entity.type)} />
                  {selectedTile.entity.level > 0 && <InfoRow label="Nivel" value={`${selectedTile.entity.level}`} />}
                  {selectedTile.entity.owner && <InfoRow label="Dueño" value={selectedTile.entity.owner} />}
                </>
              ) : (
                <InfoRow label="Entidad" value="—" />
              )}
              <InfoRow label="Estado" value="Libre" />
              {(() => {
                const real = realTiles.find(t => t.x === selectedTile.x && t.y === selectedTile.y);
                if (!real) return null;
                return (
                  <>
                    {real.monster && (
                      <>
                        <InfoRow label="Monstruo ID" value={`0x${real.monster.id}`} />
                        <InfoRow label="HP" value={`${real.monster.hp.toFixed(1)}%`} />
                      </>
                    )}
                    {real.castle && (
                      <>
                        <InfoRow label="Reino" value={`${real.castle.kingdom}`} />
                        <InfoRow label="Fortaleza" value={`L${real.castle.level}`} />
                        <InfoRow label="Escudo" value={real.castle.shield ? 'Sí' : 'No'} />
                        <InfoRow label="Skin" value={`0x${real.castle.skin}`} />
                      </>
                    )}
                    <InfoRow label="ID hex" value={`0x${real.id.toString(16).padStart(6, '0')}`} />
                    {real.entityType !== undefined && <InfoRow label="Ent. type" value={`0x${real.entityType.toString(16).padStart(2, '0')}`} />}
                  </>
                );
              })()}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 10px', border: '1px dashed #30363d', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontSize: 26, opacity: 0.7 }}>🪄</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>Sin selección</div>
              <div style={{ fontSize: 11, color: colors.textSecondary, textAlign: 'center', lineHeight: 1.5 }}>
                Hacé clic en un tile del mapa para ver sus detalles, o usá la búsqueda de coordenadas.
              </div>
            </div>
          )}
        </PanelSection>

        {/* Legend */}
        <PanelSection title="Leyenda" icon="📖" collapsible>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
            <LegendItem color="#3a7a32" label="Bosque/Pradera" />
            <LegendItem color="#2a5d8c" label="Agua" />
            <LegendItem color="#8b7b5a" label="Camino" />
            <LegendItem color="#aa8a3a" label="Recurso" />
            <LegendItem color="#8a2a3a" label="Monstruo" />
            <LegendItem color="#7a3a9a" label="Dark nest" />
            <LegendItem color="#5a8aba" label="Castillo" />
            <LegendItem color="#7a5aba" label="Torre Gremio" />
          </div>
        </PanelSection>
      </div>
    </div>
  );
}

// ── Section wrapper ──

function PanelSection({ title, icon, children, collapsible = false }: { title: string; icon: string; children: React.ReactNode; collapsible?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ borderTop: `1px solid ${colors.border}`, padding: '12px 0 4px' }}>
      <div
        onClick={collapsible ? () => setOpen(o => !o) : undefined}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: collapsible ? 'pointer' : 'default', userSelect: 'none' }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: colors.text, letterSpacing: '0.4px', textTransform: 'uppercase' }}>{icon} {title}</span>
        {collapsible && <span style={{ color: colors.textSecondary, fontSize: 11 }}>{open ? '▾' : '▸'}</span>}
      </div>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}

// ── Helpers ──

function darken(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0xFF) - amount);
  const b = Math.max(0, (num & 0xFF) - amount);
  return `rgb(${r},${g},${b})`;
}

function entityColor(type: EntityType): string {
  switch (type) {
    case 'player': return '#3fb950';
    case 'enemy': return '#f85149';
    case 'monster_camp': return '#f85149';
    case 'dark': return '#c08cf0';
    case 'resource_node': return '#d29922';
    case 'npc': return '#bc8cff';
  }
}

function terrainName(type: TileType): string {
  switch (type) {
    case 'grass': return 'Pradera';
    case 'water': return 'Agua';
    case 'road': return 'Camino';
    case 'forest': return 'Bosque';
    case 'mountain': return 'Montaña';
    case 'resource': return 'Recurso';
    case 'monster': return 'Campamento Monstruo';
    case 'castle': return 'Castillo';
    case 'guild': return 'Torre de Gremio';
  }
}

function entityTypeName(type: EntityType): string {
  switch (type) {
    case 'player': return 'Jugador';
    case 'enemy': return 'Enemigo';
    case 'monster_camp': return 'Campamento';
    case 'dark': return 'Dark nest';
    case 'resource_node': return 'Recurso Natural';
    case 'npc': return 'NPC';
  }
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8 }}>
      <span style={{ color: colors.textSecondary }}>{label}:</span>
      <span style={{ color: colors.text, fontFamily: 'monospace', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function CoordDecoder() {
  const [b0, setB0] = useState('');
  const [b1, setB1] = useState('');
  const [b2, setB2] = useState('');
  const [result, setResult] = useState<{ x: number; y: number; xi: number; yi: number; id: number } | null>(null);
  const [error, setError] = useState('');
  const [reverseX, setReverseX] = useState('');
  const [reverseY, setReverseY] = useState('');
  const [encoded, setEncoded] = useState('');

  const decode = () => {
    setError('');
    setResult(null);
    const v0 = parseInt(b0, 16);
    const v1 = parseInt(b1, 16);
    const v2 = parseInt(b2, 16);
    if (isNaN(v0) || isNaN(v1) || isNaN(v2)) { setError('Ingresá 3 valores hex válidos'); return; }
    if (v0 < 0 || v0 > 255 || v1 < 0 || v1 > 255 || v2 < 0 || v2 > 255) { setError('Cada byte debe ser 00-FF'); return; }
    const xiHigh = v0 & 0x0F;
    const xiLow = v2 & 0x0F;
    const yiLow = v2 >> 5;
    const yiMid = (v0 >> 4) & 0x0F;
    const yiHigh = v1;
    const xi = (xiHigh << 4) | xiLow;
    const yi = (yiHigh << 7) | (yiMid << 3) | yiLow;
    const id = (v0 << 16) | (v1 << 8) | v2;
    setResult({ x: xi * 2, y: yi * 2, xi, yi, id });
  };

  const encode = () => {
    const x = parseInt(reverseX);
    const y = parseInt(reverseY);
    if (isNaN(x) || isNaN(y)) { setEncoded('Coordenadas inválidas'); return; }
    const xi = Math.floor(x / 2);
    const yi = Math.floor(y / 2);
    const byte0 = (((yi >> 3) & 0x0F) << 4) | ((xi >> 4) & 0x0F);
    const byte1 = yi >> 7;
    const byte2 = ((yi & 0x07) << 5) | (xi & 0x0F);
    setEncoded(`${byte0.toString(16).padStart(2, '0')} ${byte1.toString(16).padStart(2, '0')} ${byte2.toString(16).padStart(2, '0')}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12 }}>
      {/* 3 bytes → coordenadas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ color: colors.textSecondary, fontSize: 11 }}>3 bytes → coordenadas:</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="mv-input" value={b0} onChange={e => setB0(e.target.value.toUpperCase().slice(0,2))} placeholder="B0" maxLength={2} style={{ width: 46, fontFamily: 'monospace', textAlign: 'center' }} />
          <input className="mv-input" value={b1} onChange={e => setB1(e.target.value.toUpperCase().slice(0,2))} placeholder="B1" maxLength={2} style={{ width: 46, fontFamily: 'monospace', textAlign: 'center' }} />
          <input className="mv-input" value={b2} onChange={e => setB2(e.target.value.toUpperCase().slice(0,2))} placeholder="B2" maxLength={2} style={{ width: 46, fontFamily: 'monospace', textAlign: 'center' }} />
          <button className="mv-btn" onClick={decode} style={{ flexShrink: 0 }}>→</button>
        </div>
        {error && <div style={{ color: colors.danger }}>{error}</div>}
        {result && (
          <div style={{ background: '#0d1117', padding: '6px 10px', borderRadius: 6, fontFamily: 'monospace', lineHeight: 1.6 }}>
            X=<span style={{ color: colors.success }}>{result.x}</span> Y=<span style={{ color: colors.success }}>{result.y}</span><br />
            xi={result.xi} yi={result.yi}<br />
            ID: <span style={{ color: colors.primary }}>{result.id.toString(16).padStart(6, '0')}</span>
          </div>
        )}
      </div>

      {/* Reverse: coordenadas → 3 bytes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ color: colors.textSecondary, fontSize: 11 }}>Coordenadas → 3 bytes:</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="mv-input" value={reverseX} onChange={e => setReverseX(e.target.value)} placeholder="X" type="number" style={{ width: 70 }} />
          <input className="mv-input" value={reverseY} onChange={e => setReverseY(e.target.value)} placeholder="Y" type="number" style={{ width: 70 }} />
          <button className="mv-btn" onClick={encode} style={{ flexShrink: 0 }}>→</button>
        </div>
        {encoded && (
          <div style={{ background: '#0d1117', padding: '6px 10px', borderRadius: 6, marginTop: 2, fontFamily: 'monospace', color: colors.primary }}>
            {encoded}
          </div>
        )}
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 12, height: 12, background: color, borderRadius: 2 }} />
      <span style={{ color: colors.textSecondary }}>{label}</span>
    </div>
  );
}
