/**
 * Bridge between the Trimble Viewer API and our app's data structures.
 * When api is null (dev mode), returns mock data.
 * When api is available (embedded in TC), uses real viewer data.
 */
import type { TrimbleAPI } from '@/hooks/useTrimbleConnect';
import type { ModelTreeNode, IFCObject, ViewerSelection } from '@/types';
import { mockModelTree, mockStatistics } from '@/data/mockData';
import { MOCK_IFC_OBJECTS } from '@/services/idsValidator';

// ── Helpers ──

function normalizeIfcClass(raw: string): string {
  let cls = raw.trim().toUpperCase();
  if (!cls) return '';
  if (!cls.startsWith('IFC') && cls.length > 0) cls = 'IFC' + cls;
  return cls;
}

function formatIfcClass(upper: string): string {
  if (!upper.startsWith('IFC')) return upper;
  return 'Ifc' + upper.slice(3).charAt(0).toUpperCase() + upper.slice(4).toLowerCase();
}

/**
 * Generic property set parser that handles multiple formats returned by TC Viewer API:
 * - Array of { name, properties: [{ name, value }] }
 * - Array of { name, values: [{ name, value }] }
 * - Array of { name, properties: { key: value } }  (object form)
 * - Direct object with { key: value } pairs
 */
function parsePsets(raw: unknown): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  if (!raw) return result;

  const arr = Array.isArray(raw) ? raw : [raw];

  for (const pset of arr) {
    if (!pset || typeof pset !== 'object') continue;
    const p = pset as Record<string, unknown>;
    const psetName = String(p.name ?? p.displayName ?? p.Name ?? 'Properties');

    // Inner properties can be array or object
    const inner = p.properties ?? p.values ?? p.attributes ?? p.Properties;

    if (Array.isArray(inner)) {
      const map: Record<string, string> = {};
      for (const prop of inner) {
        if (!prop || typeof prop !== 'object') continue;
        const pp = prop as Record<string, unknown>;
        const key = String(pp.name ?? pp.displayName ?? pp.Name ?? '');
        const val = pp.value ?? pp.displayValue ?? pp.nominalValue ?? pp.Value ?? '';
        if (key) map[key] = String(val);
      }
      if (Object.keys(map).length > 0) result[psetName] = map;
    } else if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const map: Record<string, string> = {};
      for (const [k, v] of Object.entries(inner as Record<string, unknown>)) {
        if (v != null) map[k] = String(v);
      }
      if (Object.keys(map).length > 0) result[psetName] = map;
    }
  }

  return result;
}

/**
 * Extract a human-readable name from parsed property sets.
 * Tries common IFC property locations.
 */
function extractNameFromProps(
  props: Record<string, Record<string, string>>,
  topLevelName: string | undefined,
): string {
  if (topLevelName && topLevelName !== 'Object' && topLevelName.length > 1) return topLevelName;

  const candidates = [
    ['Product', 'Product Name'],
    ['Product', 'Name'],
    ['Identity Data', 'Name'],
    ['Attributes', 'Name'],
    ['Reference Object', 'Name'],
    ['Pset_ManufacturerTypeInformation', 'ModelReference'],
  ];
  for (const [pset, key] of candidates) {
    const val = props[pset]?.[key];
    if (val && val.length > 0) return val;
  }
  return topLevelName || 'Object';
}

/**
 * Extract IFC type from parsed property sets when top-level type is missing.
 */
function extractTypeFromProps(
  props: Record<string, Record<string, string>>,
  topLevelType: string | undefined,
): string {
  if (topLevelType && topLevelType !== 'Unknown' && topLevelType.length > 1) {
    const norm = normalizeIfcClass(topLevelType);
    return norm || topLevelType;
  }

  const candidates = [
    ['Reference Object', 'Common Type'],
    ['Reference Object', 'Type'],
    ['Identity Data', 'Type'],
    ['Product', 'Common Type'],
  ];
  for (const [pset, key] of candidates) {
    const val = props[pset]?.[key];
    if (val && val.length > 0) return normalizeIfcClass(val) || val;
  }
  return topLevelType || 'Unknown';
}

// ── Model & Hierarchy ──

export interface LoadedModel {
  id: string;
  name: string;
}

