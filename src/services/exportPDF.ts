import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export async function exportPDFFromElement(elementId: string, fileName: string): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) throw new Error(`Élément #${elementId} introuvable`);

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  const imgW = canvas.width;
  const imgH = canvas.height;

  const pdfW = 210; // A4 mm
  const pdfH = 297;
  const margin = 10;
  const contentW = pdfW - margin * 2;
  const scaledH = (imgH * contentW) / imgW;

  const pdf = new jsPDF({
    orientation: scaledH > pdfH - margin * 2 ? 'portrait' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  if (scaledH <= pdfH - margin * 2) {
    pdf.addImage(imgData, 'PNG', margin, margin, contentW, scaledH);
  } else {
    // Multi-page: slice the canvas
    const pageContentH = pdfH - margin * 2;
    const sourcePageH = (pageContentH / contentW) * imgW;
    let srcY = 0;
    let page = 0;

    while (srcY < imgH) {
      if (page > 0) pdf.addPage();

      const sliceH = Math.min(sourcePageH, imgH - srcY);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = imgW;
      sliceCanvas.height = sliceH;
      const ctx = sliceCanvas.getContext('2d')!;
      ctx.drawImage(canvas, 0, srcY, imgW, sliceH, 0, 0, imgW, sliceH);

      const sliceData = sliceCanvas.toDataURL('image/png');
      const drawH = (sliceH * contentW) / imgW;
      pdf.addImage(sliceData, 'PNG', margin, margin, contentW, drawH);

      srcY += sourcePageH;
      page++;
    }
  }

  pdf.save(fileName);
}
