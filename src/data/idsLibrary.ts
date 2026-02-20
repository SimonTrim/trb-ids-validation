import { parseIDSFromXML } from '@/services/idsParser';
import type { IDSFile } from '@/types';

export interface IDSLibraryEntry {
  id: string;
  fileName: string;
  path: string;
  label: string;
  description: string;
  version: string;
  objective: string;
}

export const IDS_LIBRARY_INDEX: IDSLibraryEntry[] = [
  {
    id: 'lib-nommage',
    fileName: 'controle-nommage.ids',
    path: '/ids-library/controle-nommage.ids',
    label: 'Contrôles de nommage BIM',
    description: 'Vérifie les conventions de nommage du bâtiment, niveaux et murs.',
    version: '1.0',
    objective: 'Contrôle qualité',
  },
  {
    id: 'lib-uniclass',
    fileName: 'classification-uniclass.ids',
    path: '/ids-library/classification-uniclass.ids',
    label: 'Vérification classification Uniclass',
    description: 'Vérifie que les éléments structurels possèdent une classification Uniclass 2015.',
    version: '2.1',
    objective: 'Classification',
  },
  {
    id: 'lib-doe',
    fileName: 'exigences-doe.ids',
    path: '/ids-library/exigences-doe.ids',
    label: 'Exigences DOE — Fiches produits',
    description: "Vérifie les propriétés nécessaires au Dossier des Ouvrages Exécutés.",
    version: '1.0',
    objective: 'DOE / Maintenance',
  },
  {
    id: 'lib-thermique',
    fileName: 'proprietes-thermiques.ids',
    path: '/ids-library/proprietes-thermiques.ids',
    label: 'Propriétés thermiques RE2020',
    description: "Vérifie les propriétés thermiques de l'enveloppe (coefficient U, résistance thermique).",
    version: '1.2',
    objective: 'Conformité RE2020',
  },
];

export async function loadIDSFromLibrary(entry: IDSLibraryEntry): Promise<IDSFile> {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const resp = await fetch(`${base}${entry.path}`);
  if (!resp.ok) throw new Error(`Impossible de charger ${entry.fileName} (${resp.status})`);
  const xml = await resp.text();
  return parseIDSFromXML(xml, entry.id, true);
}

export async function loadIDSFromFile(file: File): Promise<IDSFile> {
  const xml = await file.text();
  const parsed = parseIDSFromXML(xml, `import-${Date.now()}`, false);
  if (!parsed.name || parsed.name === 'Sans titre') {
    parsed.name = file.name.replace(/\.ids$/i, '');
  }
  return parsed;
}
