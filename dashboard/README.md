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

Below that, **NADP tiers** shows the 6-month checkpoint from the commission
multiplier table in the 2026 Agency Compensation guide (Part V). Each tier is a
card with two gas-tank gauges that fill as you close policies:

| Tier | Multiplier | Property + Casualty | Life |
| --- | --- | --- | --- |
| Tier 1 | 0.50 | 50 | 12 |
| Tier 2 | 0.70 | 63 | 18 |
| Tier 3 | 1.00 | 77 | 24 |

Property and Casualty count together because the guide's P/C table is a single
combined policy count. The tank colour tracks the fill — red, amber, blue, then
green at 100% — and the highest tier where both counts land is marked "You are
here". Targets live in `monthSixTiers` in `src/lib/defaultData.ts`; other month
rows from the same table can be dropped in there.

**To-Do** — the task list. See below.

**Prospects** — profiles built from Granola call notes. See below.

## To-Do

One list, split into four sections by how soon something needs doing:

| Section | What lands there |
| --- | --- |
| Now | Due today, already overdue, or worded as urgent |
| This week | Has a day on it inside the next week |
| Soon | Matters, but no date yet |
| Someday | When there's room |

The row of counters at the top is open tasks, due today, overdue, and how many
suggestions are waiting. Below the add-a-task box, **This week** lays out the next
seven days with whatever is due on each, and anything overdue sits above it in red.

Type into the box at the top to add a task by hand. Picking a due date sets the
urgency to match; the dropdown next to it overrides that. Clicking a task's text
opens it for editing — wording, due date, and a notes field that keeps whatever
context came with it.

### Suggestions from Obsidian and Gmail

The dashboard is a static page with no server, so it doesn't reach into the vault
or the mailbox on its own. Feed it the text instead: drop `.md`/`.txt` notes or
saved `.eml` messages on the import box, or paste either straight in. Which parser
runs is worked out from the text (a Gmail message has `From:`/`Subject:` headers at
the top); the Auto/Obsidian/Gmail toggle forces it when pasting something unusual.

Everything found lands in the **Suggestions** panel and stays there until it's
approved or rejected — nothing is added to the list on its own. Each card shows
where it came from and why it was flagged, and the wording, urgency and due date
can be corrected before approving.

| Source | What counts as a task |
| --- | --- |
| Obsidian | Unchecked `- [ ]` boxes (ticked ones are skipped), `TODO:`/`Action item:`/`Next step:` lines, `#todo`-style tags, and bullets under an "Action items"/"Next steps"/"Follow-ups" heading |
| Gmail | Replying to the message, plus any sentence that asks something of you — "can you…", "please…", "let me know", "waiting on you", a deadline. Quoted reply chains and signatures are ignored |

Due dates are read from ISO dates (`2026-08-14`), `Aug 14`, `8/14`, and everyday
phrasing — "tomorrow", "by Friday", "next week", "in 3 days". Urgency comes from
whichever is stronger, the wording ("urgent", "ASAP", "someday") or the date.
Indented lines under an Obsidian task, and the body of an email, are kept on the
task as notes.

Rejecting a suggestion is remembered, so re-importing the same note doesn't put it
back. Tasks already on the list are skipped on import the same way.

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
