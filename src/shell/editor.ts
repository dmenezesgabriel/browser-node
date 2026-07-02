import { EditorView, basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorState, Compartment } from '@codemirror/state'
import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client'
import { WorkerTransport } from './lsp/transport'

function langFor(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (['ts', 'tsx'].includes(ext)) return javascript({ typescript: true, jsx: ext === 'tsx' })
  if (['js', 'mjs', 'cjs', 'jsx'].includes(ext)) return javascript({ jsx: ext === 'jsx' })
  if (['html', 'htm'].includes(ext)) return html()
  if (ext === 'css') return css()
  if (ext === 'json') return json()
  if (['md', 'markdown'].includes(ext)) return markdown()
  return javascript()
}

const heightTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { overflow: 'auto' },
})

export class Editor {
  private view: EditorView
  private _filename = ''
  private states = new Map<string, EditorState>()
  onSave?: (content: string, filename: string) => void

  // LSP State Management
  private lspCompartment = new Compartment()
  private tsWorker: Worker | null = null
  private htmlWorker: Worker | null = null
  private tsClient: LSPClient | null = null
  private htmlClient: LSPClient | null = null

  // Store active sync files cache to push to newly created workers
  private lastSyncedFiles: Record<string, string> = {}

  constructor(container: HTMLElement) {
    this.view = new EditorView({
      parent: container,
    })
  }

  private _state(doc: string, filename: string): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        basicSetup, 
        oneDark, 
        heightTheme, 
        langFor(filename),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && this.onSave) {
            this.onSave(update.state.doc.toString(), filename);
          }
        }),
        this.lspCompartment.of([]) // Initialize empty lsp compartment
      ],
    })
  }

  get value(): string { return this.view.state?.doc.toString() ?? '' }
  get filename(): string { return this._filename }

  // Expose a public method to sync VFS files from the main thread
  syncVfsFiles(files: Record<string, string>) {
    this.lastSyncedFiles = files;
    if (this.tsWorker) {
      this.tsWorker.postMessage({ type: 'sync-files', files });
    }
  }

  // Set up language workers and clients lazily to optimize memory and CPU
  private getOrInitTSLsp(): LSPClient {
    if (!this.tsClient) {
      console.log('[Editor] Initializing TypeScript LSP Web Worker...');
      this.tsWorker = new Worker(new URL('./lsp/ts-worker.ts', import.meta.url), { type: 'module' });
      
      const channel = new MessageChannel();
      this.tsWorker.postMessage({ type: 'init-lsp-port', port: channel.port2 }, [channel.port2]);
      
      const transport = new WorkerTransport(channel.port1);
      this.tsClient = new LSPClient({
        extensions: languageServerExtensions()
      }).connect(transport);
      
      // Seed the newly started worker with already loaded VFS files
      if (Object.keys(this.lastSyncedFiles).length > 0) {
        this.tsWorker.postMessage({ type: 'sync-files', files: this.lastSyncedFiles });
      }
    }
    return this.tsClient;
  }

  private getOrInitHTMLLsp(): LSPClient {
    if (!this.htmlClient) {
      console.log('[Editor] Initializing HTML LSP Web Worker...');
      this.htmlWorker = new Worker(new URL('./lsp/html-worker.ts', import.meta.url), { type: 'module' });
      
      const channel = new MessageChannel();
      this.htmlWorker.postMessage({ type: 'init-lsp-port', port: channel.port2 }, [channel.port2]);
      
      const transport = new WorkerTransport(channel.port1);
      this.htmlClient = new LSPClient({
        extensions: languageServerExtensions()
      }).connect(transport);
    }
    return this.htmlClient;
  }

  // Update the CodeMirror lsp compartment for the current file
  private attachLspExtension(filename: string) {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const fileUri = filename.startsWith('/') ? `file://${filename}` : `file:///${filename}`;

    try {
      if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
        const client = this.getOrInitTSLsp();
        this.view.dispatch({
          effects: this.lspCompartment.reconfigure(client.plugin(fileUri))
        });
      } else if (['html', 'htm'].includes(ext)) {
        const client = this.getOrInitHTMLLsp();
        this.view.dispatch({
          effects: this.lspCompartment.reconfigure(client.plugin(fileUri))
        });
      } else {
        // Remove LSP for unsupported files (e.g. CSS, JSON)
        this.view.dispatch({
          effects: this.lspCompartment.reconfigure([])
        });
      }
    } catch (err) {
      console.error('[Editor] Failed to attach LSP extension:', err);
    }
  }

  openFile(content: string, filename: string) {
    if (this._filename && this.view.state) {
      this.states.set(this._filename, this.view.state)
    }
    this._filename = filename
    let state = this.states.get(filename)
    if (!state) {
      state = this._state(content, filename)
      this.states.set(filename, state)
    }
    this.view.setState(state)
    this.attachLspExtension(filename)
  }

  switchFile(filename: string) {
    if (this._filename && this.view.state) {
      this.states.set(this._filename, this.view.state)
    }
    this._filename = filename
    const state = this.states.get(filename)
    if (state) {
      this.view.setState(state)
      this.attachLspExtension(filename)
    }
  }

  closeFile(filename: string) {
    this.states.delete(filename)
    if (this._filename === filename) {
      this._filename = ''
    }
  }

  hasFile(filename: string) {
    return this.states.has(filename)
  }
}
