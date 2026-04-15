const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Limit parallel workers to prevent zone-memory OOM when bundling
// large module graphs (e.g. lucide-react-native has 1000+ icon files).
config.maxWorkers = 2;

module.exports = config;