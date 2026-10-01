import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSocket } from '../hooks/useSocket';
import { colors } from './Theme';
import WarDashboard from './WarDashboard';
import LogViewer from './LogViewer';
import MapViewerDemo from './MapViewerDemo';
import { getItemsSync, getItemsData } from '../data/items';
import { getTechsSync, getTechsData, setTechsData } from '../data/techs';

interface PlayerInfo {
  playerName: string; level: number; power: number; kills: number; gems: number; vipExp: number; energy: number;
  castleX?: number; castleY?: number;
  /** Resistencia actual y tope (120 + bonus de investigación). */
  currentResistencia?: number;
  resistenciaMax?: number;
  /** Recuperación de energía por hora (1800/h + bonus de investigación). */
  energyRegen?: { perHour: number; perSec: number; bonusPct: number; basePerHour: number };
}

interface Resources {
  wheat: number; stone: number; wood: number; mineral: number; gold: number;
  wheatProd: number; stoneProd: number; woodProd: number; mineralProd: number; goldProd: number;
}

interface OwnMarch {
  index: number; state: number; status: 'flying' | 'arrived' | 'unknown';
  heroIds: number[];
  troops: { type: number; tier: number; count: number }[];
  destX: number; destY: number; name: string; startAt: number; durationSec: number; unknown106: number;
}

interface OwnMarches {
  limit: number; count: number; entries: OwnMarch[];
}

