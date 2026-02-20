import type {
  IDSFile, IDSSpecification, IDSRequirement, IDSFacet,
  IDSValidationResult, IDSValidationDetail,
  IDSValueConstraint, IFCObject,
} from '@/types';

// ── Mock IFC model data (will be replaced by Viewer API in production) ──

export const MOCK_IFC_OBJECTS: IFCObject[] = [
  // Buildings
  {
    id: 'obj-building-1', name: 'Bâtiment principal', ifcClass: 'IFCBUILDING',
    attributes: { Name: 'Bâtiment principal', LongName: 'Siège social BMS', GlobalId: '2O2Fr$t4X7Zf8NOew3FNr2' },
    properties: {}, materials: [], classifications: [],
  },
  // Levels
  {
    id: 'obj-lvl-0', name: 'Niveau 0', ifcClass: 'IFCBUILDINGSTOREY',
    attributes: { Name: 'Niveau 0', Elevation: '0.0' },
    properties: {}, materials: [], classifications: [],
  },
  {
    id: 'obj-lvl-1', name: 'Niveau 1', ifcClass: 'IFCBUILDINGSTOREY',
    attributes: { Name: 'Niveau 1', Elevation: '3.5' },
    properties: {}, materials: [], classifications: [],
  },
  {
    id: 'obj-lvl-2', name: 'Niveau 2', ifcClass: 'IFCBUILDINGSTOREY',
    attributes: { Name: 'Niveau 2', Elevation: '7.0' },
    properties: {}, materials: [], classifications: [],
  },
  // Walls
  {
    id: 'obj-wall-1', name: 'EXT-001-Béton', ifcClass: 'IFCWALL',
    attributes: { Name: 'EXT-001-Béton', GlobalId: '3vB2T0' },
    properties: {
      Pset_WallCommon: { IsExternal: 'TRUE', ThermalTransmittance: '0.28', LoadBearing: 'TRUE' },
    },
    materials: ['Béton armé C25/30'], classifications: [],
  },
  {
    id: 'obj-wall-2', name: 'EXT-002-Brique', ifcClass: 'IFCWALL',
    attributes: { Name: 'EXT-002-Brique', GlobalId: '1xC3Q1' },
    properties: {
      Pset_WallCommon: { IsExternal: 'TRUE', ThermalTransmittance: '0.32', LoadBearing: 'FALSE' },
    },
    materials: ['Brique creuse'], classifications: [],
  },
  {
    id: 'obj-wall-3', name: 'INT-Cloison-Plâtre', ifcClass: 'IFCWALL',
    attributes: { Name: 'INT-Cloison-Plâtre', GlobalId: '0aD4R2' },
    properties: {
      Pset_WallCommon: { IsExternal: 'FALSE', LoadBearing: 'FALSE' },
    },
    materials: ['Plâtre BA13'], classifications: [],
  },
  {
    id: 'obj-wall-4', name: 'MUR-Garage', ifcClass: 'IFCWALL',
    attributes: { Name: 'MUR-Garage', GlobalId: '5eF6T3' },
    properties: {
      Pset_WallCommon: { IsExternal: 'TRUE' },
    },
    materials: [], classifications: [],
  },
  // Beams
  {
    id: 'obj-beam-1', name: 'Poutre HEA 200', ifcClass: 'IFCBEAM',
    attributes: { Name: 'Poutre HEA 200', GlobalId: '6gH7U4' },
    properties: {},
    materials: ['Acier S355'], classifications: [{ system: 'Uniclass 2015', value: 'Ss_25_10_10' }],
  },
  {
    id: 'obj-beam-2', name: 'Poutre IPE 300', ifcClass: 'IFCBEAM',
    attributes: { Name: 'Poutre IPE 300', GlobalId: '7iJ8V5' },
    properties: {},
    materials: ['Acier S355'], classifications: [],
  },
  // Slabs
  {
    id: 'obj-slab-1', name: 'Dalle RDC', ifcClass: 'IFCSLAB',
    attributes: { Name: 'Dalle RDC', GlobalId: '8kL9W6' },
    properties: {
      Pset_SlabCommon: { ThermalResistance: '3.2' },
    },
    materials: ['Béton armé C30/37'], classifications: [{ system: 'Uniclass 2015', value: 'Ss_25_13_30' }],
  },
  {
    id: 'obj-slab-2', name: 'Dalle Étage', ifcClass: 'IFCSLAB',
    attributes: { Name: 'Dalle Étage', GlobalId: '9mN0X7' },
    properties: {},
    materials: ['Béton armé C25/30'], classifications: [{ system: 'Uniclass 2015', value: 'Ss_25_13_30' }],
  },
  // Columns
  {
    id: 'obj-col-1', name: 'Poteau béton P1', ifcClass: 'IFCCOLUMN',
    attributes: { Name: 'Poteau béton P1', GlobalId: '0oP1Y8' },
    properties: {},
    materials: ['Béton armé C30/37'], classifications: [{ system: 'Uniclass 2015', value: 'Ss_25_11_20' }],
  },
  {
    id: 'obj-col-2', name: 'Poteau acier P2', ifcClass: 'IFCCOLUMN',
    attributes: { Name: 'Poteau acier P2', GlobalId: '1qR2Z9' },
    properties: {},
    materials: ['Acier S355'], classifications: [],
  },
  // Windows
  {
    id: 'obj-win-1', name: 'Fenêtre F1', ifcClass: 'IFCWINDOW',
    attributes: { Name: 'Fenêtre F1', GlobalId: '2sT3A0' },
    properties: {
      Pset_WindowCommon: { ThermalTransmittance: '1.4', SolarHeatGainTransmittance: '0.52' },
    },
    materials: ['Aluminium', 'Verre'], classifications: [],
  },
  {
    id: 'obj-win-2', name: 'Fenêtre F2', ifcClass: 'IFCWINDOW',
    attributes: { Name: 'Fenêtre F2', GlobalId: '3uV4B1' },
    properties: {
      Pset_WindowCommon: { ThermalTransmittance: '1.6' },
    },
    materials: ['PVC', 'Verre'], classifications: [],
  },
  {
    id: 'obj-win-3', name: 'Baie vitrée BV1', ifcClass: 'IFCWINDOW',
    attributes: { Name: 'Baie vitrée BV1', GlobalId: '4wX5C2' },
    properties: {},
    materials: ['Aluminium', 'Verre'], classifications: [],
  },
  // Doors
  {
    id: 'obj-door-1', name: 'Porte P1', ifcClass: 'IFCDOOR',
    attributes: { Name: 'Porte P1', GlobalId: '5yZ6D3' },
    properties: {},
    materials: ['Bois'], classifications: [],
  },
  // Flow terminals (HVAC)
  {
    id: 'obj-hvac-1', name: 'Cassette DAIKIN', ifcClass: 'IFCFLOWTERMINAL',
    attributes: { Name: 'Cassette DAIKIN', GlobalId: '6aB7E4' },
    properties: {
      Pset_ManufacturerTypeInformation: { ArticleNumber: 'FXZQ50A', Manufacturer: 'DAIKIN' },
      Pset_Condition: { InstallationDate: '2025-06-15' },
    },
    materials: [], classifications: [],
  },
  {
    id: 'obj-hvac-2', name: 'Radiateur Atlantic', ifcClass: 'IFCFLOWTERMINAL',
    attributes: { Name: 'Radiateur Atlantic', GlobalId: '7cD8F5' },
    properties: {
      Pset_ManufacturerTypeInformation: { Manufacturer: 'Atlantic' },
    },
    materials: [], classifications: [],
  },
  {
    id: 'obj-hvac-3', name: 'VMC Double flux', ifcClass: 'IFCFLOWTERMINAL',
    attributes: { Name: 'VMC Double flux', GlobalId: '8eF9G6' },
    properties: {},
    materials: [], classifications: [],
  },
];

