import { useCallback, useEffect, useRef, useState } from "react";
import type { Contact, Prospect } from "../types";
import type { AccountDocument, AccountQuote } from "../lib/accountTypes";
import { useStored } from "../lib/repository";
import { addAccount, addressLabel, ageFromDob, deleteAccountQuote, removeAccount, saveAccountInfo, saveAccountQuote } from "../lib/accounts";
import { blankContact } from "../lib/prospectSchema";
import { linesOfBusiness, lineById } from "../lib/policies";
import { chooseAccountFolder, fileError, folderAccessSupported, previewMime, readAccountFile, removeAccountDocument, renameAccountDocument, requireAccountFolder, storedAccountFolder, uploadAccountFile, type ManagedDirectory } from "../lib/accountFiles";
import "./AccountsTab.css";

type AccountTab = "Information" | "Documents" | "Quotes";
type Run = (work: () => Promise<void>) => Promise<boolean>;
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function AccountsTab({ onGuardChange }: { onGuardChange: (guard: (() => boolean) | null) => void }) {
  const [accounts] = useStored("accounts");
  const [prospects] = useStored("prospects");
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<AccountTab>("Information");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [infoDirty, setInfoDirty] = useState(false);
  const [quoteDirty, setQuoteDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 800px)").matches);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const directorySearch = useRef<HTMLInputElement>(null);
  const dirty = infoDirty || quoteDirty;
  const guard = useCallback(() => {
    if (busy) { window.alert("Please wait for the current save or file action to finish."); return false; }
    return !dirty || window.confirm("Discard your unsaved account edits?");
  }, [busy, dirty]);
  useEffect(() => { onGuardChange(guard); return () => onGuardChange(null); }, [guard, onGuardChange]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  useEffect(() => { if (selected) panelHeading.current?.focus(); else directorySearch.current?.focus(); }, [selected]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => { if (error) document.querySelector(".accounts-page [role='alert']")?.scrollIntoView({ block: "nearest" }); }, [error]);

  const run: Run = async work => {
    setBusy(true); setError("");
    try { await work(); return true; }
    catch (err) { setError(fileError(err)); return false; }
    finally { setBusy(false); }
  };
  const account = accounts.find(a => a.id === selected && a.active);
  const prospect = prospects.find(p => p.id === account?.prospectId);
  const rows = accounts.filter(a => a.active).map(a => ({ account: a, prospect: prospects.find(p => p.id === a.prospectId) }))
    .filter((row): row is { account: typeof accounts[number]; prospect: Prospect } => !!row.prospect)
    .filter(({ prospect: p }) => `${p.name} ${addressLabel(p)}`.toLowerCase().includes(search.toLowerCase().trim()))
    .sort((a, b) => a.prospect.name.localeCompare(b.prospect.name));
  function open(id: string | null) {
    if (id === selected || !guard()) return;
    setInfoDirty(false); setQuoteDirty(false); setSelected(id); setTab("Information"); setError("");
    if (!id) directorySearch.current?.focus();
  }

  return <div className="accounts-page" aria-busy={busy}>
    {error && !account && !adding && <p className="accounts-error" role="alert">{error}</p>}
    <div className={`accounts-layout${account && prospect ? " has-account" : ""}`}>
      <section className="accounts-directory" aria-label="Account directory" inert={narrow && !!account && !!prospect}>
        <div className="accounts-toolbar">
          <label className="accounts-search">Search accounts<input ref={directorySearch} type="search" placeholder="Name or address" value={search} onChange={e => setSearch(e.target.value)} /></label>
          <button type="button" disabled={busy} onClick={() => { if (guard()) { setAdding(true); } }}>Add Account</button>
        </div>
        <p className="accounts-muted">{rows.length} account{rows.length === 1 ? "" : "s"}</p>
        {rows.length === 0 && <div className="accounts-empty">{search ? "No matching accounts." : "Your accounts, all in one place. Add a prospect to get started."}</div>}
        <ul className="accounts-list">{rows.map(({ account: a, prospect: p }) => <li key={a.id}>
          <button className={`accounts-row${a.id === selected ? " selected" : ""}`} aria-pressed={a.id === selected} onClick={() => open(a.id)}>
            <span className="accounts-initial" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{p.name}</strong><small>{addressLabel(p) || "No address added"}</small></span><span aria-hidden="true">›</span>
          </button>
        </li>)}</ul>
      </section>
      {account && prospect && <aside className="account-panel" aria-labelledby="account-heading">
        <header className="account-panel-header"><div><span className="kicker">Account</span><h2 id="account-heading" ref={panelHeading} tabIndex={-1}>{prospect.name}</h2></div><button onClick={() => open(null)}>Close</button></header>
        <div className="account-tabs" role="tablist" aria-label="Account sections">{(["Information", "Documents", "Quotes"] as const).map((t, index, tabs) => <button
          key={t} id={`account-tab-${t}`} role="tab" aria-selected={tab === t} aria-controls="account-tab-content" tabIndex={tab === t ? 0 : -1}
          onClick={() => { if (t !== tab && guard()) { setInfoDirty(false); setQuoteDirty(false); setTab(t); setError(""); } }}
          onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); const next = e.key === "Home" ? 0 : e.key === "End" ? 2 : (index + (e.key === "ArrowRight" ? 1 : 2)) % 3; (document.getElementById(`account-tab-${tabs[next]}`) as HTMLButtonElement)?.click(); document.getElementById(`account-tab-${tabs[next]}`)?.focus(); } }}
        >{t}</button>)}</div>
        <div id="account-tab-content" className="account-content" role="tabpanel" aria-labelledby={`account-tab-${tab}`}>
          {error && <p className="accounts-error" role="alert">{error}</p>}
          {tab === "Information" && <AccountInformation key={account.id} prospect={prospect} onDirty={setInfoDirty} busy={busy} run={run} />}
          {tab === "Documents" && <AccountDocuments key={account.id} accountId={account.id} busy={busy} run={run} />}
          {tab === "Quotes" && <AccountQuotes key={account.id} accountId={account.id} onDirty={setQuoteDirty} busy={busy} run={run} />}
        </div>
        <footer className="account-panel-footer"><button disabled={busy} className="accounts-text-button" onClick={() => {
          if (guard() && window.confirm(`Remove ${prospect.name} from Accounts? Their household, quotes, and documents will be kept. You can add them back later.`)) void run(async () => { await removeAccount(account.id); setSelected(null); setInfoDirty(false); setQuoteDirty(false); directorySearch.current?.focus(); });
        }}>Remove from Accounts</button></footer>
      </aside>}
    </div>
    {adding && <AddAccountDialog error={error} prospects={prospects} activeIds={accounts.filter(a => a.active).map(a => a.prospectId)} busy={busy} run={run} onClose={() => setAdding(false)} onAdded={id => { setAdding(false); setInfoDirty(false); setQuoteDirty(false); setSelected(id); setTab("Information"); }} />}
  </div>;
}

