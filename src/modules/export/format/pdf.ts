/**
 * Generator PDF minimal (Batch 11) — tanpa dependensi.
 *
 * PDF 1.4 standar: Catalog → Pages → Page(s) + content stream + font
 * Helvetica/Helvetica-Bold (WinAnsi). Teks disaring ke Latin-1 sehingga
 * panjang byte = panjang karakter (offset xref akurat).
 */

const PAGE_WIDTH = 595; // A4 (pt)
const PAGE_HEIGHT = 842;
const MARGIN = 56;
const TOP_Y = PAGE_HEIGHT - MARGIN;
const BOTTOM_Y = MARGIN;
const LEADING = 14;
const BODY_SIZE = 10;
const HEADING_SIZE = 12;
const MAX_CHARS = 92; // perkiraan lebar teks Helvetica 10pt dalam 483pt

function sanitizeLatin1(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    out += code <= 0xff && code !== 0x0a && code !== 0x0d ? char : '?';
    if (char === '\n') out += ' ';
  }
  return out.replace(/[\r]/g, '');
}

function escapePdfString(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Pecah konten jadi baris (word-wrap) — baris UPPERCASE pendek jadi judul. */
function toLines(content: string): Array<{ text: string; heading: boolean }> {
  const lines: Array<{ text: string; heading: boolean }> = [];
  for (const raw of sanitizeLatin1(content).split('\n')) {
    const line = raw.trimEnd();
    const heading =
      line.length > 0 && line.length <= 60 && line === line.toUpperCase() && /[A-Z]/.test(line);
    if (line.length <= MAX_CHARS) {
      lines.push({ text: line, heading });
      continue;
    }
    let rest = line;
    while (rest.length > MAX_CHARS) {
      let cut = rest.lastIndexOf(' ', MAX_CHARS);
      if (cut <= 0) cut = MAX_CHARS;
      lines.push({ text: rest.slice(0, cut), heading });
      rest = rest.slice(cut).trimStart();
    }
    if (rest.length > 0) lines.push({ text: rest, heading });
  }
  return lines;
}

interface PageInfo {
  pageObjectNumber: number;
  streamObjectNumber: number;
  content: string;
}

function buildPageStreams(lines: Array<{ text: string; heading: boolean }>): PageInfo[] {
  const pages: PageInfo[] = [];
  let current: string[] = [];
  let y = TOP_Y;

  const flush = (): void => {
    if (current.length === 0) return;
    const objectNumber = 4 + pages.length * 2; // 1=catalog, 2=pages, 3=fonts, lalu pasangan
    pages.push({
      pageObjectNumber: objectNumber,
      streamObjectNumber: objectNumber + 1,
      content: current.join('\n'),
    });
    current = [];
  };

  for (const line of lines) {
    const size = line.heading ? HEADING_SIZE : BODY_SIZE;
    const needed = line.heading ? size + 6 : LEADING;
    if (y - needed < BOTTOM_Y) {
      flush();
      y = TOP_Y;
    }
    if (line.text.length === 0) {
      y -= LEADING;
      continue;
    }
    const font = line.heading ? '/F2' : '/F1';
    current.push(`BT ${font} ${size} Tf ${MARGIN} ${y} Td (${escapePdfString(line.text)}) Tj ET`);
    y -= needed;
  }
  flush();
  return pages;
}

/** Buat Blob PDF dari teks (satu atau banyak halaman). */
export function createPdf(content: string): Blob {
  const pages = buildPageStreams(toLines(content));

  const objects: string[] = [];
  const push = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  // Nomor objek tetap: 1=catalog, 2=pages, 3=F1, 4=F2, lalu pasangan page/stream.
  push('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesNum = push(''); // diisi setelah tahu semua halaman
  const regularFontNum = push(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  const boldFontNum = push(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );

  const pageRefs: number[] = [];
  for (const page of pages) {
    const pageNum = push(
      `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${regularFontNum} 0 R /F2 ${boldFontNum} 0 R >> >> ` +
        `/Contents ${page.streamObjectNumber} 0 R >>`,
    );
    pageRefs.push(pageNum);
    const stream = page.content;
    push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  objects[pagesNum - 1] =
    `<< /Type /Pages /Kids [${pageRefs.map((num) => `${num} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([latin1ToBytes(pdf).buffer as ArrayBuffer], { type: 'application/pdf' });
}

/** Karena semua karakter sudah Latin-1, byte = kode karakter. */
function latin1ToBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}
