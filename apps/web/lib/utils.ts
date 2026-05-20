import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// shadcn/ui class-name helper. clsx resolves conditional class lists; twMerge
// then dedupes conflicting Tailwind utilities so a later class wins over an
// earlier one (e.g. `cn('p-2', cond && 'p-4')` → `p-4`).
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// English ordinal suffix: 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th", 11 → "11th".
export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}
