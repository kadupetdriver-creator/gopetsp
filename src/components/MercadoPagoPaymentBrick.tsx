import { useEffect } from "react";
import { initMercadoPago, Payment } from "@mercadopago/sdk-react";
import type { IPaymentFormData } from "@mercadopago/sdk-react/esm/bricks/payment/type";
import type { PaymentBrickData } from "@/lib/mercadopago.functions";

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
  useEffect(() => {
    initMercadoPago(publicKey, { locale: "pt-BR" });
  }, [publicKey]);

  return (
    <Payment
      initialization={{
        amount: amountCents / 100,
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
      locale="pt"
      onSubmit={async (formData: IPaymentFormData) => {
        await onSubmit(formData as PaymentBrickData);
      }}
      onError={(error) => onError(error.message || "Não foi possível carregar o pagamento.")}
    />
  );
}
