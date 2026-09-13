'use strict';

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const state = {
  token: localStorage.getItem('j2c_token') || null,
  user: JSON.parse(localStorage.getItem('j2c_user') || 'null')
};

// ---------------------------------------------------------------------------
// Elementos
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const els = {
  btnLogin: $('btn-login'),
  btnRegister: $('btn-register'),
  btnLogout: $('btn-logout'),
  userChip: $('user-chip'),
  navHistorico: $('nav-historico'),
  historicoSection: $('historico'),

  authModal: $('auth-modal'),
  tabLogin: $('tab-login'),
  tabRegister: $('tab-register'),
  loginForm: $('login-form'),
  registerForm: $('register-form'),
  loginError: $('login-error'),
  registerError: $('register-error'),

  searchForm: $('search-form'),
  searchInput: $('search-input'),
  searchBtn: $('search-btn'),
  loading: $('loading'),
  errorBox: $('error-box'),
  results: $('results'),
  historyList: $('history-list')
};

// ---------------------------------------------------------------------------
// Autenticação / UI
// ---------------------------------------------------------------------------
function updateAuthUI() {
  const logged = !!state.token;
  els.btnLogin.hidden = logged;
  els.btnRegister.hidden = logged;
  els.btnLogout.hidden = !logged;
  els.userChip.hidden = !logged;
  els.navHistorico.hidden = !logged;
  els.historicoSection.hidden = !logged;

  if (logged && state.user) {
    els.userChip.textContent = 'Olá, ' + state.user.nome.split(' ')[0];
  }
}

function openModal(tab) {
  els.authModal.hidden = false;
  switchTab(tab || 'login');
}

function closeModal() {
  els.authModal.hidden = true;
  els.loginError.hidden = true;
  els.registerError.hidden = true;
}

function switchTab(tab) {
  const isLogin = tab === 'login';
  els.tabLogin.classList.toggle('active', isLogin);
  els.tabRegister.classList.toggle('active', !isLogin);
  els.loginForm.hidden = !isLogin;
  els.registerForm.hidden = isLogin;
  els.loginError.hidden = true;
  els.registerError.hidden = true;
}

function showError(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}

