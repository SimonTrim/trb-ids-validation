import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText, ExternalLink, ChevronDown, ChevronRight,
  Building2, Layers, Search, Download,
  Link2, FolderOpen, Copy, Check, Loader2, ClipboardList,
  Maximize2, Minimize2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useTrimbleContext } from '@/hooks/useTrimbleConnect';
import { getSelectedObjectProperties } from '@/services/viewerBridge';

type ViewMode = 'properties' | 'documents';

interface ObjectData {
  name: string;
  type: string;
  properties: Record<string, Record<string, string>>;
}

interface AttachedDocument {
  id: string;
  name: string;
  url: string;
  type: 'pdf' | 'image' | 'link';
  source: string;
}

const MOCK_OBJECT_DATA: ObjectData = {
  name: 'Cassette DAIKIN FXZQ-A',
  type: 'IfcFlowTerminal',
  properties: {
    'Identity Data': {
      'GlobalId': '2O2Fr$t4X7Zf8NOew3FNld',
      'Name': 'Cassette DAIKIN FXZQ-A',
      'ObjectType': 'ISEA 4T 04',
      'Tag': 'CVC-CASS-001',
    },
    'Pset_FlowTerminalCommon': {
      'Reference': 'FXZQ20A2VEB',
      'Status': 'New',
      'AirFlowRateRange': '420 - 780 m³/h',
      'TemperatureRange': '16 - 32 °C',
      'NominalAirFlowRate': '600 m³/h',
    },
    'Pset_ManufacturerTypeInformation': {
      'Manufacturer': 'DAIKIN',
      'ModelReference': 'FXZQ-A',
      'ModelLabel': 'ISEA 4T 04',
      'ProductionYear': '2024',
      'ArticleNumber': 'FXZQ20A2VEB',
    },
    'Pset_Warranty': {
      'WarrantyPeriod': 'P3Y',
      'WarrantyContent': 'Pièces et main d\'œuvre',
      'PointOfContact': 'sav@daikin.fr',
    },
    'Données thermiques': {
      'Puissance froid nominale': '2.2 kW',
      'Puissance chaud nominale': '2.5 kW',
      'EER': '3.41',
      'COP': '3.81',
      'Niveau sonore': '25 dB(A)',
      'Fluide frigorigène': 'R-32',
    },
    'Dimensions': {
      'Longueur': '575 mm',
      'Largeur': '575 mm',
      'Hauteur': '260 mm',
      'Poids net': '15.5 kg',
      'Hauteur façade': '8 mm',
    },
    'Documents attachés': {
      'Fiche technique': '/docs/ManTech_J1_FXZQ-A.pdf',
      'Notice installation': 'https://drive.google.com/file/d/2def.../view',
      'Certificat CE': 'https://drive.google.com/file/d/3ghi.../view',
    },
  },
};

function isUrlOrPath(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('/docs/') || value.startsWith('drive.google.com');
}

function isPdfUrl(url: string): boolean {
  return url.toLowerCase().endsWith('.pdf') || url.includes('/docs/');
}

function isGoogleDriveUrl(url: string): boolean {
  return /drive\.google\.com\/file\/d\//i.test(url) || /docs\.google\.com/i.test(url);
}

function toGoogleDriveEmbedUrl(url: string): string | null {
  const match = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
  return null;
}

function detectDocuments(objectData: ObjectData): AttachedDocument[] {
  const docs: AttachedDocument[] = [];
  let idx = 0;
  for (const [psetName, props] of Object.entries(objectData.properties)) {
    for (const [key, value] of Object.entries(props)) {
      if (isUrlOrPath(value)) {
        const type = isPdfUrl(value) ? 'pdf' : 'link';
        docs.push({ id: `doc-${idx++}`, name: key, url: value, type, source: psetName });
      }
    }
  }
  return docs;
}

