/**
 * Générateur audio Web Audio API pour les sonneries d'appel (entrant et sortant)
 * Fonctionne sur tous les navigateurs sans nécessiter de fichiers audio externes mp3/wav
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  private intervalId: any = null;
  private isPlaying = false;

  private getAudioContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Joue la sonnerie d'appel entrant (mélodie d'appel téléphonique agréable)
   */
  public startIncomingRingtone() {
    if (typeof window === 'undefined') return;
    this.stop();
    this.isPlaying = true;

    const playChime = () => {
      if (!this.isPlaying) return;
      try {
        const ctx = this.getAudioContext();
        const now = ctx.currentTime;

        // Bip mélodieux 1
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now); // C5
        osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5
        gain1.gain.setValueAtTime(0.2, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        // Bip mélodieux 2 (harmonie)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(783.99, now + 0.15); // G5
        osc2.frequency.exponentialRampToValueAtTime(1046.5, now + 0.3); // C6
        gain2.gain.setValueAtTime(0.25, now + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.6);

        // Répétition rapide
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(880, now + 0.65); // A5
        gain3.gain.setValueAtTime(0.2, now + 0.65);
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
        osc3.connect(gain3);
        gain3.connect(ctx.destination);
        osc3.start(now + 0.65);
        osc3.stop(now + 1.1);
      } catch (e) {
        console.warn('Audio play error:', e);
      }
    };

    playChime();
    this.intervalId = setInterval(playChime, 2400);
  }

  /**
   * Joue la sonnerie d'appel sortant ("Driiing... Driiing...") pour celui qui appelle
   */
  public startOutgoingRingtone() {
    if (typeof window === 'undefined') return;
    this.stop();
    this.isPlaying = true;

    const playTone = () => {
      if (!this.isPlaying) return;
      try {
        const ctx = this.getAudioContext();
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        // Fréquences standard de tonalité d'appel téléphonique (440Hz + 480Hz)
        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.setValueAtTime(0.12, now + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.4);
        osc2.stop(now + 1.4);
      } catch (e) {
        console.warn('Audio tone error:', e);
      }
    };

    playTone();
    this.intervalId = setInterval(playTone, 3500);
  }

  /**
   * Pré-débloque le contexte audio lors d'un clic utilisateur pour éviter le blocage Autoplay des navigateurs
   */
  public unlock() {
    if (typeof window === 'undefined') return;
    try {
      const ctx = this.getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {}
  }

  /**
   * Arrête immédiatement toute sonnerie en cours
   */
  public stop() {
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export const soundManager = new SoundManager();
