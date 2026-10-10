/**
 * Penulis ZIP minimal (mode STORE, tanpa kompresi) — tanpa dependensi.
 * Dipakai DOCX (OOXML) & XLSX (SpreadsheetML): keduanya cukup berupa arsip ZIP
 * berisi XML. Semua integer little-endian; CRC-32 standar ZIP.
 */

export interface ZipFile {
  /** Path di dalam arsip, mis. "word/document.xml" */
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS time/date tetap (1980-01-01 00:00) — konten tidak bergantung waktu. */
const DOS_TIME = 0;
const DOS_DATE = 33; // tahun 1980, bulan 1, hari 1

function pushU16(bytes: number[], value: number): void {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushU32(bytes: number[], value: number): void {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

const textEncoder = new TextEncoder();

/** Buat arsip ZIP (STORE) dari daftar berkas. */
export function createZip(files: ZipFile[]): Uint8Array {
  const out: number[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = textEncoder.encode(file.name);
    const checksum = crc32(file.data);
    const localOffset = offset;

    // Local file header
    pushU32(out, 0x04034b50);
    pushU16(out, 20); // version needed
    pushU16(out, 0); // flags
    pushU16(out, 0); // method: STORE
    pushU16(out, DOS_TIME);
    pushU16(out, DOS_DATE);
    pushU32(out, checksum);
    pushU32(out, file.data.length); // compressed
    pushU32(out, file.data.length); // uncompressed
    pushU16(out, nameBytes.length);
    pushU16(out, 0); // extra length
    for (const byte of nameBytes) out.push(byte);
    for (const byte of file.data) out.push(byte);
    offset = out.length;

    // Central directory record
    pushU32(central, 0x02014b50);
    pushU16(central, 20); // version made by
    pushU16(central, 20); // version needed
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, DOS_TIME);
    pushU16(central, DOS_DATE);
    pushU32(central, checksum);
    pushU32(central, file.data.length);
    pushU32(central, file.data.length);
    pushU16(central, nameBytes.length);
    pushU16(central, 0); // extra
    pushU16(central, 0); // comment
    pushU16(central, 0); // disk
    pushU16(central, 0); // internal attrs
    pushU32(central, 0); // external attrs
    pushU32(central, localOffset);
    for (const byte of nameBytes) central.push(byte);
  }

  const centralOffset = offset;
  for (const byte of central) out.push(byte);

  // End of central directory
  pushU32(out, 0x06054b50);
  pushU16(out, 0);
  pushU16(out, 0);
  pushU16(out, files.length);
  pushU16(out, files.length);
  pushU32(out, central.length);
  pushU32(out, centralOffset);
  pushU16(out, 0);

  return new Uint8Array(out);
}

export function zipToBlob(files: ZipFile[], mimeType: string): Blob {
  return new Blob([createZip(files).buffer as ArrayBuffer], { type: mimeType });
}
