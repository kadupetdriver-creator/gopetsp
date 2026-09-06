import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createCreditTopup } from "@/lib/credits.functions";

export function CreditTopupCheckout({
  amountCents,
  method,
  returnUrl,
}: {
  amountCents: number;
  method: "card" | "pix";
  returnUrl: string;
}) {
  const fetchClientSecret = async (): Promise<string> => {
    const result = await createCreditTopup({
      data: { amountCents, method, returnUrl, environment: getStripeEnvironment() },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Não foi possível iniciar a recarga");
    return result.clientSecret;
  };

  return (
    <div id="checkout-creditos" className="overflow-hidden rounded-2xl">
      <EmbeddedCheckoutProvider
        stripe={getStripe()}
        options={{ fetchClientSecret }}
        key={`${amountCents}-${method}`}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
