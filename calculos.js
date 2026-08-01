/*
  Funções matemáticas isoladas do servidor e da interface.
  Isso permite testar o coração do projeto sem depender da API ou do navegador.
*/

function calcularMercadoJusto(odds) {
  if (!Array.isArray(odds) || odds.length < 2) {
    throw new Error("Um mercado justo precisa de pelo menos dois resultados completos.");
  }

  const oddsValidas = odds.every(function (odd) {
    return Number.isFinite(odd) && odd > 1;
  });

  if (!oddsValidas) {
    throw new Error("Todas as odds precisam ser números maiores que 1.");
  }

  const probabilidadesImplicitas = odds.map(function (odd) {
    return 1 / odd;
  });

  const somaImplicita = probabilidadesImplicitas.reduce(function (total, probabilidade) {
    return total + probabilidade;
  }, 0);

  const probabilidadesJustas = probabilidadesImplicitas.map(function (probabilidade) {
    return probabilidade / somaImplicita;
  });

  return {
    margem: (somaImplicita - 1) * 100,
    somaProbabilidadesJustas: probabilidadesJustas.reduce(function (total, probabilidade) {
      return total + probabilidade;
    }, 0) * 100,
    resultados: odds.map(function (odd, indice) {
      const probabilidadeJusta = probabilidadesJustas[indice];

      return {
        odd: odd,
        probabilidadeJusta: probabilidadeJusta * 100,
        oddJusta: 1 / probabilidadeJusta
      };
    })
  };
}

function calcularVariacaoPercentual(valorInicial, valorFinal) {
  if (!Number.isFinite(valorInicial) || !Number.isFinite(valorFinal) || valorInicial <= 0) {
    throw new Error("A variação precisa de valores numéricos e um valor inicial positivo.");
  }

  return ((valorFinal - valorInicial) / valorInicial) * 100;
}

function classificarMargem(margem) {
  if (!Number.isFinite(margem)) {
    throw new Error("A margem precisa ser um número válido.");
  }

  if (margem <= 5) return "baixa";
  if (margem <= 8) return "moderada";
  return "alta";
}

/*
  Cada resultado recebe as cotações disponíveis nas casas. Escolhemos a maior
  odd de cada resultado e só então verificamos se o conjunto cobre o mercado
  com uma soma implícita menor que 100%.
*/
function calcularArbitragem(resultados) {
  if (!Array.isArray(resultados) || resultados.length < 2) {
    throw new Error("A arbitragem precisa de pelo menos dois resultados completos.");
  }

  const melhoresSelecoes = resultados.map(function (resultado) {
    if (!resultado || !Array.isArray(resultado.ofertas) || resultado.ofertas.length === 0) {
      throw new Error("Todos os resultados precisam ter pelo menos uma cotação.");
    }

    const ofertasValidas = resultado.ofertas.filter(function (oferta) {
      return oferta && typeof oferta.casa === "string" &&
        Number.isFinite(oferta.odd) && oferta.odd > 1;
    });

    if (ofertasValidas.length === 0) {
      throw new Error("Todas as cotações de arbitragem precisam ter odds maiores que 1.");
    }

    const melhorOferta = ofertasValidas.reduce(function (melhor, oferta) {
      return oferta.odd > melhor.odd ? oferta : melhor;
    });

    return {
      nome: resultado.nome,
      tipo: resultado.tipo || null,
      casa: melhorOferta.casa,
      odd: melhorOferta.odd
    };
  });

  const somaImplicita = melhoresSelecoes.reduce(function (total, selecao) {
    return total + (1 / selecao.odd);
  }, 0);

  return {
    existe: somaImplicita < 1,
    somaImplicita: somaImplicita * 100,
    percentualArbitragem: (1 - somaImplicita) * 100,
    percentualLucroTeorico: ((1 / somaImplicita) - 1) * 100,
    selecoes: melhoresSelecoes
  };
}

