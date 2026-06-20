/**
 * HTML rewriting for the path-mounted preview proxy.
 *
 * The dev server is proxied under `/__preview/:port/`, but it emits HTML that
 * assumes it lives at the site root: `<script src="/main.js">`, `href="/app.css"`,
 * Vite's `/@vite/client`, etc. Served verbatim under the prefix those root-
 * absolute URLs resolve against the dashboard origin (`/main.js`) and 404.
 *
 * Two cheap, robust rewrites make the common SPA/Vite case load:
 *   1. Inject `<base href="/__preview/:port/">` into <head> so RELATIVE URLs and
 *      runtime-built URLs (import.meta, fetch('foo')) resolve under the prefix.
 *   2. Rewrite ROOT-ABSOLUTE `src="/…"` / `href="/…"` attributes to
 *      `/__preview/:port/…` (a <base> tag does NOT affect root-absolute URLs, so
 *      these must be rewritten explicitly).
 *
 * This is intentionally a string rewrite, not a full HTML parser — it covers the
 * overwhelmingly common cases without the weight/latency of a DOM. Apps that
 * build absolute URLs in JS from `location.origin` may still need their dev
 * server's own `base` set; that caveat is documented for the user.
 */

/** Build the path prefix a given target port is mounted under (with trailing /). */
export function previewPrefix(port: number): string {
  return `/__preview/${port}/`;
}

/**
 * Rewrite a proxied HTML document so its assets resolve under the preview prefix.
 * Never throws: on any unexpected input it returns the original HTML unchanged.
 */
export function rewriteHtml(html: string, port: number): string {
  try {
    const prefix = previewPrefix(port);
    const withBase = injectBase(html, prefix);
    const withUrls = rewriteRootAbsoluteUrls(withBase, prefix);
    // The static <base>/attribute rewrites above only fix URLs PRESENT in the
    // HTML. A SPA dev server (Vite/Next) also builds root-absolute URLs at
    // runtime — ES-module imports + fetch — which a <base> can't touch. Inject a
    // client runtime that redirects those under the prefix so the app boots.
    return injectPreviewRuntime(withUrls, prefix);
  } catch {
    // A rewrite must never break the page — fall back to the original bytes.
    return html;
  }
}

/**
 * Insert `<base href="<prefix>">` as the FIRST child of <head> (so it precedes
 * any relative asset reference). Idempotent: if a <base> is already present we
 * leave the document alone rather than risk a conflicting double-base. If there
 * is no <head>, we inject one right after <html>, else prepend to the document.
 */
function injectBase(html: string, prefix: string): string {
  if (/<base\b/i.test(html)) {
    return html;
  }
  const baseTag = `<base href="${prefix}">`;

  const headOpen = /<head\b[^>]*>/i.exec(html);
  if (headOpen) {
    const at = headOpen.index + headOpen[0].length;
    return html.slice(0, at) + baseTag + html.slice(at);
  }

  const htmlOpen = /<html\b[^>]*>/i.exec(html);
  if (htmlOpen) {
    const at = htmlOpen.index + htmlOpen[0].length;
    return `${html.slice(0, at)}<head>${baseTag}</head>${html.slice(at)}`;
  }

  return baseTag + html;
}

/**
 * Inject the client-side runtime that makes a path-proxied SPA dev server boot:
 *
 *   1. An IMPORT MAP remapping every root-absolute module specifier (`/x`) under
 *      the preview prefix. A `<base>` tag does NOT affect root-absolute ES-module
 *      imports — they resolve against the ORIGIN root — so Vite's runtime imports
 *      (`/@react-refresh`, `/@vite/client`'s deps, `/node_modules/.vite/…`, and
 *      dynamic `import('/src/…')`) would otherwise hit the dashboard and 404.
 *      Import maps, unlike `<base>`, DO remap `/x` module specifiers.
 *   2. A tiny fetch/XHR SHIM that rewrites root-absolute data requests (`/api/…`)
 *      under the prefix too, so the app's own runtime calls reach its dev server.
 *
 * Both are scoped to THIS preview (the prefix is baked in) and live only in the
 * proxied HTML, never the dashboard. Only one import map is allowed per document,
 * so the map is skipped when the page already ships one (the shim still injects).
 * The block is placed right after <base>, before any module script can run.
 */
function injectPreviewRuntime(html: string, prefix: string): string {
  const base = prefix.replace(/\/+$/, ""); // "/__preview/5173" (no trailing slash)
  const hasImportMap = /<script[^>]*type\s*=\s*["']importmap["']/i.test(html);
  const importMap = hasImportMap
    ? ""
    : `<script type="importmap">{"imports":{"/":"${prefix}"}}</script>`;
  // Classic (non-module) script so it runs the instant it is parsed — before the
  // app's own scripts. Sloppy-mode IIFE so `arguments[1] = …` rewrites the XHR
  // URL in place. Every step is wrapped so a shim failure never breaks the page.
  const shim =
    `<script>(function(){var P=${JSON.stringify(base)};` +
    `function abs(u){return typeof u==="string"&&u.charAt(0)==="/"&&u.charAt(1)!=="/"&&(u+"/").indexOf(P+"/")!==0;}` +
    `function fix(u){return abs(u)?P+u:u;}` +
    `try{var f=window.fetch;if(f){window.fetch=function(i,o){try{` +
    `if(typeof i==="string")return f(fix(i),o);` +
    `if(i&&typeof i.url==="string"&&abs(i.url))return f(new Request(fix(i.url),i),o);` +
    `}catch(e){}return f(i,o);};}}catch(e){}` +
    `try{var X=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(){` +
    `try{if(abs(arguments[1]))arguments[1]=fix(arguments[1]);}catch(e){}return X.apply(this,arguments);};}catch(e){}` +
    `})();</script>`;
  const block = importMap + shim;
  return block.length === 0 ? html : insertAfterBase(html, block);
}

/** Insert `block` right after the document's <base> tag (else after <head>). */
function insertAfterBase(html: string, block: string): string {
  const base = /<base\b[^>]*>/i.exec(html);
  if (base) {
    const at = base.index + base[0].length;
    return html.slice(0, at) + block + html.slice(at);
  }
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + block + html.slice(at);
  }
  return block + html;
}

/**
 * Rewrite root-absolute `src`/`href` attribute values (`"/foo"`, `'/foo'`) to
 * sit under the prefix. Skips protocol-relative (`//cdn…`) and absolute
 * (`/__preview/…` already, or `http://…`) URLs:
 *   - We only match a leading single `/` NOT followed by another `/`.
 *   - We skip values that already start with the prefix (idempotent).
 */
function rewriteRootAbsoluteUrls(html: string, prefix: string): string {
  // Matches: (src|href) = " or ' then a single leading slash (not //) then rest.
  // Group 1: attribute name + `=` + opening quote. Group 2: the path after `/`.
  const attrUrl = /\b(src|href)\s*=\s*(["'])\/(?!\/)/gi;

  return html.replace(attrUrl, (match, _attr, _quote, offset: number) => {
    // If the value already starts with the prefix, leave it (idempotent).
    const after = html.slice(offset + match.length - 1); // includes the leading '/'
    if (after.startsWith(prefix)) {
      return match;
    }
    // match ends with the opening quote + a `/`; splice the prefix in place of
    // that single slash (prefix already begins with `/` and ends with `/`).
    return match.slice(0, -1) + prefix;
  });
}