// ── Value constraint matching ──

function matchesConstraint(constraint: IDSValueConstraint | undefined, actual: string | undefined): boolean {
  if (!constraint) return true;

  if (constraint.type === 'simpleValue') {
    if (!constraint.value) return actual !== undefined;
    return actual?.toUpperCase() === constraint.value.toUpperCase();
  }

  if (constraint.type === 'restriction' && constraint.restriction) {
    const r = constraint.restriction;
    if (actual === undefined) return false;

    if (r.pattern) {
      try {
        return new RegExp(r.pattern).test(actual);
      } catch {
        return actual.includes(r.pattern);
      }
    }
    if (r.enumeration) {
      return r.enumeration.some(e => e.toUpperCase() === actual.toUpperCase());
    }
    if (r.minLength != null && actual.length < r.minLength) return false;
    if (r.maxLength != null && actual.length > r.maxLength) return false;
    if (r.length != null && actual.length !== r.length) return false;

    const num = parseFloat(actual);
    if (!isNaN(num)) {
      if (r.minInclusive != null && num < r.minInclusive) return false;
      if (r.maxInclusive != null && num > r.maxInclusive) return false;
    }

    return true;
  }

  return true;
}

// ── Applicability: does an IFC object match the spec's applicability? ──

function objectMatchesApplicability(obj: IFCObject, applicability: IDSFacet[]): boolean {
  return applicability.every(facet => objectMatchesFacet(obj, facet));
}

