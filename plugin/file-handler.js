const fs = require('fs');
const path = require('path');
const { getContentType } = require('./mime');
const { generateDirectoryListing } = require('./directory');
const { isHidden, isSensitive, getSecurityHeaders, MAX_PREVIEW_SIZE } = require('./security');
const syncConfig = require('./sync-config');

function mergeHeaders(...headerObjects) {
    return Object.assign({}, ...headerObjects);
}

function serveDirectory(req, res, dirPath, baseDir) {
    fs.readdir(dirPath, { withFileTypes: true }, (err, files) => {
        if (err) {
            res.writeHead(500, mergeHeaders(getSecurityHeaders(), { 'Content-Type': 'text/plain' }));
            res.end('无法读取目录');
            return;
        }
        const entries = files.filter(file => !(file.name === 'plugin' && file.isDirectory()))
            .filter(file => file.name !== 'server.js' && file.name !== 'sync-config.json')
            .filter(file => !(isHidden(file.name) || isSensitive(file.name)))
            .map(file => ({
            name: file.name,
            isDirectory: file.isDirectory()
        })).sort((a, b) => {
            if (a.isDirectory === b.isDirectory) {
                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            }
            return a.isDirectory ? -1 : 1;
        });
        const bindings = dirPath === baseDir ? syncConfig.getBindings() : [];
        const html = generateDirectoryListing(dirPath, entries, baseDir, bindings);
        res.writeHead(200, mergeHeaders(getSecurityHeaders(), { 'Content-Type': 'text/html' }));
        res.end(html);
    });
}

function serveFile(res, filePath, searchParams) {
    const forceDownload = (searchParams.get('download') === '1');
    const contentType = getContentType(filePath);
    const headers = mergeHeaders(getSecurityHeaders(), {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    if (forceDownload) {
        const fileName = path.basename(filePath);
        const encodedFileName = encodeURIComponent(fileName).replace(/['()]/g, escape);
        headers['Content-Disposition'] = `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`;
    } else if (contentType.startsWith('text/') || contentType === 'application/javascript' || contentType === 'application/json') {
        headers['Content-Disposition'] = 'inline';
        if (!forceDownload) {
            try {
                const stat = fs.statSync(filePath);
                if (stat.size > MAX_PREVIEW_SIZE) {
                    headers['Content-Disposition'] = 'attachment';
                }
            } catch (e) {}
        }
    }
    res.writeHead(200, headers);
    const fileStream = fs.createReadStream(filePath);
    fileStream.on('error', () => {
        if (!res.headersSent) {
            res.writeHead(500, mergeHeaders(getSecurityHeaders(), { 'Content-Type': 'text/plain' }));
            res.end('文件读取错误');
        }
    });
    fileStream.pipe(res);
}

module.exports = { serveDirectory, serveFile };
