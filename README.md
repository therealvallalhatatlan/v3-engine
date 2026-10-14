# Gemini Character Generator

A **Next.js + TypeScript** application for creating persistent AI characters from reference images, then generating new scenes with those characters while preserving their visual identity. The project uses **Google Gemini image generation** for still images and **Replicate** for optional image-to-video animation.

> Repository: `therealvallalhatatlan/v3`

## What it does

The app is built around a simple workflow:

1. Create a character and upload **1–5 reference images**.
2. Store the character's name, description, traits, and reference images.
3. Open the character workspace and generate new images from natural-language scene instructions.
4. Generate scenes with one or multiple characters in the same frame.
5. Control location, camera, aspect ratio, visual style, and style intensity.
6. Save generated images together with generation metadata and prompts.
7. Optionally turn a generated image into an animated video through Replicate.

The deployed application uses Supabase Auth, Postgres metadata, and private Supabase Storage for user-owned characters, references, generated images, edit sessions, and videos. A few legacy/local-development helpers still use the configured filesystem; deployed shared state must not depend on that ephemeral disk.

## Core features

### Character creation

The character creation screen accepts:

- Character name
- Character description / visual identity
- Comma-separated traits
- 1–5 reference images

Reference images are converted client-side to data URLs and sent to the character API. The application stores them under the configured storage directory.

### Character persistence

Characters are stored as JSON records containing:

- `id`
- `name`
- `description`
- `traits[]`
- `imagePaths[]`
- `createdAt`

The storage layer also supports updating and deleting characters.

### AI image generation

The `/api/generate` endpoint builds a structured prompt from the character definition and scene inputs, then calls Gemini's image generation endpoint.

The generator supports:

- Single-character scenes
- Multi-character scenes
- Up to 6 reference images per generation request
- Balanced reference-image selection across multiple characters
- Landscape `16:9`
- Portrait `9:16`
- Camera presets
- Visual style presets
- Adjustable style intensity
- Optional A/B style comparison
- Hungarian / English / mixed scene input normalization
- Scene packages with reusable location and continuity information
- Location fingerprints for continuity tracking

### Character identity locking

Prompt construction is deliberately more structured than a single free-form prompt. The prompt builder separates identity, anchors, physical appearance, outfit, texture, energy, scene, camera, style, and constraints.

For multi-character generations, the prompt additionally enforces:

- All requested characters appear in the same frame
- Characters remain visually distinct
- Faces and heads stay inside the frame
- Widescreen compositions leave adequate headroom
- Bodies, hands, feet, masks, and distinctive costume elements should not be unnecessarily cropped
- Characters must not be merged, replaced, or dropped

### Scene / continuity controls

A scene package can define a reusable location profile containing details such as:

- Location preset
- Location description
- Geometry
- Lighting and time
- Palette and texture
- Fixed props
- Camera continuity
- Continuity notes

Individual continuity flags can lock geometry, lighting, palette, props, and camera rules.

Built-in location presets currently include examples such as:

- Urban street
- Apartment
- Office
- Warehouse
- Rooftop
- Subway
- Forest
- Industrial yard
- Night highway
- Interrogation room
- Budai family room
- 1999 Budapest mall
- East-European McDonald's around 2000
- Land Rover interior POV
- White studio / turn-of-the-century sofa
- Hotel courtyard / pool / cocktail bar
- Vaulted cellar / server room

### Camera presets

The generation API includes built-in camera modes such as:

`closeup`, `wide`, `fisheye`, `handheld`, `dutch`, `birdseye`, `overtheshoulder`, `wormseye`, `speedcam1999`, `security-cam`, `telephoto-stakeout`, `cctv-distorted`, `reflection-pov`, `macro-forensic`, `pov-dashboard`, plus additional built-in Gonzo/Postmodern variants.

### Visual styles

Built-in styles currently include:

