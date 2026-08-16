export type CategoryTone =
  | 'produce'
  | 'pantry'
  | 'chilled'
  | 'protein'
  | 'home'
  | 'neutral'

const categoryEmoji: Record<string, string> = {
  alkohol: '🍷',
  elektronika: '🔌',
  higiena: '🧴',
  makarony: '🍝',
  mięso: '🥩',
  mrożonki: '❄️',
  nabiał: '🥛',
  napoje: '🥤',
  obuwie: '👟',
  odzież: '👕',
  owoce: '🍎',
  pieczywo: '🥖',
  przekąski: '🍫',
  przyprawy: '🧂',
  ryby: '🐟',
  warzywa: '🥦',
  zioła: '🌿',
  zwierzęta: '🐾',
}

function normalizeCategoryName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pl')
    .replace(/ł/g, 'l')
}

export function getCategoryTone(name: string): CategoryTone {
  const normalized = normalizeCategoryName(name)

  if (/owoce|warzywa|ziola/.test(normalized)) return 'produce'
  if (/pieczywo|makarony|zbozowe|przekaski|przyprawy|konserwy|alkohol/.test(normalized)) {
    return 'pantry'
  }
  if (/nabial|mrozonki|napoje/.test(normalized)) return 'chilled'
  if (/mieso|wedliny|ryby/.test(normalized)) return 'protein'
  if (/higiena|gosp|elektronika|odziez|obuwie|zwierzeta/.test(normalized)) {
    return 'home'
  }

  return 'neutral'
}

export function getCategoryEmoji(name: string): string {
  const normalized = name.toLocaleLowerCase('pl')
  const match = Object.entries(categoryEmoji).find(([keyword]) =>
    normalized.includes(keyword),
  )
  return match?.[1] ?? '🏷️'
}
