/** Accounts are an opt-in directory over existing households. */
export interface Account {
  id: string;
  prospectId: string;
  active: boolean;
  createdAt: string;
}

export interface AccountDocument {
  id: string;
  accountId: string;
  name: string;
  originalName: string;
  extension: string;
  mimeType: string;
  size: number;
  relativePath: string;
  createdAt: string;
}

/** Independent from opportunity/workbench quotes and written production. */
export interface AccountQuote {
  id: string;
  accountId: string;
  lineOfBusiness: string;
  annualPremium: number;
  label: string;
  quoteDate: string;
  notes: string;
  documentId: string;
  createdAt: string;
  updatedAt: string;
}
