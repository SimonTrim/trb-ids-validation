import type { IDSFile, IDSValidationResult } from '@/types';

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function exportValidationCSV(results: IDSValidationResult[], idsFile: IDSFile): void {
  const BOM = '\uFEFF';
  const lines: string[] = [];
  const sep = ';';

  // Header metadata
  lines.push(`Rapport de validation IDS`);
  lines.push(`Fichier IDS${sep}${escapeCSV(idsFile.name)}`);
  lines.push(`Version${sep}${escapeCSV(idsFile.version)}`);
  lines.push(`Auteur${sep}${escapeCSV(idsFile.author)}`);
  lines.push(`Date du fichier${sep}${escapeCSV(idsFile.date)}`);
  lines.push(`Date du rapport${sep}${new Date().toISOString().slice(0, 10)}`);
  lines.push('');

  // Summary
  const totalChecked = results.reduce((s, r) => s + r.totalChecked, 0);
  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  const passRate = totalChecked > 0 ? Math.round((totalPassed / totalChecked) * 100) : 0;

  lines.push(`Résumé`);
  lines.push(`Total vérifié${sep}${totalChecked}`);
  lines.push(`Conformes${sep}${totalPassed}`);
  lines.push(`Non conformes${sep}${totalFailed}`);
  lines.push(`Taux de conformité${sep}${passRate}%`);
  lines.push('');

  // Detail table
  lines.push([
    'Spécification',
    'Entité IFC',
    'Objet ID',
    'Objet Nom',
    'Statut',
    'Message',
  ].map(escapeCSV).join(sep));

  for (const result of results) {
    if (result.details.length === 0) {
      lines.push([
        result.specificationName,
        result.ifcEntity,
        '',
        '',
        'N/A',
        'Aucun objet trouvé pour cette spécification',
      ].map(escapeCSV).join(sep));
    } else {
      for (const detail of result.details) {
        lines.push([
          result.specificationName,
          result.ifcEntity,
          detail.objectId,
          detail.objectName,
          detail.status === 'pass' ? 'Conforme' : 'Non conforme',
          detail.message,
        ].map(escapeCSV).join(sep));
      }
    }
  }

  const csv = BOM + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `rapport-ids-${idsFile.name.replace(/[^a-zA-Z0-9àéèêëïôùûç_-]/g, '_').slice(0, 50)}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
