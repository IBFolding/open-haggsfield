# Open Haggsfield

Turn AI generations into a film you can actually edit.

An independent React/Vite/Express studio with MiniMax H3 through Comfy Cloud. Generate alternate takes from text or a reference frame, compare them, replace a selected section and retain originals and undo history.

**Pre-release:** real MiniMax generation, private delivery, comparison, replacement, undo, private cloud save/restore and browser movie export have been exercised with an isolated test account. Demonstration: https://open-haggsfield.vercel.app. Customer generation remains gated while paid billing is completed. A MiniMax success does not verify the separate Higgsfield Seedance/Cinema integrations.

## Features

- Scene/shot organization, searchable bins, alternate takes and multitrack editing.
- Trims, split, ripple edits, partial replacement, framing, sound levels and undo/redo.
- Encrypted account-owned provider keys, cost quotes, durable request tokens and conservative recovery of uncertain submission outcomes.
- Comfy MiniMax H3 family text/image workflows with authenticated private video delivery and automatic return as a take.
- Supabase private media and revisioned manual checkpoints; restore downloads sources into a separate local project.
- Browser MP4/WebM review exports, editable title overlays and FCPXML interchange.
- Stripe BYOK/included-credit membership implementation with signature verification, ownership, reservations and event deduplication; real hosted payment remains unverified.
- Development-only local MCP project/edit control, without billable actions or credential access.

## Local setup

Use Node 22.13+ and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev -- --host 127.0.0.1 --port 4191 --strictPort
```

Open http://127.0.0.1:4191. Enter credentials locally, never in chat or a public issue. Local development uses SQLite without DATABASE_URL. Creating/importing projects and editing local browser-compatible media do not require a provider account. Sources persist in this browser's IndexedDB; retain originals and project backups.

For hosted storage, follow `supabase/README.md` with your own project. Set DATABASE_URL to its appropriate pooler connection, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and a stable VAULT_KEY_BASE64 containing 32 random bytes encoded as base64. Keep these server-side and securely backed up. Never prefix secrets with VITE_. Losing the vault key prevents decryption of saved provider keys.

Standalone hosting: `npm run build`, then `npm start`. Vercel routing is in `vercel.json`; link your own project and set APP_ORIGIN to its HTTPS origin. Hosted runtime requires Postgres and private Supabase storage, rather than local SQLite.

## Generation and billing setup

Create a studio account and retain its recovery code. Connect your Comfy API key from Account & keys. Comfy provider charges are separate from studio membership. The implementation requires an active membership for billable generation/cloud uploads. Local editing and recovery of existing private media remain available without one.

Configure your own Stripe sandbox API key, webhook secret and monthly price IDs using `.env.example`. Internal plan IDs are byok, starter, creator (Mid), studio (Pro). Prices alone do not activate billing. Configure a signed webhook at `/api/studio/stripe/webhook`. Verify Checkout, qualifying paid invoices, membership/credit grants, duplicate events, cancellation and refunds before live use. Never grant membership from a redirect.

Enable COMFY_GENERATION_ENABLED only after reviewing membership, funding and cost controls. Default concurrency is one. Explicitly authorize each quoted request. Estimates are not reconciled invoices. Never automatically retry a failed or uncertain paid submission; reconcile its original provider request. Comfy partner-node credentials are passed server-side through extra_data as well as transport authentication.

Included Higgsfield generation is disabled by default and needs separate HF_PLATFORM_CREDENTIALS, verified pricing/rate expiry and spending cap. It never substitutes for a user's BYOK key. `npm run generate:seedance` is a separate billable SDK example; it is not an installation check.

## Checks

```sh
npm test
npm run check:server
npm run build
npm run test:postgres
npm run check:launch
```

The current suite has 92 passing tests, including PostgreSQL fixtures, provider ownership, deduplication, quotes/reservations, billing fixtures and cloud revision/recovery checks. Tests use mocked providers and do not spend generation credits. `check:launch` deliberately reports pre-release blockers; configuration presence is not external verification.

## Boundaries

Cloud copies are manual checkpoints, not continuous sync. Limits are 50 MB per source and 1 GB per account. Browser exports can exceed this per-file cloud limit; download them locally. Export runs in real time and needs a visible tab. It is a review pipeline, not frame-accurate offline mastering. FCPXML application import, physical cross-device restore, masked inpainting, commissioned voice/music, live Stripe settlement and operational release review are not claimed complete.

The included Vercel schedule is a daily authenticated recovery fallback. Browser polling provides interactive status. More frequent unattended delivery needs an appropriate worker/schedule. Set CRON_SECRET server-side. Preserve ownership, quote and unknown-outcome safeguards.

## License and independence

Application code: MIT, see LICENSE. See ASSETS.md for sample-image and dependency notices. Open Haggsfield is independent and not affiliated with Higgsfield, Comfy, MiniMax, Stripe or Supabase. Provider services/models remain subject to their own terms. Private films, scripts, generation assets, environment files, account state and deployment configuration are excluded.
