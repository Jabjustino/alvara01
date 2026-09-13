'use strict';

/**
 * Camada de armazenamento da J2C Inovações.
 * Usa MongoDB Atlas quando a variável MONGODB_URI está definida;
 * caso contrário, recorre a ficheiros JSON locais (para desenvolvimento).
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

const MONGODB_URI = (process.env.MONGODB_URI || '').trim();

let mongoClient = null;
let mongoDb = null;
let usingMongo = false;

// ---------------------------------------------------------------------------
// Helpers JSON
// ---------------------------------------------------------------------------
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function ensureJSONFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) writeJSON(USERS_FILE, []);
  if (!fs.existsSync(HISTORY_FILE)) writeJSON(HISTORY_FILE, []);
}

// ---------------------------------------------------------------------------
// Normalização (chaves de pesquisa)
// ---------------------------------------------------------------------------
function emailKey(email) {
  return String(email || '').trim().toLowerCase();
}

function phoneKey(phone) {
  return String(phone || '').replace(/[^0-9+]/g, '');
}

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
async function init() {
  ensureJSONFiles();

  if (MONGODB_URI) {
    try {
      const { MongoClient } = require('mongodb');
      mongoClient = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
      await mongoClient.connect();
      mongoDb = mongoClient.db();

      await mongoDb.collection('users').createIndex({ emailLower: 1 }, { unique: true });
      await mongoDb.collection('users').createIndex({ phoneNorm: 1 }, { unique: true });
      await mongoDb.collection('history').createIndex({ userId: 1, timestamp: -1 });

      usingMongo = true;
      console.log('✔ Ligado ao MongoDB Atlas.');
      return true;
    } catch (e) {
      console.error('⚠ Falha ao ligar ao MongoDB — a usar armazenamento local (JSON):', e.message);
      usingMongo = false;
    }
  }

  console.log('ℹ A usar armazenamento local (JSON). Defina MONGODB_URI para usar MongoDB Atlas.');
  return false;
}

// ---------------------------------------------------------------------------
// Utilizadores
// ---------------------------------------------------------------------------
async function findUserByEmail(email) {
  const key = emailKey(email);
  if (usingMongo) {
    return await mongoDb.collection('users').findOne({ emailLower: key });
  }
  return readJSON(USERS_FILE).find((u) => emailKey(u.email) === key) || null;
}

async function findUserByPhone(phone) {
  const key = phoneKey(phone);
  if (usingMongo) {
    return await mongoDb.collection('users').findOne({ phoneNorm: key });
  }
  return readJSON(USERS_FILE).find((u) => phoneKey(u.telefone) === key) || null;
}

async function findUserById(id) {
  if (usingMongo) {
    return await mongoDb.collection('users').findOne({ id: id });
  }
  return readJSON(USERS_FILE).find((u) => u.id === id) || null;
}

async function createUser(user) {
  const stored = Object.assign({}, user, {
    emailLower: emailKey(user.email),
    phoneNorm: phoneKey(user.telefone)
  });

  if (usingMongo) {
    await mongoDb.collection('users').insertOne(stored);
  } else {
    const users = readJSON(USERS_FILE);
    users.push(stored);
    writeJSON(USERS_FILE, users);
  }
  return stored;
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------
async function addHistory(entry) {
  if (usingMongo) {
    await mongoDb.collection('history').insertOne(entry);
  } else {
    const history = readJSON(HISTORY_FILE);
    history.push(entry);
    if (history.length > 500) history.splice(0, history.length - 500);
    writeJSON(HISTORY_FILE, history);
  }
}

async function getHistoryForUser(userId, limit = 50) {
  if (usingMongo) {
    return await mongoDb.collection('history')
      .find({ userId: userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }
  return readJSON(HISTORY_FILE)
    .filter((h) => h.userId === userId)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, limit);
}

module.exports = {
  init,
  isMongo: () => usingMongo,
  findUserByEmail,
  findUserByPhone,
  findUserById,
  createUser,
  addHistory,
  getHistoryForUser
};
