/**
 * J2C Inovações — Assessoria em Alvarás e Licenças (Angola)
 * Servidor Node.js.
 * Armazenamento: MongoDB Atlas (MONGODB_URI) ou JSON local (fallback).
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const db = require('./db');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const KNOWLEDGE_FILE = path.join(__dirname, 'data', 'knowledge.json');

// Segredo para assinar tokens de sessão (defina SESSION_SECRET em produção)
const SESSION_SECRET = process.env.SESSION_SECRET || 'j2c-inovacoes-segredo-local';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function nowISO() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Tokens de sessão assinados (sobrevivem a reinícios — ideal para cloud)
// ---------------------------------------------------------------------------
function b64urlEncode(s) {
  return Buffer.from(String(s)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s, 'base64').toString('utf8');
}
function signToken(userId) {
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(userId).digest('hex');
  return b64urlEncode(userId) + '.' + sig;
}
function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const userId = b64urlDecode(parts[0]);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(userId).digest('hex');
  if (parts[1] !== expected) return null;
  return userId;
}

// ---------------------------------------------------------------------------
// Base de conhecimento: correspondência por palavras-chave
// ---------------------------------------------------------------------------
function loadKnowledge() {
  try {
    return JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, 'utf8'));
  } catch (e) {
    return { atividades: [] };
  }
}

function matchKnowledge(query) {
  const kb = loadKnowledge();
  const q = normalize(query);
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);

  let best = null;
  let bestScore = 0;

  for (const item of kb.atividades || []) {
    let score = 0;
    const keywords = (item.keywords || []).map((k) => normalize(k));

    for (const kw of keywords) {
      if (kw.length >= 3 && q.includes(kw)) {
        score += kw.length; // palavras maiores valem mais
      }
    }
    for (const kw of keywords) {
      if (kw.includes(' ') && q.includes(kw)) score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (best && bestScore > 0) {
    return { item: best, score: bestScore };
  }
  return { item: null, score: 0 };
}

// ---------------------------------------------------------------------------
// Pesquisa na Web (DuckDuckGo Lite — sem chave de API)
// ---------------------------------------------------------------------------
function webSearch(query, limit = 5) {
  return new Promise((resolve) => {
    const q = encodeURIComponent(query);
    const options = {
      hostname: 'lite.duckduckgo.com',
      path: '/lite/?q=' + q,
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8'
      },
      timeout: 8000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        resolve(parseDuckDuckGo(body, limit));
      });
    });

    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.on('error', () => resolve([]));
    req.end();
  });
}

function decodeEntities(str) {
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(str) {
  return String(str).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseDuckDuckGo(html, limit) {
  const results = [];

  // Estrutura do DuckDuckGo Lite:
  //   <a href="/l/?...&uddg=..." class='result-link'>título</a>
  //   <td class='result-snippet'>snippet</td>
  const linkRegex = /<a[^>]*href="([^"]+)"[^>]*class='result-link'[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRegex = /<td class='result-snippet'>([\s\S]*?)<\/td>/g;

  const links = Array.from(html.matchAll(linkRegex));
  const snippets = Array.from(html.matchAll(snippetRegex));

  for (let i = 0; i < links.length && results.length < limit; i++) {
    let href = links[i][1];
    const uddg = href.match(/uddg=([^&]+)/);
    if (uddg) {
      try { href = decodeURIComponent(uddg[1]); } catch (e) { /* mantém href */ }
    }

    const title = decodeEntities(stripTags(links[i][2]));
    const snippet = snippets[i] ? decodeEntities(stripTags(snippets[i][1])) : '';

    if (title && href && href.startsWith('http')) {
      results.push({ titulo: title, url: href, snippet: snippet });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Pesquisa principal: base de conhecimento + web
// ---------------------------------------------------------------------------
async function performSearch(query) {
  const match = matchKnowledge(query);
  const kb = loadKnowledge();

  let results = [];
  let fonte = 'Base de conhecimento J2C Inovações';

  if (match.item && match.item.id !== 'generico') {
    results.push(match.item);
  }

  const webQuery = 'alvará licença ' + query + ' Angola requisitos órgão emissor';
  const fontes = await webSearch(webQuery, 5);

  if (results.length === 0) {
    const generico = (kb.atividades || []).find((a) => a.id === 'generico');
    if (generico) {
      results.push(generico);
      fonte = 'Resultado genérico (consulte a J2C Inovações para confirmação)';
    }
  }

  return {
    query: query,
    resultados: results,
    fontes: fontes,
    fonte_principal: fonte,
    nota:
      'A informação apresentada é orientativa. Para confirmação oficial e acompanhamento ' +
      'do processo, contacte a J2C Inovações.'
  };
}

// ---------------------------------------------------------------------------
// Servidor HTTP
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (e) { resolve({}); }
    });
  });
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname);
  if (pathname === '/' || pathname === '') filePath = path.join(PUBLIC_DIR, 'index.html');

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------------
async function getAuthUser(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const userId = verifyToken(token);
  if (!userId) return null;
  return await db.findUserById(userId);
}

