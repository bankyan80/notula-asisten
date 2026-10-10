/**
 * Generator DOCX minimal (Batch 11) — tanpa dependensi.
 * Berkas .docx = arsip ZIP berisi OOXML: [Content_Types].xml, _rels/.rels,
 * word/document.xml. Setiap baris konten jadi satu paragraf — dokumen dapat
 * diedit di Word/LibreOffice/Google Docs.
 */
import { zipToBlob, type ZipFile } from './zip';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

function documentXml(content: string): string {
  const paragraphs = content
    .split('\n')
    .map((line) => line.trimEnd())
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function createDocx(content: string): Blob {
  const files: ZipFile[] = [
    { name: '[Content_Types].xml', data: new TextEncoder().encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: new TextEncoder().encode(ROOT_RELS) },
    { name: 'word/document.xml', data: new TextEncoder().encode(documentXml(content)) },
  ];
  return zipToBlob(files, DOCX_MIME);
}