- `gritty`
- `noir-bw`
- `vhs-glitch`
- `neo-noir-neon`
- `dreamy-ethereal`
- `graphic-novel`
- `police-speed-photo`

The selected style can be combined with a numeric intensity value from `0` to `100`.

### Dynamic preset manager

Location Presets, Camera presets, and Styles can now be extended **without editing TypeScript source code**.

Open:

```text
/presets
```

The Preset Manager lets you:

- Add custom Location Presets
- Add custom Camera presets
- Add custom Styles
- Edit custom preset label/prompt data
- Delete custom presets
- Keep built-in presets read-only

Each custom preset has:

- `key` - machine-readable identifier, for example `abandoned-mall`
- `label` - human-readable name shown in the UI
- `prompt` - prompt block injected into generation
- `negative` - optional style-specific negative prompt

Custom presets are stored in the shared Supabase table `public.preset_catalog` when deployed. The legacy `<STORAGE_DIR>/presets.json` file is used only as a local-development fallback and can be imported by an admin on first load.

The generator loads them at runtime. Creating a new preset therefore does not require a source-code change or a new preset type declaration.

The dynamic preset API is available through:

- `GET /api/presets`
- `POST /api/presets`
- `PATCH /api/presets`
- `DELETE /api/presets?id=<presetId>`

The generator validates custom camera, style, and location keys server-side before generation.

### Image normalization and storage

Generated images are decoded from Gemini's base64 output and processed with **Sharp**.

When an aspect ratio is selected, the storage layer normalizes the image to:

- `1536 × 864` for landscape `16:9`
- `864 × 1536` for portrait `9:16`

Generated image bytes are saved to private Supabase Storage, and generation metadata is saved to Postgres. Legacy filesystem helpers remain for local-development and migration scenarios.

### Image-to-video generation

The video subsystem uses **Pruna AI P-Video** through Replicate.

A generated gallery image can be used as the required first frame. An optional second gallery image can be supplied as the last frame. The video prompt controls the motion and camera behavior, while the source image itself determines the output canvas ratio. No separate aspect-ratio control is exposed in the video UI.

The current UI keeps the main controls intentionally small:

- First frame from Gallery
- Optional last frame from Gallery
- Motion / video prompt
- Duration: 5, 8, 10, 15 or 20 seconds

Video jobs are persisted in the Supabase `public.video_jobs` table and expose statuses such as:

`queued`, `processing`, `done`, `failed`, `canceled`

The implementation polls Replicate predictions, stores completed MP4 files in private Supabase Storage when possible, and supports canceling an active job. A PostgreSQL function atomically limits each user to two active video jobs.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 App Router |
| Language | TypeScript |
| UI | React 18 |
| Styling | Tailwind CSS 3 |
| Image processing | Sharp |
| Still image generation | Google Gemini 2.5 Flash Image |
| Video generation | Replicate |
| IDs | `uuid` |
| Storage | Supabase Postgres + private Supabase Storage (legacy local fallback for development) |
| Build | Next.js / TypeScript |

The dependency list in `package.json` currently includes Next.js 14, React 18, Tailwind CSS 3, Sharp, UUID, TypeScript, PostCSS, and Autoprefixer.

## Requirements

Before starting, install:

- **Node.js 18+** recommended
- npm, pnpm, or another Node package manager
- A **Google Gemini API key** with access to image generation
- A **Replicate API token** only when video animation is enabled
- A writable local storage directory

