// ── IDS Types (buildingSMART IDS 1.0 compatible) ──

export interface IDSFile {
  id: string;
  name: string;
  version: string;
  author: string;
  date: string;
  objective: string;
  description: string;
  specifications: IDSSpecification[];
  isBuiltIn: boolean;
  copyright?: string;
  milestone?: string;
}

export interface IDSSpecification {
  id: string;
  name: string;
  description: string;
  ifcVersion?: string;
  instructions?: string;
  applicability: IDSFacet[];
  ifcEntity: string;
  requirements: IDSRequirement[];
  minOccurs?: number;
  maxOccurs?: number | 'unbounded';
}

export type IDSFacetType = 'entity' | 'property' | 'material' | 'classification' | 'attribute' | 'partOf';

export interface IDSValueConstraint {
  type: 'simpleValue' | 'restriction';
  value?: string;
  restriction?: IDSRestriction;
}

export interface IDSRestriction {
  base?: string;
  enumeration?: string[];
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  length?: number;
  minInclusive?: number;
  maxInclusive?: number;
}

export interface IDSFacet {
  type: IDSFacetType;
  entityName?: IDSValueConstraint;
  predefinedType?: IDSValueConstraint;
  propertySet?: IDSValueConstraint;
  baseName?: IDSValueConstraint;
  dataType?: string;
  attributeName?: IDSValueConstraint;
  system?: IDSValueConstraint;
  relation?: string;
  value?: IDSValueConstraint;
  minOccurs?: number;
  maxOccurs?: number | 'unbounded';
  instructions?: string;
}

export interface IDSRequirement {
  id: string;
  type: IDSFacetType;
  facet: IDSFacet;
  // Backward-compatible display helpers
  name: string;
  expectedValue: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'regex' | 'exists' | 'restriction';
}

export interface IDSValidationResult {
  specificationId: string;
  specificationName: string;
  ifcEntity: string;
  totalChecked: number;
  passed: number;
  failed: number;
  details: IDSValidationDetail[];
}

export interface IDSValidationDetail {
  objectId: string;
  objectName: string;
  status: 'pass' | 'fail';
  message: string;
}

// ── Mock IFC Object (for local validation without Viewer API) ──

export interface IFCObject {
  id: string;
  name: string;
  ifcClass: string;
  predefinedType?: string;
  attributes: Record<string, string>;
  properties: Record<string, Record<string, string>>;
  materials: string[];
  classifications: { system: string; value: string }[];
}

// ── Explorer Types ──
export interface ModelTreeNode {
  id: string;
  name: string;
  type: 'project' | 'model' | 'level' | 'room' | 'element';
  ifcClass?: string;
  children?: ModelTreeNode[];
  visible: boolean;
  objectCount?: number;
  icon?: string;
}

// ── Fiche Technique Types ──
export interface TechnicalSheet {
  id: string;
  objectId: string;
  objectName: string;
  objectType: string;
  docCode: string;
  fileName: string;
  fileUrl: string;
  fileType: 'pdf' | 'image' | 'doc';
  manufacturer?: string;
  model?: string;
  thumbnailUrl?: string;
}

// ── Statistiques Types ──
export interface ModelStatistics {
  totalElements: number;
  totalLevels: number;
  totalTypes: number;
  ifcClassDistribution: { name: string; count: number; color: string }[];
  levelDistribution: { name: string; count: number }[];
  materialDistribution: { name: string; count: number; color: string }[];
  propertyStats: PropertyStat[];
}

export interface PropertyStat {
  name: string;
  value: string;
  unit?: string;
  icon?: string;
}

// ── Trimble Connect Types ──
export interface ConnectProject {
  id: string;
  name: string;
  location: string;
}

export interface ViewerSelection {
  modelId: string;
  objectRuntimeIds: number[];
}
