import fs from 'node:fs';
import zlib from 'node:zlib';
const buf = fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br');
const out = zlib.brotliDecompressSync(buf);
fs.writeFileSync('/tmp/al2023.tar', out);
console.log('decompressed', out.length);
