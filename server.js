const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3300;
const BASE_DIR = process.cwd();
const PLUGIN_DIR = path.join(__dirname, 'plugin');
const logger = require('./plugin/logger');
const router = require('./plugin/router');

let server = null;

function clearPluginCache() {
    Object.keys(require.cache).forEach(key => {
        if (key.startsWith(PLUGIN_DIR) && !key.endsWith('router.js')) {
            delete require.cache[key];
        }
    });
}

function startServer() {
    clearPluginCache();
    router.clear();

    const { serveDirectory, serveFile } = require('./plugin/file-handler');
    const { isPathBlocked, hasNullByte, isEncodedTraversal, getSecurityHeaders } = require('./plugin/security');

    const sec = getSecurityHeaders();
    const ctx = { sec, baseDir: BASE_DIR };

    router.loadAll();

    server = http.createServer(async (req, res) => {
        try {
            if (router.dispatch(req, res, ctx)) return;

            const url = new URL(req.url, `http://${req.headers.host}`);
            let pathname = url.pathname;
            const searchParams = url.searchParams;

            if (pathname === '/classic-hello' || (pathname === '/' && searchParams.get('legacy') === '1') || pathname === '/original-hello') {
                res.writeHead(200, { ...sec, 'Content-Type': 'text/plain' });
                res.end('Hello from Xuanyuan Node.js Server!\n');
                return;
            }

            if (hasNullByte(pathname) || isEncodedTraversal(pathname)) {
                res.writeHead(400, { ...sec, 'Content-Type': 'text/plain' });
                res.end('400 Bad Request');
                return;
            }

            let safePath = decodeURIComponent(pathname);
            const requestedPath = path.resolve(BASE_DIR, safePath.slice(1));
            if (!requestedPath.startsWith(BASE_DIR) || isPathBlocked(requestedPath, BASE_DIR)) {
                res.writeHead(403, { ...sec, 'Content-Type': 'text/plain' });
                res.end('403 Forbidden - Access denied');
                return;
            }

            fs.stat(requestedPath, (err, stats) => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        res.writeHead(404, { ...sec, 'Content-Type': 'text/html' });
                        res.end('<h2>404 Not Found</h2><p>文件或目录不存在。</p><a href="/">返回首页</a>');
                    } else {
                        res.writeHead(500, { ...sec, 'Content-Type': 'text/plain' });
                        res.end('500 Internal Server Error');
                    }
                    return;
                }

                if (stats.isDirectory()) {
                    serveDirectory(req, res, requestedPath, BASE_DIR);
                } else {
                    serveFile(res, requestedPath, searchParams);
                }
            });
        } catch (error) {
            console.error('请求处理错误:', error);
            res.writeHead(500, { ...sec, 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        }
    });

    server.listen(PORT, '0.0.0.0', () => {
        const msg = `服务已启动，运行在 http://0.0.0.0:${PORT}/`;
        console.log(`✅ ${msg}`);
        logger.info(msg);
        console.log(`📂 当前工作目录: ${BASE_DIR}`);
        console.log(`✨ 访问根路径可浏览目录，拖拽文件到页面可上传`);
        console.log(`🔁 保留原功能: 访问 /classic-hello 或 /?legacy=1 会显示原文本`);
    });
}

let restartTimer = null;

function restartServer(filename) {
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
        logger.logChange(filename);
        const ts = new Date();
        const t = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')} ${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}:${String(ts.getSeconds()).padStart(2, '0')}.${String(ts.getMilliseconds()).padStart(3, '0').slice(-2)}`;
        console.log(`[${t}] 📝 检测到 ${filename} 已修改，正在重启服务...`);
        if (server) {
            server.closeAllConnections && server.closeAllConnections();
            server.close(() => {
                startServer();
            });
        } else {
            startServer();
        }
        restartTimer = null;
    }, 200);
}

try {
    fs.watch(PLUGIN_DIR, { recursive: true }, (eventType, filename) => {
        if (filename && filename.endsWith('.js') && !filename.includes(`${path.sep}logs${path.sep}`) && !filename.startsWith(`logs${path.sep}`)) {
            restartServer(filename);
        }
    });
} catch (err) {
    console.error('无法监控 plugin 目录变化', err);
}

startServer();

process.on('uncaughtException', (err) => console.error('❌ 未捕获异常:', err));
process.on('unhandledRejection', (err) => console.error('❌ 未处理的Promise拒绝:', err));
