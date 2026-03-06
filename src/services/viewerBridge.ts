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
  const methods = Object.keys(viewer).filter(k => typeof viewer[k] === 'function');
  console.log('[ViewerBridge] getAllModelRuntimeIds for', modelId);

  // Strategy 1: getObjects → format: [{modelId, objects:[{id:0},{id:1},...]}]
  try {
    const objResult = await (viewer.getObjects as Function)(modelId);

    if (objResult) {
      let runtimeIds: number[] = [];

      // Format: [{modelId, objects: [{id: N}, ...]}]
      if (Array.isArray(objResult) && objResult.length > 0 && objResult[0]?.objects) {
        const objectsArr = objResult[0].objects as Array<Record<string, unknown>>;
        if (objectsArr.length > 0) {
          console.log('[ViewerBridge] getObjects sample object:', JSON.stringify(objectsArr[0]));
        }
        runtimeIds = objectsArr.map(o => o.id as number).filter(id => typeof id === 'number');
        console.log('[ViewerBridge] getObjects: extracted', runtimeIds.length, 'runtimeIds from objects array');
      }
      // Format: flat array of numbers
      else if (Array.isArray(objResult) && objResult.length > 0 && typeof objResult[0] === 'number') {
        runtimeIds = objResult;
      }

      if (runtimeIds.length > 0) {
        console.log('[ViewerBridge] getObjects strategy yielded', runtimeIds.length, 'runtimeIds');
        return runtimeIds;
      }
    }
  } catch (e) {
    console.warn('[ViewerBridge] getObjects strategy failed:', e);
  }

  // Strategy 2: getEntities
  try {
    const entResult = await (viewer.getEntities as Function)(modelId);
    console.log('[ViewerBridge] getEntities raw:', typeof entResult, safeStringify(entResult, 300));
    if (Array.isArray(entResult) && entResult.length > 0) {
      const ids: number[] = [];
      let loggedSample = false;
      for (const item of entResult) {
        if (typeof item === 'number') {
          ids.push(item);
        } else if (typeof item === 'object' && item) {
          const o = item as Record<string, unknown>;
          if (!loggedSample) {
            console.log('[ViewerBridge] getEntities sample item:', JSON.stringify(o));
            loggedSample = true;
          }
          const rid = o.runtimeId ?? o.id;
          if (typeof rid === 'number') ids.push(rid);
        }
      }
      if (ids.length > 0) {
        console.log('[ViewerBridge] getEntities yielded', ids.length, 'runtimeIds');
        return ids;
      }
    }
  } catch (e) {
    console.warn('[ViewerBridge] getEntities failed:', e);
  }

  // Strategy 3: Brute-force probe — try batches of IDs to discover valid ones
  console.log('[ViewerBridge] trying brute-force runtimeId discovery...');
  try {
    const validIds: number[] = [];
    const probeMax = 1000;
    const probeBatch = 100;

    for (let start = 0; start < probeMax; start += probeBatch) {
      const batch = Array.from({ length: probeBatch }, (_, i) => start + i);
      try {
        const rawArray = await api.viewer.getObjectProperties(modelId, batch);
        if (Array.isArray(rawArray)) {
          for (const obj of rawArray) {
            if (obj && typeof obj === 'object') {
              const o = obj as Record<string, unknown>;
              const rid = o.id ?? o.runtimeId;
              if (typeof rid === 'number') validIds.push(rid);
            }
          }
        }
      } catch { /* batch failed, continue */ }
    }

    if (validIds.length > 0) {
      console.log('[ViewerBridge] brute-force found', validIds.length, 'valid runtimeIds');
      return validIds;
    }
  } catch (e) {
    console.warn('[ViewerBridge] brute-force probe failed:', e);
  }

  // Strategy 4: getHierarchyChildren with different types
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

interface ParsedObject {
  runtimeId: number;
  name: string;
  description?: string;
  ifcClass: string;
  classUpper: string;
  level?: string;
  layer?: string;
  elevation?: number;
}

