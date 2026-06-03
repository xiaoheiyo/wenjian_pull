const fs = require('fs');
const path = require('path');
const router = require('./router');
const { isPathBlocked } = require('./security');

router.register('DELETE', '/delete', (req, res, ctx) => {
    const rawPath = ctx.searchParams.get('path');
    if (!rawPath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '未指定文件路径' }));
        return;
    }

    const filePath = decodeURIComponent(rawPath);
    const resolvedPath = path.resolve(ctx.baseDir, filePath.replace(/^\//, ''));
    if (!resolvedPath.startsWith(ctx.baseDir) || isPathBlocked(resolvedPath, ctx.baseDir)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '路径非法' }));
        return;
    }

    fs.stat(resolvedPath, (err) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '文件不存在' }));
            return;
        }
        try {
            fs.rmSync(resolvedPath, { recursive: true, force: true });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, path: filePath }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '删除失败: ' + e.message }));
        }
    });
});
