import {
  useLayoutEffect,
  useState,
  type RefObject,
  type CSSProperties,
} from "react";
import type { Snapshot } from "../shared/types";
import { CardBack } from "./components";

interface Flight {
  id: string;
  to: string;
  from: { x: number; y: number };
  target: { x: number; y: number };
  delay: number;
  endScale: number;
}
/** Measure the visible pile and hands so flights follow the actual responsive table layout. */
export function CardFlights({
  state,
  root,
}: {
  state: Snapshot;
  root: RefObject<HTMLElement | null>;
}) {
  const [flights, setFlights] = useState<Flight[]>([]);
  useLayoutEffect(() => {
    const panel = root.current;
    if (!panel) return;
    if (!["dealing", "challenge", "resolution"].includes(state.phase)) {
      setFlights([]);
      return;
    }
    const bounds = panel.getBoundingClientRect();
    const center = (element: Element | null) => {
      const rect = element?.getBoundingClientRect();
      return rect
        ? {
            x: rect.left + rect.width / 2 - bounds.left,
            y: rect.top + rect.height / 2 - bounds.top,
          }
        : { x: bounds.width / 2, y: bounds.height / 2 };
    };
    const pile = center(panel.querySelector(".pile"));
    const seat = (id: string) =>
      center(
        id === state.selfId
          ? panel.querySelector(".hand-fan")
          : panel.querySelector(`[data-player-id="${id}"] .seat-hand`),
      );
    const count =
      state.phase === "dealing"
        ? 52
        : state.phase === "challenge"
          ? (state.claim?.count ?? 1)
          : Math.min(10, state.reveal?.pileCount ?? 1);
    setFlights(
      Array.from({ length: count }, (_, i) => {
        const targetId =
          state.phase === "dealing"
            ? state.players[i % state.players.length].id
            : state.phase === "resolution"
              ? state.reveal!.loserId
              : "pile";
        return {
          id: `${state.deadline}-${i}`,
          to: targetId,
          from:
            state.phase === "challenge" ? seat(state.claim!.playerId) : pile,
          target: targetId === "pile" ? pile : seat(targetId),
          delay: i * (state.phase === "dealing" ? 0.026 : 0.035),
          endScale:
            targetId === state.selfId || targetId === "pile" ? 0.9 : 0.38,
        };
      }),
    );
    const timeout = window.setTimeout(
      () => setFlights([]),
      state.phase === "dealing" ? 2050 : 1050,
    );
    return () => clearTimeout(timeout);
  }, [state.code, state.phase, state.deadline, root]);
  return (
    <div className="card-flights" aria-hidden="true">
      {flights.map((flight, i) => (
        <div
          className="flight-target"
          key={flight.id}
          data-destination={flight.to}
        >
          <CardBack
            className="flying-card"
            style={
              {
                "--from-x": `${flight.from.x}px`,
                "--from-y": `${flight.from.y}px`,
                "--to-x": `${flight.target.x}px`,
                "--to-y": `${flight.target.y}px`,
                "--arc-x": `${(flight.from.x + flight.target.x) / 2}px`,
                "--arc-y": `${(flight.from.y + flight.target.y) / 2 - 65}px`,
                "--flight-angle": `${((i % 5) - 2) * 8}deg`,
                "--end-scale": flight.endScale,
                animationDelay: `${flight.delay}s`,
              } as CSSProperties
            }
          />
        </div>
      ))}
    </div>
  );
}