function AddAccountDialog({ error, prospects, activeIds, busy, run, onClose, onAdded }: { error: string; prospects: Prospect[]; activeIds: string[]; busy: boolean; run: Run; onClose: () => void; onAdded: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState("existing");
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  const choices = prospects.filter(p => !activeIds.includes(p.id) && `${p.name} ${addressLabel(p)}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  return <dialog ref={dialog} className="accounts-dialog" aria-labelledby="add-account-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <h2 id="add-account-title">Add Account</h2>
    {error && <p className="accounts-error" role="alert">{error}</p>}
    <form onSubmit={e => { e.preventDefault(); void run(async () => onAdded(await addAccount(mode === "existing" ? { prospectId: selected } : { name }))); }}>
      <fieldset disabled={busy}><label>Add from<select value={mode} onChange={e => setMode(e.target.value)}><option value="existing">Select existing prospect</option><option value="new">Create new account</option></select></label>
        {mode === "new" ? <label>Account name<input required value={name} onChange={e => setName(e.target.value)} autoComplete="off" /></label> : <>
          <label>Find prospect<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
          <label>Prospect<select required value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose a prospect</option>{choices.map(p => <option key={p.id} value={p.id}>{p.name}{addressLabel(p) ? ` — ${addressLabel(p)}` : ""}</option>)}</select></label>
          {!choices.length && <p>No available prospects match. You can create a new account instead.</p>}
        </>}
        <div className="accounts-actions"><button type="submit">{busy ? "Saving…" : "Add Account"}</button><button type="button" onClick={onClose}>Cancel</button></div>
      </fieldset>
    </form>
  </dialog>;
}

function AccountInformation({ prospect, onDirty, busy, run }: { prospect: Prospect; onDirty: (value: boolean) => void; busy: boolean; run: Run }) {
  const [draft, setDraft] = useState(() => structuredClone(prospect));
  const [baseline, setBaseline] = useState(prospect);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  function change(patch: Partial<Prospect>) { setSaved(false); setDraft(prev => ({ ...prev, ...patch })); }
  function contactChange(id: string, patch: Partial<Contact>) {
    const contact = draft.contacts.find(c => c.id === id);
    change({ contacts: draft.contacts.map(c => c.id === id ? { ...c, ...patch } : c), ...(contact?.isPrimary ? { ...(patch.phone !== undefined ? { phone: patch.phone } : {}), ...(patch.email !== undefined ? { email: patch.email } : {}) } : {}) });
  }
  return <form className="account-info" onSubmit={e => { e.preventDefault(); void run(async () => { await saveAccountInfo(baseline, draft); setBaseline(structuredClone(draft)); setSaved(true); }); }}>
    <fieldset disabled={busy}>
      <label>Account name<input required value={draft.name} onChange={e => change({ name: e.target.value })} /></label>
      <label>Street address<input value={draft.address.line1} onChange={e => change({ address: { ...draft.address, line1: e.target.value } })} /></label>
      <div className="account-field-grid">{(["city", "state", "zip"] as const).map(key => <label key={key}>{key === "zip" ? "ZIP" : key === "city" ? "City" : "State"}<input value={draft.address[key]} onChange={e => change({ address: { ...draft.address, [key]: e.target.value } })} /></label>)}</div>
      <div className="account-field-grid"><label>Primary phone<input type="tel" value={draft.phone} onChange={e => change({ phone: e.target.value, contacts: draft.contacts.map(c => c.isPrimary ? { ...c, phone: e.target.value } : c) })} /></label><label>Primary email<input type="email" value={draft.email} onChange={e => change({ email: e.target.value, contacts: draft.contacts.map(c => c.isPrimary ? { ...c, email: e.target.value } : c) })} /></label></div>
      <div className="accounts-section-heading"><h3>Household members</h3><button type="button" onClick={() => change({ contacts: [...draft.contacts, { ...blankContact(), isPrimary: draft.contacts.length === 0, ...(draft.contacts.length === 0 ? { phone: draft.phone, email: draft.email } : {}) }] })}>Add member</button></div>
      {!draft.contacts.length && <p className="accounts-muted">No household members added.</p>}
      {draft.contacts.map((c, index) => <fieldset className="account-member" key={c.id}><legend>Member {index + 1}{c.isPrimary ? " · Primary" : ""}</legend>
        <div className="account-field-grid"><label>First name<input value={c.firstName} onChange={e => contactChange(c.id, { firstName: e.target.value })} /></label><label>Last name<input value={c.lastName} onChange={e => contactChange(c.id, { lastName: e.target.value })} /></label></div>
        <label>Relationship<input placeholder="e.g. spouse, child" value={c.relationship} onChange={e => contactChange(c.id, { relationship: e.target.value })} /></label>
        <div className="account-field-grid"><label>Phone<input type="tel" value={c.phone} onChange={e => contactChange(c.id, { phone: e.target.value })} /></label><label>Email<input type="email" value={c.email} onChange={e => contactChange(c.id, { email: e.target.value })} /></label></div>
        <div className="account-field-grid"><label>Date of birth<input type="date" max={new Date().toLocaleDateString("en-CA")} value={c.dob} onChange={e => contactChange(c.id, { dob: e.target.value, manualAge: undefined })} /></label>
          {c.dob ? <div className="account-age">Age<strong>{ageFromDob(c.dob) ?? "Check DOB"}</strong><small>Calculated from DOB</small></div> : <label>Age (manually entered)<input type="number" min="0" max="130" step="1" value={c.manualAge ?? ""} onChange={e => contactChange(c.id, { manualAge: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>}
        </div>
        <div className="accounts-actions">{!c.isPrimary && <button type="button" onClick={() => change({ contacts: draft.contacts.map(member => ({ ...member, isPrimary: member.id === c.id })), phone: c.phone, email: c.email })}>Make primary</button>}<button type="button" onClick={() => { if (window.confirm("Remove this household member? Save to apply the change.")) change({ contacts: draft.contacts.filter(member => member.id !== c.id) }); }}>Remove member</button></div>
      </fieldset>)}
      <div className="accounts-save"><button type="submit" disabled={!dirty}>{busy ? "Saving…" : "Save"}</button><span role="status">{saved ? "Saved" : dirty ? "Unsaved changes" : ""}</span></div>
    </fieldset>
  </form>;
}

function downloadFile(file: File, doc: AccountDocument) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a"); link.href = url; link.download = doc.name; link.click();
  // Keep the URL alive until the browser has consumed the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function AccountDocuments({ accountId, busy, run }: { accountId: string; busy: boolean; run: Run }) {
  const [documents] = useStored("accountDocuments");
  const [folder, setFolder] = useState<ManagedDirectory | null>(null);
  const [connected, setConnected] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<{ file: File; doc: AccountDocument } | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const supported = folderAccessSupported();
  useEffect(() => {
    let active = true;
    void storedAccountFolder().then(async root => {
      if (active) setFolder(root);
      if (root && await root.queryPermission({ mode: "readwrite" }) === "granted" && active) setConnected(true);
    }).catch(() => { if (active) setConnected(false); });
    return () => { active = false; };
  }, []);
  const docs = documents.filter(d => d.accountId === accountId && d.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  async function root() {
    try { return await requireAccountFolder(folder); }
    catch (err) { setConnected(false); throw err; }
  }
  async function upload(files: File[]) {
    if (busy || !files.length) return;
    await run(async () => {
      const directory = await root();
      setStatus("");
      let saved = 0;
      const failures: string[] = [];
      for (const file of files) {
        try { await uploadAccountFile(directory, accountId, file); saved++; }
        catch (err) { failures.push(`${file.name}: ${fileError(err)}`); }
      }
      setStatus(`${saved} file${saved === 1 ? "" : "s"} added.`);
      if (failures.length) throw new Error(failures.join("\n"));
    });
  }
  return <div>
    <div className="accounts-folder"><p>{connected ? `Folder: ${folder?.name}` : "Connect a folder to keep your account files on this computer."}</p><button disabled={busy || !supported} onClick={() => void run(async () => { const next = await chooseAccountFolder(); setFolder(next); setConnected(true); setStatus("Folder connected. Existing files must be in this folder’s accounts-files subfolder."); })}>{folder || documents.length > 0 ? "Reconnect Folder" : "Choose Folder"}</button></div>
    {!supported && <p role="status">Managed folders require a supported browser, such as desktop Chrome or Edge. Files are not stored in the browser as a fallback.</p>}
    <p className="accounts-muted">Back up this folder separately. Dashboard backups include the document list and references, not the files themselves.</p>
    <div className={`accounts-drop${dragging ? " dragging" : ""}`} onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!busy && connected) void upload(Array.from(e.dataTransfer.files)); else setStatus("Choose or reconnect your folder before adding files."); }}>
      <strong>Drop account files here</strong><span>PDFs, photos, documents, and downloads</span><button disabled={busy || !connected} onClick={() => input.current?.click()}>Add Files</button>
      <input ref={input} hidden type="file" multiple onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void upload(files); }} />
    </div>
    {status && <p role="status">{status}</p>}
    <label>Search documents<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
    {!docs.length && <p className="accounts-empty">{search ? "No matching documents." : "No documents yet."}</p>}
    <ul className="account-documents">{docs.map(doc => <li key={doc.id}>
      <button className="accounts-document-name" disabled={busy} onClick={() => void run(async () => { const file = await readAccountFile(await root(), doc); if (previewMime(doc)) setPreview({ file, doc }); else { downloadFile(file, doc); setStatus("Downloaded. Open the file from your browser’s downloads to use its default app."); } })}>{doc.name}</button>
      <small>{doc.extension.replace(".", "").toUpperCase() || "FILE"} · {new Date(doc.createdAt).toLocaleDateString()} · {Math.max(1, Math.ceil(doc.size / 1024))} KB</small>
      <div className="accounts-actions"><button disabled={busy} onClick={() => { const name = window.prompt("Rename document (the original extension is preserved):", doc.name); if (name !== null) void run(() => renameAccountDocument(doc, name)); }}>Rename</button>
        <button disabled={busy} onClick={() => void run(async () => downloadFile(await readAccountFile(await root(), doc), doc))}>Download</button>
        <button disabled={busy} onClick={() => { if (window.confirm(`Remove ${doc.name}? Only the managed copy will be deleted; the original file stays where it was.`)) void run(() => root().then(directory => removeAccountDocument(directory, doc))); }}>Remove</button></div>
    </li>)}</ul>
    {preview && <DocumentPreview {...preview} onClose={() => setPreview(null)} />}
  </div>;
}

function DocumentPreview({ file, doc, onClose }: { file: File; doc: AccountDocument; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const mime = previewMime(doc)!;
  useEffect(() => { const objectUrl = URL.createObjectURL(new Blob([file], { type: mime })); setUrl(objectUrl); dialog.current?.showModal(); return () => URL.revokeObjectURL(objectUrl); }, [file, mime]);
  return <dialog className="accounts-preview accounts-dialog" ref={dialog} aria-labelledby="document-preview-title" onCancel={e => { e.preventDefault(); onClose(); }}>
    <header><h2 id="document-preview-title">{doc.name}</h2><button onClick={onClose} autoFocus>Close preview</button></header>
    {url && (mime === "application/pdf" ? <iframe title={doc.name} src={url} /> : <img src={url} alt={doc.name} />)}
    <button onClick={() => downloadFile(file, doc)}>Download / open in default app</button>
  </dialog>;
}

function AccountQuotes({ accountId, onDirty, busy, run }: { accountId: string; onDirty: (value: boolean) => void; busy: boolean; run: Run }) {
  const [quotes] = useStored("accountQuotes");
  const [documents] = useStored("accountDocuments");
  const [editing, setEditing] = useState<AccountQuote | null>(null);
  const [baseline, setBaseline] = useState("");
  const [premium, setPremium] = useState("");
  const [baselinePremium, setBaselinePremium] = useState("");
  const [preview, setPreview] = useState<{ file: File; doc: AccountDocument } | null>(null);
  const [status, setStatus] = useState("");
  const dirty = editing !== null && (JSON.stringify(editing) !== baseline || premium !== baselinePremium);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  const ownDocs = documents.filter(d => d.accountId === accountId);
  const ownQuotes = quotes.filter(q => q.accountId === accountId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  function edit(quote?: AccountQuote) {
    if (dirty && !window.confirm("Discard unsaved quote edits?")) return;
    const now = new Date().toISOString();
    const draft = quote ?? { id: crypto.randomUUID(), accountId, lineOfBusiness: "", annualPremium: 0, label: "", quoteDate: "", notes: "", documentId: "", createdAt: now, updatedAt: now };
    setEditing(draft); setBaseline(JSON.stringify(draft)); setPremium(quote ? String(quote.annualPremium) : ""); setBaselinePremium(quote ? String(quote.annualPremium) : ""); setStatus("");
  }
  function patch(values: Partial<AccountQuote>) { setEditing(prev => prev ? { ...prev, ...values } : prev); }
  return <div><div className="accounts-section-heading"><h3>Quotes</h3><button disabled={busy} onClick={() => edit()}>Add Quote</button></div>
    <p className="accounts-muted">For this account only. These quotes do not change Pipeline or production totals.</p>
    {editing && <form className="account-quote-form" onSubmit={e => { e.preventDefault(); void run(async () => {
      if (!premium.trim()) throw new Error("Enter the yearly premium.");
      await saveAccountQuote({ ...editing, annualPremium: Number(premium), updatedAt: new Date().toISOString() }); setEditing(null); setStatus("Quote saved.");
    }); }}><fieldset disabled={busy}>
      <label>Line of business<select required value={editing.lineOfBusiness} onChange={e => patch({ lineOfBusiness: e.target.value })}><option value="">Choose a line</option>{linesOfBusiness.map(line => <option key={line.id} value={line.id}>{line.name}</option>)}</select></label>
      <label>Yearly premium ($)<input type="number" required min="0" step="0.01" value={premium} onChange={e => setPremium(e.target.value)} /></label>
      <label>Label (optional)<input value={editing.label} onChange={e => patch({ label: e.target.value })} placeholder="e.g. Home with $1,000 deductible" /></label>
      <label>Quote date (optional)<input type="date" value={editing.quoteDate} onChange={e => patch({ quoteDate: e.target.value })} /></label>
      <label>Notes (optional)<textarea rows={3} value={editing.notes} onChange={e => patch({ notes: e.target.value })} /></label>
      <label>Account document (optional)<select value={editing.documentId} onChange={e => patch({ documentId: e.target.value })}><option value="">None</option>{ownDocs.map(doc => <option key={doc.id} value={doc.id}>{doc.name}</option>)}</select></label>
      <div className="accounts-actions"><button type="submit">{busy ? "Saving…" : "Save Quote"}</button><button type="button" onClick={() => { if (!dirty || window.confirm("Discard unsaved quote edits?")) setEditing(null); }}>Cancel</button></div>
    </fieldset></form>}
    {status && <p role="status">{status}</p>}
    {!ownQuotes.length && !editing && <p className="accounts-empty">No quotes added yet.</p>}
    <ul className="account-quotes">{ownQuotes.map(quote => <li key={quote.id}><div className="accounts-section-heading"><strong>{lineById.get(quote.lineOfBusiness)?.name ?? quote.lineOfBusiness}</strong><strong>{dollars.format(quote.annualPremium)} / year</strong></div>
      {quote.label && <p>{quote.label}</p>}{quote.quoteDate && <small>Quoted {quote.quoteDate}</small>}{quote.notes && <p className="account-quote-notes">{quote.notes}</p>}{quote.documentId && <p><button disabled={busy} onClick={() => void run(async () => { const doc = ownDocs.find(d => d.id === quote.documentId); if (!doc) throw new Error("This linked document is no longer available."); const root = await requireAccountFolder(await storedAccountFolder()); const file = await readAccountFile(root, doc); if (previewMime(doc)) setPreview({ file, doc }); else downloadFile(file, doc); })}>Document: {ownDocs.find(d => d.id === quote.documentId)?.name ?? "Unavailable"}</button></p>}
      <div className="accounts-actions"><button disabled={busy} onClick={() => edit(quote)}>Edit</button><button disabled={busy} onClick={() => { if (window.confirm("Delete this account quote? Pipeline and production will not change.")) void run(async () => { await deleteAccountQuote(quote.id, accountId); if (editing?.id === quote.id) setEditing(null); }); }}>Delete</button></div>
    </li>)}</ul>
    {preview && <DocumentPreview {...preview} onClose={() => setPreview(null)} />}
  </div>;
}