// ---------------------------------------------------------------------------
// Chamadas à API
// ---------------------------------------------------------------------------
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({ ok: false, erro: 'Resposta inválida.' }));
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
// Registo
// ---------------------------------------------------------------------------
els.registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.registerError.hidden = true;

  const payload = {
    nome: $('reg-nome').value.trim(),
    email: $('reg-email').value.trim(),
    telefone: $('reg-telefone').value.trim(),
    senha: $('reg-senha').value
  };

  const { status, data } = await api('/api/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (!data.ok) {
    showError(els.registerError, data.erro || 'Erro ao registar.');
    return;
  }

  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('j2c_token', state.token);
  localStorage.setItem('j2c_user', JSON.stringify(state.user));

  closeModal();
  updateAuthUI();
  $('search-input').focus();
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
els.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.loginError.hidden = true;

  const payload = {
    email: $('login-email').value.trim(),
    senha: $('login-senha').value
  };

  const { status, data } = await api('/api/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (!data.ok) {
    showError(els.loginError, data.erro || 'Erro ao entrar.');
    return;
  }

  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('j2c_token', state.token);
  localStorage.setItem('j2c_user', JSON.stringify(state.user));

  closeModal();
  updateAuthUI();
  $('search-input').focus();
});

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------
els.btnLogout.addEventListener('click', () => {
  state.token = null;
  state.user = null;
  localStorage.removeItem('j2c_token');
  localStorage.removeItem('j2c_user');
  els.results.hidden = true;
  updateAuthUI();
});

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
els.btnLogin.addEventListener('click', () => openModal('login'));
els.btnRegister.addEventListener('click', () => openModal('register'));
els.tabLogin.addEventListener('click', () => switchTab('login'));
els.tabRegister.addEventListener('click', () => switchTab('register'));
document.querySelectorAll('[data-close]').forEach((el) => {
  el.addEventListener('click', closeModal);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// ---------------------------------------------------------------------------
// Pesquisa
// ---------------------------------------------------------------------------
els.searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!state.token) {
    openModal('login');
    return;
  }

  const q = els.searchInput.value.trim();
  if (!q) return;

  els.searchBtn.disabled = true;
  els.loading.hidden = false;
  els.errorBox.hidden = true;
  els.results.hidden = true;

  const started = Date.now();

  try {
    const { status, data } = await api('/api/search?q=' + encodeURIComponent(q));

    els.loading.hidden = false;
    const elapsed = Date.now() - started;

    if (!data.ok) {
      if (status === 401) {
        state.token = null;
        state.user = null;
        localStorage.removeItem('j2c_token');
        localStorage.removeItem('j2c_user');
        updateAuthUI();
        openModal('login');
        return;
      }
      showError(els.errorBox, data.erro || 'Erro na pesquisa.');
      return;
    }

    renderResults(data, elapsed);
  } catch (err) {
    showError(els.errorBox, 'Não foi possível contactar o servidor. Verifique a ligação.');
  } finally {
    els.loading.hidden = true;
    els.searchBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Renderização dos resultados
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderResults(data, elapsedMs) {
  const resultados = data.resultados || [];
  const fontes = data.fontes || [];

  let html = '';

  html += '<div class="results-heading">Resultado para: “' + escapeHtml(data.query) + '” ' +
    '<span style="font-weight:400;color:#5b6b85;font-size:13px">(' + (elapsedMs / 1000).toFixed(1) + 's)</span></div>';

  resultados.forEach((r) => {
    html += '<div class="result-card">';
    html += '<div class="result-card-header">';
    html += '<h3>' + escapeHtml(r.tipo) + '</h3>';
    html += '<div class="orgao">Órgão emissor: ' + escapeHtml(r.orgao) + '</div>';
    html += '</div>';

    html += '<table class="result-table">';
    html += '<tr><th>Órgão que emite</th><td>' + escapeHtml(r.orgao) + '</td></tr>';
    html += '<tr><th>Requisitos</th><td><ul>';
    (r.requisitos || []).forEach((req) => { html += '<li>' + escapeHtml(req) + '</li>'; });
    html += '</ul></td></tr>';
    html += '<tr><th>Prazo de emissão</th><td>' + escapeHtml(r.prazo) + '</td></tr>';
    html += '<tr><th>Contacto</th><td>' + escapeHtml(r.contacto) + '</td></tr>';
    html += '<tr><th>Localização</th><td>' + escapeHtml(r.localizacao) + '</td></tr>';
    html += '</table>';
    html += '</div>';
  });

  if (fontes.length > 0) {
    html += '<div class="sources">';
    html += '<div class="sources-title">Fontes da pesquisa na web</div>';
    fontes.forEach((f) => {
      html += '<a class="source-item" href="' + escapeHtml(f.url) + '" target="_blank" rel="noopener noreferrer">';
      html += '<div class="src-title">' + escapeHtml(f.titulo) + '</div>';
      html += '<div class="src-url">' + escapeHtml(f.url) + '</div>';
      if (f.snippet) html += '<div class="src-snippet">' + escapeHtml(f.snippet) + '</div>';
      html += '</a>';
    });
    html += '</div>';
  }

  if (data.nota) {
    html += '<div class="nota">' + escapeHtml(data.nota) + '</div>';
  }

  els.results.innerHTML = html;
  els.results.hidden = false;
  els.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------
async function loadHistory() {
  if (!state.token) return;
  const { data } = await api('/api/history');
  if (!data.ok) return;

  const list = data.history || [];
  if (list.length === 0) {
    els.historyList.innerHTML = '<div class="history-empty">Ainda não tem pesquisas registadas.</div>';
    return;
  }

  els.historyList.innerHTML = list.map((h) => {
    const date = new Date(h.timestamp).toLocaleString('pt-PT');
    return '<div class="history-item">' +
      '<div><div class="h-query">' + escapeHtml(h.query) + '</div>' +
      '<div class="h-result">' + escapeHtml((h.resultado || []).join(', ')) + '</div></div>' +
      '<div class="h-date">' + escapeHtml(date) + '</div>' +
      '</div>';
  }).join('');
}

els.navHistorico.addEventListener('click', () => {
  loadHistory();
});

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
updateAuthUI();
if (state.token) {
  // validar sessão
  api('/api/me').then(({ data }) => {
    if (!data.ok) {
      state.token = null;
      state.user = null;
      localStorage.removeItem('j2c_token');
      localStorage.removeItem('j2c_user');
      updateAuthUI();
    }
  });
}
