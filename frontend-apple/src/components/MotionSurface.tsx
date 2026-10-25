import { useEffect, useRef, type ReactNode, type PointerEvent } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useSpring, useMotionTemplate } from 'motion/react'

export function MotionSurface({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useSpring(y, { stiffness: 220, damping: 28 })
  const rotateY = useSpring(x, { stiffness: 220, damping: 28 })
  const lightX = useMotionValue(50)
  const lightY = useMotionValue(0)
  const glow = useMotionTemplate`radial-gradient(circle at ${lightX}% ${lightY}%, rgba(255,255,255,.48), transparent 65%)`
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (reduce || event.pointerType === 'touch') return
    const box = event.currentTarget.getBoundingClientRect()
    const px = (event.clientX - box.left) / box.width
    const py = (event.clientY - box.top) / box.height
    x.set((px - .5) * 3)
    y.set((.5 - py) * 3)
    lightX.set(px * 100)
    lightY.set(py * 100)
  }
  return <motion.div className={`motion-surface ${className}`} onPointerMove={onMove}
    onPointerLeave={() => { x.set(0); y.set(0) }}
    style={{ rotateX: reduce ? 0 : rotateX, rotateY: reduce ? 0 : rotateY, transformPerspective: 1100 }}
    initial={reduce ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
    transition={{ duration: .55, delay, ease: [.22, 1, .36, 1] }}>
    <motion.span className="surface-reflection" style={{ background: glow }} aria-hidden="true" />
    {children}
  </motion.div>
}

export function CountUp({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) { if (ref.current) ref.current.textContent = value.toFixed(decimals); return }
    const control = animate(0, value, { duration: .9, ease: [.22, 1, .36, 1], onUpdate: n => {
      if (ref.current) ref.current.textContent = n.toFixed(decimals)
    } })
    return () => control.stop()
  }, [value, decimals, reduce])
  return <><span ref={ref}>{value.toFixed(decimals)}</span>{suffix && <small>{suffix}</small>}</>
}
