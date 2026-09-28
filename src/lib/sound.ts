/**
 * Générateur audio Web Audio API pour les sonneries d'appel (entrant et sortant)
 * Fonctionne sur tous les navigateurs (Chrome, Safari, Firefox, Edge, Mobile) sans fichier externe.
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
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Pré-débloque le contexte audio lors d'un clic utilisateur pour éviter le blocage Autoplay des navigateurs
   */
  public unlock() {
    if (typeof window === 'undefined') return;
    try {
      const ctx = this.getAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      // Joue un micro-son inaudible pour réveiller le moteur audio du navigateur
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.01);
    } catch {}
  }

  /**
   * Joue la sonnerie d'appel entrant (mélodie dynamique et audible)
   */
  public startIncomingRingtone() {
    if (typeof window === 'undefined') return;
    this.stop();
    this.isPlaying = true;
    this.unlock();

    // Vibration mobile si disponible
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([400, 200, 400, 200, 800]);
      } catch {}
    }

    const playChime = () => {
      if (!this.isPlaying) return;
      try {
        const ctx = this.getAudioContext();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;

        // Note 1 : C5 (523Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now);
        osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // Ramp vers E5
        gain1.gain.setValueAtTime(0.45, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.4);

        // Note 2 : G5 (784Hz) + C6 (1046Hz)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(783.99, now + 0.18);
        osc2.frequency.exponentialRampToValueAtTime(1046.5, now + 0.35);
        gain2.gain.setValueAtTime(0.5, now + 0.18);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.18);
        osc2.stop(now + 0.65);

        // Note 3 : A5 (880Hz)
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(880, now + 0.7);
        gain3.gain.setValueAtTime(0.45, now + 0.7);
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc3.connect(gain3);
        gain3.connect(ctx.destination);
        osc3.start(now + 0.7);
        osc3.stop(now + 1.2);

        // Répétition vibration
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate([400, 200, 400]);
          } catch {}
        }
      } catch (e) {
        console.warn('Audio play error:', e);
      }
    };

    playChime();
    this.intervalId = setInterval(playChime, 2500);
  }

  /**
   * Joue la sonnerie d'appel sortant ("Driiing... Driiing...") pour l'appelant
   */
  public startOutgoingRingtone() {
    if (typeof window === 'undefined') return;
    this.stop();
    this.isPlaying = true;
    this.unlock();

    const playTone = () => {
      if (!this.isPlaying) return;
      try {
        const ctx = this.getAudioContext();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        // Tonalité standard européenne/US (440Hz + 480Hz)
        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.setValueAtTime(0.3, now + 1.2);
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
    this.intervalId = setInterval(playTone, 3200);
  }

  /**
   * Arrête immédiatement toute sonnerie et vibration en cours
   */
  public stop() {
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(0);
      } catch {}
    }
  }
}

export const soundManager = new SoundManager();
