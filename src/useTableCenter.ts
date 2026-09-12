import { useLayoutEffect, type RefObject } from "react";

/** Reserve the central lane using actual, transformed player/deck bounds. */
export function useTableCenter(
  root: RefObject<HTMLDivElement | null>,
  width: number,
  height: number,
  phase: string,
  roster: string,
) {
  useLayoutEffect(() => {
    const table = root.current;
    if (!table || !width || !height) return;
    const measure = () => {
      const bounds = table.getBoundingClientRect();
      const laneWidth = Math.max(112, Math.min(260, bounds.width * 0.34));
      const left = bounds.left + (bounds.width - laneWidth) / 2;
      const right = left + laneWidth;
      let top = bounds.top + 12,
        bottom = bounds.bottom - 12;
      for (const seat of table.querySelectorAll(".player-seat")) {
        const rect = seat.getBoundingClientRect();
        if (rect.right + 4 <= left || rect.left - 4 >= right) continue;
        if (rect.top + rect.height / 2 < bounds.top + bounds.height / 2)
          top = Math.max(top, rect.bottom + 14);
        else bottom = Math.min(bottom, rect.top - 14);
      }
      const space = Math.max(44, bottom - top);
      const revealing = phase === "reveal" || phase === "resolution";
      const textHeight = revealing ? 108 : phase === "challenge" ? 58 : 34;
      const scale = Math.max(
        0.16,
        Math.min(
          1.15,
          (space - textHeight) / 114,
          laneWidth / (revealing ? 310 : 150),
        ),
      );
      const properties = {
        "--center-y": `${(top + bottom) / 2 - bounds.top}px`,
        "--center-width": `${laneWidth}px`,
        "--center-height": `${space}px`,
        "--pile-scale": String(scale),
      };
      for (const [key, value] of Object.entries(properties))
        table.style.setProperty(key, value);
    };
    measure();
    // Seats interpolate for 650ms. Track their moving bounds without rerendering React.
    const until = performance.now() + 750;
    let frame = 0;
    const follow = () => {
      measure();
      if (performance.now() < until) frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    const observer = new ResizeObserver(measure);
    table
      .querySelectorAll(".player-seat")
      .forEach((seat) => observer.observe(seat));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [root, width, height, phase, roster]);
}
