/**
 * Validasi input (Zod) — dipakai oleh form dan boundary data eksternal.
 */
import { z } from 'zod';

export const createMeetingSchema = z.object({
  title: z.string().trim().min(3, 'Judul rapat minimal 3 karakter').max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus yyyy-MM-dd'),
  location: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  participants: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
  language: z.string().min(2).max(10).default('id'),
  minutesTemplateId: z.string().min(1).optional(),
});

export type CreateMeetingForm = z.infer<typeof createMeetingSchema>;

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ');
}
