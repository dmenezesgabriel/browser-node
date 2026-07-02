import {
  createConnection,
  BrowserMessageReader,
  BrowserMessageWriter,
  TextDocuments,
  InitializeParams,
  InitializeResult,
  CompletionItem,
  TextDocumentPositionParams
} from 'vscode-languageserver/browser';
import { TextDocument } from 'vscode-languageserver-textdocument';
import ts from 'typescript';
import { createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs';
import { setupTypeAcquisition } from '@typescript/ata';

console.log('[TS LSP] Worker starting...');

// VFS and TS Environment State
const fsMap = new Map<string, string>();
const system = createSystem(fsMap);
const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  lib: ['es2022', 'dom'],
  allowJs: true,
  checkJs: true,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
};

let env: ReturnType<typeof createVirtualTypeScriptEnvironment> | null = null;
let envReady = false;
let connection: ReturnType<typeof createConnection> | null = null;

// Document Manager
const documents = new TextDocuments(TextDocument);

// Mapping helpers
function uriToPath(uri: string): string {
  if (uri.startsWith('file://')) {
    return uri.slice(7);
  }
  return uri;
}

function pathToUri(path: string): string {
  if (path.startsWith('/')) {
    return `file://${path}`;
  }
  return `file:///${path}`;
}

// Configurable CDN Fallback Fetcher
const CDNS = [
  'https://cdn.jsdelivr.net/npm',
  'https://unpkg.com',
  'https://esm.sh'
];

async function fetchWithFallback(urlPath: string, options?: RequestInit): Promise<string> {
  let lastError;
  const cleanPath = urlPath.startsWith('/') ? urlPath : '/' + urlPath;
  for (const cdn of CDNS) {
    try {
      console.debug(`[TS LSP CDN] Fetching ${cleanPath} from ${cdn}`);
      const res = await fetch(`${cdn}${cleanPath}`, options);
      if (res.ok) {
        return await res.text();
      }
    } catch (err) {
      console.warn(`[TS LSP CDN] Failed ${cdn}${cleanPath}:`, err);
      lastError = err;
    }
  }
  throw lastError || new Error(`Failed to fetch ${urlPath} from all CDNs`);
}

// Default Lib Acquisition
async function loadDefaultLibs() {
  const libs = [
    'lib.d.ts',
    'lib.es2022.d.ts',
    'lib.dom.d.ts',
    'lib.es5.d.ts',
    'lib.es2015.d.ts',
    'lib.es2015.core.d.ts',
    'lib.es2015.iterable.d.ts',
    'lib.es2015.symbol.d.ts'
  ];
  for (const lib of libs) {
    try {
      const content = await fetchWithFallback(`typescript@5.4.5/lib/${lib}`);
      
      // Save lib to multiple resolution locations to ensure compiler can resolve it
      const filePath = `/node_modules/typescript/lib/${lib}`;
      const rootPath = `/${lib}`;
      
      fsMap.set(filePath, content);
      fsMap.set(rootPath, content);
      
      console.log(`[TS LSP] Loaded default lib: ${lib}`);
    } catch (err) {
      console.error(`[TS LSP] Failed to load default lib ${lib}:`, err);
    }
  }
}

