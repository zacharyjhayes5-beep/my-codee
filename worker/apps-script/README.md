# Connecting the BSA Lead List spreadsheet

This is the one part nobody can do for you, because it happens inside your own
Google account. It takes about five minutes and you only ever do it once.

You will not need to edit any code. You copy one file, paste one password you
invent, press Deploy, and send back one link.

---

## Step 1 — Open the spreadsheet

Open **BSA Lead List** in Google Sheets, the same spreadsheet you already use.

Check that it has a tab named exactly **BSA Leads**. If the tab is named
something else, rename it to `BSA Leads`.

## Step 2 — Open the script editor

In the menu bar click **Extensions → Apps Script**.

A new tab opens with a code editor. There will be a file called `Code.gs`
containing a few lines of sample code.

## Step 3 — Paste in the script

1. Click once inside the code area.
2. Select everything (**Ctrl+A**) and delete it.
3. Open the file `worker/apps-script/Code.gs` from this project, copy all of it,
   and paste it in.
4. Click the **save** icon (💾).

## Step 4 — Set your password

This is a password you make up. It stops anyone else writing to your sheet.

1. In the left sidebar click the **gear icon** (⚙ Project Settings).
2. Scroll down to **Script Properties**.
3. Click **Add script property**.
4. In **Property** type exactly: `WEBHOOK_SECRET`
5. In **Value** type a long random password — 20+ characters, letters and
   numbers, no spaces. Make it up, or use a password manager.
6. Click **Save script properties**.

**Keep this password.** You will need it in step 6. Do not put it in an email,
a document, or a chat message.

## Step 5 — Deploy it as a Web App

1. Top right, click **Deploy → New deployment**.
2. Click the **gear icon** next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description**: `BSA Leads mirror`
   - **Execute as**: **Me**
   - **Who has access**: **Anyone**
4. Click **Deploy**.
5. Google will ask you to authorise it. Click **Authorize access**, choose your
   account, and if you see "Google hasn't verified this app", click
   **Advanced** → **Go to (project name)** → **Allow**. This is normal for a
   script you wrote yourself.
6. Copy the **Web app URL**. It looks like
   `https://script.google.com/macros/s/AKfy...../exec`

> **"Who has access: Anyone" is safe here.** The script refuses every request
> that does not carry your password, and it never returns any data — only
> "ok" or an error.

## Step 6 — Send the two values back

Give Claude:

1. **The Web app URL** from step 5 — this one is fine to paste in chat.
2. **The password** from step 4 — **do not paste this in chat.**

For the password, Claude will set up a one-time handoff the same way the
dashboard token was handled, so it goes straight into the Worker's secret
storage without appearing anywhere it could be read later.

---

## What happens after that

Claude will:

- store both values as Cloudflare Worker secrets
- apply the outbox table to the production database
- deploy the updated Worker
- run the backfill so the leads already in the system appear in your sheet
- confirm the rows arrived

From then on it is automatic. Every weekday the same job that creates your
leads also writes them to **BSA Leads**.

## Things worth knowing

- **Your existing rows are safe.** The script only ever adds new rows or
  updates the row for a parcel it already wrote. It never deletes anything.
- **No duplicates.** The parcel number is the key. The same property can never
  appear twice, even if the system retries.
- **If you type a phone number into the sheet, it stays.** The system sends a
  blank phone column, and a blank never overwrites something you filled in.
- **If Google is down, nothing breaks.** Your dashboard carries on exactly as
  normal and the unsent rows go out on the next run.
- **If your sheet already has columns**, the script matches them by name and
  leaves your layout alone. Any extra columns of your own are untouched.