function objectMatchesFacet(obj: IFCObject, facet: IDSFacet): boolean {
  switch (facet.type) {
    case 'entity': {
      if (facet.entityName && !matchesConstraint(facet.entityName, obj.ifcClass)) return false;
      if (facet.predefinedType && !matchesConstraint(facet.predefinedType, obj.predefinedType)) return false;
      return true;
    }
    case 'property': {
      const psName = facet.propertySet?.value;
      const propName = facet.baseName?.value;
      if (!psName || !propName) return true;
      const val = obj.properties[psName]?.[propName];
      if (val === undefined) return false;
      if (facet.value) return matchesConstraint(facet.value, val);
      return true;
    }
    case 'attribute': {
      const attrName = facet.attributeName?.value;
      if (!attrName) return true;
      const val = obj.attributes[attrName];
      if (val === undefined) return false;
      if (facet.value) return matchesConstraint(facet.value, val);
      return true;
    }
    case 'classification': {
      const sysName = facet.system?.value;
      if (!sysName) return obj.classifications.length > 0;
      return obj.classifications.some(c =>
        c.system.toUpperCase() === sysName.toUpperCase() &&
        (!facet.value || matchesConstraint(facet.value, c.value))
      );
    }
    case 'material':
      if (facet.value) return obj.materials.some(m => matchesConstraint(facet.value, m));
      return obj.materials.length > 0;
    default:
      return true;
  }
}

// ── Requirement checking on a single object ──

