# Agency Dashboard

Book-of-business tracker for a Farm Bureau Michigan agency. React + TypeScript + Vite,
deployed to GitHub Pages. All data lives in the browser's local storage — nothing is sent
anywhere, and the data stays on the machine and browser you enter it on.

## Tabs

**Progress** — policy counts against the goal for the current period (Property 40,
Casualty 40, Life 25). Both period dates are editable at the top; everything else on the
tab is derived from them:

- *Pace* compares where you are against where you'd be if the goal were spread evenly
  across the period. The tick mark on each meter is that same on-pace point.
- *Needed per week* is the remaining policies divided by the weeks left.
- Premium tracking is there but has no goal set — enter one per line to turn on the meter.

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
