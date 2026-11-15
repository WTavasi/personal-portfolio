// The downloadable résumé. Put one PDF in src/assets/resume/ and every download button on the
// site uses it; with no PDF there, the buttons do not appear.
const found = import.meta.glob('../assets/resume/*.pdf', { eager: true, query: '?url', import: 'default' });

export const resumePdf = Object.values(found)[0] ?? null;
export const PDF_NAME = 'Wyclef-Tavasi-Resume.pdf';

export const pdfLink = (cls = 'btn btn-secondary', label = 'Download résumé (PDF)') =>
  resumePdf ? `<a class="${cls}" href="${resumePdf}" download="${PDF_NAME}">${label}</a>` : '';
