import type { Prospect } from "../types";
import type { Account, AccountQuote } from "./accountTypes";
import { commitAccountChanges, get } from "./repository";
import { blankProspect } from "./prospectSchema";
import { lineById } from "./policies";

export function addressLabel(p: Prospect): string {
  return [p.address.line1, p.address.city, p.address.state, p.address.zip].filter(Boolean).join(", ") || p.area;
}

export function ageFromDob(dob: string, now = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const [year, month, day] = dob.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  const age = now.getFullYear() - year - (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day) ? 1 : 0);
  return age >= 0 && age <= 130 ? age : null;
}

export async function addAccount(input: { prospectId: string } | { name: string }): Promise<string> {
  let id = "";
  await commitAccountChanges(() => {
    const prospects = get("prospects");
    const existing = "prospectId" in input;
    const prospect = existing ? prospects.find(p => p.id === input.prospectId) : blankProspect({ name: input.name.trim(), source: "manual" });
    if (!prospect?.name.trim()) throw new Error("Enter an account name or select an existing prospect.");
    const prior = get("accounts").find(a => a.prospectId === prospect.id);
    id = prior?.id ?? crypto.randomUUID();
    const account: Account = prior ? { ...prior, active: true } : { id, prospectId: prospect.id, active: true, createdAt: new Date().toISOString() };
    return {
      accounts: [...get("accounts").filter(a => a.id !== id), account],
      ...(!existing ? { prospects: [...prospects, prospect] } : {}),
    };
  });
  return id;
}

export async function removeAccount(id: string): Promise<void> {
  await commitAccountChanges(() => ({ accounts: get("accounts").map(a => a.id === id ? { ...a, active: false } : a) }));
}

export async function saveAccountInfo(before: Prospect, draft: Prospect): Promise<void> {
  if (!draft.name.trim()) throw new Error("Account name is required.");
  for (const contact of draft.contacts) {
    if (contact.dob && ageFromDob(contact.dob) === null) throw new Error("Enter a valid DOB that is not in the future.");
    if (contact.manualAge !== undefined && (!Number.isInteger(contact.manualAge) || contact.manualAge < 0 || contact.manualAge > 130)) throw new Error("Age must be a whole number from 0 to 130.");
  }
  await commitAccountChanges(() => {
    const current = get("prospects").find(p => p.id === before.id);
    if (!current) throw new Error("This household no longer exists.");
    const fields = (p: Prospect) => JSON.stringify([p.name, p.phone, p.email, p.address, p.contacts]);
    if (fields(current) !== fields(before)) throw new Error("Household information changed elsewhere. Reopen this account before saving to avoid overwriting it.");
    const primary = draft.contacts.find(c => c.isPrimary);
    const updated: Prospect = {
      ...current, name: draft.name.trim(), address: draft.address, phone: draft.phone, email: draft.email,
      contacts: draft.contacts.map(c => ({ ...c, ...(c.dob ? { manualAge: undefined } : {}) })),
      ...(primary ? { firstName: primary.firstName, lastName: primary.lastName } : {}),
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    return { prospects: get("prospects").map(p => p.id === updated.id ? updated : p) };
  });
}

export function validateQuote(quote: AccountQuote): void {
  if (!lineById.has(quote.lineOfBusiness)) throw new Error("Choose a line of business.");
  if (!Number.isFinite(quote.annualPremium) || quote.annualPremium < 0) throw new Error("Enter a valid yearly premium of zero or more.");
  if (quote.quoteDate && !/^\d{4}-\d{2}-\d{2}$/.test(quote.quoteDate)) throw new Error("Enter a valid quote date.");
}

export async function saveAccountQuote(quote: AccountQuote): Promise<void> {
  validateQuote(quote);
  await commitAccountChanges(() => {
    if (!get("accounts").some(a => a.id === quote.accountId)) throw new Error("Account no longer exists.");
    if (quote.documentId && !get("accountDocuments").some(d => d.id === quote.documentId && d.accountId === quote.accountId)) throw new Error("Choose a document belonging to this account.");
    return { accountQuotes: [...get("accountQuotes").filter(q => q.id !== quote.id), quote] };
  });
}

export async function deleteAccountQuote(id: string, accountId: string): Promise<void> {
  await commitAccountChanges(() => ({ accountQuotes: get("accountQuotes").filter(q => q.id !== id || q.accountId !== accountId) }));
}
