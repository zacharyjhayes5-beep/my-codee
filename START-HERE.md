# Running this on your own computer

Right now the dashboard gets worked on in the cloud, which is why it can't see
anything on your Mac — not your Obsidian vault, not your files. Running Claude
Code on your desktop fixes that. It's the same assistant, just pointed at your
own machine instead of a rented one.

No terminal. No code. Four steps, about ten minutes, most of it downloading.

---

## Step 1 — Install the app

Download Claude for your computer:

- **Mac:** https://claude.ai/api/desktop/darwin/universal/dmg/latest/redirect
- **Windows:** https://claude.ai/api/desktop/win32/x64/setup/latest/redirect

Open the file you downloaded and install it like any other app. Launch it and
sign in with the same account you already use.

> Needs a paid Claude plan (Pro, Max, Team or Enterprise). If you're already
> using Claude Code on the web, you have one.
>
> On Windows only, also install Git first: https://git-scm.com/downloads/win
> Macs come with it.

## Step 2 — Open the Code tab

Along the top of the app there are three tabs: **Chat**, **Cowork**, **Code**.

Click **Code**.

## Step 3 — Point it at a folder

Choose **Local** — that's the one that uses your own files.

Then click **Select folder**. What you pick depends on what you want to do:

- **To work on this dashboard:** pick your `Documents` folder. The next step
  pulls the project down into it.
- **To work with your Obsidian notes:** pick your vault folder directly.
  Nothing to download — it can read your notes immediately.

You can open a second session later and point it somewhere else. One session
per folder.

## Step 4 — Paste this

In the message box at the bottom, paste this and hit enter:

```
Clone https://github.com/zacharyjhayes5-beep/my-codee into this folder, then
read CLAUDE.md in the repo root and tell me what this project is, what's
already built, and what's still open. I'm not a programmer, so keep it plain.
```

It'll download the project and catch itself up. `CLAUDE.md` is a file I wrote
into the repo that holds everything from our sessions — your goal numbers, the
tier decisions, why things are built the way they are, and what's still
unanswered. It reads that automatically from then on.

To see the dashboard running on your own machine, ask:

```
Start the dashboard so I can see it in a browser.
```

---

## Then what

Things that are now possible that weren't before:

**Your vault, actually read.** Point a session at your Obsidian folder and ask
for something that would take you an hour by hand:

```
Read every note in this vault and list every unfinished action item, grouped
by which client or prospect it's about.
```

**Notes matched to the dashboard.** With the vault open:

```
Compare the names in my vault notes against the prospect list in my dashboard
repo and tell me who I've written notes about but never added as a prospect.
```

**Changes you can see instantly.** Working locally, the dashboard reloads as
it's edited — no waiting on a deploy to find out whether you like something.

## A few things worth knowing

**Your work is on GitHub, not on any one computer.** Cloud sessions and local
sessions both push to the same repo, so you can work from either. Ask a local
session to "push my changes" when you're done and the live site updates itself.

**The dashboard's data is a different story.** Your policies, prospects and
tasks live in your *browser*, not in the repo. They don't sync between
machines, and clearing site data wipes them. Worth asking for a backup button
before you have a lot in there.

**Nothing carries over from our conversation.** A local session starts cold —
that's what `CLAUDE.md` is for. If something important gets decided in a new
session, it's worth saying "add that to CLAUDE.md" so it isn't lost next time.

**You can be blunt.** "That looks bad," "make it bigger," "I don't understand
what this does" are all useful and normal. It's not a search box.
