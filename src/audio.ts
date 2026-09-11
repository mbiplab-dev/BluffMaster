let context: AudioContext | null = null;
let enabled = localStorage.getItem("bluff-sound") !== "false";
export function soundEnabled(value: boolean) {
  enabled = value;
  localStorage.setItem("bluff-sound", String(value));
}
export function unlockAudio() {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
  } catch {
    /* Optional browser feature. */
  }
}
export function playSound(
  kind:
    | "card"
    | "select"
    | "turn"
    | "bluff"
    | "win"
    | "flip"
    | "join"
    | "leave"
    | "warning",
) {
  if (!enabled || !context || context.state !== "running") return;
  const notes: Record<typeof kind, number[]> = {
    card: [210, 150],
    select: [520],
    turn: [440, 660],
    bluff: [180, 140, 100],
    win: [392, 494, 587, 784],
    flip: [280, 420],
    join: [440, 554],
    leave: [440, 330],
    warning: [640, 640],
  };
  notes[kind].forEach((frequency, i) => {
    const oscillator = context!.createOscillator();
    const gain = context!.createGain();
    oscillator.type = kind === "card" ? "triangle" : "sine";
    oscillator.frequency.value = frequency;
    const at = context!.currentTime + i * 0.09;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.055, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
    oscillator.connect(gain);
    gain.connect(context!.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.16);
  });
}
