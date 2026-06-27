const OrigURL = URL;
const _URL = function(url: string | URL, base?: string | URL) {
  try {
    return new OrigURL(url, base);
  } catch(e) {
    console.error("Invalid URL caught in shim:", url, base);
    console.error(e);
    throw e;
  }
} as any;
_URL.createObjectURL = OrigURL.createObjectURL;
_URL.revokeObjectURL = OrigURL.revokeObjectURL;
const _URLSearchParams = URLSearchParams
export { _URL as URL, _URLSearchParams as URLSearchParams }

export function parse(urlStr: string) {
  try {
    const u = new URL(urlStr);
    return {
      href: u.href,
      protocol: u.protocol,
      host: u.host,
      hostname: u.hostname,
      port: u.port,
      pathname: u.pathname,
      search: u.search,
      hash: u.hash,
      auth: u.username ? u.username + (u.password ? ':' + u.password : '') : null,
      path: u.pathname + u.search,
      query: u.search ? u.search.slice(1) : null,
      slashes: urlStr.startsWith(u.protocol + '//')
    }
  } catch (e) {
    // Relative URL fallback
    const hashIdx = urlStr.indexOf('#');
    let hash = null;
    let withoutHash = urlStr;
    if (hashIdx !== -1) {
      hash = urlStr.slice(hashIdx);
      withoutHash = urlStr.slice(0, hashIdx);
    }
    const searchIdx = withoutHash.indexOf('?');
    let search = null;
    let pathname = withoutHash;
    if (searchIdx !== -1) {
      search = withoutHash.slice(searchIdx);
      pathname = withoutHash.slice(0, searchIdx);
    }
    return {
      protocol: null,
      slashes: null,
      auth: null,
      host: null,
      port: null,
      hostname: null,
      hash: hash || null,
      search: search || null,
      query: search ? search.slice(1) : null,
      pathname,
      path: withoutHash,
      href: urlStr
    };
  }
}

export function format(urlObj: URL | string): string {
  return typeof urlObj === 'string' ? urlObj : urlObj.href
}

export function fileURLToPath(url: string | URL): string {
  const u = typeof url === 'string' ? new URL(url) : url
  if (u.protocol !== 'file:') throw new TypeError(`Not a file URL: ${u.href}`)
  return decodeURIComponent(u.pathname)
}

export function pathToFileURL(p: string): URL {
  const abs = p.startsWith('/') ? p : '/' + p
  return new URL('file://' + abs)
}

export default { URL: _URL, URLSearchParams: _URLSearchParams, parse, format, fileURLToPath, pathToFileURL }
