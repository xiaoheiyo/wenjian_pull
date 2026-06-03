const path = require('path');
const fs = require('fs');

const routes = [];

function register(method, pathname, handler) {
    routes.push({ method, pathname, handler });
}

function clear() {
    routes.length = 0;
}

function loadAll() {
    const dir = __dirname;
    const files = fs.readdirSync(dir).filter(f =>
        f.endsWith('.js') && f !== 'router.js'
    );
    for (const file of files) {
        require(path.join(dir, file));
    }
}

function dispatch(req, res, context) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    for (const route of routes) {
        if (route.method === req.method && route.pathname === pathname) {
            route.handler(req, res, { ...context, url, searchParams: url.searchParams });
            return true;
        }
    }
    return false;
}

module.exports = { register, loadAll, dispatch, clear };
