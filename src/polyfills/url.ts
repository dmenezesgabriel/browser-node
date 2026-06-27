const _URL = URL
const _URLSearchParams = URLSearchParams
export { _URL as URL, _URLSearchParams as URLSearchParams }
export const parse = (u: string) => new URL(u)
export const format = (u: URL | string) => String(u)
export const resolve = (base: string, rel: string) => new URL(rel, base).toString()
export default { URL: _URL, URLSearchParams: _URLSearchParams, parse, format, resolve }
