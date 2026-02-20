/**
 * Bridge between the Trimble Viewer API and our app's data structures.
 * When api is null (dev mode), returns mock data.
 * When api is available (embedded in TC), uses real viewer data.
 *
 * Real TC Viewer API response format (from getObjectProperties):
 * {
 *   id: 115,                            // runtimeId
 *   class: "IFCFLOWTERMINAL",           // IFC class (already prefixed)
 *   product: {                          // metadata block
 *     name: "Diffuseur d'air",
 *     description: "DC 570 S",
 *     objectType: "Diffuseur d'air",
 *     organizationName: "...",
 *     applicationFullName: "...",
 *     creationDate: "...",
 *     ...
 *   },
 *   properties: [                       // property sets array
 *     { name: "Pset_MEP", properties: [{ name: "...", value: "...", type: N }] },
 *     { name: "CalculatedGeometryValues", properties: [...] },
 *     ...
 *   ],
 *   layers?: [...]                      // presentation layers
 * }
 */
import type { TrimbleAPI } from '@/hooks/useTrimbleConnect';
import type { ModelTreeNode, IFCObject, ViewerSelection } from '@/types';
import { mockModelTree, mockStatistics } from '@/data/mockData';
import { MOCK_IFC_OBJECTS } from '@/services/idsValidator';

function safeStringify(obj: unknown, maxLen = 1000): string {
  try {
    return JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? v.toString() : v).slice(0, maxLen);
  } catch { return String(obj); }
}

// ── Helpers ──

function normalizeIfcClass(raw: string): string {
  let cls = raw.trim().toUpperCase();
  if (!cls) return '';
  if (!cls.startsWith('IFC') && cls.length > 0) cls = 'IFC' + cls;
  return cls;
}

function formatIfcClass(upper: string): string {
  if (!upper || !upper.startsWith('IFC')) return upper;
  const body = upper.slice(3).toLowerCase();
  return 'Ifc' + body.charAt(0).toUpperCase() + body.slice(1);
}

/**
 * Parse the `properties` array from the TC Viewer API.
 * Format: [{ name: "PsetName", properties: [{ name: "key", value: val, type: N }] }]
 */
function parsePsets(raw: unknown): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  if (!raw) return result;

  const arr = Array.isArray(raw) ? raw : [raw];

  for (const pset of arr) {
    if (!pset || typeof pset !== 'object') continue;
    const p = pset as Record<string, unknown>;
    const psetName = String(p.name ?? p.displayName ?? p.Name ?? 'Properties');

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
 * Extract the `product` block from a TC API response object and convert it
 * into two virtual property sets that match what TC shows in its own panel:
 *  - "Reference Object" (GUID, file format, common type, file name)
 *  - "Product" (product name, description, owning user, dates, etc.)
 */
function extractProductPsets(obj: Record<string, unknown>): Record<string, Record<string, string>> {
  const product = obj.product as Record<string, unknown> | undefined;
  if (!product || typeof product !== 'object') return {};

  const result: Record<string, Record<string, string>> = {};

  const refObj: Record<string, string> = {};
  const productInfo: Record<string, string> = {};

  const refKeys: Record<string, string> = {
    'objectType': 'Common Type',
    'applicationIdentifier': 'Application',
    'applicationFullName': 'Application',
    'applicationVersion': 'Application Version',
  };

  const productKeys: Record<string, string> = {
    'name': 'Product Name',
    'description': 'Product Description',
    'objectType': 'Product Object Type',
    'organizationName': 'Owning User',
    'creationDate': 'Creation Date',
    'lastModificationDate': 'Last Modified Date',
    'state': 'State',
    'changeAction': 'Change Action',
  };

  for (const [k, v] of Object.entries(product)) {
    if (v == null || v === '') continue;
    const strVal = String(v);

    if (productKeys[k]) {
      productInfo[productKeys[k]] = strVal;
    }
    if (refKeys[k]) {
      refObj[refKeys[k]] = strVal;
    }
  }

  // Add the class and id as "Reference Object" fields
  if (obj.class) refObj['Common Type'] = String(obj.class);
  if (obj.id != null) refObj['Runtime ID'] = String(obj.id);

  if (Object.keys(refObj).length > 0) result['Reference Object'] = refObj;
  if (Object.keys(productInfo).length > 0) result['Product'] = productInfo;

  return result;
}

/**
 * Extract presentation layers from the API response.
 */
function extractLayers(obj: Record<string, unknown>): Record<string, string> | null {
  const layers = obj.layers as unknown[] | undefined;
  if (!layers || !Array.isArray(layers) || layers.length === 0) return null;

  const map: Record<string, string> = {};
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (typeof layer === 'string') {
      map[`Layer ${i + 1}`] = layer;
    } else if (layer && typeof layer === 'object') {
      const l = layer as Record<string, unknown>;
      map[String(l.name ?? `Layer ${i + 1}`)] = String(l.value ?? l.name ?? '');
    }
  }
  return Object.keys(map).length > 0 ? map : null;
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
    const models = await api.viewer.getModels('loaded') as Array<Record<string, unknown>>;
    console.log('[ViewerBridge] loaded models:', models?.length);
    if (models?.length > 0) {
      console.log('[ViewerBridge] model[0] keys:', Object.keys(models[0]).join(', '));
      console.log('[ViewerBridge] model[0]:', safeStringify(models[0], 500));
    }
    return models.map((m) => ({ id: String(m.id), name: String(m.name ?? m.id) }));
  } catch (err) {
    console.error('[ViewerBridge] getLoadedModels failed:', err);
    return [];
  }
}

