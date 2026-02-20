import type {
  ModelTreeNode,
  TechnicalSheet,
  ModelStatistics,
} from '@/types';

export const mockModelTree: ModelTreeNode[] = [
  {
    id: 'root',
    name: 'Test',
    type: 'project',
    visible: true,
    children: [
      {
        id: 'model-1',
        name: 'Projet Test DOE.ifc',
        type: 'model',
        visible: true,
        children: [
          {
            id: 'level-0',
            name: 'Niveau 0',
            type: 'level',
            visible: true,
            objectCount: 45,
            children: [
              { id: 'room-0-1', name: 'Hall principal', type: 'room', visible: true, objectCount: 12 },
              { id: 'room-0-2', name: 'Local technique', type: 'room', visible: true, objectCount: 8 },
              { id: 'room-0-3', name: 'Parking', type: 'room', visible: true, objectCount: 25 },
            ],
          },
          {
            id: 'level-1',
            name: 'Niveau 1',
            type: 'level',
            visible: true,
            objectCount: 62,
            children: [
              { id: 'room-1-1', name: 'Bureau 101', type: 'room', visible: true, objectCount: 15 },
              { id: 'room-1-2', name: 'Bureau 102', type: 'room', visible: true, objectCount: 12 },
              { id: 'room-1-3', name: 'Salle de réunion', type: 'room', visible: true, objectCount: 20 },
              { id: 'room-1-4', name: 'Circulation', type: 'room', visible: true, objectCount: 15 },
            ],
          },
          {
            id: 'level-2',
            name: 'Niveau 2',
            type: 'level',
            visible: true,
            objectCount: 58,
            children: [
              { id: 'room-2-1', name: 'Bureau 201', type: 'room', visible: true, objectCount: 14 },
              { id: 'room-2-2', name: 'Bureau 202', type: 'room', visible: true, objectCount: 14 },
              { id: 'room-2-3', name: 'Salle de conférence', type: 'room', visible: true, objectCount: 18 },
              { id: 'room-2-4', name: 'Terrasse', type: 'room', visible: true, objectCount: 12 },
            ],
          },
        ],
      },
    ],
  },
];

export const mockTechnicalSheets: TechnicalSheet[] = [
  {
    id: 'ts-1',
    objectId: 'obj-cassette-1',
    objectName: 'Cassette',
    objectType: 'ISEA 4T 04',
    docCode: 'Cassette.pdf',
    fileName: 'Cassette.pdf',
    fileUrl: '#',
    fileType: 'pdf',
    manufacturer: 'DAIKIN',
    model: 'FXZQ-A',
  },
  {
    id: 'ts-2',
    objectId: 'obj-radiateur-1',
    objectName: 'Radiateur',
    objectType: 'RAD-2000W',
    docCode: 'Radiateur_FT.pdf',
    fileName: 'Radiateur_FT.pdf',
    fileUrl: '#',
    fileType: 'pdf',
    manufacturer: 'Atlantic',
    model: 'Nirvana Digital',
  },
  {
    id: 'ts-3',
    objectId: 'obj-vmc-1',
    objectName: 'VMC Double flux',
    objectType: 'DF-350',
    docCode: 'VMC_DF350.pdf',
    fileName: 'VMC_DF350.pdf',
    fileUrl: '#',
    fileType: 'pdf',
    manufacturer: 'Aldes',
    model: 'Dee Fly Cube 350',
  },
];

export const mockStatistics: ModelStatistics = {
  totalElements: 165,
  totalLevels: 3,
  totalTypes: 24,
  ifcClassDistribution: [
    { name: 'IfcWall', count: 42, color: 'var(--chart-1)' },
    { name: 'IfcSlab', count: 12, color: 'var(--chart-2)' },
    { name: 'IfcDoor', count: 28, color: 'var(--chart-3)' },
    { name: 'IfcWindow', count: 35, color: 'var(--chart-4)' },
    { name: 'IfcBeam', count: 18, color: 'var(--chart-5)' },
    { name: 'IfcColumn', count: 15, color: 'var(--success)' },
    { name: 'IfcFlowTerminal', count: 8, color: 'var(--warning)' },
    { name: 'IfcFurnishingElement', count: 7, color: 'var(--destructive)' },
  ],
  levelDistribution: [
    { name: 'Niveau 0', count: 45 },
    { name: 'Niveau 1', count: 62 },
    { name: 'Niveau 2', count: 58 },
  ],
  materialDistribution: [
    { name: 'Béton armé', count: 54, color: '#6B7280' },
    { name: 'Acier S355', count: 33, color: '#3B82F6' },
    { name: 'Bois lamellé', count: 12, color: '#D97706' },
    { name: 'Verre', count: 35, color: '#06B6D4' },
    { name: 'Plâtre BA13', count: 22, color: '#F9FAFB' },
    { name: 'Autre', count: 9, color: '#9CA3AF' },
  ],
  propertyStats: [
    { name: 'Surface totale', value: '2 450', unit: 'm²' },
    { name: 'Volume total', value: '8 575', unit: 'm³' },
    { name: 'Hauteur max', value: '12.6', unit: 'm' },
    { name: 'Longueur murs', value: '892', unit: 'm' },
    { name: 'Surface vitrée', value: '380', unit: 'm²' },
    { name: 'Ratio vitrage', value: '15.5', unit: '%' },
  ],
};
