const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const router = require('./router');
const syncConfig = require('./sync-config');
const { isPathBlocked } = require('./security');

function fetchUrl(url, redirects) {
    if (redirects == null) redirects = 0;
    if (redirects > 5) return Promise.reject(new Error('重定向次数过多'));
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { timeout: 30000 }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const loc = new URL(res.headers.location, url).href;
                resolve(fetchUrl(loc, redirects + 1));
                return;
            }
            if (res.statusCode < 200 || res.statusCode >= 300) {
                reject(new Error('HTTP ' + res.statusCode));
                return;
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.on('timeout', function() { req.destroy(); reject(new Error('请求超时')); });
    });
}

async function syncBinding(binding) {
    const baseDir = process.cwd();
    const targetPath = path.resolve(baseDir, binding.localPath.replace(/^\//, ''));
    if (!targetPath.startsWith(baseDir) || isPathBlocked(targetPath, baseDir)) return { ...binding, error: '路径非法' };
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    try {
        const data = await fetchUrl(binding.url);
        fs.writeFileSync(targetPath, data);
        return { url: binding.url, localPath: binding.localPath, size: data.length, success: true };
    } catch (e) {
        return { url: binding.url, localPath: binding.localPath, error: e.message };
    }
}

async function syncAll() {
    const list = syncConfig.getBindings();
    const results = [];
    for (const b of list) results.push(await syncBinding(b));
    return results;
}

async function syncOne(index) {
    const list = syncConfig.getBindings();
    if (index < 0 || index >= list.length) return { error: '索引无效' };
    return await syncBinding(list[index]);
}

router.register('GET', '/api/sync/config', (req, res, ctx) => {
    res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(syncConfig.getBindings()));
});

router.register('POST', '/api/sync/config', (req, res, ctx) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
        try {
            const { url, localPath } = JSON.parse(body);
            res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify(syncConfig.addBinding(url, localPath)));
        } catch (e) {
            res.writeHead(400, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '请求格式错误' }));
        }
    });
});

router.register('PUT', '/api/sync/config', (req, res, ctx) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
        try {
            const { index, url, localPath } = JSON.parse(body);
            res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify(syncConfig.updateBinding(index, url, localPath)));
        } catch (e) {
            res.writeHead(400, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '请求格式错误' }));
        }
    });
});

router.register('DELETE', '/api/sync/config', (req, res, ctx) => {
    const idx = ctx.searchParams.get('index');
    res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(syncConfig.removeBinding(parseInt(idx))));
});

router.register('POST', '/api/sync/run', (req, res, ctx) => {
    const idx = ctx.searchParams.get('index');
    const p = idx != null ? syncOne(parseInt(idx)) : syncAll();
    p.then(results => {
        res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results));
    });
});