// ── Get all runtime IDs from a model using multiple API strategies ──

async function getAllModelRuntimeIds(
  api: TrimbleAPI,
  modelId: string,
): Promise<number[]> {
  const viewer = api.viewer as Record<string, unknown>;

  // Strategy 1: getObjects(modelId) — returns all objects in the model
  if (typeof viewer.getObjects === 'function') {
    try {
      const result = await (viewer.getObjects as Function)(modelId);
      console.log('[ViewerBridge] getObjects result type:', typeof result, Array.isArray(result) ? `length=${result.length}` : '');
      if (result) {
        console.log('[ViewerBridge] getObjects sample:', safeStringify(Array.isArray(result) ? result.slice(0, 3) : result, 500));
      }
      const ids = extractRuntimeIdsFromResult(result);
      if (ids.length > 0) {
        console.log('[ViewerBridge] getObjects extracted', ids.length, 'runtimeIds');
        return ids;
      }
    } catch (e) {
      console.warn('[ViewerBridge] getObjects failed:', e);
    }
  }

  // Strategy 2: getEntities(modelId)
  if (typeof viewer.getEntities === 'function') {
    try {
      const result = await (viewer.getEntities as Function)(modelId);
      console.log('[ViewerBridge] getEntities result type:', typeof result, Array.isArray(result) ? `length=${result.length}` : '');
      if (result) {
        console.log('[ViewerBridge] getEntities sample:', safeStringify(Array.isArray(result) ? result.slice(0, 3) : result, 500));
      }
      const ids = extractRuntimeIdsFromResult(result);
      if (ids.length > 0) {
        console.log('[ViewerBridge] getEntities extracted', ids.length, 'runtimeIds');
        return ids;
      }
    } catch (e) {
      console.warn('[ViewerBridge] getEntities failed:', e);
    }
  }

  // Strategy 3: getHierarchyChildren with different types
  for (const hType of ['spatial', 'containment', 'storey', 'type', '']) {
    try {
      const result = await api.viewer.getHierarchyChildren(modelId, [], hType, true) as unknown[];
      if (result && result.length > 0) {
        console.log(`[ViewerBridge] hierarchy '${hType}' returned ${result.length} nodes`);
        return collectRuntimeIds(result);
      }
    } catch { /* try next */ }
  }

  console.warn('[ViewerBridge] getAllModelRuntimeIds: no strategy returned results');
  return [];
}