async function fetchAllObjectData(
  api: TrimbleAPI,
  modelId: string,
  allIds: number[],
): Promise<ParsedObject[]> {
  const objects: ParsedObject[] = [];
  const batchSize = 50;

  // Get layer assignments via getLayers(modelId) API
  const layerMap = new Map<number, string>();
  try {
    const viewer = api.viewer as Record<string, unknown>;
    if (typeof viewer.getLayers === 'function') {
      const modelLayers = await (viewer.getLayers as Function)(modelId);
      console.log('[ViewerBridge] getLayers result:', safeStringify(modelLayers, 1000));
      if (Array.isArray(modelLayers)) {
        for (const ml of modelLayers) {
          if (!ml || typeof ml !== 'object') continue;
          // Try multiple response formats
          const layerName = ml.name ?? ml.layerName ?? '';
          const objectIds = ml.objectRuntimeIds ?? ml.objects ?? ml.ids ?? ml.entityIds ?? [];

          if (layerName && Array.isArray(objectIds)) {
            for (const oid of objectIds) {
              const id = typeof oid === 'number' ? oid : (typeof oid === 'object' && oid?.id != null ? Number(oid.id) : NaN);
              if (!isNaN(id)) layerMap.set(id, String(layerName));
            }
          }

          // Also handle nested format: {modelId, layers: [{name, ...}]}
          if (ml.layers && Array.isArray(ml.layers)) {
            for (const layer of ml.layers) {
              const ln = layer?.name ?? '';
              const ids = layer?.objectRuntimeIds ?? layer?.entityIds ?? layer?.ids ?? [];
              if (ln && Array.isArray(ids)) {
                for (const oid of ids) {
                  const id = typeof oid === 'number' ? oid : Number(oid);
                  if (!isNaN(id)) layerMap.set(id, String(ln));
                }
              }
            }
          }
        }
      }
      console.log('[ViewerBridge] getLayers mapped', layerMap.size, 'objects to layers');
    }
  } catch (e) {
    console.warn('[ViewerBridge] getLayers failed:', e);
  }

  for (let i = 0; i < allIds.length; i += batchSize) {
    const batch = allIds.slice(i, i + batchSize);
    try {
      const rawArray = await api.viewer.getObjectProperties(modelId, batch);
      const propsArray = (Array.isArray(rawArray) ? rawArray : [rawArray]) as Array<Record<string, unknown>>;

      for (let oi = 0; oi < propsArray.length; oi++) {
        const obj = propsArray[oi];
        if (!obj) continue;
        const rid = (obj.runtimeId ?? obj.id) as number;
        if (typeof rid !== 'number') continue;
        const product = obj.product as Record<string, unknown> | undefined;
        const name = String(product?.name ?? obj.name ?? `Objet ${rid}`);
        const description = product?.description ? String(product.description) : undefined;
        const rawClass = String(obj.class ?? obj.type ?? '');
        const ifcClass = normalizeIfcClass(rawClass);
        const classUpper = ifcClass.toUpperCase();

        // Use parsePsets for robust property extraction
        const allPsets = parsePsets(obj.properties ?? obj.propertySets ?? []);
        const productPsets = extractProductPsets(obj);
        for (const [k, v] of Object.entries(productPsets)) {
          if (!allPsets[k]) allPsets[k] = v;
        }

        // Log first object: raw pset names + raw properties keys
        if (i === 0 && oi === 0) {
          const rawProps = obj.properties as unknown[] | undefined;
          const rawPsetNames = rawProps?.map((p: unknown) => (p as Record<string, unknown>)?.name) ?? [];
          console.log('[ViewerBridge] RAW pset names from API:', rawPsetNames);
          console.log('[ViewerBridge] parsed pset names:', Object.keys(allPsets));
          console.log('[ViewerBridge] obj top-level keys:', Object.keys(obj));
        }

        let level: string | undefined;
        let elevation: number | undefined;
        let layer: string | undefined;

        // First: check getLayers map
        if (layerMap.has(rid)) {
          layer = layerMap.get(rid);
        }

        for (const [psetName, propMap] of Object.entries(allPsets)) {
          const psetLower = psetName.toLowerCase();

          for (const [propKey, propVal] of Object.entries(propMap)) {
            const keyLower = propKey.toLowerCase();

            if (keyLower === 'storey' || keyLower === 'level' || keyLower === 'étage') {
              level = propVal;
            }
            if (keyLower === 'elevation') {
              const num = parseFloat(propVal);
              if (!isNaN(num)) elevation = num;
            }
            // Extract layer from psets: any pset containing "layer" with key "layer" or "name"
            if (!layer && psetLower.includes('layer')) {
              if ((keyLower === 'layer' || keyLower === 'name') && propVal) {
                layer = propVal;
              }
            }
          }
        }

        // Fallback elevation for storeys
        if (classUpper.includes('STOREY') && elevation === undefined) {
          const cgz = allPsets['CalculatedGeometryValues']?.['CenterOfGravityZ'];
          if (cgz) {
            const num = parseFloat(cgz);
            if (!isNaN(num)) elevation = num;
          }
        }

        // Fallback layer from obj.layers array
        if (!layer) {
          const layersArr = obj.layers as Array<{ name?: string }> | undefined;
          if (layersArr && Array.isArray(layersArr) && layersArr.length > 0) {
            layer = String(layersArr[0].name ?? '');
          }
        }

        objects.push({ runtimeId: rid, name, description, ifcClass: formatIfcClass(ifcClass), classUpper, level, layer, elevation });
      }
    } catch { /* batch failed, continue */ }
  }

  const withLayer = objects.filter(o => !!o.layer).length;
  console.log('[ViewerBridge] fetchAllObjectData: total=', objects.length, 'withLayer=', withLayer);

  return objects;
}

