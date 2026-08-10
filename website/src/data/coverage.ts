/**
 * Lines of business. Adding an entry here creates a page at /coverage/<slug>
 * via src/pages/coverage/[slug].astro and adds it to nav lists automatically.
 *
 * Plain English only. No premiums, no rate ranges, no "as low as" claims.
 */

export interface CoverageLine {
  slug: string;
  title: string;
  /** One-line summary used on cards and meta descriptions. */
  summary: string;
  /** Short hero paragraph on the detail page. */
  intro: string;
  /** Simple inline icon key — see components/CoverageIcon.astro. */
  icon: 'auto' | 'home' | 'life' | 'business';
  /** "What it covers" — plain-English bullets. */
  covers: { title: string; body: string }[];
  /** "Who it's for". */
  audience: string[];
  /** Things people commonly get wrong. */
  goodToKnow: { q: string; a: string }[];
}

export const coverage: CoverageLine[] = [
  {
    slug: 'auto',
    title: 'Auto Insurance',
    summary:
      'Michigan auto coverage explained without the acronyms — including the PIP choice that trips everyone up.',
    intro:
      "Michigan's auto law is genuinely confusing, and the choices you make on one screen of an online quote can cost you badly after an accident. Here's what the pieces actually do.",
    icon: 'auto',
    covers: [
      {
        title: 'Liability',
        body: "Pays for the injuries and property damage you cause to other people. This is the part that protects your savings, not your car — and it's the coverage most people carry too little of.",
      },
      {
        title: 'Personal Injury Protection (PIP)',
        body: 'Pays your own medical bills after a crash, no matter who caused it. Michigan lets you pick how much — from a capped amount up to unlimited. Coordinating it with your health plan can lower the cost, but only if your health plan actually allows it. This is the single most important conversation we will have.',
      },
      {
        title: 'Collision',
        body: 'Repairs or replaces your car after an accident you were involved in, minus your deductible.',
      },
      {
        title: 'Comprehensive',
        body: 'Covers the non-crash stuff: deer, hail, theft, a cracked windshield, a tree limb in a spring storm.',
      },
      {
        title: 'Uninsured / underinsured motorist',
        body: "Steps in when the driver who hit you has no insurance or nowhere near enough. It's inexpensive and it matters more than people expect.",
      },
      {
        title: 'Roadside and rental',
        body: "Small add-ons that decide whether a bad morning is an inconvenience or a lost week — a tow, and a car to drive while yours is in the shop.",
      },
    ],
    audience: [
      'Anyone registering a vehicle in Michigan — coverage is required here',
      'Families adding a teen driver and bracing for the change',
      'Drivers who bought online, picked the cheapest PIP option, and want a second look',
      'Households with more than one vehicle, a boat, or a camper to bundle',
    ],
    goodToKnow: [
      {
        q: 'What is the PIP choice everyone talks about?',
        a: 'Since 2019, Michigan drivers choose their level of medical coverage rather than getting unlimited by default. Lower levels cost less per month and leave you exposed if injuries are serious. The right answer depends on your health insurance — bring your health plan details to the call.',
      },
      {
        q: 'Does my deductible apply if a deer hits me?',
        a: 'That is a comprehensive claim, and yes, your comprehensive deductible applies. Michigan leads the country in deer collisions, so this comes up a lot around here.',
      },
      {
        q: 'Will one claim wreck my rate?',
        a: 'Not always. It depends on the type of claim, your history, and how long you have been with the company. Call before you file and we can talk it through honestly.',
      },
    ],
  },
  {
    slug: 'home',
    title: 'Home Insurance',
    summary:
      'Protection for the building, everything inside it, and the liability that comes with owning a place.',
    intro:
      'A home policy is really four policies stapled together. Knowing which part does what is the difference between a smooth claim and an unpleasant surprise.',
    icon: 'home',
    covers: [
      {
        title: 'Dwelling',
        body: "Rebuilds the structure itself after a covered loss. The number should reflect what it costs to rebuild today — not what you paid, and not what Zillow says it's worth.",
      },
      {
        title: 'Other structures',
        body: 'The detached garage, the shed, the fence, the pole barn.',
      },
      {
        title: 'Personal property',
        body: "Your belongings. Certain categories — jewelry, firearms, tools, collectibles — have low built-in caps and need to be scheduled separately if they're worth real money.",
      },
      {
        title: 'Loss of use',
        body: 'Pays for somewhere to stay and the extra costs of living elsewhere while your home is repaired.',
      },
      {
        title: 'Personal liability',
        body: "Covers you when someone is hurt on your property or you damage someone else's — including things that happen away from home.",
      },
      {
        title: 'Water backup and service line',
        body: 'Two inexpensive add-ons that cover the failures older West Michigan homes actually experience: a sump pump giving out, or the water line under the yard going bad.',
      },
    ],
    audience: [
      'Homeowners in Grand Rapids and the surrounding townships',
      'First-time buyers who need a policy in place before closing',
      'Renters — a renters policy is cheap and covers your stuff and your liability',
      'Condo owners who need to fill the gaps the association master policy leaves',
      'Anyone who has finished a basement, added on, or renovated since their last review',
    ],
    goodToKnow: [
      {
        q: 'Does homeowners cover flooding?',
        a: 'No. Surface flooding is a separate policy through the federal program or a private carrier. Water backing up through a drain or sump is different and can be added to your policy — many people mix these two up.',
      },
      {
        q: 'Should I insure for market value?',
        a: 'No — insure for rebuild cost. In some neighborhoods rebuild cost is higher than market value, and in others it is lower. We calculate it rather than guess.',
      },
      {
        q: 'What actually lowers the premium?',
        a: 'Bundling with auto, a higher deductible you could truly cover tomorrow, an updated roof, and claim-free years. Not stripping out coverage you will want later.',
      },
    ],
  },
  {
    slug: 'life',
    title: 'Life Insurance',
    summary:
      'A plain answer to a hard question: if your income stopped, what would your family need?',
    intro:
      "Life insurance gets avoided because the sales version of it is awful. The honest version is a short conversation about who depends on your income and what it would take to keep them steady.",
    icon: 'life',
    covers: [
      {
        title: 'Term life',
        body: "Coverage for a set stretch of years — usually 10, 20, or 30 — at a fixed price. It's the most coverage per dollar and it fits the years when a mortgage and kids overlap. Most families should start here.",
      },
      {
        title: 'Whole life',
        body: 'Permanent coverage that never expires and builds cash value over time. Costs more per dollar of coverage; makes sense for final expenses, estate planning, or leaving something behind on purpose.',
      },
      {
        title: 'What the money does',
        body: 'It pays off the mortgage, replaces years of income, covers childcare and college, and buys the surviving parent time to not make rushed decisions.',
      },
      {
        title: 'Coverage through work',
        body: "Usually one or two times salary, and it ends when the job does. It's a nice supplement and a poor foundation.",
      },
      {
        title: 'Riders worth knowing',
        body: 'Child riders, waiver of premium if you become disabled, and conversion options that let a term policy become permanent later without a new medical exam.',
      },
    ],
    audience: [
      'Parents with kids at home — the clearest case there is',
      'Anyone with a mortgage or a co-signed loan someone else would inherit',
      'Single-income or uneven-income households',
      'Business owners with a partner or a loan personally guaranteed',
      'Stay-at-home parents — replacing that work costs real money',
      'Healthy people in their 20s and 30s, who will never get a better price than right now',
    ],
    goodToKnow: [
      {
        q: 'How much do I need?',
        a: 'A common starting point is 10–12x your income, plus the mortgage balance and anything you want to fund for the kids, minus what you already have. We do the math together in one sitting.',
      },
      {
        q: 'Do I need a medical exam?',
        a: 'Often not. Plenty of policies now issue based on a questionnaire and a records check, especially at moderate coverage amounts and younger ages.',
      },
      {
        q: 'Is term really enough?',
        a: 'For most families, yes — buy enough term to cover the years of maximum obligation. If a permanent policy fits your situation, I will tell you why in specific terms, not with a pitch.',
      },
    ],
  },
  {
    slug: 'business',
    title: 'Business & Farm Insurance',
    summary:
      'Coverage for the trades, shops, offices, and farms that keep West Michigan running.',
    intro:
      "A business policy should map to how you actually operate — what you own, who works for you, what you drive, and what happens to income if you have to close for a month.",
    icon: 'business',
    covers: [
      {
        title: 'General liability',
        body: "Third-party injury and property damage — a customer falls, or your crew damages something on a job site. It's also the certificate most contracts require before you can start work.",
      },
      {
        title: 'Commercial property',
        body: 'The building, equipment, inventory, and tools. Tools in a truck bed need to be written correctly or they may not be covered.',
      },
      {
        title: 'Business income',
        body: "Replaces lost profit and covers ongoing bills while you're shut down after a covered loss. The most overlooked coverage on this list.",
      },
      {
        title: 'Commercial auto',
        body: "Vehicles used for the business. A personal auto policy can deny a claim on a vehicle that's really doing business work.",
      },
      {
        title: 'Workers compensation',
        body: 'Medical care and lost wages for injured employees. Required in Michigan once you meet the employee thresholds.',
      },
      {
        title: 'Farm and ranch',
        body: 'Farm Bureau started with farms. Barns and outbuildings, equipment, livestock, and the liability of an operating farm — including the part-time operations common around here.',
      },
      {
        title: 'Umbrella',
        body: 'Extra liability limits stacked above the other policies, for a fairly small premium.',
      },
    ],
    audience: [
      'Contractors and trades who need a certificate of insurance to bid work',
      'Shops, salons, restaurants, and retail with a physical location',
      'Consultants and office-based businesses working from home or a small suite',
      'Farms of any size, including part-time and hobby operations',
      'Anyone whose business vehicles are still on a personal auto policy',
    ],
    goodToKnow: [
      {
        q: 'I work out of my house. Is that covered?',
        a: 'Usually not by your homeowners policy, or only barely. Business equipment and business liability at home almost always need to be added or written separately.',
      },
      {
        q: 'How fast can I get a certificate of insurance?',
        a: 'Same day in most cases once the policy is in force. Call or email and I will get it to whoever needs it.',
      },
      {
        q: 'Do I need workers comp for one part-time employee?',
        a: 'It depends on hours and how you are structured. Michigan thresholds are specific — worth ten minutes on the phone rather than a guess.',
      },
    ],
  },
];

export const getCoverage = (slug: string) =>
  coverage.find((c) => c.slug === slug);
