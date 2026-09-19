import { initMercadoPago, Payment } from "@mercadopago/sdk-react";
import type { IPaymentFormData } from "@mercadopago/sdk-react/esm/bricks/payment/type";
import type { PaymentBrickData } from "@/lib/mercadopago.functions";

// O SDK precisa estar inicializado ANTES do Brick montar; em useEffect seria tarde demais.
let initializedKey: string | undefined;
function ensureInitialized(publicKey: string) {
  if (initializedKey === publicKey) return;
  initMercadoPago(publicKey, { locale: "pt-BR" });
  initializedKey = publicKey;
}

export function MercadoPagoPaymentBrick({
  publicKey,
  amountCents,
  email,
  cpf,
  onSubmit,
  onError,
}: {
  publicKey: string;
  amountCents: number;
  email?: string;
  cpf: string;
  onSubmit: (data: PaymentBrickData) => Promise<void>;
  onError: (message: string) => void;
}) {
  ensureInitialized(publicKey);

  if (!(amountCents > 0)) {
    return <p className="text-sm text-destructive">Não foi possível calcular o valor desta corrida.</p>;
  }

  return (
    <Payment
      initialization={{
        amount: Number((amountCents / 100).toFixed(2)),
        payer: {
          ...(email ? { email } : {}),
          identification: { type: "CPF", number: cpf },
        },
      }}
      customization={{
        paymentMethods: {
          creditCard: "all",
          debitCard: "all",
          bankTransfer: ["pix"],
          maxInstallments: 12,
        },
      }}
      onSubmit={async (param: IPaymentFormData) => {
        // O Brick entrega { selectedPaymentMethod, formData }; o Pix chega como
        // selectedPaymentMethod "bank_transfer" e sem token de cartão.
        const selected = param?.selectedPaymentMethod;
        const form = (param?.formData ?? {}) as unknown as Record<string, unknown>;
        const isPix = selected === "bank_transfer" || form["payment_method_id"] === "pix";
        const methodId = isPix ? "pix" : (form["payment_method_id"] as string | undefined);
        const typeId = isPix ? "bank_transfer" : ((form["payment_type_id"] as string | undefined) ?? selected);
        const payload: PaymentBrickData = {
          ...(form as PaymentBrickData),
          ...(methodId ? { payment_method_id: methodId } : {}),
          ...(typeId ? { payment_type_id: typeId } : {}),
        };
        console.info("[MP Brick] onSubmit", {
          selectedPaymentMethod: selected,
          payment_method_id: payload.payment_method_id,
          payment_type_id: payload.payment_type_id,
          hasToken: Boolean(payload.token),
          installments: payload.installments,
        });
        await onSubmit(payload);
      }}
      onError={(error) => {
        console.error("Payment Brick error", error);
        onError("Não foi possível carregar o pagamento. Atualize a página e tente novamente.");
      }}
    />
  );
}
