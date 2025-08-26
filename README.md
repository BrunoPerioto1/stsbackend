<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

# Betting Tracker Backend

Backend NestJS para o sistema de rastreamento de apostas esportivas.

## 🚀 Funcionalidades

- **API RESTful** para gestão de apostas
- **Cálculo automático** de lucros baseado em resultados
- **Suporte a 9 tipos** de resultados diferentes
- **Validação de dados** com class-validator
- **CORS habilitado** para integração com frontend
- **Banco PostgreSQL** com TypeORM

## 🛠️ Tecnologias

- **Framework**: NestJS 11
- **Database**: PostgreSQL + TypeORM
- **Validation**: class-validator + class-transformer
- **HTTP Client**: Axios
- **Language**: TypeScript

## 📋 Pré-requisitos

- Node.js 18+
- PostgreSQL 12+
- npm ou yarn

## ⚙️ Instalação

1. **Clone o repositório**
   ```bash
   git clone <repository-url>
   cd meu-bot-telegram-1
   ```

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente**
   ```bash
   cp env.example .env
   ```
   
   Edite o arquivo `.env` com suas configurações:
   ```env
   DB_USER=postgres
   DB_HOST=localhost
   DB_NAME=betting_tracker
   DB_PASSWORD=sua_senha_aqui
   DB_PORT=5432
   PORT=3000
   NODE_ENV=development
   ```

4. **Configure o banco de dados**
   ```bash
   # Conecte ao PostgreSQL
   psql -U postgres
   
   # Crie o banco
   CREATE DATABASE betting_tracker;
   
   # Execute o schema
   \c betting_tracker
   \i database/schema.sql
   ```

5. **Inicie o servidor**
   ```bash
   npm run start:dev
   ```

## 🗄️ Estrutura do Banco

### Tabela `apostas`
- `id`: ID único da aposta
- `jogo`: Nome do jogo/evento
- `stake`: Valor apostado
- `odd`: Odd da aposta
- `casa`: Casa de apostas
- `mercado`: Tipo de mercado
- `esporte`: Esporte da aposta
- `data`: Data/hora da aposta

### Tabela `aposta_results`
- `id`: ID único do resultado
- `aposta_id`: Referência à aposta
- `result_id`: ID do resultado (enum)
- `created_at`: Data de criação
- `updated_at`: Data de atualização

## 🔌 API Endpoints

### Apostas

#### `GET /apostas`
Lista todas as apostas com lucros calculados.

**Response:**
```json
[
  {
    "id": 1,
    "jogo": "Flamengo x Vasco",
    "stake": 100.00,
    "odd": 2.50,
    "casa": "Bet365",
    "mercado": "Resultado Final",
    "esporte": "Futebol",
    "data": "2024-01-15T10:00:00Z",
    "result_id": 9,
    "lucro_calculado": 0.00
  }
]
```

#### `GET /apostas/:id`
Busca uma aposta específica por ID.

#### `POST /apostas`
Cria uma nova aposta.

**Request Body:**
```json
{
  "jogo": "Flamengo x Vasco",
  "stake": 100.00,
  "odd": 2.50,
  "casa": "Bet365",
  "mercado": "Resultado Final",
  "esporte": "Futebol"
}
```

#### `PUT /apostas/finalizar/:id`
Finaliza uma aposta individual.

**Request Body:**
```json
{
  "resultId": 1
}
```

#### `PUT /apostas/finalizar-multiplas`
Finaliza múltiplas apostas de uma vez.

**Request Body:**
```json
{
  "apostaIds": [1, 2, 3],
  "resultId": 1
}
```

## 📊 Tipos de Resultado

| ID | Nome | Descrição | Cálculo do Lucro |
|----|------|-----------|------------------|
| 1 | GANHOU | Aposta ganhadora | `stake * (odd - 1)` |
| 2 | PERDEU | Aposta perdedora | `-stake` |
| 3 | EMPATE | Resultado empatado | `0` |
| 4 | ANULADA | Aposta anulada | `0` |
| 5 | MEIO_GANHO | Meio ganho | `(stake/2) * (odd-1) - stake/2` |
| 6 | REEMBOLSADA | Aposta reembolsada | `0` |
| 7 | MEIO_GANHO_2 | Meio ganho (tipo 2) | `(stake/2) * (odd-1) - stake/2` |
| 8 | MEIO_PERDIDO | Meio perdido | `-stake/2` |
| 9 | PENDENTE | Aguardando resultado | `0` |

## 🚨 Troubleshooting

### Erro de Conexão com Banco
```bash
# Verifique se o PostgreSQL está rodando
sudo systemctl status postgresql

# Teste a conexão
psql -U postgres -h localhost -d betting_tracker
```

### Erro de CORS
O CORS já está habilitado no `main.ts`. Se ainda houver problemas, verifique se o frontend está acessando a URL correta.

### Erro de Validação
Verifique se todos os campos obrigatórios estão sendo enviados:
- `jogo`: string não vazia
- `stake`: número positivo
- `odd`: número maior que 1
- `casa`: string não vazia
- `mercado`: string não vazia
- `esporte`: string não vazia

## 📝 Scripts Disponíveis

```bash
npm run start          # Inicia o servidor
npm run start:dev      # Servidor com hot reload
npm run start:debug    # Servidor com debug
npm run start:prod     # Servidor de produção
npm run build          # Compila o projeto
npm run test           # Executa os testes
npm run test:e2e       # Testes end-to-end
npm run lint           # Linting do código
npm run format         # Formata o código
```

## 🔧 Configuração de Desenvolvimento

### Estrutura de Arquivos
```
src/
├── aposta/           # Módulo de apostas
│   ├── dto/         # Data Transfer Objects
│   ├── aposta.controller.ts
│   ├── aposta.service.ts
│   ├── aposta.module.ts
│   ├── db.ts        # Configuração do banco
│   └── result-id.enum.ts
├── telegram/         # Módulo do Telegram (futuro)
├── app.module.ts     # Módulo principal
└── main.ts          # Entry point
```

### Variáveis de Ambiente
- `DB_USER`: Usuário do PostgreSQL
- `DB_HOST`: Host do banco
- `DB_NAME`: Nome do banco
- `DB_PASSWORD`: Senha do banco
- `DB_PORT`: Porta do banco
- `PORT`: Porta da aplicação

## 🚀 Deploy

### Produção
```bash
npm run build
npm run start:prod
```

### Docker (futuro)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT.

## 🆘 Suporte

Para suporte ou dúvidas:
- Abra uma issue no GitHub
- Verifique os logs da aplicação
- Consulte a documentação da API
