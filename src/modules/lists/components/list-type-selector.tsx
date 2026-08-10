'use client'

import { Check, ShoppingBasket } from 'lucide-react'

import { useI18n } from '@/src/modules/i18n'

import type { ListType } from '../types/list.types'

type ListTypeSelectorProps = {
  name: string
  value: ListType
  onChange: (value: ListType) => void
}

const options: Array<{
  value: ListType
  labelKey: 'home.typeShopping' | 'home.typeTodo'
  descriptionKey: 'home.typeShoppingDescription' | 'home.typeTodoDescription'
  Icon: typeof ShoppingBasket
}> = [
  {
    value: 'shopping',
    labelKey: 'home.typeShopping',
    descriptionKey: 'home.typeShoppingDescription',
    Icon: ShoppingBasket,
  },
  {
    value: 'todo',
    labelKey: 'home.typeTodo',
    descriptionKey: 'home.typeTodoDescription',
    Icon: Check,
  },
]

export function ListTypeSelector({
  name,
  value,
  onChange,
}: ListTypeSelectorProps) {
  const { t } = useI18n()

  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-sm font-medium text-foreground">
        {t('home.listType')}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map(({ value: optionValue, labelKey, descriptionKey, Icon }) => {
          const selected = value === optionValue

          return (
            <label
              key={optionValue}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                selected
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-secondary text-muted-foreground'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={optionValue}
                checked={selected}
                onChange={() => onChange(optionValue)}
                className="sr-only"
              />
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                  selected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground'
                }`}
                aria-hidden
              >
                <Icon className="size-5" strokeWidth={2.5} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t(labelKey)}</span>
                <span className="block text-xs text-muted-foreground">
                  {t(descriptionKey)}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
