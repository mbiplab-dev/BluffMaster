/** Reserve a full card width beside every selection; only unselected cards overlap. */
export function layoutHand(
  count: number,
  selected: Set<number>,
  width: number,
  height: number,
) {
  const safeWidth = Math.max(80, width - 28);
  const gap = 14;
  const minStep = 10;
  const edges = Array.from(
    { length: Math.max(0, count - 1) },
    (_, i) => selected.has(i) || selected.has(i + 1),
  );
  const openEdges = edges.filter(Boolean).length;
  const normalEdges = edges.length - openEdges;
  const naturalWidth = Math.min(94, Math.max(38, (height - 48) * 0.7));
  const cardWidth = Math.min(
    naturalWidth,
    (safeWidth - openEdges * gap - normalEdges * minStep) / (openEdges + 1),
  );
  const step = Math.min(
    44,
    cardWidth * 0.52,
    normalEdges
      ? (safeWidth - cardWidth - openEdges * (cardWidth + gap)) / normalEdges
      : 44,
  );
  const positions = [0];
  for (const opened of edges)
    positions.push(positions.at(-1)! + (opened ? cardWidth + gap : step));
  const midpoint = (positions.at(-1) ?? 0) / 2;
  return {
    cardWidth,
    cards: positions.slice(0, count).map((x, i) => {
      const angle = selected.has(i)
        ? 0
        : (i - (count - 1) / 2) * Math.min(1.5, 16 / Math.max(1, count));
      return { x: x - midpoint, angle, curve: Math.abs(angle) * 0.65 };
    }),
  };
}
