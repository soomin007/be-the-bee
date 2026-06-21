// 효과음 + 배경음악. ui 계층(Web Audio / HTMLAudio 사용 가능). 엔진과 무관.
//
// 효과음은 Web Audio 로 합성 → 오디오 파일이 필요 없다(놓기/승리/리치/오류).
// 배경음악(BGM)만 파일을 쓴다: public/bgm.mp3 (사용자가 Suno로 만들어 넣을 예정).
// 파일이 없으면 조용히 무시한다.

import type { Player } from '../engine/index'

type OscType = 'sine' | 'triangle' | 'square' | 'sawtooth'

export interface Sound {
  enabled: boolean
  place(player: Player): void
  win(): void
  alert(): void
  invalid(): void
  toggleMusic(): boolean // 토글 후 켜짐 여부 반환
  musicOn(): boolean
}

export function createSound(): Sound {
  let ctx: AudioContext | null = null
  let music: HTMLAudioElement | null = null
  let wantMusic = false

  function audio(): AudioContext | null {
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!ctx) ctx = new Ctor()
      if (ctx.state === 'suspended') void ctx.resume()
      return ctx
    } catch {
      return null
    }
  }

  // 한 음: freq(Hz), dur(s), 파형, 시작 지연, 최대 볼륨.
  function tone(freq: number, dur: number, type: OscType, when = 0, peak = 0.2): void {
    const c = audio()
    if (!c) return
    const t0 = c.currentTime + when
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(c.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.03)
  }

  const api: Sound = {
    enabled: true,

    place(player: Player): void {
      if (!api.enabled) return
      // 노랑은 살짝 높게, 갈색은 낮게 — 가벼운 마림바 느낌
      tone(player === 'yellow' ? 660 : 392, 0.14, 'triangle', 0, 0.18)
      tone(player === 'yellow' ? 990 : 588, 0.1, 'sine', 0.02, 0.06)
    },

    win(): void {
      if (!api.enabled) return
      const notes = [523.25, 659.25, 783.99, 1046.5] // C E G C 아르페지오
      notes.forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.1, 0.2))
    },

    alert(): void {
      if (!api.enabled) return
      tone(880, 0.12, 'sine', 0, 0.16)
      tone(740, 0.16, 'sine', 0.13, 0.16)
    },

    invalid(): void {
      if (!api.enabled) return
      tone(160, 0.18, 'sawtooth', 0, 0.12)
    },

    toggleMusic(): boolean {
      wantMusic = !wantMusic
      if (wantMusic) {
        if (!music) {
          music = new Audio(`${import.meta.env.BASE_URL}bgm.mp3`)
          music.loop = true
          music.volume = 0.35
        }
        void music.play().catch(() => {
          // 파일 없음/자동재생 차단 — 조용히 무시
          wantMusic = false
        })
      } else if (music) {
        music.pause()
      }
      return wantMusic
    },

    musicOn(): boolean {
      return wantMusic
    },
  }

  return api
}
