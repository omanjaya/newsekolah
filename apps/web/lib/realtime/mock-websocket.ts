/**
 * Minimal WebSocket stand-in for this directory's tests. A real browser
 * WebSocket cannot be driven synchronously in a test (no real server, no
 * real async handshake), so tests set `vi.stubGlobal("WebSocket",
 * MockWebSocket)` and drive each instance's `open`/`message`/`close`
 * directly instead.
 */
export class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];

  readonly url: string;
  readonly protocols: string | string[] | undefined;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  closed = false;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error("MockWebSocket: send() called while not open");
    }
    this.sent.push(data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  /** Test helper: simulate the server completing the handshake. */
  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  /** Test helper: simulate one server -> client text frame. */
  message(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  /** Test helper: every subscribe/unsubscribe action message sent so far, parsed. */
  sentActions(): { action: string; topics: string[] }[] {
    return this.sent.map((raw) => JSON.parse(raw) as { action: string; topics: string[] });
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }

  static latest(): MockWebSocket {
    const instance = MockWebSocket.instances.at(-1);
    if (!instance) throw new Error("MockWebSocket: no instance created yet");
    return instance;
  }
}
