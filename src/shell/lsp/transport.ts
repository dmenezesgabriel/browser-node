import { Transport } from "@codemirror/lsp-client";

export class WorkerTransport implements Transport {
  private handlers: ((value: string) => void)[] = [];

  constructor(private port: Worker | MessagePort) {
    this.port.addEventListener('message', (e: any) => {
      // Only process LSP JSON-RPC messages
      if (e.data && typeof e.data === 'object' && 'jsonrpc' in e.data) {
        console.debug('[LSP RECV]', e.data);
        const str = JSON.stringify(e.data);
        for (const handler of this.handlers) {
          try {
            handler(str);
          } catch (err) {
            console.error('[LSP Transport Error in handler]', err);
          }
        }
      }
    });
    
    // MessagePort requires start() to begin dispatching messages
    if (this.port instanceof MessagePort) {
      this.port.start();
    }
  }

  send(message: string) {
    try {
      const parsed = JSON.parse(message);
      console.debug('[LSP SEND]', parsed);
      this.port.postMessage(parsed);
    } catch (err) {
      console.error('[LSP Transport Failed to parse/send]', err);
    }
  }

  subscribe(handler: (value: string) => void) {
    this.handlers.push(handler);
  }

  unsubscribe(handler: (value: string) => void) {
    this.handlers = this.handlers.filter(h => h !== handler);
  }
}
