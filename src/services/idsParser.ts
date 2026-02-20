import type { IDSFile, IDSSpecification, IDSRequirement, IDSFacet, IDSFacetType, IDSValueConstraint, IDSRestriction } from '@/types';

const IDS_NS = 'http://standards.buildingsmart.org/IDS';
const XS_NS = 'http://www.w3.org/2001/XMLSchema';

let specCounter = 0;
let reqCounter = 0;

function resetCounters() {
  specCounter = 0;
  reqCounter = 0;
}

function nextSpecId(): string {
  return `spec-${++specCounter}`;
}

function nextReqId(): string {
  return `req-${++reqCounter}`;
}

// Namespace-agnostic element lookup (handles both prefixed and default NS)
function getEl(parent: Element, localName: string): Element | null {
  return parent.getElementsByTagNameNS(IDS_NS, localName)[0]
    ?? parent.getElementsByTagName(localName)[0]
    ?? null;
}

function getEls(parent: Element, localName: string): Element[] {
  const nsResult = parent.getElementsByTagNameNS(IDS_NS, localName);
  if (nsResult.length > 0) return Array.from(nsResult);
  return Array.from(parent.getElementsByTagName(localName));
}

function textOf(parent: Element, localName: string): string {
  const el = getEl(parent, localName);
  return el?.textContent?.trim() ?? '';
}

// ── Value constraint parsing ──

function parseValueConstraint(parent: Element): IDSValueConstraint | undefined {
  const simple = getEl(parent, 'simpleValue');
  if (simple) {
    return { type: 'simpleValue', value: simple.textContent?.trim() ?? '' };
  }

  const restriction = parent.getElementsByTagNameNS(XS_NS, 'restriction')[0]
    ?? parent.getElementsByTagName('restriction')[0];

  if (restriction) {
    return { type: 'restriction', restriction: parseRestriction(restriction) };
  }

  return undefined;
}

function parseRestriction(el: Element): IDSRestriction {
  const r: IDSRestriction = {};
  r.base = el.getAttribute('base') ?? undefined;

  const enums: string[] = [];
  const enumEls = el.getElementsByTagNameNS(XS_NS, 'enumeration');
  for (let i = 0; i < enumEls.length; i++) {
    const v = enumEls[i].getAttribute('value');
    if (v) enums.push(v);
  }
  // Fallback for non-NS enumeration elements
  if (enums.length === 0) {
    const enumElsFb = el.getElementsByTagName('enumeration');
    for (let i = 0; i < enumElsFb.length; i++) {
      const v = enumElsFb[i].getAttribute('value');
      if (v) enums.push(v);
    }
  }
  if (enums.length > 0) r.enumeration = enums;

  const patternEl = el.getElementsByTagNameNS(XS_NS, 'pattern')[0]
    ?? el.getElementsByTagName('pattern')[0];
  if (patternEl) r.pattern = patternEl.getAttribute('value') ?? undefined;

  const readInt = (tag: string) => {
    const e = el.getElementsByTagNameNS(XS_NS, tag)[0] ?? el.getElementsByTagName(tag)[0];
    if (!e) return undefined;
    const v = Number(e.getAttribute('value'));
    return isNaN(v) ? undefined : v;
  };

  r.length = readInt('length');
  r.minLength = readInt('minLength');
  r.maxLength = readInt('maxLength');
  r.minInclusive = readInt('minInclusive');
  r.maxInclusive = readInt('maxInclusive');

  return r;
}

// ── Facet parsing ──

function parseEntityFacet(el: Element): IDSFacet {
  const nameEl = getEl(el, 'name');
  const ptEl = getEl(el, 'predefinedType');
  return {
    type: 'entity',
    entityName: nameEl ? parseValueConstraint(nameEl) : undefined,
    predefinedType: ptEl ? parseValueConstraint(ptEl) : undefined,
  };
}

function parsePropertyFacet(el: Element): IDSFacet {
  const psEl = getEl(el, 'propertySet');
  const bnEl = getEl(el, 'baseName');
  const valEl = getEl(el, 'value');
  return {
    type: 'property',
    propertySet: psEl ? parseValueConstraint(psEl) : undefined,
    baseName: bnEl ? parseValueConstraint(bnEl) : undefined,
    value: valEl ? parseValueConstraint(valEl) : undefined,
    dataType: el.getAttribute('dataType') ?? undefined,
    minOccurs: parseOccurs(el.getAttribute('minOccurs')),
    maxOccurs: parseOccursMax(el.getAttribute('maxOccurs')),
    instructions: el.getAttribute('instructions') ?? undefined,
  };
}