Local development can use `STORAGE_DIR`. Deployed user assets and shared metadata use Supabase; do not rely on Vercel's ephemeral filesystem for durable state.

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/therealvallalhatatlan/v3.git
cd v3
```

### 2. Install dependencies

With npm:

```bash
npm install
```

Or with pnpm:

```bash
pnpm install
```

### 3. Configure environment variables

Create a `.env.local` file in the project root.

Minimum configuration:

```env
GEMINI_API_KEY=your_gemini_api_key
STORAGE_DIR=./storage
```

For animation:

```env
REPLICATE_API_TOKEN=your_replicate_token
REPLICATE_VIDEO_MODEL_VERSION=prunaai/p-video
```

Optional Replicate configuration:

```env
REPLICATE_API_BASE_URL=https://api.replicate.com/v1
REPLICATE_INPUT_IMAGE_KEY=image
REPLICATE_INPUT_PROMPT_KEY=prompt
REPLICATE_INPUT_DURATION_KEY=duration
REPLICATE_INPUT_LAST_FRAME_KEY=last_frame_image
```

### Environment variable reference

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini image-generation API key |
| `STORAGE_DIR` | Yes in a normal setup | Root directory for characters, reference images, generated images, animation files, and custom presets |
| `REPLICATE_API_TOKEN` | Only for video | Replicate authentication token |
| `REPLICATE_VIDEO_MODEL_VERSION` | Optional for video | Replicate model slug (`owner/name`) or model version identifier. Defaults to `prunaai/p-video`. |
| `REPLICATE_INPUT_LAST_FRAME_KEY` | No | Input field name for the optional last-frame image. Defaults to `last_frame_image`. |
| `REPLICATE_API_BASE_URL` | No | Replicate API base URL override |
| `REPLICATE_INPUT_IMAGE_KEY` | No | Input field name expected by the selected Replicate model |
| `REPLICATE_INPUT_PROMPT_KEY` | No | Prompt field name expected by the selected Replicate model |
| `REPLICATE_INPUT_DURATION_KEY` | No | Duration field name expected by the selected Replicate model |

> **Important:** Do not commit `.env.local` or API keys to Git.

### 4. Prepare the storage directory

The application creates required directories automatically when storage is initialized. A typical local development setup is:

```text
storage/
├── characters.json
├── presets.json
├── images/
├── generated/
└── ...
```

You can also point `STORAGE_DIR` at an absolute filesystem path.

Example on Windows PowerShell:

```powershell
$env:STORAGE_DIR="L:\ai-storage"
```

Example in `.env.local`:

```env
STORAGE_DIR=L:\ai-storage
```

The path must be writable by the Node.js process.

### 5. Start the development server

```bash
npm run dev
```

Or:

```bash
pnpm dev
```

Then open:

```text
http://localhost:3000
```

The preset manager is available at:

```text
http://localhost:3000/presets
```

## Production build

Build the application:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

Equivalent pnpm commands:

```bash
pnpm build
pnpm start
```

## Application structure

The application uses the Next.js App Router.

```text
app/
├── api/
│   ├── animations/
│   │   └── ...
│   ├── characters/
│   ├── generate/
│   ├── generated/
│   ├── gemini-models/
│   └── presets/
├── character/
│   ├── new/
│   └── [id]/
├── presets/
│   └── page.tsx
├── error.tsx
├── global-error.tsx
├── globals.css
├── layout.tsx
└── page.tsx

lib/
├── animationProviders/
│   └── replicate.ts
├── camera.ts
├── fileUtils.ts
├── gemini.ts
├── paths.ts
├── presetStore.ts
├── promptBuilder.ts
├── sceneMapper.ts
├── storage.ts
└── style.ts

