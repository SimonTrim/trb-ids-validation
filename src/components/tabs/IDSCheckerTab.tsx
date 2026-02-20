import { useState, useCallback, useRef, useMemo } from 'react';
import {
  Upload, FileCheck, Play, ChevronDown, ChevronRight, Check, X,
  Download, Crosshair, Shield, Library,
  Plus, FileText, Loader2, FileSpreadsheet,
  FileDown, Eye, ArrowLeft, AlertTriangle, Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { IDS_LIBRARY_INDEX, loadIDSFromLibrary, loadIDSFromFile } from '@/data/idsLibrary';
import { validateIDS } from '@/services/idsValidator';
import { exportValidationCSV } from '@/services/exportCSV';
import { exportPDFFromElement } from '@/services/exportPDF';
import { useTrimbleContext } from '@/hooks/useTrimbleConnect';
import { getAllIFCObjects, selectObjectsInViewer, getLoadedModels, colorObjectsInViewer, resetObjectColorInViewer } from '@/services/viewerBridge';
import type { IDSFile, IDSValidationResult, IDSValidationDetail } from '@/types';
import type { IDSLibraryEntry } from '@/data/idsLibrary';

type ViewState = 'select' | 'loading' | 'loaded' | 'validating' | 'results' | 'pdf-preview';
type PdfStyle = 'modern-dark' | 'clean-minimal' | 'corporate-gradient';

const pdfStyles: { id: PdfStyle; label: string; description: string }[] = [
  { id: 'modern-dark', label: 'Modern Dark', description: 'Header sombre, accents bleus, typographie forte' },
  { id: 'clean-minimal', label: 'Clean Minimal', description: 'Fond blanc épuré, bordures fines, focus données' },
  { id: 'corporate-gradient', label: 'Corporate Gradient', description: 'Gradient Trimble, badges colorés, professionnel' },
];

type ResultFilter = 'all' | 'pass' | 'fail';

export function IDSCheckerTab() {
  const { api } = useTrimbleContext();
  const [viewState, setViewState] = useState<ViewState>('select');
  const [selectedIDS, setSelectedIDS] = useState<IDSFile | null>(null);
  const [results, setResults] = useState<IDSValidationResult[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [validationProgress, setValidationProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [pdfStyle, setPdfStyle] = useState<PdfStyle>('corporate-gradient');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [colorApplied, setColorApplied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load from library ──
  const handleSelectFromLibrary = useCallback(async (entry: IDSLibraryEntry) => {
    setViewState('loading');
    setLoadError(null);
    setShowLibrary(false);
    try {
      const ids = await loadIDSFromLibrary(entry);
      setSelectedIDS(ids);
      setViewState('loaded');
      setResults([]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur de chargement');
      setViewState('select');
    }
  }, []);

  // ── Load from file (drag or file input) ──
  const handleLoadFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.ids')) {
      setLoadError("Le fichier doit avoir l'extension .ids");
      return;
    }
    setViewState('loading');
    setLoadError(null);
    try {
      const ids = await loadIDSFromFile(file);
      setSelectedIDS(ids);
      setViewState('loaded');
      setResults([]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur de parsing du fichier IDS');
      setViewState('select');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleLoadFile(file);
  }, [handleLoadFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleLoadFile(file);
    e.target.value = '';
  }, [handleLoadFile]);

  // ── Validation ──
  const handleRunValidation = useCallback(async () => {
    if (!selectedIDS) return;
    setViewState('validating');
    setValidationProgress(0);
    try {
      const objects = await getAllIFCObjects(api);
      const res = await validateIDS(selectedIDS, {
        objects,
        onProgress: (pct) => setValidationProgress(pct),
      });
      setResults(res);
      setViewState('results');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur pendant la validation');
      setViewState('loaded');
    }
  }, [selectedIDS, api]);

  // ── Export ──
  const handleExportCSV = useCallback(() => {
    setShowExportMenu(false);
    if (results.length > 0 && selectedIDS) {
      exportValidationCSV(results, selectedIDS);
    }
  }, [results, selectedIDS]);

  const handleExportPDF = useCallback(() => {
    setShowExportMenu(false);
    setViewState('pdf-preview');
  }, []);

  // ── Select object in viewer ──
  const handleSelectObject = useCallback(async (objectId: string) => {
    if (!api) return;
    const models = await getLoadedModels(api);
    if (models.length === 0) return;
    const parts = objectId.split('-');
    const runtimeId = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(runtimeId)) {
      await selectObjectsInViewer(api, models[0].id, [runtimeId]);
    }
  }, [api]);

  // ── Select all non-conformes ──
  const handleSelectAllFailed = useCallback(async () => {
    if (!api) return;
    const models = await getLoadedModels(api);
    if (models.length === 0) return;
    const failedIds: number[] = [];
    for (const r of results) {
      for (const d of r.details) {
        if (d.status === 'fail') {
          const parts = d.objectId.split('-');
          const rid = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(rid)) failedIds.push(rid);
        }
      }
    }
    if (failedIds.length > 0) {
      await selectObjectsInViewer(api, models[0].id, failedIds);
    }
  }, [api, results]);

  // ── Color pass/fail in viewer ──
  const handleToggleColors = useCallback(async () => {
    if (!api) return;
    const models = await getLoadedModels(api);
    if (models.length === 0) return;
    const modelId = models[0].id;

    if (colorApplied) {
      const allIds: number[] = [];
      for (const r of results) {
        for (const d of r.details) {
          const parts = d.objectId.split('-');
          const rid = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(rid)) allIds.push(rid);
        }
      }
      await resetObjectColorInViewer(api, modelId, allIds);
      setColorApplied(false);
    } else {
      const passIds: number[] = [];
      const failIds: number[] = [];
      for (const r of results) {
        for (const d of r.details) {
          const parts = d.objectId.split('-');
          const rid = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(rid)) {
            if (d.status === 'pass') passIds.push(rid);
            else failIds.push(rid);
          }
        }
      }
      if (passIds.length > 0) await colorObjectsInViewer(api, modelId, passIds, '#10b981');
      if (failIds.length > 0) await colorObjectsInViewer(api, modelId, failIds, '#ef4444');
      setColorApplied(true);
    }
  }, [api, results, colorApplied]);

  const totalChecked = results.reduce((s, r) => s + r.totalChecked, 0);
  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  const passRate = totalChecked > 0 ? Math.round((totalPassed / totalChecked) * 100) : 0;

  const filteredResults = useMemo(() => {
    if (resultFilter === 'all') return results;
    return results
      .map((r) => ({
        ...r,
        details: r.details.filter((d) =>
          resultFilter === 'pass' ? d.status === 'pass' : d.status === 'fail'
        ),
      }))
      .filter((r) => resultFilter === 'fail' ? r.failed > 0 : r.passed > 0);
  }, [results, resultFilter]);

  // ── PDF Preview mode ──
  if (viewState === 'pdf-preview' && selectedIDS) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-card">
          <Button variant="ghost" size="xs" onClick={() => setViewState('results')} className="gap-1">
            <ArrowLeft className="size-3.5" />
            Retour aux résultats
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Style :</span>
            {pdfStyles.map((s) => (
              <button
                key={s.id}
                onClick={() => setPdfStyle(s.id)}
                className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-medium transition-all",
                  pdfStyle === s.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <ScrollArea className="flex-1 bg-muted/30">
          <div className="p-4 flex justify-center">
            <PDFPreview
              style={pdfStyle}
              idsFile={selectedIDS}
              results={results}
              totalChecked={totalChecked}
              totalPassed={totalPassed}
              totalFailed={totalFailed}
              passRate={passRate}
            />
          </div>
        </ScrollArea>
        <div className="border-t bg-card p-2 flex items-center justify-center gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={async () => {
              try {
                const fname = `rapport-ids-${selectedIDS.name.replace(/[^a-zA-Z0-9àéèêëïôùûç_-]/g, '_').slice(0, 40)}-${new Date().toISOString().slice(0, 10)}.pdf`;
                await exportPDFFromElement('pdf-content', fname);
              } catch (err) {
                console.error('PDF export error:', err);
              }
            }}
          >
            <FileDown className="size-3.5" />
            Télécharger PDF
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-3">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".ids"
          className="hidden"
          onChange={handleFileInput}
        />

        {/* Title */}
        <div className="flex items-center gap-2">
          <Shield className="size-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Validateur IDS</h2>
            <p className="text-xs text-muted-foreground">
              Vérifiez votre maquette avec un fichier IDS (buildingSMART)
            </p>
          </div>
        </div>

        {/* Error display */}
        {loadError && (
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 animate-slide-down">
            <CardContent className="p-3 flex items-start gap-2">
              <AlertTriangle className="size-4 text-red-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">Erreur</p>
                <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">{loadError}</p>
              </div>
              <Button variant="ghost" size="xs" onClick={() => setLoadError(null)}>
                <X className="size-3" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => {
            if (showLibrary) {
              setShowLibrary(false);
            } else {
              fileInputRef.current?.click();
            }
          }}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
            isDragging
              ? "border-primary bg-primary/5 scale-[1.02]"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
          )}
        >
          <div className="flex flex-col items-center gap-2">
            <div className={cn(
              "size-10 rounded-xl flex items-center justify-center transition-colors",
              isDragging ? "bg-primary/20" : "bg-muted"
            )}>
              <Upload className={cn("size-5", isDragging ? "text-primary" : "text-muted-foreground")} />
            </div>
            <div>
              <p className="text-sm font-medium">
                Glissez un fichier <strong className="text-primary">.ids</strong> ici
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                ou cliquez pour parcourir vos fichiers
              </p>
            </div>
          </div>
        </div>

        {/* Library toggle */}
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => setShowLibrary(!showLibrary)}
        >
          <Library className="size-3.5" />
          Bibliothèque IDS ({IDS_LIBRARY_INDEX.length} fichiers)
          <ChevronDown className={cn("size-3 ml-auto transition-transform", showLibrary && "rotate-180")} />
        </Button>

        {/* IDS Library */}
        {showLibrary && (
          <Card className="animate-slide-down">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Library className="size-4 text-primary" />
                  Bibliothèque IDS
                </CardTitle>
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-primary gap-1"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  <Plus className="size-3" />
                  Importer
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {IDS_LIBRARY_INDEX.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleSelectFromLibrary(entry)}
                  className={cn(
                    "w-full text-left p-2.5 rounded-lg border transition-all hover:shadow-sm",
                    selectedIDS?.id === entry.id
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:border-border hover:bg-accent/50"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <FileCheck className="size-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{entry.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">v{entry.version}</span>
                        <span className="text-[10px] text-muted-foreground">•</span>
                        <span className="text-[10px] text-muted-foreground">{entry.objective}</span>
                        <Badge variant="secondary" className="text-[9px] px-1 py-0">Intégré</Badge>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Loading state */}
        {viewState === 'loading' && (
          <Card className="animate-fade-in">
            <CardContent className="p-4 text-center space-y-2">
              <Loader2 className="size-6 text-primary mx-auto animate-spin" />
              <p className="text-sm text-muted-foreground">Chargement et parsing du fichier IDS...</p>
            </CardContent>
          </Card>
        )}

        {/* Loaded IDS */}
        {selectedIDS && (viewState === 'loaded' || viewState === 'results') && (
          <Card>
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2.5">
                  <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="size-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{selectedIDS.name}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1.5 text-xs">
                      <div><span className="text-muted-foreground">Version: </span><span className="font-medium">{selectedIDS.version || '—'}</span></div>
                      <div><span className="text-muted-foreground">Auteur: </span><span className="font-medium">{selectedIDS.author || '—'}</span></div>
                      <div><span className="text-muted-foreground">Date: </span><span className="font-medium">{selectedIDS.date || '—'}</span></div>
                      <div><span className="text-muted-foreground">Objectif: </span><Badge variant="secondary" className="text-[10px] px-1 py-0">{selectedIDS.objective || 'N/A'}</Badge></div>
                    </div>
                    {!selectedIDS.isBuiltIn && (
                      <Badge variant="outline" className="mt-1.5 text-[9px] text-amber-600 border-amber-300">
                        Fichier importé
                      </Badge>
                    )}
                  </div>
                </div>
                {viewState === 'loaded' && (
                  <Button size="sm" onClick={handleRunValidation} className="gap-1.5 shrink-0">
                    <Play className="size-3.5" />
                    Lancer la vérification
                  </Button>
                )}
              </div>

              {selectedIDS.description && (
                <p className="text-xs text-muted-foreground mt-2 pl-10.5">
                  {selectedIDS.description}
                </p>
              )}

              <div className="mt-3 pl-10.5">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Spécifications ({selectedIDS.specifications.length})
                </p>
                <div className="space-y-1.5">
                  {selectedIDS.specifications.map((spec) => (
                    <SpecificationCard key={spec.id} spec={spec} />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Validating */}
        {viewState === 'validating' && (
          <Card className="animate-fade-in">
            <CardContent className="p-4 text-center space-y-3">
              <Loader2 className="size-8 text-primary mx-auto animate-spin" />
              <div>
                <p className="text-sm font-medium">Validation en cours...</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Analyse de {selectedIDS?.specifications.length ?? 0} spécification(s) sur le modèle
                </p>
              </div>
              <Progress value={validationProgress} className="h-2" indicatorClassName="bg-primary" />
              <p className="text-xs tabular-nums text-muted-foreground">{validationProgress}%</p>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {viewState === 'results' && results.length > 0 && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-2">
              <Card className="border-border">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold">{totalChecked}</p>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total vérifié</p>
                </CardContent>
              </Card>
              <Card className="bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{totalPassed}</p>
                  <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">Conformes</p>
                </CardContent>
              </Card>
              <Card className="bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{totalFailed}</p>
                  <p className="text-[10px] text-red-600 font-medium uppercase tracking-wider">Non conformes</p>
                </CardContent>
              </Card>
            </div>

            {/* Progress bar */}
            <Card>
              <CardContent className="p-3">
                <div className="h-4 rounded-full overflow-hidden flex bg-secondary">
                  <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${passRate}%` }} />
                  <div className="bg-red-500 transition-all duration-700" style={{ width: `${100 - passRate}%` }} />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Check className="size-3.5 text-emerald-500" />
                    <span className="text-emerald-600 font-medium">{passRate}% conformes</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <X className="size-3.5 text-red-500" />
                    <span className="text-red-600 font-medium">{100 - passRate}% non conformes</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Filter + color controls */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 flex-1">
                <Filter className="size-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground mr-1">Filtrer :</span>
                {(['all', 'pass', 'fail'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setResultFilter(f)}
                    className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-medium transition-all",
                      resultFilter === f
                        ? f === 'fail' ? "bg-red-500 text-white" :
                          f === 'pass' ? "bg-emerald-500 text-white" :
                          "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    )}
                  >
                    {f === 'all' ? 'Tous' : f === 'pass' ? 'Conformes' : 'Non conformes'}
                  </button>
                ))}
              </div>
              <Button
                variant={colorApplied ? 'default' : 'outline'}
                size="xs"
                className="gap-1 shrink-0"
                onClick={handleToggleColors}
                title={colorApplied ? 'Réinitialiser les couleurs' : 'Colorer pass/fail dans le viewer'}
              >
                <Eye className="size-3" />
                {colorApplied ? 'Reset couleurs' : 'Colorer 3D'}
              </Button>
            </div>

            {/* Results per specification */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Résultats par spécification</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {filteredResults.map((result) => (
                  <ResultRow key={result.specificationId} result={result} onSelectObject={handleSelectObject} />
                ))}
              </CardContent>
            </Card>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Button variant="destructive" size="sm" className="flex-1 gap-1.5" onClick={handleSelectAllFailed}>
                <Crosshair className="size-3.5" />
                Sélectionner non conformes ({totalFailed})
              </Button>
              <div className="relative flex-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => setShowExportMenu(!showExportMenu)}
                >
                  <Download className="size-3.5" />
                  Exporter rapport
                  <ChevronDown className={cn("size-3 transition-transform", showExportMenu && "rotate-180")} />
                </Button>
                {showExportMenu && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-card border rounded-lg shadow-lg overflow-hidden animate-slide-down z-50">
                    <button
                      onClick={handleExportPDF}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
                    >
                      <FileDown className="size-4 text-red-500" />
                      <div className="text-left">
                        <p className="font-medium text-xs">Exporter en PDF</p>
                        <p className="text-[10px] text-muted-foreground">Rapport formaté avec graphiques</p>
                      </div>
                    </button>
                    <Separator />
                    <button
                      onClick={handleExportCSV}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
                    >
                      <FileSpreadsheet className="size-4 text-emerald-500" />
                      <div className="text-left">
                        <p className="font-medium text-xs">Exporter en CSV</p>
                        <p className="text-[10px] text-muted-foreground">Données brutes pour Excel/tableur</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}

// ── Sub-components ──

function SpecificationCard({ spec }: { spec: { id: string; name: string; description: string; ifcEntity: string; requirements: { id: string }[] } }) {
  return (
    <div className="p-2.5 rounded-lg border bg-card hover:shadow-sm transition-shadow">
      <p className="text-sm font-medium">{spec.name}</p>
      {spec.description && <p className="text-xs text-muted-foreground mt-0.5">{spec.description}</p>}
      <div className="flex items-center gap-2 mt-1.5">
        <Badge variant="outline" className="text-[10px] font-mono">Cible: {spec.ifcEntity}</Badge>
        <span className="text-[10px] text-muted-foreground">• {spec.requirements.length} exigence(s)</span>
      </div>
    </div>
  );
}

function ResultRow({ result, onSelectObject }: { result: IDSValidationResult; onSelectObject: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasFailed = result.failed > 0;
  const noData = result.totalChecked === 0;

  return (
    <div className={cn(
      "rounded-lg border transition-all",
      noData ? "border-amber-200 dark:border-amber-900" :
      hasFailed ? "border-red-200 dark:border-red-900" : "border-emerald-200 dark:border-emerald-900"
    )}>
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-2.5 p-2.5 text-left">
        <div className={cn(
          "size-5 rounded-full flex items-center justify-center shrink-0",
          noData ? "bg-amber-100 dark:bg-amber-900/30" :
          hasFailed ? "bg-red-100 dark:bg-red-900/30" : "bg-emerald-100 dark:bg-emerald-900/30"
        )}>
          {noData ? <AlertTriangle className="size-3 text-amber-600" /> :
           hasFailed ? <X className="size-3 text-red-600" /> : <Check className="size-3 text-emerald-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{result.specificationName}</p>
          <p className="text-[10px] text-muted-foreground font-mono">{result.ifcEntity}</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs shrink-0">
          {noData ? (
            <span className="text-amber-600 font-medium text-[10px]">Aucun objet trouvé</span>
          ) : (
            <>
              <span className="text-emerald-600 font-medium">{result.passed}<span className="text-muted-foreground font-normal"> ✓</span></span>
              <span className="text-muted-foreground">/</span>
              <span className="text-red-600 font-medium">{result.failed}<span className="text-muted-foreground font-normal"> ✗</span></span>
            </>
          )}
        </div>
        {result.details.length > 0 && (
          expanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </button>

      {expanded && result.details.length > 0 && (
        <div className="border-t px-2.5 py-2 space-y-1 bg-muted/20">
          {result.details.map((detail) => (
            <button
              key={detail.objectId}
              onClick={() => onSelectObject(detail.objectId)}
              className={cn(
                "w-full flex items-center gap-2 text-xs py-1.5 px-2 rounded cursor-pointer transition-colors text-left",
                detail.status === 'fail'
                  ? "bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40"
                  : "hover:bg-accent/50"
              )}
            >
              {detail.status === 'pass' ? <Check className="size-3 text-emerald-500 shrink-0" /> : <X className="size-3 text-red-500 shrink-0" />}
              <span className="font-medium truncate">{detail.objectName}</span>
              {detail.status === 'fail' && (
                <span className="text-red-600 text-[10px] ml-auto truncate max-w-[180px]">{detail.message}</span>
              )}
              <Crosshair className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 ml-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PDF Preview Component ──

function PDFPreview({
  style,
  idsFile,
  results,
  totalChecked,
  totalPassed,
  totalFailed,
  passRate,
}: {
  style: PdfStyle;
  idsFile: IDSFile;
  results: IDSValidationResult[];
  totalChecked: number;
  totalPassed: number;
  totalFailed: number;
  passRate: number;
}) {
  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  if (style === 'modern-dark') {
    return (
      <div className="w-full max-w-[520px] bg-white shadow-2xl rounded-lg overflow-hidden text-gray-800 border" id="pdf-content">
        <div className="bg-gray-900 text-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-blue-500 flex items-center justify-center">
                <Shield className="size-4 text-white" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-400">Rapport de validation</p>
                <h1 className="text-lg font-bold">IDS Checker</h1>
              </div>
            </div>
            <div className="text-right text-xs text-gray-400">
              <p>{now}</p>
              <p>buildingSMART IDS</p>
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-sm font-semibold text-blue-400">{idsFile.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">v{idsFile.version} — {idsFile.author}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-0 border-b">
          <div className="p-4 text-center border-r">
            <p className="text-3xl font-black">{totalChecked}</p>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-1">Vérifiés</p>
          </div>
          <div className="p-4 text-center border-r bg-emerald-50">
            <p className="text-3xl font-black text-emerald-600">{totalPassed}</p>
            <p className="text-[10px] uppercase tracking-wider text-emerald-600 mt-1">Conformes</p>
          </div>
          <div className="p-4 text-center bg-red-50">
            <p className="text-3xl font-black text-red-600">{totalFailed}</p>
            <p className="text-[10px] uppercase tracking-wider text-red-600 mt-1">Non conformes</p>
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 rounded-full overflow-hidden flex bg-gray-100">
              <div className="bg-emerald-500 rounded-l-full" style={{ width: `${passRate}%` }} />
              <div className="bg-red-500 rounded-r-full" style={{ width: `${100 - passRate}%` }} />
            </div>
            <span className="text-sm font-bold">{passRate}%</span>
          </div>
        </div>
        <Separator />
        <div className="p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Détail par spécification</h3>
          <div className="space-y-2">
            {results.map((r) => (
              <div key={r.specificationId} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                <div className={cn("size-6 rounded-full flex items-center justify-center text-white text-xs font-bold", r.failed > 0 ? "bg-red-500" : r.totalChecked === 0 ? "bg-amber-500" : "bg-emerald-500")}>
                  {r.failed > 0 ? '✗' : r.totalChecked === 0 ? '?' : '✓'}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{r.specificationName}</p>
                  <p className="text-[10px] text-gray-400 font-mono">{r.ifcEntity}</p>
                </div>
                <div className="text-right text-xs">
                  <span className="text-emerald-600 font-semibold">{r.passed}</span>
                  <span className="text-gray-300 mx-1">/</span>
                  <span className="text-red-600 font-semibold">{r.failed}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Failed details */}
        {results.some(r => r.details.some(d => d.status === 'fail')) && (
          <div className="px-6 pb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Détail des non-conformités</h3>
            {results.filter(r => r.failed > 0).map(r => (
              <div key={r.specificationId} className="mb-2">
                <p className="text-xs font-semibold text-gray-700 mb-1">{r.specificationName}</p>
                {r.details.filter(d => d.status === 'fail').map(d => (
                  <div key={d.objectId} className="flex items-center gap-1.5 text-[10px] text-red-600 py-0.5">
                    <span>✗</span>
                    <span className="font-medium">{d.objectName}</span>
                    <span className="text-red-400 ml-auto">{d.message}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="bg-gray-50 px-6 py-3 text-[9px] text-gray-400 flex justify-between">
          <span>Généré par Navigateur et Validateur — Trimble Connect Extension</span>
          <span>Page 1/1</span>
        </div>
      </div>
    );
  }

  if (style === 'clean-minimal') {
    return (
      <div className="w-full max-w-[520px] bg-white shadow-2xl rounded-lg overflow-hidden text-gray-800 border" id="pdf-content">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-light text-gray-900">Rapport de validation IDS</h1>
              <p className="text-xs text-gray-400 mt-1">{now} — {idsFile.name} v{idsFile.version}</p>
            </div>
            <div className="size-12 rounded-full border-4 border-gray-200 flex items-center justify-center">
              <span className="text-lg font-bold">{passRate}%</span>
            </div>
          </div>
        </div>
        <div className="flex items-center px-6 py-4 gap-6">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-gray-400" />
            <span className="text-xs text-gray-500">{totalChecked} vérifiés</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-emerald-600">{totalPassed} conformes</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-red-500" />
            <span className="text-xs text-red-600">{totalFailed} non conformes</span>
          </div>
        </div>
        <div className="px-6">
          <div className="h-1.5 rounded-full overflow-hidden flex bg-gray-100">
            <div className="bg-emerald-400" style={{ width: `${passRate}%` }} />
            <div className="bg-red-400" style={{ width: `${100 - passRate}%` }} />
          </div>
        </div>
        <div className="p-6">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-gray-400">
                <th className="pb-2 font-medium">Spécification</th>
                <th className="pb-2 font-medium">Cible</th>
                <th className="pb-2 font-medium text-right">Résultat</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.specificationId} className="border-b border-gray-50">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      {r.failed > 0 ? <X className="size-3 text-red-500" /> : r.totalChecked === 0 ? <AlertTriangle className="size-3 text-amber-500" /> : <Check className="size-3 text-emerald-500" />}
                      <span className="font-medium">{r.specificationName}</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-gray-400 font-mono text-[10px]">{r.ifcEntity}</td>
                  <td className="py-2.5 text-right">
                    <span className="text-emerald-600">{r.passed}✓</span>
                    {' '}
                    <span className="text-red-600">{r.failed}✗</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 text-[9px] text-gray-300 text-center border-t">
          Navigateur et Validateur — Trimble Connect — {now}
        </div>
      </div>
    );
  }

  // Corporate Gradient (default)
  return (
    <div className="w-full max-w-[520px] bg-white shadow-2xl rounded-lg overflow-hidden text-gray-800 border" id="pdf-content">
      <div className="bg-gradient-to-r from-[#0063a3] to-[#004f83] text-white p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
            <Shield className="size-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Rapport de Validation IDS</h1>
            <p className="text-xs text-blue-200">buildingSMART Information Delivery Specification</p>
          </div>
        </div>
        <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-blue-200">Fichier IDS : </span><span className="font-semibold">{idsFile.name}</span></div>
            <div><span className="text-blue-200">Version : </span><span className="font-semibold">{idsFile.version}</span></div>
            <div><span className="text-blue-200">Auteur : </span><span className="font-semibold">{idsFile.author}</span></div>
            <div><span className="text-blue-200">Date rapport : </span><span className="font-semibold">{now}</span></div>
          </div>
        </div>
      </div>
      <div className="px-6 py-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Score de conformité</h3>
          <div className={cn(
            "px-3 py-1 rounded-full text-xs font-bold",
            passRate >= 80 ? "bg-emerald-100 text-emerald-700" :
            passRate >= 50 ? "bg-amber-100 text-amber-700" :
            "bg-red-100 text-red-700"
          )}>
            {passRate}% conforme
          </div>
        </div>
        <div className="h-5 rounded-xl overflow-hidden flex bg-gray-100 shadow-inner">
          <div
            className="bg-gradient-to-r from-emerald-400 to-emerald-500 flex items-center justify-end pr-2 rounded-l-xl"
            style={{ width: `${Math.max(passRate, 8)}%` }}
          >
            {passRate > 15 && <span className="text-[9px] font-bold text-white">{totalPassed}</span>}
          </div>
          <div
            className="bg-gradient-to-r from-red-400 to-red-500 flex items-center pl-2 rounded-r-xl"
            style={{ width: `${Math.max(100 - passRate, 8)}%` }}
          >
            {(100 - passRate) > 15 && <span className="text-[9px] font-bold text-white">{totalFailed}</span>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-black text-gray-800">{totalChecked}</p>
            <p className="text-[9px] uppercase tracking-wider text-gray-400 mt-0.5">Éléments vérifiés</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-black text-emerald-600">{totalPassed}</p>
            <p className="text-[9px] uppercase tracking-wider text-emerald-500 mt-0.5">Conformes</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-black text-red-600">{totalFailed}</p>
            <p className="text-[9px] uppercase tracking-wider text-red-500 mt-0.5">Non conformes</p>
          </div>
        </div>
      </div>
      <Separator />
      <div className="px-6 py-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
          Résultats par spécification ({results.length})
        </h3>
        <div className="space-y-2">
          {results.map((r) => (
            <div key={r.specificationId} className={cn(
              "rounded-xl p-3 border-l-4",
              r.totalChecked === 0 ? "bg-amber-50/50 border-amber-500" :
              r.failed > 0 ? "bg-red-50/50 border-red-500" : "bg-emerald-50/50 border-emerald-500"
            )}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">{r.specificationName}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{r.ifcEntity}</span>
                    <span className="text-[10px] text-gray-400">{r.totalChecked} objet(s) analysé(s)</span>
                  </div>
                </div>
                <div className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-bold",
                  r.totalChecked === 0 ? "bg-amber-100 text-amber-700" :
                  r.failed > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                )}>
                  {r.totalChecked === 0 ? 'N/A' : r.failed > 0 ? `${r.failed} non conforme(s)` : 'Conforme'}
                </div>
              </div>
              {r.details.filter(d => d.status === 'fail').length > 0 && (
                <div className="mt-2 space-y-1">
                  {r.details.filter(d => d.status === 'fail').map((d) => (
                    <div key={d.objectId} className="flex items-center gap-1.5 text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded">
                      <X className="size-2.5 shrink-0" />
                      <span className="font-medium">{d.objectName}</span>
                      <span className="text-red-400 ml-auto truncate max-w-[200px]">{d.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-3 flex items-center justify-between text-[9px] text-gray-400">
        <div className="flex items-center gap-1.5">
          <Shield className="size-3" />
          <span>Navigateur et Validateur — Extension Trimble Connect</span>
        </div>
        <span>Page 1/1</span>
      </div>
    </div>
  );
}
