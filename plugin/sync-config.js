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

function addBinding(url, localPath, isRegex, syncMode, intervalValue, intervalUnit, scheduledTime) {
    const config = load();
    const binding = { url, localPath, isRegex: !!isRegex, createdAt: Date.now() };
    if (syncMode && syncMode !== 'manual') {
        binding.syncMode = syncMode;
        if (syncMode === 'interval') {
            binding.intervalValue = intervalValue || 1;
            binding.intervalUnit = intervalUnit || 'minutes';
        }
        if (syncMode === 'scheduled') binding.scheduledTime = scheduledTime || '08:00';
    }
    config.bindings.push(binding);
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

function updateBinding(index, url, localPath, isRegex, syncMode, intervalValue, intervalUnit, scheduledTime) {
    const config = load();
    if (index >= 0 && index < config.bindings.length) {
        const binding = { url, localPath, isRegex: !!isRegex, updatedAt: Date.now() };
        if (syncMode && syncMode !== 'manual') {
            binding.syncMode = syncMode;
            if (syncMode === 'interval') {
                binding.intervalValue = intervalValue || 1;
                binding.intervalUnit = intervalUnit || 'minutes';
            }
            if (syncMode === 'scheduled') binding.scheduledTime = scheduledTime || '08:00';
        }
        config.bindings[index] = binding;
        save(config);
    }
    return config.bindings;
}

module.exports = { getBindings, addBinding, removeBinding, updateBinding };
