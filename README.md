# Calculadora de Odds Justas — Tênis

Aplicação didática que busca partidas ATP e WTA com odds da Bet365, remove
matematicamente a margem da casa e apresenta as probabilidades normalizadas.
Ela não prevê resultados nem recomenda apostas.

## Executar localmente

1. Instale Node.js 18 ou superior.
2. Copie `.env.example` para `.env`.
3. Coloque a chave da Odds-API.io em `ODDS_API_KEY`.
4. Execute `npm start`.
5. Abra `http://localhost:3000`.

## Preparação para hospedagem

O servidor aceita as variáveis abaixo:

- `ODDS_API_KEY`: obrigatória e secreta.
- `PORT`: porta escolhida pela hospedagem; o padrão local é `3000`.
- `HOST`: endereço de escuta; o padrão é `0.0.0.0`.

Na hospedagem, configure `ODDS_API_KEY` no painel de variáveis secretas. Nunca
envie o arquivo `.env` para GitHub ou para o servidor. Ele já está protegido
pelo `.gitignore`.

A plataforma pode verificar a aplicação pela rota `GET /api/health`, que
responde `{ "status": "ok" }` sem consultar a API externa.

## Uso da API

A lista de eventos e odds fica em cache por dez minutos. As odds são buscadas
em lotes de até dez eventos para reduzir o consumo do plano gratuito. Partidas
sem as duas odds do mercado vencedor são removidas antes de chegar ao navegador.

## Próxima etapa planejada

Adicionar a Superbet como fonte separada. As odds de casas diferentes nunca
devem ser misturadas no mesmo cálculo de margem.
