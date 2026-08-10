# CLAUDE.md — Hayes Agency

Context for future sessions in this folder. Read this before making changes.

## Repository layout

This repo holds **two separate apps**. Don't mix them.

| Path         | What it is                                                           |
| ------------ | -------------------------------------------------------------------- |
| `website/`   | Public, client-facing marketing site for Hayes Agency (Astro + Tailwind). |
| `dashboard/` | Pre-existing **internal** agency dashboard (React + Vite). Not client-facing. |

`.github/workflows/deploy-pages.yml` currently publishes **`dashboard/`** to GitHub
Pages at `/my-codee/`. The website has no deploy pipeline yet — see Open questions.

## The business

- **Hayes Agency**, a Farm Bureau Insurance agency in **Grand Rapids, Michigan**.
- Owner/agent: **Zachary Hayes**. Voice is a local owner, not a call center.
- Lines written: **auto, home, life, business**.
- **No premium calculator, no rate estimator, no instant online quotes, ever.**
  Real quotes route through a scheduled call. This is a product rule, not a
  to-do — don't "improve" the quote page by adding one.

## Website tech

- **Astro 7**, static output (`output: 'static'`). No UI framework — `.astro` only.
- **Tailwind CSS v4** via `@tailwindcss/vite`. All theming lives in
  `src/styles/global.css` under `@theme` — there is no `tailwind.config.js`.
- Fonts self-hosted via `@fontsource-variable/*` (no Google Fonts request).
- `sharp` for build-time image optimization through `<Image />`.

Commands (run inside `website/`):

```
npm run dev      # local dev server
npm run build    # static build to website/dist
npm run preview  # serve the built site
```

## Design system

Clean, modern, trustworthy. **Mobile-first** — most visitors are on phones.

### Brand colors

Three brand colors plus neutrals. Defined as CSS vars in `src/styles/global.css`.

| Token           | Hex       | Use                                                        |
| --------------- | --------- | ---------------------------------------------------------- |
| `brand-green`   | `#1B5E4B` | Primary. Nods to Farm Bureau's agricultural roots. Primary buttons, links, footer. |
| `brand-navy`    | `#12263F` | Headings, dark sections, body text at full strength.        |
| `brand-gold`    | `#C98A16` | Accent only. Small highlights, icon accents, underlines. **Never** a large fill. |
| `sand`          | `#FAF8F4` | Warm off-white page/section background.                     |
| `ink` / `muted` | `#1F2933` / `#5B6672` | Body copy / secondary copy.                     |

Rules: one primary CTA per screen region; gold never carries text on white
(fails contrast) — use it as a rule, dot, or icon fill.

### Type

- **Headings: Fraunces Variable** (serif, warm, optical sizing). Weights 500–700.
- **Body: Public Sans Variable** (humanist sans). Weights 400–600.
- Scale: `text-sm 0.875 / base 1 / lg 1.125 / xl 1.25 / 2xl 1.5 / 3xl 1.875 /
  4xl 2.25 / 5xl 3rem`. Body copy caps at `max-w-prose` (~65ch).

### Spacing scale

4px base. Stick to `2 3 4 6 8 12 16 20 24 32` — avoid arbitrary values.

- Section rhythm: `py-16 md:py-24`.
- Page gutter: `px-5 md:px-8`, content `max-w-6xl mx-auto` (`.container-page`).
- Card padding: `p-6 md:p-8`. Radius: `rounded-xl` (cards), `rounded-lg` (inputs/buttons).

### Component conventions

Shared pieces live in `src/components/`. Reuse before adding:
`Button`, `Section`, `Card`, `CTASection`, `LeadForm`, `Header`, `Footer`, `Hero`.

## Performance rules

- Ship as close to zero JS as possible. Current runtime JS: mobile nav toggle +
  form submit handler, both small inline scripts. No hydrated components.
- Images: `<Image />` from `astro:assets`, AVIF/WebP, explicit width/height.
  Hero image eager + `fetchpriority="high"`; **everything below the fold
  `loading="lazy"` and `decoding="async"`.**
- No web fonts over the network, no analytics/chat widgets without asking.

## Content & data

- Site-wide facts (phone, email, address, hours, form endpoint) live in
  **`src/config.ts`** — single source of truth, never hardcode in a page.
- Coverage pages are generated from **`src/data/coverage.ts`** via
  `src/pages/coverage/[slug].astro`. Add a line of business by adding a data
  entry, not a page.
- Resources posts are Markdown in `src/content/resources/`, typed by the
  content collection in `src/content.config.ts`.

## Forms

- `LeadForm` posts to `FORM_ENDPOINT` in `src/config.ts` — **placeholder**
  (`https://example.com/hayes-agency/leads`). Swap for the real endpoint
  (Formspree / Netlify Forms / agency CRM) before launch.
- Works without JS (native POST). A small script upgrades it to `fetch` +
  inline success message. Honeypot field for spam. No PII touches
  localStorage or analytics.

## Decisions made

- Static site, no CMS — content volume is low, editing files is cheaper.
- Coverage is one hub page + four detail pages (better SEO per line of business
  than a single long page).
- Quote page collects a lead and sets expectations that a person calls back; the
  "schedule a call" CTA points at `CALENDAR_URL` in config.
- Dashboard left alone — it's internal and unrelated.

## Open questions for the owner

Marked `TODO(owner)` in `src/config.ts`:

- Real phone, email, street address, office hours, license #.
- Scheduling link (Calendly or similar) for "Schedule a call".
- Real lead-form endpoint / where leads should land.
- Headshot + any Farm Bureau brand assets the corporate brand guide requires.
- Where the site should deploy (Pages already serves the dashboard at the repo
  root path, so the site needs its own host or a path split).
