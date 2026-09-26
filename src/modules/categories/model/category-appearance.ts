export type CategoryTone =
    | 'produce'
    | 'pantry'
    | 'chilled'
    | 'protein'
    | 'home'
    | 'neutral';

const categoryEmoji: Record<string, string> = {
    alkohol: '🍷',
    elektronika: '🔌',
    gosp: '🧹',
    higiena: '🧴',
    konserwy: '🥫',
    makarony: '🍝',
    mięso: '🥩',
    mrożonki: '❄️',
    nabiał: '🥛',
    napoje: '🥤',
    obuwie: '👟',
    odzież: '👕',
    // Match seafood before the broader "owoce" keyword.
    ryby: '🐟',
    'owoce morza': '🦐',
    owoce: '🍎',
    pieczywo: '🥖',
    przekąski: '🍫',
    przyprawy: '🧂',
    przetwory: '🥫',
    warzywa: '🥦',
    zioła: '🌿',
    zbożowe: '🌾',
    zwierzęta: '🐾',
};

function normalizeCategoryName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pl')
        .replace(/ł/g, 'l');
}

export function getCategoryTone(name: string): CategoryTone {
    const normalized = normalizeCategoryName(name);

    if (/mieso|wedliny|ryby|owoce morza/.test(normalized)) return 'protein';
    if (/owoce|warzywa|ziola/.test(normalized)) return 'produce';
    if (
        /pieczywo|makarony|zbozowe|przekaski|przyprawy|konserwy|alkohol/.test(
            normalized,
        )
    ) {
        return 'pantry';
    }
    if (/nabial|mrozonki|napoje/.test(normalized)) return 'chilled';
    if (/higiena|gosp|elektronika|odziez|obuwie|zwierzeta/.test(normalized)) {
        return 'home';
    }

    return 'neutral';
}

export function getCategoryEmoji(name: string): string {
    const normalized = normalizeCategoryName(name);
    const match = Object.entries(categoryEmoji).find(([keyword]) =>
        normalized.includes(normalizeCategoryName(keyword)),
    );
    return match?.[1] ?? '🏷️';
}
