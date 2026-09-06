import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createRideCheckout } from "@/lib/payments.functions";

export function RideCheckout({
  rideId,
  returnUrl,
  method = "card",
}: {
  rideId: string;
  returnUrl: string;
  method?: "card" | "pix";
}) {
  const fetchClientSecret = async (): Promise<string> => {
    const result = await createRideCheckout({
      data: { rideId, returnUrl, environment: getStripeEnvironment(), method },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Não foi possível iniciar o pagamento");
    return result.clientSecret;
  };

  return (
    <div id="checkout" className="overflow-hidden rounded-2xl">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
