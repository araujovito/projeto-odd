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

module.exports = {
  calcularMercadoJusto: calcularMercadoJusto
};
