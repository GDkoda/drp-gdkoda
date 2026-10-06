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

- All economy changes (coins, chest items, check-in, transfers) go through SECURITY DEFINER Postgres RPCs; clients never write coins directly — prevents players editing balances.
- Usernames without "@" log in as `<username>@mesa.local` — lets the Master and players use plain usernames.
- Tunable economy values live in the single-row game_settings table and are read by the game RPCs — lets the Master change rewards without code changes.
- Global copy and visual choices live in the single-row site_settings table and flow through AppCustomizationProvider — keeps every route synchronized with the Master's published theme.