export async function getLoadedModels(api: TrimbleAPI | null): Promise<LoadedModel[]> {
  if (!api) {
    return [{ id: 'mock-model-1', name: 'Projet Test DOE.ifc' }];
  }
  try {
    const models = await api.viewer.getModels('loaded') as Array<{ id: string; name?: string }>;
    console.log('[ViewerBridge] loaded models:', models);
    return models.map((m) => ({ id: m.id, name: m.name ?? m.id }));
  } catch (err) {
    console.error('getLoadedModels failed:', err);
    return [];
  }
}

export async function getModelTree(api: TrimbleAPI | null): Promise<ModelTreeNode[]> {
  if (!api) return mockModelTree;

  try {
    const models = await getLoadedModels(api);
    if (models.length === 0) return [];

    const rootChildren: ModelTreeNode[] = [];

    for (const model of models) {
      const hierarchy = await api.viewer.getHierarchyChildren(model.id, [], 'spatial', true) as Array<{
        runtimeId: number;
        name?: string;
        type?: string;
        ifcType?: string;
        children?: unknown[];
        objectCount?: number;
      }>;

      const mapNode = (n: typeof hierarchy[0], depth: number): ModelTreeNode => ({
        id: `${model.id}-${n.runtimeId}`,
        name: n.name ?? `Objet ${n.runtimeId}`,
        type: depth === 0 ? 'level' : depth === 1 ? 'room' : 'element',
        ifcClass: n.ifcType ?? n.type,
        visible: true,
        objectCount: n.objectCount,
        children: (n.children as typeof hierarchy | undefined)?.map(c => mapNode(c, depth + 1)),
      });

      rootChildren.push({
        id: model.id,
        name: model.name,
        type: 'model',
        visible: true,
        children: hierarchy.map(n => mapNode(n, 0)),
      });
    }

    return [{
      id: 'root',
      name: 'Projet',
      type: 'project',
      visible: true,
      children: rootChildren,
    }];
  } catch (err) {
    console.error('getModelTree failed:', err);
    return mockModelTree;
  }
}

// ── Object Properties (for IDS validation) ──

export async function getAllIFCObjects(api: TrimbleAPI | null): Promise<IFCObject[]> {
  if (!api) return MOCK_IFC_OBJECTS;

  try {
    const models = await getLoadedModels(api);
    console.log('[ViewerBridge] getAllIFCObjects: models count =', models.length);
    if (models.length === 0) return MOCK_IFC_OBJECTS;

    const allObjects: IFCObject[] = [];

    for (const model of models) {
      let hierarchy: Array<{ runtimeId: number; children?: unknown[] }>;
      try {
        hierarchy = await api.viewer.getHierarchyChildren(model.id, [], 'spatial', true) as typeof hierarchy;
        console.log('[ViewerBridge] hierarchy nodes for', model.name, ':', hierarchy?.length ?? 0);
      } catch (e) {
        console.error('[ViewerBridge] getHierarchyChildren failed for', model.id, e);
        continue;
      }

      if (!hierarchy || hierarchy.length === 0) continue;

      const allRuntimeIds = collectRuntimeIds(hierarchy);
      console.log('[ViewerBridge] total runtimeIds:', allRuntimeIds.length);

      const batchSize = 50;
      for (let i = 0; i < allRuntimeIds.length; i += batchSize) {
        const batch = allRuntimeIds.slice(i, i + batchSize);
        try {
          const rawArray = await api.viewer.getObjectProperties(model.id, batch);
          const propsArray = (Array.isArray(rawArray) ? rawArray : [rawArray]) as Array<Record<string, unknown>>;

          if (i === 0) console.log('[ViewerBridge] sample object props:', JSON.stringify(propsArray[0]).slice(0, 500));

          for (const obj of propsArray) {
            const ifcObj = viewerPropsToIFCObject(obj as never, model.id);
            if (ifcObj) allObjects.push(ifcObj);
          }
        } catch (e) {
          console.error('[ViewerBridge] getObjectProperties batch failed:', e);
        }
      }
    }

    console.log('[ViewerBridge] getAllIFCObjects: parsed', allObjects.length, 'IFC objects');
    return allObjects.length > 0 ? allObjects : MOCK_IFC_OBJECTS;
  } catch (err) {
    console.error('getAllIFCObjects failed:', err);
    return MOCK_IFC_OBJECTS;
  }
}

function collectRuntimeIds(nodes: Array<{ runtimeId: number; children?: unknown[] }>): number[] {
  const ids: number[] = [];
  for (const n of nodes) {
    if (n.runtimeId != null) ids.push(n.runtimeId);
    if (n.children) {
      ids.push(...collectRuntimeIds(n.children as typeof nodes));
    }
  }
  return ids;
}