data/
types/
```

## Main routes

### UI routes

`/`  
Character index. Lists the stored characters and links to their workspaces.

`/presets`  
Preset Manager for adding and maintaining custom Location, Camera, and Style presets.

`/character/new`  
Create a new character from description, traits, and 1–5 uploaded reference images.

`/character/[id]`  
Character workspace containing generated imagery, gallery functionality, animation controls, and the dynamic preset selections.

### API routes

`POST /api/characters`  
Create a character.

`GET /api/characters`  
List characters.

`POST /api/generate`  
Generate a still image from one or multiple characters.

`GET /api/generated/[...path]`  
Serve generated image assets from local storage.

`GET /api/generated/[characterId]/list`  
List generated images for a character.

`GET /api/presets`  
Return built-in and custom Location, Camera, and Style preset definitions.

`POST /api/presets`  
Create a custom preset.

`PATCH /api/presets`  
Update a custom preset.

`DELETE /api/presets?id=<presetId>`  
Delete a custom preset.

`POST /api/animations/create`  
Create a Replicate animation job.

`GET /api/animations/[characterId]/[jobId]/status`  
Check an animation job's current status.

`POST /api/animations/[characterId]/[jobId]/cancel`  
Cancel a provider-side animation job.

`GET /api/animations/[characterId]/list`  
List saved animation jobs for a character.

## Generation request model

A generation request can contain fields such as:

```json
{
  "characterIds": ["character-1", "character-2"],
  "location": "late-night Budapest street",
  "mood": "tense",
  "actionPrompt": "the two characters argue beside a parked car",
  "camera": "wide",
  "aspectRatio": "landscape-16-9",
  "style": "gritty",
  "styleIntensity": 75,
  "compareStyle": "vhs-glitch",
  "scenePackage": {
    "locationProfile": {
      "preset": "urban-street",
      "detail": "wet street, sodium lamps, old storefronts"
    },
    "continuity": {
      "lockGeometry": true,
      "lockLighting": true,
      "lockPalette": true,
      "lockProps": false,
      "lockCameraRules": false
    },
    "shotTemplate": "establishing-wide"
  }
}
```

The endpoint validates IDs, camera/style selections, aspect ratio, scene package values, and style intensity before prompt generation. Custom preset keys are accepted when they exist in the preset store.

## How prompt generation works

The prompt builder converts each stored character into a **Character DNA** representation. It then combines that information with the scene package, camera preset, style block, negative constraints, and multi-character composition rules.

The resulting prompt is intentionally verbose and structured because the goal is continuity rather than purely open-ended image generation.

A typical single-character prompt is assembled from sections including:

```text
[IDENTITY]
[ANCHORS - DO NOT CHANGE]
[PHYSICAL]
[OUTFIT]
[TEXTURE]
[ENERGY]
[SCENE]
[SCENE PACKAGE META]
[CAMERA]
[STYLE]
[STRICT CONSTRAINTS]
[NEGATIVE]
```

Multi-character prompts add cast and composition sections so that every requested character is explicitly accounted for.

## Storage model

The current implementation uses local files instead of a database.

Characters are stored in:

```text
<STORAGE_DIR>/characters.json
```

Custom presets are stored in:

```text
<STORAGE_DIR>/presets.json
```

Reference images are stored under:

```text
<STORAGE_DIR>/images/<characterId>/
```

Generated images are stored under:

```text
<STORAGE_DIR>/generated/<characterId>/
```

Multi-character generations may additionally be written to a `duo--...` group directory.

Generated image metadata is stored next to the image as JSON. Metadata can contain the prompt, location, mood, camera, aspect ratio, style, style intensity, character IDs, scene package ID, location fingerprint, shot template, continuity notes, aliases, and creation time.

Animation jobs and video outputs live under:

```text
<STORAGE_DIR>/generated/<characterId>/animations/
```

## Development notes

### Local filesystem dependency

`lib/paths.ts` defaults the storage root to `E:/ai-storage` when `STORAGE_DIR` is not set. For portability, set `STORAGE_DIR` explicitly in `.env.local` for local development and deployment environments.

### Reference image limits

Character creation accepts up to 5 uploaded images. The Gemini generation layer uses at most 6 reference images in a single request and balances selection across characters for multi-character scenes.

### Dynamic presets

Preset changes are stored in the shared `public.preset_catalog` table. Only admins can create, edit, duplicate, reset, or delete shared presets; signed-in users can read the catalog for generation. The legacy `presets.json` file is a local-development fallback, not the deployed source of truth.

Saved generation recipes are stored per user in `public.generation_presets`, with separate global and per-character scopes. Old browser-local recipes are imported on first load when they are missing from the database.

### Aspect ratio handling

Gemini is explicitly requested to render either `16:9` or `9:16`. The application then uses Sharp to normalize the stored image dimensions to a fixed target size.

### Animation model flexibility

The Replicate adapter is intentionally configurable because different video models expose different input field names. Use the `REPLICATE_INPUT_*` environment variables when the selected model expects field names other than `image`, `prompt`, or `duration`.

## Troubleshooting

### `GEMINI_API_KEY not set`

Set `GEMINI_API_KEY` in `.env.local`, then restart the Next.js dev server.

### `REPLICATE_API_TOKEN is not set`

The still-image generator does not require Replicate. This error only affects animation functionality. Add `REPLICATE_API_TOKEN` when video generation is enabled.

### `REPLICATE_VIDEO_MODEL_VERSION is not set`

Animation also requires `REPLICATE_VIDEO_MODEL_VERSION`. The adapter accepts either a model slug such as `owner/name` or a version identifier.

### Storage directory is not writable

Check `STORAGE_DIR` and verify that the Node.js process has read/write access. On Windows, confirm that the path exists and is accessible by the account running the development server.

### A new preset does not appear in the generator

Use the Preset Manager's **Refresh** button, then refresh the character workspace. The `/api/presets` endpoint is explicitly dynamic and is not statically cached.

### A custom preset is rejected by generation

Make sure the preset exists in `public.preset_catalog`; confirm that the key uses lowercase letters, numbers, and hyphens. Preset writes are admin-only and the generator validates keys server-side.

### Generated images are cropped unexpectedly

The application normalizes generated images with Sharp using `fit: cover`. The crop is centered. For multi-character landscape scenes, the prompt builder explicitly asks the model to keep both heads, faces, and bodies comfortably inside the frame before post-processing.

### Replicate returns HTTP 402

The animation adapter surfaces provider billing failures as a `402` response. Check the Replicate account billing/credit status.

## Security considerations

The deployed app uses Supabase Auth, per-user Postgres records and private Supabase Storage, with row-level security on user-owned data. The remaining production-hardening priorities are:

- Complete integration tests for credit, preset, background-reference and video-job flows
- Rate limits and abuse monitoring for image generation and conversational edits
- A dedicated durable job queue for image generations that currently run synchronously
- More granular observability for generation latency, provider failures and storage cleanup
- Review of every remaining server-side write path and RLS policy

API keys must remain server-side and should never be exposed to client code.

## Conversational image editing

The character workspace now includes a Gemini-powered image editing chat.

The flow is:

`generated image → edit instruction → edited image → next edit`

Each edit is stored as a new generated-image version with a parent link. Gemini 3.1 Flash Image is used through the Interactions API so the edit session can continue with `previous_interaction_id`. When that server-side interaction is no longer available, the application falls back to the current image plus local edit history.

The editor supports:

- localized changes such as removing or adding objects
- pose and environmental changes
- adding existing system/user characters during an edit turn
- adding up to 4 ad-hoc reference images during an edit turn
- persistent edit-session chat history
- 1 credit per successful edit

Database setup requires:

```text
supabase/migrations/20260928_image_edit_chat.sql
```

The same SQL is also included at the end of `supabase/schema.sql` for fresh installs.

## Current limitations

This repository is an evolving visual-production engine rather than a finished end-to-end visual bible. Current limitations include:

- Still-image generation runs synchronously in the image-generation route
- The universe-wide project, asset, scene and shot database is not yet implemented
- The gallery supports browsing but not production statuses such as selected / approved / final
- Bulk storyboard generation and print-ready batch export are not yet implemented
- Video generation depends on the configured external Replicate model and account balance
- The GitHub Actions build check has recently failed before reporting runner steps; verify the runner/CI status independently of Vercel preview builds

## License

No license file is currently declared in the repository. Treat the code as **all rights reserved** unless the project owner adds an explicit open-source license.

## Project status

Active development. The repository description is currently **"gemini illustration engine"** and the default branch is `main`.
