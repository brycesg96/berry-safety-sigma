import { deflateRawSync, inflateRawSync } from 'node:zlib';

const table = Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1;
  return n >>> 0;
});
const crc32 = bytes => {
  let value = 0xffffffff;
  for (const byte of bytes) value = table[(value ^ byte) & 255] ^ value >>> 8;
  return (value ^ 0xffffffff) >>> 0;
};
const invalid = () => { throw new Error('INVALID_XLSX'); };

/** Patch only B5. Other OOXML parts, images, styles and print settings survive.
 * ZIP entries are checked before use; no files are extracted to the filesystem.
 */
export function registeredExcel(source, code) {
  if (!Buffer.isBuffer(source) || source.length < 22 || source.length > 3 * 1024 * 1024 || !/^IH-[1-9]\d{3}-\d{3,}$/.test(code)) invalid();
  let end = -1;
  for (let i = source.length - 22; i >= Math.max(0, source.length - 65557); i--) {
    if (source.readUInt32LE(i) === 0x06054b50 && i + 22 + source.readUInt16LE(i + 20) === source.length) { end = i; break; }
  }
  if (end < 0 || source.readUInt16LE(end + 4) || source.readUInt16LE(end + 6)) invalid();
  const count = source.readUInt16LE(end + 10), directoryStart = source.readUInt32LE(end + 16);
  if (!count || count > 2000 || source.readUInt16LE(end + 8) !== count || directoryStart + source.readUInt32LE(end + 12) !== end) invalid();
  const locals = [], central = [], names = new Set();
  let cursor = directoryStart, offset = 0, uncompressedTotal = 0, patched = false;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || source.readUInt32LE(cursor) !== 0x02014b50) invalid();
    const nameLength = source.readUInt16LE(cursor + 28), extraLength = source.readUInt16LE(cursor + 30), commentLength = source.readUInt16LE(cursor + 32);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end) invalid();
    const nameBytes = source.subarray(cursor + 46, cursor + 46 + nameLength), name = nameBytes.toString('utf8');
    const flags = source.readUInt16LE(cursor + 8), method = source.readUInt16LE(cursor + 10), size = source.readUInt32LE(cursor + 24), packedSize = source.readUInt32LE(cursor + 20), localOffset = source.readUInt32LE(cursor + 42);
    if (!name || names.has(name) || name.includes('\0') || name.startsWith('/') || name.split('/').includes('..') || flags & 1 || ![0, 8].includes(method) || localOffset + 30 > directoryStart) invalid();
    names.add(name); uncompressedTotal += size;
    if (uncompressedTotal > 32 * 1024 * 1024 || source.readUInt32LE(localOffset) !== 0x04034b50 || source.readUInt16LE(localOffset + 8) !== method) invalid();
    const localNameLength = source.readUInt16LE(localOffset + 26), localExtraLength = source.readUInt16LE(localOffset + 28), dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + packedSize > directoryStart || !source.subarray(localOffset + 30, localOffset + 30 + localNameLength).equals(nameBytes)) invalid();
    let packed = source.subarray(dataOffset, dataOffset + packedSize);
    let bytes;
    try { bytes = method === 8 ? inflateRawSync(packed, { maxOutputLength: 32 * 1024 * 1024 }) : packed; } catch { invalid(); }
    if (bytes.length !== size || crc32(bytes) !== source.readUInt32LE(cursor + 16)) invalid();
    let checksum = source.readUInt32LE(cursor + 16), unpackedSize = size;
    if (name === 'xl/worksheets/sheet1.xml') {
      const xml = bytes.toString('utf8');
      const cell = /<c\b[^>]*\br=(['"])B5\1[^>]*>[\s\S]*?<\/c>/;
      const match = xml.match(cell);
      if (!match) invalid();
      const attributes = match[0].slice(2, match[0].indexOf('>')).replace(/\s+t=(['"])[\s\S]*?\1/g, '');
      bytes = Buffer.from(xml.replace(cell, `<c${attributes} t="inlineStr"><is><t>${code}</t></is></c>`));
      packed = method === 8 ? deflateRawSync(bytes) : bytes;
      checksum = crc32(bytes); unpackedSize = bytes.length; patched = true;
    }
    const local = Buffer.from(source.subarray(localOffset, dataOffset));
    local.writeUInt16LE(flags & ~8, 6); local.writeUInt32LE(checksum, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(unpackedSize, 22);
    const record = Buffer.from(source.subarray(cursor, next));
    record.writeUInt16LE(flags & ~8, 8); record.writeUInt32LE(checksum, 16); record.writeUInt32LE(packed.length, 20); record.writeUInt32LE(unpackedSize, 24); record.writeUInt32LE(offset, 42);
    locals.push(local, packed); central.push(record); offset += local.length + packed.length; cursor = next;
  }
  if (cursor !== end || !patched || !names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) invalid();
  const footer = Buffer.from(source.subarray(end));
  footer.writeUInt32LE(central.reduce((total, item) => total + item.length, 0), 12); footer.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, footer]);
}
