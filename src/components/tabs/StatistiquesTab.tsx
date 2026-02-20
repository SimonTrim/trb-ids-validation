import { useState, useCallback, useRef, useEffect } from 'react';
import {
  BarChart3, PieChart as PieChartIcon, Layers, Box, Ruler,
  TrendingUp, Building2, Boxes, Settings2, GripVertical,
  Eye, EyeOff, ChevronDown, RotateCcw, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { mockStatistics } from '@/data/mockData';
import { useTrimbleContext } from '@/hooks/useTrimbleConnect';
import { computeModelStatistics } from '@/services/viewerBridge';
import type { ModelStatistics } from '@/types';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#0063a3', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#ec4899'];

const statIcons: Record<string, typeof BarChart3> = {
  'Surface totale': Ruler,
  'Volume total': Box,
  'Hauteur max': Building2,
  'Longueur murs': Layers,
  'Surface vitrée': Boxes,
  'Ratio vitrage': TrendingUp,
};

function hexToRgba(hex: string, alpha: number): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(107,114,128,${alpha})`;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } catch {
    return `rgba(107,114,128,${alpha})`;
  }
}

// Every single tile is an independent draggable item
type TileSize = 'third' | 'half' | 'full';

interface TileConfig {
  id: string;
  label: string;
  visible: boolean;
  size: TileSize;
}

const defaultTiles: TileConfig[] = [
  { id: 'sum-elements', label: 'Éléments', visible: true, size: 'third' },
  { id: 'sum-levels', label: 'Niveaux', visible: true, size: 'third' },
  { id: 'sum-types', label: 'Types', visible: true, size: 'third' },
  { id: 'prop-surface', label: 'Surface totale', visible: true, size: 'half' },
  { id: 'prop-volume', label: 'Volume total', visible: true, size: 'half' },
  { id: 'prop-hauteur', label: 'Hauteur max', visible: true, size: 'half' },
  { id: 'prop-murs', label: 'Longueur murs', visible: true, size: 'half' },
  { id: 'prop-vitree', label: 'Surface vitrée', visible: true, size: 'half' },
  { id: 'prop-ratio', label: 'Ratio vitrage', visible: true, size: 'half' },
  { id: 'ifc-pie', label: 'Distribution classes IFC', visible: true, size: 'full' },
  { id: 'level-bar', label: 'Éléments par niveau', visible: true, size: 'full' },
  { id: 'material-bars', label: 'Distribution matériaux', visible: true, size: 'full' },
];

export function StatistiquesTab() {
  const { api } = useTrimbleContext();
  const [stats, setStats] = useState<ModelStatistics>(mockStatistics);
  const [statsLoading, setStatsLoading] = useState(true);
  const [tiles, setTiles] = useState<TileConfig[]>(defaultTiles);
  const [showSettings, setShowSettings] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    computeModelStatistics(api).then((s) => {
      if (!cancelled) {
        setStats(s);
        setStatsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [api]);

  const toggleVisibility = useCallback((id: string) => {
    setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, visible: !t.visible } : t)));
  }, []);

  const resetTiles = useCallback(() => setTiles(defaultTiles), []);

  const onDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedId && draggedId !== id) setDragOverId(id);
  }, [draggedId]);

  const onDrop = useCallback((targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    setTiles((prev) => {
      const arr = [...prev];
      const fi = arr.findIndex((t) => t.id === draggedId);
      const ti = arr.findIndex((t) => t.id === targetId);
      if (fi === -1 || ti === -1) return prev;
      // Swap positions
      [arr[fi], arr[ti]] = [arr[ti], arr[fi]];
      return arr;
    });
    setDraggedId(null);
    setDragOverId(null);
  }, [draggedId]);

  const onDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const visible = tiles.filter((t) => t.visible);
  const hiddenCount = tiles.filter((t) => !t.visible).length;

  const colSpan = (size: TileSize) => {
    switch (size) {
      case 'third': return 'col-span-2';
      case 'half': return 'col-span-3';
      case 'full': return 'col-span-6';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-card">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" />
          <span className="text-sm font-semibold">Statistiques</span>
          {hiddenCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">{hiddenCount} masquée(s)</Badge>
          )}
        </div>
        <Button
          variant={showSettings ? 'secondary' : 'ghost'}
          size="xs"
          onClick={() => setShowSettings(!showSettings)}
          className="gap-1"
        >
          <Settings2 className="size-3.5" />
          Personnaliser
          <ChevronDown className={cn('size-3 transition-transform', showSettings && 'rotate-180')} />
        </Button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="border-b bg-muted/30 px-3 py-2 animate-slide-down max-h-[260px] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">Activer / désactiver les tuiles</p>
            <Button variant="ghost" size="xs" onClick={resetTiles} className="text-muted-foreground gap-1 h-6">
              <RotateCcw className="size-3" />
              Défaut
            </Button>
          </div>
          <div className="space-y-0.5">
            {tiles.map((tile) => (
              <button
                key={tile.id}
                onClick={() => toggleVisibility(tile.id)}
                className={cn(
                  'flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg transition-all text-left',
                  tile.visible ? 'hover:bg-accent/50' : 'opacity-60 hover:opacity-80 hover:bg-accent/30'
                )}
              >
                <div className={cn('shrink-0', tile.visible ? 'text-primary' : 'text-muted-foreground/40')}>
                  {tile.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </div>
                <span className={cn('text-xs flex-1', !tile.visible && 'text-muted-foreground line-through')}>
                  {tile.label}
                </span>
                <div className={cn('size-1.5 rounded-full shrink-0', tile.visible ? 'bg-emerald-500' : 'bg-muted-foreground/20')} />
              </button>
            ))}
          </div>
          <Separator className="my-2" />
          <p className="text-[10px] text-muted-foreground text-center">
            Glissez chaque tuile directement dans la vue pour réordonner
          </p>
        </div>
      )}

      {/* Grid of draggable tiles */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {statsLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="size-8 animate-spin mb-3 text-primary" />
              <p className="text-sm font-medium">Calcul des statistiques...</p>
              <p className="text-xs mt-1">Analyse des objets du modèle en cours</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <EyeOff className="size-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Toutes les tuiles sont masquées</p>
              <Button variant="outline" size="sm" onClick={resetTiles} className="mt-3 gap-1">
                <RotateCcw className="size-3.5" />
                Restaurer par défaut
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-2">
              {visible.map((tile) => (
                <div
                  key={tile.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, tile.id)}
                  onDragOver={(e) => onDragOver(e, tile.id)}
                  onDrop={() => onDrop(tile.id)}
                  onDragEnd={onDragEnd}
                  onDragLeave={() => { if (dragOverId === tile.id) setDragOverId(null); }}
                  className={cn(
                    colSpan(tile.size),
                    'relative group cursor-grab active:cursor-grabbing transition-all',
                    draggedId === tile.id && 'opacity-25 scale-95',
                    dragOverId === tile.id && draggedId && 'ring-2 ring-primary ring-offset-1 rounded-xl scale-[1.02]',
                  )}
                >
                  {/* Grab badge */}
                  <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-0.5 bg-card/95 backdrop-blur border rounded px-1 py-0.5 shadow-sm">
                      <GripVertical className="size-2.5 text-muted-foreground" />
                    </div>
                  </div>
                  <TileRenderer id={tile.id} stats={stats} />
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Tile Renderer ──

function TileRenderer({ id, stats }: { id: string; stats: ModelStatistics }) {
  switch (id) {
    case 'sum-elements':
      return (
        <Card className="h-full bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{stats.totalElements}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Éléments</p>
          </CardContent>
        </Card>
      );
    case 'sum-levels':
      return (
        <Card className="h-full bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 border-emerald-500/20">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600">{stats.totalLevels}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Niveaux</p>
          </CardContent>
        </Card>
      );
    case 'sum-types':
      return (
        <Card className="h-full bg-gradient-to-br from-amber-500/5 to-amber-500/10 border-amber-500/20">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.totalTypes}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Types</p>
          </CardContent>
        </Card>
      );
    case 'prop-surface':
      return <PropCard name="Surface totale" value="2 450" unit="m²" />;
    case 'prop-volume':
      return <PropCard name="Volume total" value="8 575" unit="m³" />;
    case 'prop-hauteur':
      return <PropCard name="Hauteur max" value="12.6" unit="m" />;
    case 'prop-murs':
      return <PropCard name="Longueur murs" value="892" unit="m" />;
    case 'prop-vitree':
      return <PropCard name="Surface vitrée" value="380" unit="m²" />;
    case 'prop-ratio':
      return <PropCard name="Ratio vitrage" value="15.5" unit="%" />;
    case 'ifc-pie':
      return <IfcPieTile stats={stats} />;
    case 'level-bar':
      return <LevelBarTile stats={stats} />;
    case 'material-bars':
      return <MaterialBarsTile stats={stats} />;
    default:
      return null;
  }
}

function PropCard({ name, value, unit }: { name: string; value: string; unit: string }) {
  const Icon = statIcons[name] || BarChart3;
  return (
    <Card className="h-full hover:shadow-md transition-shadow">
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{name}</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-lg font-bold">{value}</span>
              <span className="text-xs text-muted-foreground">{unit}</span>
            </div>
          </div>
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Icon className="size-3.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Chart Tiles ──

function IfcPieTile({ stats }: { stats: ModelStatistics }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ index: number; mouseX: number; mouseY: number } | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current || hovered === null) return;
    const rect = containerRef.current.getBoundingClientRect();
    setHovered((prev) => prev ? { ...prev, mouseX: e.clientX - rect.left, mouseY: e.clientY - rect.top } : null);
  }, [hovered]);

  const handleCellMouseEnter = useCallback((_: unknown, index: number) => {
    setHovered({ index, mouseX: 0, mouseY: 0 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const total = stats.ifcClassDistribution.reduce((s, d) => s + d.count, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <PieChartIcon className="size-4 text-primary" />
            Distribution par classe IFC
          </CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            {stats.ifcClassDistribution.length} classes
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ width: '50%', height: 180, position: 'relative' }}
          >
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={stats.ifcClassDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="count"
                  isAnimationActive={false}
                  onMouseEnter={handleCellMouseEnter}
                  onMouseLeave={handleMouseLeave}
                >
                  {stats.ifcClassDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* Fully custom tooltip – no Recharts wrapper */}
            {hovered !== null && hovered.mouseX > 0 && (() => {
              const item = stats.ifcClassDistribution[hovered.index];
              if (!item) return null;
              const color = COLORS[hovered.index % COLORS.length];
              const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0';
              const containerW = containerRef.current?.offsetWidth ?? 200;
              const isRightHalf = hovered.mouseX > containerW / 2;
              const tooltipW = 185;

              const left = isRightHalf
                ? hovered.mouseX + 14
                : hovered.mouseX - tooltipW - 14;
              const top = hovered.mouseY - 30;

              return (
                <div
                  style={{
                    position: 'absolute',
                    left,
                    top,
                    width: tooltipW,
                    zIndex: 100,
                    pointerEvents: 'none',
                    background: 'rgba(255, 255, 255, 0.92)',
                    backdropFilter: 'blur(8px)',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: hexToRgba(color, 0.35),
                    borderLeftWidth: 5,
                    borderLeftColor: color,
                    borderRadius: 10,
                    padding: '10px 14px',
                    boxShadow: `0 10px 28px rgba(0,0,0,0.14), 0 2px 8px ${hexToRgba(color, 0.18)}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 4, background: color, flexShrink: 0, boxShadow: `0 1px 3px ${hexToRgba(color, 0.4)}` }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{item.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{item.count}</span>
                    <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 500 }}>éléments</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        marginLeft: 'auto',
                        background: hexToRgba(color, 0.13),
                        color,
                        padding: '2px 8px',
                        borderRadius: 6,
                      }}
                    >
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="flex-1 space-y-1">
            {stats.ifcClassDistribution.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="size-2.5 rounded-sm shrink-0" style={{ background: COLORS[index % COLORS.length] }} />
                  <span className="text-muted-foreground">{item.name}</span>
                </div>
                <span className="font-medium tabular-nums">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LevelBarTile({ stats }: { stats: ModelStatistics }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" />
          Éléments par niveau
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={stats.levelDistribution} barSize={32}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={{ stroke: 'var(--border)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={{ stroke: 'var(--border)' }} />
            <Tooltip contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }} />
            <Bar dataKey="count" fill="#0063a3" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function MaterialBarsTile({ stats }: { stats: ModelStatistics }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Boxes className="size-4 text-primary" />
          Distribution par matériau
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {stats.materialDistribution.map((mat) => {
            const percentage = Math.round((mat.count / stats.totalElements) * 100);
            return (
              <div key={mat.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{mat.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">{mat.count}</span>
                    <span className="text-muted-foreground w-8 text-right">{percentage}%</span>
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${percentage}%`, background: mat.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
