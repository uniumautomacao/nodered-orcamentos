/**
 * Microsoft Graph API application-auth (client_credentials) token helper.
 *
 * Reads GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET from process.env
 * each call. Caches the resulting token in module-level memory until 60 seconds
 * before expiry (Graph tokens are typically valid for ~3600s).
 *
 * Usage in a Function node (after settings.js wires this as global):
 *   const graphAuth = global.get('graphAuth');
 *   const { accessToken, expiresAt } = await graphAuth();
 *   // accessToken: Bearer token string for Authorization header
 *   // expiresAt: epoch ms at which the token becomes invalid
 *
 * @returns {Promise<{ accessToken:string, expiresAt:number }>}
 */
const https = require('https');
const querystring = require('querystring');

// Module-level cache (shared across all Function nodes via global.get)
let _tokenCache = null; // { accessToken, expiresAt, cachedFor }

module.exports = function graphAuth() {
    return new Promise((resolve, reject) => {
        const tenantId = process.env.GRAPH_TENANT_ID || '';
        const clientId = process.env.GRAPH_CLIENT_ID || '';
        const clientSecret = process.env.GRAPH_CLIENT_SECRET || '';
        if (!tenantId || !clientId || !clientSecret) {
            return reject(new Error('graphAuth: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, or GRAPH_CLIENT_SECRET missing'));
        }

        // Cache hit if valid and creds haven't changed
        const cacheKey = `${tenantId}|${clientId}`;
        if (_tokenCache && _tokenCache.cachedFor === cacheKey &&
            _tokenCache.expiresAt > Date.now() + 60000) {
            return resolve({
                accessToken: _tokenCache.accessToken,
                expiresAt: _tokenCache.expiresAt
            });
        }

        const bodyStr = querystring.stringify({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            scope: 'https://graph.microsoft.com/.default'
        });

        const req = https.request({
            method: 'POST',
            hostname: 'login.microsoftonline.com',
            port: 443,
            path: `/${tenantId}/oauth2/v2.0/token`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(bodyStr),
                'Accept': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`graphAuth: HTTP ${res.statusCode} from login.microsoftonline.com — ${data.slice(0, 500)}`));
                }
                let parsed;
                try { parsed = JSON.parse(data); }
                catch (e) { return reject(new Error(`graphAuth: invalid JSON response — ${e.message}`)); }
                if (!parsed.access_token || !parsed.expires_in) {
                    return reject(new Error(`graphAuth: missing access_token or expires_in in response — ${data.slice(0, 300)}`));
                }
                // expires_in is in seconds; convert to epoch ms
                const expiresAt = Date.now() + (parsed.expires_in * 1000);
                _tokenCache = {
                    accessToken: parsed.access_token,
                    expiresAt,
                    cachedFor: cacheKey
                };
                resolve({ accessToken: parsed.access_token, expiresAt });
            });
        });
        req.setTimeout(30000, () => {
            req.destroy(new Error('graphAuth: request timeout (30s)'));
        });
        req.on('error', reject);
        req.write(bodyStr);
        req.end();
    });
};