export function FicheTechniqueTab() {
  const { api, selection } = useTrimbleContext();
  const [viewMode, setViewMode] = useState<ViewMode>('documents');
  const [objectData, setObjectData] = useState<ObjectData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPsets, setExpandedPsets] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  const selectionCount = useMemo(
    () => selection.reduce((s, sel) => s + sel.objectRuntimeIds.length, 0),
    [selection],
  );

  useEffect(() => {
    if (selectionCount === 0 && !api) {
      setObjectData(MOCK_OBJECT_DATA);
      setExpandedPsets(new Set(Object.keys(MOCK_OBJECT_DATA.properties)));
      return;
    }

    if (selectionCount === 0) {
      setObjectData(null);
      return;
    }

    setLoading(true);
    getSelectedObjectProperties(api, selection).then((objs) => {
      if (objs.length > 0) {
        setObjectData(objs[0]);
        setExpandedPsets(new Set(Object.keys(objs[0].properties)));
      } else {
        setObjectData(null);
      }
      setLoading(false);
    });
  }, [api, selection, selectionCount]);

  const documents = useMemo(() => {
    if (!objectData) return [];
    return detectDocuments(objectData);
  }, [objectData]);

  // Auto-select first doc when documents change
  useEffect(() => {
    if (documents.length > 0 && (!activeDocId || !documents.find(d => d.id === activeDocId))) {
      setActiveDocId(documents[0].id);
    } else if (documents.length === 0) {
      setActiveDocId(null);
    }
  }, [documents, activeDocId]);

  const activeDoc = documents.find(d => d.id === activeDocId) ?? null;

  const togglePset = useCallback((psetName: string) => {
    setExpandedPsets((prev) => {
      const next = new Set(prev);
      if (next.has(psetName)) next.delete(psetName);
      else next.add(psetName);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (objectData) setExpandedPsets(new Set(Object.keys(objectData.properties)));
  }, [objectData]);

  const collapseAll = useCallback(() => setExpandedPsets(new Set()), []);

  const copyValue = useCallback((key: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  }, []);

  const filteredProperties = useMemo(() => {
    if (!objectData) return {};
    if (!searchQuery) return objectData.properties;
    const q = searchQuery.toLowerCase();
    const result: Record<string, Record<string, string>> = {};
    for (const [psetName, props] of Object.entries(objectData.properties)) {
      const matchedProps: Record<string, string> = {};
      for (const [key, value] of Object.entries(props)) {
        if (key.toLowerCase().includes(q) || value.toLowerCase().includes(q) || psetName.toLowerCase().includes(q)) {
          matchedProps[key] = value;
        }
      }
      if (Object.keys(matchedProps).length > 0) result[psetName] = matchedProps;
    }
    return result;
  }, [objectData, searchQuery]);

  const totalProps = useMemo(() => {
    if (!objectData) return 0;
    return Object.values(objectData.properties).reduce((s, p) => s + Object.keys(p).length, 0);
  }, [objectData]);

  const exportPropertiesCSV = useCallback(() => {
    if (!objectData) return;
    const rows = ['Property Set;Propriété;Valeur'];
    for (const [psetName, props] of Object.entries(objectData.properties)) {
      for (const [key, value] of Object.entries(props)) {
        rows.push(`"${psetName}";"${key}";"${value.replace(/"/g, '""')}"`);
      }
    }
    const csv = '\uFEFF' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `proprietes_${objectData.name.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [objectData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <Loader2 className="size-8 animate-spin text-primary mb-3" />
        <p className="text-sm text-muted-foreground">Chargement des propriétés...</p>
      </div>
    );
  }

  if (!objectData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <div className="size-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <FileText className="size-8 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">Aucun élément sélectionné</p>
        <p className="text-xs text-muted-foreground max-w-[240px]">
          Sélectionnez un élément dans la vue 3D pour afficher sa fiche technique et ses propriétés
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Object identity header */}
      <div className="p-3 border-b bg-card">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Building2 className="size-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{objectData.name}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                {objectData.type}
              </Badge>
              <span>{totalProps} propriétés</span>
              {documents.length > 0 && (
                <>
                  <span>•</span>
                  <span className="text-primary">{documents.length} doc(s)</span>
                </>
              )}
            </div>
          </div>
          <Button variant="ghost" size="xs" onClick={exportPropertiesCSV} className="gap-1 text-muted-foreground" title="Exporter CSV">
            <Download className="size-3" />
            CSV
          </Button>
        </div>

        {/* View mode tabs */}
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('properties')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              viewMode === 'properties'
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            <ClipboardList className="size-3" />
            Propriétés
            <Badge variant={viewMode === 'properties' ? 'secondary' : 'outline'} className="text-[9px] px-1 py-0 ml-0.5">
              {Object.keys(objectData.properties).length}
            </Badge>
          </button>
          <button
            onClick={() => setViewMode('documents')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              viewMode === 'documents'
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            <FileText className="size-3" />
            Documents
            {documents.length > 0 && (
              <Badge variant={viewMode === 'documents' ? 'secondary' : 'outline'} className="text-[9px] px-1 py-0 ml-0.5">
                {documents.length}
              </Badge>
            )}
          </button>
        </div>
      </div>

      {/* ── Properties view ── */}
      {viewMode === 'properties' && (
        <>
          <div className="px-3 py-2 border-b bg-muted/20 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              <Input
                placeholder="Rechercher une propriété..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 h-7 text-xs"
              />
            </div>
            <Button variant="ghost" size="xs" onClick={expandAll} className="text-[10px] h-7">Tout ouvrir</Button>
            <Button variant="ghost" size="xs" onClick={collapseAll} className="text-[10px] h-7">Tout fermer</Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {Object.keys(filteredProperties).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Search className="size-6 mb-2 opacity-40" />
                  <p className="text-xs">Aucune propriété trouvée</p>
                </div>
              ) : (
                Object.entries(filteredProperties).map(([psetName, props]) => (
                  <PropertySetCard
                    key={psetName}
                    name={psetName}
                    properties={props}
                    expanded={expandedPsets.has(psetName)}
                    onToggle={() => togglePset(psetName)}
                    copiedKey={copiedKey}
                    onCopy={copyValue}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </>
      )}

      {/* ── Documents view ── */}
      {viewMode === 'documents' && (
        <DocumentsView
          documents={documents}
          activeDocId={activeDocId}
          activeDoc={activeDoc}
          onSelectDoc={setActiveDocId}
        />
      )}
    </div>
  );
}

// ── Inline Documents Viewer ──

function DocumentsView({
  documents,
  activeDocId,
  activeDoc,
  onSelectDoc,
}: {
  documents: AttachedDocument[];
  activeDocId: string | null;
  activeDoc: AttachedDocument | null;
  onSelectDoc: (id: string) => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-center p-6">
        <div className="size-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
          <FileText className="size-7 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">Aucun document détecté</p>
        <p className="text-xs text-muted-foreground max-w-[260px]">
          Ajoutez des URL de documents (PDF, Google Drive) dans les propriétés IFC de l'objet pour les afficher ici.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Document tabs */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-muted/20 overflow-x-auto">
        {documents.map((doc) => {
          const isActive = doc.id === activeDocId;
          return (
            <button
              key={doc.id}
              onClick={() => onSelectDoc(doc.id)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap transition-all shrink-0",
                isActive
                  ? "bg-primary/10 text-primary border border-primary/20 font-medium"
                  : "hover:bg-accent text-muted-foreground"
              )}
            >
              {doc.type === 'pdf' ? (
                <FileText className="size-3" />
              ) : (
                <Link2 className="size-3" />
              )}
              {doc.name}
            </button>
          );
        })}

        <div className="ml-auto shrink-0 flex items-center gap-1">
          {activeDoc && (
            <>
              <Button
                variant="ghost"
                size="xs"
                className="h-6 w-6 p-0"
                onClick={() => setFullscreen(!fullscreen)}
                title={fullscreen ? 'Réduire' : 'Agrandir'}
              >
                {fullscreen ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className="h-6 w-6 p-0"
                onClick={() => window.open(activeDoc.url, '_blank')}
                title="Ouvrir dans un nouvel onglet"
              >
                <ExternalLink className="size-3" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Document info bar */}
      {activeDoc && (
        <div className="flex items-center gap-2 px-3 py-1 border-b bg-card text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground">{activeDoc.name}</span>
          <span>•</span>
          <span>{activeDoc.source}</span>
          <span>•</span>
          <span className={cn(
            "px-1.5 py-0.5 rounded-full font-medium",
            activeDoc.type === 'pdf' ? "bg-red-500/10 text-red-600"
              : isGoogleDriveUrl(activeDoc.url) ? "bg-green-500/10 text-green-600"
              : "bg-blue-500/10 text-blue-600"
          )}>
            {activeDoc.type === 'pdf' ? 'PDF' : isGoogleDriveUrl(activeDoc.url) ? 'Google Drive' : 'Lien'}
          </span>
        </div>
      )}

      {/* Inline viewer */}
      <div className={cn("flex-1 min-h-0 bg-muted/30", fullscreen && "fixed inset-0 z-50 bg-background")}>
        {fullscreen && (
          <div className="flex items-center justify-between px-3 py-2 border-b bg-card">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <span className="text-sm font-medium">{activeDoc?.name}</span>
            </div>
            <Button variant="ghost" size="xs" onClick={() => setFullscreen(false)} className="gap-1">
              <Minimize2 className="size-3.5" />
              Réduire
            </Button>
          </div>
        )}

        {activeDoc ? (
          activeDoc.type === 'pdf' ? (
            <iframe
              key={activeDoc.url}
              src={activeDoc.url}
              className="w-full h-full border-0"
              title={activeDoc.name}
            />
          ) : isGoogleDriveUrl(activeDoc.url) && toGoogleDriveEmbedUrl(activeDoc.url) ? (
            <div className="flex flex-col h-full">
              <iframe
                key={activeDoc.url}
                src={toGoogleDriveEmbedUrl(activeDoc.url)!}
                className="w-full flex-1 border-0"
                title={activeDoc.name}
                allow="autoplay"
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
              <div className="flex items-center justify-between px-3 py-1.5 border-t bg-muted/30 text-[10px] text-muted-foreground">
                <span className="truncate">{activeDoc.url}</span>
                <Button variant="ghost" size="xs" className="gap-1 shrink-0 ml-2" onClick={() => window.open(activeDoc.url, '_blank')}>
                  <ExternalLink className="size-3" />
                  Ouvrir
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="size-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-3">
                <Link2 className="size-7 text-blue-600" />
              </div>
              <p className="text-sm font-medium mb-1">{activeDoc.name}</p>
              <p className="text-xs text-muted-foreground max-w-[260px] mb-3">
                Ce document est hébergé sur un service externe. Cliquez ci-dessous pour y accéder.
              </p>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(activeDoc.url, '_blank')}>
                <ExternalLink className="size-3.5" />
                Ouvrir le lien
              </Button>
              <p className="text-[10px] text-muted-foreground mt-2 truncate max-w-full">{activeDoc.url}</p>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

// ── Property Set Card ──

function PropertySetCard({
  name,
  properties,
  expanded,
  onToggle,
  copiedKey,
  onCopy,
}: {
  name: string;
  properties: Record<string, string>;
  expanded: boolean;
  onToggle: () => void;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
}) {
  const propCount = Object.keys(properties).length;
  const hasUrls = Object.values(properties).some(isUrlOrPath);

  return (
    <Card className={cn("transition-shadow", expanded && "shadow-sm")}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/30 transition-colors rounded-t-xl"
      >
        {expanded ? (
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
        )}
        <Layers className="size-3.5 text-primary shrink-0" />
        <span className="text-xs font-semibold flex-1 truncate">{name}</span>
        {hasUrls && <Link2 className="size-3 text-emerald-500 shrink-0" />}
        <Badge variant="secondary" className="text-[9px] px-1 py-0">{propCount}</Badge>
      </button>

      {expanded && (
        <div className="px-3 pb-2 animate-slide-down">
          <Separator className="mb-1.5" />
          <div className="space-y-0">
            {Object.entries(properties).map(([key, value]) => {
              const isUrl = isUrlOrPath(value);
              const uniqueKey = `${name}.${key}`;
              const isCopied = copiedKey === uniqueKey;

              return (
                <div
                  key={key}
                  className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-accent/40 group transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground">{key}</p>
                    {isUrl ? (
                      <p className="text-xs text-primary font-medium truncate">{value}</p>
                    ) : (
                      <p className="text-xs font-medium truncate">{value}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onCopy(uniqueKey, value)}
                    className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-all"
                    title="Copier la valeur"
                  >
                    {isCopied ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3 text-muted-foreground" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
