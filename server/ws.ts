import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

/**
 * Minimal, dependency-free WebSocket server connection (RFC 6455): text frames,
 * fragmentation, ping/pong and close. Enough for a JSON game protocol.
 */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 64 * 1024;

export class WsConnection {
  private buf: Buffer = Buffer.alloc(0);
  private fragments: Buffer[] = [];
  private closed = false;
  onMessage: (text: string) => void = () => {};
  onClose: () => void = () => {};

  private constructor(private readonly socket: Duplex) {
    socket.on('data', (d: Buffer) => this.onData(d));
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
  }

  /** Completes the HTTP upgrade handshake. Returns null if the request is not a WebSocket upgrade. */
  static accept(req: IncomingMessage, socket: Duplex): WsConnection | null {
    const key = req.headers['sec-websocket-key'];
    if (typeof key !== 'string' || (req.headers.upgrade ?? '').toLowerCase() !== 'websocket') {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return null;
    }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    (socket as { setNoDelay?: (b: boolean) => void }).setNoDelay?.(true);
    return new WsConnection(socket);
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  send(text: string): void {
    if (this.closed) return;
    const payload = Buffer.from(text, 'utf8');
    this.socket.write(Buffer.concat([this.header(0x1, payload.length), payload]));
  }

  close(code = 1000): void {
    if (this.closed) return;
    const p = Buffer.alloc(2);
    p.writeUInt16BE(code, 0);
    this.socket.write(Buffer.concat([this.header(0x8, 2), p]));
    this.socket.end();
    this.finish();
  }

  private header(op: number, len: number): Buffer {
    if (len < 126) return Buffer.from([0x80 | op, len]);
    if (len < 65536) {
      const h = Buffer.alloc(4);
      h[0] = 0x80 | op;
      h[1] = 126;
      h.writeUInt16BE(len, 2);
      return h;
    }
    const h = Buffer.alloc(10);
    h[0] = 0x80 | op;
    h[1] = 127;
    h.writeBigUInt64BE(BigInt(len), 2);
    return h;
  }

  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    this.onClose();
  }

  private onData(d: Buffer): void {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.buf.length >= 2) {
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const op = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) { this.close(1009); return; }
        len = Number(big);
        off = 10;
      }
      if (len > MAX_MESSAGE) { this.close(1009); return; }
      const maskOff = off;
      if (masked) off += 4;
      if (this.buf.length < off + len) return;
      const payload = Buffer.from(this.buf.subarray(off, off + len));
      if (masked) for (let i = 0; i < len; i++) payload[i] ^= this.buf[maskOff + (i & 3)];
      this.buf = Buffer.from(this.buf.subarray(off + len));

      switch (op) {
        case 0x0: // continuation
        case 0x1: // text
        case 0x2: { // binary (treated as text)
          this.fragments.push(payload);
          const total = this.fragments.reduce((a, b) => a + b.length, 0);
          if (total > MAX_MESSAGE) { this.close(1009); return; }
          if (fin) {
            const msg = Buffer.concat(this.fragments).toString('utf8');
            this.fragments = [];
            this.onMessage(msg);
          }
          break;
        }
        case 0x8:
          this.close();
          return;
        case 0x9:
          if (!this.closed) this.socket.write(Buffer.concat([this.header(0xa, payload.length), payload]));
          break;
        default:
          break; // pong / unknown
      }
    }
  }
}
