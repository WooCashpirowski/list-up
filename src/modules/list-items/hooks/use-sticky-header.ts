'use client'

import { useEffect, useRef, useState } from 'react'

export function useStickyHeader() {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [isElevated, setIsElevated] = useState(false)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsElevated(!entry.isIntersecting && entry.boundingClientRect.top < 0)
      },
      { rootMargin: '8px 0px 0px 0px' },
    )
    observer.observe(sentinel)

    return () => observer.disconnect()
  }, [])

  return { sentinelRef, isElevated }
}
