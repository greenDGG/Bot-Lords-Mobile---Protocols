import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { colors } from './Theme';
import WarDashboard from './WarDashboard';
import LogViewer from './LogViewer';
import MapViewerDemo from './MapViewerDemo';
import { getItemsSync, getItemsData } from '../data/items';

interface PlayerInfo {
  playerName: string; level: number; power: number; kills: number; gems: number; vipExp: number; energy: number;
  castleX?: number; castleY?: number;
}

interface Resources {
  wheat: number; stone: number; wood: number; mineral: number; gold: number;
  wheatProd: number; stoneProd: number; woodProd: number; mineralProd: number; goldProd: number;
}

interface TroopTraining {
  troopType: number; tier: number; count: number; remainingSeconds: number;
}

interface Props {
  iggId: number;
  onBack: () => void;
}

export default function BotDetail({ iggId, onBack }: Props) {
  const { socket, connected } = useSocket();
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo | null>(null);
  const [resources, setResources] = useState<Resources | null>(null);
  const [troopTraining, setTroopTraining] = useState<TroopTraining | null>(null);
  const [localTrainingRemaining, setLocalTrainingRemaining] = useState(0);
  const [inventory, setInventory] = useState<{ itemId: number; amount: number }[]>([]);
  const [online, setOnline] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatMessages, setChatMessages] = useState<{ id: string; sender: string; guild: string; channel: string; text: string; self: boolean }[]>([]);
  const [activeTab, setActiveTab] = useState<'info' | 'resources' | 'wars' | 'logs' | 'chat' | 'config' | 'camara' | 'construcciones' | 'transmutacion' | 'cuartel' | 'lider' | 'enfermeria' | 'atalaya' | 'mapa' | 'coliseo' | 'misiones' | 'guildApps' | 'trajes'>('info');
  const [warNotif, setWarNotif] = useState(0);
  const [treasureChamber, setTreasureChamber] = useState<{ level: number; gems: number; startTime: number; durationType: number; endTime: number } | null>(null);
  const [troopState, setTroopState] = useState<{ troops: { type: number; tier: number; count: number }[] }>({ troops: [] });
  const [hospitalState, setHospitalState] = useState<{ troops: { type: number; tier: number; injured: number; healing: number }[]; finishTimestamp: number; totalHealingSeconds: number; isHealing: boolean; totalCost: { wheat: number; wood: number; stone: number; mineral: number; gold: number }; healingCost: { wheat: number; wood: number; stone: number; mineral: number; gold: number } } | null>(null);
  const [incomingMarches, setIncomingMarches] = useState<{ marchId: number; arrivalTimestamp: number; updated: boolean; marchType?: number; packet?: any }[]>([]);
  const [marchHistory, setMarchHistory] = useState<any[]>([]);
  const [mapTiles, setMapTiles] = useState<any[]>([]);
  const [mapMarches, setMapMarches] = useState<any[]>([]);
  const [buildingState, setBuildingState] = useState<{ buildings: { position: number; id: number; level: number }[] }>({ buildings: [] });
  const [essenceState, setEssenceState] = useState<{ slots: { index: number; essenceLevel: number; finishTimestamp: number; baseMinutes: number; isRunning: boolean; isEmpty: boolean }[]; autoStoreLevel: number } | null>(null);
  const [coliseum, setColiseum] = useState<{ rank: number; fightsDone: number; gems: number; rivals: { name: string; guildTag: string; heroId: number }[] } | null>(null);
  const [missions, setMissions] = useState<{ progress: number; activeMission: { missionId: number; name: string; timestamp: number; total: number; points: number; available: boolean } | null; missions: { missionId: number; name: string; timestamp: number; total: number; points: number; available: boolean }[] } | null>(null);
  const [missionRecords, setMissionRecords] = useState<{ header: any; records: { type: string; missionId?: number; level?: number; status?: number; timestamp?: number }[] } | null>(null);
  const [fdgExtension, setFdgExtension] = useState<{ activeMission: { missionId: number; level: number; remaining: number; endTimestamp: number; timeMinutes: number; startTimestamp: number; missionType: number; specialFlag: boolean } | null; mission200: { appearanceTimestamp: number; level: number; missionId: number; completed: number } | null; mission120: { appearanceTimestamp: number; level: number; missionId: number; completed: number } | null } | null>(null);
  const [isLeaderCaptured, setIsLeaderCaptured] = useState(false);
  const [isLeaderExecuted, setIsLeaderExecuted] = useState(false);
  const [leaderFreeRevivalAt, setLeaderFreeRevivalAt] = useState(0);
  const [leaderRemaining, setLeaderRemaining] = useState(0);
  const [captiveData, setCaptiveData] = useState<any>(null);
  const [guildApplications, setGuildApplications] = useState<{ userId: number; name: string; power: number; troopsKilled: number }[] | null>(null);
  const [costumes, setCostumes] = useState<{ id: number; grade: number; gemLevel1: number; gemLevel2: number; gemLevel3: number; stealthLevel1: number; gemId1: number; gemId2: number; gemId3: number; stealthId1: number; index: number; end: number; raw: string }[]>([]);
  const [equippedCostumes, setEquippedCostumes] = useState<{ id: number; grade: number; index: number }[]>([]);
  const [costumeDB, setCostumeDB] = useState<Record<number, { id: number; name: string; buffs: Record<number, { buffId: number; value: number }[]> }>>({});
  const [buffDefs, setBuffDefs] = useState<Record<number, { id: number; name: string; unit: string }>>({});
  const [localConstructions, setLocalConstructions] = useState<{ active: boolean; position: number; id: number; level: number; remaining: number }[]>([]);
  const [botConfig, setBotConfig] = useState<any>(null);
  const [chestDialog, setChestDialog] = useState<{ itemId: number; max: number } | null>(null);
  const [invFilter, setInvFilter] = useState<'todos' | 'unico' | 'recurso' | 'acelerar' | 'combate' | 'cofre'>('todos');
  const [chestQty, setChestQty] = useState(1);
  const [chestProgress, setChestProgress] = useState<{ opened: number; total: number; done: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());
  const logsEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [itemsReady, setItemsReady] = useState(!!getItemsSync());
  const [showSupplyDialog, setShowSupplyDialog] = useState(false);
  const [supplyTarget, setSupplyTarget] = useState('');
  const [supplySending, setSupplySending] = useState(false);
  const [supplyResult, setSupplyResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => { getItemsData().then(() => setItemsReady(true)); }, []);

  useEffect(() => {
    if (!connected) return;

    socket.emit('getBotData', { iggId });
    socket.emit('getConfigOffline', { iggId });

    const onBotData = (data: any) => {
      if (data.iggId !== iggId) return;
      setPlayerInfo(data.playerInfo);
      setResources(data.resources);
      setTroopTraining(data.troopTraining);
      if (data.troopTraining) setLocalTrainingRemaining(data.troopTraining.remainingSeconds);
      setInventory(data.inventory || []);
      setTreasureChamber(data.treasureChamber || null);
      if (data.buildingState) setBuildingState(data.buildingState);
      if (data.constructions) updateConstructions(data.constructions);
      if (data.essenceState) setEssenceState(data.essenceState);
      if (data.coliseum) setColiseum(data.coliseum);
      if (data.missions) setMissions(data.missions);
      if (data.missionRecords) setMissionRecords(data.missionRecords);
      if (data.fdgExtension) setFdgExtension(data.fdgExtension);
      if (data.troopState) setTroopState(data.troopState);
      if (data.hospitalState !== undefined) setHospitalState(data.hospitalState);
      if (data.incomingMarches !== undefined) setIncomingMarches(data.incomingMarches);
      if (data.marchHistory !== undefined) setMarchHistory(data.marchHistory);
      if (data.mapTiles !== undefined) setMapTiles(data.mapTiles);
      if (data.mapMarches !== undefined) setMapMarches(data.mapMarches || []);
      if (data.chatMessages !== undefined) {
        setChatMessages(data.chatMessages.map((m: any) => ({ id: `in-${m.msgId}-${m.ts}`, sender: m.senderName || `Jugador ${m.senderId}`, guild: m.senderGuild || '', channel: m.channelLabel || '', text: m.message || '', self: false })));
      }
      if (data.isLeaderCaptured !== undefined) setIsLeaderCaptured(data.isLeaderCaptured);
      if (data.isLeaderExecuted !== undefined) setIsLeaderExecuted(data.isLeaderExecuted);
      if (data.leaderFreeRevivalAt !== undefined) setLeaderFreeRevivalAt(data.leaderFreeRevivalAt);
      if (data.captiveData !== undefined) setCaptiveData(data.captiveData);
      if (data.config) setBotConfig(data.config);
      if (data.guildApplications !== undefined) setGuildApplications(data.guildApplications?.applications || null);
      if (data.costumes !== undefined) setCostumes(data.costumes || []);
      if (data.equippedCostumes !== undefined) setEquippedCostumes(data.equippedCostumes || []);
      if (data.costumeDB) setCostumeDB(data.costumeDB);
      if (data.buffDefs) setBuffDefs(data.buffDefs);
      setOnline(data.online);
      if (data.logs) setLogs(data.logs);
    };
    const onLog = (data: { iggId: number; msg: string }) => {
      if (data.iggId !== iggId) return;
      setLogs(prev => [...prev.slice(-199), data.msg]);
    };
    const onStatusChanged = (data: { iggId: number; online: boolean }) => {
      if (data.iggId !== iggId) return;
      setOnline(data.online);
    };
    const onPlayerInfo = (data: any) => {
      if (data.iggId !== iggId) return;
      setPlayerInfo(data.info);
    };
    const onResources = (data: any) => {
      if (data.iggId !== iggId) return;
      setResources(data.resources);
    };
    const onTroopTraining = (data: any) => {
      if (data.iggId !== iggId) return;
      setTroopTraining(data.training);
      if (data.training) setLocalTrainingRemaining(data.training.remainingSeconds);
    };
    const onInventory = (data: any) => {
      if (data.iggId !== iggId) return;
      setInventory(data.inventory);
    };
    const onWarNotif = (data: { iggId: number; count: number }) => {
      if (data.iggId !== iggId) return;
      setWarNotif(data.count);
      if (activeTab === 'wars') socket.emit('requestWarData', { iggId });
    };

    socket.on('botData', onBotData);
    socket.on('log', onLog);
    socket.on('statusChanged', onStatusChanged);
    socket.on('playerInfo', onPlayerInfo);
    socket.on('resources', onResources);
    socket.on('troopTraining', onTroopTraining);
    socket.on('inventory', onInventory);
    socket.on('warNotification', onWarNotif);
    socket.on('buildingState', (data: { iggId: number; buildingState: any }) => {
      if (data.iggId !== iggId) return;
      if (data.buildingState) setBuildingState(data.buildingState);
    });
    socket.on('constructions', (data: { iggId: number; constructions: any }) => {
      if (data.iggId !== iggId) return;
      if (data.constructions) updateConstructions(data.constructions);
    });
    socket.on('essence', (data: { iggId: number; essenceState: any }) => {
      if (data.iggId !== iggId) return;
      if (data.essenceState) setEssenceState(data.essenceState);
    });
    socket.on('coliseum', (data: { iggId: number; state: any }) => {
      if (data.iggId !== iggId) return;
      setColiseum(data.state || null);
    });
    socket.on('missions', (data: { iggId: number; missions: any }) => {
      if (data.iggId !== iggId) return;
      setMissions(data.missions || null);
    });
    socket.on('missionRecords', (data: { iggId: number; missionRecords: any }) => {
      if (data.iggId !== iggId) return;
      setMissionRecords(data.missionRecords || null);
    });
    socket.on('fdgExtension', (data: { iggId: number; fdgExtension: any }) => {
      if (data.iggId !== iggId) return;
      setFdgExtension(data.fdgExtension || null);
    });
    socket.on('troops', (data: { iggId: number; troopState: any }) => {
      if (data.iggId !== iggId) return;
      if (data.troopState) setTroopState(data.troopState);
    });
    socket.on('hospitalState', (data: { iggId: number; hospitalState: any }) => {
      if (data.iggId !== iggId) return;
      setHospitalState(data.hospitalState || null);
    });
    socket.on('incomingMarches', (data: { iggId: number; marches: any[] }) => {
      if (data.iggId !== iggId) return;
      setIncomingMarches(data.marches || []);
    });
    socket.on('configUpdated', (data: { iggId: number; config: any }) => {
      if (data.iggId !== iggId) return;
      setBotConfig(data.config);
    });
    socket.on('configData', (data: { iggId: number; config: any; online?: boolean }) => {
      if (data.iggId !== iggId) return;
      if (!data.online && data.config) setBotConfig(data.config);
    });
    socket.on('mapDataUpdated', (data: { iggId: number; mapTiles: any[]; mapMarches?: any[] }) => {
      if (data.iggId !== iggId) return;
      setMapTiles(data.mapTiles || []);
      if (data.mapMarches !== undefined) setMapMarches(data.mapMarches);
    });
    socket.on('chatMessage', (data: { iggId: number; message: any }) => {
      if (data.iggId !== iggId) return;
      const m = data.message;
      if (!m) return;
      setChatMessages(prev => {
        if (prev.some(p => p.id === `in-${m.msgId}-${m.ts}`)) return prev;
        return [...prev.slice(-199), { id: `in-${m.msgId}-${m.ts}`, sender: m.senderName || `Jugador ${m.senderId}`, guild: m.senderGuild || '', channel: m.channelLabel || '', text: m.message, self: false }];
      });
    });
    socket.on('chatHistory', (data: { iggId: number; messages: any[] }) => {
      if (data.iggId !== iggId) return;
      setChatMessages((data.messages || []).map((m: any) => ({ id: `in-${m.msgId}-${m.ts}`, sender: m.senderName || `Jugador ${m.senderId}`, guild: m.senderGuild || '', channel: m.channelLabel || '', text: m.message || '', self: false })));
    });
    socket.on('leaderState', (data: { iggId: number; isCaptured: boolean; isExecuted: boolean; freeRevivalAt: number; captiveData: any }) => {
      if (data.iggId !== iggId) return;
      setIsLeaderCaptured(data.isCaptured);
      setIsLeaderExecuted(data.isExecuted);
      setLeaderFreeRevivalAt(data.freeRevivalAt || 0);
      setCaptiveData(data.captiveData || null);
    });
    socket.on('guildApplications', (data: { iggId: number; applications: { userId: number; name: string; power: number; troopsKilled: number }[] }) => {
      if (data.iggId !== iggId) return;
      setGuildApplications(data.applications || null);
    });
    socket.on('costumes', (data: { iggId: number; costumes: any[] }) => {
      if (data.iggId !== iggId) return;
      setCostumes(data.costumes || []);
    });
    socket.on('equippedCostumes', (data: { iggId: number; equippedCostumes: any[] }) => {
      if (data.iggId !== iggId) return;
      setEquippedCostumes(data.equippedCostumes || []);
    });

    const onChestProgress = (data: { iggId: number; opened: number; total: number; done: boolean }) => {
      if (data.iggId !== iggId) return;
      setChestProgress({ opened: data.opened, total: data.total, done: data.done });
      if (data.done) setChestDialog(null);
    };
    socket.on('chestProgress', onChestProgress);

    const onSupplyResult = (data: { iggId: number; ok: boolean; message: string }) => {
      if (data.iggId !== iggId) return;
      setSupplySending(false);
      setSupplyResult({ ok: data.ok, message: data.message });
      setTimeout(() => setSupplyResult(null), 5000);
    };
    socket.on('supplyResult', onSupplyResult);

    return () => {
      socket.off('botData', onBotData);
      socket.off('log', onLog);
      socket.off('statusChanged', onStatusChanged);
      socket.off('playerInfo', onPlayerInfo);
      socket.off('resources', onResources);
      socket.off('troopTraining', onTroopTraining);
      socket.off('inventory', onInventory);
      socket.off('warNotification', onWarNotif);
      socket.off('chestProgress', onChestProgress);
      socket.off('supplyResult', onSupplyResult);
      socket.off('buildingState');
      socket.off('constructions');
      socket.off('essence');
      socket.off('coliseum');
      socket.off('missions');
      socket.off('missionRecords');
      socket.off('fdgExtension');
      socket.off('troops');
      socket.off('hospitalState');
      socket.off('incomingMarches');
      socket.off('leaderState');
      socket.off('guildApplications');
      socket.off('configUpdated');
      socket.off('configData');
      socket.off('mapDataUpdated');
      socket.off('chatMessage');
    };
  }, [connected, socket, iggId, activeTab]);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);
  useEffect(() => {
    const tick = () => setLeaderRemaining(Math.max(0, leaderFreeRevivalAt - Math.floor(Date.now() / 1000)));
    tick();
    if (!isLeaderExecuted || leaderFreeRevivalAt <= 0) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isLeaderExecuted, leaderFreeRevivalAt]);

  const sendChat = () => {
    if (!chatText.trim()) return;
    const msg = chatText.trim();
    setChatMessages(prev => [...prev, { id: `self-${Date.now()}`, sender: 'Yo', guild: '', channel: 'saliente', text: msg, self: true }]);
    socket.emit('sendCommand', { iggId, command: `chat ${msg}` });
    setChatText('');
  };

  const sendCommand = (cmd: string) => {
    socket.emit('sendCommand', { iggId, command: cmd });
  };

  const updateConstructions = (data: { constructions: { active: boolean; position: number; id: number; level: number; remainingSeconds: number }[] }) => {
    setLocalConstructions(data.constructions.filter(c => c.active).map(c => ({
      active: true,
      position: c.position,
      id: c.id,
      level: c.level,
      remaining: c.remainingSeconds,
    })));
  };

  // countdown tick
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
      setLocalConstructions(prev => {
        const next = prev.map(c => ({ ...c, remaining: Math.max(0, c.remaining - 1) }));
        return next;
      });
      setLocalTrainingRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (s: number) => {
    if (s <= 0) return '0s';
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    let r = '';
    if (d > 0) r += `${d}d `;
    if (h > 0 || d > 0) r += `${h}h `;
    if (m > 0 || h > 0 || d > 0) r += `${m}m `;
    r += `${sec}s`;
    return r;
  };

  const formatRes = (v: number) => {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toString();
  };

  const getCostumeName = (id: number) => costumeDB[id]?.name || `Traje ${id}`;
  const getCostumeBuffs = (id: number, grade: number) => {
    const def = costumeDB[id];
    if (!def) return [];
    const gradeBuffs = def.buffs[grade];
    if (!gradeBuffs) return [];
    return gradeBuffs.map(b => {
      const bd = buffDefs[b.buffId];
      return { name: bd?.name || `Buff ${b.buffId}`, value: b.value, unit: bd?.unit || '' };
    });
  };

  // (imported from data/items.json via module-level constants)

  const itemData = itemsReady ? getItemsSync() : null;
  const ITEMS_DB_LOCAL: Record<number, { name: string; gems: number }> = {};
  const ITEM_VALUES_LOCAL: Record<number, number> = {};
  const RESOURCE_ITEM_IDS_LOCAL: Record<string, number[]> = {};
  if (itemData) {
    for (const [k, v] of Object.entries(itemData.ITEMS_DB)) ITEMS_DB_LOCAL[Number(k)] = v as { name: string; gems: number };
    for (const [k, v] of Object.entries(itemData.ITEM_VALUES)) ITEM_VALUES_LOCAL[Number(k)] = v as number;
    for (const [k, v] of Object.entries(itemData.RESOURCE_ITEM_IDS)) RESOURCE_ITEM_IDS_LOCAL[k] = v as number[];
  }

  const computeBagTotal = (itemIds: number[]) => {
    let total = 0;
    for (const item of inventory) {
      const value = ITEM_VALUES_LOCAL[item.itemId];
      if (value && itemIds.includes(item.itemId)) {
        total += item.amount * value;
      }
    }
    return total;
  };

  const tabs = [
    { key: 'info' as const, label: 'Info' },
    { key: 'resources' as const, label: 'Recursos' },
    { key: 'wars' as const, label: 'Agrupaciones' },
    { key: 'logs' as const, label: 'Logs' },
    { key: 'chat' as const, label: 'Chat' },
    { key: 'config' as const, label: 'Config' },
    { key: 'camara' as const, label: 'Cámara' },
    { key: 'construcciones' as const, label: 'Construcciones' },
    { key: 'transmutacion' as const, label: 'Transmutación' },
    { key: 'cuartel' as const, label: 'Cuartel' },
    { key: 'lider' as const, label: 'Líder' },
    { key: 'enfermeria' as const, label: 'Enfermería' },
    { key: 'atalaya' as const, label: 'Atalaya' },
    { key: 'mapa' as const, label: 'Mapa' },
    { key: 'coliseo' as const, label: 'Coliseo' },
    { key: 'misiones' as const, label: 'Misiones' },
    { key: 'guildApps' as const, label: 'Guild Apps' },
    { key: 'trajes' as const, label: 'Trajes' },
  ];

  return (
    <div style={{ padding: '20px', maxWidth: 1400, margin: '0 auto' }}>
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16, borderBottom: `1px solid ${colors.border}`, paddingBottom: 12,
      }}>
        <div>
          <button onClick={onBack} style={{ marginRight: 12 }}>← Volver</button>
          <span style={{ fontSize: 18, fontWeight: 600 }}>IGG {iggId}</span>
          <span style={{
            display: 'inline-block', marginLeft: 8, width: 10, height: 10,
            borderRadius: '50%', background: online ? colors.success : colors.danger,
          }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => sendCommand('help')}>Ayuda</button>
          <button onClick={() => sendCommand('shield')}>Escudo</button>
          <button onClick={() => { setSupplyTarget(botConfig?.supply?.targetPlayer || ''); setShowSupplyDialog(true); }}>Supply</button>
          <button onClick={() => sendCommand('disconnect')} className="danger">Desconectar</button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            className={activeTab === t.key ? 'primary' : ''}
            onClick={() => {
              if (activeTab === 'wars' && t.key !== 'wars') socket.emit('setWarViewing', { iggId, viewing: false });
              setActiveTab(t.key);
              if (t.key === 'wars') { setWarNotif(0); socket.emit('setWarViewing', { iggId, viewing: true }); socket.emit('requestWarData', { iggId }); }
              if (t.key === 'mapa') { socket.emit('requestMapData', { iggId }); }
            }}
            style={{ position: 'relative' }}
          >
            {t.label}
            {t.key === 'wars' && warNotif > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -6,
                background: colors.danger, color: '#fff', fontSize: 10,
                borderRadius: 10, padding: '1px 5px', lineHeight: '14px',
                fontWeight: 700,
              }}>{warNotif}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'info' && playerInfo && (
        <div style={{
          background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: 8, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
        }}>
          <div><strong>Nombre:</strong> {playerInfo.playerName}</div>
          <div><strong>Nivel:</strong> {playerInfo.level}</div>
          <div><strong>Poder:</strong> {formatRes(playerInfo.power)}</div>
          <div><strong>Asesinatos:</strong> {formatRes(playerInfo.kills)}</div>
          <div><strong>Gemas:</strong> {playerInfo.gems}</div>
          <div><strong>VIP Exp:</strong> {playerInfo.vipExp}</div>
          <div><strong>Energía:</strong> {playerInfo.energy}</div>
          {playerInfo.castleX !== undefined && (
            <div><strong>Castillo:</strong> X={playerInfo.castleX} Y={playerInfo.castleY}</div>
          )}
          {equippedCostumes.length > 0 && (
            <div style={{ gridColumn: '1 / -1', marginTop: 8, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
              <strong>Traje Equipado ({equippedCostumes.length}):</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {equippedCostumes.map((c, i) => (
                  <div key={i} style={{
                    background: '#0d1117', border: `1px solid ${colors.border}`,
                    borderRadius: 6, padding: '6px 10px', fontSize: 12,
                  }}>
                    <div style={{ fontWeight: 600 }}>{getCostumeName(c.id)}</div>
                    <div style={{ color: colors.textSecondary, fontSize: 11 }}>
                      ID {c.id} · G{c.grade} · idx:0x{c.index.toString(16).toUpperCase().padStart(2, '0')}
                    </div>
                    {getCostumeBuffs(c.id, c.grade).length > 0 && (
                      <div style={{ marginTop: 4, fontSize: 11, color: colors.success }}>
                        {getCostumeBuffs(c.id, c.grade).map((b, j) => (
                          <span key={j}>{b.name} +{b.value}{b.unit} </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'info' && !playerInfo && (
        <div style={{ color: colors.textSecondary }}>Esperando datos del jugador...</div>
      )}

      {activeTab === 'resources' && resources && (
        <div style={{
          background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: 8, padding: 16,
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                <th style={{ textAlign: 'left', padding: 8 }}>Recurso</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Cantidad</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Prod/h</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Bolsa</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: '🌾 Trigo', key: 'wheat' as const, prodKey: 'wheatProd' as const },
                { name: '🪵 Madera', key: 'wood' as const, prodKey: 'woodProd' as const },
                { name: '🪨 Piedra', key: 'stone' as const, prodKey: 'stoneProd' as const },
                { name: '⛏ Mineral', key: 'mineral' as const, prodKey: 'mineralProd' as const },
                { name: '🪙 Oro', key: 'gold' as const, prodKey: 'goldProd' as const },
              ].map(r => {
                const bagTotal = computeBagTotal(RESOURCE_ITEM_IDS_LOCAL[r.key]);
                return (
                  <tr key={r.key} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: 8 }}>{r.name}</td>
                    <td style={{ textAlign: 'right', padding: 8 }}>{formatRes(resources[r.key])}</td>
                    <td style={{ textAlign: 'right', padding: 8 }}>{formatRes(Math.max(0, resources[r.prodKey]))}</td>
                    <td style={{ textAlign: 'right', padding: 8, color: bagTotal > 0 ? colors.success : colors.textSecondary }}>
                      {bagTotal > 0 ? `+${formatRes(bagTotal)}` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {inventory.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ marginBottom: 8, color: colors.textSecondary, fontSize: 14 }}>Inventario</h4>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                <button className={invFilter === 'todos' ? 'primary' : ''} onClick={() => setInvFilter('todos')} style={{ fontSize: 12, padding: '3px 10px' }}>Todos</button>
                <button className={invFilter === 'unico' ? 'primary' : ''} onClick={() => setInvFilter('unico')} style={{ fontSize: 12, padding: '3px 10px' }}>Unico</button>
                <button className={invFilter === 'recurso' ? 'primary' : ''} onClick={() => setInvFilter('recurso')} style={{ fontSize: 12, padding: '3px 10px' }}>Recursos</button>
                <button className={invFilter === 'acelerar' ? 'primary' : ''} onClick={() => setInvFilter('acelerar')} style={{ fontSize: 12, padding: '3px 10px' }}>Acelerar</button>
                <button className={invFilter === 'combate' ? 'primary' : ''} onClick={() => setInvFilter('combate')} style={{ fontSize: 12, padding: '3px 10px' }}>Combate</button>
                <button className={invFilter === 'cofre' ? 'primary' : ''} onClick={() => setInvFilter('cofre')} style={{ fontSize: 12, padding: '3px 10px' }}>Cofre</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[...inventory]
                  .filter(item => {
                    if (invFilter === 'todos') return true;
                    const info = ITEMS_DB_LOCAL[item.itemId];
                    return info && (info as any).type === invFilter;
                  })
                  .sort((a, b) => a.itemId - b.itemId)
                  .map(item => {
                    const info = ITEMS_DB_LOCAL[item.itemId];
                    const isChest = info && (info as any).type === 'cofre';
                    return (
                      <div key={item.itemId} style={{
                        background: '#000', border: `1px solid ${colors.border}`,
                        borderRadius: 6, padding: '8px 12px', minWidth: 140,
                        cursor: isChest ? 'context-menu' : 'default',
                        position: 'relative',
                      }} onContextMenu={isChest ? (e) => { e.preventDefault(); setChestDialog({ itemId: item.itemId, max: item.amount }); setChestQty(Math.min(item.amount, 100)); } : undefined}>
                        <div style={{ fontSize: 13, color: colors.text }}>{info?.name || `Item #${item.itemId}`}</div>
                        <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                          x{item.amount}{info ? ` (${info.gems} gemas)` : ''}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {chestDialog && (
                <div style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 1000,
                }} onClick={() => !chestProgress?.done && setChestDialog(null)}>
                  <div style={{
                    background: colors.surface, border: `1px solid ${colors.border}`,
                    borderRadius: 8, padding: 20, minWidth: 300, maxWidth: 400,
                  }} onClick={e => e.stopPropagation()}>
                    <h3 style={{ marginBottom: 12 }}>Abrir {ITEMS_DB_LOCAL[chestDialog.itemId]?.name || `Item #${chestDialog.itemId}`}</h3>

                    {chestProgress ? (
                      <div>
                        <div style={{ marginBottom: 8 }}>
                          Abriendo: {chestProgress.opened} / {chestProgress.total}
                        </div>
                        <div style={{
                          width: '100%', height: 8, background: '#333', borderRadius: 4, overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${(chestProgress.opened / chestProgress.total) * 100}%`,
                            height: '100%', background: colors.success, transition: 'width 0.3s',
                          }} />
                        </div>
                        {chestProgress.done && <div style={{ marginTop: 8, color: colors.success }}>✔ Completado</div>}
                      </div>
                    ) : (
                      <>
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>
                            Cantidad (max {chestDialog.max}):
                          </div>
                          <input type="range" min={1} max={chestDialog.max} value={chestQty}
                            onChange={e => setChestQty(Number(e.target.value))}
                            style={{ width: '100%' }} />
                          <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 600, marginTop: 4 }}>
                            {chestQty}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button onClick={() => setChestDialog(null)}>Cancelar</button>
                          <button className="primary" onClick={() => {
                            socket.emit('openChest', { iggId, itemId: chestDialog.itemId, quantity: chestQty });
                          }}>Abrir</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'wars' && (
        <WarDashboard socket={socket} bots={[iggId]} />
      )}

      {activeTab === 'logs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <LogViewer iggId={iggId} logs={logs} logsEndRef={logsEndRef} socket={socket} />
        </div>
      )}

      {activeTab === 'chat' && (
        <div style={{
          background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', height: 400,
        }}>
          <div style={{
            flex: 1, overflowY: 'auto', marginBottom: 12,
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {chatMessages.length === 0 && (
              <div style={{ color: colors.textSecondary, fontStyle: 'italic' }}>Sin mensajes</div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={msg.id + '-' + i} style={{
                padding: '4px 8px', borderRadius: 4, fontSize: 13,
                background: msg.self ? '#1a3a1a' : '#111',
                color: msg.self ? colors.success : colors.text,
              }}>
                <span style={{
                  display: 'inline-block', fontSize: 10, borderRadius: 3,
                  padding: '0 4px', marginRight: 6, verticalAlign: 'middle',
                  background: msg.channel === 'gremio' ? '#2a2a50' : '#40251a',
                  color: msg.channel === 'gremio' ? '#8ab4ff' : '#ffab6b',
                }}>
                  {msg.channel || '—'}
                </span>
                <span style={{ fontWeight: 600, color: msg.self ? colors.success : colors.primary }}>
                  {msg.sender}{msg.guild ? ` [${msg.guild}]` : ''}:
                </span>{' '}{msg.text}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={chatText}
              onChange={e => setChatText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()}
              placeholder="Escribí un mensaje..."
              style={{ flex: 1 }}
            />
            <button onClick={sendChat}>Enviar</button>
          </div>
        </div>
      )}

      {activeTab === 'config' && botConfig && (
        <ConfigPanel config={botConfig} socket={socket} iggId={iggId} colors={colors} />
      )}

      {activeTab === 'config' && !botConfig && (
        <div style={{ color: colors.textSecondary }}>Cargando configuración...</div>
      )}

      {activeTab === 'camara' && (
        <div style={{
          background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: 8, padding: 16,
        }}>
          {treasureChamber ? (() => {
            const baseRoi = treasureChamber.durationType === 1 ? 3 : treasureChamber.durationType === 2 ? 27 : 85;
            const levelBonus = [0, 0, 1, 2, 3, 4, 5, 6, 12, 20][treasureChamber.level] || 0;
            const totalPct = baseRoi + levelBonus;
            const gain = Math.floor(treasureChamber.gems * totalPct / 100);
            const remaining = Math.max(0, Math.floor((treasureChamber.endTime - Date.now() / 1000) / 86400));
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
                <div><strong>Nivel:</strong> {treasureChamber.level}</div>
                <div><strong>Gemas invertidas:</strong> {treasureChamber.gems.toLocaleString()}</div>
                <div><strong>Duración:</strong> {treasureChamber.durationType === 1 ? '7 días' : treasureChamber.durationType === 2 ? '14 días' : '30 días'}</div>
                <div><strong>Inicio:</strong> {new Date(treasureChamber.startTime * 1000).toLocaleDateString()}</div>
                <div><strong>Fin:</strong> {new Date(treasureChamber.endTime * 1000).toLocaleDateString()}</div>
                <div><strong>Días restantes:</strong> {remaining}</div>
                <div><strong>Retorno:</strong> {baseRoi}% base + {levelBonus}% nivel = {totalPct}%</div>
                <div><strong>Ganancia:</strong> {gain.toLocaleString()} gemas</div>
                <div><strong>Total a recibir:</strong> {(treasureChamber.gems + gain).toLocaleString()} gemas</div>
              </div>
            );
          })() : (
            <div style={{ color: colors.textSecondary }}>Sin inversión activa en la Cámara del Tesoro</div>
          )}
        </div>
      )}

      {activeTab === 'construcciones' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {localConstructions.length > 0 && (
            <div style={{ display: 'flex', gap: 12 }}>
              {localConstructions.map((c, ci) => (
                <div key={ci} style={{
                  background: colors.surface, border: `1px solid ${colors.border}`,
                  borderRadius: 8, padding: '10px 14px', minWidth: 200,
                }}>
                  <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>
                    {ci === 0 ? 'Cola gratis' : 'Cola gemas'}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{BuildingName[c.id] || `ID ${c.id}`}</div>
                  <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                    Nivel {c.level} — {formatTime(c.remaining)}
                  </div>
                  </div>
                ))}
            </div>
          )}
          {buildingState.buildings.length === 0 ? (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16, color: colors.textSecondary }}>No hay datos de construcciones</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {buildingState.buildings
                .filter(b => b.id !== 0)
                .sort((a, b) => (BuildingName[a.id] || '').localeCompare(BuildingName[b.id] || ''))
                .map((b, i) => {
                  const inProgress = localConstructions.find(c => c.id === b.id && c.position === b.position);
                  return (
                    <div key={i} style={{
                      background: colors.surface, border: `1px solid ${inProgress ? '#e6a817' : colors.border}`,
                      borderRadius: 10, padding: '14px 16px', width: 200,
                      display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: colors.text }}>{BuildingName[b.id] || `ID ${b.id}`}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.textSecondary }}>
                        <span>Nivel <strong style={{ color: colors.text }}>{b.level}</strong></span>
                        <span>0x{b.position.toString(16).toUpperCase()}</span>
                      </div>
                      {inProgress && (
                        <div style={{ fontSize: 12, color: '#e6a817', borderTop: `1px solid ${colors.border}`, paddingTop: 4, marginTop: 2 }}>
                          Subiendo a nivel {inProgress.level} — {formatTime(inProgress.remaining)}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'transmutacion' && (
        <div style={{
          background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: 8, padding: 16,
        }}>
          {!essenceState ? (
            <div style={{ color: colors.textSecondary }}>Esperando datos de la Cámara de Transmutación...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {essenceState.slots.map(s => (
                  <div key={s.index} style={{
                    background: colors.surface,
                    border: `1px solid ${s.isRunning ? '#e6a817' : s.isEmpty ? colors.border : colors.border}`,
                    borderRadius: 8, padding: '12px 16px', minWidth: 180,
                    flex: 1,
                  }}>
                    <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>Slot {s.index}</div>
                    {s.isEmpty ? (
                      <div style={{ color: colors.textSecondary, fontSize: 13 }}>Vacío</div>
                    ) : s.isRunning ? (
                      <>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>Esencia nivel {s.essenceLevel}</div>
                        <div style={{ fontSize: 13, color: '#e6a817', marginTop: 4 }}>
                          Termina: {new Date(s.finishTimestamp * 1000).toLocaleString()}
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>Esencia nivel {s.essenceLevel}</div>
                        <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>Pendiente</div>
                      </>
                    )}
                    {!s.isEmpty && (
                      <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                        Tiempo base: {s.baseMinutes} min
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>
                Auto-guardar desde nivel: <strong>{essenceState.autoStoreLevel}</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'coliseo' && (
        <div style={{
          background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: 8, padding: 16,
        }}>
          {!coliseum ? (
            <div style={{ color: colors.textSecondary }}>Esperando datos del Coliseo...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>Puesto</div>
                  <div style={{ fontWeight: 700, fontSize: 20 }}>#{coliseum.rank}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>Peleas</div>
                  <div style={{ fontWeight: 700, fontSize: 20 }}>{coliseum.fightsDone}/5</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>Gemas</div>
                  <div style={{ fontWeight: 700, fontSize: 20 }}>{coliseum.gems.toLocaleString()}</div>
                </div>
              </div>
              {coliseum.rivals.length > 0 && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Rivales</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {coliseum.rivals.map((r, i) => (
                      <div key={i} style={{
                        background: colors.surface,
                        border: `1px solid ${colors.border}`,
                        borderRadius: 8, padding: '8px 12px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <span style={{ fontWeight: 600 }}>{r.name}</span>
                        <span style={{ fontSize: 12, color: colors.textSecondary }}>
                          {r.guildTag ? `[${r.guildTag}] ` : ''}héroe {r.heroId}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'misiones' && (
        <div style={{
          background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: 8, padding: 16,
        }}>
          {!missions && !fdgExtension ? (
            <div style={{ color: colors.textSecondary }}>Esperando datos de misiones...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* FDG - Misión activa */}
              {fdgExtension?.activeMission && fdgExtension.activeMission.missionId > 0 && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: colors.primary }}>Misión FDG Activa</div>
                  <div style={{
                    background: '#0d1117', border: `1px solid ${colors.border}`,
                    borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 11, color: colors.textSecondary }}>ID</div>
                        <div style={{ fontWeight: 600, fontSize: 16 }}>#{fdgExtension.activeMission.missionId}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: colors.textSecondary }}>Nivel</div>
                        <div style={{ fontWeight: 600, fontSize: 16 }}>{fdgExtension.activeMission.level}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: colors.textSecondary }}>Tipo</div>
                        <div style={{ fontWeight: 600, fontSize: 16 }}>{fdgExtension.activeMission.missionType}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: colors.textSecondary }}>Tiempo</div>
                        <div style={{ fontWeight: 600, fontSize: 16 }}>{fdgExtension.activeMission.timeMinutes} min</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* FDG - Slots 200% y 120% */}
              {(fdgExtension?.mission200 || fdgExtension?.mission120) && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Slots FDG</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {fdgExtension?.mission200 && fdgExtension.mission200.missionId > 0 && (
                      <div style={{
                        background: '#0d1117', border: `1px solid ${colors.border}`,
                        borderRadius: 8, padding: 12, flex: 1, minWidth: 180,
                      }}>
                        <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>200%</div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>Misión #{fdgExtension.mission200.missionId}</div>
                        <div style={{ fontSize: 12, color: colors.textSecondary }}>Nivel {fdgExtension.mission200.level}</div>
                      </div>
                    )}
                    {fdgExtension?.mission120 && fdgExtension.mission120.missionId > 0 && (
                      <div style={{
                        background: '#0d1117', border: `1px solid ${colors.border}`,
                        borderRadius: 8, padding: 12, flex: 1, minWidth: 180,
                      }}>
                        <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>120%</div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>Misión #{fdgExtension.mission120.missionId}</div>
                        <div style={{ fontSize: 12, color: colors.textSecondary }}>Nivel {fdgExtension.mission120.level}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Misiones extravagantes */}
              {missions && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Misiones Extravagantes</div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 11, color: colors.textSecondary }}>Progreso</div>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>{missions.progress}</div>
                    </div>
                    {missions.activeMission && (
                      <div style={{
                        background: '#0d1117', border: `1px solid ${colors.border}`,
                        borderRadius: 8, padding: 10, flex: 1,
                      }}>
                        <div style={{ fontSize: 11, color: colors.primary, fontWeight: 600 }}>Activa</div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{missions.activeMission.name}</div>
                        <div style={{ fontSize: 12, color: colors.textSecondary }}>
                          ID #{missions.activeMission.missionId} — {missions.activeMission.points}/{missions.activeMission.total}
                        </div>
                      </div>
                    )}
                  </div>
                  {missions.missions.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {missions.missions.map((m, i) => (
                        <div key={i} style={{
                          background: '#0d1117',
                          border: `1px solid ${m.available ? colors.border : '#333'}`,
                          borderRadius: 6, padding: '8px 12px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          opacity: m.available ? 1 : 0.5,
                        }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                            <div style={{ fontSize: 11, color: colors.textSecondary }}>ID #{m.missionId}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 12, color: colors.textSecondary }}>{m.points}/{m.total}</div>
                            <div style={{ fontSize: 10, color: m.available ? '#4ade80' : '#666' }}>
                              {m.available ? 'Disponible' : 'Bloqueada'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Records */}
              {missionRecords && missionRecords.records.length > 0 && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Records</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {missionRecords.records.map((r, i) => (
                      <div key={i} style={{
                        fontSize: 12, color: colors.textSecondary,
                        display: 'flex', gap: 8, alignItems: 'center',
                      }}>
                        <span style={{
                          padding: '2px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                          background: r.type === 'waiting' ? '#f59e0b33' : '#4ade8033',
                          color: r.type === 'waiting' ? '#f59e0b' : '#4ade80',
                        }}>
                          {r.type === 'waiting' ? 'ESPERA' : 'OK'}
                        </span>
                        {r.missionId !== undefined && <span>Misión #{r.missionId}</span>}
                        {r.level !== undefined && <span>Nv.{r.level}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'guildApps' && (
        <div style={{
          background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: 8, padding: 16,
        }}>
          {!guildApplications || guildApplications.length === 0 ? (
            <div style={{ color: colors.textSecondary }}>No hay aplicaciones pendientes</div>
          ) : (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                Aplicaciones Pendientes ({guildApplications.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {guildApplications.map((app, i) => (
                  <div key={i} style={{
                    background: '#0d1117', border: `1px solid ${colors.border}`,
                    borderRadius: 8, padding: 12,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{app.name}</div>
                      <div style={{ fontSize: 12, color: colors.textSecondary }}>
                        IGG {app.userId}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 13, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 10, color: colors.textSecondary }}>Poder</div>
                        <div style={{ fontWeight: 600 }}>{formatRes(app.power)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: colors.textSecondary }}>Tropas Matadas</div>
                        <div style={{ fontWeight: 600 }}>{formatRes(app.troopsKilled)}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => socket.emit('acceptGuildApplication', { iggId, userId: app.userId })}
                          style={{ background: '#166534', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                        >Aceptar</button>
                        <button
                          onClick={() => socket.emit('rejectGuildApplication', { iggId, userId: app.userId })}
                          style={{ background: '#991b1b', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                        >Rechazar</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'trajes' && (
        <div style={{
          background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: 8, padding: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            Inventario de Trajes ({costumes.length})
          </div>
          {costumes.length === 0 ? (
            <div style={{ color: colors.textSecondary }}>No hay trajes registrados</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {costumes.map((c, i) => {
                const gradeColors: Record<number, string> = { 1: '#9ca3af', 2: '#22c55e', 3: '#3b82f6', 4: '#a855f7', 5: '#eab308', 6: '#f97316' };
                const gradeNames: Record<number, string> = { 1: 'Común', 2: 'Poco común', 3: 'Raro', 4: 'Épico', 5: 'Legendario', 6: 'Mítico' };
                const border = gradeColors[c.grade] || colors.border;
                return (
                  <div key={i} style={{
                    background: '#0d1117', border: `1px solid ${border}`,
                    borderRadius: 8, padding: 10, minWidth: 160, fontSize: 12,
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>
                      {getCostumeName(c.id)}
                    </div>
                    <div style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4 }}>
                      ID {c.id} · {gradeNames[c.grade] || `G${c.grade}`} · idx:0x{c.index.toString(16).toUpperCase().padStart(2, '0')}
                    </div>
                    {getCostumeBuffs(c.id, c.grade).length > 0 ? (
                      <div style={{ fontSize: 11, color: colors.success }}>
                        {getCostumeBuffs(c.id, c.grade).map((b, j) => (
                          <div key={j}>{b.name} +{b.value}{b.unit}</div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: colors.textSecondary }}>Sin datos de buffs</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'cuartel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: 8, padding: '10px 16px', fontSize: 14,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>Tamaño del ejército: <strong>{formatRes(troopState.troops.reduce((s, t) => s + t.count, 0))}</strong></span>
          </div>
          {troopTraining && (
            <div style={{
              background: colors.surface, border: `1px solid ${colors.border}`,
              borderRadius: 8, padding: '10px 16px', fontSize: 14,
            }}>
              Entrenando: <strong>T{troopTraining.tier + 1} x{formatRes(troopTraining.count)}</strong> — {formatTime(localTrainingRemaining)}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {[0, 1, 2, 3].map(type => {
            const rows = troopState.troops.filter(t => t.type === type);
            const total = rows.reduce((s, t) => s + t.count, 0);
            const name = ['Infantería', 'Artillería', 'Caballería', 'Asedio'][type];
            return (
              <div key={type} style={{
                background: colors.surface, border: `1px solid ${colors.border}`,
                borderRadius: 10, padding: '14px 16px', width: 220,
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
                  {[1, 2, 3, 4, 5].map(tier => {
                    const t = rows.find(r => r.tier === tier);
                    return (
                      <div key={tier} style={{ display: 'flex', justifyContent: 'space-between', color: colors.textSecondary }}>
                        <span>T{tier}</span>
                        <span style={{ color: colors.text }}>{t ? formatRes(t.count) : '0'}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Total</span>
                  <span style={{ fontWeight: 600 }}>{formatRes(total)}</span>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      )}

      {activeTab === 'lider' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: colors.surface, border: `1px solid ${isLeaderExecuted ? colors.danger : isLeaderCaptured ? '#f59e0b' : '#2a6b2a'}`,
            borderRadius: 8, padding: '10px 16px', fontSize: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (isLeaderCaptured && captiveData) || isLeaderExecuted ? 10 : 0 }}>
              <span style={{ fontWeight: 600 }}>Estado del Líder</span>
              <span style={{
                color: isLeaderExecuted ? colors.danger : isLeaderCaptured ? '#f59e0b' : '#4ade80',
                fontWeight: 600,
              }}>
                {isLeaderExecuted ? 'EJECUTADO' : isLeaderCaptured ? 'ENCARCELADO' : 'Libre'}
              </span>
            </div>
            {isLeaderExecuted && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: colors.textSecondary }}>
                <span>Revivir gratis: <strong style={{ color: leaderRemaining > 0 ? colors.text : '#4ade80' }}>
                  {leaderRemaining > 0
                    ? `${Math.floor(leaderRemaining / 3600)}h ${Math.floor((leaderRemaining % 3600) / 60)}m ${leaderRemaining % 60}s`
                    : '¡Disponible!'}
                </strong></span>
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  {(() => {
                    const fruit = inventory.find(i => i.itemId === 1117);
                    const qty = fruit ? fruit.amount : 0;
                    if (qty > 0) {
                      return (
                        <button onClick={() => socket.emit('useFruit', { iggId })} style={{
                          padding: '6px 14px', borderRadius: 6, border: 'none',
                          background: '#4ade80', color: '#000', fontWeight: 600, cursor: 'pointer', fontSize: 13,
                        }}>
                          Usar fruta ({qty})
                        </button>
                      );
                    }
                    return (
                      <button onClick={() => socket.emit('buyFruit', { iggId })} style={{
                        padding: '6px 14px', borderRadius: 6, border: 'none',
                        background: '#f59e0b', color: '#000', fontWeight: 600, cursor: 'pointer', fontSize: 13,
                      }}>
                        Comprar y usar fruta
                      </button>
                    );
                  })()}
                </div>
              </div>
            )}
            {isLeaderCaptured && captiveData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: colors.textSecondary }}>
                <span>Clan: <strong style={{ color: colors.text }}>{captiveData.guildTag}</strong></span>
                <span>Jugador: <strong style={{ color: colors.text }}>{captiveData.playerName}</strong></span>
                <span>Liberación: <strong style={{ color: colors.text }}>
                  {(() => {
                    const remain = Math.max(0, captiveData.prisonEndTimestamp - Math.floor(Date.now() / 1000));
                    if (remain <= 0) return 'Disponible';
                    const h = Math.floor(remain / 3600);
                    const m = Math.floor((remain % 3600) / 60);
                    const s = remain % 60;
                    return `${h}h ${m}m ${s}s`;
                  })()}
                </strong></span>
                {captiveData.captorBounty > 0 && (
                  <span>Recompensa del captor: <strong style={{ color: '#fbbf24' }}>{captiveData.captorBounty.toLocaleString()}</strong></span>
                )}
                {captiveData.rescueBounty > 0 && (
                  <span>Recompensa de rescate: <strong style={{ color: '#fbbf24' }}>{captiveData.rescueBounty.toLocaleString()}</strong></span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'enfermeria' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!hospitalState ? (
            <div style={{
              background: colors.surface, border: `1px solid ${colors.border}`,
              borderRadius: 8, padding: '20px', fontSize: 14, color: colors.textSecondary, textAlign: 'center',
            }}>
              Esperando datos de la enfermería...
            </div>
          ) : (
            <>
              <div style={{
                background: colors.surface, border: `1px solid ${colors.border}`,
                borderRadius: 8, padding: '10px 16px', fontSize: 14,
                display: 'flex', gap: 24,
              }}>
                <span>Heridos: <strong style={{ color: colors.danger }}>{formatRes(hospitalState.troops.reduce((s, t) => s + t.injured, 0))}</strong></span>
                <span>Curándose: <strong style={{ color: colors.warning }}>{formatRes(hospitalState.troops.reduce((s, t) => s + t.healing, 0))}</strong></span>
                {hospitalState.isHealing && (
                  <>
                    <span>Termina: <strong>{new Date(hospitalState.finishTimestamp * 1000).toLocaleTimeString()}</strong></span>
                    <span>Duración total: <strong>{formatTime(hospitalState.totalHealingSeconds)}</strong></span>
                  </>
                )}
              </div>
              {hospitalState.isHealing && (
                <div style={{
                  background: '#1b5e20', borderRadius: 8, padding: '10px 16px',
                  fontSize: 14, color: '#fff', textAlign: 'center',
                }}>
                  🏥 Curación en progreso
                </div>
              )}
              <div style={{
                background: colors.surface, border: `1px solid ${colors.border}`,
                borderRadius: 8, padding: '10px 16px', fontSize: 13,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Costo de curación</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {[
                    { label: '🌾 Trigo', key: 'wheat' as const, bagIds: RESOURCE_ITEM_IDS_LOCAL['wheat'] || [] },
                    { label: '🪵 Madera', key: 'wood' as const, bagIds: RESOURCE_ITEM_IDS_LOCAL['wood'] || [] },
                    { label: '🪨 Piedra', key: 'stone' as const, bagIds: RESOURCE_ITEM_IDS_LOCAL['stone'] || [] },
                    { label: '⛏ Mineral', key: 'mineral' as const, bagIds: RESOURCE_ITEM_IDS_LOCAL['mineral'] || [] },
                    { label: '🪙 Oro', key: 'gold' as const, bagIds: RESOURCE_ITEM_IDS_LOCAL['gold'] || [] },
                  ].map(r => {
                    const cost = hospitalState.totalCost[r.key];
                    const current = resources?.[r.key] ?? 0;
                    const bag = computeBagTotal(r.bagIds);
                    const enough = (current + bag) >= cost;
                    return (
                      <span key={r.key}>
                        {r.label}: <strong style={{ color: enough ? colors.success : colors.danger }}>{formatRes(cost)}</strong>
                        {hospitalState.healingCost[r.key] > 0 && (
                          <span style={{ color: colors.warning }}> ({formatRes(hospitalState.healingCost[r.key])} curándose)</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {[0, 1, 2, 3].map(type => {
                  const rows = hospitalState.troops.filter(t => t.type === type);
                  const totalInjured = rows.reduce((s, t) => s + t.injured, 0);
                  const totalHealing = rows.reduce((s, t) => s + t.healing, 0);
                  const name = ['Infantería', 'Artillería', 'Caballería', 'Asedio'][type];
                  return (
                    <div key={type} style={{
                      background: colors.surface, border: `1px solid ${colors.border}`,
                      borderRadius: 10, padding: '14px 16px', width: 220,
                      display: 'flex', flexDirection: 'column', gap: 4,
                    }}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{name}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
                        {[1, 2, 3, 4, 5].map(tier => {
                          const t = rows.find(r => r.tier === tier);
                          return (
                            <div key={tier} style={{ display: 'flex', justifyContent: 'space-between', color: colors.textSecondary }}>
                              <span>T{tier}</span>
                              <span>
                                <span style={{ color: colors.danger }}>{t ? formatRes(t.injured) : '0'}</span>
                                {t && t.healing > 0 && (
                                  <span style={{ color: colors.warning, marginLeft: 8 }}>({formatRes(t.healing)} curándose)</span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 4, paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Total heridos</span>
                          <span style={{ fontWeight: 600, color: colors.danger }}>{formatRes(totalInjured)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Curándose</span>
                          <span style={{ fontWeight: 600, color: colors.warning }}>{formatRes(totalHealing)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'atalaya' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: 8, padding: '10px 16px', fontSize: 14,
          }}>
            Marchas entrantes: <strong>{incomingMarches.filter((m: any) => !m.arrived).length}</strong>
          </div>
          {(() => {
            const active = incomingMarches.filter((m: any) => !m.arrived);
            const TYPE_LABEL = ['Infantería', 'Arqueros', 'Caballería', 'Asedio'];
            const TIER_LABEL = ['', 'T1', 'T2', 'T3', 'T4', 'T5'];
            const renderMarch = (m: any, isHistory: boolean) => {
              const remain = Math.max(0, m.arrivalTimestamp - Math.floor(now / 1000));
              const h = Math.floor(remain / 3600);
              const min = Math.floor((remain % 3600) / 60);
              const seg = remain % 60;
              const tiempo = h > 0 ? `${h}h ${min}m` : min > 0 ? `${min}m ${seg}s` : `${seg}s`;
              return (
                <div key={m.marchId || m._id} style={{
                  background: colors.surface, border: `1px solid ${isHistory ? 'rgba(255,255,255,0.08)' : colors.border}`,
                  borderRadius: 8, padding: '10px 16px', fontSize: 13, opacity: isHistory ? 0.55 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span>
                      Marcha <strong>#{m.marchId}</strong>
                      {m.marchType === 0xff05 && <span style={{ color: colors.danger, marginLeft: 6 }}>⚔ Ataque</span>}
                      {m.marchType === 0xff08 && <span style={{ color: '#60a5fa', marginLeft: 6 }}>🔍 Exploración</span>}
                      {m.updated && !isHistory && <span style={{ color: colors.warning, marginLeft: 6 }}>(acelerada)</span>}
                      {isHistory && <span style={{ color: '#4ade80', marginLeft: 6 }}>✔ Llegó</span>}
                    </span>
                    <span style={{ color: isHistory ? '#4ade80' : remain < 60 ? colors.danger : colors.textSecondary }}>
                      {isHistory ? `Llegó hace ${Math.floor((Math.floor(now / 1000) - (m.arrivedAt || m.arrivalTimestamp)) / 60)}m` : `⏱ ${tiempo}`}
                    </span>
                  </div>
                  {(m.packet || m.heroes) && (
                    <div style={{ marginTop: 6, padding: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 6, fontSize: 12 }}>
                      {(m.packet?.heroes || m.heroes || []).length > 0 && (
                        <div style={{ marginBottom: 4 }}>
                          <strong>Héroes:</strong>{' '}
                          {(m.packet?.heroes || m.heroes || []).map((h: any, i: number) => (
                            <span key={i} style={{ marginRight: 8 }}>
                              ID:{h.heroId} ✦{h.rank}.{h.grade}
                            </span>
                          ))}
                          <span style={{ marginLeft: 4, color: (m.packet?.leaderFlag ?? m.leaderFlag) === 0 ? '#d4af37' : '#f85149' }}>
                            {(m.packet?.leaderFlag ?? m.leaderFlag) === 0 ? '👑 Con líder' : 'Sin líder'}
                          </span>
                        </div>
                      )}
                      <div>
                        <strong>Tropas:</strong>{' '}
                        {(m.packet?.troops || m.troops || []).filter((t: any) => t.count > 0).map((t: any, i: number) => (
                          <span key={i} style={{ marginRight: 8 }}>
                            {TYPE_LABEL[t.type]} {TIER_LABEL[t.tier]}: {t.count.toLocaleString()}
                          </span>
                        ))}
                        {(m.packet?.t5Troops || m.t5Troops || []).some((t: any) => t.count > 0) && (
                          <>
                            {' | '}
                            {(m.packet?.t5Troops || m.t5Troops || []).filter((t: any) => t.count > 0).map((t: any, i: number) => (
                              <span key={i} style={{ marginRight: 8, color: '#d4af37' }}>
                                {TYPE_LABEL[t.type]} T5: {t.count.toLocaleString()}
                              </span>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            };
            return (
              <>
                {active.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8, marginBottom: 4 }}>
                      Activas ({active.length})
                    </div>
                    {active.map((m: any) => renderMarch(m, false))}
                  </>
                )}
                {marchHistory.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 12, marginBottom: 4 }}>
                      Historial ({marchHistory.length})
                    </div>
                    {marchHistory.map((m: any) => renderMarch(m, true))}
                  </>
                )}
                {active.length === 0 && marchHistory.length === 0 && (
                  <div style={{
                    background: colors.surface, border: `1px solid ${colors.border}`,
                    borderRadius: 8, padding: 20, fontSize: 14, color: colors.textSecondary, textAlign: 'center',
                  }}>
                    No hay marchas entrantes
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {activeTab === 'mapa' && (
        <MapViewerDemo
          tiles={mapTiles}
          marches={mapMarches}
          onRequestRegion={(x, y) => socket.emit('requestMapData', { iggId, x, y })}
          home={playerInfo?.castleX !== undefined && playerInfo?.castleY !== undefined ? { x: playerInfo.castleX, y: playerInfo.castleY } : undefined}
        />
      )}

      {showSupplyDialog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', zIndex: 1001,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => { setShowSupplyDialog(false); setSupplyResult(null); }}>
          <div style={{
            background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: 8, padding: 24, maxWidth: 420, width: '90%',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Enviar Supply</h3>
            <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>
              Jugador objetivo (usa el de la config o escribí uno nuevo):
            </div>
            <input
              type="text"
              value={supplyTarget}
              onChange={e => setSupplyTarget(e.target.value)}
              placeholder="Nombre del jugador"
              style={{ width: '100%', padding: '6px 10px', marginBottom: 12, background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 4, fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {['trigo', 'piedra', 'madera', 'mineral', 'oro'].map(r => (
                <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked style={{ accentColor: '#4ade80' }} data-resource={r} />
                  {r}
                </label>
              ))}
            </div>
            {supplyResult && (
              <div style={{
                padding: '8px 12px', borderRadius: 4, marginBottom: 12, fontSize: 13,
                background: supplyResult.ok ? '#1b5e2033' : '#b71c1c33',
                color: supplyResult.ok ? '#4ade80' : '#f87171',
                border: `1px solid ${supplyResult.ok ? '#4ade8044' : '#f8717144'}`,
              }}>
                {supplyResult.message}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowSupplyDialog(false); setSupplyResult(null); }}>Cancelar</button>
              <button
                className="primary"
                disabled={supplySending || !supplyTarget.trim()}
                onClick={() => {
                  const checks = document.querySelectorAll('[data-resource]');
                  const res: string[] = [];
                  checks.forEach(c => { if ((c as HTMLInputElement).checked) res.push(c.getAttribute('data-resource')!); });
                  setSupplySending(true);
                  setSupplyResult(null);
                  socket.emit('sendManualSupply', { iggId, targetPlayer: supplyTarget.trim(), resources: res.length > 0 ? res : undefined });
                }}
              >
                {supplySending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const BuildingName: Record<number, string> = {
  0: '—',
  1: 'Leñador', 2: 'Cantera', 3: 'Mina', 4: 'Granja',
  5: 'Mansión', 6: 'Cuartel', 7: 'Hospital', 8: 'Castillo',
  9: 'Almacén', 10: 'Academia', 11: 'Salón de Guerra', 12: 'Muro',
  13: 'Torre Vigía', 14: 'Embajada', 15: 'Forja', 16: 'Cámara Tesoro',
  17: 'Puesto Comercial', 18: 'Prisión', 19: 'Altar',
  20: 'Guarida Monstruos', 21: 'Manantial', 22: 'Aguja Mística',
  23: 'Gimnasio', 24: 'Piedra Lunar', 25: 'Artefacto',
  26: 'Mina Poder Mágico', 27: 'Cuartel Poder Mágico',
  28: 'Casa de Aldea', 29: 'Torre Defensa I', 30: 'Torre Defensa II',
   31: 'Torre Defensa III',
  100: 'Desafío de Héroe',
  101: 'Arena',
  102: 'Refugio',
  105: 'Recompensa NPC',
  106: 'Apuesta',
  107: 'Monopoly',
  109: 'Valhalla',
  110: 'Torre de Defensa',
   111: 'Reliquias',
   112: 'Torre de Combate',
};

// ── Config Panel ──

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} style={{ accentColor: '#4ade80' }} />
      {label}
    </label>
  );
}

function NumInput({ value, onChange, label, suffix }: { value: number; onChange: (v: number) => void; label: string; suffix?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ whiteSpace: 'nowrap' }}>{label}:</span>
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

function TextInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ whiteSpace: 'nowrap' }}>{label}:</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: 160, padding: '2px 6px' }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

function getDeep(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function setDeep(obj: any, path: string, value: any): any {
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

function ConfigPanel({ config, socket, iggId, colors }: { config: any; socket: any; iggId: number; colors: any }) {
  const [draft, setDraft] = useState<any>(config);
  const [saved, setSaved] = useState(false);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    setDraft(config);
    setChanged(false);
  }, [config]);

  const save = () => {
    socket.emit('saveConfig', { iggId, config: draft });
    setSaved(true);
    setChanged(false);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = () => {
    setDraft(config);
    setChanged(false);
  };

  const set = (path: string) => ({
    value: getDeep(draft, path),
    onChange: (v: any) => {
      setDraft((d: any) => setDeep(d, path, v));
      setChanged(true);
    },
  });

  const bool = (path: string) => ({
    value: !!getDeep(draft, path),
    onChange: (v: any) => {
      setDraft((d: any) => setDeep(d, path, v));
      setChanged(true);
    },
  });

  return (
    <div style={{
      background: colors.surface, border: `1px solid ${colors.border}`,
      borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
      fontSize: 13, maxHeight: '70vh', overflowY: 'auto',
    }}>
      <Section title="General">
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
        <TextInput label="Ubicación" {...set('supply.location')} />
        <NumInput label="Umbral" {...set('supply.threshold')} />
        <NumInput label="Máx. Monto" {...set('supply.maxAmount')} />
        <NumInput label="Límite caravanas" {...set('supply.caravanLimit')} />
      </Section>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
        <button onClick={save} disabled={!changed} style={{ padding: '6px 18px', cursor: changed ? 'pointer' : 'not-allowed', opacity: changed ? 1 : 0.5 }}>
          Guardar
        </button>
        <button onClick={reset} disabled={!changed} style={{ padding: '6px 14px', cursor: changed ? 'pointer' : 'not-allowed', opacity: changed ? 1 : 0.5 }}>
          Restablecer
        </button>
        {saved && <span style={{ color: '#4ade80' }}>✓ Guardado</span>}
        {changed && !saved && <span style={{ color: '#fbbf24' }}>Hay cambios sin guardar</span>}
      </div>
    </div>
  );
}