// El backend puede tardar en reiniciarse y mandar entries sin tropas/héroes;
// se normaliza para que el render no reviente con `.length` de undefined.
function normalizeOwnMarches(d: OwnMarches | null | undefined): OwnMarches | null {
  if (!d) return null;
  return {
    limit: d.limit ?? 0,
    count: d.count ?? 0,
    entries: (d.entries || []).map(e => ({ ...e, troops: e.troops || [], heroIds: e.heroIds || [] })),
  };
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
  const [activeTab, setActiveTab] = useState<'info' | 'resources' | 'wars' | 'logs' | 'chat' | 'config' | 'camara' | 'construcciones' | 'academia' | 'stats' | 'transmutacion' | 'cuartel' | 'lider' | 'enfermeria' | 'atalaya' | 'mapa' | 'coliseo' | 'heroes' | 'misiones' | 'guildApps' | 'trajes' | 'talentos'>('info');
  const [warNotif, setWarNotif] = useState(0);
  const [treasureChamber, setTreasureChamber] = useState<{ level: number; gems: number; startTime: number; durationType: number; endTime: number } | null>(null);
  const [troopState, setTroopState] = useState<{ troops: { type: number; tier: number; count: number }[] }>({ troops: [] });
  const [hospitalState, setHospitalState] = useState<{ troops: { type: number; tier: number; injured: number; healing: number }[]; finishTimestamp: number; totalHealingSeconds: number; isHealing: boolean; totalCost: { wheat: number; wood: number; stone: number; mineral: number; gold: number }; healingCost: { wheat: number; wood: number; stone: number; mineral: number; gold: number } } | null>(null);
  const [incomingMarches, setIncomingMarches] = useState<{ marchId: number; arrivalTimestamp: number; updated: boolean; marchType?: number; packet?: any }[]>([]);
  const [ownMarches, setOwnMarches] = useState<OwnMarches | null>(null);
  const [marchHistory, setMarchHistory] = useState<any[]>([]);
  const [mapTiles, setMapTiles] = useState<any[]>([]);
  const [mapMarches, setMapMarches] = useState<any[]>([]);
  const [huntTarget, setHuntTarget] = useState<any>(null);
  const [huntSquads, setHuntSquads] = useState<any[]>([]);
  const [huntMsg, setHuntMsg] = useState<string | null>(null);
  const [buildingState, setBuildingState] = useState<{ buildings: { position: number; id: number; level: number }[] }>({ buildings: [] });
  const [essenceState, setEssenceState] = useState<{ slots: { index: number; essenceLevel: number; finishTimestamp: number; baseMinutes: number; isRunning: boolean; isEmpty: boolean }[]; autoStoreLevel: number } | null>(null);
  const [coliseum, setColiseum] = useState<{ rank: number; fightsDone: number; gems: number; rivals: { name: string; guildTag: string; heroId: number }[] } | null>(null);
  const [heroes, setHeroes] = useState<{ heroId: number; name: string; nameEn: string; level: number; power: number; rank: number; grade: number; skills: { id: number; name: string; nameEn: string }[]; battleSkills: { id: number; name: string; nameEn: string }[] }[]>([]);
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
  const [effectDefs, setEffectDefs] = useState<Record<number, { id: number; name: string; unit: string; scope?: string }>>({});
  const [buildingDB, setBuildingDB] = useState<Record<number, { id: number; name: string; nameTable?: string; maxLevel: number; temporal?: boolean; levels: Record<number, { time: number; costs: Record<string, number>; might: number }> }>>({});
  const [talents, setTalents] = useState<{ unassigned: number; levels: number[] } | null>(null);
  const [talentDB, setTalentDB] = useState<Record<number, { id: number; name: string; branch: number; row: number; maxLevel: number; effectId: number; levels: Record<number, number> }>>({});
  const [talentBranches, setTalentBranches] = useState<{ id: number; name: string; count: number; talents: number[] }[]>([]);
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
  const [techsReady, setTechsReady] = useState(!!getTechsSync());
  const [research, setResearch] = useState<{ techLevels: number[]; activeTechId: number; activeLevel: number; remainingSeconds: number } | null>(null);
  const [localResearchRemaining, setLocalResearchRemaining] = useState(0);
  const [techKindFilter, setTechKindFilter] = useState<string>('todas');
  const [techSearch, setTechSearch] = useState('');
  const [statsOpenKey, setStatsOpenKey] = useState<string | null>(null);
  const [playerStats, setPlayerStats] = useState<any[]>([]);
  const [showSupplyDialog, setShowSupplyDialog] = useState(false);
  const [supplyTarget, setSupplyTarget] = useState('');
  const [supplySending, setSupplySending] = useState(false);
  const [supplyStopping, setSupplyStopping] = useState(false);
  const [supplyResult, setSupplyResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => { getItemsData().then(() => setItemsReady(true)); }, []);
  useEffect(() => { getTechsData().then(() => setTechsReady(true)); }, []);

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
      if (data.research !== undefined) applyResearch(data.research);
      if (Array.isArray(data.playerStats)) setPlayerStats(data.playerStats);
      if (data.essenceState) setEssenceState(data.essenceState);
      if (data.coliseum) setColiseum(data.coliseum);
      if (data.heroes !== undefined) setHeroes(data.heroes || []);
      if (data.missions) setMissions(data.missions);
      if (data.missionRecords) setMissionRecords(data.missionRecords);
      if (data.fdgExtension) setFdgExtension(data.fdgExtension);
      if (data.troopState) setTroopState(data.troopState);
      if (data.hospitalState !== undefined) setHospitalState(data.hospitalState);
      if (data.incomingMarches !== undefined) setIncomingMarches(data.incomingMarches);
      if (data.ownMarches !== undefined) setOwnMarches(normalizeOwnMarches(data.ownMarches));
      if (data.marchHistory !== undefined) setMarchHistory(data.marchHistory);
      if (data.mapTiles !== undefined) setMapTiles(data.mapTiles);
      if (data.mapMarches !== undefined) setMapMarches(data.mapMarches || []);
      if (data.huntTarget !== undefined) setHuntTarget(data.huntTarget);
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
      if (data.effects) setEffectDefs(data.effects);
      if (data.buildingDB) setBuildingDB(data.buildingDB);
      if (data.talentDB) setTalentDB(data.talentDB);
      if (data.talentBranches) setTalentBranches(data.talentBranches);
      if (data.talents !== undefined) setTalents(data.talents || null);
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
    socket.on('buildingState', (data: { iggId: number; buildingState: any; playerStats?: any[] }) => {
      if (data.iggId !== iggId) return;
      if (data.buildingState) setBuildingState(data.buildingState);
      if (Array.isArray(data.playerStats)) setPlayerStats(data.playerStats);
    });
    socket.on('constructions', (data: { iggId: number; constructions: any }) => {
      if (data.iggId !== iggId) return;
      if (data.constructions) updateConstructions(data.constructions);
    });
    socket.on('research', (data: { iggId: number; research: any; playerStats?: any[] }) => {
      if (data.iggId !== iggId) return;
      applyResearch(data.research);
      setPlayerStats(Array.isArray(data.playerStats) ? data.playerStats : []);
    });
    socket.on('talents', (data: { iggId: number; talents: any; playerStats?: any[] }) => {
      if (data.iggId !== iggId) return;
      setTalents(data.talents || null);
      setPlayerStats(Array.isArray(data.playerStats) ? data.playerStats : []);
    });
    socket.on('techs', (data: any) => {
      setTechsData(data);
      setTechsReady(true);
    });
    if (!getTechsSync()) socket.emit('getTechs');
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
    socket.on('heroes', (data: { iggId: number; heroes: any[] }) => {
      if (data.iggId !== iggId) return;
      setHeroes(data.heroes || []);
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
    socket.on('ownMarches', (data: { iggId: number; marches: OwnMarches | null }) => {
      if (data.iggId !== iggId) return;
      setOwnMarches(normalizeOwnMarches(data.marches));
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
    const onHuntUpdated = (data: { iggId: number; huntTarget: any; energy?: number }) => {
      if (data.iggId !== iggId) return;
      setHuntTarget(data.huntTarget || null);
      if (data.energy !== undefined) {
        setPlayerInfo(prev => (prev ? { ...prev, energy: data.energy! } : prev));
      }
    };
    socket.on('huntUpdated', onHuntUpdated);
    const onHuntSquad = (data: { squads: any[] }) => {
      setHuntSquads(data.squads || []);
    };
    socket.on('huntSquad', onHuntSquad);
    const onHuntResult = (data: { iggId: number; ok: boolean; message: string }) => {
      if (data.iggId !== iggId) return;
      setHuntMsg(data.message);
      setTimeout(() => setHuntMsg(null), 5000);
    };
    socket.on('huntResult', onHuntResult);
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
    socket.on('equippedCostumes', (data: { iggId: number; equippedCostumes: any[]; playerStats?: any[] }) => {
      if (data.iggId !== iggId) return;
      setEquippedCostumes(data.equippedCostumes || []);
      if (Array.isArray(data.playerStats)) setPlayerStats(data.playerStats);
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
      setSupplyStopping(false);
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
      socket.off('research');
      socket.off('talents');
      socket.off('techs');
      socket.off('essence');
      socket.off('coliseum');
      socket.off('missions');
      socket.off('heroes');
      socket.off('missionRecords');
      socket.off('fdgExtension');
      socket.off('troops');
      socket.off('hospitalState');
      socket.off('incomingMarches');
      socket.off('ownMarches');
      socket.off('leaderState');
      socket.off('guildApplications');
      socket.off('configUpdated');
      socket.off('configData');
      socket.off('mapDataUpdated');
      socket.off('huntUpdated', onHuntUpdated);
      socket.off('huntSquad', onHuntSquad);
      socket.off('huntResult', onHuntResult);
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

  const applyResearch = (data: { techLevels: number[]; activeTechId: number; activeLevel: number; remainingSeconds: number } | null) => {
    setResearch(data);
    setLocalResearchRemaining(data?.remainingSeconds || 0);
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
      setLocalResearchRemaining(prev => Math.max(0, prev - 1));
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
      const bd = effectDefs[b.buffId];
      return { name: bd?.name || `Buff ${b.buffId}`, value: b.value, unit: bd?.unit || '' };
    });
  };

  const getBuildingName = (id: number) => buildingDB[id]?.name || buildingDB[id]?.nameTable || `ID ${id}`;
  const getBuildingNext = (id: number, level: number) => {
    const def = buildingDB[id];
    if (!def) return null;
    const next = def.levels?.[level + 1];
    return next ? { level: level + 1, ...next } : null;
  };

  // (imported from data/items.json via module-level constants)

  type ItemInfo = { name: string; gems?: number; type?: string; drops?: number[] };
  const itemData = itemsReady ? getItemsSync() : null;
  const ITEMS_DB_LOCAL: Record<number, ItemInfo> = {};
  const ITEM_VALUES_LOCAL: Record<number, number> = {};
  const RESOURCE_ITEM_IDS_LOCAL: Record<string, number[]> = {};
  if (itemData) {
    for (const [k, v] of Object.entries(itemData.ITEMS_DB || {})) ITEMS_DB_LOCAL[Number(k)] = v as ItemInfo;
    for (const [k, v] of Object.entries(itemData.ITEM_VALUES || {})) ITEM_VALUES_LOCAL[Number(k)] = v as number;
    for (const [k, v] of Object.entries(itemData.RESOURCE_ITEM_IDS || {})) RESOURCE_ITEM_IDS_LOCAL[k] = v as number[];
  }

  const computeBagTotal = (itemIds: number[]) => {
    let total = 0;
    if (!itemIds || itemIds.length === 0) return 0;
    for (const item of inventory) {
      const value = ITEM_VALUES_LOCAL[item.itemId];
      if (value && itemIds.includes(item.itemId)) {
        total += item.amount * value;
      }
    }
    return total;
  };

  const techsData = techsReady ? getTechsSync() : null;
  const TECH_MAP: Record<number, any> = {};
  const KIND_MAP: Record<number, { id: number; name: string }> = {};
  if (techsData) {
    for (const [k, v] of Object.entries(techsData.techs || {})) TECH_MAP[Number(k)] = v;
    for (const [k, v] of Object.entries(techsData.kinds || {})) KIND_MAP[Number(k)] = v as { id: number; name: string };
  }

  const researchLevels: number[] = research?.techLevels || [];

  const formatEffectValue = (unit: string, value: number) => {
    if (!value) return '';
    if (unit === '%') {
      const pct = value / 100;
      return `${pct % 1 === 0 ? pct : pct.toFixed(1)}%`;
    }
    return unit ? `${value} ${unit}` : `${value}`;
  };

  const techEffectText = (t: any, level: number) => {
    if (!t?.effect?.values?.length) return '';
    const idx = Math.min(Math.max(level, 1), t.effect.values.length) - 1;
    const value = t.effect.values[idx];
    if (!value && !t.effect.name) return '';
    return `${t.effect.name} ${formatEffectValue(t.effect.unit || '', value)}`.trim();
  };

  const filteredTechs = Object.values(TECH_MAP)
    .filter((t: any) => (techKindFilter === 'todas' || String(t.kind) === techKindFilter))
    .filter((t: any) => {
      const q = techSearch.trim().toLowerCase();
      return !q || `${t.name} ${t.nameEn}`.toLowerCase().includes(q);
    })
    .sort((a: any, b: any) => a.id - b.id);

  const researchStarted = researchLevels.filter(l => l > 0).length;
  const researchMaxed = researchLevels.filter((l, i) => {
    const t = TECH_MAP[i + 1];
    return !!t && t.levelMax > 0 && l === t.levelMax;
  }).length;
  const researchLevelsTotal = researchLevels.reduce((acc, l) => acc + l, 0);

  const talentLevels: number[] = talents?.levels || [];
  const talentsActive = talentLevels.filter(l => l > 0).length;
  const talentsTotal = talentLevels.reduce((acc, l) => acc + l, 0);

  const tabs = [
    { key: 'info' as const, label: 'Info' },
    { key: 'resources' as const, label: 'Recursos' },
    { key: 'wars' as const, label: 'Agrupaciones' },
    { key: 'logs' as const, label: 'Logs' },
    { key: 'chat' as const, label: 'Chat' },
    { key: 'config' as const, label: 'Config' },
    { key: 'camara' as const, label: 'Cámara' },
    { key: 'construcciones' as const, label: 'Construcciones' },
    { key: 'academia' as const, label: 'Academia' },
    { key: 'talentos' as const, label: 'Talentos' },
    { key: 'stats' as const, label: 'Player Stats' },
    { key: 'transmutacion' as const, label: 'Transmutación' },
    { key: 'cuartel' as const, label: 'Cuartel' },
    { key: 'lider' as const, label: 'Líder' },
    { key: 'enfermeria' as const, label: 'Enfermería' },
    { key: 'atalaya' as const, label: 'Atalaya' },
    { key: 'mapa' as const, label: 'Mapa' },
    { key: 'coliseo' as const, label: 'Coliseo' },
    { key: 'heroes' as const, label: 'Héroes' },
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

      <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 8, rowGap: 6, marginBottom: 16 }}>
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
          <div>
            <strong>Energía:</strong> {playerInfo.energy}
            {playerInfo.energyRegen && (
              <span style={{ color: colors.textSecondary }}>
                {' '}(+{Math.round(playerInfo.energyRegen.perHour)}/h
                {playerInfo.energyRegen.bonusPct > 0
                  ? ` · +${(playerInfo.energyRegen.bonusPct / 100).toFixed(1)}%`
                  : ''})
              </span>
            )}
          </div>
          <div>
            <strong>RES:</strong>{' '}
            {playerInfo.currentResistencia ?? 0}/{playerInfo.resistenciaMax ?? 120}
          </div>
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
                          <span key={j}>{b.name} {formatEffectValue(b.unit, b.value)} </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {ownMarches && (
            <div style={{ gridColumn: '1 / -1', marginTop: 8, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
              <strong>Marchas ({ownMarches.count}/{ownMarches.limit}):</strong>
              {ownMarches.entries.length === 0 && (
                <div style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>Sin marchas activas</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {ownMarches.entries.map(m => {
                  const arrivesAt = m.startAt + m.durationSec;
                  const remaining = Math.max(0, arrivesAt - Math.floor(now / 1000));
                  return (
                    <div key={m.index} style={{
                      background: '#0d1117', border: `1px solid ${colors.border}`, borderRadius: 6,
                      padding: '6px 10px', fontSize: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                    }}>
                      <span style={{ fontWeight: 600 }}>Slot {m.index}</span>
                      <span style={{
                        color: m.status === 'flying' ? colors.accent : m.status === 'arrived' ? colors.success : colors.warning,
                      }}>
                        {m.status === 'flying' ? 'En vuelo' : m.status === 'arrived' ? 'Llegó' : `0x${m.state.toString(16)}`}
                      </span>
                      <span>({m.destX},{m.destY})</span>
                      {m.name && <span>{m.name}</span>}
                      {m.status === 'flying' && m.startAt > 0 && (
                        <span style={{ color: colors.textSecondary }}>
                          llega {new Date(arrivesAt * 1000).toLocaleTimeString()} ·{' '}
                          {remaining > 0
                            ? `en ${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}m ${remaining % 60}s`
                            : 'ahora'}
                        </span>
                      )}
                      {m.troops.length > 0 && (
                        <span style={{ color: colors.textSecondary }}>
                          {m.troops.map(t => `${t.count} T${t.tier} ${['Inf', 'Arq', 'Cab', 'Asi'][t.type] ?? t.type}`).join(' + ')}
                        </span>
                      )}
                      {m.heroIds.length > 0 && (
                        <span style={{ color: colors.textSecondary }}>héroes: {m.heroIds.join(',')}</span>
                      )}
                    </div>
                  );
                })}
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
                const bagTotal = computeBagTotal(RESOURCE_ITEM_IDS_LOCAL[r.key] || []);
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
                    return info && info.type === invFilter;
                  })
                  .sort((a, b) => a.itemId - b.itemId)
                  .map(item => {
                    const info = ITEMS_DB_LOCAL[item.itemId];
                    const isChest = info && info.type === 'cofre';
                    return (
                      <div key={item.itemId} style={{
                        background: '#000', border: `1px solid ${colors.border}`,
                        borderRadius: 6, padding: '8px 12px', minWidth: 140,
                        cursor: isChest ? 'context-menu' : 'default',
                        position: 'relative',
                      }} onContextMenu={isChest ? (e) => { e.preventDefault(); setChestDialog({ itemId: item.itemId, max: item.amount }); setChestQty(Math.min(item.amount, 100)); } : undefined}>
                        <div style={{ fontSize: 13, color: colors.text }}>{info?.name || `Item #${item.itemId}`}</div>
                        <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                          x{item.amount}{info && typeof info.gems === 'number' && info.gems >= 0 ? ` (${info.gems} gemas)` : ''}
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
        <ConfigPanel
          config={botConfig}
          socket={socket}
          iggId={iggId}
          colors={colors}
          supplyCapacity={playerStats.find((s: any) => s.name === 'Capacidad de suministro +')?.total || 0}
        />
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
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{getBuildingName(c.id)}</div>
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
                .sort((a, b) => getBuildingName(a.id).localeCompare(getBuildingName(b.id)))
                .map((b, i) => {
                  const inProgress = localConstructions.find(c => c.id === b.id && c.position === b.position);
                  const def = buildingDB[b.id];
                  const next = getBuildingNext(b.id, b.level);
                  return (
                    <div key={i} style={{
                      background: colors.surface, border: `1px solid ${inProgress ? '#e6a817' : colors.border}`,
                      borderRadius: 10, padding: '14px 16px', width: 200,
                      display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: colors.text }}>{getBuildingName(b.id)}</div>
                      {def?.temporal && (
                        <div style={{ fontSize: 11, color: '#e6a817' }}>
                          Potenciador temporal — sólo al ejecutar un líder
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.textSecondary }}>
                        <span>Nivel <strong style={{ color: colors.text }}>{b.level}</strong></span>
                        <span>0x{b.position.toString(16).toUpperCase()}</span>
                      </div>
                      {inProgress && (
                        <div style={{ fontSize: 12, color: '#e6a817', borderTop: `1px solid ${colors.border}`, paddingTop: 4, marginTop: 2 }}>
                          Subiendo a nivel {inProgress.level} — {formatTime(inProgress.remaining)}
                        </div>
                      )}
                      {def && next && (
                        <div style={{ fontSize: 12, color: colors.textSecondary, borderTop: `1px solid ${colors.border}`, paddingTop: 4, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div>Nivel {next.level} — {formatTime(next.time)}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px' }}>
                            {BUILDING_COST_ORDER.some(k => (next.costs?.[k] || 0) > 0)
                              ? BUILDING_COST_ORDER.filter(k => (next.costs?.[k] || 0) > 0).map(k => (
                                <span key={k}>{BUILDING_COST_LABELS[k]} {formatRes(next.costs[k])}</span>
                              ))
                              : <span>Sin costo</span>}
                          </div>
                        </div>
                      )}
                      {def && !next && (
                        <div style={{ fontSize: 12, color: colors.textSecondary, borderTop: `1px solid ${colors.border}`, paddingTop: 4, marginTop: 2 }}>
                          Nivel máximo ({def.maxLevel})
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'academia' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: 8, padding: 16,
          }}>
            {!research ? (
              <div style={{ color: colors.textSecondary }}>Esperando datos de la Academia...</div>
            ) : research.activeTechId > 0 && localResearchRemaining > 0 ? (() => {
              const t = TECH_MAP[research.activeTechId];
              const lvl = research.activeLevel;
              const total = t?.times?.[lvl] || 0;
              const pct = total > 0 ? Math.max(0, Math.min(100, ((total - localResearchRemaining) / total) * 100)) : 0;
              return (
                <div>
                  <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>Investigación en curso</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>
                        {t ? t.name : `Investigación ${research.activeTechId}`}
                        <span style={{ color: colors.textSecondary, fontWeight: 400, marginLeft: 8 }}>→ nivel {lvl}</span>
                      </div>
                      {t && lvl > 0 && (
                        <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{techEffectText(t, lvl)}</div>
                      )}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap' }}>{formatTime(localResearchRemaining)}</div>
                  </div>
                  <div style={{ marginTop: 10, height: 6, background: 'rgba(128,128,128,0.25)', borderRadius: 4 }}>
                    <div style={{ width: `${pct}%`, height: 6, background: '#e6a817', borderRadius: 4, transition: 'width 1s linear' }} />
                  </div>
                </div>
              );
            })() : (
              <div style={{ color: colors.textSecondary }}>Sin investigación en curso</div>
            )}
            {research && (
              <div style={{ display: 'flex', gap: 20, marginTop: 14, fontSize: 13, color: colors.textSecondary, flexWrap: 'wrap' }}>
                <span>Investigadas: <strong style={{ color: colors.text }}>{researchStarted} / {Object.keys(TECH_MAP).length}</strong></span>
                <span>Al nivel máximo: <strong style={{ color: colors.text }}>{researchMaxed}</strong></span>
                <span>En curso: <strong style={{ color: colors.text }}>{research.activeTechId > 0 ? TECH_MAP[research.activeTechId]?.name || research.activeTechId : '—'}</strong></span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={techSearch}
              onChange={e => setTechSearch(e.target.value)}
              placeholder="Buscar investigación..."
              style={{
                background: colors.surface, border: `1px solid ${colors.border}`,
                borderRadius: 6, color: colors.text, padding: '6px 10px', minWidth: 220, fontSize: 13,
              }}
            />
            <select
              value={techKindFilter}
              onChange={e => setTechKindFilter(e.target.value)}
              style={{
                background: colors.surface, border: `1px solid ${colors.border}`,
                borderRadius: 6, color: colors.text, padding: '6px 8px', fontSize: 13,
              }}
            >
              <option value="todas">Todas las categorías</option>
              {Object.values(KIND_MAP)
                .sort((a, b) => a.id - b.id)
                .map(k => <option key={k.id} value={String(k.id)}>{k.name}</option>)}
            </select>
            <span style={{ fontSize: 12, color: colors.textSecondary }}>{filteredTechs.length} investigaciones</span>
          </div>

          {filteredTechs.length === 0 ? (
            <div style={{
              background: colors.surface, border: `1px solid ${colors.border}`,
              borderRadius: 8, padding: 16, color: colors.textSecondary,
            }}>
              {techsReady ? 'No se encontraron investigaciones' : 'Cargando catálogo de investigaciones...'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {filteredTechs.map(t => {
                const lvl = researchLevels[t.id - 1] || 0;
                const maxed = t.levelMax > 0 && lvl >= t.levelMax;
                const isActive = research ? research.activeTechId === t.id : false;
                const activeLevel = research?.activeLevel || 0;
                return (
                  <div key={t.id} style={{
                    width: 240, background: colors.surface,
                    border: `1px solid ${isActive ? '#e6a817' : colors.border}`,
                    borderRadius: 10, padding: '12px 14px',
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: colors.text }}>{t.name}</span>
                      <span style={{ fontSize: 12, color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                        <strong style={{ color: maxed ? colors.success : lvl > 0 ? colors.text : colors.textSecondary }}>{lvl}</strong>/{t.levelMax}
                      </span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(128,128,128,0.25)', borderRadius: 3 }}>
                      <div style={{
                        width: `${t.levelMax > 0 ? Math.min(100, (lvl / t.levelMax) * 100) : 0}%`,
                        height: 5, borderRadius: 3,
                        background: maxed ? colors.success : '#4a90d9',
                      }} />
                    </div>
                    <div style={{ fontSize: 12, color: colors.textSecondary }}>{techEffectText(t, Math.max(lvl, 1))}</div>
                    <div style={{ fontSize: 11, color: colors.textSecondary, opacity: 0.8 }}>
                      {KIND_MAP[t.kind]?.name || `Kind ${t.kind}`}
                    </div>
                    {isActive && (
                      <div style={{ fontSize: 12, color: '#e6a817', borderTop: `1px solid ${colors.border}`, paddingTop: 5 }}>
                        En curso: nivel {activeLevel} — {formatTime(localResearchRemaining)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'talentos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: 8, padding: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Talentos</div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, color: colors.textSecondary }}>
                <span>Invertidos: <strong style={{ color: colors.text }}>{talentsTotal}</strong></span>
                <span>Sin asignar: <strong style={{ color: colors.text }}>{talents?.unassigned ?? 0}</strong></span>
                <span>Activos: <strong style={{ color: colors.text }}>{talentsActive} / {Object.keys(talentDB).length}</strong></span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 6 }}>
              Sólo se muestran los talentos con puntos invertidos, agrupados por rama del árbol.
            </div>
          </div>

          {!talents ? (
            <div style={{
              background: colors.surface, border: `1px solid ${colors.border}`,
              borderRadius: 8, padding: 16, color: colors.textSecondary,
            }}>
              Esperando datos de talentos (proto 3801)...
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
              {talentBranches.map(br => {
                const branchTalents = (br.talents || [])
                  .map(id => ({ id, def: talentDB[id], level: talentLevels[id - 1] || 0 }))
                  .filter(t => !!t.def && t.level > 0)
                  .sort((a, b) => a.def.row - b.def.row);
                const branchSpent = (br.talents || []).reduce((acc, id) => acc + (talentLevels[id - 1] || 0), 0);
                return (
                  <div key={br.id} style={{
                    background: colors.surface, border: `1px solid ${colors.border}`,
                    borderRadius: 10, padding: 14,
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: colors.text }}>{br.name}</span>
                      <span style={{ fontSize: 12, color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                        {branchTalents.length} activos · {branchSpent} pts
                      </span>
                    </div>
                    {branchTalents.length === 0 ? (
                      <div style={{ fontSize: 12, color: colors.textSecondary }}>Sin puntos invertidos</div>
                    ) : (
                      branchTalents.map(t => {
                        const fx = effectDefs[t.def.effectId];
                        const value = t.def.levels[t.level] || 0;
                        const pct = t.def.maxLevel > 0 ? Math.min(100, (t.level / t.def.maxLevel) * 100) : 0;
                        return (
                          <div key={t.id} style={{
                            display: 'flex', flexDirection: 'column', gap: 3,
                            borderTop: `1px solid ${colors.border}`, paddingTop: 6,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                              <span style={{ color: colors.text, fontWeight: 600 }}>{t.def.name}</span>
                              <span style={{ color: colors.success, whiteSpace: 'nowrap' }}>
                                {formatEffectValue(fx?.unit || '', value)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: colors.textSecondary }}>
                              <span>Nivel {t.level} / {t.def.maxLevel}</span>
                              {fx?.name && fx.name !== t.def.name ? <span>{fx.name}</span> : <span />}
                            </div>
                            <div style={{ height: 4, background: colors.border, borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: '#4a90d9' }} />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'stats' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: 8, padding: 16,
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Stats del jugador</div>
            {!research ? (
              <div style={{ color: colors.textSecondary }}>Esperando datos de la Academia...</div>
            ) : (
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: colors.textSecondary }}>
                <span>Investigaciones: <strong style={{ color: colors.text }}>{researchStarted} / {Object.keys(TECH_MAP).length}</strong></span>
                <span>Niveles invertidos: <strong style={{ color: colors.text }}>{researchLevelsTotal}</strong></span>
                <span>Al nivel máximo: <strong style={{ color: colors.text }}>{researchMaxed}</strong></span>
                <span>Stats acumulados: <strong style={{ color: colors.text }}>{playerStats.length}</strong></span>
                <span>Construcciones: <strong style={{ color: colors.text }}>{buildingState.buildings.filter(b => b.level > 0).length}</strong></span>
                <span>Talentos: <strong style={{ color: colors.text }}>{talentsActive} activos</strong></span>
                <span style={{ opacity: 0.8 }}>Reino = efecto local (producción/almacenamiento)</span>
              </div>
            )}
          </div>

          {playerStats.length === 0 ? (
            <div style={{
              background: colors.surface, border: `1px solid ${colors.border}`,
              borderRadius: 8, padding: 16, color: colors.textSecondary,
            }}>
              {research ? 'Todavía no hay stats (investigaciones, trajes, construcciones o talentos)' : 'Esperando datos de la Academia...'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
              {playerStats.map(s => {
                const open = statsOpenKey === s.key;
                return (
                  <div
                    key={s.key}
                    onClick={() => setStatsOpenKey(open ? null : s.key)}
                    style={{
                      background: colors.surface,
                      border: `1px solid ${open ? '#4a90d9' : colors.border}`,
                      borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: colors.text }}>{s.name}</span>
                      <span style={{ fontWeight: 700, fontSize: 14, color: colors.success, whiteSpace: 'nowrap' }}>
                        {formatEffectValue(s.unit, s.total)}
                        {s.bonusPct != null && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: colors.textSecondary, marginLeft: 6 }}>
                            {formatEffectValue('', s.baseTotal ?? 0)} + {formatEffectValue('%', s.bonusPct)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: colors.textSecondary }}>
                      {s.count} {s.count === 1 ? 'aporte' : 'aportes'} · {s.contributions?.length || 0} {s.contributions?.length === 1 ? 'fuente' : 'fuentes'} {open ? '▲' : '▼'}
                    </div>
                    {open && (
                      <div style={{
                        marginTop: 4, borderTop: `1px solid ${colors.border}`, paddingTop: 6,
                        display: 'flex', flexDirection: 'column', gap: 8,
                      }}>
                        {(s.contributions || []).map((c: any) => (
                          <div key={c.source} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{
                              display: 'flex', justifyContent: 'space-between', gap: 8,
                              fontSize: 12, fontWeight: 600, color: colors.text,
                            }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {c.label}
                                {c.scope === 'local' && (
                                  <span style={{
                                    fontSize: 10, fontWeight: 600, color: '#e6a817',
                                    border: '1px solid #e6a817', borderRadius: 4, padding: '0 4px',
                                  }}>Reino</span>
                                )}
                              </span>
                              <span>{formatEffectValue(c.unit ?? s.unit, c.total)}</span>
                            </div>
                            {[...c.items].sort((a: any, b: any) => b.value - a.value).map((it: any, idx: number) => (
                              <div key={`${it.id}-${it.level ?? ''}-${idx}`} style={{
                                display: 'flex', justifyContent: 'space-between', gap: 8,
                                fontSize: 12, color: colors.textSecondary, paddingLeft: 8,
                              }}>
                                <span>{it.name}{it.level ? <span style={{ opacity: 0.7 }}> {c.source === 'costume' ? `G${it.level}` : `nv ${it.level}`}</span> : null}</span>
                                <span style={{ color: colors.text, whiteSpace: 'nowrap' }}>{formatEffectValue(it.unit ?? s.unit, it.value)}</span>
                              </div>
                            ))}
                          </div>
                        ))}
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

      {activeTab === 'heroes' && (
        <div style={{
          background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: 8, padding: 16,
        }}>
          {heroes.length === 0 ? (
            <div style={{ color: colors.textSecondary }}>Esperando datos de héroes...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>
                {heroes.length} héroes — nivel máx {Math.max(...heroes.map(h => h.level))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                {[...heroes].sort((a, b) => b.level - a.level || a.heroId - b.heroId).map(h => (
                  <div key={h.heroId} style={{
                    border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px',
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontWeight: 700 }} title={h.nameEn}>{h.name}</span>
                      <span style={{ fontSize: 12, color: colors.textSecondary }}>#{h.heroId}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
                      <span style={{ background: 'rgba(88,166,255,.15)', color: colors.primary, borderRadius: 4, padding: '1px 6px' }}>Nv {h.level}</span>
                      <span style={{ background: 'rgba(188,140,255,.15)', color: colors.accent, borderRadius: 4, padding: '1px 6px' }}>Rango {h.rank}</span>
                      <span style={{ background: 'rgba(63,185,80,.15)', color: colors.success, borderRadius: 4, padding: '1px 6px' }}>Grado {h.grade}</span>
                      <span style={{ color: colors.textSecondary }}>{h.power.toLocaleString()} poder</span>
                    </div>
                    {h.skills.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {h.skills.map(s => (
                          <span key={s.id} title={s.nameEn} style={{ fontSize: 11, border: `1px solid ${colors.border}`, borderRadius: 4, padding: '1px 5px' }}>{s.name}</span>
                        ))}
                      </div>
                    )}
                    {h.battleSkills.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {h.battleSkills.map(s => (
                          <span key={s.id} title={s.nameEn} style={{ fontSize: 11, border: `1px solid ${colors.accent}`, color: colors.accent, borderRadius: 4, padding: '1px 5px' }}>{s.name}</span>
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
                          <div key={j}>{b.name} {formatEffectValue(b.unit, b.value)}</div>
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
                      {m.packet?.lineType === 10 && <span style={{ color: '#4ade80', marginLeft: 6 }}>🤝 Refuerzo</span>}
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
          energy={playerInfo?.energy ?? 0}
          huntTarget={huntTarget}
          huntMsg={huntMsg}
          huntConfig={botConfig?.hunt}
          squads={huntSquads}
          onHunt={(tileId) => socket.emit('huntMonster', { iggId, tileId })}
          onHuntStop={() => socket.emit('huntStop', { iggId })}
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
              <button onClick={() => { setShowSupplyDialog(false); setSupplyResult(null); setSupplyStopping(false); }}>Cancelar</button>
              {supplySending && (
                <button
                  disabled={supplyStopping}
                  onClick={() => { setSupplyStopping(true); socket.emit('stopManualSupply', { iggId }); }}
                  style={{
                    border: `1px solid ${supplyStopping ? colors.border : '#f8717166'}`,
                    color: supplyStopping ? colors.textSecondary : '#f87171',
                    cursor: supplyStopping ? 'default' : 'pointer',
                  }}
                >
                  {supplyStopping ? 'Deteniendo…' : '⏹ Parar'}
                </button>
              )}
              <button
                className="primary"
                disabled={supplySending || !supplyTarget.trim()}
                onClick={() => {
                  const checks = document.querySelectorAll('[data-resource]');
                  const res: string[] = [];
                  checks.forEach(c => { if ((c as HTMLInputElement).checked) res.push(c.getAttribute('data-resource')!); });
                  setSupplySending(true);
                  setSupplyStopping(false);
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

const BUILDING_COST_ORDER = ['food', 'stone', 'timber', 'ore', 'gold'];
const BUILDING_COST_LABELS: Record<string, string> = {
  food: 'Comida', stone: 'Piedra', timber: 'Madera', ore: 'Mineral', gold: 'Oro',
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

function ConfigPanel({ config, socket, iggId, colors, supplyCapacity }: { config: any; socket: any; iggId: number; colors: any; supplyCapacity?: number }) {
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

  const fmtCap = (v?: number) =>
    !v || v <= 0
      ? 'sin datos (investigaciones/construcciones)'
      : v >= 1e6
        ? `${(v / 1e6).toFixed(2)}M`
        : String(v);

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
        <NumInput label="Límite caravanas" {...set('supply.caravanLimit')} />
        <div style={{ fontSize: 12, color: '#888' }}>
          Capacidad por caravana: {fmtCap(supplyCapacity)} — stat "Capacidad de suministro +", no es
          configurable.
        </div>
      </Section>

      <Section title="Caza (monstruos 2488)">
        <Toggle label="Caza automática" {...bool('hunt.enable')} />
        <NumInput label="Cooldown entre golpes" {...set('hunt.cooldown')} suffix="s" />
        <NumInput label="Radio de escaneo del mapa" {...set('hunt.scanRadius')} suffix="tiles" />
        <Toggle label="Squad compartido (varios bots al mismo bicho)" {...bool('hunt.squad.enable')} />
        <NumInput label="Máx. bots por bicho" {...set('hunt.squad.max')} />
        <div style={{ fontSize: 12, color: '#888' }}>
          Los bots miden el HP restante y el daño medio: con el bicho casi muerto va 1 solo; con HP
          alto se reparten hasta el máximo. Squad apagado = 1 bot por bicho.
        </div>
        <div style={{ fontSize: 12, color: '#888' }}>
          Por nivel: hex del 2488 sin la coord (va 3 bytes de coord al frente). Dos hex: el que se
          usa depende de contra qué es débil el bicho (Noceros = magia, Buen Apetito = físico). El
          costo de energía por golpe se calcula solo (base del nivel − ahorro de investigación).
        </div>
        {(getDeep(draft, 'hunt.levels') || []).map((lv: any, idx: number) => {
          const levels: any[] = getDeep(draft, 'hunt.levels') || [];
          const setLevels = (next: any[]) => {
            setDraft((d: any) => setDeep(d, 'hunt.levels', next));
            setChanged(true);
          };
          const upd = (patch: any) => setLevels(levels.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
          const lvlInput: React.CSSProperties = { width: 60, padding: '2px 6px' };
          return (
            <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Nivel</span>
              <input type="number" value={lv.level ?? 0} onChange={e => upd({ level: Number(e.target.value) })} style={lvlInput} />
              <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Magia</span>
              <input
                type="text"
                value={lv.payloadHexMagia || lv.payloadHex || ''}
                onChange={e => upd({ payloadHexMagia: e.target.value })}
                placeholder="hex débil contra magia"
                style={{ flex: 1, minWidth: 150, padding: '2px 6px', fontSize: 12, fontFamily: 'monospace' }}
              />
              <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Físico</span>
              <input
                type="text"
                value={lv.payloadHexFisico || lv.payloadHex || ''}
                onChange={e => upd({ payloadHexFisico: e.target.value })}
                placeholder="hex débil contra físico"
                style={{ flex: 1, minWidth: 150, padding: '2px 6px', fontSize: 12, fontFamily: 'monospace' }}
              />
              <button onClick={() => setLevels(levels.filter((_, i) => i !== idx))} style={{ padding: '2px 7px', cursor: 'pointer' }}>X</button>
            </div>
          );
        })}
        <button
          onClick={() => {
            const levels: any[] = getDeep(draft, 'hunt.levels') || [];
            setDraft((d: any) => setDeep(d, 'hunt.levels', [
              ...levels,
              { level: (levels[levels.length - 1]?.level ?? 1) + 1, payloadHexMagia: '', payloadHexFisico: '' },
            ]));
            setChanged(true);
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
          Si hay cofres de Carta de la Suerte en el mapa, el bot consulta el cofre (2202) y si
          todavía no lo reclamó manda la tropa a buscar la carta (9866). Una búsqueda por cuenta
          hasta que la tropa vuelve. Con 3 nueves en mano canjea solo (9864, p.ej. 999 gems) y deja
          de buscar cofres hasta el próximo evento.
        </div>
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
