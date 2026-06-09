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

function substituteDate(str) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const YYYY = now.getFullYear();
    const MM = pad(now.getMonth() + 1);
    const DD = pad(now.getDate());
    const HH = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    return str
        .replace(/\{YYYY\}/g, YYYY)
        .replace(/\{MM\}/g, MM)
        .replace(/\{DD\}/g, DD)
        .replace(/\{HH\}/g, HH)
        .replace(/\{mm\}/g, mm)
        .replace(/\{ss\}/g, ss)
        .replace(/\{date\}/g, `${YYYY}-${MM}-${DD}`)
        .replace(/\{time\}/g, `${HH}:${mm}:${ss}`)
        .replace(/\{datetime\}/g, `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`);
}

function localPathToMatchRegex(localPath) {
    const escaped = localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('^' + escaped.replace(/\\\$(\d+)/g, '([^/]+)') + '$');
}

function resolveRegexBinding(binding, baseDir) {
    const localPathTmpl = substituteDate(binding.localPath);
    const urlTmpl = substituteDate(binding.url);
    const relPath = localPathTmpl.replace(/^\//, '');
    const regex = localPathToMatchRegex(relPath);
    const parts = relPath.split('/');
    const scanParts = [];
    for (const p of parts) {
        if (/\$\d+/.test(p)) break;
        scanParts.push(p);
    }
    const scanDir = path.resolve(baseDir, scanParts.join('/'));
    const results = [];
    function walk(dir) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            const fileRelPath = path.relative(baseDir, full).replace(/\\/g, '/');
            const match = fileRelPath.match(regex);
            if (match) {
                let url = urlTmpl;
                for (let i = 1; i < match.length; i++) {
                    url = url.replace(new RegExp('\\$' + i, 'g'), match[i]);
                }
                results.push({ url, localPath: fileRelPath });
            }
        }
    }
    if (fs.existsSync(scanDir)) walk(scanDir);
    return results;
}

async function syncSinglePair(url, localPath, baseDir) {
    url = substituteDate(url);
    localPath = substituteDate(localPath);
    const targetPath = path.resolve(baseDir, localPath.replace(/^\//, ''));
    if (!targetPath.startsWith(baseDir) || isPathBlocked(targetPath, baseDir)) return { url, localPath, error: '路径非法' };
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    try {
        const data = await fetchUrl(url);
        fs.writeFileSync(targetPath, data);
        return { url, localPath, size: data.length, success: true };
    } catch (e) {
        return { url, localPath, error: e.message };
    }
}

async function syncBinding(binding) {
    const baseDir = process.cwd();
    if (binding.isRegex) {
        const pairs = resolveRegexBinding(binding, baseDir);
        const results = [];
        for (const pair of pairs) results.push(await syncSinglePair(pair.url, pair.localPath, baseDir));
        return results;
    }
    return [await syncSinglePair(binding.url, binding.localPath, baseDir)];
}

async function syncAll() {
    const list = syncConfig.getBindings();
    const results = [];
    for (const b of list) results.push(...await syncBinding(b));
    return results;
}

async function syncOne(index) {
    const list = syncConfig.getBindings();
    if (index < 0 || index >= list.length) return [{ error: '索引无效' }];
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
            const { url, localPath, isRegex } = JSON.parse(body);
            res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify(syncConfig.addBinding(url, localPath, !!isRegex)));
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
            const { index, url, localPath, isRegex } = JSON.parse(body);
            res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify(syncConfig.updateBinding(index, url, localPath, !!isRegex)));
        } catch (e) {
            res.writeHead(400, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '请求格式错误' }));
        }
    });
});

router.register('GET', '/api/sync/resolve', (req, res, ctx) => {
    const idx = ctx.searchParams.get('index');
    const list = syncConfig.getBindings();
    const baseDir = process.cwd();
    if (idx != null) {
        const i = parseInt(idx);
        if (i >= 0 && i < list.length && list[i].isRegex) {
            res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify(resolveRegexBinding(list[i], baseDir)));
            return;
        }
        res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
    }
    const all = [];
    for (const b of list) {
        if (b.isRegex) all.push(...resolveRegexBinding(b, baseDir));
        else all.push({ url: substituteDate(b.url), localPath: substituteDate(b.localPath) });
    }
    res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(all));
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

router.register('POST', '/api/sync/test', (req, res, ctx) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
        try {
            const { url, localPath, isRegex } = JSON.parse(body);
            const baseDir = process.cwd();
            const resolvedUrl = substituteDate(url);
            const resolvedPath = substituteDate(localPath);
            let matches = [];
            if (isRegex) {
                matches = resolveRegexBinding({ url, localPath, isRegex: true }, baseDir);
            } else {
                matches = [{ url: resolvedUrl, localPath: resolvedPath }];
            }
            res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ resolvedUrl, resolvedPath, isRegex: !!isRegex, matches }));
        } catch (e) {
            res.writeHead(400, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
    });
});

module.exports = { substituteDate };
