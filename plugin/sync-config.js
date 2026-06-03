const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(process.cwd(), 'sync-config.json');

function load() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        }
    } catch (e) {}
    return { bindings: [] };
}

function save(data) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function getBindings() { return load().bindings; }

function addBinding(url, localPath) {
    const config = load();
    config.bindings.push({ url, localPath, createdAt: Date.now() });
    save(config);
    return config.bindings;
}

function removeBinding(index) {
    const config = load();
    if (index >= 0 && index < config.bindings.length) {
        config.bindings.splice(index, 1);
        save(config);
    }
    return config.bindings;
}

function updateBinding(index, url, localPath) {
    const config = load();
    if (index >= 0 && index < config.bindings.length) {
        config.bindings[index] = { url, localPath, updatedAt: Date.now() };
        save(config);
    }
    return config.bindings;
}

module.exports = { getBindings, addBinding, removeBinding, updateBinding };
