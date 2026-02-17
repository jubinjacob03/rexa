import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, '..', '..', 'data');
const DATA_FILE = join(DATA_DIR, 'verification.json');

if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
}

const defaultData = {
    pendingRequests: {},
    approvalLogs: []
};

function loadData() {
    try {
        if (!existsSync(DATA_FILE)) {
            saveData(defaultData);
            return defaultData;
        }
        const rawData = readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error('[ERROR] Failed to load verification data:', error);
        return defaultData;
    }
}

function saveData(data) {
    try {
        writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('[ERROR] Failed to save verification data:', error);
    }
}

export function hasPendingRequest(userId) {
    const data = loadData();
    return userId in data.pendingRequests;
}

export function createRequest(userId, username, requestedRole, requestedRoleId, approvalMessageId) {
    const data = loadData();
    data.pendingRequests[userId] = {
        userId,
        username,
        requestedRole,
        requestedRoleId,
        timestamp: new Date().toISOString(),
        approvalMessageId
    };
    saveData(data);
}

export function getRequest(userId) {
    const data = loadData();
    return data.pendingRequests[userId] || null;
}

export function removeRequest(userId) {
    const data = loadData();
    delete data.pendingRequests[userId];
    saveData(data);
}

export function logApproval(userId, username, requestedRole, approvedBy, approvedById, nickname, status) {
    const data = loadData();
    data.approvalLogs.push({
        userId,
        username,
        requestedRole,
        approvedBy,
        approvedById,
        nickname: nickname || null,
        status,
        timestamp: new Date().toISOString()
    });
    saveData(data);
}

export function getAllPendingRequests() {
    const data = loadData();
    return data.pendingRequests;
}

export function getApprovalLogs(limit = 50) {
    const data = loadData();
    return data.approvalLogs.slice(-limit).reverse();
}
