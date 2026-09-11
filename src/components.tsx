import { Crown, Mic, MicOff, WifiOff } from "lucide-react";
import { memo, type CSSProperties } from "react";
import type { Card as CardType, PublicPlayer } from "../shared/types";

export const AVATARS = ["🦊", "🐰", "🐻", "🐱", "🐼", "🐸", "🐨", "🐯"];
export function Avatar({
  index = 0,
  className = "",
}: {
  index?: number;
  className?: string;
}) {
  return (
    <span
      className={`avatar avatar-${index % 8} ${className}`}
      aria-hidden="true"
    >
      <span>{AVATARS[index % 8]}</span>
    </span>
  );
}
export function CardBack({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`card-back ${className}`} style={style} aria-hidden="true">
      <div className="back-border">
        <span className="back-top">B</span>
        <div className="back-emblem">
          <span>♠</span>
          <span>♠</span>
        </div>
        <span className="back-bottom">B</span>
      </div>
    </div>
  );
}
export const CardFace = memo(function CardFace({
  card,
  small = false,
}: {
  card: CardType;
  small?: boolean;
}) {
  const red = card.suit === "♥" || card.suit === "♦";
  const n = Number(card.rank);
  const court = ["J", "Q", "K"].includes(card.rank);
  return (
    <div
      className={`card-face ${red ? "red" : ""} ${small ? "small-card" : ""}`}
    >
      <div className="card-corner">
        <b>{card.rank}</b>
        <span>{card.suit}</span>
      </div>
      <div className={`card-art ${court ? "court-art" : ""}`}>
        {court ? (
          <>
            <Crown size={26} strokeWidth={1.1} />
            <span>{card.suit}</span>
            <Crown size={26} strokeWidth={1.1} className="inverted" />
          </>
        ) : n > 1 ? (
          <div className={`pips pips-${n}`}>
            {Array.from({ length: n }, (_, i) => (
              <span key={i}>{card.suit}</span>
            ))}
          </div>
        ) : (
          <span className="ace-suit">{card.suit}</span>
        )}
      </div>
      <div className="card-corner opposite">
        <b>{card.rank}</b>
        <span>{card.suit}</span>
      </div>
    </div>
  );
});
export function PlayerSeat({
  player,
  active,
  local,
  host,
  style,
  listening,
}: {
  player: PublicPlayer;
  active: boolean;
  local?: boolean;
  host?: boolean;
  style?: CSSProperties;
  listening?: boolean;
}) {
  return (
    <div
      className={`player-seat ${active ? "active-seat" : ""} ${player.speaking || listening ? "speaking" : ""} ${!player.connected ? "disconnected-seat" : ""} ${local ? "local-seat" : ""}`}
      style={style}
      data-player-id={player.id}
      role="group"
      aria-label={`${local ? "You" : player.name}, ${player.count} cards${active ? ", current turn" : ""}, ${!player.connected ? "disconnected" : player.speaking ? "speaking" : player.muted ? "microphone muted" : "microphone on"}`}
    >
      {active && (
        <div className="seat-turn">{local ? "YOUR TURN" : "THINKING…"}</div>
      )}
      <div className="seat-avatar">
        <Avatar index={player.avatar} />
        {host && (
          <span className="host-crown">
            <Crown size={10} />
          </span>
        )}
        <span
          className={`seat-mic ${!player.muted || listening ? "mic-on" : ""}`}
        >
          {!player.connected ? (
            <WifiOff size={10} />
          ) : player.muted && !listening ? (
            <MicOff size={10} />
          ) : (
            <Mic size={10} />
          )}
        </span>
      </div>
      <div className="seat-name">
        {local ? "You" : player.name}
        {player.bot && (
          <span className="bot-dot" title="Practice opponent">
            ✦
          </span>
        )}
      </div>
      {!local && (
        <div className="seat-cards">
          <span className="tiny-card" /> {player.count} cards
        </div>
      )}
      {!local && (
        <div className="seat-hand" aria-hidden="true">
          {Array.from({ length: Math.min(4, player.count) }, (_, i) => (
            <CardBack
              key={i}
              style={{
                transform: `translateX(${(i - 1.5) * 8}px) rotate(${(i - 1.5) * 9}deg)`,
              }}
            />
          ))}
        </div>
      )}
      {!player.connected && (
        <span className="reconnecting-label">
          {player.bot ? "Auto-playing" : "Reconnecting"}
        </span>
      )}
    </div>
  );
}