function checkRequirement(obj: IFCObject, req: IDSRequirement): { pass: boolean; message: string } {
  const facet = req.facet;

  switch (facet.type) {
    case 'property': {
      const psName = facet.propertySet?.value ?? constraintDisplayVal(facet.propertySet);
      const propName = facet.baseName?.value ?? constraintDisplayVal(facet.baseName);

      if (!psName || !propName) {
        return { pass: true, message: 'OK' };
      }

      const pset = obj.properties[psName];
      if (!pset || pset[propName] === undefined) {
        const mustExist = facet.minOccurs !== undefined ? facet.minOccurs > 0 : true;
        if (mustExist) {
          return { pass: false, message: `Propriété '${psName}.${propName}' manquante` };
        }
        return { pass: true, message: 'OK (optionnel)' };
      }

      const actual = pset[propName];
      if (facet.value && !matchesConstraint(facet.value, actual)) {
        return { pass: false, message: `'${psName}.${propName}' = '${actual}' — attendu : ${constraintDisplayVal(facet.value)}` };
      }
      return { pass: true, message: 'OK' };
    }

    case 'attribute': {
      const attrName = facet.attributeName?.value ?? constraintDisplayVal(facet.attributeName);
      if (!attrName) return { pass: true, message: 'OK' };

      const actual = obj.attributes[attrName];
      if (actual === undefined) {
        return { pass: false, message: `Attribut '${attrName}' manquant` };
      }

      if (facet.value && !matchesConstraint(facet.value, actual)) {
        return { pass: false, message: `'${attrName}' = '${actual}' — attendu : ${constraintDisplayVal(facet.value)}` };
      }
      return { pass: true, message: 'OK' };
    }

    case 'classification': {
      const sysName = facet.system?.value ?? constraintDisplayVal(facet.system);

      if (!sysName) {
        if (obj.classifications.length === 0) {
          return { pass: false, message: 'Aucune classification assignée' };
        }
        return { pass: true, message: 'OK' };
      }

      const match = obj.classifications.find(c => c.system.toUpperCase() === sysName.toUpperCase());
      if (!match) {
        return { pass: false, message: `Classification '${sysName}' manquante` };
      }

      if (facet.value && !matchesConstraint(facet.value, match.value)) {
        return { pass: false, message: `Classification '${sysName}' = '${match.value}' — attendu : ${constraintDisplayVal(facet.value)}` };
      }
      return { pass: true, message: 'OK' };
    }

    case 'material': {
      if (obj.materials.length === 0) {
        const mustExist = facet.minOccurs !== undefined ? facet.minOccurs > 0 : true;
        if (mustExist) {
          return { pass: false, message: 'Aucun matériau assigné' };
        }
        return { pass: true, message: 'OK (optionnel)' };
      }

      if (facet.value) {
        const anyMatch = obj.materials.some(m => matchesConstraint(facet.value, m));
        if (!anyMatch) {
          return { pass: false, message: `Matériau '${obj.materials.join(', ')}' ne correspond pas à '${constraintDisplayVal(facet.value)}'` };
        }
      }
      return { pass: true, message: 'OK' };
    }

    default:
      return { pass: true, message: 'OK' };
  }
}

function constraintDisplayVal(c?: IDSValueConstraint): string {
  if (!c) return '';
  if (c.type === 'simpleValue') return c.value ?? '';
  if (c.restriction) {
    const r = c.restriction;
    if (r.pattern) return `/${r.pattern}/`;
    if (r.enumeration) return r.enumeration.join(' | ');
    return '(restriction)';
  }
  return '';
}

// ── Main validation function ──

export interface ValidateOptions {
  objects?: IFCObject[];
  onProgress?: (pct: number) => void;
}

export async function validateIDS(
  idsFile: IDSFile,
  options: ValidateOptions = {},
): Promise<IDSValidationResult[]> {
  const objects = options.objects ?? MOCK_IFC_OBJECTS;
  const results: IDSValidationResult[] = [];
  const totalSpecs = idsFile.specifications.length;

  for (let si = 0; si < totalSpecs; si++) {
    const spec = idsFile.specifications[si];
    const result = validateSpecification(spec, objects);
    results.push(result);

    options.onProgress?.(Math.round(((si + 1) / totalSpecs) * 100));

    // Yield to UI thread for progress display
    await new Promise(r => setTimeout(r, 120 + Math.random() * 200));
  }

  return results;
}

function validateSpecification(spec: IDSSpecification, objects: IFCObject[]): IDSValidationResult {
  const applicable = objects.filter(obj => objectMatchesApplicability(obj, spec.applicability));
  const details: IDSValidationDetail[] = [];

  for (const obj of applicable) {
    let allPass = true;
    const messages: string[] = [];

    for (const req of spec.requirements) {
      const result = checkRequirement(obj, req);
      if (!result.pass) {
        allPass = false;
        messages.push(result.message);
      }
    }

    details.push({
      objectId: obj.id,
      objectName: obj.name,
      status: allPass ? 'pass' : 'fail',
      message: allPass ? 'OK' : messages.join(' ; '),
    });
  }

  return {
    specificationId: spec.id,
    specificationName: spec.name,
    ifcEntity: spec.ifcEntity,
    totalChecked: details.length,
    passed: details.filter(d => d.status === 'pass').length,
    failed: details.filter(d => d.status === 'fail').length,
    details,
  };
}
