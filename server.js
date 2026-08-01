// Módulos nativos do Node.js: o projeto continua sem bibliotecas externas.
const http = require("http");
const fs = require("fs");
const path = require("path");

const CAMINHO_INDEX = path.join(__dirname, "index.html");
const CAMINHO_ENV = path.join(__dirname, ".env");
const ENDERECO_API = "https://api.odds-api.io/v3";
const TEMPO_CACHE = 10 * 60 * 1000; // Dez minutos, como recomendado pela API.

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

let cachePartidas = {
  criadoEm: 0,
  dados: null
};

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
    if (resposta.status === 401 || resposta.status === 403) {
      throw new Error("A chave da API foi recusada. Confira a configuração secreta.");
    }

    if (resposta.status === 429) {
      throw new Error("O limite gratuito de consultas foi atingido. Tente novamente mais tarde.");
    }

    throw new Error("O fornecedor de odds respondeu com o erro " + resposta.status + ".");
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

/*
  Retorna null quando o evento não tem as duas odds necessárias. Assim ele é
  removido antes de chegar ao site e o usuário nunca vê uma partida incalculável.
*/
function prepararPartidaComOdds(evento) {
  const mercadosBet365 = encontrarValorSemDiferenciarMaiusculas(evento.bookmakers, "Bet365");
  const mercadoVencedor = encontrarMercadoVencedor(mercadosBet365);

  if (!mercadoVencedor || !Array.isArray(mercadoVencedor.odds)) {
    return null;
  }

  const precos = mercadoVencedor.odds[0];
  const oddA = Number(precos && precos.home);
  const oddB = Number(precos && precos.away);

  if (!Number.isFinite(oddA) || !Number.isFinite(oddB) || oddA <= 1 || oddB <= 1) {
    return null;
  }

  const linkRecebido = encontrarValorSemDiferenciarMaiusculas(evento.urls, "Bet365");
  const linkBet365 =
    typeof linkRecebido === "string" && linkRecebido.startsWith("https://")
      ? linkRecebido
      : null;

  return {
    id: String(evento.id),
    jogadorA: evento.home,
    jogadorB: evento.away,
    data: evento.date,
    torneio: evento.league ? evento.league.name : "Torneio não informado",
    oddA: oddA,
    oddB: oddB,
    atualizadoEm: mercadoVencedor.updatedAt || null,
    linkBet365: linkBet365
  };
}

function dividirEmLotes(lista, tamanho) {
  const lotes = [];

  for (let inicio = 0; inicio < lista.length; inicio += tamanho) {
    lotes.push(lista.slice(inicio, inicio + tamanho));
  }

  return lotes;
}

async function listarPartidas() {
  const cacheAindaValido =
    cachePartidas.dados !== null && Date.now() - cachePartidas.criadoEm < TEMPO_CACHE;

  if (cacheAindaValido) {
    return cachePartidas.dados;
  }

  const eventos = await consultarApi("/events", {
    sport: "tennis",
    bookmaker: "Bet365",
    status: "pending"
  });

  if (!Array.isArray(eventos)) {
    throw new Error("A API retornou uma lista de partidas em formato inesperado.");
  }

  const agora = Date.now();
  const eventosAtpWta = eventos
    .filter(function (evento) {
      const horario = new Date(evento.date).getTime();
      const nomeTorneio = evento.league ? evento.league.name : "";
      const ehAtpOuWta = /^(ATP|WTA)\b/i.test(nomeTorneio);

      return Number.isFinite(horario) && horario > agora && ehAtpOuWta;
    })
    .sort(function (primeiro, segundo) {
      return new Date(primeiro.date) - new Date(segundo.date);
    })
    .slice(0, 50);

  // O endpoint multi aceita até dez eventos e cobra apenas uma consulta por lote.
  const lotes = dividirEmLotes(eventosAtpWta, 10);
  const partidasComOdds = [];

  for (const lote of lotes) {
    const dadosDoLote = await consultarApi("/odds/multi", {
      eventIds: lote.map(function (evento) { return evento.id; }).join(","),
      bookmakers: "Bet365"
    });

    if (!Array.isArray(dadosDoLote)) {
      continue;
    }

    dadosDoLote.forEach(function (evento) {
      const partida = prepararPartidaComOdds(evento);

      if (partida) {
        partidasComOdds.push(partida);
      }
    });
  }

  partidasComOdds.sort(function (primeira, segunda) {
    return new Date(primeira.data) - new Date(segunda.data);
  });

  cachePartidas = {
    criadoEm: Date.now(),
    dados: partidasComOdds
  };

  return partidasComOdds;
}

function obterInformacoesDeUso() {
  return {
    limite: limiteApi.limite,
    restantes: limiteApi.restantes,
    reiniciaEm: limiteApi.reiniciaEm,
    cacheAte: cachePartidas.criadoEm ? new Date(cachePartidas.criadoEm + TEMPO_CACHE).toISOString() : null
  };
}

const servidor = http.createServer(async function (requisicao, resposta) {
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
      const partidas = await listarPartidas();
      enviarJson(resposta, 200, {
        partidas: partidas,
        consultas: obterInformacoesDeUso()
      });
      return;
    }

    // Mantemos esta rota para compatibilidade, mas ela usa o cache e não gasta nova consulta.
    if (requisicao.method === "GET" && url.pathname === "/api/odds") {
      const eventoId = url.searchParams.get("eventoId");

      if (!eventoId || !/^[a-zA-Z0-9_-]+$/.test(eventoId)) {
        enviarJson(resposta, 400, { erro: "Identificador da partida inválido." });
        return;
      }

      const partidas = await listarPartidas();
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
});

servidor.listen(PORTA, HOST, function () {
  console.log("Calculadora disponível em http://localhost:" + PORTA);
});

// Plataformas de hospedagem enviam SIGTERM antes de desligar uma aplicação.
process.on("SIGTERM", function () {
  servidor.close(function () {
    process.exit(0);
  });
});
