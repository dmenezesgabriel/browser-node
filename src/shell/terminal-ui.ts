import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export class TerminalUI {
  private term: Terminal
  private fit: FitAddon
  private buf = ''
  private cur = 0
  private history: string[] = []
  private histIdx = -1
  private cwd = '/'
  private _busy = false
  private _onCommand: (cmd: string) => void

  constructor(container: HTMLElement, onCommand: (cmd: string) => void) {
    this._onCommand = onCommand
    this.term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.35,
      letterSpacing: 0.3,
      theme: {
        background:          '#010409',
        foreground:          '#e6edf3',
        cursor:              '#58a6ff',
        cursorAccent:        '#010409',
        selectionBackground: '#1f4878',
        black:               '#484f58',
        red:                 '#f85149',
        green:               '#3fb950',
        yellow:              '#e3b341',
        blue:                '#58a6ff',
        magenta:             '#bc8cff',
        cyan:                '#39c5cf',
        white:               '#b1bac4',
        brightBlack:         '#6e7681',
        brightRed:           '#ff7b72',
        brightGreen:         '#56d364',
        brightYellow:        '#e3b341',
        brightBlue:          '#79c0ff',
        brightMagenta:       '#d2a8ff',
        brightCyan:          '#56d4dd',
        brightWhite:         '#f0f6fc',
      },
    })
    this.fit = new FitAddon()
    this.term.loadAddon(this.fit)
    this.term.open(container)
    this.term.onData(d => this._input(d))
    window.addEventListener('resize', () => this.fit.fit())
  }

  refit() { this.fit.fit() }

  write(text: string) { this.term.write(text) }

  clear() { this.term.clear() }

  setReady(cwd: string) {
    this.cwd = cwd
    this.fit.fit()
    this._prompt()
  }

  setCwd(cwd: string) { this.cwd = cwd }

  showPrompt() { this._busy = false; this._prompt() }

  private _prompt() {
    const parts = this.cwd.split('/').filter(Boolean)
    const short = parts.length === 0 ? '/' : (parts.length === 1 ? '/' + parts[0] : '…/' + parts[parts.length - 1])
    this.term.write(`\r\n\x1b[38;5;74m${short}\x1b[0m \x1b[38;5;246m$\x1b[0m `)
    this.buf = ''
    this.cur = 0
  }

  private _input(data: string) {
    // Ctrl+C
    if (data === '\x03') {
      this.term.write('^C')
      this._busy = false
      this._prompt()
      return
    }
    // Ctrl+L
    if (data === '\x0c') {
      this.term.clear()
      this._prompt()
      return
    }

    if (this._busy) return

    // Enter
    if (data === '\r') {
      this.term.write('\r\n')
      const cmd = this.buf.trim()
      if (cmd) {
        this.history.unshift(cmd)
        if (this.history.length > 500) this.history.pop()
        this.histIdx = -1
        this._busy = true
        this._onCommand(cmd)
      } else {
        this._prompt()
      }
      this.buf = ''
      this.cur = 0
      return
    }

    // Backspace
    if (data === '\x7f') {
      if (this.cur > 0) {
        this.buf = this.buf.slice(0, this.cur - 1) + this.buf.slice(this.cur)
        this.cur--
        this.term.write('\b \b')
      }
      return
    }

    // Escape sequences
    if (data.startsWith('\x1b[')) {
      switch (data) {
        case '\x1b[A': // Up
          if (this.histIdx < this.history.length - 1) this._setLine(this.history[++this.histIdx])
          return
        case '\x1b[B': // Down
          if (this.histIdx > 0) this._setLine(this.history[--this.histIdx])
          else if (this.histIdx === 0) { this.histIdx = -1; this._setLine('') }
          return
        case '\x1b[D': // Left
          if (this.cur > 0) { this.cur--; this.term.write('\x1b[D') }
          return
        case '\x1b[C': // Right
          if (this.cur < this.buf.length) { this.cur++; this.term.write('\x1b[C') }
          return
        case '\x1b[H': case '\x1b[1~': // Home
          if (this.cur > 0) { this.term.write(`\x1b[${this.cur}D`); this.cur = 0 }
          return
        case '\x1b[F': case '\x1b[4~': // End
          if (this.cur < this.buf.length) {
            this.term.write(`\x1b[${this.buf.length - this.cur}C`)
            this.cur = this.buf.length
          }
          return
        case '\x1b[3~': // Delete
          if (this.cur < this.buf.length) {
            this.buf = this.buf.slice(0, this.cur) + this.buf.slice(this.cur + 1)
            const rest = this.buf.slice(this.cur)
            this.term.write(rest + ' \x1b[' + (rest.length + 1) + 'D')
          }
          return
        default: return
      }
    }

    // Printable chars
    if (data.charCodeAt(0) >= 32) {
      this.buf = this.buf.slice(0, this.cur) + data + this.buf.slice(this.cur)
      this.cur += data.length
      if (this.cur === this.buf.length) {
        this.term.write(data)
      } else {
        const rest = this.buf.slice(this.cur)
        this.term.write(data + rest + `\x1b[${rest.length}D`)
      }
    }
  }

  private _setLine(line: string) {
    const back = this.cur > 0 ? `\x1b[${this.cur}D` : ''
    const clear = ' '.repeat(this.buf.length)
    const home = this.buf.length > 0 ? `\x1b[${this.buf.length}D` : ''
    this.term.write(back + clear + home + line)
    this.buf = line
    this.cur = line.length
  }
}
