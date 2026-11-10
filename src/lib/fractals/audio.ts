// Motor de áudio sintético para Ecos dos Fractais (Web Audio API nativa).
// Não depende de arquivos de áudio externos e respeita a preferência de silêncio do jogador.
class FractalAudioController {
  private ctx: AudioContext | null = null;
  private muted = false;
  private consecutiveGems = 0;
  private gemComboTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        this.muted = window.localStorage.getItem("fractals_sfx_muted") === "true";
      } catch {
        // O jogo continua funcionando mesmo quando o navegador bloqueia o armazenamento local.
      }
    }
  }

  private initContext(): void {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioContextConstructor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (AudioContextConstructor) {
        this.ctx = new AudioContextConstructor();
      }
    }

    if (this.ctx?.state === "suspended") {
      void this.ctx.resume().catch(() => {
        // Alguns navegadores podem bloquear resume até uma interação explícita do jogador.
      });
    }
  }

  /** Desbloqueia o contexto durante um gesto explícito do jogador (ex.: iniciar a partida). */
  public unlock(): void {
    if (!this.muted) this.initContext();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("fractals_sfx_muted", String(this.muted));
      } catch {
        // A preferência permanece aplicada durante a sessão mesmo sem acesso ao localStorage.
      }
    }

    if (!this.muted) this.initContext();
    return this.muted;
  }

  // 1. Disparo de projétil.
  public shoot(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = "sine";
    osc.frequency.setValueAtTime(650, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  // 2. Coleta de fragmentos de XP (escala pentatônica progressiva).
  public gem(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]; // C5, D5, E5, G5, A5, C6
    const freq = notes[this.consecutiveGems] ?? 659.25;
    this.consecutiveGems = (this.consecutiveGems + 1) % notes.length;

    if (this.gemComboTimer) clearTimeout(this.gemComboTimer);
    this.gemComboTimer = setTimeout(() => {
      this.consecutiveGems = 0;
      this.gemComboTimer = null;
    }, 600);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  // 3. Coleta de item especial.
  public special(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [587.33, 880, 1174.66].forEach((frequency, index) => {
      const startAt = now + index * 0.05;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.08, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(startAt);
      osc.stop(startAt + 0.35);
    });
  }

  // 4. Morte de inimigo / impacto.
  public kill(isBig = false): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    const duration = isBig ? 0.35 : 0.12;

    osc.type = isBig ? "sawtooth" : "square";
    osc.frequency.setValueAtTime(isBig ? 110 : 180, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + duration);

    gain.gain.setValueAtTime(isBig ? 0.12 : 0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  // 5. Subida de nível (arpejo místico).
  public levelUp(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const notes = [440, 554.37, 659.25, 880]; // A maior.
    const now = this.ctx.currentTime;

    notes.forEach((frequency, index) => {
      const startAt = now + index * 0.07;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.09, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(startAt);
      osc.stop(startAt + 0.35);
    });
  }

  // 6. Giro de carta de upgrade.
  public cardFlip(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = "triangle";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(540, now + 0.07);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  // 7. Vitória da expedição.
  public victory(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5];
    const now = this.ctx.currentTime;

    notes.forEach((frequency, index) => {
      const startAt = now + index * 0.12;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.12, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.6);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(startAt);
      osc.stop(startAt + 0.6);
    });
  }

  // 8. Derrota.
  public defeat(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.5);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.5);
  }
}

export const fractalAudio = new FractalAudioController();
