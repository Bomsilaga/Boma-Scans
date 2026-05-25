'use client';
import { useState } from 'react';
import AnalysePanel from '@/components/AnalysePanel';
import ScannerPanel from '@/components/ScannerPanel';
import AISettingsModal from '@/components/AISettingsModal';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAutoScan } from '@/hooks/useAutoScan';
import { useAISettings } from '@/hooks/useAISettings';

type View = 'analyse' | 'scanner';

const NAV = [
  { id: 'analyse' as View, label: 'Analyse',  icon: '🔬' },
  { id: 'scanner' as View, label: 'AutoScan', icon: '🌐' },
];

function NotificationBell() {
  const { state, subscribe, unsubscribe } = usePushNotifications();

  if (state === 'unsupported') return null;

  const label =
    state === 'subscribed'   ? '🔔' :
    state === 'denied'       ? '🔕' :
    state === 'loading'      ? '⏳' : '🔔';

  const title =
    state === 'subscribed'   ? 'Notifications ON — click to disable' :
    state === 'denied'       ? 'Notifications blocked in browser settings' :
    state === 'loading'      ? 'Loading…' : 'Enable alert notifications (score ≥ 80)';

  return (
    <button
      onClick={state === 'subscribed' ? unsubscribe : subscribe}
      disabled={state === 'loading' || state === 'denied'}
      title={title}
      style={{
        fontSize: 18, background: 'transparent', border: 'none', cursor: state === 'denied' ? 'not-allowed' : 'pointer',
        opacity: state === 'denied' ? 0.4 : 1, padding: '4px 6px', borderRadius: 8,
        position: 'relative',
      }}
    >
      {label}
      {state === 'subscribed' && (
        <span style={{
          position: 'absolute', top: 2, right: 2, width: 7, height: 7,
          borderRadius: '50%', background: '#00d4aa', border: '1px solid #0a0a0f',
        }} />
      )}
    </button>
  );
}

export default function Home() {
  const [view, setView] = useState<View>('scanner');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [showAISettings, setShowAISettings] = useState(false);
  const aiSettings = useAISettings();
  useAutoScan();

  function handleSelectSymbol(sym: string) {
    setSymbol(sym);
    setView('analyse');
  }

  const hasAIKey = !!aiSettings.activeKey;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-lg">
              🛰️
            </div>
            <span className="font-bold text-text-primary text-sm hidden sm:block">Boma Scans</span>
            <span className="text-text-muted text-xs hidden sm:block">Elite Crypto Signal Bot</span>
          </div>

          <nav className="flex items-center gap-1 ml-auto">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  view === item.id
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-muted'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}

            {/* AI Settings button */}
            <button
              onClick={() => setShowAISettings(true)}
              title={hasAIKey ? `AI: ${aiSettings.settings.provider.toUpperCase()} active` : 'Configure AI analysis provider'}
              style={{
                fontSize: 16, background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '4px 6px', borderRadius: 8, position: 'relative',
                opacity: hasAIKey ? 1 : 0.6,
              }}
            >
              🤖
              {hasAIKey && (
                <span style={{
                  position: 'absolute', top: 2, right: 2, width: 7, height: 7,
                  borderRadius: '50%', background: '#00d4aa', border: '1px solid #0a0a0f',
                }} />
              )}
            </button>

            <NotificationBell />
          </nav>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 py-4">
        {view === 'analyse' && (
          <AnalysePanel
            initialSymbol={symbol}
            onBack={() => setView('scanner')}
            aiProvider={aiSettings.settings.provider}
            aiApiKey={aiSettings.activeKey}
          />
        )}
        {view === 'scanner' && (
          <ScannerPanel
            onSelect={handleSelectSymbol}
            aiProvider={aiSettings.settings.provider}
            aiApiKey={aiSettings.activeKey}
          />
        )}
      </main>

      {showAISettings && (
        <AISettingsModal
          settings={aiSettings.settings}
          onSetProvider={aiSettings.setProvider}
          onSetKey={aiSettings.setKey}
          onClose={() => setShowAISettings(false)}
        />
      )}
    </div>
  );
}
