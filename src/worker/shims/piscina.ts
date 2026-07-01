import { requireSync } from '../loader'

class Piscina {
  options: any
  constructor(options: any = {}) {
    this.options = options
  }

  async run(task: any, options: any = {}): Promise<any> {
    const filename = options.filename || this.options.filename
    if (!filename) {
      throw new Error('Piscina: no filename provided')
    }

    // Load the worker script
    const workerModule: any = requireSync(filename, '/app')
    const fn = typeof workerModule === 'function' ? workerModule : workerModule.default

    if (typeof fn !== 'function') {
      throw new Error(`Piscina worker script ${filename} does not export a function`)
    }

    // Run task on the same thread
    return await fn(task)
  }

  static move(val: any) { return val }

  on() { return this }
  once() { return this }
  off() { return this }
  emit() { return false }
  destroy() {}
}

const piscinaExport = Piscina as any
piscinaExport.default = Piscina
piscinaExport.Piscina = Piscina
piscinaExport.move = Piscina.move

export default piscinaExport

