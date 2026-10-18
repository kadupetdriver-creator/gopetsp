<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Rules

- Pet size definitions and rank live in `src/lib/pet-sizes.ts`; pricing derives its factors and every grouping uses the shared rank so new categories stay consistent across quotes and displays.

- Administrative underway filtering uses `isUnderwayStatus` from `src/lib/rides.ts`, independently of active statuses used for cancellation and assignment, so filtering cannot alter ride actions.
- Tutor-facing live maps, location timestamps and arrival estimates use `canTrackRide` from `src/lib/rides.ts`, independently of action and admin filters, to prevent acceptance alone from enabling tracking.
- Administrative ride filters and completion eligibility live in `src/lib/admin-rides.ts`; manual completion uses an authenticated admin-only server function with a conditional update and structured audit log, never additional RLS write grants.

- The driver's share of a ride (75%) lives only in `src/lib/pricing.ts` (`DRIVER_SHARE_RATE` / `driverShareCents`). Compute or display payouts through that helper instead of multiplying by 0.75 inline, so the rate changes in one place.
- Admins may read every table that holds tutor or driver data, but only through read-only policies (`using (public.has_role(auth.uid(), 'admin'))` on SELECT). Never grant admins INSERT/UPDATE/DELETE through RLS on that data — changes must keep going through the guarded RPCs and admin server functions, so every write stays auditable.
