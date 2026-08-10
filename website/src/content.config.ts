import { defineCollection } from 'astro:content';
import { z } from 'zod';
import { glob } from 'astro/loaders';

/**
 * Educational posts for the Resources page.
 * Add a post by dropping a Markdown file in src/content/resources/.
 */
const resources = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/resources' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** Shown as the post's category chip. */
    topic: z.enum(['Auto', 'Home', 'Life', 'Business', 'Basics']),
    publishedAt: z.coerce.date(),
    /** Rough read time in minutes. */
    readingMinutes: z.number().default(3),
    /** Pin to the top of the Resources page. */
    featured: z.boolean().default(false),
  }),
});

export const collections = { resources };
