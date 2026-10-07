import seaUrl from '../sounds/sea_sounds.wav?url'
import hitUrl from '../sounds/boat_hit.wav?url'

/**
 * All the sound, one lazy AudioContext.
 *
 * Browsers will not let audio start before a user gesture, so nothing is
 * created until the first click or keypress. The looping sea bed is the WAV
 * in src/sounds; the boat "swimming" is a thin synthesized water-churn whose
 * colour follows her speed, because there is no file for that layer; and
 * bumping into things replays src/sounds/boat_hit.wav, harder the faster she
 * hits. All gains are ramped with setTargetAtTime, so nothing zips.
 */
export class Soundscape {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private seaGain: GainNode | null = null
  private seaDepth: GainNode | null = null
  private seaSwell: OscillatorNode | null = null
  private swimGain: GainNode | null = null
  private swimFilter: BiquadFilterNode | null = null
  private seaBuffer: AudioBuffer | null = null
  private hitBuffer: AudioBuffer | null = null
  private hitSource: AudioBufferSourceNode | null = null
  private hasAudio = false

  /** create the context (or wake a suspended one) on a user gesture */
  start() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.build()
      void this.loadClips()
    } else if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
  }

  /**
   * Drive the looped layers every frame. `rough` is 0..1 (how much the sea has
   * closed in), `speed` the boat's knots, `quiet` true while the pause menu is
   * up so the sea sinks into the background instead of shouting over the sheet.
   */
  tick(rough: number, speed: number, quiet: boolean) {
    if (!this.ctx || !this.hasAudio) return

    const now = this.ctx.currentTime

    // the swim churn: silent at rest, full at ~6 units/s, brightening with way
    const way = Math.max(0, Math.min(1, speed / 6))
    if (this.swimGain) {
      this.swimGain.gain.setTargetAtTime(way * 0.22, now, 0.12)
    }
    if (this.swimFilter) {
      this.swimFilter.frequency.setTargetAtTime(340 + way * 560, now, 0.12)
    }

    // the sea bed: louder and rougher the longer you are out there
    if (this.seaGain) {
      const swell = rough * 0.5
      this.seaGain.gain.setTargetAtTime(0.34 + swell, now, 0.8)
      if (this.seaDepth) this.seaDepth.gain.setTargetAtTime(0.1 + swell, now, 0.8)
    }

    if (this.master) {
      this.master.gain.setTargetAtTime(quiet ? 0.22 : 1, now, 0.15)
    }
  }

  /** play the hull-slam, louder and deeper-keyed the harder she hits */
  bump(speed: number) {
    if (!this.ctx || !this.hitBuffer || !this.master) return

    if (this.hitSource) {
      try {
        this.hitSource.stop()
      } catch {
        /* already stopped */
      }
      this.hitSource.disconnect()
      this.hitSource = null
    }

    const source = this.ctx.createBufferSource()
    source.buffer = this.hitBuffer
    source.playbackRate.value = Math.max(0.85, Math.min(1.5, 0.9 + speed * 0.08))

    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(Math.max(0.28, Math.min(0.8, 0.3 + speed * 0.07)), this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + source.buffer.duration)

    source.connect(gain)
    gain.connect(this.master)
    source.onended = () => {
      gain.disconnect()
      if (this.hitSource === source) this.hitSource = null
    }
    source.start()
    this.hitSource = source
  }

  private build() {
    const ctx = this.ctx
    if (!ctx) return

    this.master = ctx.createGain()
    this.master.gain.value = 1
    this.master.connect(ctx.destination)

    // sea bed: looped WAV, with a slow swell breathing on its volume
    this.seaGain = ctx.createGain()
    this.seaGain.gain.value = 0.34
    this.seaGain.connect(this.master)

    this.seaSwell = ctx.createOscillator()
    this.seaSwell.frequency.value = 0.09
    this.seaDepth = ctx.createGain()
    this.seaDepth.gain.value = 0.1
    this.seaSwell.connect(this.seaDepth)
    this.seaDepth.connect(this.seaGain.gain)
    this.seaSwell.start()

    // swim churn: pinkish noise through a bandpass; the filter will be driven
    // by speed via tick()
    const noise = this.makeNoise(2)
    this.swimFilter = ctx.createBiquadFilter()
    this.swimFilter.type = 'bandpass'
    this.swimFilter.frequency.value = 340
    this.swimFilter.Q.value = 0.9
    this.swimGain = ctx.createGain()
    this.swimGain.gain.value = 0
    this.swimGain.connect(this.master)

    const swim = ctx.createBufferSource()
    swim.buffer = noise
    swim.loop = true
    swim.connect(this.swimFilter)
    this.swimFilter.connect(this.swimGain)
    swim.start()
  }

  private async loadClips() {
    const ctx = this.ctx
    if (!ctx) return
    try {
      const [seaBytes, hitBytes] = await Promise.all([
        fetch(seaUrl).then((r) => r.arrayBuffer()),
        fetch(hitUrl).then((r) => r.arrayBuffer()),
      ])
      ;[this.seaBuffer, this.hitBuffer] = await Promise.all([
        ctx.decodeAudioData(seaBytes),
        ctx.decodeAudioData(hitBytes),
      ])

      if (this.seaBuffer && this.seaGain && ctx) {
        const sea = ctx.createBufferSource()
        sea.buffer = this.seaBuffer
        sea.loop = true
        sea.connect(this.seaGain)
        sea.start()
      }
      this.hasAudio = true
    } catch (err) {
      console.warn('could not load audio', err)
    }
  }

  /** a few seconds of brown-ish noise to sculpt the water-churn with */
  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx as AudioContext
    const sampleRate = ctx.sampleRate
    const buffer = ctx.createBuffer(2, Math.floor(sampleRate * seconds), sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch)
      let last = 0
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1
        last = (last + 0.02 * white) / 1.02
        data[i] = last * 3.5
      }
    }
    return buffer
  }
}