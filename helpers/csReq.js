/**
 * Clicksign API request helper.
 *
 * Reads CLICKSIGN_TOKEN from process.env each call.
 * If token is missing, the caller should fall back to placeholder mode (this
 * helper still issues the request and returns whatever the API responds — it
 * does NOT short-circuit; caller decides on placeholder behavior).
 *
 * Usage in a Function node:
 *   const csReq = global.get('csReq');
 *   const res = await csReq('POST', '/api/v3/envelopes', { data: {...} });
 *
 * @param {string} method - HTTP verb (GET, POST, PATCH, DELETE, PUT)
 * @param {string} path - Clicksign API path (e.g. '/api/v3/envelopes')
 * @param {object|null} bodyObj - Optional JSON body
 * @returns {Promise<{statusCode:number, body:any}>}
 */
const https = require('https');

const CS_HOST = 'app.clicksign.com';
const CS_PORT = 443;
const TIMEOUT_MS = 60000;

module.exports = function csReq(method, path, bodyObj) {
    return new Promise((resolve, reject) => {
        const CS_TOKEN = process.env.CLICKSIGN_TOKEN || '';
        const bodyStr = bodyObj ? JSON.stringify(bodyObj) : null;
        const headers = {
            'Authorization': CS_TOKEN,
            'Content-Type': 'application/vnd.api+json',
            'Accept': 'application/vnd.api+json'
        };
        if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

        const req = https.request({
            method,
            hostname: CS_HOST,
            port: CS_PORT,
            path,
            headers
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                let parsed;
                try { parsed = data ? JSON.parse(data) : null; }
                catch (e) { parsed = data; }
                resolve({ statusCode: res.statusCode, body: parsed });
            });
        });
        req.setTimeout(TIMEOUT_MS, () => {
            req.destroy(new Error('Clicksign request timeout'));
        });
        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
};
