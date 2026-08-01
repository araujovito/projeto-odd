# Odd Clara — Odds Justas de Tênis

Aplicação didática que busca partidas ATP e WTA com odds da Bet365, apresenta
todos os mercados recebidos e remove matematicamente a margem quando a API
fornece um conjunto completo de resultados mutuamente exclusivos.
Ela não prevê resultados nem recomenda apostas.

## Recursos da interface

- Filtros ATP, WTA, data, pesquisa e partidas favoritas.
- Favoritos guardados localmente no navegador, sem login ou banco de dados.
- Odds principais e margem já visíveis nos cartões das partidas.
- Mercados separados por categoria e apresentados em tabelas comparativas.
- Gráfico da movimentação das odds do mercado vencedor na Bet365.
- Indicadores de atualização, consumo da API e explicação didática do cálculo.
- Layout responsivo para computador e celular.

## Executar localmente

1. Instale Node.js 18 ou superior.
2. Copie `.env.example` para `.env`.
3. Coloque a chave da Odds-API.io em `ODDS_API_KEY`.
4. Execute `npm start`.
5. Abra `http://localhost:3000`.

Para executar os testes matemáticos:

```text
npm test
```

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

Mercados com pares completos, como vencedor, handicap e acima/abaixo, recebem
odd justa, probabilidade justa e margem por linha. Seleções isoladas continuam
visíveis, mas não são normalizadas, pois isso produziria uma probabilidade
matematicamente enganosa.

O histórico de movimentações é buscado somente quando o usuário solicita e
fica cinco minutos em cache. Quando a API ainda não possui mudanças para uma
partida, o gráfico mostra apenas a cotação atual, sem criar dados artificiais.

## Próxima etapa planejada

Adicionar a Superbet como fonte separada. As odds de casas diferentes nunca
devem ser misturadas no mesmo cálculo de margem.
