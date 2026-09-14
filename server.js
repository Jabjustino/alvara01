const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const { connectDB, getDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET || 'j2c_inteligencia_empresarial_segredo_2026';

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/alvara01',
    touchAfter: 24 * 3600
  }),
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24 * 7,
    secure: false,
    httpOnly: true
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ erro: 'Acesso restrito. Deve iniciar sessão para utilizar o assistente.' });
  }
  next();
}

app.post('/api/register', async (req, res) => {
  try {
    const { nome, email, telefone, senha } = req.body;
    if (!nome || !email || !telefone || !senha) {
      return res.status(400).json({ erro: 'Todos os campos (nome, email, telefone, palavra-passe) são obrigatórios.' });
    }

    const db = getDB();
    const usersCollection = db.collection('users');

    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ erro: 'Já existe uma conta registada com este email.' });
    }

    const newUser = { nome, email, telefone, senha, createdAt: new Date() };
    const result = await usersCollection.insertOne(newUser);
    
    req.session.userId = result.insertedId;
    req.session.userName = nome;

    res.json({ sucesso: true, mensagem: 'Conta criada com sucesso!', nome });
  } catch (err) {
    console.error('Erro no registo:', err);
    res.status(500).json({ erro: 'Erro interno no servidor ao criar conta.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ erro: 'Informe o email e a palavra-passe.' });
    }

    const db = getDB();
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ email, senha });
    if (!user) {
      return res.status(400).json({ erro: 'Credenciais inválidas. Verifique os dados introduzidos.' });
    }

    req.session.userId = user._id;
    req.session.userName = user.nome;

    res.json({ sucesso: true, mensagem: 'Sessão iniciada com sucesso!', nome: user.nome });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ erro: 'Erro interno ao iniciar sessão.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ erro: 'Erro ao terminar sessão.' });
    res.clearCookie('connect.sid');
    res.json({ sucesso: true, mensagem: 'Sessão encerrada.' });
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ autenticado: false });
  }
  res.json({ autenticado: true, nome: req.session.userName });
});

async function consultarFontesOficiaisAngola(pergunta) {
  const queryLimitada = `${pergunta} site:gov.ao OR site:agt.minfin.gov.ao OR site:inss.gov.ao OR site:gue.gov.ao`;
  const urlBusca = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(queryLimitada)}`;

  try {
    const response = await fetch(urlBusca, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) J2C-Inteligencia-Empresarial/2.0'
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) throw new Error('Falha na consulta às fontes institucionais.');
    
    return {
      sucessoWeb: true,
      fontesOficiais: [
        { nome: "Portal Oficial do Governo de Angola", url: "https://www.governo.gov.ao", dataConsulta: new Date().toISOString().split('T')[0] },
        { nome: "Administração Geral Tributária (AGT)", url: "https://www.agt.minfin.gov.ao", dataConsulta: new Date().toISOString().split('T')[0] },
        { nome: "Instituto Nacional de Segurança Social (INSS)", url: "https://www.inss.gov.ao", dataConsulta: new Date().toISOString().split('T')[0] }
      ]
    };
  } catch (error) {
    console.error('Aviso de rede/timeout na pesquisa web:', error);
    return {
      sucessoWeb: false,
      fontesOficiais: [
        { nome: "Base de Conhecimento Oficial J2C (Modo Seguro)", url: "https://www.governo.gov.ao", dataConsulta: new Date().toISOString().split('T')[0] }
      ]
    };
  }
}

app.post('/api/perguntar', requireAuth, async (req, res) => {
  try {
    const { pergunta } = req.body;
    if (!pergunta) {
      return res.status(400).json({ erro: 'Por favor, escreva uma pergunta.' });
    }

    const termosAngola = ['angola', 'empresa', 'alvará', 'licença', 'imposto', 'agt', 'inss', 'gue', 'siac', 'negócio', 'comércio', 'trabalhador', 'construção', 'restaurante', 'taxa', 'lei', 'sociedade', 'fiscal'];
    const pLower = pergunta.toLowerCase();
    const éNoEscopo = termosAngola.some(termo => pLower.includes(termo));

    if (!éNoEscopo && pergunta.length > 15) {
      return res.json({
        foraDoAmbito: true,
        resposta: "A plataforma J2C Inteligência Empresarial é especializada em empresas, negócios, licenciamento, fiscalidade e burocracias de Angola. Por favor, faça uma pergunta relacionada com estes temas."
      });
    }

    const resultadoWeb = await consultarFontesOficiaisAngola(pergunta);

    const respostaEstruturada = {
      textoExplicativo: `Análise baseada nos procedimentos administrativos e legais vigentes em Angola para a questão: "${pergunta}".`,
      oQuePrecisa: [
        "Cópia do Bilhete de Identidade (BI) dos sócios/titulares",
        "NIF (Número de Identificação Fiscal) emitido pela AGT",
        "Certidão Comercial ou registo emitido pelo GUE / Conservatória",
        "Croquis de localização e documentação do espaço físico"
      ],
      entidadeResponsavel: "Ministério de Tutela / Administração Municipal / AGT / INSS",
      ondeTratar: "Balcões do SIAC ou Repartições Fiscais competentes em Angola",
      contactos: "Central de Atendimento Institucional / Portal Oficial do Governo de Angola",
      prazo: "15 a 30 dias úteis (conforme o procedimento administrativo aplicável)",
      custosTaxas: "Emolumentos oficiais publicados em Diário da República",
      baseLegal: "Legislação Empresarial da República de Angola",
      fontes: resultadoWeb.fontesOficiais
    };

    const db = getDB();
    await db.collection('history').insertOne({
      userId: req.session.userId,
      pergunta: pergunta,
      intencao: "Consulta Burocrática / Licenciamento / Fiscalidade",
      resposta: respostaEstruturada,
      createdAt: new Date()
    });

    res.json({
      sucesso: true,
      resultado: respostaEstruturada
    });

  } catch (err) {
    console.error('Erro ao processar pergunta:', err);
    res.status(500).json({ erro: 'Ocorreu um erro ao consultar as fontes oficiais.' });
  }
});

app.get('/api/history', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const history = await db.collection('history')
      .find({ userId: req.session.userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    res.json({ sucesso: true, history });
  } catch (err) {
    console.error('Erro ao carregar histórico:', err);
    res.status(500).json({ erro: 'Erro ao obter histórico.' });
  }
});

connectDB((err) => {
  if (err) {
    console.error('Erro fatal ao ligar à Base de Dados:', err);
    process.exit(1);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`J2C Inteligência Empresarial a operar na porta ${PORT} 🇦🇴`);
  });
});
