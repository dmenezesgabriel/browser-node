import { EditorView, basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorState } from '@codemirror/state'

function langFor(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (['ts', 'tsx'].includes(ext)) return javascript({ typescript: true, jsx: ext === 'tsx' })
  if (['js', 'mjs', 'cjs', 'jsx'].includes(ext)) return javascript({ jsx: ext === 'jsx' })
  if (['html', 'htm'].includes(ext)) return html()
  if (ext === 'css') return css()
  if (ext === 'json') return json()
  return javascript()
}

const heightTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { overflow: 'auto' },
})

export class Editor {
  private view: EditorView
  private _filename = '/app/index.js'
  onSave?: (content: string, filename: string) => void

  constructor(container: HTMLElement) {
    this.view = new EditorView({
      state: this._state('// Write your code here\n', this._filename),
      parent: container,
    })
  }

  private _state(doc: string, filename: string): EditorState {
    return EditorState.create({
      doc,
      extensions: [basicSetup, oneDark, heightTheme, langFor(filename)],
    })
  }

  get value(): string { return this.view.state.doc.toString() }
  get filename(): string { return this._filename }

  setContent(content: string, filename: string) {
    this._filename = filename
    this.view.setState(this._state(content, filename))
  }
}
