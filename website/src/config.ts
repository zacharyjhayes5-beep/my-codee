/**
 * Single source of truth for site-wide facts.
 * Never hardcode a phone number, address, or URL in a page — put it here.
 *
 * Everything marked TODO(owner) is a placeholder awaiting real details.
 */

export const site = {
  name: 'Hayes Agency',
  legalName: 'Hayes Agency — Farm Bureau Insurance',
  agent: 'Zachary Hayes',
  agentTitle: 'Agency Owner, Farm Bureau Insurance',
  tagline: 'Insurance advice from a neighbor, not a call center.',
  description:
    'Hayes Agency is a Farm Bureau Insurance agency in Grand Rapids, Michigan, offering auto, home, life, and business coverage with straight answers from a local agent.',
  city: 'Grand Rapids',
  state: 'Michigan',
  stateAbbr: 'MI',
} as const;

export const contact = {
  // TODO(owner): replace with the real agency line.
  phone: '(616) 555-0142',
  phoneHref: 'tel:+16165550142',
  // TODO(owner): replace with the real agency inbox.
  email: 'hello@hayesagency.com',
  emailHref: 'mailto:hello@hayesagency.com',
  address: {
    // TODO(owner): replace with the real office address.
    street: '1234 Monroe Ave NW, Suite 200',
    city: 'Grand Rapids',
    state: 'MI',
    zip: '49503',
  },
  // TODO(owner): confirm office hours.
  hours: [
    { days: 'Monday – Friday', time: '9:00 AM – 5:00 PM' },
    { days: 'Saturday', time: 'By appointment' },
    { days: 'Sunday', time: 'Closed' },
  ],
  // TODO(owner): drop in the real Calendly (or similar) scheduling link.
  calendarUrl: 'https://calendly.com/hayes-agency/intro-call',
} as const;

export const addressLine = `${contact.address.street}, ${contact.address.city}, ${contact.address.state} ${contact.address.zip}`;

/**
 * TODO(owner): placeholder lead endpoint. Swap for Formspree / Netlify Forms /
 * the agency CRM webhook before launch. The form degrades to a native POST if
 * JavaScript is unavailable, so the endpoint should accept form-encoded data.
 */
export const FORM_ENDPOINT = 'https://example.com/hayes-agency/leads';

export const coverageTypes = [
  { value: 'auto', label: 'Auto' },
  { value: 'home', label: 'Home' },
  { value: 'life', label: 'Life' },
  { value: 'business', label: 'Business / Farm' },
  { value: 'bundle', label: 'A few of these — help me sort it out' },
  { value: 'other', label: 'Something else' },
] as const;

export const nav = [
  { href: '/about', label: 'About' },
  { href: '/coverage', label: 'Coverage' },
  { href: '/resources', label: 'Resources' },
  { href: '/contact', label: 'Contact' },
] as const;
