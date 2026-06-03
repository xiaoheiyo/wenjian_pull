const path = require('path');

const CONFIG = {
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
    sessionDuration: 24 * 60 * 60 * 1000,
};

module.exports = CONFIG;
