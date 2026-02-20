import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Search, FileText, BarChart3, ShieldCheck, MousePointer, Moon, Sun, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTrimbleConnect, TrimbleProvider } from '@/hooks/useTrimbleConnect';
import { getSelectedObjectProperties } from '@/services/viewerBridge';

const ExplorerTab = lazy(() => import('@/components/tabs/ExplorerTab').then(m => ({ default: m.ExplorerTab })));
const FicheTechniqueTab = lazy(() => import('@/components/tabs/FicheTechniqueTab').then(m => ({ default: m.FicheTechniqueTab })));
const StatistiquesTab = lazy(() => import('@/components/tabs/StatistiquesTab').then(m => ({ default: m.StatistiquesTab })));
const IDSCheckerTab = lazy(() => import('@/components/tabs/IDSCheckerTab').then(m => ({ default: m.IDSCheckerTab })));

const tabs = [
  { id: 'explorer', label: 'Explorer', icon: Search },
  { id: 'fiche', label: 'Fiche technique', icon: FileText },
  { id: 'stats', label: 'Statistiques', icon: BarChart3 },
  { id: 'ids', label: 'Validateur IDS', icon: ShieldCheck },
] as const;

type TabId = (typeof tabs)[number]['id'];

function TabFallback() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <Loader2 className="size-6 animate-spin mb-2 text-primary" />
      <p className="text-xs">Chargement...</p>
    </div>
  );
}

function useTheme() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('theme');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return { dark, toggle: useCallback(() => setDark((d) => !d), []) };
}

// ── Error Boundary ──

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryState { hasError: boolean; error: Error | null }

class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center h-full text-center p-6">
          <div className="size-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-3">
            <span className="text-2xl">⚠</span>
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Une erreur est survenue</p>
          <p className="text-xs text-muted-foreground max-w-[280px] mb-3">
            {this.state.error?.message ?? 'Erreur inattendue'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium"
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── App ──

export default function App() {
  const trimble = useTrimbleConnect();
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<TabId>('ids');
  const [selectionInfo, setSelectionInfo] = useState<{ name: string; type: string } | null>(null);

  const selectionCount = useMemo(
    () => trimble.selection.reduce((s, sel) => s + sel.objectRuntimeIds.length, 0),
    [trimble.selection],
  );

  useEffect(() => {
    if (selectionCount === 0) {
      setSelectionInfo(null);
      return;
    }
    getSelectedObjectProperties(trimble.api, trimble.selection).then((objs) => {
      if (objs.length > 0) setSelectionInfo({ name: objs[0].name, type: objs[0].type });
    });
  }, [trimble.api, trimble.selection, selectionCount]);

  return (
    <TrimbleProvider value={trimble}>
      <div className="flex flex-col h-screen bg-background">
        {/* Header */}
        <header className="shrink-0 border-b bg-card px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="size-5 rounded-md bg-primary flex items-center justify-center">
                <ShieldCheck className="size-3 text-primary-foreground" />
              </div>
              <span className="font-semibold text-sm">Navigateur et Validateur</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={theme.toggle}
                className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground"
                title={theme.dark ? 'Mode clair' : 'Mode sombre'}
              >
                {theme.dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
              </button>
              <div className="flex items-center gap-1.5 text-xs">
                <div className={cn("size-2 rounded-full", trimble.isConnected ? "bg-emerald-500" : "bg-red-500")} />
                <span className="text-muted-foreground hidden sm:inline">
                  {trimble.isConnected
                    ? trimble.isEmbedded ? `${trimble.project?.name ?? 'Connecté'}` : 'Connecté'
                    : 'Déconnecté'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Sub-header */}
        <div className="shrink-0 px-3 py-1 text-xs bg-muted/30 border-b flex items-center gap-2">
          {selectionCount > 0 ? (
            <>
              <MousePointer className="size-3 text-primary shrink-0" />
              <span className="text-primary font-medium">{selectionCount}</span>
              {selectionInfo && (
                <>
                  <span className="text-muted-foreground">—</span>
                  <span className="text-foreground font-medium truncate">{selectionInfo.name}</span>
                  <span className="text-muted-foreground shrink-0">({selectionInfo.type})</span>
                </>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Sélectionnez un élément dans la vue 3D</span>
          )}
        </div>

        {/* Tab navigation */}
        <nav className="shrink-0 border-b bg-card">
          <div className="flex">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1 px-3 py-2 text-xs font-medium transition-all relative",
                    "hover:bg-accent/50",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Tab content */}
        <main className="flex-1 overflow-hidden">
          <ErrorBoundary>
            <Suspense fallback={<TabFallback />}>
              <div className="h-full animate-fade-in">
                {activeTab === 'explorer' && <ExplorerTab />}
                {activeTab === 'fiche' && <FicheTechniqueTab />}
                {activeTab === 'stats' && <StatistiquesTab />}
                {activeTab === 'ids' && <IDSCheckerTab />}
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </TrimbleProvider>
  );
}