function arredondarCentavos(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/*
  Distribui a banca proporcionalmente ao inverso de cada odd. O último valor
  absorve a diferença de centavos para que a soma exibida seja exatamente igual
  ao total informado pelo usuário.
*/
function calcularDistribuicaoArbitragem(selecoes, valorTotal) {
  if (!Array.isArray(selecoes) || selecoes.length < 2) {
    throw new Error("A distribuição precisa de pelo menos duas seleções.");
  }

  if (!Number.isFinite(valorTotal) || valorTotal <= 0) {
    throw new Error("O valor total precisa ser um número positivo.");
  }

  const oddsValidas = selecoes.every(function (selecao) {
    return selecao && Number.isFinite(selecao.odd) && selecao.odd > 1;
  });

  if (!oddsValidas) {
    throw new Error("Todas as seleções precisam ter odds maiores que 1.");
  }

  const somaInversos = selecoes.reduce(function (total, selecao) {
    return total + (1 / selecao.odd);
  }, 0);
  let valorJaDistribuido = 0;

  const apostas = selecoes.map(function (selecao, indice) {
    const ehUltima = indice === selecoes.length - 1;
    const valor = ehUltima
      ? arredondarCentavos(valorTotal - valorJaDistribuido)
      : arredondarCentavos(valorTotal * (1 / selecao.odd) / somaInversos);

    valorJaDistribuido += valor;

    return {
      ...selecao,
      valor: valor,
      retorno: arredondarCentavos(valor * selecao.odd)
    };
  });

  const retornoGarantido = Math.min(...apostas.map(function (aposta) {
    return aposta.retorno;
  }));
  const lucroGarantido = arredondarCentavos(retornoGarantido - valorTotal);

  return {
    valorTotal: arredondarCentavos(valorTotal),
    retornoGarantido: retornoGarantido,
    lucroGarantido: lucroGarantido,
    percentualLucro: (lucroGarantido / valorTotal) * 100,
    apostas: apostas
  };
}

function calcularLucroAposta(odd, valor, resultado) {
  if (!Number.isFinite(odd) || odd <= 1 || !Number.isFinite(valor) || valor <= 0) {
    throw new Error("Odd e valor precisam ser números válidos e positivos.");
  }

  const multiplicadores = {
    pendente: 0,
    ganha: odd - 1,
    perdida: -1,
    devolvida: 0,
    parcialmente_ganha: (odd - 1) / 2,
    parcialmente_perdida: -0.5
  };

  if (!Object.prototype.hasOwnProperty.call(multiplicadores, resultado)) {
    throw new Error("Resultado da aposta não reconhecido.");
  }

  return arredondarCentavos(valor * multiplicadores[resultado]);
}

function calcularKelly(odd, probabilidadePercentual, banca, fracao = 1) {
  if (!Number.isFinite(odd) || odd <= 1 || !Number.isFinite(probabilidadePercentual) ||
      probabilidadePercentual <= 0 || probabilidadePercentual >= 100 ||
      !Number.isFinite(banca) || banca <= 0 || !Number.isFinite(fracao) || fracao <= 0 || fracao > 1) {
    throw new Error("Preencha odd, probabilidade, banca e fração com valores válidos.");
  }
  const p = probabilidadePercentual / 100;
  const b = odd - 1;
  const kellyCompleto = Math.max(0, ((b * p) - (1 - p)) / b);
  return {
    percentualCompleto: kellyCompleto * 100,
    percentualAplicado: kellyCompleto * fracao * 100,
    valor: arredondarCentavos(banca * kellyCompleto * fracao)
  };
}

function calcularHedge(oddOriginal, valorOriginal, oddHedge) {
  if (![oddOriginal, valorOriginal, oddHedge].every(Number.isFinite) ||
      oddOriginal <= 1 || valorOriginal <= 0 || oddHedge <= 1) {
    throw new Error("As duas odds e o valor original precisam ser válidos.");
  }
  const valorHedge = arredondarCentavos((valorOriginal * oddOriginal) / oddHedge);
  const totalInvestido = arredondarCentavos(valorOriginal + valorHedge);
  return {
    valorHedge: valorHedge,
    totalInvestido: totalInvestido,
    retornoOriginal: arredondarCentavos(valorOriginal * oddOriginal),
    retornoHedge: arredondarCentavos(valorHedge * oddHedge),
    lucroMinimo: arredondarCentavos(Math.min(valorOriginal * oddOriginal, valorHedge * oddHedge) - totalInvestido)
  };
}

function converterOddDecimal(odd) {
  if (!Number.isFinite(odd) || odd <= 1) throw new Error("A odd decimal precisa ser maior que 1.");
  const americana = odd >= 2 ? Math.round((odd - 1) * 100) : Math.round(-100 / (odd - 1));
  const denominadorBase = 100;
  const numeradorBase = Math.round((odd - 1) * denominadorBase);
  function maximoDivisorComum(a, b) {
    while (b !== 0) { const resto = a % b; a = b; b = resto; }
    return a;
  }
  const divisor = maximoDivisorComum(numeradorBase, denominadorBase);
  return { decimal: odd, americana: americana, fracionaria: (numeradorBase / divisor) + "/" + (denominadorBase / divisor) };
}

module.exports = {
  calcularMercadoJusto: calcularMercadoJusto,
  calcularArbitragem: calcularArbitragem,
  calcularDistribuicaoArbitragem: calcularDistribuicaoArbitragem,
  calcularLucroAposta: calcularLucroAposta,
  calcularKelly: calcularKelly,
  calcularHedge: calcularHedge,
  converterOddDecimal: converterOddDecimal,
  calcularVariacaoPercentual: calcularVariacaoPercentual,
  classificarMargem: classificarMargem
};
