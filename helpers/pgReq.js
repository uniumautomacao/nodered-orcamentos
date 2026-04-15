/**
 * Supabase PostgREST request helper.
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from process.env each call
 * (so env updates take effect without re-requiring).
 *
 * Usage in a Function node (after settings.js wires this as global):
 *   const pgReq = global.get('pgReq');
 *   const res = await pgReq('GET', '/profiles?limit=1');
 *   if (res.statusCode !== 200) { ... }
 *   const rows = res.body;
 *
 * @param {string} method - HTTP verb (GET, POST, PATCH, DELETE, PUT)
 * @param {string} path - PostgREST path WITHOUT the /rest/v1 prefix
 *                        (e.g. '/profiles?id=eq.uuid&select=id,name').
 *                        For backward compatibility, paths starting with
 *                        '/rest/v1' are also accepted.
 * @param {object|null} bodyObj - Optional JSON body. If null/undefined, no body sent.
 * @param {object} [extraHeaders] - Optional extra headers to merge in (e.g. Prefer).
 * @returns {Promise<{statusCode:number, body:any}>}
 */
const http = require('http');
const https = require('https');
const url = require('url');

module.exports = function pgReq(method, path, bodyObj, extraHeaders) {
    return new Promise((resolve, reject) => {
        const SUPABASE_URL = process.env.SUPABASE_URL || '';
        const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            return reject(new Error('pgReq: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing'));
        }
        const parsed = url.parse(SUPABASE_URL);
        const isHttps = parsed.protocol === 'https:';
        const httpMod = isHttps ? https : http;
        const port = parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80);

        // Normalize path: prepend /rest/v1 if not already present
        const fullPath = path.startsWith('/rest/v1') ? path : '/rest/v1' + path;

        const bodyStr = bodyObj ? JSON.stringify(bodyObj) : null;
        const headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };
        if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
        if (extraHeaders) Object.assign(headers, extraHeaders);

        const req = httpMod.request({
            method,
            hostname: parsed.hostname,
            port,
            path: fullPath,
            headers
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                let parsedBody;
                try { parsedBody = data ? JSON.parse(data) : null; }
                catch (e) { parsedBody = data; }
                resolve({ statusCode: res.statusCode, body: parsedBody });
            });
        });
        req.setTimeout(30000, () => {
            req.destroy(new Error('Supabase request timeout'));
        });
        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
};
