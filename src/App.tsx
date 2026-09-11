import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Copy,
  Crown,
  DoorOpen,
  Expand,
  Eye,
  Flag,
  Headphones,
  Heart,
  Layers,
  Link,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  Menu,
  Mic,
  MicOff,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Spade,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  LIMITS,
  RANKS,
  rankName,
  type Rank,
  type Snapshot,
} from "../shared/types";
import { Avatar, AVATARS, CardBack, CardFace, PlayerSeat } from "./components";
import { useGame } from "./useGame";
import { playSound, soundEnabled, unlockAudio } from "./audio";
import { useSpeech, useVoiceChat } from "./useVoice";
import { layoutHand } from "./handLayout";
import { CardFlights } from "./CardFlights";

type Modal =
  | "create"
  | "join"
  | "rooms"
  | "players"
  | "rules"
  | "settings"
  | "invite"
  | "leave"
  | null;
const emptyPlayers: Snapshot["players"] = [];

export default function App() {
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4800);
  }, []);
  const { state, rooms, connected, busy, socket, act, offset } =
    useGame(notify);
  const [joinCode, setJoinCode] = useState("");
  const [joinWatching, setJoinWatching] = useState(false);
  const gamePanelRef = useRef<HTMLElement>(null);
  const [modal, setModal] = useState<Modal>(
    new URLSearchParams(location.search).has("room") ? "join" : null,
  );
  const [mobileNav, setMobileNav] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [rank, setRank] = useState<Rank>("A");
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(
    localStorage.getItem("bluff-sound") !== "false",
  );
  const [contrast, setContrast] = useState(
    localStorage.getItem("bluff-contrast") === "true",
  );
  const [ptt, setPtt] = useState(localStorage.getItem("bluff-ptt") === "true");
  const [copied, setCopied] = useState(false);
  const [handWidth, setHandWidth] = useState(640);
  const [handHeight, setHandHeight] = useState(160);
  const [handPage, setHandPage] = useState(0);
  const [tableHeight, setTableHeight] = useState(300);
  const [tableWidth, setTableWidth] = useState(600);
  const tableRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const activityRef = useRef<HTMLDivElement>(null);
  const previous = useRef<Snapshot | null>(null);
  const isTurn =
    !!state &&
    state.phase === "turn" &&
    state.turnId === state.selfId &&
    !state.spectator;
  const canChallenge =
    !!state &&
    state.phase === "challenge" &&
    state.claim?.playerId !== state.selfId &&
    !state.spectator &&
    !state.claim?.accepted.includes(state.selfId);
  const me = state?.players.find((p) => p.id === state.selfId);
  const active = state?.players.find((p) => p.id === state.turnId);
  const claimPlayer = state?.players.find(
    (p) => p.id === state.claim?.playerId,
  );
  const seconds = state?.deadline
    ? Math.max(0, Math.ceil((state.deadline - now - offset.current) / 1000))
    : 0;
  const play = async () => {
    if (!selected.length) {
      notify("Select the cards you want to play first.");
      return;
    }
    if (await act("play", { ids: selected, rank })) setSelected([]);
  };
  const speech = useSpeech((text) => {
    const command = text
      .toLowerCase()
      .replace(/[.!?,]/g, "")
      .trim();
    if (/\b(bluff|challenge)\b/.test(command)) {
      if (canChallenge) {
        notify(`“${text}” detected — calling BLUFF!`);
        void act("bluff");
      } else notify("You can call bluff when another player makes a claim.");
    } else if (/\bready\b/.test(command)) {
      if (state?.phase === "lobby" || state?.phase === "winner") {
        void act("ready");
        notify("“Ready” detected");
      } else notify("The game is already underway.");
    } else if (/\b(pass|accept)\b/.test(command)) {
      if (canChallenge) void act("accept");
      else if (isTurn) void act("pass");
      else notify("Wait for your turn or a claim to accept.");
    } else if (/\bplay\b/.test(command)) {
      if (!isTurn) {
        notify("Wait for your turn to play cards.");
        return;
      }
      const word = command.match(/\b(one|two|three|four|[1-4])\b/)?.[1];
      const count = word
        ? { one: 1, two: 2, three: 3, four: 4 }[word] || Number(word)
        : selected.length;
      if (!selected.length || count !== selected.length)
        notify(`Select ${count || "your"} cards first, then say “Play cards”.`);
      else {
        notify(`“${text}” detected — playing ${selected.length} cards`);
        void play();
      }
    } else {
      const aliases: Record<string, Rank> = {
        ace: "A",
        aces: "A",
        king: "K",
        kings: "K",
        queen: "Q",
        queens: "Q",
        jack: "J",
        jacks: "J",
        two: "2",
        twos: "2",
        three: "3",
        threes: "3",
        four: "4",
        fours: "4",
        five: "5",
        fives: "5",
        six: "6",
        sixes: "6",
        seven: "7",
        sevens: "7",
        eight: "8",
        eights: "8",
        nine: "9",
        nines: "9",
        ten: "10",
        tens: "10",
      };
      const found = command
        .split(" ")
        .map(
          (word) =>
            aliases[word] ??
            (RANKS.includes(word.toUpperCase() as Rank)
              ? (word.toUpperCase() as Rank)
              : undefined),
        )
        .find(Boolean);
      if (found && isTurn) {
        if (
          state?.settings.rankMode === "ascending" &&
          found !== state.requiredRank
        )
          notify(
            `This table requires ${rankName(state.requiredRank)} this turn.`,
          );
        else {
          setRank(found);
          notify(`“${text}” detected — claiming ${rankName(found)}`);
        }
      } else
        notify(
          "Try “Call bluff”, “Pass”, “Ready”, “I claim Kings”, or “Play two cards”.",
        );
    }
  }, notify);
  const voice = useVoiceChat(
    socket,
    state?.code,
    state?.selfId,
    state?.players ?? emptyPlayers,
    (muted, speaking) => {
      if (socket?.connected && state && !state.spectator)
        void act("voice", { muted, speaking });
    },
    notify,
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const resize = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === handRef.current) {
          setHandWidth(entry.contentRect.width);
          setHandHeight(entry.contentRect.height);
        }
        if (entry.target === tableRef.current) {
          setTableHeight(entry.contentRect.height);
          setTableWidth(entry.contentRect.width);
        }
      }
    });
    if (handRef.current) resize.observe(handRef.current);
    if (tableRef.current) resize.observe(tableRef.current);
    return () => resize.disconnect();
  }, [!!state]);
  useEffect(() => {
    if (!state) return;
    const prev = previous.current;
    if (prev?.code !== state.code) {
      setSelected([]);
      setHandPage(0);
      setRank("A");
    }
    if (prev?.deadline !== state.deadline || prev?.phase !== state.phase) {
      if (state.phase === "challenge") {
        playSound("card");
        setSelected([]);
      }
      if (state.phase === "reveal") playSound("bluff");
      if (state.phase === "winner") playSound("win");
      if (state.phase === "turn" && state.turnId === state.selfId)
        playSound("turn");
      if (state.phase === "dealing") playSound("card");
    }
    if (
      prev &&
      prev.code === state.code &&
      prev.players.length !== state.players.length
    )
      playSound(state.players.length > prev.players.length ? "join" : "leave");
    if (state.settings.rankMode === "ascending") setRank(state.requiredRank);
    previous.current = state;
  }, [state]);
  useEffect(() => {
    if (seconds === 5 && isTurn) playSound("warning");
  }, [seconds, isTurn]);
  useEffect(() => {
    activityRef.current?.scrollTo({
      top: activityRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [state?.activity.length, state?.activity.at(-1)?.id]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (
        (event.target instanceof HTMLElement &&
          ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) ||
        modal
      )
        return;
      if (event.code === "Space" && ptt && !event.repeat) {
        event.preventDefault();
        speech.start();
      }
      if (event.key.toLowerCase() === "b" && canChallenge && !event.repeat)
        void act("bluff");
      if (event.key === "Escape") setSelected([]);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space" && ptt) speech.stop();
    };
    const blur = () => {
      if (ptt) speech.stop();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [ptt, speech.start, speech.stop, canChallenge, modal, act]);
  const toggleSound = () => {
    unlockAudio();
    setSound(!sound);
    soundEnabled(!sound);
  };
  const copy = async (invite = false) => {
    if (!state) return;
    try {
      await navigator.clipboard.writeText(
        invite ? `${location.origin}/?room=${state.code}` : state.code,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify(
        `Your room code is ${state.code}. Select and copy it from the invite panel.`,
      );
    }
  };
  const toggleCard = (id: string) => {
    if (!isTurn || busy || !connected) return;
    if (selected.includes(id)) setSelected(selected.filter((c) => c !== id));
    else if (selected.length >= 4)
      notify("You can play up to four cards at a time.");
    else setSelected([...selected, id]);
    playSound("select");
  };
  const doAction = async (type: string, payload?: Record<string, unknown>) => {
    if (await act(type, payload)) setModal(null);
  };
  const namePayload = () => ({
    name: localStorage.getItem("bluff-name") || "You",
    avatar: Number(localStorage.getItem("bluff-avatar") || 0),
  });
  const otherPlayers = state
    ? (() => {
        const localIndex = state.players.findIndex(
          (p) => p.id === state.selfId,
        );
        return localIndex < 0
          ? state.players
          : [
              ...state.players.slice(localIndex + 1),
              ...state.players.slice(0, localIndex),
            ];
      })()
    : [];
  const winner = state?.players.find((p) => p.id === state.winnerId);
  const pageSize = handWidth < 440 ? 6 : handWidth < 650 ? 10 : 14;
  const pageCount = Math.max(
    1,
    Math.ceil((state?.hand.length ?? 0) / pageSize),
  );
  const currentPage = Math.min(handPage, pageCount - 1);
  const pageStart = currentPage * pageSize;
  const visibleHand = state?.hand.slice(pageStart, pageStart + pageSize) ?? [];
  const handLayout = layoutHand(
    visibleHand.length,
    new Set(
      visibleHand.flatMap((card, i) => (selected.includes(card.id) ? [i] : [])),
    ),
    handWidth,
    handHeight,
  );
  const lastPlay = state?.lastPlay;
  const lastPlayer = state?.players.find((p) => p.id === lastPlay?.playerId);
  const nextPlayer =
    state?.players[
      (state.players.findIndex((p) => p.id === state.turnId) + 1) %
        state.players.length
    ];
  const phaseTitle = !state
    ? "Connecting…"
    : state.phase === "turn"
      ? isTurn
        ? "Your turn"
        : `${active?.name}’s turn`
      : state.phase === "challenge"
        ? "Challenge window"
        : state.phase === "reveal"
          ? "Cards revealed"
          : state.phase === "resolution"
            ? "Collecting the pile"
            : state.phase === "winner"
              ? `${winner?.id === state.selfId ? "You" : winner?.name} won!`
              : state.phase === "lobby"
                ? "Waiting for friends"
                : "Dealing cards";
  const seatVector = (id: string | undefined) => {
    if (!state || !id) return { x: 0, y: 150 };
    const local = Math.max(
      0,
      state.players.findIndex((p) => p.id === state.selfId),
    );
    const target = state.players.findIndex((p) => p.id === id);
    const relative =
      (target - local + state.players.length) % state.players.length;
    const angle =
      ((90 + (360 * relative) / state.players.length) * Math.PI) / 180;
    return {
      x: Math.cos(angle) * Math.min(280, handWidth * 0.4),
      y: Math.sin(angle) * 145,
    };
  };
  const origin = seatVector(state?.claim?.playerId);
  const destination = seatVector(state?.reveal?.loserId);

  return (
    <div
      className={`app-shell ${contrast ? "high-contrast" : ""}`}
      onPointerDown={unlockAudio}
    >
      <aside className={`sidebar ${mobileNav ? "nav-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setMobileNav(false);
          }}
          aria-label="BLUFF card club"
        >
          <span className="brand-mark">
            <Spade size={22} fill="currentColor" />
          </span>{" "}
          BLUFF<span className="brand-period">!</span>
        </a>
        <span className="brand-tagline">PLAY. BLUFF. REPEAT.</span>
        <div className="nav-caption">LET’S PLAY</div>
        <nav aria-label="Main navigation">
          <button
            className="nav-item rooms-nav"
            onClick={() => {
              setModal("rooms");
              setMobileNav(false);
            }}
          >
            <Users size={18} /> Open rooms{" "}
            <span className="room-count-badge">{rooms.length}</span>
          </button>
          <button
            className="nav-item nav-active"
            onClick={() => {
              setModal(null);
              setMobileNav(false);
            }}
          >
            <Layers size={18} /> The table <span className="nav-active-dot" />
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setModal("create");
              setMobileNav(false);
            }}
          >
            <Plus size={18} /> Create a room
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setJoinCode("");
              setJoinWatching(false);
              setModal("join");
              setMobileNav(false);
            }}
          >
            <LogIn size={18} /> Join friends
          </button>
        </nav>
        <div className="sidebar-rule" />
        <nav aria-label="Help and preferences">
          <button
            className="nav-item"
            aria-label="How to play"
            onClick={() => {
              setModal("rules");
              setMobileNav(false);
            }}
          >
            <CircleHelp size={18} /> How to play{" "}
            <span className="shortcut-small">?</span>
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setModal("settings");
              setMobileNav(false);
            }}
          >
            <Settings2 size={18} /> Preferences
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="club-note">
            <div className="note-cards">
              <span>♠</span>
              <span>♥</span>
            </div>
            <p>
              Good friends.
              <br />
              <em>Great lies.</em>
            </p>
            <span>The best hand is a straight face.</span>
          </div>
          <div className="sidebar-profile">
            <Avatar index={me?.avatar ?? 0} />
            <div>
              <strong>{me?.name || "Your seat awaits"}</strong>
              <span>
                <i className="online-dot" />{" "}
                {connected ? "In the club" : "Connecting…"}
              </span>
            </div>
            <button
              className="icon-button"
              aria-label="Open preferences"
              onClick={() => setModal("settings")}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <div className="nav-scrim" onClick={() => setMobileNav(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={22} />
            </button>
            <span className="online-dot" /> THE LOUNGE{" "}
            <ChevronRight size={12} />
            <span className="breadcrumb-muted">
              {state?.practice ? "Practice table" : "Private table"}
            </span>
          </div>
          <div className="topbar-actions">
            <button
              className="topbar-rooms"
              onClick={() => setModal("rooms")}
              aria-label="Browse rooms"
            >
              <Users size={15} /> Rooms
            </button>
            <button
              className="icon-button mobile-voice-button"
              style={{ display: "none" }}
              aria-label={
                voice.enabled ? "Leave voice chat" : "Join voice chat"
              }
              disabled={voice.connecting || !connected || state?.spectator}
              onClick={voice.toggle}
            >
              {voice.enabled ? <Mic size={16} /> : <Headphones size={16} />}
            </button>
            <span className={`connection ${!connected ? "offline" : ""}`}>
              {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
              <span>{connected ? "Connected" : "Reconnecting"}</span>
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              onClick={toggleSound}
              aria-label={sound ? "Mute sound effects" : "Enable sound effects"}
            >
              {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
            <button
              className="icon-button"
              aria-label="How to play"
              onClick={() => setModal("rules")}
            >
              <CircleHelp size={18} />
            </button>
            <Avatar index={me?.avatar ?? 0} />
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="little-diamond">✦</span> THE CARDS ARE JUST THE
                BEGINNING
              </div>
              <h1>
                Let the bluffing begin<span>!</span>
              </h1>
              <p>A little confidence. A convincing lie. Anyone’s game.</p>
            </div>
            <button
              className="button invite-button"
              onClick={() => setModal(state?.practice ? "create" : "invite")}
            >
              <Users size={16} /> Invite friends <Plus size={15} />
            </button>
          </div>
          <div className="game-layout">
            <section
              className="game-panel"
              aria-label="Game table"
              ref={gamePanelRef}
            >
              <div className="table-toolbar">
                <div className="table-title">
                  <span className="live-dot" />
                  <strong>
                    {state?.practice
                      ? "The practice table"
                      : state?.visibility === "public"
                        ? "Public table"
                        : "Your private table"}
                  </strong>
                  <span className="table-type">
                    {state?.practice
                      ? "PRACTICE"
                      : state?.visibility === "public"
                        ? "OPEN ROOM"
                        : "INVITE ONLY"}
                  </span>
                </div>
                <div className="table-meta">
                  <button
                    className="table-invite"
                    onClick={() =>
                      setModal(state?.practice ? "create" : "invite")
                    }
                  >
                    <Users size={13} /> Invite
                  </button>
                  <button
                    className="player-list-button"
                    aria-label="Players and vote kick"
                    onClick={() => setModal("players")}
                  >
                    <Users size={13} /> {state?.players.length ?? 4}/
                    {LIMITS.players}
                  </button>
                  <span className="spectator-count" title="Spectator seats">
                    <Eye size={12} /> {state?.spectators ?? 0}/
                    {LIMITS.spectators}
                  </span>
                  <span />{" "}
                  <button
                    className="icon-button"
                    aria-label="Table options"
                    onClick={() => setModal("settings")}
                  >
                    <MoreHorizontal size={19} />
                  </button>
                </div>
              </div>
              <div
                className={`game-status ${isTurn ? "status-your-turn" : ""}`}
                aria-label="Current game status"
                aria-live="polite"
                aria-atomic="true"
              >
                <div className="status-turn">
                  <span className="status-label">
                    {state?.phase === "turn" ? "CURRENT TURN" : "RIGHT NOW"}
                  </span>
                  <strong>{phaseTitle}</strong>
                  <span>
                    {state?.phase === "challenge"
                      ? canChallenge
                        ? "Call bluff or accept the claim"
                        : state.claim?.playerId === state.selfId
                          ? "Other players are deciding"
                          : "You accepted this claim"
                      : state?.phase === "turn"
                        ? `Up next: ${nextPlayer?.id === state.selfId ? "You" : nextPlayer?.name}`
                        : state?.phase === "lobby"
                          ? "Ready up to start the game"
                          : "Watch the center of the table"}
                  </span>
                </div>
                <div className="status-last-play">
                  <span className="status-label">
                    {lastPlay?.outcome === "pending"
                      ? "JUST PLAYED · FACE DOWN"
                      : "LAST PLAY"}
                  </span>
                  <strong>
                    {lastPlay
                      ? `${lastPlayer?.id === state?.selfId ? "You" : (lastPlayer?.name ?? "Player")} played ${lastPlay.count} card${lastPlay.count === 1 ? "" : "s"}`
                      : "No cards played yet"}
                  </strong>
                  <span>
                    {lastPlay ? (
                      <>
                        Claimed <b>{rankName(lastPlay.rank)}</b>
                        <span
                          className={`claim-outcome outcome-${lastPlay.outcome}`}
                        >
                          {
                            {
                              pending: "Awaiting challenge",
                              accepted: "Accepted",
                              caught: "Bluff caught",
                              truthful: "Truthful",
                            }[lastPlay.outcome]
                          }
                        </span>
                      </>
                    ) : (
                      "The first claim will appear here"
                    )}
                  </span>
                </div>
                <div className="status-pile">
                  <span className="status-label">PILE</span>
                  <strong>
                    {state?.pileCount ?? 0}
                    <small> cards</small>
                  </strong>
                  <span>
                    {state?.deadline
                      ? `${seconds}s remaining`
                      : `Round ${state?.round ?? 1}`}
                  </span>
                </div>
              </div>
              {!connected && (
                <div className="connection-banner" role="status">
                  <LoaderCircle size={14} className="spin" /> Reconnecting… Your
                  cards and seat are saved.
                </div>
              )}
              {state?.kickVote && (
                <div className="vote-banner" role="status">
                  <Flag size={13} />
                  <span>
                    Remove{" "}
                    <b>
                      {
                        state.players.find(
                          (p) => p.id === state.kickVote?.targetId,
                        )?.name
                      }
                    </b>
                    ? {state.kickVote.voters.length}/{state.kickVote.required}{" "}
                    votes ·{" "}
                    {Math.max(
                      0,
                      Math.ceil(
                        (state.kickVote.expiresAt - now - offset.current) /
                          1000,
                      ),
                    )}
                    s
                  </span>
                  {!state.spectator &&
                  state.selfId !== state.kickVote.targetId &&
                  !state.kickVote.voters.includes(state.selfId) ? (
                    <button
                      onClick={() =>
                        act("vote-kick", { targetId: state.kickVote!.targetId })
                      }
                    >
                      Vote to kick
                    </button>
                  ) : (
                    <span>
                      {state.kickVote.voters.includes(state.selfId)
                        ? "You voted"
                        : "Vote in progress"}
                    </span>
                  )}
                </div>
              )}
              <div
                className={`table-stage phase-${state?.phase ?? "loading"} players-${state?.players.length ?? 4}`}
                ref={tableRef}
                style={
                  {
                    "--scene-scale": Math.max(
                      0.48,
                      Math.min(
                        state && state.players.length >= 6 ? 0.85 : 1.12,
                        tableHeight / 370,
                        tableWidth / 440,
                      ),
                    ),
                    "--seat-scale": Math.max(
                      0.63,
                      Math.min(1, tableHeight / 310),
                    ),
                  } as CSSProperties
                }
              >
                <div className="table-ambient" />
                <div className="table-physical">
                  <div className="table-rail">
                    <div className="table-felt">
                      <div className="felt-line" />
                      <div className="felt-brand">
                        BLUFF<span>CARD CLUB</span>
                      </div>
                      <span className="felt-star star-left">✦</span>
                      <span className="felt-star star-right">✦</span>
                    </div>
                  </div>
                </div>
                <div className="table-edge-label">
                  <LockKeyhole size={10} />{" "}
                  {state?.practice
                    ? "YOUR WARM-UP. THEIR POKER FACES."
                    : "WHAT HAPPENS AT THE TABLE, STAYS AT THE TABLE."}
                </div>
                {state &&
                  state.phase !== "lobby" &&
                  otherPlayers.map((p, i) => {
                    const angle =
                      ((90 + (360 * (i + 1)) / state.players.length) *
                        Math.PI) /
                      180;
                    return (
                      <PlayerSeat
                        key={p.id}
                        player={p}
                        active={state.turnId === p.id && state.phase === "turn"}
                        host={!state.practice && p.id === state.hostId}
                        style={{
                          left: `${50 + Math.cos(angle) * (Math.abs(Math.cos(angle)) > 0.95 ? 42 : 35)}%`,
                          top: `clamp(calc(78px * var(--seat-scale)), ${50 + Math.sin(angle) * 36}%, calc(100% - 60px * var(--seat-scale)))`,
                        }}
                      />
                    );
                  })}
                {me && state?.phase !== "lobby" && (
                  <PlayerSeat
                    player={me}
                    active={isTurn}
                    local
                    listening={speech.listening}
                    style={{ left: "50%", top: "90%" }}
                  />
                )}
                {!state && (
                  <div className="center-scene loading-scene">
                    <Spade size={38} />
                    <span>Setting your table…</span>
                  </div>
                )}
                {state?.phase === "lobby" ? (
                  <div className="lobby-on-table">
                    <div className="eyebrow">YOUR NIGHT STARTS HERE</div>
                    <h2>Trust nobody.</h2>
                    <p>Except the friends you invite.</p>
                    <div className="lobby-avatars">
                      {state.players.map((p) => (
                        <div key={p.id}>
                          <Avatar index={p.avatar} />
                          <span>{p.id === state.selfId ? "You" : p.name}</span>
                          <small>
                            {p.id === state.hostId
                              ? "Host"
                              : p.ready
                                ? "✓ Ready"
                                : "Getting ready"}
                          </small>
                        </div>
                      ))}
                      {state.players.length < 8 && (
                        <button
                          className="empty-seat"
                          onClick={() => setModal("invite")}
                          aria-label="Invite another player"
                        >
                          <Plus size={24} />
                        </button>
                      )}
                    </div>
                    <button className="lobby-code" onClick={() => copy()}>
                      <LockKeyhole size={12} />
                      {state.code}
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </div>
                ) : (
                  state && (
                    <div className="center-scene">
                      {state.phase === "winner" ? (
                        <div className="winner-scene">
                          <div className="confetti">
                            {Array.from({ length: 24 }, (_, i) => (
                              <i
                                key={i}
                                style={
                                  {
                                    "--i": i,
                                    "--tx": `${Math.sin(i * 7) * 250}px`,
                                    "--ty": `${Math.cos(i * 3) * 160}px`,
                                  } as CSSProperties
                                }
                              />
                            ))}
                          </div>
                          <Crown className="winner-crown" size={32} />
                          <Avatar index={winner?.avatar} />
                          <h2>
                            {winner?.id === state.selfId
                              ? "You take the crown."
                              : `${winner?.name} takes the crown.`}
                          </h2>
                          <p>A straight face. A well-earned victory.</p>
                        </div>
                      ) : (
                        <>
                          <div
                            className={`center-status ${state.phase === "reveal" ? "reveal-status" : ""}`}
                          >
                            {state.phase === "dealing"
                              ? "A FRESH DECK. A FRESH START."
                              : state.phase === "reveal" ||
                                  state.phase === "resolution"
                                ? state.reveal?.liar
                                  ? "CAUGHT BLUFFING!"
                                  : "THE CLAIM WAS TRUE!"
                                : state.phase === "challenge"
                                  ? `${claimPlayer?.id === state.selfId ? "YOU CLAIM" : `${claimPlayer?.name.toUpperCase()} CLAIMS`}`
                                  : state.pileCount
                                    ? "THE PLOT THICKENS"
                                    : "THE TABLE IS YOURS"}
                          </div>
                          <div
                            className={`pile ${state.phase === "resolution" ? "pile-collect" : ""}`}
                            key={
                              state.phase === "challenge"
                                ? state.deadline
                                : state.phase === "resolution"
                                  ? `resolve-${state.deadline}`
                                  : "pile"
                            }
                            style={
                              {
                                "--collect-x": `${destination.x}px`,
                                "--collect-y": `${destination.y}px`,
                                "--play-x": `${origin.x}px`,
                                "--play-y": `${origin.y}px`,
                              } as CSSProperties
                            }
                          >
                            {state.phase === "reveal" ||
                            state.phase === "resolution" ? (
                              <div className="revealed-cards">
                                {state.reveal?.cards.map((card, i) => (
                                  <div
                                    className="reveal-card"
                                    key={card.id}
                                    style={{ animationDelay: `${i * 0.12}s` }}
                                  >
                                    <CardFace card={card} small />
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <>
                                {Array.from(
                                  {
                                    length: Math.min(
                                      7,
                                      Math.floor(state.pileCount / 3),
                                    ),
                                  },
                                  (_, i) => (
                                    <CardBack
                                      key={`depth-${i}`}
                                      className="pile-card"
                                      style={{
                                        transform: `translate(${-3 + i}px, ${7 - i}px) rotate(${-9 + i * 2}deg)`,
                                        boxShadow:
                                          "0 2px 0 #b1b697, 0 4px 4px #0002",
                                      }}
                                    />
                                  ),
                                )}
                                <CardBack className="pile-card pile-one" />
                                <CardBack className="pile-card pile-two" />
                                {Array.from(
                                  { length: state.claim?.count ?? 1 },
                                  (_, i) => (
                                    <CardBack
                                      key={`played-${i}`}
                                      className={`pile-card pile-three ${state.phase === "challenge" ? "card-landing" : ""}`}
                                      style={
                                        {
                                          "--land-angle": `${-5 + i * 6}deg`,
                                          top: 1 - i * 2,
                                          left: 31 + i * 3,
                                          animationDelay: `${i * 0.06}s`,
                                        } as CSSProperties
                                      }
                                    />
                                  ),
                                )}
                                <span className="pile-counter">
                                  {state.pileCount
                                    ? `${state.pileCount} in the pile`
                                    : "Make your first move"}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="center-claim">
                            {state.phase === "challenge" ? (
                              <>
                                {state.claim?.count}{" "}
                                {rankName(
                                  state.claim!.rank,
                                  state.claim!.count,
                                )}
                                <span>Believe it. Or call it.</span>
                              </>
                            ) : state.phase === "reveal" ||
                              state.phase === "resolution" ? (
                              <>
                                <span>
                                  {
                                    state.players.find(
                                      (p) => p.id === state.reveal?.loserId,
                                    )?.name
                                  }{" "}
                                  takes {state.reveal?.pileCount} cards
                                </span>
                              </>
                            ) : (
                              <div className="table-motto">
                                Trust nobody. <span>Play everybody.</span>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                )}
              </div>
              <div className="table-bottom-meta">
                <span>
                  <span className="mini-dot" />{" "}
                  {state?.phase === "lobby"
                    ? "Waiting for friends"
                    : `Round ${String(state?.round ?? 1).padStart(2, "0")}`}
                </span>
                <span>
                  {state?.spectator ? (
                    <>
                      <Eye size={12} /> Spectating
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={12} /> Only you can see your cards
                    </>
                  )}
                </span>
                <button onClick={() => setModal("rules")}>
                  Table rules <ChevronRight size={12} />
                </button>
              </div>

              <div className="hand-section">
                <div className="hand-heading">
                  <div>
                    <span className="eyebrow">
                      {state?.spectator
                        ? "THE BEST SEAT IN THE HOUSE"
                        : "YOUR HAND"}
                    </span>
                    <span className="hand-count">
                      {state?.hand.length ?? 0} cards
                    </span>
                  </div>
                  <span className="hand-hint">
                    {state?.phase === "lobby"
                      ? "The cards arrive when everyone’s ready."
                      : state?.spectator
                        ? "Enjoy the game. Hidden cards stay hidden."
                        : selected.length
                          ? `${selected.length} selected · looking convincing`
                          : isTurn
                            ? "Pick your cards. Sell your story."
                            : "A good poker face is worth the wait."}
                  </span>
                  {pageCount > 1 && (
                    <div
                      className="hand-pagination"
                      aria-label="Browse your hand"
                    >
                      <button
                        className="icon-button"
                        aria-label="Previous cards"
                        disabled={currentPage === 0}
                        onClick={() => setHandPage(currentPage - 1)}
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <span>
                        {currentPage + 1} / {pageCount}
                      </span>
                      <button
                        className="icon-button"
                        aria-label="Next cards"
                        disabled={currentPage === pageCount - 1}
                        onClick={() => setHandPage(currentPage + 1)}
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  )}
                </div>
                <div
                  className={`hand-fan ${!isTurn ? "hand-waiting" : ""}`}
                  ref={handRef}
                >
                  <div
                    className="hand-canvas"
                    style={
                      {
                        width: "100%",
                        "--hand-card-width": `${handLayout.cardWidth}px`,
                      } as CSSProperties
                    }
                  >
                    {state?.hand.map((card, i) => {
                      const position = handLayout.cards[i - pageStart];
                      return (
                        <button
                          key={card.id}
                          hidden={!position}
                          data-hand-index={i}
                          className={`hand-card ${selected.includes(card.id) ? "selected-card" : ""}`}
                          style={
                            {
                              "--x": `${position?.x ?? 0}px`,
                              "--angle": `${position?.angle ?? 0}deg`,
                              "--curve": `${position?.curve ?? 0}px`,
                              "--order": i,
                              zIndex: selected.includes(card.id)
                                ? 50 + i
                                : i + 1,
                            } as CSSProperties
                          }
                          onClick={() => toggleCard(card.id)}
                          disabled={!isTurn || busy || !connected}
                          aria-label={`${card.rank} of ${{ "♠": "spades", "♥": "hearts", "♣": "clubs", "♦": "diamonds" }[card.suit]}`}
                          aria-pressed={selected.includes(card.id)}
                        >
                          <CardFace card={card} />
                          {selected.includes(card.id) && (
                            <span className="card-selected-check">
                              <Check size={12} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {(!state?.hand.length || state.phase === "lobby") && (
                    <div className="empty-hand">
                      <Spade size={25} strokeWidth={1} />
                      <span>
                        {state?.phase === "lobby"
                          ? "Good company. A full deck. Ready when you are."
                          : state?.phase === "winner"
                            ? "Every great game deserves another."
                            : state?.spectator
                              ? "You’re watching this round."
                              : "No cards. Just a little suspense."}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div
                className={`action-zone ${canChallenge ? "challenge-zone" : ""}`}
              >
                {state?.phase === "lobby" || state?.phase === "winner" ? (
                  <div className="lobby-actions">
                    <div>
                      <strong>
                        {state.phase === "winner"
                          ? "One more round?"
                          : "Your people. Your table."}
                      </strong>
                      <span>
                        {state.players.length < 2
                          ? "Invite at least one friend to get started."
                          : `${state.players.filter((p) => p.ready || p.id === state.hostId).length} of ${state.players.length} players ready`}
                      </span>
                    </div>
                    {state.hostId === state.selfId ? (
                      <button
                        className="button primary"
                        disabled={
                          busy ||
                          !connected ||
                          state.players.length < 2 ||
                          state.players.some(
                            (p) =>
                              !p.connected ||
                              (!p.ready && p.id !== state.hostId),
                          )
                        }
                        onClick={() => act("start")}
                      >
                        {state.phase === "winner" ? (
                          <RotateCcw size={16} />
                        ) : (
                          <Spade size={16} />
                        )}{" "}
                        {state.phase === "winner"
                          ? "Play again"
                          : "Start the game"}
                      </button>
                    ) : !state.spectator ? (
                      <button
                        className="button primary"
                        disabled={busy || !connected}
                        onClick={() => act("ready")}
                      >
                        <Check size={16} />
                        {me?.ready ? "Ready! Click to unready" : "I’m ready"}
                      </button>
                    ) : (
                      <span className="status-pill">Spectating</span>
                    )}
                  </div>
                ) : canChallenge ? (
                  <div className="challenge-actions">
                    <div>
                      <span className="eyebrow">SOMETHING FEEL OFF?</span>
                      <strong>
                        {claimPlayer?.name} claims {state?.claim?.count}{" "}
                        {rankName(state!.claim!.rank, state!.claim!.count)}.
                      </strong>
                      <span>You have {seconds}s to trust your gut.</span>
                    </div>
                    <button
                      className="button accept-button"
                      disabled={busy || !connected}
                      onClick={() => act("accept")}
                    >
                      <Check size={16} /> Believe it
                    </button>
                    <button
                      className="button bluff-button"
                      disabled={busy || !connected}
                      onClick={() => act("bluff")}
                    >
                      <Flag size={17} /> CALL BLUFF <kbd>B</kbd>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="turn-action-heading">
                      <span
                        className={`turn-tag ${isTurn ? "your-turn-tag" : ""}`}
                      >
                        <span className="live-dot" />
                        {state?.phase === "dealing"
                          ? "Dealing the cards"
                          : isTurn
                            ? "Your move"
                            : state?.phase === "challenge"
                              ? state.claim?.playerId === state.selfId
                                ? "Keep that poker face"
                                : "Claim accepted"
                              : state?.phase === "reveal" ||
                                  state?.phase === "resolution"
                                ? "The truth is out"
                                : `${active?.name ?? "The table"}’s turn`}
                      </span>
                      <span className="action-guidance">
                        {isTurn
                          ? "Play 1–4 cards and choose your claim."
                          : state?.phase === "challenge"
                            ? "The table is considering the claim…"
                            : "Sit tight. Read the room."}
                      </span>
                      {state?.deadline ? (
                        <span
                          className={`timer ${seconds <= 5 ? "timer-urgent" : ""}`}
                        >
                          <span
                            className="timer-ring"
                            style={
                              {
                                "--progress": `${(seconds / (state.phase === "challenge" ? state.settings.challengeSeconds : state.settings.turnSeconds)) * 100}%`,
                              } as CSSProperties
                            }
                          />
                          {String(seconds).padStart(2, "0")}
                          <small>s</small>
                        </span>
                      ) : null}
                    </div>
                    <div className="play-controls">
                      <div className="rank-group">
                        <label htmlFor="rank-picker">I’M CLAIMING</label>
                        <div className="rank-select-wrap">
                          <select
                            id="rank-picker"
                            value={rank}
                            onChange={(e) => setRank(e.target.value as Rank)}
                            disabled={
                              !isTurn ||
                              state?.settings.rankMode === "ascending"
                            }
                          >
                            {RANKS.map((r) => (
                              <option key={r} value={r}>
                                {rankName(r)}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={14} />
                        </div>
                      </div>
                      <div className="selected-info">
                        <strong>{selected.length}</strong>
                        <span>
                          card{selected.length === 1 ? "" : "s"} selected
                        </span>
                        <button
                          disabled={!selected.length}
                          onClick={() => setSelected([])}
                        >
                          Clear
                        </button>
                      </div>
                      <button
                        className="button primary play-button"
                        disabled={
                          !isTurn || !selected.length || busy || !connected
                        }
                        onClick={play}
                      >
                        Play cards <ArrowRight size={17} />
                      </button>
                      <button
                        className="pass-button"
                        disabled={!isTurn || busy || !connected}
                        onClick={() => act("pass")}
                      >
                        Pass
                      </button>
                    </div>
                  </>
                )}
                <div className="voice-hint">
                  <Mic size={12} />
                  <span>
                    {speech.listening
                      ? "Listening… say your move."
                      : speech.transcript
                        ? `Heard “${speech.transcript}”`
                        : "Big bluff energy. Hands-free, if you like."}
                  </span>
                  <button
                    onClick={speech.listening ? speech.stop : speech.start}
                  >
                    {speech.listening ? "Stop listening" : "Try voice commands"}{" "}
                    <ArrowRight size={11} />
                  </button>
                </div>
              </div>
              {state && <CardFlights state={state} root={gamePanelRef} />}
            </section>

            <aside className="right-rail" aria-label="Table information">
              <section className="room-card">
                <div className="rail-eyebrow">
                  <span>
                    {state?.practice
                      ? "A SEAT FOR EVERY FRIEND"
                      : state?.visibility === "public"
                        ? "YOUR PUBLIC ROOM"
                        : "YOUR PRIVATE ROOM"}
                  </span>
                  <LockKeyhole size={12} />
                </div>
                <h2>
                  {state?.practice
                    ? "Better with friends."
                    : "Your inner circle."}
                </h2>
                <p>
                  {state?.practice
                    ? "The lies hit different when you know who’s telling them."
                    : "Send the code. Pull up a chair. Let the mind games begin."}
                </p>
                <div className="room-code">
                  <span>
                    {state?.practice
                      ? "2–8 PLAYERS"
                      : (state?.code ?? "······")}
                  </span>
                  <button
                    onClick={() =>
                      state?.practice ? setModal("create") : copy()
                    }
                    aria-label={
                      state?.practice
                        ? "Create a private room"
                        : "Copy room code"
                    }
                  >
                    {copied ? (
                      <Check size={14} />
                    ) : state?.practice ? (
                      <Users size={15} />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
                <button
                  className="room-invite"
                  onClick={() =>
                    setModal(state?.practice ? "create" : "invite")
                  }
                >
                  {state?.practice
                    ? "Make it a game night"
                    : "Copy an invite link"}{" "}
                  <ArrowRight size={14} />
                </button>
              </section>
              <section className="voice-card">
                <div className="rail-section-title">
                  <h3>Table talk</h3>
                  <span
                    className={`voice-status ${voice.enabled ? "voice-live" : ""}`}
                  >
                    {voice.enabled ? "LIVE" : "VOICE OFF"}
                  </span>
                </div>
                <p>A poker face can’t hide your voice.</p>
                <div className="voice-avatars">
                  {(state?.players ?? []).slice(0, 5).map((p) => (
                    <div
                      key={p.id}
                      className={`${p.speaking ? "speaking" : ""} ${p.muted ? "voice-avatar-muted" : ""}`}
                    >
                      <Avatar index={p.avatar} />
                      <span>{p.id === state?.selfId ? "You" : p.name}</span>
                    </div>
                  ))}
                </div>
                <button
                  className={`button voice-join ${voice.enabled ? "voice-joined" : ""}`}
                  disabled={voice.connecting || !connected || state?.spectator}
                  onClick={voice.toggle}
                >
                  {voice.connecting ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : voice.enabled ? (
                    <Mic size={15} />
                  ) : (
                    <Headphones size={15} />
                  )}
                  {voice.connecting
                    ? "Connecting…"
                    : voice.enabled
                      ? "Leave voice chat"
                      : "Join voice chat"}
                  <span className="voice-button-dot" />
                </button>
                <span className="voice-privacy">
                  {voice.enabled
                    ? "Your microphone is on. Click to mute & leave."
                    : "Your mic stays off until you join."}
                </span>
              </section>
              <section className="activity-card">
                <div className="rail-section-title">
                  <h3>The play-by-play</h3>
                  <span className="activity-live">
                    <span className="live-dot" /> LIVE
                  </span>
                </div>
                <div
                  className="activity-list"
                  ref={activityRef}
                  aria-live="polite"
                  aria-relevant="additions"
                >
                  {state?.activity.map((event) => (
                    <div
                      className={`activity-event event-${event.kind}`}
                      key={event.id}
                    >
                      <span className="activity-icon">
                        {event.kind === "bluff" ? (
                          <Flag size={13} />
                        ) : event.kind === "play" ? (
                          <Layers size={13} />
                        ) : event.kind === "win" ? (
                          <Crown size={13} />
                        ) : (
                          <Sparkles size={13} />
                        )}
                      </span>
                      <div>
                        <p>{event.text}</p>
                        <time>
                          {new Date(event.at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="table-tip">
                  <span>✧</span>
                  <p>
                    A little hesitation can tell
                    <br />a whole lot of truth.
                  </p>
                </div>
              </section>
            </aside>
          </div>
          <footer className="page-footer">
            <span>
              MADE FOR GOOD COMPANY <Heart size={10} />
            </span>
            <button onClick={() => setModal("rules")}>
              New to bluffing? <span>We’ll deal you in.</span>{" "}
              <ArrowRight size={11} />
            </button>
            <span>
              <LockKeyhole size={11} /> PRIVATE BY DESIGN
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Sparkles size={17} />
          <span>{toast}</span>
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <Dialog
          title={
            modal === "players"
              ? "Who’s at the table?"
              : modal === "rooms"
                ? "Find your next table!"
                : modal === "create"
                  ? "Make room for a little mischief."
                  : modal === "join"
                    ? "Your friends are waiting."
                    : modal === "rules"
                      ? "A little lie goes a long way."
                      : modal === "settings"
                        ? "Make yourself comfortable."
                        : modal === "leave"
                          ? "Leaving so soon?"
                          : "Good company starts here."
          }
          onClose={() => setModal(null)}
          notice={toast}
        >
          {modal === "create" || modal === "join" ? (
            <RoomForm
              mode={modal}
              initialCode={joinCode}
              initialWatch={joinWatching}
              busy={busy}
              onSubmit={(data, watch) =>
                doAction(
                  modal === "create" ? "create" : watch ? "spectate" : "join",
                  data,
                )
              }
            />
          ) : modal === "players" ? (
            <section className="players-panel">
              <p className="modal-intro">
                {state?.players.length}/{LIMITS.players} players ·{" "}
                {state?.spectators}/{LIMITS.spectators} spectators. Vote kick
                needs a strict majority (
                {Math.floor((state?.players.length ?? 0) / 2) + 1} votes at this
                table).
              </p>
              <div className="moderation-roster">
                {state?.players.map((p) => (
                  <div className="roster-player" key={p.id}>
                    <Avatar index={p.avatar} />
                    <div>
                      <strong>
                        {p.name}
                        {p.id === state.selfId ? " (you)" : ""}
                      </strong>
                      <span>
                        {p.bot
                          ? "Automatic player"
                          : !p.connected
                            ? "Disconnected · seat saved"
                            : p.id === state.hostId
                              ? "Host"
                              : p.ready
                                ? "Ready"
                                : "Player"}{" "}
                        · {p.count} cards
                      </span>
                    </div>
                    {p.id !== state.selfId && !p.bot && !state.spectator && (
                      <button
                        className="vote-player-button"
                        aria-label={`Vote to kick ${p.name}`}
                        disabled={
                          busy ||
                          !connected ||
                          state.practice ||
                          state.players.length < 3 ||
                          (!!state.kickVote &&
                            (state.kickVote.targetId !== p.id ||
                              state.kickVote.voters.includes(state.selfId)))
                        }
                        onClick={() => act("vote-kick", { targetId: p.id })}
                      >
                        <Flag size={13} />
                        {state.kickVote?.targetId === p.id
                          ? `${state.kickVote.voters.length}/${state.kickVote.required} voted`
                          : "Vote kick"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="moderation-note">
                <ShieldCheck size={18} />
                <p>
                  For 4 players, 3 votes are required. Votes expire after{" "}
                  {LIMITS.voteSeconds} seconds. A player can start one vote per
                  minute. Spectators cannot vote. Removed players cannot rejoin
                  with the same identity; an automatic player keeps their hand
                  in play.
                </p>
              </div>
            </section>
          ) : modal === "rooms" ? (
            <section className="room-browser" aria-label="Open public rooms">
              <p className="modal-intro">
                Join a waiting table to play, or watch a game already in
                progress. Up to {LIMITS.spectators} spectator seats per room.
              </p>
              <div className="room-browser-heading">
                <span>
                  <span className="live-dot" /> {rooms.length} open{" "}
                  {rooms.length === 1 ? "room" : "rooms"}
                </span>
                <button
                  className="button primary"
                  onClick={() => setModal("create")}
                >
                  <Plus size={15} /> Create a room
                </button>
              </div>
              <div className="public-room-list">
                {rooms.length ? (
                  rooms.map((room) => (
                    <article className="public-room" key={room.code}>
                      <Avatar index={room.avatar} />
                      <div>
                        <h3>{room.hostName}’s room</h3>
                        <p>
                          <Users size={12} /> {room.players} / {room.capacity}{" "}
                          players <span>·</span>{" "}
                          {room.status === "playing"
                            ? `${room.spectators}/${room.spectatorLimit} watching`
                            : `${room.ready} ready`}
                        </p>
                        <small>
                          {room.status === "playing"
                            ? "In game · spectators only"
                            : "Public · waiting to start"}
                        </small>
                      </div>
                      <button
                        className="button primary"
                        disabled={busy || room.code === state?.code}
                        aria-label={`${room.status === "playing" ? "Watch" : "Join"} ${room.hostName}’s room`}
                        onClick={() => {
                          setJoinCode(room.code);
                          setJoinWatching(room.status === "playing");
                          setModal("join");
                        }}
                      >
                        {room.code === state?.code
                          ? "Your room"
                          : room.status === "playing"
                            ? "Watch"
                            : "Join"}
                        <ArrowRight size={15} />
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="no-open-rooms">
                    <Users size={38} />
                    <h3>Be the first to deal!</h3>
                    <p>
                      No public rooms are waiting right now. Create a room and
                      choose Public to welcome other players.
                    </p>
                  </div>
                )}
              </div>
              <button
                className="private-code-link"
                onClick={() => {
                  setJoinCode("");
                  setJoinWatching(false);
                  setModal("join");
                }}
              >
                <LockKeyhole size={14} /> Have a private room code? Join here{" "}
                <ChevronRight size={14} />
              </button>
            </section>
          ) : modal === "rules" ? (
            <>
              <p className="modal-intro">
                One deck. 2–8 players. Absolutely no trust required.
              </p>
              <ol className="rules-list">
                <li>
                  <span>01</span>
                  <div>
                    <strong>Play your cards. Tell your story.</strong>
                    <p>
                      On your turn, select 1–4 cards and claim a rank. They land
                      face-down. The cards don’t have to match your claim.
                    </p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Believe it. Or call BLUFF.</strong>
                    <p>
                      Everyone else gets a short window to accept or challenge.
                      The first challenge reveals the cards just played.
                    </p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>The truth has consequences.</strong>
                    <p>
                      If any revealed card doesn’t match, the player takes the
                      entire pile. If all cards match, the challenger takes it.
                    </p>
                  </div>
                </li>
                <li>
                  <span>04</span>
                  <div>
                    <strong>Empty hand. Full bragging rights.</strong>
                    <p>
                      First to lose every card wins, once their final claim
                      survives the challenge window. Play then moves clockwise.
                    </p>
                  </div>
                </li>
              </ol>
              <div className="modal-note">
                <Mic size={18} />
                <p>
                  Try “Bluff”, “Pass”, “Ready”, “I claim Kings”, or “Play two
                  cards”. Select your cards first. Voice is always optional.
                </p>
              </div>
              <button
                className="button primary full-width"
                onClick={() => setModal(null)}
              >
                I’ve got my poker face on <ArrowRight size={16} />
              </button>
            </>
          ) : modal === "settings" ? (
            <>
              <p className="modal-intro">
                A few little things to make the table feel like yours.
              </p>
              <SettingRow
                title="Sound effects"
                description="Soft card sounds and turn notifications."
              >
                <Toggle
                  checked={sound}
                  onChange={toggleSound}
                  label="Sound effects"
                />
              </SettingRow>
              <SettingRow
                title="Push to talk · voice commands"
                description={
                  speech.supported
                    ? "Hold Space to speak a command, release to stop."
                    : "Unavailable in this browser. Use on-screen controls."
                }
              >
                <Toggle
                  checked={ptt}
                  onChange={() => {
                    setPtt(!ptt);
                    localStorage.setItem("bluff-ptt", String(!ptt));
                  }}
                  label="Push to talk"
                  disabled={!speech.supported}
                />
              </SettingRow>
              <SettingRow
                title="Higher contrast"
                description="Brighter text and stronger outlines."
              >
                <Toggle
                  checked={contrast}
                  onChange={() => {
                    setContrast(!contrast);
                    localStorage.setItem("bluff-contrast", String(!contrast));
                  }}
                  label="Higher contrast"
                />
              </SettingRow>
              <div className="settings-subheading">
                TABLE RULES{" "}
                <span>
                  {state?.hostId === state?.selfId &&
                  ["lobby", "winner"].includes(state?.phase ?? "")
                    ? "Host controls"
                    : "Change between games as host"}
                </span>
              </div>
              <SettingRow
                title="Time to make a move"
                description="Turns automatically pass when time runs out."
              >
                <select
                  aria-label="Turn duration"
                  value={state?.settings.turnSeconds ?? 30}
                  disabled={
                    state?.hostId !== state?.selfId ||
                    !["lobby", "winner"].includes(state?.phase ?? "")
                  }
                  onChange={(e) =>
                    act("settings", { turnSeconds: Number(e.target.value) })
                  }
                >
                  {[20, 30, 45, 60].map((n) => (
                    <option key={n} value={n}>
                      {n} sec
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow
                title="Challenge window"
                description="Time for the table to call your bluff."
              >
                <select
                  aria-label="Challenge duration"
                  value={state?.settings.challengeSeconds ?? 8}
                  disabled={
                    state?.hostId !== state?.selfId ||
                    !["lobby", "winner"].includes(state?.phase ?? "")
                  }
                  onChange={(e) =>
                    act("settings", {
                      challengeSeconds: Number(e.target.value),
                    })
                  }
                >
                  {[5, 8, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} sec
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow
                title="Rank sequence"
                description="Any rank, or cycle from Ace through King."
              >
                <select
                  aria-label="Rank sequence"
                  value={state?.settings.rankMode ?? "free"}
                  disabled={
                    state?.hostId !== state?.selfId ||
                    !["lobby", "winner"].includes(state?.phase ?? "")
                  }
                  onChange={(e) =>
                    act("settings", { rankMode: e.target.value })
                  }
                >
                  <option value="free">Free choice</option>
                  <option value="ascending">Ascending</option>
                </select>
              </SettingRow>
              <div className="settings-bottom">
                <button
                  className="text-button"
                  onClick={() => setModal("leave")}
                >
                  <DoorOpen size={15} /> Leave table
                </button>
                <button
                  className="button primary"
                  onClick={() => setModal(null)}
                >
                  All set <Check size={15} />
                </button>
              </div>
            </>
          ) : modal === "invite" ? (
            <>
              <p className="modal-intro">
                Invite up to 8 players before the deal. Once play starts, new
                arrivals can watch from one of 8 spectator seats.
              </p>
              <div className="invite-code">
                <span>
                  {state?.visibility === "public"
                    ? "YOUR PUBLIC ROOM CODE"
                    : "YOUR PRIVATE ROOM CODE"}
                </span>
                <strong>{state?.code}</strong>
                <button className="button" onClick={() => copy()}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copied!" : "Copy code"}
                </button>
              </div>
              <button
                className="button primary full-width"
                onClick={() => copy(true)}
              >
                <Link size={16} />
                {copied ? "Copied to clipboard" : "Copy invite link"}
              </button>
              <p className="invite-footnote">
                <LockKeyhole size={12} />{" "}
                {state?.visibility === "public"
                  ? "Listed in Rooms. Anyone can join before the game or spectate after it starts."
                  : "Only people with the code can join. Up to 8 players."}
              </p>
              <div className="invite-roster" aria-label="Room players">
                {state?.players.map((p) => (
                  <div className="roster-player" key={p.id}>
                    <Avatar index={p.avatar} />
                    <div>
                      <strong>
                        {p.name}
                        {p.id === state.selfId ? " (you)" : ""}
                      </strong>
                      <span>
                        {!p.connected
                          ? "Disconnected · seat saved"
                          : p.id === state.hostId
                            ? "Host"
                            : p.ready
                              ? "Ready to play"
                              : "At the table"}
                      </span>
                    </div>
                    {state.hostId === state.selfId &&
                      p.id !== state.selfId &&
                      ["lobby", "winner"].includes(state.phase) && (
                        <button
                          className="icon-button"
                          aria-label={`Move ${p.name} to spectators`}
                          onClick={() => act("kick", { playerId: p.id })}
                        >
                          <X size={14} />
                        </button>
                      )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="modal-intro">
                Your friends can keep playing. If a game is in progress, an
                automatic player will take your seat until you rejoin.
              </p>
              <div className="modal-actions">
                <button className="button" onClick={() => setModal(null)}>
                  Stay at the table
                </button>
                <button
                  className="button primary"
                  onClick={async () => {
                    voice.disable();
                    await doAction("practice", namePayload());
                  }}
                >
                  Leave & practice <ArrowRight size={15} />
                </button>
              </div>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}

function Dialog({
  title,
  children,
  onClose,
  notice,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  notice?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
    const current = dialogRef.current;
    return () => current?.close();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="modal-title"
    >
      <button
        className="modal-close icon-button"
        onClick={onClose}
        aria-label="Close dialog"
      >
        <X size={20} />
      </button>
      <div className="modal-brand">
        <Spade size={20} fill="currentColor" /> THE BLUFF CLUB
      </div>
      <h2 id="modal-title">{title}</h2>
      {notice && (
        <p className="modal-feedback" role="status">
          {notice}
        </p>
      )}
      {children}
    </dialog>
  );
}
function RoomForm({
  mode,
  busy,
  onSubmit,
  initialCode,
  initialWatch,
}: {
  mode: "create" | "join";
  busy: boolean;
  initialCode?: string;
  initialWatch?: boolean;
  onSubmit: (data: Record<string, unknown>, watch: boolean) => Promise<void>;
}) {
  const [name, setName] = useState(localStorage.getItem("bluff-name") || "");
  const [avatar, setAvatar] = useState(
    Number(localStorage.getItem("bluff-avatar") || 0),
  );
  const [code, setCode] = useState(
    initialCode || new URLSearchParams(location.search).get("room") || "",
  );
  const [watch, setWatch] = useState(initialWatch ?? false);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    localStorage.setItem("bluff-name", name.trim());
    localStorage.setItem("bluff-avatar", String(avatar));
    void onSubmit({ name: name.trim(), avatar, code, visibility }, watch);
  };
  return (
    <form onSubmit={submit}>
      <p className="modal-intro">
        {mode === "create"
          ? "Your table, your rules. Invite friends or meet new challengers."
          : "Enter your room code and bring your best poker face."}
      </p>
      <label className="form-label" htmlFor="player-name">
        WHAT SHOULD WE CALL YOU?
      </label>
      <input
        id="player-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your table name"
        required
        maxLength={20}
        minLength={1}
        autoComplete="nickname"
      />
      <label className="form-label">PICK YOUR POKER FACE</label>
      <div className="avatar-picker">
        {AVATARS.map((emoji, i) => (
          <button
            type="button"
            key={i}
            className={avatar === i ? "avatar-chosen" : ""}
            onClick={() => setAvatar(i)}
            aria-label={`Choose ${["fox", "rabbit", "bear", "cat", "panda", "frog", "koala", "tiger"][i]} avatar`}
            aria-pressed={avatar === i}
          >
            <Avatar index={i} />
          </button>
        ))}
      </div>
      {mode === "create" && (
        <fieldset className="room-visibility">
          <legend>WHO CAN JOIN?</legend>
          <button
            type="button"
            role="radio"
            aria-checked={visibility === "private"}
            aria-label="Private room"
            className={visibility === "private" ? "visibility-selected" : ""}
            onClick={() => setVisibility("private")}
          >
            <LockKeyhole size={20} />
            <strong>Private</strong>
            <span>Invite code only</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={visibility === "public"}
            aria-label="Public room"
            className={visibility === "public" ? "visibility-selected" : ""}
            onClick={() => setVisibility("public")}
          >
            <Users size={20} />
            <strong>Public</strong>
            <span>Anyone can find & join</span>
          </button>
        </fieldset>
      )}
      {mode === "join" && (
        <>
          <label className="form-label" htmlFor="room-code">
            THE SECRET CODE
          </label>
          <input
            id="room-code"
            className="room-code-input"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
            }
            placeholder="ABC123"
            minLength={6}
            maxLength={6}
            required
            autoComplete="off"
          />
          <label className="watch-checkbox">
            <input
              type="checkbox"
              checked={watch}
              onChange={(e) => setWatch(e.target.checked)}
            />{" "}
            Just watching? Join as a spectator.
          </label>
        </>
      )}
      <button
        className="button primary full-width"
        type="submit"
        disabled={busy || !name.trim()}
      >
        {busy ? (
          <LoaderCircle size={17} className="spin" />
        ) : mode === "create" ? (
          <Plus size={17} />
        ) : (
          <LogIn size={17} />
        )}
        {mode === "create"
          ? "Create my table"
          : watch
            ? "Watch the game"
            : "Pull up a chair"}
        <ArrowRight size={17} />
      </button>
      <p className="invite-footnote">
        <ShieldCheck size={12} /> No account needed. Just good company.
      </p>
    </form>
  );
}
function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`toggle ${checked ? "toggle-on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
    >
      <span />
    </button>
  );
}
