import { formatHour } from '../data'

interface Props {
  active: boolean
  hour: number
  playing: boolean
  setActive: (on: boolean) => void
  setHour: (h: number) => void
  setPlaying: (on: boolean) => void
}

export default function TimeScrubber(p: Props) {
  if (!p.active) {
    return (
      <button className="scrubber-pill collapsed" onClick={() => p.setActive(true)}>
        ▶ Animate by hour
      </button>
    )
  }
  return (
    <div className="scrubber-pill">
      <button
        className="play-btn"
        onClick={() => p.setPlaying(!p.playing)}
        aria-label={p.playing ? 'Pause' : 'Play'}
      >
        {p.playing ? '❚❚' : '▶'}
      </button>
      <input
        type="range"
        min={0}
        max={23}
        value={p.hour}
        onChange={(e) => {
          p.setPlaying(false)
          p.setHour(Number(e.target.value))
        }}
      />
      <span className="scrub-hour">{formatHour(p.hour)}</span>
      <button
        className="close-btn"
        onClick={() => {
          p.setPlaying(false)
          p.setActive(false)
        }}
        aria-label="Close hour animation"
      >
        ✕
      </button>
    </div>
  )
}
