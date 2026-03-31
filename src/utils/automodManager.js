import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, '..', '..', 'data');
const DATA_FILE = join(DATA_DIR, 'automod.json');

if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
}

const defaultData = {
    enabled: false,
    spam: true,
    raid: true,
    toxicity: true,
    limits: {
        messageSpam: 5,
        channelDelete: 2,
        nicknameChange: 3,
        messageDelete: 3
    }
};

export function loadConfig() {
    try {
        if (!existsSync(DATA_FILE)) {
            saveConfig(defaultData);
            return defaultData;
        }
        const rawData = readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(rawData);
        return { 
            ...defaultData, 
            ...parsed,
            limits: { ...defaultData.limits, ...(parsed.limits || {}) }
        };
    } catch (error) {
        console.error('[ERROR] Failed to load automod config:', error);
        return defaultData;
    }
}

export function saveConfig(data) {
    try {
        writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('[ERROR] Failed to save automod config:', error);
    }
}

export function updateConfig(updates) {
    const current = loadConfig();
    const newData = { ...current, ...updates };
    saveConfig(newData);
    return newData;
}
