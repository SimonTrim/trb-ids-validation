import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Search, ChevronRight, ChevronDown, Eye, EyeOff,
  Building2, Layers, FolderOpen, Box, LayoutGrid,
  Filter, X, SlidersHorizontal, Paintbrush, Tag,
  Columns3, CircleDot, Loader2, Crosshair, MousePointer
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useTrimbleContext } from '@/hooks/useTrimbleConnect';
import {
  getModelTree,
  detectModelFilters,
  setObjectVisibility,
  toggleModelVisibility,
  selectObjectsInViewer,
  isolateObjectsInViewer,
  type DetectedFilters,
} from '@/services/viewerBridge';
import type { ModelTreeNode } from '@/types';

type GroupMode = 'ifc' | 'layers' | 'building';

const groupModes: { id: GroupMode; label: string }[] = [
  { id: 'ifc', label: 'Classification IFC' },
  { id: 'layers', label: 'Calques' },
  { id: 'building', label: 'Bâtiment' },
];

type FilterCategory = 'classes' | 'materials' | 'levels' | 'psets';

const filterCategories: { id: FilterCategory; label: string; icon: typeof Tag }[] = [
  { id: 'classes', label: 'Classes IFC', icon: Tag },
  { id: 'materials', label: 'Matériaux', icon: Paintbrush },
  { id: 'levels', label: 'Niveaux', icon: Layers },
  { id: 'psets', label: 'Property Sets', icon: Columns3 },
];

function getNodeIcon(type: ModelTreeNode['type']) {
  switch (type) {
    case 'project': return FolderOpen;
    case 'model': return Box;
    case 'level': return Layers;
    case 'room': return LayoutGrid;
    case 'element': return Building2;
  }
}

function getNodeIconColor(type: ModelTreeNode['type']) {
  switch (type) {
    case 'project': return 'text-amber-500';
    case 'model': return 'text-primary';
    case 'level': return 'text-blue-500';
    case 'room': return 'text-emerald-500';
    case 'element': return 'text-muted-foreground';
  }
}

interface TreeNodeProps {
  node: ModelTreeNode;
  depth: number;
  onToggleVisibility: (id: string) => void;
  onSelectNode: (id: string) => void;
  selectedNodeId: string | null;
  searchQuery: string;
}

