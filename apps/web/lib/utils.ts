import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// shadcn/ui class-name helper. clsx resolves conditional class lists; twMerge
// then dedupes conflicting Tailwind utilities so a later class wins over an
// earlier one (e.g. `cn('p-2', cond && 'p-4')` → `p-4`).
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