/**
 * Discover layer→object mapping using multiple strategies:
 * 1. Try single-object getObjectProperties to check for "Presentation Layers" pset
 * 2. If not found, use setLayersVisibility + getObjects to discover hidden objects per layer
 */
async function discoverLayerMapping(
  api: TrimbleAPI,
  modelId: string,
  objects: ParsedObject[],
): Promise<void> {
  const viewer = api.viewer as Record<string, unknown>;
  const viewerKeys = Object.keys(viewer).filter(k => typeof viewer[k] === 'function');
  console.log('[ViewerBridge] Available viewer methods:', viewerKeys.sort().join(', '));

  // Build lookup
  const runtimeToIndex = new Map<number, number>();
  objects.forEach((o, i) => runtimeToIndex.set(o.runtimeId, i));

  // --- Strategy 1: single-object getObjectProperties ---
  if (objects.length > 0) {
    try {
      const testId = objects[0].runtimeId;
      const singleResult = await api.viewer.getObjectProperties(modelId, [testId]);
      const testArr = Array.isArray(singleResult) ? singleResult : [singleResult];
      if (testArr[0]) {
        const rawProps = (testArr[0] as Record<string, unknown>).properties as unknown[];
        const psetNames = rawProps?.map((p: unknown) => (p as Record<string, unknown>)?.name) ?? [];
        console.log('[ViewerBridge] discoverLayerMapping: single-object pset names:', JSON.stringify(psetNames));

        const layerPset = rawProps?.find((p: unknown) => {
          const name = String((p as Record<string, unknown>)?.name ?? '').toLowerCase();
          return name.includes('layer') || name.includes('calque');
        });
        if (layerPset) {
          console.log('[ViewerBridge] discoverLayerMapping: found layer pset in single fetch, using small batches');
          // Re-fetch in batch-of-1 to get layer for each object
          for (let i = 0; i < objects.length; i++) {
            try {
              const res = await api.viewer.getObjectProperties(modelId, [objects[i].runtimeId]);
              const arr = Array.isArray(res) ? res : [res];
              const props = (arr[0] as Record<string, unknown>)?.properties as unknown[] | undefined;
              if (props) {
                const lp = props.find((p: unknown) => {
                  const n = String((p as Record<string, unknown>)?.name ?? '').toLowerCase();
                  return n.includes('layer') || n.includes('calque');
                }) as Record<string, unknown> | undefined;
                if (lp) {
                  const subProps = lp.properties as unknown[] | undefined;
                  if (Array.isArray(subProps)) {
                    for (const sp of subProps) {
                      const k = String((sp as Record<string, unknown>)?.name ?? '').toLowerCase();
                      const v = String((sp as Record<string, unknown>)?.value ?? '');
                      if ((k === 'layer' || k === 'name') && v) {
                        objects[i].layer = v;
                        break;
                      }
                    }
                  }
                }
              }
            } catch { /* skip individual failures */ }
          }
          const count = objects.filter(o => !!o.layer).length;
          console.log('[ViewerBridge] discoverLayerMapping (strategy 1): mapped', count, '/', objects.length);
          if (count > 0) return;
        }
      }
    } catch (e) {
      console.warn('[ViewerBridge] discoverLayerMapping strategy 1 failed:', e);
    }
  }

  // --- Strategy 2: setLayersVisibility + getObjects ---
  if (typeof viewer.getLayers !== 'function' || typeof viewer.setLayersVisibility !== 'function') return;

  try {
    const layersResult = await (viewer.getLayers as Function)(modelId);
    if (!Array.isArray(layersResult) || layersResult.length === 0) return;
    const layerNames = layersResult.map((l: Record<string, unknown>) => String(l.name ?? '')).filter(Boolean);
    console.log('[ViewerBridge] discoverLayerMapping (strategy 2): layers:', layerNames);
    if (layerNames.length === 0) return;

    // Experiment: Try to get layers using getHierarchyChildren
    try {
      const hierarchyLayer = await (viewer.getHierarchyChildren as Function)(modelId, [], 'layer', true);
      console.log('[ViewerBridge] hierarchy(layer):', JSON.stringify(hierarchyLayer)?.substring(0, 500));
    } catch (e) { /* ignore */ }
    try {
      const hierarchyLayers = await (viewer.getHierarchyChildren as Function)(modelId, [], 'layers', true);
      console.log('[ViewerBridge] hierarchy(layers):', JSON.stringify(hierarchyLayers)?.substring(0, 500));
    } catch (e) { /* ignore */ }
    try {
      const hierarchyClass = await (viewer.getHierarchyChildren as Function)(modelId, [], 'class', true);
      console.log('[ViewerBridge] hierarchy(class):', JSON.stringify(hierarchyClass)?.substring(0, 500));
    } catch (e) { /* ignore */ }
    try {
      const hierarchyNone = await (viewer.getHierarchyChildren as Function)(modelId, [], '', true);
      console.log('[ViewerBridge] hierarchy(none):', JSON.stringify(hierarchyNone)?.substring(0, 500));
    } catch (e) { /* ignore */ }

    // Wait for baseline visibility to settle
    await new Promise(r => setTimeout(r, 1000));
    
    // Ensure everything is visible before starting
    try {
      await (viewer.setObjectState as Function)({ modelObjectIds: [{ modelId }] }, { visible: 'reset' });
      await new Promise(r => setTimeout(r, 500));
    } catch(e) { /* ignore */ }
    
    // Log what getObjects returns BEFORE any hide
    let baselineCount = 0;
    try {
      const baselineResult = await (viewer.getObjects as Function)(
        { modelObjectIds: [{ modelId }] },
        { visible: true },
      );
      
      let baseObjs = [];
      if (Array.isArray(baselineResult)) {
        if (baselineResult[0]?.objects) {
          baseObjs = baselineResult[0].objects;
        } else if (typeof baselineResult[0] === 'number' || (baselineResult[0] && typeof baselineResult[0] === 'object' && 'id' in baselineResult[0])) {
          baseObjs = baselineResult;
        }
      }
      baselineCount = baseObjs.length;
      console.log('[ViewerBridge] baseline visible objects count:', baselineCount);
    } catch (e) {
      console.warn('[ViewerBridge] baseline getObjects failed:', e);
    }

    // Now test each layer
    for (const layerName of layerNames) {
      try {
        // Ensure objects are visible initially before we check visibility
        await (viewer.setObjectState as Function)({ modelObjectIds: [{ modelId }] }, { visible: 'reset' });
        await new Promise(r => setTimeout(r, 500));

        await (viewer.setLayersVisibility as Function)(modelId, [{ name: layerName, visible: false }]);
        
        // Wait longer for the viewer to update its internal state
        await new Promise(r => setTimeout(r, 600));

        // Let's get ALL runtime IDs, visible or not, to compare with visibility
        // Try getting invisible objects first (sometimes this works depending on API version)
        let hiddenObjs = [];
        try {
          const hiddenResult = await (viewer.getObjects as Function)(
            { modelObjectIds: [{ modelId }] },
            { visible: false },
          );
          if (Array.isArray(hiddenResult) && hiddenResult[0]?.objects) {
             hiddenObjs = hiddenResult[0].objects;
          } else if (Array.isArray(hiddenResult) && hiddenResult.length > 0 && (typeof hiddenResult[0] === 'number' || 'id' in hiddenResult[0])) {
             hiddenObjs = hiddenResult;
          }
        } catch (e) { /* ignore */ }

        // Get visible objects (those NOT in the layer)
        const visibleResult = await (viewer.getObjects as Function)(
          { modelObjectIds: [{ modelId }] },
          { visible: true },
        );

        const visibleStr = JSON.stringify(visibleResult);
        console.log(`[ViewerBridge] visible after hiding "${layerName}": length = ${visibleStr?.length}`);
        
        // Sometimes visibleResult is just an array of objects
        let visibleObjs = [];
        if (Array.isArray(visibleResult)) {
          if (visibleResult[0]?.objects) {
            visibleObjs = visibleResult[0].objects;
          } else if (typeof visibleResult[0] === 'number' || (visibleResult[0] && typeof visibleResult[0] === 'object' && 'id' in visibleResult[0])) {
            visibleObjs = visibleResult;
          }
        }
        
        console.log(`[ViewerBridge] visible count after hiding "${layerName}": ${visibleObjs.length} (diff = ${baselineCount - visibleObjs.length})`);

        // Compare visible with ALL objects to find the hidden ones
        const visibleIds = new Set<number>();
        for (const item of visibleObjs) {
          const rid = typeof item === 'number' ? item : (item?.id ?? item?.objectRuntimeId);
          if (typeof rid === 'number') visibleIds.add(rid);
        }

        const hiddenIds = new Set<number>();
        for (const item of hiddenObjs) {
          const rid = typeof item === 'number' ? item : (item?.id ?? item?.objectRuntimeId);
          if (typeof rid === 'number') hiddenIds.add(rid);
        }

        let foundCount = 0;
        for (const [rid, idx] of runtimeToIndex.entries()) {
          // If an object is explicitly hidden OR NOT in the visible set (but was in the baseline), it was hidden by this layer!
          if (hiddenIds.has(rid) || (!visibleIds.has(rid) && baselineCount > 0)) {
            // Un objet peut appartenir à plusieurs calques, on remplace ou on concatène
            if (!objects[idx].layer || objects[idx].layer === 'Sans calque') {
              objects[idx].layer = layerName;
            } else if (!objects[idx].layer.includes(layerName)) {
              objects[idx].layer += `, ${layerName}`;
            }
            foundCount++;
          }
        }
        
        console.log(`[ViewerBridge] layer "${layerName}": mapped ${foundCount} objects by exclusion`);
        
        await (viewer.setLayersVisibility as Function)(modelId, [{ name: layerName, visible: true }]);
        await new Promise(r => setTimeout(r, 200)); // wait for objects to become visible again before testing next layer
      } catch (e) {
        console.warn(`[ViewerBridge] layer discovery failed for "${layerName}":`, e);
        try { await (viewer.setLayersVisibility as Function)(modelId, [{ name: layerName, visible: true }]); } catch { /* ignore */ }
      }
    }

    const withLayer = objects.filter(o => !!o.layer).length;
    console.log('[ViewerBridge] discoverLayerMapping (strategy 2): mapped', withLayer, '/', objects.length);
  } catch (e) {
    console.error('[ViewerBridge] discoverLayerMapping failed:', e);
  }
}

