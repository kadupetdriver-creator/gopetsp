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

- Fixed-price rides use an authenticated admin server function with tutor-owned pets, shared size ranking, ordered stops and an idempotent request ID; all pets link through ride_pets and routing includes stops. After successful balance settlement, release through the guarded request_paid_ride_driver RPC before returning success; retries reuse the same ride without another debit.

- Driver review uses the authenticated admin decision RPC and a separate irreversible rejection flag; database guards and restrictive document/vehicle policies enforce finality while ordinary rejection remains editable and resubmittable.

- CPF duplication exceptions are enforced by the database availability RPC, signup trigger, and partial unique index together; keep the same normalized predicate across all three so password signup and Google completion agree without weakening other CPFs.

- Driver earnings date inputs use the browser-safe `driver-earnings-range.ts` predicate with São Paulo inclusive day boundaries on ride realization and bonus settlement dates; filter only the driver's existing scoped data without changing queries or permissions.

- Driver ride payments use owner/admin-read-only `driver_ride_payments`, written only by an authenticated admin server function after completion, with unique ride records and audit logs; tutor `paid_at` never proves driver payment. Shared `driver-payments.ts` groups report rides by scheduled_at and computes São Paulo payment dates, keeping creation and payment timestamps separate.

- Google registration completion is enforced by a shared root gate before app views mount; CPF and phone are loaded only for the current user, email comes from the authenticated identity, and a narrow owner-authorized server function saves registration fields with immutable existing CPF and database uniqueness protection.

- Administrative rescheduling goes through an authenticated admin-only server function with tutor-request confirmation, São Paulo time parsing, conditional concurrency protection and structured audit logging; update only scheduled_at to preserve price, payment and dispatch state.

- Ride payment and driver dispatch are separate: new outbound/return rows explicitly set driver_requested_at to null; tutors release paid rides through the owner-authorized service-role request_paid_ride_driver RPC. Admin forwarding uses an authenticated admin-only server function with approved-driver validation, a conditional atomic release/assignment, and structured audit logging; it clears preference for explicit reassignment or the general pool. Restrictive RLS and an assignment trigger enforce payment/release independently of frontend; admin availability includes paid pending unassigned rides even before release, without changing driver-pool visibility. Preference priority starts on release, so payment delays do not consume it.

- Ride accompaniment and total accompanying people are stored independently from pricing in the shared outbound/return insert; nullable values preserve unknown on legacy rides and counts are cleared when the tutor does not accompany.

- Driver-facing tutor names must come only from the assignment-scoped ride_tutor_names RPC, never a broad profiles query, so unassigned drivers cannot read tutor identities.

- GoPet balance ride payments debit the ledger, consume coupons and set paid_at in one service-role-only database RPC; profile/ride locks and the Mercado Pago insert guard serialize balance payments and competing payment methods. Refunds return the actual debit through an idempotent RPC; checkout eligibility is shared in src/lib/credit-payment.ts.

- Pet size definitions and rank live in `src/lib/pet-sizes.ts`; pricing derives its factors and every grouping uses the shared rank so new categories stay consistent across quotes and displays.

- Administrative underway filtering uses `isUnderwayStatus` from `src/lib/rides.ts`, independently of active statuses used for cancellation and assignment, so filtering cannot alter ride actions.
- Tutor-facing live maps, location timestamps and arrival estimates use `canTrackRide` from `src/lib/rides.ts`, independently of action and admin filters, to prevent acceptance alone from enabling tracking.
- Administrative ride filters and completion eligibility live in `src/lib/admin-rides.ts`; every ride filter requires paid_at, while the quotes filter exclusively shows unpaid requests, keeping counts and CSV exports consistent without changing read permissions. Manual completion uses an authenticated admin-only server function with a conditional update and structured audit log, never additional RLS write grants.

- The driver's share of a ride lives only in `src/lib/pricing.ts`: `driverShareCents` (75%, `DRIVER_SHARE_RATE`) and `driverPayoutCents`, which returns the admin-fixed `rides.driver_fixed_cents` when present (corridas fixas). Compute or display payouts through `driverPayoutCents` instead of multiplying by 0.75 inline, so the rate changes in one place.
- Admins may read every table that holds tutor or driver data, but only through read-only policies (`using (public.has_role(auth.uid(), 'admin'))` on SELECT). Never grant admins INSERT/UPDATE/DELETE through RLS on that data — changes must keep going through the guarded RPCs and admin server functions, so every write stays auditable.
- Topup payments use their own table (mercadopago_topups) with external_reference `topup:<id>`; settlement credits the ledger only through the service-role RPC apply_mercadopago_topup, so webhook and polling stay idempotent.
