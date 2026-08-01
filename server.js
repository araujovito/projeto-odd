// Módulos nativos do Node.js: o projeto continua sem bibliotecas externas.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { calcularMercadoJusto, calcularArbitragem } = require("./calculos");

const CAMINHO_INDEX = path.join(__dirname, "index.html");
const CAMINHO_ENV = path.join(__dirname, ".env");
const ENDERECO_API = "https://api.odds-api.io/v3";
const TEMPO_CACHE = 10 * 60 * 1000; // Dez minutos, como recomendado pela API.
const TEMPO_CACHE_MOVIMENTOS = 5 * 60 * 1000;

/*
  Lê o arquivo .env sem instalar uma biblioteca. Em uma hospedagem real,
  as variáveis são configuradas no painel do provedor e o arquivo não é enviado.
*/
function carregarArquivoEnv() {
  if (!fs.existsSync(CAMINHO_ENV)) {
    return;
  }

  const linhas = fs.readFileSync(CAMINHO_ENV, "utf8").split(/\r?\n/);

  linhas.forEach(function (linha) {
    const linhaLimpa = linha.trim();

    if (linhaLimpa === "" || linhaLimpa.startsWith("#")) {
      return;
    }

    const posicaoIgual = linhaLimpa.indexOf("=");

    if (posicaoIgual === -1) {
      return;
    }

    const nome = linhaLimpa.slice(0, posicaoIgual).trim();
    const valor = linhaLimpa.slice(posicaoIgual + 1).trim();

    if (process.env[nome] === undefined) {
      process.env[nome] = valor;
    }
  });
}

carregarArquivoEnv();

// PORT e HOST permitem que plataformas de hospedagem escolham onde o servidor roda.
const PORTA = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// Cada esporte tem seu próprio cache. Trocar de aba não apaga nem mistura as listas.
const cachesPartidas = new Map();

const ESPORTES_DISPONIVEIS = {
  tennis: {
    codigo: "tennis",
    slugApi: "tennis",
    limiteEventos: 50
  },
  football: {
    codigo: "football",
    slugApi: "football",
    limiteEventos: 30
  }
};

// O código interno é estável; o nome é exatamente como a fornecedora identifica a casa.
const CASAS_APOSTAS = {
  bet365: { codigo: "bet365", nomeApi: "Bet365", nomeExibicao: "Bet365" },
  superbet: { codigo: "superbet", nomeApi: "Superbet", nomeExibicao: "Superbet" }
};

const NOMES_CASAS_API = Object.values(CASAS_APOSTAS)
  .map(function (casa) { return casa.nomeApi; })
  .join(",");

function obterConfiguracaoEsporte(codigo) {
  return ESPORTES_DISPONIVEIS[codigo] || null;
}

function obterCachePartidas(codigo) {
  if (!cachesPartidas.has(codigo)) {
    cachesPartidas.set(codigo, { criadoEm: 0, dados: null });
  }

  return cachesPartidas.get(codigo);
}

// Cada partida histórica fica cinco minutos em cache para proteger a cota da API.
const cacheMovimentacoes = new Map();

// Estes valores são atualizados pelos cabeçalhos de cada resposta da Odds-API.io.
let limiteApi = {
  limite: 100,
  restantes: null,
  reiniciaEm: null
};

function obterCabecalhosSeguranca() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; " +
      "connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  };
}