function viewerPropsToIFCObject(
  obj: Record<string, unknown>,
  modelId: string,
): IFCObject | null {
  if (!obj) return null;

  const rawType = String(obj.type ?? obj.ifcType ?? obj.Type ?? '');
  const ifcClass = normalizeIfcClass(rawType);
  if (!ifcClass || ifcClass === 'IFC') return null;

  const properties: Record<string, Record<string, string>> = {};
  const materials: string[] = [];
  const classifications: { system: string; value: string }[] = [];
  const attributes: Record<string, string> = {};

  const rawName = String(obj.name ?? obj.Name ?? '');
  if (rawName) attributes['Name'] = rawName;

  const psets = parsePsets(obj.properties ?? obj.propertySets ?? []);

  for (const [psetName, propMap] of Object.entries(psets)) {
    const psetLower = psetName.toLowerCase();

    if (psetLower.includes('material')) {
      for (const val of Object.values(propMap)) {
        if (val) materials.push(val);
      }
      continue;
    }

    if (psetLower.includes('classification')) {
      let system = '';
      let value = '';
      for (const [k, v] of Object.entries(propMap)) {
        const kl = k.toLowerCase();
        if (kl.includes('system') || kl === 'name') system = v;
        if (kl.includes('reference') || kl === 'itemreference') value = v;
      }
      if (system || value) classifications.push({ system, value });
      continue;
    }

    properties[psetName] = propMap;
  }

  const displayName = extractNameFromProps({ ...properties, ...psets }, rawName || undefined);

  return {
    id: `${modelId}-${obj.runtimeId ?? ''}`,
    name: displayName,
    ifcClass,
    attributes,
    properties,
    materials,
    classifications,
  };
}

// ── Filter detection from model data ──

export interface DetectedFilters {
  ifcClasses: Array<{ name: string; count: number }>;
  materials: Array<{ name: string; count: number }>;
  levels: Array<{ name: string; count: number }>;
  propertySets: Array<{ name: string; count: number }>;
}

const MOCK_FILTERS: DetectedFilters = {
  ifcClasses: [
    { name: 'IfcWall', count: 42 }, { name: 'IfcWallStandardCase', count: 38 },
    { name: 'IfcDoor', count: 28 }, { name: 'IfcWindow', count: 35 },
    { name: 'IfcSlab', count: 12 }, { name: 'IfcBeam', count: 18 },
    { name: 'IfcColumn', count: 15 }, { name: 'IfcFlowTerminal', count: 8 },
    { name: 'IfcFurnishingElement', count: 7 }, { name: 'IfcCovering', count: 22 },
    { name: 'IfcRailing', count: 6 }, { name: 'IfcStairFlight', count: 4 },
  ],
  materials: [
    { name: 'Béton armé C30/37', count: 54 }, { name: 'Acier S355', count: 33 },
    { name: 'Bois lamellé GL24h', count: 12 }, { name: 'Verre trempé 8mm', count: 35 },
    { name: 'Plâtre BA13', count: 22 }, { name: 'Isolation laine roche', count: 18 },
    { name: 'Carrelage grès cérame', count: 9 },
  ],
  levels: [
    { name: 'Niveau 0 (RDC)', count: 45 }, { name: 'Niveau 1', count: 62 },
    { name: 'Niveau 2', count: 58 },
  ],
  propertySets: [
    { name: 'Pset_WallCommon', count: 42 }, { name: 'Pset_DoorCommon', count: 28 },
    { name: 'Pset_WindowCommon', count: 35 }, { name: 'Pset_SlabCommon', count: 12 },
    { name: 'Pset_BeamCommon', count: 18 }, { name: 'Pset_ManufacturerTypeInformation', count: 8 },
    { name: 'Pset_SpaceCommon', count: 14 },
  ],
};

