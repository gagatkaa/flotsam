import seaUrl from '../sounds/sea_sounds.wav?url'
import hitUrl from '../sounds/boat_hit.wav?url'
import chestUrl from '../sounds/chest-pickup.mp3?url'
import mapUrl from '../sounds/map-pickup.mp3?url'
import bellUrl from '../sounds/bell-sound.mp3?url'
import doorUrl from '../sounds/door-opening.mp3?url'
import marketUrl from '../sounds/crab-market.mp3?url'

const CLIP_URLS = {
  chest: chestUrl,
  map: mapUrl,
  bell: bellUrl,
  door: doorUrl,
  market: marketUrl,
}

export type Clip = keyof typeof CLIP_URLS

interface Playing {
  source: AudioBufferSourceNode
  gain: GainNode
}

/** seconds an island's sound takes to fade when you leave */
const ARRIVAL_FADE = 0.6

interface Mixer {
  ctx: AudioContext
  master: GainNode
  seaGain: GainNode
  /** depth of the slow swell on the sea's volume */
  seaDepth: GainNode
  /** the synthesized water churning past the hull */
  swimGain: GainNode
  swimFilter: BiquadFilterNode
}

/**
 * All the sound, on one AudioContext created lazily on the first user gesture,
 * since browsers will not start audio before one.
 */
export class Soundscape {
  private mixer: Mixer | null = null
  private hitBuffer: AudioBuffer | null = null
  private hitSource: AudioBufferSourceNode | null = null
  private clips: Partial<Record<Clip, AudioBuffer>> = {}
  /** the island's own sound, while you are ashore */
  private arrival: Playing | null = null
  private ready = false

  /** create the context, or wake a suspended one */
  start() {
    if (this.mixer) {
      if (this.mixer.ctx.state === 'suspended') void this.mixer.ctx.resume()
      return
    }

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return

    this.mixer = buildMixer(new Ctor())
    void this.loadClips(this.mixer)
  }

  /** `rough` is 0..1, how much the sea has closed in; `quiet` ducks everything while paused */
  tick(rough: number, speed: number, quiet: boolean) {
    if (!this.mixer || !this.ready) return
    const { ctx, master, seaGain, seaDepth, swimGain, swimFilter } = this.mixer
    const now = ctx.currentTime

    const way = Math.max(0, Math.min(1, speed / 6))
    swimGain.gain.setTargetAtTime(way * 0.22, now, 0.12)
    swimFilter.frequency.setTargetAtTime(340 + way * 560, now, 0.12)

    const swell = rough * 0.5
    seaGain.gain.setTargetAtTime(0.34 + swell, now, 0.8)
    seaDepth.gain.setTargetAtTime(0.1 + swell, now, 0.8)

    master.gain.setTargetAtTime(quiet ? 0.22 : 1, now, 0.15)
  }

  /** the hull-slam, louder and higher-pitched the harder she hits */
  bump(speed: number) {
    if (!this.mixer || !this.hitBuffer) return
    const { ctx, master } = this.mixer

    if (this.hitSource) {
      this.hitSource.stop()
      this.hitSource.disconnect()
    }

    const source = ctx.createBufferSource()
    source.buffer = this.hitBuffer
    source.playbackRate.value = Math.max(0.85, Math.min(1.5, 0.9 + speed * 0.08))

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(Math.max(0.28, Math.min(0.8, 0.3 + speed * 0.07)), ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + this.hitBuffer.duration)

    source.connect(gain)
    gain.connect(master)
    source.onended = () => {
      gain.disconnect()
      if (this.hitSource === source) this.hitSource = null
    }
    source.start()
    this.hitSource = source
  }

  play(clip: Clip): Playing | null {
    const buffer = this.clips[clip]
    if (!this.mixer || !buffer) return null
    const { ctx, master } = this.mixer

    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = 0.8
    source.connect(gain)
    gain.connect(master)
    source.onended = () => gain.disconnect()
    source.start()
    return { source, gain }
  }

  /** an island's greeting, which lasts only as long as you stay ashore */
  arrive(clip: Clip) {
    this.leave()
    this.arrival = this.play(clip)
  }

  leave() {
    if (!this.mixer || !this.arrival) return
    const { source, gain } = this.arrival
    const now = this.mixer.ctx.currentTime
    gain.gain.setTargetAtTime(0, now, ARRIVAL_FADE / 4)
    source.stop(now + ARRIVAL_FADE)
    this.arrival = null
  }

  private async loadClips({ ctx, seaGain }: Mixer) {
    try {
      const [seaBuffer, hitBuffer] = await Promise.all([loadClip(ctx, seaUrl), loadClip(ctx, hitUrl)])
      this.hitBuffer = hitBuffer

      const sea = ctx.createBufferSource()
      sea.buffer = seaBuffer
      sea.loop = true
      sea.connect(seaGain)
      sea.start()

      this.ready = true
    } catch (err) {
      console.warn('could not load audio', err)
    }

    // loaded separately, so one bad file cannot silence the sea
    for (const [clip, url] of Object.entries(CLIP_URLS) as [Clip, string][]) {
      loadClip(ctx, url)
        .then((buffer) => (this.clips[clip] = buffer))
        .catch((err) => console.warn(`could not load sound: ${clip}`, err))
    }
  }
}

async function loadClip(ctx: AudioContext, url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return ctx.decodeAudioData(await response.arrayBuffer())
}

function buildMixer(ctx: AudioContext): Mixer {
  const master = ctx.createGain()
  master.connect(ctx.destination)

  // the looped sea is connected once it loads; a slow LFO breathes on its volume
  const seaGain = ctx.createGain()
  seaGain.gain.value = 0.34
  seaGain.connect(master)

  const swell = ctx.createOscillator()
  swell.frequency.value = 0.09
  const seaDepth = ctx.createGain()
  seaDepth.gain.value = 0.1
  swell.connect(seaDepth)
  seaDepth.connect(seaGain.gain)
  swell.start()

  // brown noise through a bandpass that tick() drives with speed
  const swimFilter = ctx.createBiquadFilter()
  swimFilter.type = 'bandpass'
  swimFilter.frequency.value = 340
  swimFilter.Q.value = 0.9
  const swimGain = ctx.createGain()
  swimGain.gain.value = 0
  swimFilter.connect(swimGain)
  swimGain.connect(master)

  const swim = ctx.createBufferSource()
  swim.buffer = makeNoise(ctx, 2)
  swim.loop = true
  swim.connect(swimFilter)
  swim.start()

  return { ctx, master, seaGain, seaDepth, swimGain, swimFilter }
}

function makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
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