function enviarJson(resposta, codigo, dados) {
  resposta.writeHead(codigo, {
    ...obterCabecalhosSeguranca(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  resposta.end(JSON.stringify(dados));
}

function enviarHtml(resposta) {
  fs.readFile(CAMINHO_INDEX, function (erro, conteudo) {
    if (erro) {
      enviarJson(resposta, 500, { erro: "Não foi possível abrir a página." });
      return;
    }

    resposta.writeHead(200, {
      ...obterCabecalhosSeguranca(),
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache"
    });
    resposta.end(conteudo);
  });
}

function obterChaveApi() {
  const chave = process.env.ODDS_API_KEY;

  if (!chave) {
    const erro = new Error(
      "A chave da API ainda não foi configurada. Crie o arquivo .env antes de buscar partidas."
    );
    erro.codigoHttp = 503;
    throw erro;
  }

  return chave;
}

function atualizarLimiteApi(resposta) {
  const limite = Number(resposta.headers.get("x-ratelimit-limit"));
  const restantes = Number(resposta.headers.get("x-ratelimit-remaining"));
  const reiniciaEm = resposta.headers.get("x-ratelimit-reset");

  if (Number.isFinite(limite)) {
    limiteApi.limite = limite;
  }

  if (Number.isFinite(restantes)) {
    limiteApi.restantes = restantes;
  }

  if (reiniciaEm) {
    limiteApi.reiniciaEm = reiniciaEm;
  }
}

/*
  A chave é adicionada somente aqui, no servidor. Ela nunca faz parte das
  respostas enviadas ao navegador.
*/
async function consultarApi(caminho, parametros) {
  const url = new URL(ENDERECO_API + caminho);
  url.searchParams.set("apiKey", obterChaveApi());

  Object.entries(parametros).forEach(function ([nome, valor]) {
    url.searchParams.set(nome, valor);
  });

  const resposta = await fetch(url, {
    headers: { Accept: "application/json" }
  });

  atualizarLimiteApi(resposta);

  if (!resposta.ok) {
    let mensagem = "O fornecedor de odds respondeu com o erro " + resposta.status + ".";

    if (resposta.status === 401 || resposta.status === 403) {
      mensagem = "A chave da API foi recusada. Confira a configuração secreta.";
    }

    if (resposta.status === 429) {
      mensagem = "O limite gratuito de consultas foi atingido. Tente novamente mais tarde.";
    }

    const erro = new Error(mensagem);
    erro.codigoFornecedor = resposta.status;
    throw erro;
  }

  return resposta.json();
}

function encontrarValorSemDiferenciarMaiusculas(objeto, nomeProcurado) {
  if (!objeto || typeof objeto !== "object") {
    return null;
  }

  const chave = Object.keys(objeto).find(function (nome) {
    return nome.toLowerCase() === nomeProcurado.toLowerCase();
  });

  return chave ? objeto[chave] : null;
}

function encontrarMercadoVencedor(mercados) {
  if (!Array.isArray(mercados)) {
    return null;
  }

  const nomesAceitos = ["ml", "moneyline", "match winner", "h2h"];

  return mercados.find(function (mercado) {
    return nomesAceitos.includes(String(mercado.name).toLowerCase());
  });
}

function converterOdd(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 1 ? numero : null;
}

function formatarSinal(valor) {
  return valor > 0 ? "+" + valor : String(valor);
}

function traduzirNomeMercado(nomeOriginal, jogadorA, jogadorB, esporte) {
  const traducoes = {
    "ML": esporte === "football" ? "Resultado da partida (1X2)" : "Vencedor da partida",
    "Spread (Games)": "Handicap de games",
    "Totals (Games)": "Total de games na partida",
    "Totals 1st Set": "Total de games no 1º set",
    "Totals (Aces)": "Total de aces na partida",
    "Totals (Double Faults)": "Total de duplas faltas na partida",
    "Set Betting": "Placar correto em sets",
    "1st Set Winner": "Vencedor do 1º set",
    "Tiebreak in Match": "Haverá tie-break na partida",
    "Spread": "Handicap",
    "Totals": "Total de gols",
    "Both Teams To Score": "Ambas as equipes marcam",
    "Both Teams to Score": "Ambas as equipes marcam",
    "Draw No Bet": "Empate anula a aposta",
    "Double Chance": "Dupla chance",
    "1st Half ML": "Resultado do 1º tempo",
    "2nd Half ML": "Resultado do 2º tempo",
    "1st Half Totals": "Total de gols no 1º tempo",
    "2nd Half Totals": "Total de gols no 2º tempo",
    "Correct Score": "Placar correto",
    "Odd/Even": "Total de gols: ímpar ou par"
  };

  if (nomeOriginal === "Team Total (Aces) Home") {
    return "Total de aces — " + jogadorA;
  }

  if (nomeOriginal === "Team Total (Aces) Away") {
    return "Total de aces — " + jogadorB;
  }

  if (nomeOriginal === "Team Total (Double Faults) Home") {
    return "Total de duplas faltas — " + jogadorA;
  }

  if (nomeOriginal === "Team Total (Double Faults) Away") {
    return "Total de duplas faltas — " + jogadorB;
  }

  return traducoes[nomeOriginal] || nomeOriginal;
}

function criarResultado(nome, odd) {
  return {
    nome: nome,
    odd: odd,
    oddJusta: null,
    probabilidadeJusta: null
  };
}

/*
  Converte uma linha da API em um grupo de resultados. A normalização só é
  autorizada para pares ou conjuntos explicitamente complementares.
*/
function normalizarGrupo(entrada, jogadorA, jogadorB, indice) {
  if (!entrada || typeof entrada !== "object") {
    return null;
  }

  const linhaNumerica = Number(entrada.hdp);
  const temLinha = Number.isFinite(linhaNumerica);
  const home = converterOdd(entrada.home);
  const away = converterOdd(entrada.away);
  const draw = converterOdd(entrada.draw);
  const over = converterOdd(entrada.over);
  const under = converterOdd(entrada.under);
  const yes = converterOdd(entrada.yes);
  const no = converterOdd(entrada.no);
  const odd = converterOdd(entrada.odd);
  const even = converterOdd(entrada.even);
  let resultados = [];
  let conjuntoCompleto = false;

  if (home && away) {
    const nomeCasa = temLinha ? jogadorA + " (" + formatarSinal(linhaNumerica) + ")" : jogadorA;
    const nomeVisitante = temLinha
      ? jogadorB + " (" + formatarSinal(-linhaNumerica) + ")"
      : jogadorB;

    resultados = [criarResultado(nomeCasa, home)];

    if (draw) {
      resultados.push(criarResultado("Empate", draw));
    }

    resultados.push(criarResultado(nomeVisitante, away));
    conjuntoCompleto = true;
  } else if (over && under) {
    const linha = temLinha ? " " + linhaNumerica : "";
    resultados = [
      criarResultado("Mais de" + linha, over),
      criarResultado("Menos de" + linha, under)
    ];
    conjuntoCompleto = true;
  } else if (yes && no) {
    resultados = [criarResultado("Sim", yes), criarResultado("Não", no)];
    conjuntoCompleto = true;
  } else if (odd && even) {
    resultados = [criarResultado("Ímpar", odd), criarResultado("Par", even)];
    conjuntoCompleto = true;
  } else {
    // Algumas linhas trazem apenas um lado, por exemplo somente "acima".
    if (over) {
      resultados.push(criarResultado("Mais de" + (temLinha ? " " + linhaNumerica : ""), over));
    }

    if (under) {
      resultados.push(criarResultado("Menos de" + (temLinha ? " " + linhaNumerica : ""), under));
    }

    const oddRotulada = converterOdd(entrada.odds || entrada.price);
    if (oddRotulada) {
      resultados.push(criarResultado(entrada.label || entrada.name || "Seleção", oddRotulada));
    }

    // Preserva formatos novos ou raros da API sem inventar que são complementares.
    if (resultados.length === 0) {
      const camposTecnicos = new Set([
        "hdp", "max", "min", "line", "label", "name", "id", "updatedAt"
      ]);

      Object.entries(entrada).forEach(function ([nomeCampo, valor]) {
        if (camposTecnicos.has(nomeCampo)) {
          return;
        }

        const oddGenerica = converterOdd(valor);
        if (oddGenerica) {
          resultados.push(criarResultado(nomeCampo, oddGenerica));
        }
      });
    }
  }

  if (resultados.length === 0) {
    return null;
  }

  const grupo = {
    id: String(indice),
    linha: temLinha ? linhaNumerica : null,
    calculavel: conjuntoCompleto,
    margem: null,
    somaProbabilidadesJustas: null,
    resultados: resultados
  };

  if (conjuntoCompleto) {
    const calculo = calcularMercadoJusto(resultados.map(function (resultado) {
      return resultado.odd;
    }));

    grupo.margem = calculo.margem;
    grupo.somaProbabilidadesJustas = calculo.somaProbabilidadesJustas;
    grupo.resultados = resultados.map(function (resultado, posicao) {
      return {
        ...resultado,
        oddJusta: calculo.resultados[posicao].oddJusta,
        probabilidadeJusta: calculo.resultados[posicao].probabilidadeJusta
      };
    });
  }

  return grupo;
}

function normalizarMercados(mercados, jogadorA, jogadorB, esporte) {
  if (!Array.isArray(mercados)) {
    return [];
  }

  return mercados.map(function (mercado, indiceMercado) {
    const entradas = Array.isArray(mercado.odds)
      ? mercado.odds
      : mercado.odds && typeof mercado.odds === "object"
        ? [mercado.odds]
        : [];

    const grupos = entradas
      .map(function (entrada, indiceGrupo) {
        return normalizarGrupo(entrada, jogadorA, jogadorB, indiceGrupo);
      })
      .filter(Boolean);

    return {
      id: String(indiceMercado),
      codigo: mercado.name,
      nome: traduzirNomeMercado(mercado.name, jogadorA, jogadorB, esporte),
      atualizadoEm: mercado.updatedAt || null,
      disponivel: grupos.length > 0,
      grupos: grupos
    };
  });
}

/*
  Cada casa é normalizada isoladamente. Isso é importante porque a margem da
  Bet365 jamais deve ser calculada com uma odd que veio da Superbet, ou vice-versa.
*/
function prepararDadosDaCasa(evento, esporte, configuracaoCasa) {
  const mercadosRecebidos = encontrarValorSemDiferenciarMaiusculas(
    evento.bookmakers,
    configuracaoCasa.nomeApi
  );
  const mercadoVencedor = encontrarMercadoVencedor(mercadosRecebidos);

  if (!mercadoVencedor || !Array.isArray(mercadoVencedor.odds)) {
    return null;
  }

  const precos = mercadoVencedor.odds[0];
  const oddA = Number(precos && precos.home);
  const oddB = Number(precos && precos.away);
  const oddEmpate = Number(precos && precos.draw);
  const exigeEmpate = esporte === "football";

  if (!Number.isFinite(oddA) || !Number.isFinite(oddB) || oddA <= 1 || oddB <= 1 ||
      (exigeEmpate && (!Number.isFinite(oddEmpate) || oddEmpate <= 1))) {
    return null;
  }

  const resultadosBrutos = esporte === "football"
    ? [
        { nome: evento.home, tipo: "casa", odd: oddA },
        { nome: "Empate", tipo: "empate", odd: oddEmpate },
        { nome: evento.away, tipo: "visitante", odd: oddB }
      ]
    : [
        { nome: evento.home, tipo: "jogador-a", odd: oddA },
        { nome: evento.away, tipo: "jogador-b", odd: oddB }
      ];
  const calculoPrincipal = calcularMercadoJusto(resultadosBrutos.map(function (item) {
    return item.odd;
  }));
  const resultadosPrincipais = resultadosBrutos.map(function (item, indice) {
    return {
      ...item,
      oddJusta: calculoPrincipal.resultados[indice].oddJusta,
      probabilidadeJusta: calculoPrincipal.resultados[indice].probabilidadeJusta
    };
  });

  const linkRecebido = encontrarValorSemDiferenciarMaiusculas(
    evento.urls,
    configuracaoCasa.nomeApi
  );
  const link =
    typeof linkRecebido === "string" && linkRecebido.startsWith("https://")
      ? linkRecebido
      : null;

  return {
    codigo: configuracaoCasa.codigo,
    nome: configuracaoCasa.nomeExibicao,
    margemPrincipal: calculoPrincipal.margem,
    resultadosPrincipais: resultadosPrincipais,
    atualizadoEm: mercadoVencedor.updatedAt || null,
    link: link,
    mercados: normalizarMercados(mercadosRecebidos, evento.home, evento.away, esporte)
  };
}

function encontrarResultadoCorrespondente(casa, resultadoReferencia, indice) {
  if (!casa || !Array.isArray(casa.resultadosPrincipais)) return null;

  return casa.resultadosPrincipais.find(function (resultado) {
    return resultado.tipo === resultadoReferencia.tipo;
  }) || casa.resultadosPrincipais[indice] || null;
}

function prepararArbitragemPrincipal(dadosBet365, dadosSuperbet) {
  if (!dadosBet365 || !dadosSuperbet) {
    return {
      calculavel: false,
      motivo: "São necessárias odds completas da Bet365 e da Superbet."
    };
  }

  const resultados = dadosBet365.resultadosPrincipais.map(function (referencia, indice) {
    const resultadoBet365 = encontrarResultadoCorrespondente(dadosBet365, referencia, indice);
    const resultadoSuperbet = encontrarResultadoCorrespondente(dadosSuperbet, referencia, indice);

    return {
      nome: referencia.nome,
      tipo: referencia.tipo,
      ofertas: [
        resultadoBet365 ? { casa: "Bet365", odd: resultadoBet365.odd } : null,
        resultadoSuperbet ? { casa: "Superbet", odd: resultadoSuperbet.odd } : null
      ].filter(Boolean)
    };
  });

  if (resultados.some(function (resultado) { return resultado.ofertas.length < 2; })) {
    return {
      calculavel: false,
      motivo: "Uma das casas não enviou todos os resultados complementares."
    };
  }

  return {
    calculavel: true,
    ...calcularArbitragem(resultados)
  };
}

/*
  A Bet365 continua sendo a fonte principal nesta etapa. Se ela estiver sem o
  mercado completo, a partida é escondida como antes. A Superbet é opcional.
*/
function prepararPartidaComOdds(evento, esporte) {
  const dadosBet365 = prepararDadosDaCasa(evento, esporte, CASAS_APOSTAS.bet365);

  if (!dadosBet365) {
    return null;
  }

  const dadosSuperbet = prepararDadosDaCasa(evento, esporte, CASAS_APOSTAS.superbet);
  const arbitragemPrincipal = prepararArbitragemPrincipal(dadosBet365, dadosSuperbet);
  const resultadosBet365 = dadosBet365.resultadosPrincipais;
  const resultadoEmpate = resultadosBet365.find(function (resultado) {
    return resultado.tipo === "empate";
  });

  return {
    id: String(evento.id),
    esporte: esporte,
    jogadorA: evento.home,
    jogadorB: evento.away,
    participanteA: evento.home,
    participanteB: evento.away,
    data: evento.date,
    torneio: evento.league ? evento.league.name : "Competição não informada",
    competicao: evento.league ? evento.league.name : "Competição não informada",
    casas: {
      bet365: dadosBet365,
      superbet: dadosSuperbet
    },
    arbitragemPrincipal: arbitragemPrincipal,
    oddA: resultadosBet365[0].odd,
    oddB: resultadosBet365[resultadosBet365.length - 1].odd,
    oddEmpate: resultadoEmpate ? resultadoEmpate.odd : null,
    margemPrincipal: dadosBet365.margemPrincipal,
    resultadosPrincipais: dadosBet365.resultadosPrincipais,
    atualizadoEm: dadosBet365.atualizadoEm,
    linkBet365: dadosBet365.link,
    mercados: dadosBet365.mercados
  };
}

function dividirEmLotes(lista, tamanho) {
  const lotes = [];

  for (let inicio = 0; inicio < lista.length; inicio += tamanho) {
    lotes.push(lista.slice(inicio, inicio + tamanho));
  }

  return lotes;
}

async function listarPartidas(codigoEsporte) {
  const configuracao = obterConfiguracaoEsporte(codigoEsporte);

  if (!configuracao) {
    const erro = new Error("Esporte inválido. Use tennis ou football.");
    erro.codigoHttp = 400;
    throw erro;
  }

  const cachePartidas = obterCachePartidas(codigoEsporte);
  const cacheAindaValido =
    cachePartidas.dados !== null && Date.now() - cachePartidas.criadoEm < TEMPO_CACHE;

  if (cacheAindaValido) {
    return cachePartidas.dados;
  }

  const eventos = await consultarApi("/events", {
    sport: configuracao.slugApi,
    bookmaker: "Bet365",
    status: "pending",
    limit: String(configuracao.limiteEventos)
  });

  if (!Array.isArray(eventos)) {
    throw new Error("A API retornou uma lista de partidas em formato inesperado.");
  }

  const agora = Date.now();
  const eventosDoEsporte = eventos
    .filter(function (evento) {
      const horario = new Date(evento.date).getTime();
      const nomeTorneio = evento.league ? evento.league.name : "";
      const pertenceAoEsporte = codigoEsporte !== "tennis" || /^(ATP|WTA)\b/i.test(nomeTorneio);

      return Number.isFinite(horario) && horario > agora && pertenceAoEsporte;
    })
    .sort(function (primeiro, segundo) {
      return new Date(primeiro.date) - new Date(segundo.date);
    })
    .slice(0, configuracao.limiteEventos);

  // O endpoint multi aceita até dez eventos e cobra apenas uma consulta por lote.
  const lotes = dividirEmLotes(eventosDoEsporte, 10);
  const partidasComOdds = [];

  for (const lote of lotes) {
    const dadosDoLote = await consultarApi("/odds/multi", {
      eventIds: lote.map(function (evento) { return evento.id; }).join(","),
      bookmakers: NOMES_CASAS_API
    });

    if (!Array.isArray(dadosDoLote)) {
      continue;
    }

    dadosDoLote.forEach(function (evento) {
      const partida = prepararPartidaComOdds(evento, codigoEsporte);

      if (partida) {
        partidasComOdds.push(partida);
      }
    });
  }

  partidasComOdds.sort(function (primeira, segunda) {
    return new Date(primeira.data) - new Date(segunda.data);
  });

  cachesPartidas.set(codigoEsporte, {
    criadoEm: Date.now(),
    dados: partidasComOdds
  });

  return partidasComOdds;
}

function converterTimestamp(valor) {
  if (valor === null || valor === undefined) return null;

  if (typeof valor === "number" || /^\d+$/.test(String(valor))) {
    const numero = Number(valor);
    const milissegundos = numero < 100000000000 ? numero * 1000 : numero;
    const dataNumerica = new Date(milissegundos);
    return Number.isNaN(dataNumerica.getTime()) ? null : dataNumerica.toISOString();
  }

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function criarPontoMovimentacao(registro, origem) {
  if (!registro || typeof registro !== "object") return null;

  const oddA = Number(registro.home);
  const oddB = Number(registro.away);
  const momento = converterTimestamp(registro.timestamp);

  if (!momento || !Number.isFinite(oddA) || !Number.isFinite(oddB) || oddA <= 1 || oddB <= 1) {
    return null;
  }

  const calculo = calcularMercadoJusto([oddA, oddB]);

  return {
    momento: momento,
    oddA: oddA,
    oddB: oddB,
    oddJustaA: calculo.resultados[0].oddJusta,
    oddJustaB: calculo.resultados[1].oddJusta,
    margem: calculo.margem,
    origem: origem
  };
}

function criarPontoAtual(partida) {
  return criarPontoMovimentacao({
    home: partida.oddA,
    away: partida.oddB,
    timestamp: partida.atualizadoEm || Date.now()
  }, "atual");
}

/*
  O endpoint oficial de movimentos pode não ter histórico para toda partida.
  Nesse caso devolvemos somente a cotação atual, sem inventar mudanças antigas.
*/
async function obterMovimentacoes(partida) {
  const cache = cacheMovimentacoes.get(partida.id);

  if (cache && Date.now() - cache.criadoEm < TEMPO_CACHE_MOVIMENTOS) {
    return cache.dados;
  }

  let dadosHistoricos = null;

  try {
    dadosHistoricos = await consultarApi("/odds/movements", {
      eventId: partida.id,
      bookmaker: "Bet365",
      market: "ML"
    });
  } catch (erro) {
    if (erro.codigoFornecedor !== 404) throw erro;
  }

  const pontos = [];

  if (dadosHistoricos) {
    const registros = [
      { valor: dadosHistoricos.opening, origem: "abertura" },
      ...(Array.isArray(dadosHistoricos.movements)
        ? dadosHistoricos.movements.map(function (valor) {
            return { valor: valor, origem: "movimento" };
          })
        : []),
      { valor: dadosHistoricos.latest, origem: "mais recente" }
    ];

    registros.forEach(function (registro) {
      const ponto = criarPontoMovimentacao(registro.valor, registro.origem);
      if (ponto) pontos.push(ponto);
    });
  }

  const pontoAtual = criarPontoAtual(partida);
  if (pontoAtual) pontos.push(pontoAtual);

  // Remove repetições do mesmo momento e ordena do registro mais antigo ao atual.
  const pontosUnicos = Array.from(new Map(pontos.map(function (ponto) {
    return [ponto.momento, ponto];
  })).values())
    .sort(function (primeiro, segundo) {
      return new Date(primeiro.momento) - new Date(segundo.momento);
    })
    .slice(-100);

  const resposta = {
    eventoId: partida.id,
    jogadorA: partida.jogadorA,
    jogadorB: partida.jogadorB,
    pontos: pontosUnicos,
    possuiHistorico: pontosUnicos.some(function (ponto) { return ponto.origem !== "atual"; })
  };

  cacheMovimentacoes.set(partida.id, { criadoEm: Date.now(), dados: resposta });
  return resposta;
}

function obterInformacoesDeUso(codigoEsporte) {
  const cachePartidas = obterCachePartidas(codigoEsporte);
  return {
    limite: limiteApi.limite,
    restantes: limiteApi.restantes,
    reiniciaEm: limiteApi.reiniciaEm,
    cacheAte: cachePartidas.criadoEm ? new Date(cachePartidas.criadoEm + TEMPO_CACHE).toISOString() : null
  };
}

async function tratarRequisicao(requisicao, resposta) {
  const url = new URL(requisicao.url, "http://localhost");

  try {
    if (requisicao.method === "GET" && url.pathname === "/") {
      enviarHtml(resposta);
      return;
    }

    if (requisicao.method === "GET" && url.pathname === "/api/health") {
      enviarJson(resposta, 200, { status: "ok" });
      return;
    }

    if (requisicao.method === "GET" && url.pathname === "/api/partidas") {
      const esporte = url.searchParams.get("esporte") || "tennis";
      const partidas = await listarPartidas(esporte);
      enviarJson(resposta, 200, {
        esporte: esporte,
        partidas: partidas,
        consultas: obterInformacoesDeUso(esporte)
      });
      return;
    }

    if (requisicao.method === "GET" && url.pathname === "/api/movimentacoes") {
      const eventoId = url.searchParams.get("eventoId");
      const esporte = url.searchParams.get("esporte") || "tennis";

      if (!eventoId || !/^[a-zA-Z0-9_-]+$/.test(eventoId)) {
        enviarJson(resposta, 400, { erro: "Identificador da partida inválido." });
        return;
      }

      if (esporte !== "tennis") {
        enviarJson(resposta, 400, {
          erro: "O histórico de movimentação ainda está disponível somente para o tênis."
        });
        return;
      }

      const partidas = await listarPartidas(esporte);
      const partida = partidas.find(function (item) { return item.id === eventoId; });

      if (!partida) {
        enviarJson(resposta, 404, { erro: "Partida sem odds disponíveis no momento." });
        return;
      }

      const movimentacoes = await obterMovimentacoes(partida);
      enviarJson(resposta, 200, {
        ...movimentacoes,
        consultas: obterInformacoesDeUso(esporte)
      });
      return;
    }

    // Mantemos esta rota para compatibilidade, mas ela usa o cache e não gasta nova consulta.
    if (requisicao.method === "GET" && url.pathname === "/api/odds") {
      const eventoId = url.searchParams.get("eventoId");
      const esporte = url.searchParams.get("esporte") || "tennis";

      if (!eventoId || !/^[a-zA-Z0-9_-]+$/.test(eventoId)) {
        enviarJson(resposta, 400, { erro: "Identificador da partida inválido." });
        return;
      }

      const partidas = await listarPartidas(esporte);
      const partida = partidas.find(function (item) { return item.id === eventoId; });

      if (!partida) {
        enviarJson(resposta, 404, { erro: "Partida sem odds disponíveis no momento." });
        return;
      }

      enviarJson(resposta, 200, partida);
      return;
    }

    enviarJson(resposta, 404, { erro: "Endereço não encontrado." });
  } catch (erro) {
    console.error(erro.message);
    enviarJson(resposta, erro.codigoHttp || 502, {
      erro: erro.message || "Ocorreu um erro inesperado."
    });
  }
}

const servidor = http.createServer(tratarRequisicao);

// Localmente abrimos uma porta. Na Vercel, a plataforma chama a função exportada.
if (require.main === module) {
  servidor.listen(PORTA, HOST, function () {
    console.log("Calculadora disponível em http://localhost:" + PORTA);
  });

  process.on("SIGTERM", function () {
    servidor.close(function () {
      process.exit(0);
    });
  });
}

module.exports = tratarRequisicao;
