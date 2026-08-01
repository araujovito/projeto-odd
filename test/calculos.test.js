const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calcularMercadoJusto,
  calcularArbitragem,
  calcularDistribuicaoArbitragem,
  calcularLucroAposta,
  calcularKelly,
  calcularHedge,
  converterOddDecimal,
  calcularVariacaoPercentual,
  classificarMargem
} = require("../calculos");

function aproximadamente(valor, esperado, tolerancia = 0.000001) {
  assert.ok(
    Math.abs(valor - esperado) <= tolerancia,
    valor + " deveria estar próximo de " + esperado
  );
}

function arredondar(valor, casas) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

test("normaliza corretamente o exemplo de duas odds", function () {
  const calculo = calcularMercadoJusto([1.5, 2.6]);

  aproximadamente(calculo.margem, 5.128205128205132);
  aproximadamente(calculo.resultados[0].oddJusta, 1.5769230769230769);
  aproximadamente(calculo.resultados[1].oddJusta, 2.7333333333333334);
  aproximadamente(calculo.somaProbabilidadesJustas, 100);
});

test("calcula todos os resultados possíveis do controle de banca", function () {
  assert.equal(calcularLucroAposta(2.5, 100, "ganha"), 150);
  assert.equal(calcularLucroAposta(2.5, 100, "perdida"), -100);
  assert.equal(calcularLucroAposta(2.5, 100, "devolvida"), 0);
  assert.equal(calcularLucroAposta(2.5, 100, "parcialmente_ganha"), 75);
  assert.equal(calcularLucroAposta(2.5, 100, "parcialmente_perdida"), -50);
  assert.equal(calcularLucroAposta(2.5, 100, "pendente"), 0);
});

test("calcula Kelly fracionado sem recomendar valor quando não existe vantagem", function () {
  const positivo = calcularKelly(2, 60, 1000, 0.5);
  aproximadamente(positivo.percentualCompleto, 20);
  aproximadamente(positivo.percentualAplicado, 10);
  assert.equal(positivo.valor, 100);
  assert.equal(calcularKelly(2, 40, 1000).valor, 0);
});

test("calcula hedge com retornos equilibrados", function () {
  const hedge = calcularHedge(2, 100, 2);
  assert.equal(hedge.valorHedge, 100);
  assert.equal(hedge.totalInvestido, 200);
  assert.equal(hedge.retornoOriginal, 200);
  assert.equal(hedge.retornoHedge, 200);
  assert.equal(hedge.lucroMinimo, 0);
});

test("converte odd decimal para odd americana", function () {
  assert.equal(converterOddDecimal(2.5).americana, 150);
  assert.equal(converterOddDecimal(2.5).fracionaria, "3/2");
  assert.equal(converterOddDecimal(1.5).americana, -200);
  assert.equal(converterOddDecimal(1.5).fracionaria, "1/2");
});

test("normaliza o mercado 1X2 de futebol incluindo o empate", function () {
  const calculo = calcularMercadoJusto([2, 3.4, 3.6]);

  aproximadamente(calculo.margem, 7.189542483660141);
  aproximadamente(calculo.resultados[0].oddJusta, 2.1437908496732025);
  aproximadamente(calculo.resultados[1].oddJusta, 3.6444444444444444);
  aproximadamente(calculo.resultados[2].oddJusta, 3.8588235294117648);
  aproximadamente(calculo.resultados[0].probabilidadeJusta, 46.64634146341463);
  aproximadamente(calculo.resultados[1].probabilidadeJusta, 27.439024390243897);
  aproximadamente(calculo.resultados[2].probabilidadeJusta, 25.91463414634146);
  aproximadamente(calculo.somaProbabilidadesJustas, 100);
  assert.equal(calculo.resultados.length, 3);
});

test("calcula a margem de cada casa separadamente", function () {
  const bet365 = calcularMercadoJusto([2, 3.4, 3.6]);
  const superbet = calcularMercadoJusto([2.1, 3.3, 3.5]);

  aproximadamente(bet365.margem, 7.18954248366015);
  aproximadamente(superbet.margem, 6.493506493506487);
  assert.notEqual(bet365.margem, superbet.margem);
  aproximadamente(bet365.somaProbabilidadesJustas, 100);
  aproximadamente(superbet.somaProbabilidadesJustas, 100);
});