function parseAttributeFacet(el: Element): IDSFacet {
  const nameEl = getEl(el, 'name');
  const valEl = getEl(el, 'value');
  return {
    type: 'attribute',
    attributeName: nameEl ? parseValueConstraint(nameEl) : undefined,
    value: valEl ? parseValueConstraint(valEl) : undefined,
    minOccurs: parseOccurs(el.getAttribute('minOccurs')),
    maxOccurs: parseOccursMax(el.getAttribute('maxOccurs')),
    instructions: el.getAttribute('instructions') ?? undefined,
  };
}

function parseClassificationFacet(el: Element): IDSFacet {
  const sysEl = getEl(el, 'system');
  const valEl = getEl(el, 'value');
  return {
    type: 'classification',
    system: sysEl ? parseValueConstraint(sysEl) : undefined,
    value: valEl ? parseValueConstraint(valEl) : undefined,
    minOccurs: parseOccurs(el.getAttribute('minOccurs')),
    maxOccurs: parseOccursMax(el.getAttribute('maxOccurs')),
    instructions: el.getAttribute('instructions') ?? undefined,
  };
}

function parseMaterialFacet(el: Element): IDSFacet {
  const valEl = getEl(el, 'value');
  return {
    type: 'material',
    value: valEl ? parseValueConstraint(valEl) : undefined,
    minOccurs: parseOccurs(el.getAttribute('minOccurs')),
    maxOccurs: parseOccursMax(el.getAttribute('maxOccurs')),
    instructions: el.getAttribute('instructions') ?? undefined,
  };
}

function parsePartOfFacet(el: Element): IDSFacet {
  const entityEl = getEl(el, 'entity');
  return {
    type: 'partOf',
    entityName: entityEl ? parseValueConstraint(entityEl) : undefined,
    relation: el.getAttribute('relation') ?? undefined,
    minOccurs: parseOccurs(el.getAttribute('minOccurs')),
    maxOccurs: parseOccursMax(el.getAttribute('maxOccurs')),
    instructions: el.getAttribute('instructions') ?? undefined,
  };
}