function extractRuntimeIdsFromResult(result: unknown): number[] {
  if (!result) return [];

  // If it's a flat array of numbers (runtimeIds directly)
  if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'number') {
    return result as number[];
  }

  // If it's an array of objects with id/runtimeId
  if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'object') {
    const ids: number[] = [];
    for (const item of result) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const id = obj.runtimeId ?? obj.id ?? obj.objectRuntimeId;
      if (typeof id === 'number') ids.push(id);
      else if (typeof id === 'string' && !isNaN(Number(id))) ids.push(Number(id));
    }
    if (ids.length > 0) return ids;

    // Maybe it's hierarchy nodes with children
    return collectRuntimeIds(result);
  }

  // If it's an object with a data/items/objects array
  if (typeof result === 'object' && result !== null) {
    const obj = result as Record<string, unknown>;
    for (const key of ['data', 'items', 'objects', 'entities', 'objectRuntimeIds']) {
      if (Array.isArray(obj[key])) {
        const sub = extractRuntimeIdsFromResult(obj[key]);
        if (sub.length > 0) return sub;
      }
    }
  }

  return [];
}

export async function getModelTree(api: TrimbleAPI | null): Promise<ModelTreeNode[]> {
  if (!api) return mockModelTree;

  try {
    const models = await getLoadedModels(api);
    if (models.length === 0) return [];

    const rootChildren: ModelTreeNode[] = [];

    for (const model of models) {
      // Get all runtimeIds and their properties to build a flat tree
      const allIds = await getAllModelRuntimeIds(api, model.id);
      console.log('[ViewerBridge] getModelTree: got', allIds.length, 'runtimeIds for', model.name);

      const children: ModelTreeNode[] = [];

      if (allIds.length > 0) {
        // Fetch properties in batches to build tree nodes
        const batchSize = 50;
        for (let i = 0; i < allIds.length; i += batchSize) {
          const batch = allIds.slice(i, i + batchSize);
          try {
            const rawArray = await api.viewer.getObjectProperties(model.id, batch);
            const propsArray = (Array.isArray(rawArray) ? rawArray : [rawArray]) as Array<Record<string, unknown>>;

            for (const obj of propsArray) {
              if (!obj) continue;
              const rid = obj.runtimeId ?? obj.id;
              const product = obj.product as Record<string, unknown> | undefined;
              const name = String(product?.name ?? obj.name ?? `Objet ${rid}`);
              const rawClass = String(obj.class ?? obj.type ?? '');
              const ifcClass = normalizeIfcClass(rawClass);

              // Determine type for tree display
              const classUpper = ifcClass.toUpperCase();
              let nodeType: ModelTreeNode['type'] = 'element';
              if (classUpper.includes('STOREY') || classUpper.includes('BUILDING')) nodeType = 'level';
              else if (classUpper.includes('SPACE') || classUpper.includes('ROOM')) nodeType = 'room';

              children.push({
                id: `${model.id}-${rid}`,
                name,
                type: nodeType,
                ifcClass: formatIfcClass(ifcClass),
                visible: true,
              });
            }
          } catch (e) {
            console.warn('[ViewerBridge] getModelTree batch props failed:', e);
          }
        }
      }

      rootChildren.push({
        id: model.id,
        name: model.name,
        type: 'model',
        visible: true,
        objectCount: children.length,
        children,
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
    console.error('[ViewerBridge] getModelTree failed:', err);
    return mockModelTree;
  }
}

// ── Object Properties (for IDS validation + stats + filters) ──

export async function getAllIFCObjects(api: TrimbleAPI | null): Promise<IFCObject[]> {
  if (!api) return MOCK_IFC_OBJECTS;

  try {
    let models = await getLoadedModels(api);
    console.log('[ViewerBridge] getAllIFCObjects: models count =', models.length);
    // Retry once after 2s if no models loaded yet
    if (models.length === 0) {
      await new Promise(r => setTimeout(r, 2000));
      models = await getLoadedModels(api);
      console.log('[ViewerBridge] getAllIFCObjects retry: models count =', models.length);
    }
    if (models.length === 0) return [];

    const allObjects: IFCObject[] = [];

    for (const model of models) {
      const allRuntimeIds = await getAllModelRuntimeIds(api, model.id);
      console.log('[ViewerBridge] getAllIFCObjects: got', allRuntimeIds.length, 'runtimeIds for', model.name);

      if (allRuntimeIds.length === 0) {
        console.warn('[ViewerBridge] No runtimeIds for', model.name, '- skipping');
        continue;
      }

      const batchSize = 50;
      for (let i = 0; i < allRuntimeIds.length; i += batchSize) {
        const batch = allRuntimeIds.slice(i, i + batchSize);
        try {
          const rawArray = await api.viewer.getObjectProperties(model.id, batch);
          const propsArray = (Array.isArray(rawArray) ? rawArray : [rawArray]) as Array<Record<string, unknown>>;

          if (i === 0) console.log('[ViewerBridge] sample object:', safeStringify(propsArray[0], 800));

          for (const obj of propsArray) {
            const ifcObj = viewerPropsToIFCObject(obj, model.id);
            if (ifcObj) allObjects.push(ifcObj);
          }
        } catch (e) {
          console.error('[ViewerBridge] getObjectProperties batch failed:', e);
        }
      }
    }

    console.log('[ViewerBridge] getAllIFCObjects: parsed', allObjects.length, 'IFC objects');
    return allObjects;
  } catch (err) {
    console.error('[ViewerBridge] getAllIFCObjects failed:', err);
    return [];
  }
}

function collectRuntimeIds(nodes: unknown[]): number[] {
  const ids: number[] = [];
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    const node = n as Record<string, unknown>;
    // Handle both runtimeId and id fields
    const rid = node.runtimeId ?? node.id;
    if (rid != null && typeof rid === 'number') ids.push(rid);
    if (Array.isArray(node.children)) {
      ids.push(...collectRuntimeIds(node.children));
    }
  }
  return ids;
}

function viewerPropsToIFCObject(
  obj: Record<string, unknown>,
  modelId: string,
): IFCObject | null {
  if (!obj) return null;

  // TC API: IFC class is in obj.class (e.g. "IFCFLOWTERMINAL")
  const rawClass = String(obj.class ?? obj.type ?? obj.ifcType ?? obj.Type ?? '');
  const ifcClass = normalizeIfcClass(rawClass);
  if (!ifcClass || ifcClass === 'IFC') return null;

  const properties: Record<string, Record<string, string>> = {};
  const materials: string[] = [];
  const classifications: { system: string; value: string }[] = [];
  const attributes: Record<string, string> = {};

  // TC API: name is in obj.product.name
  const product = obj.product as Record<string, unknown> | undefined;
  const rawName = String(product?.name ?? obj.name ?? obj.Name ?? '');
  if (rawName) attributes['Name'] = rawName;

  // Parse standard property sets from obj.properties
  const psets = parsePsets(obj.properties ?? obj.propertySets ?? []);

  // Also extract product block as virtual psets
  const productPsets = extractProductPsets(obj);
  for (const [k, v] of Object.entries(productPsets)) {
    if (!psets[k]) psets[k] = v;
  }

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

  return {
    id: `${modelId}-${obj.id ?? obj.runtimeId ?? ''}`,
    name: rawName || `Object ${obj.id ?? ''}`,
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
    console.log('[ViewerBridge] detectModelFilters: got', objects.length, 'objects');
    if (objects.length === 0) {
      return { ifcClasses: [], materials: [], levels: [], propertySets: [] };
    }

    const classCount: Record<string, number> = {};
    const matCount: Record<string, number> = {};
    const levelCount: Record<string, number> = {};
    const psetCount: Record<string, number> = {};

    for (const obj of objects) {
      const displayClass = formatIfcClass(obj.ifcClass);
      classCount[displayClass] = (classCount[displayClass] || 0) + 1;

      for (const mat of obj.materials) {
        matCount[mat] = (matCount[mat] || 0) + 1;
      }

      // Detect levels from IfcBuildingStorey objects
      if (obj.ifcClass.toUpperCase().includes('STOREY')) {
        levelCount[obj.name] = 0;
      }

      // Also detect levels from "storey" or "level" or "étage" property values
      for (const propMap of Object.values(obj.properties)) {
        for (const [k, v] of Object.entries(propMap)) {
          const kl = k.toLowerCase();
          if ((kl.includes('storey') || kl.includes('level') || kl.includes('étage')) && v) {
            levelCount[v] = (levelCount[v] || 0) + 1;
          }
        }
      }

      for (const psetName of Object.keys(obj.properties)) {
        psetCount[psetName] = (psetCount[psetName] || 0) + 1;
      }
    }

    const toSorted = (rec: Record<string, number>) =>
      Object.entries(rec).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

    const result = {
      ifcClasses: toSorted(classCount),
      materials: toSorted(matCount),
      levels: toSorted(levelCount),
      propertySets: toSorted(psetCount),
    };
    console.log('[ViewerBridge] detectModelFilters result:', result.ifcClasses.length, 'classes,', result.materials.length, 'mats,', result.levels.length, 'levels,', result.propertySets.length, 'psets');
    return result;
  } catch (err) {
    console.error('[ViewerBridge] detectModelFilters failed:', err);
    return { ifcClasses: [], materials: [], levels: [], propertySets: [] };
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
      console.log('[ViewerBridge] raw properties:', safeStringify(raw));

      const propsArray = (Array.isArray(raw) ? raw : [raw]) as Array<Record<string, unknown>>;

      for (const obj of propsArray) {
        if (!obj) continue;

        // 1. Parse standard property sets from obj.properties
        const props = parsePsets(obj.properties ?? obj.propertySets ?? []);

        // 2. Extract product block → "Reference Object" + "Product" virtual psets
        const productPsets = extractProductPsets(obj);
        for (const [k, v] of Object.entries(productPsets)) {
          props[k] = v;
        }

        // 3. Extract layers → "Presentation Layers" virtual pset
        const layerMap = extractLayers(obj);
        if (layerMap) props['Presentation Layers'] = layerMap;

        // 4. Extract name and type
        const product = obj.product as Record<string, unknown> | undefined;
        const name = String(product?.name ?? obj.name ?? obj.Name ?? 'Object');
        const ifcClass = String(obj.class ?? obj.type ?? obj.ifcType ?? 'Unknown');
        const type = formatIfcClass(normalizeIfcClass(ifcClass));

        results.push({ name, type, properties: props });
      }
    }
    console.log('[ViewerBridge] parsed results:', results.length, 'objects');
    return results;
  } catch (err) {
    console.error('[ViewerBridge] getSelectedObjectProperties failed:', err);
    return [];
  }
}

// ── Statistics from real model ──

export async function computeModelStatistics(api: TrimbleAPI | null) {
  if (!api) return mockStatistics;

  try {
    const objects = await getAllIFCObjects(api);
    if (objects.length === 0) {
      return {
        totalElements: 0, totalLevels: 0, totalTypes: 0,
        ifcClassDistribution: [], levelDistribution: [], materialDistribution: [],
        propertyStats: [],
      };
    }

    const classCount: Record<string, number> = {};
    const materialCount: Record<string, number> = {};
    const levelObjectCount: Record<string, number> = {};
    const levelNames: string[] = [];
    const types = new Set<string>();
    let totalArea = 0;
    let totalVolume = 0;

    for (const obj of objects) {
      const displayClass = formatIfcClass(obj.ifcClass);
      classCount[displayClass] = (classCount[displayClass] || 0) + 1;
      types.add(obj.ifcClass);

      for (const mat of obj.materials) {
        materialCount[mat] = (materialCount[mat] || 0) + 1;
      }

      if (obj.ifcClass === 'IFCBUILDINGSTOREY') {
        levelNames.push(obj.name);
      }

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

    // If no IfcBuildingStorey found, don't fake levels
    if (levelNames.length > 0) {
      // Distribute non-storey objects proportionally across levels
      const nonStoreyCount = objects.length - levelNames.length;
      if (nonStoreyCount > 0) {
        const perLevel = Math.ceil(nonStoreyCount / levelNames.length);
        for (const lv of levelNames) {
          levelObjectCount[lv] = (levelObjectCount[lv] || 0) + perLevel;
        }
      }
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

    console.log('[ViewerBridge] stats computed: area=', totalArea, 'volume=', totalVolume, 'materials=', Object.keys(materialCount).length);

    const propertyStats = [
      { name: 'Surface totale', value: `${totalArea > 0 ? Math.round(totalArea) : '—'} m²`, icon: 'area' },
      { name: 'Volume total', value: `${totalVolume > 0 ? Math.round(totalVolume) : '—'} m³`, icon: 'volume' },
    ];

    return {
      totalElements: objects.length,
      totalLevels: levelNames.length,
      totalTypes: types.size,
      ifcClassDistribution,
      levelDistribution,
      materialDistribution,
      propertyStats,
    };
  } catch (err) {
    console.error('[ViewerBridge] computeModelStatistics failed:', err);
    return {
      totalElements: 0, totalLevels: 0, totalTypes: 0,
      ifcClassDistribution: [], levelDistribution: [], materialDistribution: [],
      propertyStats: [],
    };
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
    console.error('[ViewerBridge] setObjectVisibility failed:', err);
  }
}

export async function toggleModelVisibility(
  api: TrimbleAPI | null,
  modelId: string,
  visible: boolean,
): Promise<void> {
  if (!api) return;
  console.log('[ViewerBridge] toggleModelVisibility', modelId, 'visible=', visible);

  const viewer = api.viewer as Record<string, unknown>;

  // Strategy 1: toggleModel (available in TC viewer API)
  if (typeof viewer.toggleModel === 'function') {
    try {
      // toggleModel might just toggle (no visible param), or accept (modelId, show)
      if (!visible) {
        // Hide: call toggleModel to unload/hide
        await (viewer.toggleModel as Function)(modelId);
        console.log('[ViewerBridge] toggleModel (hide) succeeded');
        return;
      } else {
        // Show: call toggleModel to reload/show
        await (viewer.toggleModel as Function)(modelId);
        console.log('[ViewerBridge] toggleModel (show) succeeded');
        return;
      }
    } catch (e) {
      console.warn('[ViewerBridge] toggleModel failed:', e);
    }
  }

  // Strategy 2: try setObjectState with all objects from getObjects
  try {
    const allIds = await getAllModelRuntimeIds(api, modelId);
    if (allIds.length > 0) {
      await api.viewer.setObjectState(
        { modelObjectIds: [{ modelId, objectRuntimeIds: allIds }] },
        { visible },
      );
      console.log('[ViewerBridge] setObjectState on', allIds.length, 'objects succeeded');
      return;
    }
  } catch (e) {
    console.warn('[ViewerBridge] setObjectState with all objects failed:', e);
  }

  // Strategy 3: removeModel / placeModel
  if (!visible && typeof viewer.removeModel === 'function') {
    try {
      await (viewer.removeModel as Function)(modelId);
      console.log('[ViewerBridge] removeModel succeeded');
      return;
    } catch (e) {
      console.warn('[ViewerBridge] removeModel failed:', e);
    }
  }

  console.error('[ViewerBridge] toggleModelVisibility: no method worked');
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
    console.error('[ViewerBridge] selectObjectsInViewer failed:', err);
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
    console.error('[ViewerBridge] colorObjectsInViewer failed:', err);
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
    console.error('[ViewerBridge] resetObjectColorInViewer failed:', err);
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
    console.error('[ViewerBridge] isolateObjectsInViewer failed:', err);
  }
}
