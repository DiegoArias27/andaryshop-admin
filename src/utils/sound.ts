let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

function beep(frequencies: number[], duration = 0.09, gap = 0.07) {
  const audioCtx = getContext()
  if (!audioCtx) return
  frequencies.forEach((freq, i) => {
    const start = audioCtx.currentTime + i * gap
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.001, start)
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  })
}

export function playSuccessSound() {
  beep([880, 1175])
}

export function playErrorSound() {
  beep([392, 330])
}

export function playNotificationSound() {
  beep([660, 880, 1046])
}
