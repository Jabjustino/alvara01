# Publicar o app online (MongoDB Atlas + Render)

Este guia explica como colocar o aplicativo J2C Inovações acessível na internet,
usando **MongoDB Atlas** (base de dados grátis) e **Render** (hosting grátis).

## 1. Criar a base de dados no MongoDB Atlas (grátis)

1. Vai a <https://www.mongodb.com/cloud/atlas/register> e cria uma conta grátis.
2. Cria um **cluster grátis (M0)** — escolhe o fornecedor e a região mais próximos
   (ex.: AWS, região `eu-west` ou `af-south`).
3. No menu **Database Access**, cria um utilizador de base de dados:
   - Username: `j2c`
   - Password: escolhe uma senha forte (guarda-a).
   - Role: `Read and write to any database`.
4. No menu **Network Access**, clica **Add IP Address** → **Allow access from anywhere**
   (botão `0.0.0.0/0`). Isto é necessário para o Render conseguir ligar.
5. No cluster, clica **Connect** → **Drivers** e copia a **connection string**.
   Tem este formato:

   ```
   mongodb+srv://j2c:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

   Substitui `<password>` pela senha que definiste no passo 3.

## 2. Subir o código para o GitHub

1. Cria um repositório no GitHub (público ou privado).
2. Faz upload dos ficheiros do projeto (ou usa `git push`). Garante que estão incluídos:
   - `server.js`, `db.js`, `package.json`, `render.yaml`
   - pasta `public/` e pasta `data/` (com `knowledge.json`)

## 3. Publicar no Render

1. Vai a <https://render.com> e cria uma conta (podes entrar com GitHub).
2. Clica **New +** → **Web Service**.
3. Conecta o repositório do GitHub que criaste.
4. O Render deteta o `render.yaml` automaticamente. Se não, configura manualmente:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
5. Nas **Environment Variables**, adiciona:
   - `MONGODB_URI` → cola a connection string do Atlas (passo 1.5).
   - `SESSION_SECRET` → qualquer texto aleatório (ex.: `j2c-2026-secret`).
6. Clica **Create Web Service** e aguarda o deploy (1–3 minutos).

## 4. Aceder ao app

No final, o Render mostra um URL público, por exemplo:

```
https://j2c-alvaras.onrender.com
```

Esse é o endereço que podes partilhar com os empresários.

> **Nota (plano grátis):** o Render "adormece" o serviço após ~15 minutos sem uso.
> O primeiro acesso depois disso pode demorar 30–60 segundos a reagir. Para evitar
> isso, podes usar o plano pago (a partir de ~7 USD/mês).

## Variáveis de ambiente (resumo)

| Variável        | Obrigatória? | Descrição                                        |
|-----------------|--------------|--------------------------------------------------|
| `MONGODB_URI`   | Recomendada  | Connection string do MongoDB Atlas               |
| `SESSION_SECRET`| Recomendada  | Segredo para assinar os tokens de sessão         |
| `PORT`          | Não          | O Render define automaticamente                  |
| `HOST`          | Não          | Predefinido: `0.0.0.0`                           |

Sem `MONGODB_URI`, o app usa ficheiros JSON locais (útil para testar no teu PC,
mas **não recomendado em produção**, pois os dados perdem-se em cada reinício).

## Testar localmente com MongoDB

```bash
# Windows (PowerShell)
$env:MONGODB_URI = "mongodb+srv://j2c:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"
$env:SESSION_SECRET = "j2c-2026-secret"
npm install
node server.js
```

No arranque deve aparecer: `✔ Ligado ao MongoDB Atlas.`
