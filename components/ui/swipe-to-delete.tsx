'use client'

import { Trash2 } from 'lucide-react'
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils'

const AXIS_LOCK_DISTANCE = 8
const VERTICAL_INTENT_DISTANCE = 14
const AXIS_DOMINANCE_RATIO = 1.35
const DISMISS_THRESHOLD_RATIO = 0.4
const FLING_MIN_DISTANCE_RATIO = 0.18
const FLING_VELOCITY_PX_PER_MS = 0.45
const FLING_VELOCITY_MAX_AGE_MS = 120
const MOTION_DURATION_MS = 180

type GestureAxis = 'idle' | 'horizontal'

type Gesture = {
  axis: GestureAxis
  dismissing: boolean
  lastMoveAt: number
  lastX: number
  offset: number
  pointerId: number | null
  startX: number
  startY: number
  velocityX: number
}

type SwipeToDeleteProps = {
  children: ReactNode
  className?: string
  contentClassName?: string
  disabled?: boolean
  onDelete: () => boolean | void | Promise<boolean | void>
}

function getMotionDuration(): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 0
    : MOTION_DURATION_MS
}

export const SwipeToDelete = memo(function SwipeToDelete({
  children,
  className,
  contentClassName,
  disabled = false,
  onDelete,
}: SwipeToDeleteProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const backgroundRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const startIconRef = useRef<HTMLSpanElement>(null)
  const endIconRef = useRef<HTMLSpanElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const animationTimerRef = useRef<number | null>(null)
  const settleTimerRef = useRef<number | null>(null)
  const pendingOffsetRef = useRef(0)
  const suppressClickUntilRef = useRef(0)
  const mountedRef = useRef(true)
  const onDeleteRef = useRef(onDelete)
  const gestureRef = useRef<Gesture>({
    axis: 'idle',
    dismissing: false,
    lastMoveAt: 0,
    lastX: 0,
    offset: 0,
    pointerId: null,
    startX: 0,
    startY: 0,
    velocityX: 0,
  })

  onDeleteRef.current = onDelete

  const clearAnimationFrame = useCallback(() => {
    if (animationFrameRef.current === null) return
    window.cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = null
  }, [])

  const clearTimers = useCallback(() => {
    if (animationTimerRef.current !== null) {
      window.clearTimeout(animationTimerRef.current)
      animationTimerRef.current = null
    }
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
  }, [])

  const paintOffset = useCallback((offset: number) => {
    const root = rootRef.current
    const background = backgroundRef.current
    const content = contentRef.current
    const startIcon = startIconRef.current
    const endIcon = endIconRef.current
    if (!root || !background || !content || !startIcon || !endIcon) return

    const width = Math.max(root.getBoundingClientRect().width, 1)
    const threshold = width * DISMISS_THRESHOLD_RATIO
    const progress = Math.min(Math.abs(offset) / threshold, 1)
    const activeIcon = offset >= 0 ? startIcon : endIcon
    const inactiveIcon = offset >= 0 ? endIcon : startIcon

    content.style.transform = `translate3d(${offset}px, 0, 0)`
    background.style.opacity = offset === 0 ? '0' : '1'
    activeIcon.style.opacity = String(0.45 + progress * 0.55)
    activeIcon.style.transform = `scale(${0.82 + progress * 0.18})`
    inactiveIcon.style.opacity = '0'
    inactiveIcon.style.transform = 'scale(0.82)'
    root.dataset.swipeDirection = offset >= 0 ? 'right' : 'left'
  }, [])

  const scheduleOffsetPaint = useCallback(
    (offset: number) => {
      pendingOffsetRef.current = offset
      if (animationFrameRef.current !== null) return

      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = null
        paintOffset(pendingOffsetRef.current)
      })
    },
    [paintOffset],
  )

  const restorePosition = useCallback(
    (animated: boolean) => {
      const root = rootRef.current
      const background = backgroundRef.current
      const content = contentRef.current
      const startIcon = startIconRef.current
      const endIcon = endIconRef.current
      clearAnimationFrame()
      clearTimers()

      const gesture = gestureRef.current
      gesture.axis = 'idle'
      gesture.dismissing = false
      gesture.offset = 0
      gesture.pointerId = null

      if (!root || !background || !content || !startIcon || !endIcon) return

      const duration = animated ? getMotionDuration() : 0
      const transition = duration
        ? `transform ${duration}ms cubic-bezier(0.2, 0, 0, 1)`
        : 'none'

      root.dataset.swipeState = duration ? 'settling' : 'idle'
      delete root.dataset.swipeDirection
      content.style.transition = transition
      content.style.transform = 'translate3d(0, 0, 0)'
      content.style.pointerEvents = ''
      content.style.userSelect = ''
      background.style.transition = duration
        ? `opacity ${duration}ms ease-out`
        : 'none'
      background.style.opacity = '0'
      startIcon.style.opacity = '0'
      startIcon.style.transform = 'scale(0.82)'
      endIcon.style.opacity = '0'
      endIcon.style.transform = 'scale(0.82)'

      if (duration === 0) {
        content.style.willChange = ''
        return
      }

      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null
        if (!mountedRef.current) return
        root.dataset.swipeState = 'idle'
        content.style.transition = ''
        content.style.willChange = ''
        background.style.transition = ''
      }, duration)
    },
    [clearAnimationFrame, clearTimers],
  )

  const completeDismiss = useCallback(
    (direction: -1 | 1) => {
      const root = rootRef.current
      const background = backgroundRef.current
      const content = contentRef.current
      if (!root || !background || !content) return

      clearAnimationFrame()
      const gesture = gestureRef.current
      const duration = getMotionDuration()
      const targetOffset = direction * root.getBoundingClientRect().width * 1.05

      gesture.axis = 'idle'
      gesture.dismissing = true
      gesture.offset = targetOffset
      gesture.pointerId = null
      root.dataset.swipeState = 'dismissing'
      content.style.pointerEvents = 'none'
      content.style.transition = duration
        ? `transform ${duration}ms cubic-bezier(0.2, 0, 0, 1)`
        : 'none'
      background.style.transition = 'none'
      paintOffset(targetOffset)

      const runDelete = async () => {
        animationTimerRef.current = null
        try {
          const result = await onDeleteRef.current()
          if (result === false && mountedRef.current) restorePosition(true)
        } catch {
          if (mountedRef.current) restorePosition(true)
        }
      }

      if (duration === 0) void runDelete()
      else animationTimerRef.current = window.setTimeout(() => void runDelete(), duration)
    },
    [clearAnimationFrame, paintOffset, restorePosition],
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current
      if (
        disabled ||
        gesture.dismissing ||
        !event.isPrimary ||
        (event.pointerType === 'mouse' && event.button !== 0)
      ) {
        return
      }

      clearTimers()
      clearAnimationFrame()
      const content = contentRef.current
      const background = backgroundRef.current
      if (content) {
        content.style.transition = 'none'
        content.style.willChange = 'transform'
      }
      if (background) background.style.transition = 'none'
      const root = rootRef.current
      if (root) {
        root.dataset.swipeState = 'idle'
        delete root.dataset.swipeDirection
      }

      gesture.axis = 'idle'
      gesture.offset = 0
      gesture.pointerId = event.pointerId
      gesture.startX = event.clientX
      gesture.startY = event.clientY
      gesture.lastX = event.clientX
      gesture.lastMoveAt = event.timeStamp
      gesture.velocityX = 0
    },
    [clearAnimationFrame, clearTimers, disabled],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current
      if (gesture.pointerId !== event.pointerId || gesture.dismissing) return

      const deltaX = event.clientX - gesture.startX
      const deltaY = event.clientY - gesture.startY
      const elapsed = event.timeStamp - gesture.lastMoveAt
      if (elapsed > 0 && elapsed < 100) {
        const instantaneousVelocity = (event.clientX - gesture.lastX) / elapsed
        gesture.velocityX = gesture.velocityX * 0.25 + instantaneousVelocity * 0.75
      }
      gesture.lastX = event.clientX
      gesture.lastMoveAt = event.timeStamp

      if (gesture.axis === 'idle') {
        if (
          Math.abs(deltaX) < AXIS_LOCK_DISTANCE &&
          Math.abs(deltaY) < AXIS_LOCK_DISTANCE
        ) {
          return
        }

        if (
          Math.abs(deltaY) >= VERTICAL_INTENT_DISTANCE &&
          Math.abs(deltaY) > Math.abs(deltaX) * AXIS_DOMINANCE_RATIO
        ) {
          gesture.pointerId = null
          const content = contentRef.current
          if (content) content.style.willChange = ''
          return
        }

        if (Math.abs(deltaX) <= Math.abs(deltaY)) return

        gesture.axis = 'horizontal'
        suppressClickUntilRef.current = Date.now() + 450
        rootRef.current?.setAttribute('data-swipe-state', 'swiping')
        if (event.pointerType === 'mouse') {
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        event.currentTarget.style.userSelect = 'none'
      }

      if (event.cancelable) event.preventDefault()
      const width = Math.max(rootRef.current?.getBoundingClientRect().width ?? 0, 1)
      const offset = Math.max(-width, Math.min(width, deltaX))
      gesture.offset = offset
      scheduleOffsetPaint(offset)
    },
    [scheduleOffsetPaint],
  )

  const finishPointerGesture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current
      if (gesture.pointerId !== event.pointerId) return

      gesture.pointerId = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      if (gesture.axis !== 'horizontal') {
        const content = contentRef.current
        if (content) content.style.willChange = ''
        return
      }

      suppressClickUntilRef.current = Date.now() + 450
      const width = Math.max(rootRef.current?.getBoundingClientRect().width ?? 0, 1)
      const crossedPositionThreshold =
        Math.abs(gesture.offset) >= width * DISMISS_THRESHOLD_RATIO
      const velocityIsFresh =
        event.timeStamp - gesture.lastMoveAt <= FLING_VELOCITY_MAX_AGE_MS
      const crossedFlingThreshold =
        Math.abs(gesture.offset) >= width * FLING_MIN_DISTANCE_RATIO &&
        velocityIsFresh &&
        Math.abs(gesture.velocityX) >= FLING_VELOCITY_PX_PER_MS &&
        Math.sign(gesture.velocityX) === Math.sign(gesture.offset)

      if (!crossedPositionThreshold && !crossedFlingThreshold) {
        restorePosition(true)
        return
      }

      completeDismiss(gesture.offset >= 0 ? 1 : -1)
    },
    [completeDismiss, restorePosition],
  )

  const cancelPointerGesture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current
      if (gesture.pointerId !== event.pointerId) return
      suppressClickUntilRef.current = Date.now() + 450
      restorePosition(true)
    },
    [restorePosition],
  )

  const handleClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (Date.now() >= suppressClickUntilRef.current) return
      event.preventDefault()
      event.stopPropagation()
    },
    [],
  )

  useEffect(() => {
    if (disabled) restorePosition(false)
  }, [disabled, restorePosition])

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      clearAnimationFrame()
      clearTimers()
    }
  }, [clearAnimationFrame, clearTimers])

  return (
    <div
      ref={rootRef}
      data-swipe-state="idle"
      data-swipe-to-delete
      className={cn('relative isolate overflow-hidden', className)}
    >
      <div
        ref={backgroundRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-between bg-destructive px-4 text-destructive-foreground opacity-0"
      >
        <span
          ref={startIconRef}
          className="flex size-11 items-center justify-center rounded-full opacity-0"
        >
          <Trash2 className="size-5" strokeWidth={2.4} />
        </span>
        <span
          ref={endIconRef}
          className="flex size-11 items-center justify-center rounded-full opacity-0"
        >
          <Trash2 className="size-5" strokeWidth={2.4} />
        </span>
      </div>
      <div
        ref={contentRef}
        className={cn('relative z-10 bg-card', contentClassName)}
        style={{ touchAction: disabled ? 'auto' : 'pan-y' }}
        onClickCapture={handleClickCapture}
        onPointerCancel={cancelPointerGesture}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerGesture}
      >
        {children}
      </div>
    </div>
  )
})
