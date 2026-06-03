const fs = require('fs');
const path = require('path');
const router = require('./router');
const { isPathBlocked } = require('./security');

function parseBoundary(contentType) {
    const match = contentType && contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    return match ? (match[1] || match[2]) : null;
}

function parseMultipart(body, boundary) {
    const parts = [];
    const delimiter = Buffer.from('--' + boundary);
    const endDelimiter = Buffer.from('--' + boundary + '--');
    let start = 0;

    while (start < body.length) {
        const ds = body.indexOf(delimiter, start);
        if (ds === -1) break;
        const ps = ds + delimiter.length;
        if (body.slice(ps, ps + 2).toString() === '--') break;
        let pe = body.indexOf(delimiter, ps);
        if (pe === -1) { pe = body.indexOf(endDelimiter, ps); if (pe === -1) pe = body.length; }
        const raw = body.slice(ps, pe);
        const he = raw.indexOf(Buffer.from('\r\n\r\n'));
        if (he === -1) continue;
        const h = raw.slice(0, he).toString();
        const d = raw.slice(he + 4);
        const disp = (h.match(/content-disposition:\s*(.*)/i) || [])[1] || '';
        const fn = (disp.match(/filename="([^"]*)"/) || [])[1];
        if (fn) parts.push({ filename: fn, data: d.slice(0, d.length - 2) });
        start = pe;
    }
    return parts;
}

router.register('POST', '/upload', (req, res, ctx) => {
    const dirParam = ctx.searchParams.get('path') || '';
    const uploadDir = path.resolve(ctx.baseDir, dirParam.replace(/^\//, ''));
    if (!uploadDir.startsWith(ctx.baseDir) || isPathBlocked(uploadDir, ctx.baseDir)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '上传目录非法' }));
        return;
    }

    const ct = req.headers['content-type'] || '';
    const boundary = parseBoundary(ct);
    if (!boundary) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '无效的 Content-Type' }));
        return;
    }

    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
        try {
            const body = Buffer.concat(chunks);
            const files = parseMultipart(body, boundary);
            if (files.length === 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '未接收到文件' }));
                return;
            }
            const results = [];
            for (const f of files) {
                const tp = path.join(uploadDir, f.filename);
                if (!tp.startsWith(uploadDir)) continue;
                fs.writeFileSync(tp, f.data);
                results.push({ filename: f.filename, size: f.data.length });
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, files: results }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '上传处理失败: ' + err.message }));
        }
    });
});
