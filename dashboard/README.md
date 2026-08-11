# Agency Dashboard

Book-of-business tracker for a Farm Bureau Michigan agency. React + TypeScript + Vite,
deployed to GitHub Pages. Single dark theme with neon blue and red accents; pulsing is
reserved for the net commission tile, the current tier, behind-pace pills and the import
drop zone, and all of it stops under `prefers-reduced-motion`.

All data lives in the browser's local storage — nothing is sent anywhere, and the data
stays on the machine and browser you enter it on.

## Tabs

**Progress** — the book of business and everything derived from it.

*Book of business* is the workbook ported over, formulas intact:

```
Gross Commission = Premium x Percentage Earned
Net Commission   = Gross + (Gross x Multiplier)
```

Three books match the workbook's sheets — Personal, Life (adds death benefit
and a running count) and Commercial (company name and notes) — with a month
filter standing in for the twelve monthly sheets. The footer totals mirror the
sheet: total premium, average premium, average commission, plus running gross
and net. Line of business is a dropdown drawn from the guide's rate tables,
each option mapped to a property/casualty/life category.

Everything above and below that table is derived from it. Policy counts and
premium are never typed in twice:

- *Earnings tiles* — net commission, gross commission and total premium for
  policies whose effective date falls inside the goal period.
- *Goals* — policy and premium meters per line. Counts come from the book; you
  set only the targets. The tick on each meter is the on-pace point.
- *Pace* — days left, ahead/behind, and policies needed per week.

**Calendar & To-Do** — month view with events per day, plus a running task list.

**Prospects** — profiles built from Granola call notes. See below.

## Importing Granola notes

Export a note from Granola as Markdown (or plain text), then drop it on the import
box — several at once is fine — or paste the text instead. Each note is read for:

| Field | Where it comes from |
| --- | --- |
| Name | An `Attendees:`/`Client:` line, otherwise the note title (`Zach <> Mike Donnelly`, `Discovery call with Sarah Whitcomb`), otherwise the filename, otherwise a "talked to …" phrase in the body |
| Area | An `Area:`/`Location:` line, a `City, MI` mention, a "lives in …" phrase, or any recognized Michigan city or county |
| Lines of business | Keyword matches for property, casualty and life. Sentences containing a rejection ("not interested in life insurance") are skipped |
| Phone / email | First match in the note that isn't yours |
| Date | The date near the top of the note, or in the filename |

The "Your name" field tells the parser which person in the note is you, so it picks the
other one. Everything it extracts lands in an editable review card before it's saved —
correct anything there, then save.

If a note matches someone already on the list (same name or email), the card offers to
add the note to that existing profile instead of creating a duplicate.

Once saved, every field stays editable on the profile card: name, status, lines of
business, area, phone, email, next step, and the notes themselves. Notes can be added by
hand too.

Statuses: New → Contacted → Meeting Scheduled → Open to Quote → Closed, plus Lost.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # type-check + production build
npm run lint
```

Pushing to `main` deploys via `.github/workflows/deploy-pages.yml`.
