@AGENTS.md

# StudentEconomy — Project Rules

## Secrets
- All credentials belong in `.env.local`. Never commit `.env.local`.
- Never print, expose, or commit secrets. Check staged changes before each commit.

## Payments
- Compute PayPal payment amounts server-side from database records, never from client input.
- Record successful orders only after PayPal confirms capture status `COMPLETED`.
- AI may recommend payments, but users must explicitly approve them.

## Data & UI
- Label all sample-data screens clearly (records with `is_sample = true`).
- Do not hardcode university names or student identities in UI components.
- Database is shared with production: no `DROP`, `TRUNCATE`, unrestricted `DELETE`, or resets.
  Schema uses `CREATE TABLE IF NOT EXISTS`; seeds are insert-only (`ON CONFLICT DO NOTHING`).

## Working style
- Edit only necessary files. Keep responses concise.
- No unnecessary dependencies (`pg`, `@types/pg` are allowed).
- Scripts: `npm run db:schema`, `npm run db:seed -- --confirm`.