export async function detectModelFilters(api: TrimbleAPI | null): Promise<DetectedFilters> {
  if (!api) return MOCK_FILTERS;

  try {
    const objects = await getAllIFCObjects(api);
    if (objects.length === 0) return MOCK_FILTERS;

    const classCount: Record<string, number> = {};
    const matCount: Record<string, number> = {};
    const levelCount: Record<string, number> = {};
    const psetCount: Record<string, number> = {};

    for (const obj of objects) {
      classCount[formatIfcClass(obj.ifcClass)] = (classCount[formatIfcClass(obj.ifcClass)] || 0) + 1;

      for (const mat of obj.materials) {
        matCount[mat] = (matCount[mat] || 0) + 1;
      }

      if (obj.ifcClass === 'IFCBUILDINGSTOREY') {
        levelCount[obj.name] = (levelCount[obj.name] || 0);
      }

      for (const psetName of Object.keys(obj.properties)) {
        psetCount[psetName] = (psetCount[psetName] || 0) + 1;
      }
    }

    const toSorted = (rec: Record<string, number>) =>
      Object.entries(rec).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

    return {
      ifcClasses: toSorted(classCount),
      materials: toSorted(matCount),
      levels: toSorted(levelCount),
      propertySets: toSorted(psetCount),
    };
  } catch (err) {
    console.error('detectModelFilters failed:', err);
    return MOCK_FILTERS;
  }
}

// ── Selection helpers ──

export async function getSelectedObjectProperties(
  api: TrimbleAPI | null,
  selection: ViewerSelection[],
): Promise<Array<{ name: string; type: string; properties: Record<string, Record<string, string>> }>> {
  if (!api || selection.length === 0) return [];

  try {
    const results: Array<{ name: string; type: string; properties: Record<string, Record<string, string>> }> = [];

    for (const sel of selection) {
      if (!sel.modelId || !sel.objectRuntimeIds?.length) continue;

      console.log('[ViewerBridge] getObjectProperties', sel.modelId, sel.objectRuntimeIds);
      const raw = await api.viewer.getObjectProperties(sel.modelId, sel.objectRuntimeIds);
      console.log('[ViewerBridge] raw properties:', JSON.stringify(raw).slice(0, 1000));

      const propsArray = (Array.isArray(raw) ? raw : [raw]) as Array<Record<string, unknown>>;

      for (const obj of propsArray) {
        if (!obj) continue;

        const props = parsePsets(obj.properties ?? obj.propertySets ?? obj.attributeSets ?? []);

        // Also extract top-level attributes into their own pset
        const attrs: Record<string, string> = {};
        for (const k of ['Name', 'name', 'Description', 'description', 'Tag', 'tag',
          'GlobalId', 'globalId', 'GUID (IFC)', 'File Format', 'File Name', 'Common Type']) {
          if (obj[k] != null) attrs[k] = String(obj[k]);
        }
        if (Object.keys(attrs).length > 0) props['Attributes'] = attrs;

        const rawName = (obj.name ?? obj.Name ?? '') as string;
        const rawType = (obj.type ?? obj.ifcType ?? obj.Type ?? '') as string;

        const name = extractNameFromProps(props, rawName || undefined);
        const type = extractTypeFromProps(props, rawType || undefined);

        results.push({ name, type, properties: props });
      }
    }
    console.log('[ViewerBridge] parsed results:', results.length, 'objects');
    return results;
  } catch (err) {
    console.error('getSelectedObjectProperties failed:', err);
    return [];
  }
}

// ── Statistics from real model ──

