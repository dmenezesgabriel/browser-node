export interface VfsEntry { name: string; isDir: boolean }

export class FileExplorer {
  private container: HTMLElement
  private onOpen: (path: string) => void
  private onNeedDir: (path: string) => void
  private expanded = new Set<string>(['/'])
  private dirs = new Map<string, VfsEntry[]>()
  private active = ''
  private renderTimer: ReturnType<typeof setTimeout> | null = null

  constructor(container: HTMLElement, onOpen: (path: string) => void, onNeedDir: (path: string) => void) {
    this.container = container
    this.onOpen = onOpen
    this.onNeedDir = onNeedDir
  }

  refresh() {
    for (const p of this.expanded) this.onNeedDir(p)
  }

  updateDir(path: string, entries: VfsEntry[]) {
    this.dirs.set(path, entries)
    this._render()
  }

  setActive(path: string) {
    this.active = path
    const items = this.container.querySelectorAll('.explorer-item')
    for (let i = 0; i < items.length; i++) {
      const el = items[i] as HTMLElement
      if (el.dataset.path === path) {
        el.classList.add('active')
      } else {
        el.classList.remove('active')
      }
    }
  }

  private _render() {
    if (this.renderTimer) return
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null
      this.container.innerHTML = ''
      this._renderDir('/', 0)
    }, 0)
  }

  private _renderDir(path: string, depth: number) {
    const raw = this.dirs.get(path) ?? []
    const HIDDEN_AT_ROOT = new Set(['node_modules', 'tmp', '.git'])
    const entries = raw
      .filter(e => !(path === '/' && HIDDEN_AT_ROOT.has(e.name)))
      .filter(e => e.name !== '.git')
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })

    for (const e of entries) {
      const fp = path === '/' ? '/' + e.name : path + '/' + e.name
      const el = document.createElement('div')
      el.dataset.path = fp
      el.className = 'explorer-item' + (e.isDir ? ' dir' : ' file') + (fp === this.active ? ' active' : '')
      el.style.paddingLeft = `${depth * 12 + 8}px`

      if (e.isDir) {
        const open = this.expanded.has(fp)
        el.textContent = `${open ? '▾' : '▸'} ${e.name}`
        el.addEventListener('click', () => {
          if (open) {
            this.expanded.delete(fp)
            this.dirs.delete(fp)
          } else {
            this.expanded.add(fp)
            this.onNeedDir(fp)
          }
          this._render()
        })
        this.container.appendChild(el)
        if (open && this.dirs.has(fp)) this._renderDir(fp, depth + 1)
      } else {
        el.textContent = `  ${e.name}`
        el.addEventListener('click', () => {
          this.setActive(fp)
          this.onOpen(fp)
        })
        this.container.appendChild(el)
      }
    }
  }
}
