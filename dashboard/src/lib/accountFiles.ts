import type { AccountDocument } from "./accountTypes";
import { readMeta, writeMeta } from "./db";
import { commitAccountChanges, get } from "./repository";

/** Narrow browser API seam, also used by file-operation tests. */
export interface ManagedDirectory {
  name: string;
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<ManagedDirectory>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    getFile(): Promise<File>;
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
  }>;
  removeEntry(name: string): Promise<void>;
}
type PickerWindow = Window & { showDirectoryPicker?: (options: { mode: "readwrite"; id: string }) => Promise<ManagedDirectory> };
export const FOLDER_KEY = "accountsFolder";
const NAMESPACE = "accounts-files";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function folderAccessSupported(): boolean {
  return typeof window !== "undefined" && typeof (window as PickerWindow).showDirectoryPicker === "function";
}

export async function chooseAccountFolder(): Promise<ManagedDirectory> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("Managed folders need a supported browser, such as desktop Chrome or Edge.");
  const folder = await picker.call(window, { mode: "readwrite", id: "agency-accounts" });
  await writeMeta(FOLDER_KEY, folder);
  return folder;
}

export async function storedAccountFolder(): Promise<ManagedDirectory | null> {
  return (await readMeta<ManagedDirectory | null>(FOLDER_KEY)) ?? null;
}

export async function requireAccountFolder(folder: ManagedDirectory | null): Promise<ManagedDirectory> {
  if (!folder || await folder.queryPermission({ mode: "readwrite" }) !== "granted") {
    throw new Error("Reconnect Folder to access your account files. Your document list is still saved.");
  }
  return folder;
}

export function fileExtension(name: string): string {
  return name.match(/\.[a-z0-9]{1,20}$/i)?.[0] ?? "";
}

export function renamedDocumentName(name: string, extension: string): string {
  let clean = name.trim();
  if (extension && clean.toLowerCase().endsWith(extension.toLowerCase())) clean = clean.slice(0, -extension.length).trim();
  if (!clean || /[\\/]/.test(clean) || [...clean].some(char => char.charCodeAt(0) < 32)) throw new Error("Enter a filename without slashes or control characters.");
  return clean + extension;
}

/** Only app-owned UUID paths can ever be opened or deleted, including after restore. */
export function documentPath(doc: AccountDocument): string[] {
  if (!UUID.test(doc.accountId) || !UUID.test(doc.id) || (doc.extension && !/^\.[a-z0-9]{1,20}$/i.test(doc.extension))) throw new Error("Invalid managed document path.");
  const parts = [NAMESPACE, doc.accountId, doc.id + doc.extension];
  if (doc.relativePath !== parts.join("/")) throw new Error("Document path does not match this account.");
  return parts;
}

async function containingFolder(root: ManagedDirectory, doc: AccountDocument, create = false) {
  const [namespace, account, filename] = documentPath(doc);
  const container = await root.getDirectoryHandle(namespace, { create });
  return { directory: await container.getDirectoryHandle(account, { create }), filename };
}

export async function uploadAccountFile(root: ManagedDirectory, accountId: string, file: File): Promise<AccountDocument> {
  await requireAccountFolder(root);
  const id = crypto.randomUUID();
  const extension = fileExtension(file.name);
  const doc: AccountDocument = {
    id, accountId, name: file.name, originalName: file.name, extension,
    mimeType: file.type, size: file.size, createdAt: new Date().toISOString(),
    relativePath: `${NAMESPACE}/${accountId}/${id}${extension}`,
  };
  const { directory, filename } = await containingFolder(root, doc, true);
  let created = false;
  try {
    const handle = await directory.getFileHandle(filename, { create: true });
    created = true;
    const writable = await handle.createWritable();
    try { await writable.write(file); await writable.close(); }
    catch (error) { await writable.abort().catch(() => {}); throw error; }
    await commitAccountChanges(() => {
      if (!get("accounts").some(a => a.id === accountId)) throw new Error("Account no longer exists.");
      return { accountDocuments: [...get("accountDocuments"), doc] };
    });
    return doc;
  } catch (error) {
    if (created) {
      try { await directory.removeEntry(filename); }
      catch { throw new Error(`File was not added to the account. An incomplete copy may remain at ${doc.relativePath}; reconnect the folder before retrying.`); }
    }
    throw error;
  }
}

export async function readAccountFile(root: ManagedDirectory, doc: AccountDocument): Promise<File> {
  await requireAccountFolder(root);
  const { directory, filename } = await containingFolder(root, doc);
  return (await directory.getFileHandle(filename)).getFile();
}

export async function renameAccountDocument(doc: AccountDocument, name: string): Promise<void> {
  const nextName = renamedDocumentName(name, doc.extension);
  await commitAccountChanges(() => ({ accountDocuments: get("accountDocuments").map(d => d.id === doc.id && d.accountId === doc.accountId ? { ...d, name: nextName } : d) }));
}

export async function removeAccountDocument(root: ManagedDirectory, doc: AccountDocument): Promise<void> {
  await requireAccountFolder(root);
  documentPath(doc);
  try {
    const { directory, filename } = await containingFolder(root, doc);
    await directory.removeEntry(filename);
  } catch (error) {
    // A previously deleted/moved file can still be removed from the directory.
    if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
  }
  try {
    await commitAccountChanges(() => ({
      accountDocuments: get("accountDocuments").filter(d => d.id !== doc.id || d.accountId !== doc.accountId),
      accountQuotes: get("accountQuotes").map(q => q.accountId === doc.accountId && q.documentId === doc.id ? { ...q, documentId: "" } : q),
    }));
  } catch {
    throw new Error("The managed file was removed, but its list entry could not be saved. Retry Remove to finish. The original file was not changed.");
  }
}

export function previewMime(doc: AccountDocument): string | null {
  const types: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp", ".avif": "image/avif" };
  return types[doc.extension.toLowerCase()] ?? null;
}

export function fileError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "AbortError") return "Folder selection cancelled. Nothing changed.";
    if (error.name === "NotFoundError") return "This file is missing from the connected folder. Reconnect Folder to its original location, or restore the file from your folder backup.";
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return "Folder access was denied. Use Reconnect Folder to grant access and try again.";
    if (error.name === "QuotaExceededError") return "There is not enough storage to save this file. Free space and try again.";
  }
  return error instanceof Error ? error.message : "Could not complete this action. Your saved records are unchanged.";
}
