# J2C Inovações — Assessoria em Alvarás e Licenças

Aplicativo web que ajuda empresários a descobrir, em segundos, qual **alvará ou licença**
precisam para exercer uma determinada **actividade económica em Angola**.

## Funcionalidades

- **Registo / login** com nome, email e telefone (obrigatório para aceder aos resultados).
- **Barra de pesquisa** de actividades económicas (ex.: "restaurante", "farmácia", "transporte").
- **Pesquisa na web** (DuckDuckGo) combinada com uma **base de conhecimento** J2C.
- **Resultado em tabela** com:
  - Tipo de alvará / licença
  - Órgão que emite
  - Lista de requisitos
  - Prazo de emissão
  - Contacto
  - Localização
- **Histórico de utilização** por utilizador.

## Requisitos

- Node.js 14 ou superior.
- (Opcional) **MongoDB Atlas** para armazenamento persistente — sem ele, o app usa ficheiros JSON locais.

## Como executar localmente

```bash
npm install
node server.js
```

Depois abra no navegador: **http://127.0.0.1:3000**

## Publicar online

Para colocar o app acessível na internet (MongoDB Atlas + Render), segue o guia em
**[DEPLOY.md](DEPLOY.md)**.

## Estrutura

```
queen 38/
├── server.js            # Servidor HTTP + API
├── db.js                # Armazenamento (MongoDB Atlas ou JSON local)
├── package.json
├── render.yaml          # Config de deploy no Render
├── DEPLOY.md            # Guia de publicação online
├── data/
│   ├── knowledge.json   # Base de conhecimento de alvarás
│   ├── users.json       # Utilizadores (JSON local, gerado automaticamente)
│   └── history.json     # Histórico (JSON local, gerado automaticamente)
└── public/
    ├── index.html       # Interface
    ├── styles.css       # Estilos
    └── app.js           # Lógica do frontend
```

## API

| Método | Rota             | Descrição                          |
|--------|------------------|------------------------------------|
| POST   | `/api/register`  | Criar conta (nome, email, telefone, senha) |
| POST   | `/api/login`     | Entrar (email, senha)              |
| GET    | `/api/search?q=` | Pesquisar alvará (requer token)    |
| GET    | `/api/history`   | Histórico do utilizador            |
| GET    | `/api/me`        | Dados da sessão                    |

## Variáveis de ambiente

| Variável        | Descrição                                        |
|-----------------|--------------------------------------------------|
| `MONGODB_URI`   | Connection string do MongoDB Atlas               |
| `SESSION_SECRET`| Segredo para assinar os tokens de sessão         |
| `PORT`          | Porta (predefinido: 3000)                        |
| `HOST`          | Interface (predefinido: 0.0.0.0)                 |

## Nota

A informação apresentada é **orientativa**. Para confirmação oficial e acompanhamento
do processo, a J2C Inovações está disponível para assessoria.
