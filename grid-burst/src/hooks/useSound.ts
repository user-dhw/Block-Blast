import { useCallback, useEffect, useRef } from 'react';

type SoundName = 'pickup' | 'place' | 'invalid' | 'clear' | 'combo' | 'over';
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

const NOTES: Record<SoundName, number[]> = {
  pickup: [440], place: [392, 523.25], invalid: [180, 130],
  clear: [523.25, 659.25, 783.99], combo: [659.25, 783.99, 1046.5, 1318.51],
  over: [392, 329.63, 261.63],
};

/** Original short synthesized tones. No context is created until a user action. */
export function useSound(enabled: boolean) {
  const context = useRef<AudioContext | null>(null);
  const interacted = useRef(false);
  useEffect(() => {
    const activate = (event: Event) => { if (event.isTrusted) interacted.current = true; };
    window.addEventListener('pointerdown', activate, { capture: true, passive: true });
    window.addEventListener('keydown', activate, { capture: true });
    window.addEventListener('touchstart', activate, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', activate, true);
      window.removeEventListener('keydown', activate, true);
      window.removeEventListener('touchstart', activate, true);
      if (context.current && context.current.state !== 'closed') void context.current.close().catch(() => {});
      context.current = null;
    };
  }, []);

  return useCallback((name: SoundName): void => {
    if (!enabled || typeof window === 'undefined') return;
    if (!interacted.current && !navigator.userActivation?.hasBeenActive) return;
    try {
      const AudioConstructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
      if (!AudioConstructor) return;
      const audio = context.current ?? new AudioConstructor();
      context.current = audio;
      if (audio.state === 'closed') return;
      if (audio.state === 'suspended') void audio.resume().catch(() => {});
      const now = audio.currentTime;
      for (const [index, frequency] of NOTES[name].entries()) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const start = now + index * 0.055;
        oscillator.type = name === 'invalid' ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.055, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.14);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      }
    } catch {
      // Unsupported, denied, or interrupted audio must never affect gameplay.
    }
  }, [enabled]);
}