test("detecta e distribui uma arbitragem de dois resultados", function () {
  const arbitragem = calcularArbitragem([
    {
      nome: "Jogador A",
      ofertas: [
        { casa: "Bet365", odd: 2.1 },
        { casa: "Superbet", odd: 2.0 }
      ]
    },
    {
      nome: "Jogador B",
      ofertas: [
        { casa: "Bet365", odd: 1.9 },
        { casa: "Superbet", odd: 2.1 }
      ]
    }
  ]);

  assert.equal(arbitragem.existe, true);
  aproximadamente(arbitragem.somaImplicita, 95.23809523809523);
  aproximadamente(arbitragem.percentualArbitragem, 4.761904761904767);
  aproximadamente(arbitragem.percentualLucroTeorico, 5);
  assert.deepEqual(arbitragem.selecoes.map(function (item) { return item.casa; }), [
    "Bet365", "Superbet"
  ]);

  const distribuicao = calcularDistribuicaoArbitragem(arbitragem.selecoes, 100);
  assert.deepEqual(distribuicao.apostas.map(function (item) { return item.valor; }), [50, 50]);
  aproximadamente(distribuicao.retornoGarantido, 105);
  aproximadamente(distribuicao.lucroGarantido, 5);
});

test("detecta e distribui uma arbitragem 1X2 de três resultados", function () {
  const arbitragem = calcularArbitragem([
    { nome: "Casa", ofertas: [{ casa: "Bet365", odd: 3.5 }, { casa: "Superbet", odd: 3.4 }] },
    { nome: "Empate", ofertas: [{ casa: "Bet365", odd: 3.4 }, { casa: "Superbet", odd: 3.5 }] },
    { nome: "Visitante", ofertas: [{ casa: "Bet365", odd: 3.5 }, { casa: "Superbet", odd: 3.45 }] }
  ]);

  assert.equal(arbitragem.existe, true);
  aproximadamente(arbitragem.somaImplicita, 85.71428571428571);
  aproximadamente(arbitragem.percentualLucroTeorico, 16.666666666666675);

  const distribuicao = calcularDistribuicaoArbitragem(arbitragem.selecoes, 300);
  assert.deepEqual(distribuicao.apostas.map(function (item) { return item.valor; }), [100, 100, 100]);
  aproximadamente(distribuicao.retornoGarantido, 350);
  aproximadamente(distribuicao.lucroGarantido, 50);
});

test("não anuncia arbitragem quando as melhores odds somam mais de 100%", function () {
  const arbitragem = calcularArbitragem([
    { nome: "A", ofertas: [{ casa: "Bet365", odd: 1.9 }] },
    { nome: "B", ofertas: [{ casa: "Superbet", odd: 1.9 }] }
  ]);

  assert.equal(arbitragem.existe, false);
  assert.ok(arbitragem.somaImplicita > 100);
  assert.ok(arbitragem.percentualLucroTeorico < 0);
});

test("não mistura uma seleção isolada em um falso mercado justo", function () {
  assert.throws(
    function () { calcularMercadoJusto([1.8]); },
    /pelo menos dois resultados/
  );
});

test("rejeita odds inválidas", function () {
  assert.throws(
    function () { calcularMercadoJusto([1, 2]); },
    /maiores que 1/
  );
});

test("calcula a movimentação percentual entre dois momentos", function () {
  assert.equal(arredondar(calcularVariacaoPercentual(2.10, 1.85), 2), -11.90);
  assert.equal(arredondar(calcularVariacaoPercentual(1.72, 1.90), 2), 10.47);
});

test("classifica as faixas de margem nos limites definidos", function () {
  assert.equal(classificarMargem(5), "baixa");
  assert.equal(classificarMargem(5.01), "moderada");
  assert.equal(classificarMargem(8), "moderada");
  assert.equal(classificarMargem(8.01), "alta");
});
