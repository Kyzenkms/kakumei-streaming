// Binary codec for watch-party data channels.
//
// The web/desktop app uses PeerJS with its default "binary" serialization,
// which packs messages with the BinaryPack (msgpack-like) codec. To join the
// exact same P2P mesh from React Native we must speak the identical wire
// format, so we pack/unpack with the same library PeerJS itself uses.
import { pack, unpack } from 'peerjs-js-binarypack';

// Hermes may not ship TextEncoder; BinaryPack's Packer requires it at
// construction time. Minimal UTF-8 implementation (surrogate-pair safe).
type GlobalWithEncoder = typeof globalThis & { TextEncoder?: unknown };
const g = globalThis as GlobalWithEncoder;
if (typeof g.TextEncoder === 'undefined') {
  (g as any).TextEncoder = class {
    encode(str: string): Uint8Array {
      const out: number[] = [];
      for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
          const c2 = str.charCodeAt(++i);
          c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
          out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        } else {
          out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        }
      }
      return new Uint8Array(out);
    }
  };
}

export function encodeMsg(msg: unknown): ArrayBuffer {
  const res = pack(msg as any);
  return res as ArrayBuffer;
}

export function decodeMsg(data: ArrayBuffer | Uint8Array): any {
  if (data instanceof Uint8Array) {
    // binarypack's Unpacker does `new DataView(buffer)` — it needs a genuine
    // ArrayBuffer, not a view. Re-wrap exact-length views to avoid stray bytes.
    const ab = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
      ? data.buffer
      : data.slice().buffer;
    return unpack(ab as ArrayBuffer);
  }
  return unpack(data as ArrayBuffer);
}

export function concatBuffers(parts: ArrayBuffer[]): ArrayBuffer {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(new Uint8Array(p), off);
    off += p.byteLength;
  }
  return out.buffer;
}
