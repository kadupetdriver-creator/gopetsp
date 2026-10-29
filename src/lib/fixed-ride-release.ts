type ReleaseResult = { data: string | null; error: unknown };

/** Called only after balance settlement; the guarded RPC remains idempotent. */
export async function releasePaidFixedRide(
  rideId: string,
  tutorId: string,
  release: (args: { _ride_id: string; _tutor_id: string }) => PromiseLike<ReleaseResult>,
) {
  const { data, error } = await release({ _ride_id: rideId, _tutor_id: tutorId });
  if (error || !data) {
    throw new Error("A corrida fixa foi paga, mas não foi possível enviá-la ao bolsão. Tente salvar novamente para concluir, sem novo desconto.");
  }
  return data;
}