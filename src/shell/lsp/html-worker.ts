import {
  createConnection,
  BrowserMessageReader,
  BrowserMessageWriter,
  TextDocuments,
  InitializeParams,
  InitializeResult
} from 'vscode-languageserver/browser';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getLanguageService } from 'vscode-html-languageservice';

console.log('[HTML LSP] Worker starting...');

const documents = new TextDocuments(TextDocument);
const htmlService = getLanguageService();

function initializeLspConnection(port: MessagePort) {
  console.log('[HTML LSP] Initializing LSP connection on MessagePort');
  const messageReader = new BrowserMessageReader(port);
  const messageWriter = new BrowserMessageWriter(port);
  const connection = createConnection(messageReader, messageWriter);

  connection.onInitialize((_params: InitializeParams): InitializeResult => {
    return {
      capabilities: {
        textDocumentSync: documents.syncKind,
        completionProvider: {
          resolveProvider: false,
          triggerCharacters: ['<', '=', ' ', '/']
        },
        hoverProvider: true
      }
    };
  });

  connection.onCompletion((pos) => {
    const document = documents.get(pos.textDocument.uri);
    if (!document) return null;
    const htmlDoc = htmlService.parseHTMLDocument(document);
    return htmlService.doComplete(document, pos.position, htmlDoc);
  });

  connection.onHover((pos) => {
    const document = documents.get(pos.textDocument.uri);
    if (!document) return null;
    const htmlDoc = htmlService.parseHTMLDocument(document);
    return htmlService.doHover(document, pos.position, htmlDoc);
  });

  documents.listen(connection);
  connection.listen();
}

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'init-lsp-port') {
    initializeLspConnection(e.data.port);
  }
});