function TreeNode({ node, depth, onToggleVisibility, onSelectNode, selectedNodeId, searchQuery }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const Icon = getNodeIcon(node.type);
  const iconColor = getNodeIconColor(node.type);
  const isSelected = selectedNodeId === node.id;

  const matchesSearch = searchQuery
    ? node.name.toLowerCase().includes(searchQuery.toLowerCase())
    : true;

  if (searchQuery && !matchesSearch && !hasChildren) return null;

  return (
    <div className="animate-fade-in">
      <div
        className={cn(
          "flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer group transition-colors",
          isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-accent/60",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 p-0.5 rounded hover:bg-accent"
          >
            {expanded ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <div className="w-4.5" />
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(node.id); }}
          className={cn(
            "shrink-0 size-4 rounded border-2 flex items-center justify-center transition-colors",
            node.visible
              ? "bg-primary border-primary"
              : "border-muted-foreground/40 bg-transparent"
          )}
        >
          {node.visible && (
            <svg className="size-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <Icon className={cn("size-4 shrink-0 ml-1", iconColor)} />

        <span
          className={cn(
            "text-sm truncate flex-1",
            !node.visible && "text-muted-foreground line-through opacity-50"
          )}
          onClick={() => {
            onSelectNode(node.id);
            if (hasChildren) setExpanded(!expanded);
          }}
        >
          {node.name}
        </span>

        {node.ifcClass && (
          <Badge variant="outline" className="ml-auto text-[9px] px-1 py-0 font-mono">
            {node.ifcClass}
          </Badge>
        )}

        {node.objectCount !== undefined && !node.ifcClass && (
          <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
            {node.objectCount}
          </Badge>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(node.id); }}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
        >
          {node.visible ? (
            <Eye className="size-3.5 text-muted-foreground" />
          ) : (
            <EyeOff className="size-3.5 text-muted-foreground" />
          )}
        </button>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onToggleVisibility={onToggleVisibility}
              onSelectNode={onSelectNode}
              selectedNodeId={selectedNodeId}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FilterItem {
  name: string;
  count: number;
  checked: boolean;
}

function FilterCheckboxList({
  items,
  onToggle,
  onToggleAll,
  filterText,
}: {
  items: FilterItem[];
  onToggle: (name: string) => void;
  onToggleAll: (checked: boolean) => void;
  filterText: string;
}) {
  const filtered = filterText
    ? items.filter((i) => i.name.toLowerCase().includes(filterText.toLowerCase()))
    : items;
  const allChecked = filtered.every((i) => i.checked);
  const someChecked = filtered.some((i) => i.checked) && !allChecked;

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => onToggleAll(!allChecked)}
        className="flex items-center gap-2 w-full px-2 py-1 rounded hover:bg-accent/50 transition-colors"
      >
        <div className={cn(
          "size-3.5 rounded border-2 flex items-center justify-center transition-colors",
          allChecked ? "bg-primary border-primary" : someChecked ? "bg-primary/50 border-primary" : "border-muted-foreground/40"
        )}>
          {(allChecked || someChecked) && (
            <svg className="size-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              {allChecked ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /> : <path strokeLinecap="round" d="M6 12h12" />}
            </svg>
          )}
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {allChecked ? 'Tout désélectionner' : 'Tout sélectionner'}
        </span>
        <Badge variant="secondary" className="ml-auto text-[9px] px-1 py-0">{filtered.length}</Badge>
      </button>
      <Separator />
      {filtered.map((item) => (
        <button
          key={item.name}
          onClick={() => onToggle(item.name)}
          className="flex items-center gap-2 w-full px-2 py-1 rounded hover:bg-accent/50 transition-colors"
        >
          <div className={cn(
            "size-3.5 rounded border-2 flex items-center justify-center transition-colors",
            item.checked ? "bg-primary border-primary" : "border-muted-foreground/40"
          )}>
            {item.checked && (
              <svg className="size-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <span className={cn("text-xs flex-1 text-left truncate", !item.checked && "text-muted-foreground")}>{item.name}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{item.count}</span>
        </button>
      ))}
    </div>
  );
}

// ── Helpers ──

function collectNodeRuntimeIds(node: ModelTreeNode): number[] {
  const parts = node.id.split('-');
  const runtimeId = parseInt(parts[parts.length - 1], 10);
  const ids: number[] = [];
  if (!isNaN(runtimeId)) ids.push(runtimeId);
  if (node.children) {
    for (const child of node.children) {
      ids.push(...collectNodeRuntimeIds(child));
    }
  }
  return ids;
}

function getModelIdFromNode(node: ModelTreeNode, treeData: ModelTreeNode[]): string | null {
  for (const root of treeData) {
    if (root.children) {
      for (const model of root.children) {
        if (model.id === node.id || findNodeInTree(model, node.id)) {
          return model.id;
        }
      }
    }
  }
  return null;
}

function findNodeInTree(tree: ModelTreeNode, id: string): ModelTreeNode | null {
  if (tree.id === id) return tree;
  if (tree.children) {
    for (const child of tree.children) {
      const found = findNodeInTree(child, id);
      if (found) return found;
    }
  }
  return null;
}

function countNodes(nodes: ModelTreeNode[]): number {
  let count = 0;
  for (const n of nodes) {
    count += 1;
    if (n.children) count += countNodes(n.children);
  }
  return count;
}

// ── Main Component ──

export function ExplorerTab() {
  const { api, selection } = useTrimbleContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [groupMode, setGroupMode] = useState<GroupMode>('building');
  const [treeData, setTreeData] = useState<ModelTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeFilterCategory, setActiveFilterCategory] = useState<FilterCategory>('classes');
  const [filterSearch, setFilterSearch] = useState('');

  const [detectedPsets, setDetectedPsets] = useState<Array<{ name: string; count: number }>>([]);
  const [ifcFilters, setIfcFilters] = useState<FilterItem[]>([]);
  const [materialFilters, setMaterialFilters] = useState<FilterItem[]>([]);
  const [levelFilters, setLevelFilters] = useState<FilterItem[]>([]);

  // Load tree
  useEffect(() => {
    let cancelled = false;
    setTreeLoading(true);
    getModelTree(api).then((tree) => {
      if (!cancelled) {
        setTreeData(tree);
        setTreeLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [api]);

  // Detect filters from model
  useEffect(() => {
    let cancelled = false;
    setFiltersLoading(true);
    detectModelFilters(api).then((filters: DetectedFilters) => {
      if (!cancelled) {
        setIfcFilters(filters.ifcClasses.map(f => ({ ...f, checked: true })));
        setMaterialFilters(filters.materials.map(f => ({ ...f, checked: true })));
        setLevelFilters(filters.levels.map(f => ({ ...f, checked: true })));
        setDetectedPsets(filters.propertySets);
        setFiltersLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [api]);

  const totalNodeCount = useMemo(() => countNodes(treeData), [treeData]);

  const activeFiltersCount = useMemo(() => {
    const uncheckedIfc = ifcFilters.filter((f) => !f.checked).length;
    const uncheckedMat = materialFilters.filter((f) => !f.checked).length;
    const uncheckedLvl = levelFilters.filter((f) => !f.checked).length;
    return uncheckedIfc + uncheckedMat + uncheckedLvl;
  }, [ifcFilters, materialFilters, levelFilters]);

  const toggleVisibility = useCallback((nodeId: string) => {
    let targetNode: ModelTreeNode | null = null;

    setTreeData((prev) => {
      const toggle = (nodes: ModelTreeNode[]): ModelTreeNode[] =>
        nodes.map((n) => {
          if (n.id === nodeId) {
            targetNode = { ...n, visible: !n.visible };
            return { ...targetNode, children: n.children ? toggle(n.children) : undefined };
          }
          return { ...n, children: n.children ? toggle(n.children) : undefined };
        });
      return toggle(prev);
    });

    if (api && targetNode) {
      const tn = targetNode as ModelTreeNode;
      const newVisible = !tn.visible;

      if (tn.type === 'model') {
        toggleModelVisibility(api, tn.id, newVisible);
      } else {
        const modelId = getModelIdFromNode(tn, treeData);
        if (modelId) {
          const runtimeIds = collectNodeRuntimeIds(tn);
          if (runtimeIds.length > 0) {
            setObjectVisibility(api, modelId, runtimeIds, newVisible);
          }
        }
      }
    }
  }, [api, treeData]);

  const handleSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);

    if (!api) return;
    for (const root of treeData) {
      const node = findNodeInTree(root, nodeId);
      if (node) {
        const modelId = getModelIdFromNode(node, treeData);
        if (modelId) {
          const runtimeIds = collectNodeRuntimeIds(node);
          if (runtimeIds.length > 0) {
            selectObjectsInViewer(api, modelId, runtimeIds);
          }
        }
        break;
      }
    }
  }, [api, treeData]);

  const handleShowAll = useCallback(() => {
    setTreeData((prev) => {
      const setVisible = (nodes: ModelTreeNode[]): ModelTreeNode[] =>
        nodes.map((n) => ({ ...n, visible: true, children: n.children ? setVisible(n.children) : undefined }));
      return setVisible(prev);
    });
    if (api) {
      for (const root of treeData) {
        if (root.children) {
          for (const model of root.children) {
            const rids = collectNodeRuntimeIds(model);
            if (rids.length > 0) setObjectVisibility(api, model.id, rids, true);
          }
        }
      }
    }
  }, [api, treeData]);

  const handleHideAll = useCallback(() => {
    setTreeData((prev) => {
      const setHidden = (nodes: ModelTreeNode[]): ModelTreeNode[] =>
        nodes.map((n) => ({ ...n, visible: false, children: n.children ? setHidden(n.children) : undefined }));
      return setHidden(prev);
    });
    if (api) {
      for (const root of treeData) {
        if (root.children) {
          for (const model of root.children) {
            const rids = collectNodeRuntimeIds(model);
            if (rids.length > 0) setObjectVisibility(api, model.id, rids, false);
          }
        }
      }
    }
  }, [api, treeData]);

  const handleIsolateSelection = useCallback(() => {
    if (!selectedNodeId) return;
    for (const root of treeData) {
      const node = findNodeInTree(root, selectedNodeId);
      if (node) {
        const modelId = getModelIdFromNode(node, treeData);
        if (modelId) {
          const runtimeIds = collectNodeRuntimeIds(node);
          if (runtimeIds.length > 0) {
            isolateObjectsInViewer(api, [{ modelId, objectRuntimeIds: runtimeIds }]);
          }
        }
        break;
      }
    }
  }, [api, treeData, selectedNodeId]);

  const toggleFilter = useCallback((category: FilterCategory, name: string) => {
    const updater = (items: FilterItem[]) =>
      items.map((i) => (i.name === name ? { ...i, checked: !i.checked } : i));
    if (category === 'classes') setIfcFilters(updater);
    if (category === 'materials') setMaterialFilters(updater);
    if (category === 'levels') setLevelFilters(updater);
  }, []);

  const toggleAllFilters = useCallback((category: FilterCategory, checked: boolean) => {
    const updater = (items: FilterItem[]) => items.map((i) => ({ ...i, checked }));
    if (category === 'classes') setIfcFilters(updater);
    if (category === 'materials') setMaterialFilters(updater);
    if (category === 'levels') setLevelFilters(updater);
  }, []);

  const resetFilters = useCallback(() => {
    setIfcFilters((items) => items.map((i) => ({ ...i, checked: true })));
    setMaterialFilters((items) => items.map((i) => ({ ...i, checked: true })));
    setLevelFilters((items) => items.map((i) => ({ ...i, checked: true })));
  }, []);

  const getCurrentFilterItems = (): FilterItem[] => {
    switch (activeFilterCategory) {
      case 'classes': return ifcFilters;
      case 'materials': return materialFilters;
      case 'levels': return levelFilters;
      case 'psets': return detectedPsets.map((p) => ({ ...p, checked: true }));
    }
  };

  const selectionCount = selection.reduce((s, sel) => s + sel.objectRuntimeIds.length, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Search + controls */}
      <div className="p-3 space-y-2 border-b bg-card">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un élément..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Grouper par :</span>
            {groupModes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setGroupMode(mode.id)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                  groupMode === mode.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "p-1.5 rounded-md transition-colors relative",
              showFilters ? "bg-primary/10 text-primary" : "hover:bg-accent text-muted-foreground"
            )}
          >
            <SlidersHorizontal className="size-4" />
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1 -right-1 size-4 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Advanced filters panel */}
      {showFilters && (
        <div className="border-b bg-card animate-slide-down">
          <div className="px-3 pt-2 pb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Filter className="size-3.5 text-primary" />
              <span className="text-xs font-semibold">Filtres avancés</span>
              <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">
                {filtersLoading ? 'Chargement...' : 'Auto-détecté du modèle'}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              {activeFiltersCount > 0 && (
                <Button variant="ghost" size="xs" onClick={resetFilters} className="text-destructive gap-1 h-6">
                  <X className="size-3" />
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex border-b mx-3">
            {filterCategories.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeFilterCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => { setActiveFilterCategory(cat.id); setFilterSearch(''); }}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium transition-all relative",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-3" />
                  {cat.label}
                  {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
                </button>
              );
            })}
          </div>

          {/* Filter search */}
          <div className="px-3 pt-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              <Input
                placeholder={`Filtrer les ${filterCategories.find(c => c.id === activeFilterCategory)?.label.toLowerCase()}...`}
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="pl-7 h-7 text-xs"
              />
            </div>
          </div>

          {/* Filter list */}
          <div className="px-3 py-2 max-h-[200px] overflow-y-auto">
            {filtersLoading ? (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                <Loader2 className="size-4 animate-spin mr-2" />
                <span className="text-xs">Détection des filtres...</span>
              </div>
            ) : activeFilterCategory === 'psets' ? (
              <div className="space-y-0.5">
                {detectedPsets
                  .filter((p) => !filterSearch || p.name.toLowerCase().includes(filterSearch.toLowerCase()))
                  .map((pset) => (
                    <div key={pset.name} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/50">
                      <CircleDot className="size-3 text-primary shrink-0" />
                      <span className="text-xs flex-1 truncate">{pset.name}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{pset.count} objets</span>
                    </div>
                  ))}
              </div>
            ) : (
              <FilterCheckboxList
                items={getCurrentFilterItems()}
                onToggle={(name) => toggleFilter(activeFilterCategory, name)}
                onToggleAll={(checked) => toggleAllFilters(activeFilterCategory, checked)}
                filterText={filterSearch}
              />
            )}
          </div>
        </div>
      )}

      {/* Quick action bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-muted/20">
        <button onClick={handleShowAll} className="p-1.5 rounded-md hover:bg-accent transition-colors" title="Afficher tous">
          <Eye className="size-3.5 text-muted-foreground" />
        </button>
        <button onClick={handleHideAll} className="p-1.5 rounded-md hover:bg-accent transition-colors" title="Masquer tous">
          <EyeOff className="size-3.5 text-muted-foreground" />
        </button>
        <Separator orientation="vertical" className="h-4 mx-1" />
        <button
          onClick={handleIsolateSelection}
          disabled={!selectedNodeId}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            selectedNodeId ? "hover:bg-accent text-primary" : "opacity-40 cursor-not-allowed text-muted-foreground"
          )}
          title="Isoler sélection"
        >
          <Crosshair className="size-3.5" />
        </button>

        <Separator orientation="vertical" className="h-4 mx-1" />

        {/* Model info */}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Box className="size-3" />
          <span>{totalNodeCount} éléments</span>
        </div>

        {selectionCount > 0 && (
          <>
            <Separator orientation="vertical" className="h-4 mx-1" />
            <div className="flex items-center gap-1 text-[10px] text-primary">
              <MousePointer className="size-3" />
              <span>{selectionCount} sélectionné(s)</span>
            </div>
          </>
        )}

        {activeFiltersCount > 0 && (
          <>
            <Separator orientation="vertical" className="h-4 mx-1" />
            <div className="flex items-center gap-1 text-[10px] text-primary">
              <Filter className="size-3" />
              <span>{activeFiltersCount} filtre(s)</span>
            </div>
          </>
        )}
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1">
        {treeLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-6 animate-spin mb-2" />
            <p className="text-xs">Chargement de la hiérarchie...</p>
          </div>
        ) : treeData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Box className="size-8 mb-2 opacity-40" />
            <p className="text-xs">Aucun modèle chargé</p>
          </div>
        ) : (
          <div className="p-1">
            {treeData.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                onToggleVisibility={toggleVisibility}
                onSelectNode={handleSelectNode}
                selectedNodeId={selectedNodeId}
                searchQuery={searchQuery}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
