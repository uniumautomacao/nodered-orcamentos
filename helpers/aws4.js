/**
 * AWS Signature V4 helper for S3-compatible storage (MinIO).
 *
 * Builds canonical request, string-to-sign, and signature for SigV4.
 * Returns the headers needed (Authorization, x-amz-date, x-amz-content-sha256)
 * so the caller can issue the HTTP request.
 *
 * Reads from process.env (caller can override via opts):
 *   - MINIO_REGION (default 'us-east-1')
 *   - MINIO_ACCESS_KEY
 *   - MINIO_SECRET_KEY
 *
 * Usage:
 *   const aws4sign = global.get('aws4sign');
 *   const { headers, amzDate } = aws4sign({
 *       method: 'PUT',
 *       host: 'minio.example.com',
 *       bucket: 'my-bucket',
 *       objectKey: 'path/to/file.pdf',
 *       contentType: 'application/pdf',
 *       payload: fileBuffer  // Buffer or string; required for body hash
 *   });
 *   // Then issue the HTTPS request with those headers.
 *
 * @param {object} opts
 * @param {string} opts.method - HTTP verb (PUT, GET, DELETE, etc.)
 * @param {string} opts.host - Hostname (e.g. 'minio.example.com')
 * @param {string} opts.bucket - S3 bucket name
 * @param {string} opts.objectKey - Object key (without leading /)
 * @param {string} [opts.contentType] - Content-Type header (only included in
 *                                       canonical for methods with a body).
 * @param {Buffer|string} [opts.payload] - Request body for hash. If absent,
 *                                          uses empty-string hash.
 * @param {string} [opts.region] - Override MINIO_REGION
 * @param {string} [opts.accessKey] - Override MINIO_ACCESS_KEY
 * @param {string} [opts.secretKey] - Override MINIO_SECRET_KEY
 * @param {boolean} [opts.includeContentType=true] - Include content-type in
 *                                                    signed headers (set false
 *                                                    for GET/HEAD/DELETE).
 * @returns {{ headers: object, amzDate: string, payloadHash: string,
 *             canonicalUri: string }}
 */
const crypto = require('crypto');

function hashBuf(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}
function hashStr(str) {
    return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}
function hmac(key, data, enc) {
    return crypto.createHmac('sha256', key).update(data, 'utf8').digest(enc);
}

module.exports = function aws4sign(opts) {
    const REGION = opts.region || process.env.MINIO_REGION || 'us-east-1';
    const ACCESS_KEY = opts.accessKey || process.env.MINIO_ACCESS_KEY || '';
    const SECRET_KEY = opts.secretKey || process.env.MINIO_SECRET_KEY || '';
    if (!ACCESS_KEY || !SECRET_KEY) {
        throw new Error('aws4sign: MINIO_ACCESS_KEY or MINIO_SECRET_KEY missing');
    }
    const method = (opts.method || 'GET').toUpperCase();
    const host = opts.host;
    const bucket = opts.bucket;
    const objectKey = opts.objectKey;
    const contentType = opts.contentType || 'application/octet-stream';
    const includeContentType = opts.includeContentType !== false &&
                               (method === 'PUT' || method === 'POST');
    const payload = opts.payload != null ? opts.payload : '';
    const payloadHash = payload === '' ? hashStr('') : hashBuf(payload);

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d+/, '');
    const dateStamp = amzDate.slice(0, 8);
    const canonicalUri = '/' + bucket + '/' + objectKey;

    // Build canonical headers (sorted alphabetically by header name)
    const headerPairs = [
        ['host', host],
        ['x-amz-content-sha256', payloadHash],
        ['x-amz-date', amzDate]
    ];
    if (includeContentType) {
        headerPairs.unshift(['content-type', contentType]);
    }
    headerPairs.sort((a, b) => a[0].localeCompare(b[0]));
    const canonicalHeaders = headerPairs.map(([k, v]) => `${k}:${v}`).join('\n') + '\n';
    const signedHeaders = headerPairs.map(([k]) => k).join(';');

    const canonicalRequest = [
        method,
        canonicalUri,
        '', // query string
        canonicalHeaders,
        signedHeaders,
        payloadHash
    ].join('\n');

    const credentialScope = `${dateStamp}/${REGION}/s3/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        hashStr(canonicalRequest)
    ].join('\n');

    const signingKey = hmac(
        hmac(
            hmac(
                hmac('AWS4' + SECRET_KEY, dateStamp),
                REGION
            ),
            's3'
        ),
        'aws4_request'
    );
    const signature = hmac(signingKey, stringToSign, 'hex');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const headers = {
        'Authorization': authHeader,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'Host': host
    };
    if (includeContentType) {
        headers['Content-Type'] = contentType;
    }
    if (Buffer.isBuffer(payload)) {
        headers['Content-Length'] = payload.length;
    } else if (typeof payload === 'string' && payload !== '') {
        headers['Content-Length'] = Buffer.byteLength(payload);
    }

    return {
        headers,
        amzDate,
        payloadHash,
        canonicalUri
    };
};
