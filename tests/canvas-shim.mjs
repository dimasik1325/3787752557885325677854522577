// Минимальная реализация Canvas 2D для Node — только для тестов/превью.
import zlib from 'node:zlib';

class ImageData {
  constructor(w, h, data = null) {
    this.width = w;
    this.height = h;
    this.data = data || new Uint8ClampedArray(w * h * 4);
  }
}

function parseColor(str) {
  if (typeof str !== 'string') return [0, 0, 0, 255];
  str = str.trim();
  if (str.startsWith('#')) {
    let hex = str.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  }
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s));
    return [parts[0] | 0, parts[1] | 0, parts[2] | 0, parts.length > 3 ? Math.round(parts[3] * 255) : 255];
  }
  return [0, 0, 0, 255];
}

class Ctx2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000';
    this.globalCompositeOperation = 'source-over';
    this.imageSmoothingEnabled = false;
    this.globalAlpha = 1;
    this._stack = [];
    this._m = [1, 0, 0, 1, 0, 0];
  }

  save() {
    this._stack.push({ m: [...this._m], fillStyle: this.fillStyle, composite: this.globalCompositeOperation });
  }
  restore() {
    const s = this._stack.pop();
    if (!s) return;
    this._m = s.m;
    this.fillStyle = s.fillStyle;
    this.globalCompositeOperation = s.composite;
  }
  setTransform(a, b, c, d, e, f) {
    this._m = [a, b, c, d, e, f];
  }
  resetTransform() {
    this._m = [1, 0, 0, 1, 0, 0];
  }

  createImageData(w, h) {
    return new ImageData(w, h);
  }

  getImageData(x, y, w, h) {
    const out = new ImageData(w, h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const sx = x + i;
        const sy = y + j;
        if (sx < 0 || sy < 0 || sx >= this.canvas.width || sy >= this.canvas.height) continue;
        const si = (sy * this.canvas.width + sx) * 4;
        const di = (j * w + i) * 4;
        out.data[di] = this.canvas.data[si];
        out.data[di + 1] = this.canvas.data[si + 1];
        out.data[di + 2] = this.canvas.data[si + 2];
        out.data[di + 3] = this.canvas.data[si + 3];
      }
    }
    return out;
  }

  putImageData(img, dx, dy) {
    for (let j = 0; j < img.height; j++) {
      for (let i = 0; i < img.width; i++) {
        const sx = dx + i;
        const sy = dy + j;
        if (sx < 0 || sy < 0 || sx >= this.canvas.width || sy >= this.canvas.height) continue;
        const si = (j * img.width + i) * 4;
        const di = (sy * this.canvas.width + sx) * 4;
        this.canvas.data[di] = img.data[si];
        this.canvas.data[di + 1] = img.data[si + 1];
        this.canvas.data[di + 2] = img.data[si + 2];
        this.canvas.data[di + 3] = img.data[si + 3];
      }
    }
  }

  _blend(di, r, g, b, a) {
    if (this.globalCompositeOperation === 'source-atop') {
      if (this.canvas.data[di + 3] === 0) return;
      this.canvas.data[di] = r;
      this.canvas.data[di + 1] = g;
      this.canvas.data[di + 2] = b;
      return;
    }
    if (a >= 255) {
      this.canvas.data[di] = r;
      this.canvas.data[di + 1] = g;
      this.canvas.data[di + 2] = b;
      this.canvas.data[di + 3] = 255;
      return;
    }
    const srcA = a / 255;
    const dstA = this.canvas.data[di + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA === 0) return;
    this.canvas.data[di] = (r * srcA + this.canvas.data[di] * dstA * (1 - srcA)) / outA;
    this.canvas.data[di + 1] = (g * srcA + this.canvas.data[di + 1] * dstA * (1 - srcA)) / outA;
    this.canvas.data[di + 2] = (b * srcA + this.canvas.data[di + 2] * dstA * (1 - srcA)) / outA;
    this.canvas.data[di + 3] = outA * 255;
  }

  fillRect(x, y, w, h) {
    const [r, g, b, a0] = parseColor(this.fillStyle);
    const a = Math.round(a0 * this.globalAlpha);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    for (let j = 0; j < Math.ceil(h); j++) {
      for (let i = 0; i < Math.ceil(w); i++) {
        const px = x0 + i;
        const py = y0 + j;
        if (px < 0 || py < 0 || px >= this.canvas.width || py >= this.canvas.height) continue;
        this._blend((py * this.canvas.width + px) * 4, r, g, b, a);
      }
    }
  }

  clearRect(x, y, w, h) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const px = x + i;
        const py = y + j;
        if (px < 0 || py < 0 || px >= this.canvas.width || py >= this.canvas.height) continue;
        const di = (py * this.canvas.width + px) * 4;
        this.canvas.data[di] = 0;
        this.canvas.data[di + 1] = 0;
        this.canvas.data[di + 2] = 0;
        this.canvas.data[di + 3] = 0;
      }
    }
  }

  /** drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh) с поддержкой аффинного преобразования */
  drawImage(src, ...args) {
    let sx = 0;
    let sy = 0;
    let sw = src.width;
    let sh = src.height;
    let dx = 0;
    let dy = 0;
    let dw = src.width;
    let dh = src.height;
    if (args.length === 4) [dx, dy, dw, dh] = args;
    else if (args.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    else if (args.length === 2) [dx, dy] = args;

    const [a, b, c, d, e, f] = this._m;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-9) return;

    // границы результата
    const corners = [
      [dx, dy],
      [dx + dw, dy],
      [dx, dy + dh],
      [dx + dw, dy + dh],
    ].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
    const minX = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0]))));
    const maxX = Math.min(this.canvas.width - 1, Math.ceil(Math.max(...corners.map((p) => p[0]))));
    const minY = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1]))));
    const maxY = Math.min(this.canvas.height - 1, Math.ceil(Math.max(...corners.map((p) => p[1]))));

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        const ix = (d * (cx - e) - c * (cy - f)) / det;
        const iy = (-b * (cx - e) + a * (cy - f)) / det;
        if (ix < dx || iy < dy || ix >= dx + dw || iy >= dy + dh) continue;
        const u = (ix - dx) / dw;
        const v = (iy - dy) / dh;
        const srcX = Math.floor(sx + u * sw);
        const srcY = Math.floor(sy + v * sh);
        if (srcX < 0 || srcY < 0 || srcX >= src.width || srcY >= src.height) continue;
        const si = (srcY * src.width + srcX) * 4;
        const alpha = src.data[si + 3];
        if (alpha === 0) continue;
        this._blend((py * this.canvas.width + px) * 4, src.data[si], src.data[si + 1], src.data[si + 2], alpha);
      }
    }
  }

  /** Для тестов: залить всё одним цветом */
  fill(color) {
    const [r, g, b, a] = parseColor(color);
    for (let i = 0; i < this.canvas.data.length; i += 4) {
      this.canvas.data[i] = r;
      this.canvas.data[i + 1] = g;
      this.canvas.data[i + 2] = b;
      this.canvas.data[i + 3] = a;
    }
  }
}

export class Canvas {
  constructor(w = 300, h = 150) {
    this._w = w;
    this._h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    this._ctx = null;
  }
  get width() {
    return this._w;
  }
  set width(v) {
    if (v === this._w) return;
    this._w = v | 0;
    this.data = new Uint8ClampedArray(Math.max(1, this._w * this._h * 4));
  }
  get height() {
    return this._h;
  }
  set height(v) {
    if (v === this._h) return;
    this._h = v | 0;
    this.data = new Uint8ClampedArray(Math.max(1, this._w * this._h * 4));
  }
  getContext() {
    if (!this._ctx) this._ctx = new Ctx2D(this);
    return this._ctx;
  }
  toBuffer() {
    return encodePNG(this.width, this.height, this.data);
  }
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

export function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width * 4; x++) {
      raw[y * (width * 4 + 1) + 1 + x] = rgba[y * width * 4 + x];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Устанавливает глобальный document, чтобы работал настоящий код игры */
export function installCanvasShim() {
  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') return new Canvas(1, 1);
      return { style: {}, appendChild() {}, addEventListener() {} };
    },
  };
}
