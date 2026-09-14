document.addEventListener('DOMContentLoaded', () => {
  verificarSessao();
  configurarModals();
  configurarPesquisa();
});

function preencherPergunta(texto) {
  const input = document.getElementById('search-input');
  if (input) {
    input.value = texto;
    document.getElementById('pesquisa').scrollIntoView({ behavior: 'smooth' });
  }
}

async function verificarSessao() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    if (data.autenticado) {
      document.getElementById('btn-login').hidden = true;
      document.getElementById('btn-register').hidden = true;
      document.getElementById('btn-logout').hidden = false;
      document.getElementById('nav-historico').hidden = false;
      carregarHistorico();
    }
  } catch (e) {
    console.error('Erro ao verificar sessão:', e);
  }
}

function configurarModals() {
  const modal = document.getElementById('auth-modal');
  const btnLogin = document.getElementById('btn-login');
  const btnRegister = document.getElementById('btn-register');
  const btnLogout = document.getElementById('btn-logout');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  btnLogin.onclick = () => { modal.hidden = false; tabLogin.click(); };
  btnRegister.onclick = () => { modal.hidden = false; tabRegister.click(); };

  document.querySelectorAll('[data-close]').forEach(el => {
    el.onclick = () => modal.hidden = true;
  });

  tabLogin.onclick = () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.hidden = false;
    registerForm.hidden = true;
  };

  tabRegister.onclick = () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.hidden = false;
    loginForm.hidden = true;
  };

  btnLogout.onclick = async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.reload();
  };

  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const senha = document.getElementById('login-senha').value;
    const errBox = document.getElementById('login-error');

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });
    const data = await res.json();
    if (data.sucesso) {
      window.location.reload();
    } else {
      errBox.textContent = data.erro;
      errBox.hidden = false;
    }
  };

  registerForm.onsubmit = async (e) => {
    e.preventDefault();
    const nome = document.getElementById('reg-nome').value;
    const email = document.getElementById('reg-email').value;
    const telefone = document.getElementById('reg-telefone').value;
    const senha = document.getElementById('reg-senha').value;
    const errBox = document.getElementById('register-error');

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, telefone, senha })
    });
    const data = await res.json();
    if (data.sucesso) {
      window.location.reload();
    } else {
      errBox.textContent = data.erro;
      errBox.hidden = false;
    }
  };
}

function configurarPesquisa() {
  const form = document.getElementById('search-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const pergunta = document.getElementById('search-input').value;
    const loading = document.getElementById('loading');
    const loadingStep = document.getElementById('loading-step');
    const results = document.getElementById('results');
    const errorBox = document.getElementById('error-box');

    errorBox.hidden = true;
    results.hidden = true;
    loading.hidden = false;

    // Sequência de estados de carregamento (Requisito 22)
    setTimeout(() => { loadingStep.textContent = "🌐 A consultar fontes oficiais de Angola (.gov.ao)..."; }, 2500);
    setTimeout(() => { loadingStep.textContent = "📄 A analisar legislação e documentos..."; }, 5500);
    setTimeout(() => { loadingStep.textContent = "✓ A preparar a resposta estruturada..."; }, 8500);

    try {
      const res = await fetch('/api/perguntar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta })
      });

      const data = await res.json();
      loading.hidden = true;

      if (!res.ok) {
        if (res.status === 401) {
          document.getElementById('btn-login').click();
          return;
        }
        throw new Error(data.erro || 'Erro ao processar consulta.');
      }

      if (data.foraDoAmbito) {
        errorBox.textContent = data.resposta;
        errorBox.hidden = false;
        return;
      }

      // Preencher resultados estruturados
      const r = data.resultado;
      document.getElementById('res-title').textContent = `Resultado para: "${pergunta}"`;
      document.getElementById('res-text').textContent = r.textoExplicativo;
      
      const reqList = document.getElementById('res-requisitos');
      reqList.innerHTML = '';
      r.oQuePrecisa.forEach(req => {
        const li = document.createElement('li');
        li.textContent = req;
        reqList.appendChild(li);
      });

      document.getElementById('res-entidade').textContent = r.entidadeResponsavel;
      document.getElementById('res-local').textContent = r.ondeTratar;
      document.getElementById('res-contacto').textContent = r.contactos;
      document.getElementById('res-prazo').textContent = r.prazo;
      document.getElementById('res-taxas').textContent = r.custosTaxas;
      document.getElementById('res-base').textContent = r.baseLegal;

      const fontesDiv = document.getElementById('res-fontes');
      fontesDiv.innerHTML = '';
      r.fontes.forEach(f => {
        const a = document.createElement('a');
        a.href = f.url;
        a.textContent = `${f.nome} (${f.dataConsulta})`;
        a.target = '_blank';
        a.style.cssText = 'background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; text-decoration: none;';
        fontesDiv.appendChild(a);
      });

      results.hidden = false;
      carregarHistorico();
    } catch (err) {
      loading.hidden = true;
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    }
  };
}

async function carregarHistorico() {
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    if (data.sucesso) {
      const list = document.getElementById('history-list');
      list.innerHTML = '';
      data.history.forEach(item => {
        const div = document.createElement('div');
        div.style.cssText = 'background: #fff; padding: 16px; margin-bottom: 12px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);';
        div.innerHTML = `
          <p style="font-weight: bold; color: #1e3a8a;">${item.pergunta}</p>
          <p style="font-size: 0.85rem; color: #6b7280; margin-top: 4px;">Data: ${new Date(item.createdAt).toLocaleString()}</p>
        `;
        list.appendChild(div);
      });
      document.getElementById('historico').hidden = false;
    }
  } catch (e) {
    console.error('Erro ao carregar histórico:', e);
  }
}
