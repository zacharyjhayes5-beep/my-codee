# Accounts directory

Accounts is an opt-in directory alongside Leads and Pipeline. Add an existing
household or create one with just a name. Removing it from Accounts hides its
membership; adding that household again brings its documents and quotes back.

The right panel has Information, Documents, and Quotes. Information uses the
same household/contact records as Leads. Account quotes are independent records:
they do not update opportunities, workbenches, policies, or production totals.

## Local documents

Use Documents → Choose Folder in a browser that supports the File System Access
directory picker (desktop Chrome/Edge). Select a dedicated folder. Files are
copied, never moved, into `accounts-files/<account UUID>/<document UUID>.<ext>`.
The app keeps the readable filenames separately, so renaming does not break links.

The folder permission is stored locally in IndexedDB's meta store. It is not
included in exports. If permission expires, use Reconnect Folder. After restoring
a backup, select the original folder, or the restored copy containing its
`accounts-files` subfolder. Missing files stay in the list with a recoverable error
when opened. The app never uploads these files to the Worker or another service.

Dashboard backup format 5 includes account membership, quote records, and document
metadata/relative paths. It does **not** include file bytes. Back up the managed
folder separately along with the dashboard JSON backup. Formats 1–4 still import.

## Storage and verification

IndexedDB version 8 adds `accounts`, `accountDocuments`, and `accountQuotes`.
`commitAccountChanges` performs atomic acknowledged writes before publishing
changes to the UI. Failed uploads clean up their incomplete managed copy.
Managed file paths are validated before reads/deletes, including after restore.

Run from `dashboard/` (direct Node entrypoints avoid Windows npm shim problems
in the `01 Projects & Code` path):

```powershell
node ./node_modules/typescript/bin/tsc -b
node ./node_modules/vite/bin/vite.js build
node ./node_modules/oxlint/bin/oxlint
node ./node_modules/vitest/vitest.mjs run
```

Automated Accounts checks cover upgrade from database v7, failed transactions,
membership reuse, contact/age persistence, quote isolation, file contents and
duplicate names, permission/write failures, missing files, path validation, and
backup/restore. File-system tests use an in-memory implementation of the browser
handle interface; they do not claim native OS picker coverage.

Local browser checks used a synthetic `Test Household — local QA` account,
confirmed saved details/quotes after reopening, DOB-based age, and a 390-pixel
mobile panel without horizontal page overflow. The native directory picker could
not be driven by the in-app browser automation. Before using real documents,
verify choosing a folder, dropping a PDF/photo/office file, reopening after a
browser restart, and reconnecting it in desktop Chrome or Edge.

No deployment is included in this change.