// Automatic Type Acquisition (ATA) Setup
const ata = setupTypeAcquisition({
  projectName: 'browser-node-editor',
  typescript: ts,
  logger: {
    log: (...args) => console.log('[TS LSP ATA]', ...args),
    error: (...args) => console.error('[TS LSP ATA Error]', ...args),
    warn: (...args) => console.warn('[TS LSP ATA Warning]', ...args)
  },
  delegate: {
    receivedFile: (code, path) => {
      console.log(`[TS LSP ATA] Received type definition: ${path}`);
      fsMap.set(path, code);
      if (env) {
        if (env.languageService.getProgram()?.getSourceFile(path)) {
          env.updateFile(path, code);
        } else {
          env.createFile(path, code);
        }
        triggerDiagnosticsOnAllOpen();
      }
    },
    started: () => console.log('[TS LSP ATA] Started type acquisition'),
    finished: (files) => {
      console.log('[TS LSP ATA] Finished type acquisition. Total type files:', files.size);
    }
  },
  fetcher: async (path, options) => {
    let lastError;
    for (const cdn of CDNS) {
      try {
        const url = `${cdn}${path.startsWith('/') ? path : '/' + path}`;
        const res = await fetch(url, options);
        if (res.ok) return res;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error(`ATA failed to fetch ${path} from all CDNs`);
  }
});

function triggerDiagnosticsOnAllOpen() {
  for (const doc of documents.all()) {
    sendDiagnostics(doc.uri);
  }
}

// Helper: Convert TS Diagnostics to LSP Diagnostics
function tsDiagnosticToLsp(diag: ts.Diagnostic, doc: TextDocument) {
  const start = diag.start ?? 0;
  const length = diag.length ?? 0;
  return {
    range: {
      start: doc.positionAt(start),
      end: doc.positionAt(start + length)
    },
    severity: diag.category === ts.DiagnosticCategory.Error ? 1 : 2,
    message: ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
    source: 'typescript'
  };
}

// Sync diagnostics back to client
function sendDiagnostics(uri: string) {
  if (!connection) return;
  const doc = documents.get(uri);
  if (!doc || !envReady || !env) return;
  const path = uriToPath(uri);
  try {
    const semantic = env.languageService.getSemanticDiagnostics(path);
    const syntactic = env.languageService.getSyntacticDiagnostics(path);
    const diagnostics = [...semantic, ...syntactic].map(d => tsDiagnosticToLsp(d, doc));
    connection.sendDiagnostics({ uri, diagnostics });
  } catch (err) {
    console.error(`[TS LSP] Diagnostics failed for ${path}:`, err);
  }
}

// Map TS Element Kinds to LSP Kinds
function mapCompletionKind(kind: ts.ScriptElementKind): number {
  switch (kind) {
    case ts.ScriptElementKind.keyword: return 14;
    case ts.ScriptElementKind.moduleElement: return 9;
    case ts.ScriptElementKind.classElement: return 7;
    case ts.ScriptElementKind.interfaceElement: return 8;
    case ts.ScriptElementKind.typeElement: return 22;
    case ts.ScriptElementKind.enumElement: return 13;
    case ts.ScriptElementKind.variableElement: return 6;
    case ts.ScriptElementKind.localVariableElement: return 6;
    case ts.ScriptElementKind.functionElement: return 3;
    case ts.ScriptElementKind.localFunctionElement: return 3;
    case ts.ScriptElementKind.memberFunctionElement: return 2;
    case ts.ScriptElementKind.memberGetAccessorElement: return 10;
    case ts.ScriptElementKind.memberSetAccessorElement: return 10;
    case ts.ScriptElementKind.memberVariableElement: return 10;
    case ts.ScriptElementKind.constructorImplementationElement: return 4;
    default: return 6;
  }
}

function initializeLspConnection(port: MessagePort) {
  console.log('[TS LSP] Initializing LSP connection on MessagePort');
  const messageReader = new BrowserMessageReader(port);
  const messageWriter = new BrowserMessageWriter(port);
  connection = createConnection(messageReader, messageWriter);

  connection.onInitialize(async (_params: InitializeParams): Promise<InitializeResult> => {
    console.log('[TS LSP] Initializing VFS & loading default type definitions...');
    try {
      await loadDefaultLibs();
      // Filter out files with unsupported extensions (like package.json, index.html, README.md)
      const tsFiles = Array.from(fsMap.keys()).filter(path => 
        ['.ts', '.tsx', '.js', '.jsx', '.d.ts'].some(ext => path.endsWith(ext))
      );
      env = createVirtualTypeScriptEnvironment(system, tsFiles, ts, compilerOptions);
      envReady = true;
      console.log('[TS LSP] Virtual TypeScript Environment is ready.');
    } catch (err) {
      console.error('[TS LSP] Initialization failed:', err);
    }
    return {
      capabilities: {
        textDocumentSync: documents.syncKind,
        completionProvider: {
          resolveProvider: false,
          triggerCharacters: ['.', '"', "'", '/', '@', '<']
        },
        hoverProvider: true,
        definitionProvider: true
      }
    };
  });

  // Auto-completion API
  connection.onCompletion((pos: TextDocumentPositionParams): CompletionItem[] => {
    if (!envReady || !env) return [];
    const uri = pos.textDocument.uri;
    const path = uriToPath(uri);
    const doc = documents.get(uri);
    if (!doc) return [];

    try {
      const offset = doc.offsetAt(pos.position);
      const completions = env.languageService.getCompletionsAtPosition(path, offset, {
        includeExternalModuleExports: true,
        includeInsertTextCompletions: true
      });
      if (!completions) return [];

      return completions.entries.map(entry => {
        const item: CompletionItem = {
          label: entry.name,
          kind: mapCompletionKind(entry.kind),
          sortText: entry.sortText,
          insertText: entry.insertText
        };
        return item;
      });
    } catch (err) {
      console.error(`[TS LSP] Completion failed for ${path}:`, err);
      return [];
    }
  });

  // Hover API
  connection.onHover((pos) => {
    if (!envReady || !env) return null;
    const uri = pos.textDocument.uri;
    const path = uriToPath(uri);
    const doc = documents.get(uri);
    if (!doc) return null;

    try {
      const offset = doc.offsetAt(pos.position);
      const info = env.languageService.getQuickInfoAtPosition(path, offset);
      if (!info) return null;

      const display = ts.displayPartsToString(info.displayParts);
      const docs = ts.displayPartsToString(info.documentation);

      const contents = [
        { language: 'typescript', value: display }
      ];
      if (docs) {
        contents.push({ language: 'markdown', value: docs });
      }

      return {
        contents,
        range: {
          start: doc.positionAt(info.textSpan.start),
          end: doc.positionAt(info.textSpan.start + info.textSpan.length)
        }
      };
    } catch (err) {
      console.error(`[TS LSP] Hover failed for ${path}:`, err);
      return null;
    }
  });

  // Go-to-Definition API
  connection.onDefinition((pos) => {
    if (!envReady || !env) return null;
    const uri = pos.textDocument.uri;
    const path = uriToPath(uri);
    const doc = documents.get(uri);
    if (!doc) return null;

    try {
      const offset = doc.offsetAt(pos.position);
      const defs = env.languageService.getDefinitionAtPosition(path, offset);
      if (!defs) return null;

      return defs.map(def => {
        const defUri = pathToUri(def.fileName);
        const defDoc = documents.get(defUri);
        
        const startPos = defDoc ? defDoc.positionAt(def.textSpan.start) : { line: 0, character: 0 };
        const endPos = defDoc ? defDoc.positionAt(def.textSpan.start + def.textSpan.length) : { line: 0, character: 0 };

        return {
          uri: defUri,
          range: {
            start: startPos,
            end: endPos
          }
        };
      });
    } catch (err) {
      console.error(`[TS LSP] Go-to-definition failed for ${path}:`, err);
      return null;
    }
  });

  documents.listen(connection);
  connection.listen();
}

// Document change handlers
documents.onDidChangeContent((change) => {
  if (!envReady || !env) return;
  const uri = change.document.uri;
  const path = uriToPath(uri);
  const content = change.document.getText();

  try {
    if (env.languageService.getProgram()?.getSourceFile(path)) {
      env.updateFile(path, content);
    } else {
      env.createFile(path, content);
    }
    sendDiagnostics(uri);
    ata(content);
  } catch (err) {
    console.error(`[TS LSP] Document sync failed for ${path}:`, err);
  }
});

documents.onDidOpen((e) => {
  sendDiagnostics(e.document.uri);
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'init-lsp-port') {
    initializeLspConnection(e.data.port);
    return;
  }

  if (e.data && e.data.type === 'sync-files') {
    const { files } = e.data as { files: Record<string, string> };
    console.log(`[TS LSP] Syncing ${Object.keys(files).length} files from VFS...`);
    for (const [path, content] of Object.entries(files)) {
      // Filter out files with unsupported extensions (like package.json, index.html, README.md)
      const isSupported = ['.ts', '.tsx', '.js', '.jsx', '.d.ts'].some(ext => path.endsWith(ext));
      if (!isSupported) continue;

      fsMap.set(path, content);
      if (envReady && env) {
        if (env.languageService.getProgram()?.getSourceFile(path)) {
          env.updateFile(path, content);
        } else {
          env.createFile(path, content);
        }
      }
    }
    triggerDiagnosticsOnAllOpen();
  }
});
