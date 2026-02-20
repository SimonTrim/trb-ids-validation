/**
 * Bridge between the Trimble Viewer API and our app's data structures.
 * When api is null (dev mode), returns mock data.
 * When api is available (embedded in TC), uses real viewer data.
 */
import type { TrimbleAPI } from '@/hooks/useTrimbleConnect';
import type { ModelTreeNode, IFCObject, ViewerSelection } from '@/types';
import { mockModelTree, mockStatistics } from '@/data/mockData';
import { MOCK_IFC_OBJECTS } from '@/services/idsValidator';

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
        ifcClass: n.ifcType,
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
    if (models.length === 0) return MOCK_IFC_OBJECTS;

    const allObjects: IFCObject[] = [];

    for (const model of models) {
      const hierarchy = await api.viewer.getHierarchyChildren(model.id, [], 'spatial', true) as Array<{
        runtimeId: number;
        children?: unknown[];
      }>;

      const allRuntimeIds = collectRuntimeIds(hierarchy);

      // Batch in groups of 50 to avoid overloading
      const batchSize = 50;
      for (let i = 0; i < allRuntimeIds.length; i += batchSize) {
        const batch = allRuntimeIds.slice(i, i + batchSize);
        const propsArray = await api.viewer.getObjectProperties(model.id, batch) as Array<{
          runtimeId: number;
          name?: string;
          type?: string;
          properties?: Array<{
            name: string;
            properties?: Array<{ name: string; value: string }>;
          }>;
        }>;

        for (const obj of propsArray) {
          const ifcObj = viewerPropsToIFCObject(obj, model.id);
          if (ifcObj) allObjects.push(ifcObj);
        }
      }
    }

    return allObjects.length > 0 ? allObjects : MOCK_IFC_OBJECTS;
  } catch (err) {
    console.error('getAllIFCObjects failed:', err);
    return MOCK_IFC_OBJECTS;
  }
}

function collectRuntimeIds(nodes: Array<{ runtimeId: number; children?: unknown[] }>): number[] {
  const ids: number[] = [];
  for (const n of nodes) {
    ids.push(n.runtimeId);
    if (n.children) {
      ids.push(...collectRuntimeIds(n.children as typeof nodes));
    }
  }
  return ids;
}

function viewerPropsToIFCObject(
  obj: { runtimeId: number; name?: string; type?: string; properties?: Array<{ name: string; properties?: Array<{ name: string; value: string }> }> },
  modelId: string,
): IFCObject | null {
  const ifcClass = (obj.type ?? '').toUpperCase();
  if (!ifcClass.startsWith('IFC')) return null;

  const properties: Record<string, Record<string, string>> = {};
  const materials: string[] = [];
  const classifications: { system: string; value: string }[] = [];
  const attributes: Record<string, string> = {};

  if (obj.name) attributes['Name'] = obj.name;

  for (const pset of obj.properties ?? []) {
    if (!pset.name || !pset.properties) continue;

    if (pset.name.toLowerCase().includes('material')) {
      for (const p of pset.properties) {
        if (p.value) materials.push(p.value);
      }
      continue;
    }

    if (pset.name.toLowerCase().includes('classification')) {
      let system = '';
      let value = '';
      for (const p of pset.properties) {
        if (p.name.toLowerCase().includes('system') || p.name.toLowerCase() === 'name') system = p.value;
        if (p.name.toLowerCase().includes('reference') || p.name.toLowerCase() === 'itemreference') value = p.value;
      }
      if (system || value) classifications.push({ system, value });
      continue;
    }

    const propMap: Record<string, string> = {};
    for (const p of pset.properties) {
      propMap[p.name] = p.value;
    }
    properties[pset.name] = propMap;
  }

  return {
    id: `${modelId}-${obj.runtimeId}`,
    name: obj.name ?? `Object ${obj.runtimeId}`,
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
      const displayClass = obj.ifcClass.charAt(0).toUpperCase() +
        obj.ifcClass.slice(1).toLowerCase().replace(/^ifc/, 'Ifc');
      classCount[displayClass] = (classCount[displayClass] || 0) + 1;

      for (const mat of obj.materials) {
        matCount[mat] = (matCount[mat] || 0) + 1;
      }

      if (obj.ifcClass === 'IFCBUILDINGSTOREY') {
        levelCount[obj.name] = levelCount[obj.name] || 0;
      }

      for (const psetName of Object.keys(obj.properties)) {
        psetCount[psetName] = (psetCount[psetName] || 0) + 1;
      }
    }

    // Count objects per level by scanning tree structure
    // (levels contain children objects)
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
      const propsArray = await api.viewer.getObjectProperties(sel.modelId, sel.objectRuntimeIds) as Array<{
        runtimeId: number;
        name?: string;
        type?: string;
        properties?: Array<{ name: string; properties?: Array<{ name: string; value: string }> }>;
      }>;

      for (const obj of propsArray) {
        const props: Record<string, Record<string, string>> = {};
        for (const pset of obj.properties ?? []) {
          if (pset.properties) {
            const map: Record<string, string> = {};
            for (const p of pset.properties) map[p.name] = p.value;
            props[pset.name] = map;
          }
        }
        results.push({
          name: obj.name ?? `Object ${obj.runtimeId}`,
          type: obj.type ?? 'Unknown',
          properties: props,
        });
      }
    }
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
    const levelNames = new Set<string>();
    const types = new Set<string>();

    for (const obj of objects) {
      classCount[obj.ifcClass] = (classCount[obj.ifcClass] || 0) + 1;
      types.add(obj.ifcClass);

      for (const mat of obj.materials) {
        materialCount[mat] = (materialCount[mat] || 0) + 1;
      }

      if (obj.ifcClass === 'IFCBUILDINGSTOREY') {
        levelNames.add(obj.name);
      }
    }

    const COLORS = ['#0063a3', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#ec4899'];
    const MAT_COLORS = ['#6B7280', '#3B82F6', '#D97706', '#06B6D4', '#F9FAFB', '#9CA3AF', '#EF4444', '#10B981'];

    const ifcClassDistribution = Object.entries(classCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], i) => ({ name, count, color: COLORS[i % COLORS.length] }));

    const materialDistribution = Object.entries(materialCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], i) => ({ name, count, color: MAT_COLORS[i % MAT_COLORS.length] }));

    return {
      totalElements: objects.length,
      totalLevels: levelNames.size || mockStatistics.totalLevels,
      totalTypes: types.size,
      ifcClassDistribution,
      levelDistribution: mockStatistics.levelDistribution,
      materialDistribution,
      propertyStats: mockStatistics.propertyStats,
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
