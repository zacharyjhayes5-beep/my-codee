import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { addAccount, ageFromDob, deleteAccountQuote, removeAccount, saveAccountInfo, saveAccountQuote } from "./accounts";
import { documentPath, previewMime, readAccountFile, removeAccountDocument, renamedDocumentName, uploadAccountFile, type ManagedDirectory } from "./accountFiles";
import { commitAccountChanges, get, initRepository, replaceAll, resetRepository } from "./repository";
import { DB_NAME, RECORD_STORES, readAll, readMeta, writeMeta } from "./db";
import { buildBackup, parseBackup } from "./backup";
import { blankContact, blankProspect, PROSPECT_SCHEMA_VERSION } from "./prospectSchema";
import type { AccountQuote } from "./accountTypes";

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory(); localStorage.clear(); resetRepository(); await initRepository();
});

function quote(accountId: string): AccountQuote {
  return { id: crypto.randomUUID(), accountId, lineOfBusiness: "homeowners", annualPremium: 1234.56, label: "Home", quoteDate: "2026-09-12", notes: "", documentId: "", createdAt: "2026-09-12", updatedAt: "2026-09-12" };
}

/** In-memory file API: the service uses the same asynchronous interface as the browser. */
class Folder implements ManagedDirectory {
  name = "Test accounts";
  permission: PermissionState = "granted";
  directories = new Map<string, Folder>();
  files = new Map<string, File>();
  failWrite = false;
  async queryPermission() { return this.permission; }
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<Folder> {
    let folder = this.directories.get(name);
    if (!folder && options?.create) { folder = new Folder(); folder.failWrite = this.failWrite; this.directories.set(name, folder); }
    if (!folder) throw new DOMException("Missing", "NotFoundError");
    return folder;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name) && !options?.create) throw new DOMException("Missing", "NotFoundError");
    if (!this.files.has(name)) this.files.set(name, new File([], name));
    return {
      getFile: async () => this.files.get(name)!,
      createWritable: async () => {
        let staged: Blob | null = null;
        return {
          write: async (data: Blob) => { if (this.failWrite) throw new DOMException("Full", "QuotaExceededError"); staged = data; },
          close: async () => { if (staged) this.files.set(name, new File([staged], name, { type: staged.type })); },
          abort: async () => {},
        };
      },
    };
  }
  async removeEntry(name: string) { if (!this.files.delete(name)) throw new DOMException("Missing", "NotFoundError"); }
}

describe("Accounts persistence and isolation", () => {
  it("upgrades the previous database without replacing existing households", async () => {
    globalThis.indexedDB = new IDBFactory(); resetRepository();
    const household = blankProspect({ name: "Existing household" });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 7);
      request.onupgradeneeded = () => {
        for (const key of RECORD_STORES.filter(key => !["accounts", "accountDocuments", "accountQuotes"].includes(key))) request.result.createObjectStore(key, { keyPath: "id" });
        const meta = request.result.createObjectStore("meta", { keyPath: "key" });
        meta.put({ key: "migratedFromLocalStorage", value: { ran: true } });
        meta.put({ key: "prospectSchemaVersion", value: PROSPECT_SCHEMA_VERSION });
        request.transaction!.objectStore("prospects").put(household);
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    await initRepository();
    expect(get("prospects")[0].id).toBe(household.id);
    expect(get("accounts")).toEqual([]);
    expect(get("accountDocuments")).toEqual([]);
    expect(get("accountQuotes")).toEqual([]);
  });

  it("links existing households without duplication, and removal/re-add keeps quotes and identity", async () => {
    const id = await addAccount({ name: "Test Household" });
    const prospectId = get("accounts")[0].prospectId;
    const before = get("prospects").length;
    await saveAccountQuote(quote(id));
    await removeAccount(id);
    expect(get("accounts")[0].active).toBe(false);
    expect(await addAccount({ prospectId })).toBe(id);
    expect(get("prospects")).toHaveLength(before);
    expect(get("accountQuotes")).toHaveLength(1);
    expect(await readAll("accounts")).toEqual(get("accounts"));
  });

  it("saves members and manual ages through reload, refusing stale information overwrites", async () => {
    await addAccount({ name: "Household" });
    const before = get("prospects").find(p => p.id === get("accounts")[0].prospectId)!;
    const draft = { ...before, phone: "555-0100", contacts: [{ ...blankContact(), firstName: "Avery", manualAge: 42 }] };
    await saveAccountInfo(before, draft);
    await expect(saveAccountInfo(before, { ...draft, phone: "wrong" })).rejects.toThrow("changed elsewhere");
    await initRepository();
    expect(get("prospects").find(p => p.id === before.id)?.contacts[0].manualAge).toBe(42);
  });

  it("quotes never change Pipeline, policies, workbenches, or household stages", async () => {
    const id = await addAccount({ name: "Independent" });
    const before = JSON.stringify([get("opportunities"), get("policies"), get("workbenches"), get("prospects")]);
    const first = quote(id); const second = quote(id);
    await saveAccountQuote(first); await saveAccountQuote(second);
    await saveAccountQuote({ ...first, annualPremium: 1700 });
    expect(get("accountQuotes")).toHaveLength(2);
    await deleteAccountQuote(first.id, id);
    expect(JSON.stringify([get("opportunities"), get("policies"), get("workbenches"), get("prospects")])).toBe(before);
    await expect(saveAccountQuote({ ...second, annualPremium: Number.NaN })).rejects.toThrow("premium");
    await expect(saveAccountQuote({ ...second, annualPremium: -1 })).rejects.toThrow("premium");
    await expect(saveAccountQuote({ ...second, lineOfBusiness: "unknown" })).rejects.toThrow("line");
  });

  it("an atomic storage failure leaves both membership and households unchanged", async () => {
    const before = JSON.stringify(get("accounts"));
    await expect(commitAccountChanges(() => ({ accounts: [{ id: "bad", prospectId: "bad", active: true, createdAt: "", uncloneable: () => {} }], prospects: [] }))).rejects.toBeDefined();
    expect(JSON.stringify(get("accounts"))).toBe(before);
    expect(await readAll("accounts")).toEqual(get("accounts"));
    // A failed save does not poison subsequent saves.
    await addAccount({ name: "Recovery" });
    expect(get("accounts")).toHaveLength(1);
  });
});