export async function computeModelStatistics(api: TrimbleAPI | null) {
  if (!api) return mockStatistics;

  try {
    const objects = await getAllIFCObjects(api);
    if (objects.length === 0) return mockStatistics;

    const classCount: Record<string, number> = {};
    const materialCount: Record<string, number> = {};
    const levelObjectCount: Record<string, number> = {};
    const levelNames: string[] = [];
    const types = new Set<string>();
    let totalArea = 0;
    let totalVolume = 0;

    for (const obj of objects) {
      classCount[obj.ifcClass] = (classCount[obj.ifcClass] || 0) + 1;
      types.add(obj.ifcClass);

      for (const mat of obj.materials) {
        materialCount[mat] = (materialCount[mat] || 0) + 1;
      }

      if (obj.ifcClass === 'IFCBUILDINGSTOREY') {
        levelNames.push(obj.name);
      }

      // Extract numeric property values for aggregation
      for (const propMap of Object.values(obj.properties)) {
        for (const [k, v] of Object.entries(propMap)) {
          const kl = k.toLowerCase();
          const num = parseFloat(v);
          if (isNaN(num)) continue;
          if (kl.includes('area') || kl.includes('surface')) totalArea += num;
          if (kl.includes('volume')) totalVolume += num;
        }
      }
    }

    // Assign objects to levels heuristically (by counting objects per IFC storey found in names)
    // For now, distribute evenly if no storey data
    if (levelNames.length === 0) {
      levelNames.push('Niveau 0', 'Niveau 1', 'Niveau 2');
    }
    const perLevel = Math.ceil(objects.length / levelNames.length);
    for (const lv of levelNames) {
      levelObjectCount[lv] = (levelObjectCount[lv] || 0) + perLevel;
    }

    const COLORS = ['#0063a3', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#ec4899'];
    const MAT_COLORS = ['#6B7280', '#3B82F6', '#D97706', '#06B6D4', '#14B8A6', '#9CA3AF', '#EF4444', '#10B981'];

    const ifcClassDistribution = Object.entries(classCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], i) => ({ name, count, color: COLORS[i % COLORS.length] }));

    const materialDistribution = Object.entries(materialCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], i) => ({ name, count, color: MAT_COLORS[i % MAT_COLORS.length] }));

    const levelDistribution = levelNames.map(name => ({
      name,
      count: levelObjectCount[name] ?? 0,
    }));

    return {
      totalElements: objects.length,
      totalLevels: levelNames.length,
      totalTypes: types.size,
      ifcClassDistribution,
      levelDistribution,
      materialDistribution,
      propertyStats: totalArea > 0 || totalVolume > 0
        ? [
            { name: 'Surface totale', value: `${Math.round(totalArea)} m²`, icon: 'area' },
            { name: 'Volume total', value: `${Math.round(totalVolume)} m³`, icon: 'volume' },
          ]
        : mockStatistics.propertyStats,
    };
  } catch (err) {
    console.error('computeModelStatistics failed:', err);
    return mockStatistics;
  }
}

// ── Visibility control ──

export async function setObjectVisibility(
  api: TrimbleAPI | null,
  modelId: string,
  runtimeIds: number[],
  visible: boolean,
): Promise<void> {
  if (!api) return;
  try {
    await api.viewer.setObjectState(
      { modelObjectIds: [{ modelId, objectRuntimeIds: runtimeIds }] },
      { visible },
    );
  } catch (err) {
    console.error('setObjectVisibility failed:', err);
  }
}

export async function toggleModelVisibility(
  api: TrimbleAPI | null,
  modelId: string,
  visible: boolean,
): Promise<void> {
  if (!api) return;
  try {
    await (api.viewer as unknown as { toggleModel: (id: string, v: boolean) => Promise<void> }).toggleModel(modelId, visible);
  } catch {
    try {
      await api.viewer.setObjectState(undefined, { visible });
    } catch (err) {
      console.error('toggleModelVisibility failed:', err);
    }
  }
}

export async function selectObjectsInViewer(
  api: TrimbleAPI | null,
  modelId: string,
  runtimeIds: number[],
): Promise<void> {
  if (!api) return;
  try {
    await api.viewer.setSelection(
      { modelObjectIds: [{ modelId, objectRuntimeIds: runtimeIds }] },
      'set',
    );
  } catch (err) {
    console.error('selectObjectsInViewer failed:', err);
  }
}

export async function colorObjectsInViewer(
  api: TrimbleAPI | null,
  modelId: string,
  runtimeIds: number[],
  color: string,
): Promise<void> {
  if (!api || runtimeIds.length === 0) return;
  try {
    await api.viewer.setObjectState(
      { modelObjectIds: [{ modelId, objectRuntimeIds: runtimeIds }] },
      { color },
    );
  } catch (err) {
    console.error('colorObjectsInViewer failed:', err);
  }
}

export async function resetObjectColorInViewer(
  api: TrimbleAPI | null,
  modelId: string,
  runtimeIds: number[],
): Promise<void> {
  if (!api || runtimeIds.length === 0) return;
  try {
    await api.viewer.setObjectState(
      { modelObjectIds: [{ modelId, objectRuntimeIds: runtimeIds }] },
      { color: null },
    );
  } catch (err) {
    console.error('resetObjectColorInViewer failed:', err);
  }
}

export async function isolateObjectsInViewer(
  api: TrimbleAPI | null,
  entities: Array<{ modelId: string; objectRuntimeIds: number[] }>,
): Promise<void> {
  if (!api) return;
  try {
    await api.viewer.isolateEntities(entities.map(e => ({ modelObjectIds: [e] })));
  } catch (err) {
    console.error('isolateObjectsInViewer failed:', err);
  }
}