function publicUser(u) {
  return { id: u.id, nome: u.nome, email: u.email, telefone: u.telefone };
}

// ---------------------------------------------------------------------------
// Rotas da API
// ---------------------------------------------------------------------------
async function handleApi(req, res, pathname, method) {
  // ---- Registo ----
  if (pathname === '/api/register' && method === 'POST') {
    const body = await readBody(req);
    const nome = String(body.nome || '').trim();
    const email = String(body.email || '').trim();
    const telefone = String(body.telefone || '').trim();
    const senha = String(body.senha || '');

    if (!nome || !email || !telefone || !senha) {
      return sendJSON(res, 400, { ok: false, erro: 'Preencha nome, email, telefone e senha.' });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return sendJSON(res, 400, { ok: false, erro: 'Email inválido.' });
    }
    if (senha.length < 4) {
      return sendJSON(res, 400, { ok: false, erro: 'A senha deve ter pelo menos 4 caracteres.' });
    }
    if (await db.findUserByEmail(email)) {
      return sendJSON(res, 409, { ok: false, erro: 'Já existe uma conta com este email.' });
    }
    if (await db.findUserByPhone(telefone)) {
      return sendJSON(res, 409, { ok: false, erro: 'Já existe uma conta com este número de telefone.' });
    }

    const user = {
      id: randomToken(),
      nome,
      email,
      telefone,
      senhaHash: sha256(senha),
      criadoEm: nowISO()
    };
    await db.createUser(user);

    const token = signToken(user.id);
    return sendJSON(res, 201, { ok: true, token, user: publicUser(user) });
  }

  // ---- Login ----
  if (pathname === '/api/login' && method === 'POST') {
    const body = await readBody(req);
    const email = String(body.email || '').trim();
    const senha = String(body.senha || '');

    const user = await db.findUserByEmail(email);
    if (!user || user.senhaHash !== sha256(senha)) {
      return sendJSON(res, 401, { ok: false, erro: 'Email ou senha incorrectos.' });
    }

    const token = signToken(user.id);
    return sendJSON(res, 200, { ok: true, token, user: publicUser(user) });
  }

  // ---- Pesquisa (requer autenticação) ----
  if (pathname === '/api/search' && method === 'GET') {
    const auth = await getAuthUser(req);
    if (!auth) return sendJSON(res, 401, { ok: false, erro: 'Faça login para pesquisar.' });

    const parsed = url.parse(req.url, true);
    const q = String(parsed.query.q || '').trim();
    if (!q) return sendJSON(res, 400, { ok: false, erro: 'Indique a actividade que pretende exercer.' });
    if (q.length < 2) return sendJSON(res, 400, { ok: false, erro: 'Pesquisa demasiado curta.' });

    const result = await performSearch(q);

    await db.addHistory({
      id: randomToken(),
      userId: auth.id,
      query: q,
      resultado: result.resultados.map((r) => r.tipo),
      timestamp: nowISO()
    });

    return sendJSON(res, 200, { ok: true, ...result });
  }

  // ---- Histórico (requer autenticação) ----
  if (pathname === '/api/history' && method === 'GET') {
    const auth = await getAuthUser(req);
    if (!auth) return sendJSON(res, 401, { ok: false, erro: 'Faça login para ver o histórico.' });

    const history = await db.getHistoryForUser(auth.id, 50);
    return sendJSON(res, 200, { ok: true, history });
  }

  // ---- Sessão / perfil ----
  if (pathname === '/api/me' && method === 'GET') {
    const auth = await getAuthUser(req);
    if (!auth) return sendJSON(res, 401, { ok: false, erro: 'Não autenticado.' });
    return sendJSON(res, 200, { ok: true, user: publicUser(auth) });
  }

  return sendJSON(res, 404, { ok: false, erro: 'Rota não encontrada.' });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method.toUpperCase();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, pathname, method);
    } catch (e) {
      console.error('Erro API:', e);
      sendJSON(res, 500, { ok: false, erro: 'Erro interno do servidor.' });
    }
    return;
  }

  serveStatic(req, res, pathname);
});

(async () => {
  await db.init();
  server.listen(PORT, HOST, () => {
    console.log('');
    console.log('====================================================');
    console.log('  J2C Inovações — Assessoria em Alvarás e Licenças');
    console.log('  A correr em: http://' + HOST + ':' + PORT);
    console.log('  Armazenamento: ' + (db.isMongo() ? 'MongoDB Atlas' : 'JSON local'));
    console.log('====================================================');
    console.log('');
  });
})();
