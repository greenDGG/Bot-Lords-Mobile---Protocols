import React, { useState, useCallback } from 'react';
import MainPage from './components/MainPage';
import BotDetail from './components/BotDetail';
import { GlobalStyles, colors } from './components/Theme';
import { useNotifications } from './hooks/useNotifications';

interface Tab {
  iggId: number;
  name: string;
}

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  useNotifications();

  const openTab = useCallback((iggId: number, playerName?: string) => {
    setTabs(prev => {
      if (prev.some(t => t.iggId === iggId)) return prev;
      return [...prev, { iggId, name: playerName || `IGG ${iggId}` }];
    });
    setActiveId(iggId);
  }, []);

  const closeTab = useCallback((iggId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(prev => {
      const idx = prev.findIndex(t => t.iggId === iggId);
      const next = prev.filter(t => t.iggId !== iggId);
      if (activeId === iggId) {
        if (next.length > 0) {
          setActiveId(next[Math.min(idx, next.length - 1)].iggId);
        } else {
          setActiveId(null);
        }
      }
      return next;
    });
  }, [activeId]);

  const goMain = useCallback(() => setActiveId(null), []);

  return (
    <>
      <GlobalStyles />
      <div style={{ minHeight: '100vh', background: '#0d1117', color: '#c9d1d9', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0, background: '#161b22',
          borderBottom: `1px solid ${colors.border}`, padding: '4px 8px 0 8px', flexShrink: 0,
        }}>
          <div
            onClick={goMain}
            style={{
              padding: '6px 14px', cursor: 'pointer', fontSize: 13, userSelect: 'none',
              borderTopLeftRadius: 6, borderTopRightRadius: 6,
              background: activeId === null ? '#0d1117' : 'transparent',
              border: activeId === null ? `1px solid ${colors.border}` : '1px solid transparent',
              borderBottom: activeId === null ? '1px solid #0d1117' : '1px solid transparent',
              marginBottom: -1, color: activeId === null ? colors.text : colors.textSecondary,
              fontWeight: activeId === null ? 600 : 400,
            }}
          >🏠 Principal</div>
          {tabs.map(tab => {
            const isActive = activeId === tab.iggId;
            return (
              <div
                key={tab.iggId}
                onClick={() => setActiveId(tab.iggId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 8px 6px 14px', cursor: 'pointer', fontSize: 13, userSelect: 'none',
                  borderTopLeftRadius: 6, borderTopRightRadius: 6,
                  background: isActive ? '#0d1117' : 'transparent',
                  border: isActive ? `1px solid ${colors.border}` : '1px solid transparent',
                  borderBottom: isActive ? '1px solid #0d1117' : '1px solid transparent',
                  marginBottom: -1, color: isActive ? colors.text : colors.textSecondary,
                  fontWeight: isActive ? 600 : 400, maxWidth: 180,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tab.name}
                </span>
                <span
                  onClick={(e) => closeTab(tab.iggId, e)}
                  style={{
                    fontSize: 14, lineHeight: 1, padding: '0 4px', borderRadius: 3,
                    color: colors.textSecondary, cursor: 'pointer',
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = '#21262d')}
                  onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                >×</span>
              </div>
            );
          })}
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {activeId === null ? (
            <MainPage onSelectBot={(id, name) => openTab(id, name)} />
          ) : (
            <BotDetail iggId={activeId} onBack={goMain} />
          )}
        </div>
      </div>
    </>
  );
}
