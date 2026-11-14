import { afterEach, expect, mock, test } from "bun:test";

let failPayment = false;
let failRide = false;
const writes: string[] = [];
mock.module("../src/lib/mercadopago.server", () => ({
  mercadoPagoRequest: async () => ({ id: "order", external_reference: "ride", total_amount: "98.39", status: "processed", status_detail: "accredited" }),
  normalizeOrderStatus: () => "approved",
  orderAmountCents: () => 9839,
  orderPayment: () => undefined,
  orderPixData: () => ({}),
}));
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        update: () => { writes.push(table); return chain; },
        maybeSingle: async () => ({ data: { id: "payment", ride_id: "ride", amount_cents: 9839, status: "in_process", coupon_id: null } }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: (table === "rides" ? failRide : failPayment) ? { message: "unavailable" } : null }).then(resolve),
      };
      return chain;
    },
  },
}));
const { settleMercadoPagoOrder } = await import("../src/lib/mercadopago-settle.server");
afterEach(() => { failPayment = false; failRide = false; writes.length = 0; });

test("confirma R$ 98,39 sem liberar motorista automaticamente", async () => {
  expect(await settleMercadoPagoOrder("order")).toEqual({ status: "approved", paid: true });
  expect(writes).toEqual(["mercadopago_payments", "rides"]);
});
test("falha de persistência do pagamento permite nova tentativa", async () => {
  failPayment = true;
  await expect(settleMercadoPagoOrder("order")).rejects.toThrow("atualizar o pagamento");
  expect(writes).toEqual(["mercadopago_payments"]);
});
test("não anuncia confirmação quando a corrida não foi atualizada", async () => {
  failRide = true;
  await expect(settleMercadoPagoOrder("order")).rejects.toThrow("confirmar o pagamento da corrida");
});