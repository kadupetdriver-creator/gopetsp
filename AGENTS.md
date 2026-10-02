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

- The driver's share of a ride (75%) lives only in `src/lib/pricing.ts` (`DRIVER_SHARE_RATE` / `driverShareCents`). Compute or display payouts through that helper instead of multiplying by 0.75 inline, so the rate changes in one place.