export async function getModelTree(
  api: TrimbleAPI | null,
  groupMode: 'building' | 'ifc' | 'layers' = 'building',
): Promise<ModelTreeNode[]> {
  if (!api) return mockModelTree;

  try {
    const models = await getLoadedModels(api);
    if (models.length === 0) return [];

    const rootChildren: ModelTreeNode[] = [];

    for (const model of models) {
      const allIds = await getAllModelRuntimeIds(api, model.id);
      console.log('[ViewerBridge] getModelTree: got', allIds.length, 'runtimeIds for', model.name);

      if (allIds.length === 0) {
        rootChildren.push({ id: model.id, name: model.name, type: 'model', visible: true, children: [] });
        continue;
      }

      const objects = await fetchAllObjectData(api, model.id, allIds);
      const withLayer = objects.filter(o => !!o.layer).length;
      console.log('[ViewerBridge] getModelTree: fetched', objects.length, 'objects, groupMode=', groupMode, 'withLayer=', withLayer);

      // When in layers mode, discover layer mapping via setLayersVisibility API
      if (groupMode === 'layers') {
        if (withLayer === 0) {
          console.log('[ViewerBridge] no layers from properties, calling discoverLayerMapping...');
          await discoverLayerMapping(api, model.id, objects);
        } else {
          console.log('[ViewerBridge] layers already found from properties, skipping discovery');
        }
      }

      // Separate storeys from regular objects
      const storeys = objects.filter(o => o.classUpper.includes('STOREY'));
      const regularObjects = objects.filter(o =>
        !o.classUpper.includes('STOREY') && !o.classUpper.includes('SITE') &&
        o.classUpper !== 'IFCBUILDING' && o.classUpper !== 'IFCPROJECT'
      );

      // Sort storeys by elevation (ascending) for proper ordering
      storeys.sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));

      // Build display name for each storey (differentiate duplicates)
      const allSameName = storeys.length > 1 && storeys.every(s => s.name === storeys[0].name);
      const storeyDisplayNames = storeys.map((s, i) => {
        if (!allSameName) return s.name;
        // All have same name: differentiate using description, elevation, or index
        if (s.description && s.description !== s.name) return s.description;
        if (s.elevation !== undefined) return `${s.name} (${s.elevation >= 0 ? '+' : ''}${s.elevation.toFixed(1)} m)`;
        return `${s.name} ${i + 1}`;
      });
      console.log('[ViewerBridge] storeys:', storeys.map((s, i) => `${storeyDisplayNames[i]} (elev=${s.elevation})`));

      // Assign objects to storeys by their level property, then by elevation proximity
      const storeyBuckets = storeys.map(() => [] as ParsedObject[]);
      const unassigned: ParsedObject[] = [];

      for (const obj of regularObjects) {
        let assigned = false;

        // Try matching by level property to storey name/description
        if (obj.level) {
          const lvl = obj.level.toLowerCase();
          for (let si = 0; si < storeys.length; si++) {
            const sName = storeys[si].name.toLowerCase();
            const sDesc = (storeys[si].description ?? '').toLowerCase();
            if (lvl === sName || lvl === sDesc || sName.includes(lvl) || lvl.includes(sName)) {
              storeyBuckets[si].push(obj);
              assigned = true;
              break;
            }
          }
        }

        // Try matching by elevation proximity
        if (!assigned && obj.elevation !== undefined && storeys.some(s => s.elevation !== undefined)) {
          let bestIdx = 0;
          let bestDist = Infinity;
          for (let si = 0; si < storeys.length; si++) {
            if (storeys[si].elevation === undefined) continue;
            const dist = Math.abs(obj.elevation - storeys[si].elevation!);
            if (dist < bestDist) { bestDist = dist; bestIdx = si; }
          }
          storeyBuckets[bestIdx].push(obj);
          assigned = true;
        }

        if (!assigned) unassigned.push(obj);
      }

      // Distribute remaining unassigned objects proportionally
      if (unassigned.length > 0 && storeys.length > 0) {
        const perStorey = Math.ceil(unassigned.length / storeys.length);
        for (let si = 0; si < storeys.length; si++) {
          const chunk = unassigned.slice(si * perStorey, (si + 1) * perStorey);
          storeyBuckets[si].push(...chunk);
        }
      }

      let modelChildren: ModelTreeNode[];

      if (groupMode === 'ifc') {
        // Group by IFC class
        const classBuckets = new Map<string, ParsedObject[]>();
        for (const obj of regularObjects) {
          const cls = obj.ifcClass || 'Autre';
          if (!classBuckets.has(cls)) classBuckets.set(cls, []);
          classBuckets.get(cls)!.push(obj);
        }
        modelChildren = Array.from(classBuckets.entries())
          .sort((a, b) => b[1].length - a[1].length)
          .map(([cls, objs]) => ({
            id: `${model.id}-class-${cls}`,
            name: cls,
            type: 'level' as const,
            ifcClass: cls,
            visible: true,
            objectCount: objs.length,
            children: objs.map(o => ({
              id: `${model.id}-${o.runtimeId}`,
              name: o.name,
              type: 'element' as const,
              ifcClass: o.ifcClass,
              visible: true,
            })),
          }));
      } else if (groupMode === 'layers') {
        // Group by layer (Presentation Layer)
        const layerBuckets = new Map<string, ParsedObject[]>();
        for (const obj of regularObjects) {
          const layerStr = obj.layer || 'Sans calque';
          // Split comma-separated layers, trim, and remove empty strings
          const layers = layerStr.split(',').map(l => l.trim()).filter(Boolean);
          if (layers.length === 0) layers.push('Sans calque');

          for (const lyr of layers) {
            if (!layerBuckets.has(lyr)) layerBuckets.set(lyr, []);
            layerBuckets.get(lyr)!.push(obj);
          }
        }
        modelChildren = Array.from(layerBuckets.entries())
          .sort((a, b) => b[1].length - a[1].length)
          .map(([lyr, objs]) => {
            const safeLyrId = lyr.replace(/[^a-zA-Z0-9_-]/g, '_');
            return {
              id: `${model.id}-layer-${safeLyrId}`,
              name: lyr,
              type: 'level' as const,
              visible: true,
              objectCount: objs.length,
              children: objs.map(o => ({
                id: `${model.id}-layer-${safeLyrId}-${o.runtimeId}`,
                name: o.name,
                type: 'element' as const,
                ifcClass: o.ifcClass,
                visible: true,
              })),
            };
          });
      } else {
        // Default: building mode (by IfcBuildingStorey)
        const storeyNodes: ModelTreeNode[] = storeys.map((s, si) => ({
          id: `${model.id}-${s.runtimeId}`,
          name: storeyDisplayNames[si],
          type: 'level' as const,
          ifcClass: s.ifcClass,
          visible: true,
          objectCount: storeyBuckets[si].length,
          children: storeyBuckets[si].map(o => ({
            id: `${model.id}-${o.runtimeId}`,
            name: o.name,
            type: 'element' as const,
            ifcClass: o.ifcClass,
            visible: true,
          })),
        }));

        modelChildren = storeyNodes.length > 0
          ? storeyNodes
          : regularObjects.map(o => ({
              id: `${model.id}-${o.runtimeId}`,
              name: o.name,
              type: 'element' as const,
              ifcClass: o.ifcClass,
              visible: true,
            }));
      }

      rootChildren.push({
        id: model.id,
        name: model.name,
        type: 'model',
        visible: true,
        objectCount: regularObjects.length,
        children: modelChildren,
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
  layerName?: string,
): Promise<void> {
  if (!api) return;

  // If this is a layer node and we have the layerName, use the native setLayersVisibility API
  if (layerName) {
    console.log('[ViewerBridge] setObjectVisibility using native layer API for:', layerName, 'visible=', visible);
    try {
      const viewer = api.viewer as Record<string, unknown>;
      if (typeof viewer.setLayersVisibility === 'function') {
        await (viewer.setLayersVisibility as Function)(modelId, [{ name: layerName, visible }]);
        console.log('[ViewerBridge] native layer visibility succeeded');
        return;
      }
    } catch (e) {
      console.warn('[ViewerBridge] native layer visibility failed, falling back to object state:', e);
    }
  }

  if (runtimeIds.length === 0) return;
  const selector = { modelObjectIds: [{ modelId, objectRuntimeIds: runtimeIds }] };
  console.log('[ViewerBridge] setObjectVisibility', modelId, runtimeIds.length, 'objects, visible=', visible);

  try {
    if (!visible) {
      await api.viewer.setObjectState(selector, { visible: false });
      console.log('[ViewerBridge] hide succeeded');
    } else {
      // TC API: use "reset" to restore default visibility (true doesn't undo false)
      await api.viewer.setObjectState(selector, { visible: 'reset' } as never);
      console.log('[ViewerBridge] show (visible:"reset") called');

      // TC viewer needs a rendering kick after restoring visibility.
      // Nudge the camera (set current position again) to force a re-render.
      const v = api.viewer as Record<string, unknown>;
      try {
        if (typeof v.getCamera === 'function' && typeof v.setCamera === 'function') {
          const cam = await (v.getCamera as Function)();
          if (cam) {
            await (v.setCamera as Function)(cam, { animationTime: 0 });
            console.log('[ViewerBridge] camera nudge applied');
          }
        }
      } catch { /* ignore */ }
    }
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
      const state = visible ? { visible: 'reset' as never } : { visible: false };
      await api.viewer.setObjectState(
        { modelObjectIds: [{ modelId, objectRuntimeIds: allIds }] },
        state,
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
      { color: 'reset' },
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
