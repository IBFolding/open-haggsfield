# Supabase persistence: implemented, hosted verification pending

The asynchronous Postgres adapter, encrypted key vault, private media routes and revision-controlled manual cloud checkpoints are implemented. Tests use the real PGlite Postgres engine plus storage/provider fixtures. No hosted project is connected or migration applied.

## Setup

1. Enter SUPABASE_URL, DATABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the ignored .env.supabase.local file locally. Use the transaction-pooler URI from the project Connect dialog. Keep all credentials server-side; never use VITE-prefixed secrets.
2. Configure VAULT_KEY_BASE64 (32 random bytes, base64) on the server and preserve it securely: changing or losing it makes existing provider keys unreadable. Configure APP_ORIGIN for the actual HTTPS origin.
3. Run `npm run migrate:supabase` against a dedicated staging project. This creates the private haggsfield schema and haggsfield-media bucket. It does not transfer existing SQLite accounts or media. Do not point at an unrelated shared project.
4. Start the Node backend with `npm start` after `npm run build`. DATABASE_URL selects Postgres; without it local development uses SQLite. Vercel refuses SQLite, but Vercel function routing and a scheduler still need deployment configuration.
5. For serverless scheduling, configure CRON_SECRET and invoke GET /api/studio/internal/poll with Authorization: Bearer <secret>. This polls existing requests and cleans abandoned uploads, never submits new generation. Never put the secret in a URL. The standalone Node process schedules this automatically.
6. Verify two-account isolation, signed upload/confirmation, cloud save, stale-revision rejection, restore on another device, restart recovery and Stripe sandbox webhook replay on the actual hosted origin before paid launch.

## Guarantees and limits

- Server-only schema with RLS and revoked public-client access. Application queries enforce account ownership.
- Provider credentials stored as AES-GCM envelopes, not plaintext.
- Transactions use a database advisory lock; operation leases coordinate separate processes. Unknown provider submission outcomes are retained without automatic retries.
- Private signed media URLs, allowlisted types, 50 MiB/file and 1 GiB/account. Pending uploads reserve the maximum file size until confirmed and expire after signed upload tokens expire.
- Active membership required for new uploads/checkpoints. Previously saved copies remain readable after membership expires.
- Manual checkpoints, 200 projects/account. Restoring creates a separate local project; no continuous sync or cloud version history.

Run `npm run test:postgres` for local SQL and API isolation tests, and `npm test` for the complete fixture suite. `npm run check:launch` reports configuration booleans without exposing secrets and remains blocked until hosted flows are verified.

Official references: [Database connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
