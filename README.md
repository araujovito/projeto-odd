# Odd Clara — Odds Justas de Tênis e Futebol

Aplicação didática que busca partidas de tênis (ATP e WTA) e futebol com odds da Bet365, apresenta
todos os mercados recebidos e remove matematicamente a margem quando a API
fornece um conjunto completo de resultados mutuamente exclusivos.
Ela não prevê resultados nem recomenda apostas.

## Recursos da interface

- Abas de tênis e futebol, com cache independente para cada esporte.
- Filtros ATP, WTA, data, pesquisa e partidas favoritas.
- Mercado principal 1X2 do futebol com casa, empate e visitante.
- Estrutura preparada para manter Bet365 e Superbet separadas por evento.
- Comparador do mercado principal com odds e margens da Bet365 e Superbet lado a lado.
- Destaque da melhor odd por resultado e filtro para partidas presentes nas duas casas.
- Detector de arbitragem para mercados principais de dois resultados e futebol 1X2.
- Simulador que distribui um valor total e mostra o retorno de cada cenário.
- Favoritos guardados localmente no navegador, sem login ou banco de dados.
- Partidas selecionadas ou favoritas permanecem visíveis por até seis horas após o início previsto, mesmo quando saem da API.
- Central `Minhas partidas`, botão explícito para acompanhar e links compartilháveis por evento.
- Anotações pessoais e linha do tempo formada somente por cotações realmente observadas.
- Odds principais e margem já visíveis nos cartões das partidas.
- Mercados separados por categoria e apresentados em tabelas comparativas.
- Gráfico da movimentação das odds do mercado vencedor na Bet365.
- Radar persistente com as maiores movimentações dos históricos consultados.
- Comparações entre abertura e cotação atual e entre dois momentos escolhidos.
- Filtros por tipo de partida, faixa de margem, histórico, link e ordenação.
- Classificação matemática de margem baixa, moderada ou alta.
- Indicadores de atualização, consumo da API e explicação didática do cálculo.
- Controle de banca sem cadastro, salvo somente no `localStorage`, com saldo, lucro, ROI e resultados parciais.
- Botão nas odds para preencher automaticamente o registro manual da banca, sem realizar apostas.
- Registro rápido de uma odd como aposta pendente, pedindo apenas o valor e confirmação.
- Painel de desempenho local com evolução acumulada e ROI por esporte e casa.
- Edição e exclusão de apostas manuais, além de backup e restauração em JSON.
- Alertas de alta, queda e desatualização enquanto a página estiver aberta.
- Calculadoras de probabilidade implícita, conversão, retorno, Kelly, arbitragem, hedge e odds sem margem.
- Layout responsivo para computador e celular.
- Tema claro/escuro, modo educativo e compartilhamento pela API nativa do navegador.
- PWA instalável no celular, com interface básica disponível offline; odds continuam dependendo da conexão e da API.

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

A lista de eventos e odds fica em cache por dez minutos, separadamente por esporte.
As odds são buscadas em lotes de até dez eventos para reduzir o consumo do plano gratuito.
No tênis, o evento precisa das duas odds do vencedor; no futebol, precisa das três
odds do 1X2: casa, empate e visitante.

As duas casas são solicitadas no mesmo lote de eventos para economizar a cota. Cada
casa possui resultados, margem, mercados, horário de atualização e link próprios.
Os campos antigos da resposta continuam representando somente a Bet365 enquanto o
restante da interface usa essa casa como referência, preservando a compatibilidade.
O comparador usa somente o mercado principal completo de cada casa e informa quando
a Superbet não possui odds suficientes, sem completar dados artificialmente.

Quando uma partida acompanhada desaparece da consulta (por exemplo, ao iniciar),
o navegador conserva localmente a última resposta por até seis horas depois do
horário previsto. Ela aparece como `Cotação arquivada`: os dados continuam
disponíveis para consulta e movimentação, mas os botões de registro e a análise de
arbitragem ficam desativados, pois aquelas odds podem não estar mais disponíveis.
Isso não transforma o site em placar ao vivo e não cria odds artificiais.

O botão de compartilhamento inclui o confronto, a margem e um link com o identificador
do evento. Quem abrir o link ainda depende de a partida existir na resposta atual ou
de possuir uma cópia local acompanhada. Anotações nunca entram no texto compartilhado.

O detector escolhe a melhor odd disponível para cada resultado e soma suas
probabilidades implícitas. Só existe arbitragem matemática quando essa soma é menor
que 100%. Nessa situação, o simulador divide o valor entre os resultados e mostra
os retornos após o ajuste de centavos. As odds podem mudar antes da execução de todas
as apostas, portanto o site não promete que a oportunidade continuará disponível.

Mercados com pares completos, como vencedor, handicap e acima/abaixo, recebem
odd justa, probabilidade justa e margem por linha. Seleções isoladas continuam
visíveis, mas não são normalizadas, pois isso produziria uma probabilidade
matematicamente enganosa.

O histórico de movimentações é buscado somente quando o usuário solicita e
fica cinco minutos em cache. Quando a API ainda não possui mudanças para uma
partida, o gráfico mostra apenas a cotação atual, sem criar dados artificiais.

Além do histórico fornecido pela API, cada atualização normal da lista salva no
`localStorage` um snapshot real das odds de tênis da Bet365. Assim, o mesmo
navegador passa a comparar os momentos observados sem fazer chamadas extras.
Recarregamentos com menos de dez minutos não criam pontos repetidos; cada evento
mantém no máximo 60 snapshots. Esse histórico é local e não acompanha o usuário
em outro aparelho ou depois que os dados do navegador forem apagados.

## Dados locais e alertas

O controle de banca não cria conta e não envia registros ao servidor. O saldo é a
banca inicial somada ao lucro ou prejuízo dos registros; o ROI usa o resultado
líquido dividido pelo total apostado em registros já liquidados. Apostas pendentes
não entram nessa base. Como o navegador pode apagar o `localStorage`, a interface
oferece exportação e importação de backup em JSON.

O gráfico da banca considera apenas registros liquidados e soma seus resultados na
ordem das datas. As divisões por esporte e casa descrevem o histórico cadastrado pelo
usuário; não são previsões e não garantem resultados futuros.

## Instalação no celular

O projeto possui `manifest.webmanifest` e `service-worker.js`. Em navegadores
compatíveis, use a opção **Adicionar à tela inicial** ou **Instalar aplicativo**.
O service worker guarda apenas a interface. Partidas, odds e atualizações exigem
internet, pois os endpoints da API não são armazenados para uso offline.

Os alertas ficam desligados por padrão, funcionam somente com a página aberta e
respeitam um intervalo mínimo de dez minutos. Quando a aba fica oculta, nenhuma
consulta automática é feita. O cache do servidor continua evitando chamadas
repetidas à Odds-API.io dentro da janela configurada.
