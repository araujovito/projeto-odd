const test = require("node:test");
const assert = require("node:assert/strict");
const { calcularMercadoJusto } = require("../calculos");

function aproximadamente(valor, esperado, tolerancia = 0.000001) {
  assert.ok(
    Math.abs(valor - esperado) <= tolerancia,
    valor + " deveria estar próximo de " + esperado
  );
}

test("normaliza corretamente o exemplo de duas odds", function () {
  const calculo = calcularMercadoJusto([1.5, 2.6]);

  aproximadamente(calculo.margem, 5.128205128205132);
  aproximadamente(calculo.resultados[0].oddJusta, 1.5769230769230769);
  aproximadamente(calculo.resultados[1].oddJusta, 2.7333333333333334);
  aproximadamente(calculo.somaProbabilidadesJustas, 100);
});

test("normaliza um mercado com mais de dois resultados", function () {
  const calculo = calcularMercadoJusto([2, 3.4, 3.6]);

  aproximadamente(calculo.margem, 7.189542483660141);
  aproximadamente(calculo.somaProbabilidadesJustas, 100);
  assert.equal(calculo.resultados.length, 3);
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
