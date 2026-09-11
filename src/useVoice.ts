import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { PublicPlayer } from "../shared/types";

interface RecognitionEvent {
  results: {
    [index: number]: { [index: number]: { transcript: string } };
    length: number;
  };
  resultIndex: number;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  }
}
export function useSpeech(
  onCommand: (text: string) => void,
  notify: (text: string) => void,
) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const callback = useRef(onCommand);
  callback.current = onCommand;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const supported = !!(
    window.SpeechRecognition || window.webkitSpeechRecognition
  );
  const stop = useCallback(() => {
    recognition.current?.stop();
    setListening(false);
  }, []);
  const start = useCallback(() => {
    const Constructor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) {
      notifyRef.current(
        "Voice commands are unavailable in this browser. All actions are available on screen.",
      );
      return;
    }
    if (recognition.current) recognition.current.abort();
    const r = new Constructor();
    recognition.current = r;
    r.lang = "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e) => {
      const text = e.results[e.resultIndex][0].transcript;
      setTranscript(text);
      callback.current(text);
    };
    r.onerror = (e) => {
      setListening(false);
      if (e.error !== "aborted" && e.error !== "no-speech")
        notifyRef.current(
          e.error === "not-allowed"
            ? "Microphone permission was denied. You can still use every on-screen control."
            : "Voice recognition could not connect. Try again or use the buttons.",
        );
    };
    r.onend = () => setListening(false);
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, []);
  useEffect(() => () => recognition.current?.abort(), []);
  return { supported, listening, transcript, start, stop };
}

export function useVoiceChat(
  socket: Socket | null,
  code: string | undefined,
  selfId: string | undefined,
  players: PublicPlayer[],
  status: (muted: boolean, speaking: boolean) => void,
  notify: (text: string) => void,
) {
  const [enabled, setEnabled] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const generation = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const peers = useRef(
    new Map<
      string,
      {
        pc: RTCPeerConnection;
        audio: HTMLAudioElement;
        candidates: RTCIceCandidateInit[];
      }
    >(),
  );
  const config = useRef<RTCConfiguration>({ iceServers: [] });
  const meter = useRef<{ context: AudioContext; timer: number } | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const disable = useCallback(() => {
    generation.current++;
    setConnecting(false);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    peers.current.forEach(({ pc, audio }) => {
      pc.close();
      audio.srcObject = null;
    });
    peers.current.clear();
    if (meter.current) {
      clearInterval(meter.current.timer);
      void meter.current.context.close();
      meter.current = null;
    }
    setEnabled(false);
    statusRef.current(true, false);
  }, []);
  const toggle = useCallback(async () => {
    if (stream.current) {
      disable();
      return;
    }
    setConnecting(true);
    const request = ++generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Voice chat needs HTTPS or localhost and a supported browser.",
        );
      const response = await fetch("/api/voice-config");
      const data = await response.json();
      if (request !== generation.current) return;
      if (!data.enabled)
        throw new Error("Voice chat is disabled on this server.");
      config.current = { iceServers: data.iceServers };
      const captured = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (request !== generation.current) {
        captured.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = captured;
      setEnabled(true);
      statusRef.current(false, false);
      const context = new AudioContext();
      await context.resume();
      if (request !== generation.current) {
        void context.close();
        return;
      }
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream.current).connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);
      let last = false;
      const timer = window.setInterval(() => {
        analyser.getByteFrequencyData(values);
        const speaking = values.reduce((a, b) => a + b, 0) / values.length > 18;
        if (speaking !== last) {
          last = speaking;
          statusRef.current(false, speaking);
        }
      }, 250);
      meter.current = { context, timer };
    } catch (error) {
      if (request !== generation.current) return;
      disable();
      notifyRef.current(
        error instanceof Error && error.name === "NotAllowedError"
          ? "Microphone permission was denied. You can play with voice off."
          : error instanceof Error
            ? error.message
            : "Could not enable voice chat.",
      );
    } finally {
      if (request === generation.current) setConnecting(false);
    }
  }, [disable]);
  useEffect(() => {
    if (
      (enabled || connecting) &&
      selfId &&
      !players.some((p) => p.id === selfId)
    )
      disable();
  }, [enabled, connecting, selfId, players, disable]);
  const getPeer = useCallback(
    (id: string) => {
      const existing = peers.current.get(id);
      if (existing) return existing;
      const pc = new RTCPeerConnection(config.current);
      const audio = new Audio();
      audio.autoplay = true;
      const peer = { pc, audio, candidates: [] as RTCIceCandidateInit[] };
      peers.current.set(id, peer);
      stream.current
        ?.getTracks()
        .forEach((track) => pc.addTrack(track, stream.current!));
      pc.onicecandidate = (e) => {
        if (e.candidate)
          socket?.emit("signal", { to: id, candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0];
        void audio
          .play()
          .catch(() =>
            notifyRef.current("Tap the sound control to allow incoming audio."),
          );
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed")
          notifyRef.current(
            "A voice connection failed. Rejoin voice to retry. A relay server may be needed on this network.",
          );
      };
      return peer;
    },
    [socket],
  );
  useEffect(() => {
    if (!enabled || !socket || !selfId) return;
    const ids = players
      .filter((p) => !p.bot && p.id !== selfId && !p.muted && p.connected)
      .map((p) => p.id);
    peers.current.forEach((peer, id) => {
      if (!ids.includes(id)) {
        peer.pc.close();
        peer.audio.srcObject = null;
        peers.current.delete(id);
      }
    });
    ids.forEach((id) => {
      if (selfId < id && !peers.current.has(id)) {
        const peer = getPeer(id);
        void (async () => {
          try {
            const offer = await peer.pc.createOffer();
            await peer.pc.setLocalDescription(offer);
            socket.emit("signal", {
              to: id,
              description: peer.pc.localDescription,
            });
          } catch {
            notifyRef.current("Could not start this voice connection.");
          }
        })();
      }
    });
  }, [enabled, socket, selfId, players, getPeer]);
  useEffect(() => {
    if (!socket) return;
    const signal = async (data: {
      from: string;
      description?: RTCSessionDescriptionInit;
      candidate?: RTCIceCandidateInit;
    }) => {
      if (!stream.current) return;
      const peer = getPeer(data.from);
      try {
        if (data.description) {
          await peer.pc.setRemoteDescription(data.description);
          for (const candidate of peer.candidates)
            await peer.pc.addIceCandidate(candidate);
          peer.candidates = [];
          if (data.description.type === "offer") {
            const answer = await peer.pc.createAnswer();
            await peer.pc.setLocalDescription(answer);
            socket.emit("signal", {
              to: data.from,
              description: peer.pc.localDescription,
            });
          }
        } else if (data.candidate) {
          if (peer.pc.remoteDescription)
            await peer.pc.addIceCandidate(data.candidate);
          else peer.candidates.push(data.candidate);
        }
      } catch {
        notifyRef.current(
          "Voice connection interrupted. Rejoin voice to retry.",
        );
      }
    };
    socket.on("signal", signal);
    socket.on("disconnect", disable);
    return () => {
      socket.off("signal", signal);
      socket.off("disconnect", disable);
    };
  }, [socket, getPeer, disable]);
  useEffect(() => {
    return () => disable();
  }, [code, disable]);
  return { enabled, connecting, toggle, disable };
}