function parseOccurs(val: string | null): number | undefined {
  if (val == null) return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

function parseOccursMax(val: string | null): number | 'unbounded' | undefined {
  if (val == null) return undefined;
  if (val === 'unbounded') return 'unbounded';
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

// ── Parse all facets within a container (applicability or requirements) ──

const FACET_PARSERS: Record<string, (el: Element) => IDSFacet> = {
  entity: parseEntityFacet,
  property: parsePropertyFacet,
  attribute: parseAttributeFacet,
  classification: parseClassificationFacet,
  material: parseMaterialFacet,
  partOf: parsePartOfFacet,
};

function parseFacets(container: Element): IDSFacet[] {
  const facets: IDSFacet[] = [];
  for (const child of Array.from(container.children)) {
    const tag = child.localName.toLowerCase();
    const parser = FACET_PARSERS[tag];
    if (parser) {
      facets.push(parser(child));
    }
  }
  return facets;
}

// ── Build display-friendly IDSRequirement from a facet ──

function facetToRequirement(facet: IDSFacet): IDSRequirement {
  const id = nextReqId();
  const type: IDSFacetType = facet.type;

  let name = '';
  let expectedValue = '';
  let operator: IDSRequirement['operator'] = 'exists';

  switch (facet.type) {
    case 'property': {
      const ps = constraintDisplay(facet.propertySet);
      const bn = constraintDisplay(facet.baseName);
      name = ps && bn ? `${ps}.${bn}` : bn || ps || 'Property';
      const v = facet.value;
      if (v) {
        expectedValue = constraintDisplay(v);
        operator = constraintOperator(v);
      }
      break;
    }
    case 'attribute': {
      name = constraintDisplay(facet.attributeName) || 'Attribute';
      const v = facet.value;
      if (v) {
        expectedValue = constraintDisplay(v);
        operator = constraintOperator(v);
      }
      break;
    }
    case 'classification': {
      name = constraintDisplay(facet.system) || 'Classification';
      const v = facet.value;
      if (v) {
        expectedValue = constraintDisplay(v);
        operator = constraintOperator(v);
      }
      break;
    }
    case 'material': {
      name = 'Material';
      const v = facet.value;
      if (v) {
        expectedValue = constraintDisplay(v);
        operator = constraintOperator(v);
      }
      break;
    }
    case 'entity': {
      name = constraintDisplay(facet.entityName) || 'Entity';
      if (facet.predefinedType) {
        expectedValue = constraintDisplay(facet.predefinedType);
        operator = 'equals';
      }
      break;
    }
    case 'partOf': {
      name = `partOf(${facet.relation ?? ''})`;
      if (facet.entityName) {
        expectedValue = constraintDisplay(facet.entityName);
        operator = 'equals';
      }
      break;
    }
  }

  if (!expectedValue && facet.minOccurs !== undefined && facet.minOccurs > 0) {
    expectedValue = '*';
    operator = 'exists';
  }

  return { id, type, facet, name, expectedValue, operator };
}

function constraintDisplay(c?: IDSValueConstraint): string {
  if (!c) return '';
  if (c.type === 'simpleValue') return c.value ?? '';
  if (c.restriction) {
    const r = c.restriction;
    if (r.pattern) return r.pattern;
    if (r.enumeration) return r.enumeration.join(' | ');
    if (r.minInclusive != null && r.maxInclusive != null) return `[${r.minInclusive}..${r.maxInclusive}]`;
    return '(restriction)';
  }
  return '';
}

function constraintOperator(c: IDSValueConstraint): IDSRequirement['operator'] {
  if (c.type === 'simpleValue') return 'equals';
  if (c.restriction) {
    if (c.restriction.pattern) return 'regex';
    if (c.restriction.enumeration) return 'equals';
    return 'restriction';
  }
  return 'exists';
}

// ── Main parser ──

export function parseIDSFromXML(xml: string, fileId?: string, isBuiltIn = false): IDSFile {
  resetCounters();

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`Erreur de parsing XML : ${parseError.textContent?.slice(0, 200)}`);
  }

  const root = doc.documentElement;
  const info = getEl(root, 'info');

  const id = fileId ?? `ids-${Date.now()}`;
  const name = info ? textOf(info, 'title') : 'Sans titre';
  const version = info ? textOf(info, 'version') : '';
  const author = info ? textOf(info, 'author') : '';
  const date = info ? textOf(info, 'date') : '';
  const description = info ? textOf(info, 'description') : '';
  const objective = info ? (textOf(info, 'purpose') || textOf(info, 'milestone') || '') : '';
  const copyright = info ? textOf(info, 'copyright') : undefined;
  const milestone = info ? textOf(info, 'milestone') : undefined;

  const specifications: IDSSpecification[] = [];
  const specEls = getEls(root, 'specification');

  for (const specEl of specEls) {
    const specId = nextSpecId();
    const specName = specEl.getAttribute('name') ?? `Spécification ${specId}`;
    const specDesc = specEl.getAttribute('description') ?? '';
    const ifcVersion = specEl.getAttribute('ifcVersion') ?? undefined;
    const instructions = specEl.getAttribute('instructions') ?? undefined;
    const minOccurs = parseOccurs(specEl.getAttribute('minOccurs'));
    const maxOccurs = parseOccursMax(specEl.getAttribute('maxOccurs'));

    const applicabilityEl = getEl(specEl, 'applicability');
    const applicability = applicabilityEl ? parseFacets(applicabilityEl) : [];

    const requirementsEl = getEl(specEl, 'requirements');
    const reqFacets = requirementsEl ? parseFacets(requirementsEl) : [];
    const requirements = reqFacets.map(facetToRequirement);

    // Derive ifcEntity from the first entity facet in applicability
    const entityFacet = applicability.find(f => f.type === 'entity');
    const ifcEntity = entityFacet?.entityName
      ? constraintDisplay(entityFacet.entityName)
      : 'ANY';

    specifications.push({
      id: specId,
      name: specName,
      description: specDesc,
      ifcVersion,
      instructions,
      applicability,
      ifcEntity,
      requirements,
      minOccurs,
      maxOccurs,
    });
  }

  return {
    id,
    name,
    version,
    author,
    date,
    objective,
    description,
    specifications,
    isBuiltIn,
    copyright: copyright || undefined,
    milestone: milestone || undefined,
  };
}