describe("Managed account files", () => {
  it("stores actual bytes, separates identical names/accounts, previews known types, and preserves the original", async () => {
    const root = new Folder(); const first = await addAccount({ name: "One" }); const second = await addAccount({ name: "Two" });
    const source = new File(["example contents"], "quote.pdf", { type: "application/pdf" });
    const a = await uploadAccountFile(root, first, source);
    const b = await uploadAccountFile(root, first, source);
    const c = await uploadAccountFile(root, second, source);
    expect(new Set([a.relativePath, b.relativePath, c.relativePath]).size).toBe(3);
    expect(await (await readAccountFile(root, a)).text()).toBe("example contents");
    expect(previewMime(a)).toBe("application/pdf");
    expect(previewMime({ ...a, extension: ".docx" })).toBeNull();
    expect(renamedDocumentName("New label", ".pdf")).toBe("New label.pdf");
    expect(renamedDocumentName("New label.PDF", ".pdf")).toBe("New label.pdf");
    await removeAccountDocument(root, a);
    expect(await source.text()).toBe("example contents");
    expect(await (await readAccountFile(root, b)).text()).toBe("example contents");
    expect(get("accountDocuments")).toHaveLength(2);
  });

  it("permission denial and failed writes never create successful document records", async () => {
    const root = new Folder(); const id = await addAccount({ name: "Account" });
    root.permission = "denied";
    await expect(uploadAccountFile(root, id, new File(["x"], "x.pdf"))).rejects.toThrow("Reconnect");
    root.permission = "granted"; root.failWrite = true;
    await expect(uploadAccountFile(root, id, new File(["x"], "x.pdf"))).rejects.toThrow("Full");
    expect(get("accountDocuments")).toHaveLength(0);
    expect(root.directories.get("accounts-files")?.directories.get(id)?.files.size).toBe(0);
  });

  it("rolls back a copied file when account metadata cannot be saved", async () => {
    const root = new Folder();
    await expect(uploadAccountFile(root, crypto.randomUUID(), new File(["x"], "x.pdf"))).rejects.toThrow("Account no longer exists");
    expect(get("accountDocuments")).toHaveLength(0);
    expect([...root.directories.get("accounts-files")!.directories.values()][0].files.size).toBe(0);
  });

  it("missing files remain listed, rejects path traversal, and forbids cross-account quote links", async () => {
    const root = new Folder(); const id = await addAccount({ name: "Account" });
    const doc = await uploadAccountFile(root, id, new File(["x"], "x.pdf"));
    expect(() => documentPath({ ...doc, relativePath: "../personal.pdf" })).toThrow("path");
    const other = await addAccount({ name: "Other" });
    await expect(saveAccountQuote({ ...quote(other), documentId: doc.id })).rejects.toThrow("belonging");
    root.directories.clear();
    await expect(readAccountFile(root, doc)).rejects.toThrow("Missing");
    expect(get("accountDocuments")).toHaveLength(1);
  });
});

describe("Backup and age handling", () => {
  it("round-trips Accounts records and relative paths, excluding folder handles and file bytes", async () => {
    const id = await addAccount({ name: "Backed up" });
    const root = new Folder();
    const doc = await uploadAccountFile(root, id, new File(["private file contents"], "quote.pdf"));
    await saveAccountQuote({ ...quote(id), documentId: doc.id });
    await writeMeta("accountsFolder", { name: "test handle placeholder" });
    const backup = await buildBackup();
    expect(backup.version).toBe(5);
    expect(JSON.stringify(backup)).not.toContain("private file contents");
    expect(JSON.stringify(backup)).not.toContain("test handle placeholder");
    await replaceAll(parseBackup(JSON.stringify(backup)).snapshot);
    expect(get("accountDocuments")[0].relativePath).toBe(doc.relativePath);
    expect(get("accountQuotes")[0].documentId).toBe(doc.id);
    expect(await readMeta("accountsFolder")).toBeNull();
    expect(await (await readAccountFile(root, doc)).text()).toBe("private file contents");
    await initRepository();
    expect(get("accounts")[0].id).toBe(id);
  });

  it("older v4 backups restore with empty Accounts collections", async () => {
    await addAccount({ name: "Legacy" });
    const backup = await buildBackup();
    const old = { ...backup, version: 4, records: { prospects: backup.records.prospects } };
    const parsed = parseBackup(JSON.stringify(old));
    expect(parsed.snapshot.records.accounts).toEqual([]);
    expect(parsed.snapshot.records.accountDocuments).toEqual([]);
    expect(parsed.snapshot.records.accountQuotes).toEqual([]);
  });

  it("calculates age at the birthday boundary without UTC shifting and rejects bad dates", () => {
    expect(ageFromDob("2000-09-12", new Date(2026, 8, 11))).toBe(25);
    expect(ageFromDob("2000-09-12", new Date(2026, 8, 12))).toBe(26);
    expect(ageFromDob("2030-01-01", new Date(2026, 8, 12))).toBeNull();
    expect(ageFromDob("2000-02-31")).toBeNull();
    expect(ageFromDob("")).toBeNull();
  });
});
