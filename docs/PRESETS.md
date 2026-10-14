# Preset system

The generator uses a shared preset catalog for **Location**, **Camera**, and **Style** presets.

## Source of truth

In deployed environments, the catalog is stored in Supabase:

- Table: `public.preset_catalog`
- Migration: `supabase/migrations/20261014_preset_catalog.sql`
- Repository adapter: `lib/supabase/presets.ts`

The application refreshes its in-process lookup cache from Supabase before each generation request. This keeps synchronous prompt helpers compatible while making preset edits visible across separate Vercel serverless instances.

For local development, the legacy `<STORAGE_DIR>/presets.json` remains a fallback and can be migrated on the first admin catalog load.

## Managing presets

Open `/presets` while signed in as an admin.

Admins can:

- Add custom presets.
- Edit built-in or custom presets.
- Duplicate a preset.
- Restore a built-in preset's factory defaults.
- Delete custom presets.

Non-admin signed-in users can read the shared catalog but cannot mutate it. This is enforced both in the API and by Supabase row-level security.

## Preset types

- `location`: spatial layout, architecture, era cues, environmental objects.
- `camera`: lens, angle, point of view, framing language.
- `style`: photographic/illustrative treatment and optional negative prompt.

## Preset record

Each record includes:

- Stable ID and type/key pair.
- Display label and prompt text.
- Optional negative prompt.
- Built-in flag and original factory defaults.
- Created and updated timestamps.

## API

- `GET /api/presets`: return the shared catalog for authenticated users.
- `POST /api/presets`: create a custom preset (admin only).
- `PATCH /api/presets`: edit/reset/duplicate presets (admin only).
- `DELETE /api/presets?id=<id>`: delete custom preset (admin only).

## Changes and rollback

Built-in preset keys remain stable so saved forms and old generation records do not break. Their labels and prompts can be edited; **Reset** restores the source definition in `lib/presetCatalog.ts`. For larger experiments, duplicate a preset rather than overwriting the production default.

All persisted changes are written to Supabase, not a Vercel instance's ephemeral filesystem.
