'use client'

import { useMemo } from 'react'

import { buildListProgress } from '../model/list-progress'
import type { ListProgressItem } from '../types/list-progress.types'

export function useListProgress(items: ListProgressItem[]) {
  return useMemo(() => buildListProgress(items), [items])
}
