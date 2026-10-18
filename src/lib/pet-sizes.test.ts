import { strict as assert } from "node:assert";
import { test } from "node:test";
import { petSizes, SIZE_RANK } from "./pet-sizes";
import { calculateRidePrice, sizeFactor } from "./pricing";

test("As cinco faixas da imagem têm limites de 5, 10, 25 e 40 kg", () => {
  assert.deepEqual(petSizes.map((size) => [size.value, size.maxWeightKg]), [
    ["mini", 5], ["pequeno", 10], ["medio", 25], ["grande", 40], ["gigante", Infinity],
  ]);
  assert.deepEqual(SIZE_RANK, ["mini", "pequeno", "medio", "grande", "gigante"]);
});

test("Manter tarifas: mini e pequeno 1,1; médio 1,2; grande e gigante 1,3", () => {
  assert.deepEqual(SIZE_RANK.map(sizeFactor), [1.1, 1.1, 1.2, 1.3, 1.3]);
});

test("Gigante é o maior porte em um grupo e paga o integral, mini paga 40%", () => {
  const price = calculateRidePrice(0, ["mini", "gigante"], false);
  assert.equal(price.groupSize, "gigante");
  assert.equal(price.priceCents, 2435);
});