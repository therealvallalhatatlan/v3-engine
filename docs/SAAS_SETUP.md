# V3 SaaS setup

## 1. Supabase

Open the Supabase SQL Editor and run:

`supabase/schema.sql`

This creates the multi-user data model, RLS policies, the private `v3-media` bucket, the 3-credit signup grant, and atomic credit/character-slot functions.

## 2. Auth

Enable Email auth in Supabase.

Add the deployed application URL plus `/auth/callback` to the Supabase Auth redirect configuration.

The application uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## 3. Legacy character migration

The GitHub repository does not contain the original two character records or reference images. `data/characters.json` is empty in the repository.

The old application stored character data under `STORAGE_DIR`.

From the V3 project directory, set `STORAGE_DIR` and `SUPABASE_SERVICE_ROLE_KEY`, then run:

`node scripts/migrate-legacy-characters.mjs --limit=2`

The script imports the first two legacy characters as `system` characters and uploads their reference images to Supabase Storage. It also writes `migration-result.json`.

Never expose or commit the service-role key.

## 4. Vercel

Set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`

The service-role key is only needed for local migration/admin tooling.

## 5. Product rules

### Free

- 3 one-time signup credits
- two system characters
- Basic generator
- no custom characters
- no advanced continuity/preset controls
- no video UI

### Paid

- purchased generation credits
- purchased custom-character capacity
- advanced generator controls
- system + own custom characters

### Credit accounting

- normal image = 1 credit
- A/B compare = 2 credits
- failed generation refunds the reserved credits

The initial Stripe package defaults are:
- Starter: 30 credits, 0 character slots, 2490 HUF
- Creator: 75 credits, 1 character slot, 4990 HUF
- Studio: 200 credits, 2 character slots, 9990 HUF
- Pro: 500 credits, 5 character slots, 19990 HUF
- Big: 1000 credits, 10 character slots, 34990 HUF

These defaults can be overridden with CREDIT_PACKAGES_JSON in the deployment environment.

## 6. Persisted generation tools

The canonical `supabase/schema.sql` includes the shared preset catalog (`preset_catalog`), per-user saved generation recipes (`generation_presets`), persistent video jobs (`video_jobs`), and the atomic video concurrency function. If you deploy using incremental migrations rather than the canonical schema, apply all migrations under `supabase/migrations` in chronological order. Do not run only the legacy video migration without the newer `video_concurrency_guard` and `video_jobs_restrict_inserts` migrations. For an existing live deployment, apply the schema/preset/concurrency migrations first, deploy the application revision that creates video jobs through the RPC, and only then apply `20261014010400_video_jobs_restrict_inserts.sql`; it removes the direct-insert policy used by older application revisions.

## 7. Stripe credit purchases

The app uses Stripe Checkout for one-time credit purchases. Stripe Checkout provides the hosted payment page, and fulfillment is handled from the webhook rather than the browser redirect.

Set these Vercel environment variables:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CREDIT_PACKAGES_JSON`

Example:

`[{"id":"starter","name":"Starter","credits":50,"characterSlots":0,"amountHuf":1990},{"id":"creator","name":"Creator","credits":200,"characterSlots":1,"amountHuf":5990},{"id":"studio","name":"Studio","credits":1000,"characterSlots":5,"amountHuf":19900}]`

The amounts above are only an example configuration. Replace them with the pricing you actually want to sell.

Register this webhook endpoint in Stripe:

`https://YOUR-DOMAIN/api/stripe/webhook`

The webhook handles `checkout.session.completed` and asynchronous payment success events, verifies the Stripe signature, and applies the purchase once.

The purchase page is:

`/credits`

Do not put the Stripe secret key or Supabase service-role key in client-exposed variables.
