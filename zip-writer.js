// zip-writer.js — minimal zip builder over Node's own zlib, shared by
// build-chrome.js and build-firefox.js.
//
// WHY NOT fflate.zipSync: an fflate-packaged .xpi reproducibly failed AMO
// upload validation with "Received an empty response from the server;
// status: 500", while the byte-identical content zipped by a zlib-based
// writer (.NET ZipArchive) was accepted (2026-06, v1.0.6). Both files were
// spec-valid — headers identical, every stream strict-inflated with CRCs
// matching, addons-linter clean — so the only difference was the deflate
// implementation. This writer uses Node's bundled C zlib (the same family
// as every mainstream zip tool), which AMO demonstrably accepts.
//
// Scope: store-upload packages only — no zip64 (we're ~300 KB, limit is
// 4 GB / 65k entries), no directory entries, no extra fields, flags 0.
"use strict";

const zlib = require("zlib");

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  return {
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  };
}

// files: { "entry/name.ext": Uint8Array } — entry names must use forward
// slashes. Returns the complete zip as a Buffer.
function buildZip(files) {
  const now = dosDateTime(new Date());
  const parts = [];
  const central = [];
  let offset = 0;

  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf8");
    const content = Buffer.from(data.buffer || data, data.byteOffset || 0, data.byteLength);
    const payload = zlib.deflateRawSync(content, { level: 9 });
    const crc = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed: 2.0 (deflate)
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(now.time, 10);
    local.writeUInt16LE(now.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, payload);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // central directory header signature
    cd.writeUInt16LE(20, 4); // version made by: 2.0, MS-DOS host
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(8, 10); // method: deflate
    cd.writeUInt16LE(now.time, 12);
    cd.writeUInt16LE(now.date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(payload.length, 20);
    cd.writeUInt32LE(content.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42); // local header offset
    central.push(cd, nameBuf);

    offset += 30 + nameBuf.length + payload.length;
  }

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end-of-central-directory signature
  const n = Object.keys(files).length;
  eocd.writeUInt16LE(n, 8);
  eocd.writeUInt16LE(n, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...parts, cdBuf, eocd]);
}

module.exports = { buildZip };
