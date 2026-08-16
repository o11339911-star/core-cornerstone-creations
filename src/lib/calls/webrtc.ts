import * as React from "react";

import { supabase } from "@/integrations/supabase/client";

/**
 * Audio-only WebRTC peer connection with Supabase-backed signalling.
 *
 * Signalling rows live in `public.call_signals`, which is RLS-restricted to
 * the two participating entities and wiped when the session ends. Payloads are
 * never logged, and no recording of any kind is performed.
 */

export type CallPhase = "idle" | "connecting" | "connected" | "failed" | "ended";

type SignalRow = {
  id: string;
  call_id: string;
  sender_entity_id: string;
  kind: "offer" | "answer" | "ice" | "hangup";
  payload: Record<string, unknown>;
};

/**
 * Public STUN only. TURN stays behind an env-provided provider and is not
 * configured here; when it is absent, symmetric-NAT networks fail loudly
 * instead of pretending relay coverage exists.
 */
export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  const turnUrl = import.meta.env["VITE_TURN_URL"] as string | undefined;
  const turnUser = import.meta.env["VITE_TURN_USERNAME"] as string | undefined;
  const turnCred = import.meta.env["VITE_TURN_CREDENTIAL"] as string | undefined;
  if (turnUrl && turnUser && turnCred) {
    servers.push({ urls: [turnUrl], username: turnUser, credential: turnCred });
  }
  return servers;
}

export function hasTurn(): boolean {
  return Boolean(import.meta.env["VITE_TURN_URL"]);
}

export type UseVoiceCallOptions = {
  callId: string | null;
  entityId: string | null;
  role: "caller" | "callee";
  active: boolean;
};

export type VoiceCallState = {
  phase: CallPhase;
  muted: boolean;
  seconds: number;
  errorKey: string | null;
  toggleMute: () => void;
  hangup: () => void;
  retry: () => void;
};

export function useVoiceCall(options: UseVoiceCallOptions): VoiceCallState {
  const { callId, entityId, role, active } = options;
  const [phase, setPhase] = React.useState<CallPhase>("idle");
  const [muted, setMuted] = React.useState(false);
  const [seconds, setSeconds] = React.useState(0);
  const [errorKey, setErrorKey] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const sendRef = React.useRef<
    ((kind: SignalRow["kind"], payload: Record<string, unknown>) => Promise<void>) | null
  >(null);

  const cleanup = React.useCallback(() => {
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (!active || !callId || !entityId) return;

    let disposed = false;
    const handled = new Set<string>();
    /** Candidates that arrive before the remote description is applied. */
    const pendingIce: RTCIceCandidateInit[] = [];
    setErrorKey(null);
    setPhase("connecting");

    const send = async (kind: SignalRow["kind"], payload: Record<string, unknown>) => {
      await supabase
        .from("call_signals")
        .insert({
          call_id: callId,
          sender_entity_id: entityId,
          kind,
          payload: payload as never,
        });
    };
    sendRef.current = send;


    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    pcRef.current = pc;

    const remote = new MediaStream();
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.srcObject = remote;
    document.body.appendChild(audio);
    audioRef.current = audio;

    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => remote.addTrack(track));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void send("ice", { candidate: event.candidate.toJSON() as unknown as Record<string, unknown> });
      }
    };

    pc.onconnectionstatechange = () => {
      if (disposed) return;
      if (pc.connectionState === "connected") setPhase("connected");
      if (pc.connectionState === "failed") {
        setErrorKey(hasTurn() ? "calls.error.connection" : "calls.error.noRelay");
        setPhase("failed");
      }
      if (pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        setPhase((p) => (p === "connected" ? "ended" : p));
      }
    };

    const flushIce = async () => {
      while (pendingIce.length) {
        const candidate = pendingIce.shift();
        if (!candidate) break;
        try {
          await pc.addIceCandidate(candidate);
        } catch {
          // A late or duplicate candidate is not fatal.
        }
      }
    };

    const applySignal = async (row: SignalRow) => {
      if (disposed || handled.has(row.id) || row.sender_entity_id === entityId) return;
      handled.add(row.id);

      if (row.kind === "offer" && role === "callee") {
        await pc.setRemoteDescription(row.payload as unknown as RTCSessionDescriptionInit);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await send("answer", { type: answer.type, sdp: answer.sdp ?? "" });
        await flushIce();
      } else if (row.kind === "answer" && role === "caller") {
        if (!pc.currentRemoteDescription) {
          await pc.setRemoteDescription(row.payload as unknown as RTCSessionDescriptionInit);
          await flushIce();
        }
      } else if (row.kind === "ice") {
        const candidate = row.payload["candidate"] as RTCIceCandidateInit | undefined;
        if (!candidate) return;
        // Queue until the remote description exists, otherwise the candidate is
        // silently dropped and the connection stalls on slower networks.
        if (!pc.remoteDescription) {
          pendingIce.push(candidate);
          return;
        }
        try {
          await pc.addIceCandidate(candidate);
        } catch {
          // A late or duplicate candidate is not fatal.
        }
      } else if (row.kind === "hangup") {
        setPhase("ended");
      }
    };

    const channel = supabase
      .channel(`call-${callId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_signals", filter: `call_id=eq.${callId}` },
        (payload) => {
          void applySignal(payload.new as SignalRow);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "call_sessions", filter: `id=eq.${callId}` },
        (payload) => {
          // The session row is the single source of truth: when the other side
          // declines, cancels or hangs up, the local leg closes immediately.
          const status = (payload.new as { status?: string }).status;
          if (status && ["declined", "missed", "ended", "cancelled"].includes(status)) {
            setPhase("ended");
          }
        },
      )
      .subscribe();


    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        if (role === "caller") {
          const offer = await pc.createOffer({ offerToReceiveAudio: true });
          await pc.setLocalDescription(offer);
          await send("offer", { type: offer.type, sdp: offer.sdp ?? "" });
        }

        const { data: pending } = await supabase
          .from("call_signals")
          .select("id, call_id, sender_entity_id, kind, payload")
          .eq("call_id", callId)
          .order("created_at", { ascending: true });

        for (const row of (pending ?? []) as unknown as SignalRow[]) {
          await applySignal(row);
        }
      } catch (error) {
        if (disposed) return;
        const name = (error as { name?: string }).name;
        setErrorKey(
          name === "NotAllowedError" || name === "NotFoundError"
            ? "calls.error.microphone"
            : "calls.error.connection",
        );
        setPhase("failed");
      }
    };

    void start();

    return () => {
      disposed = true;
      sendRef.current = null;
      void supabase.removeChannel(channel);
      cleanup();
    };
  }, [active, callId, entityId, role, attempt, cleanup]);


  React.useEffect(() => {
    if (phase !== "connected") return;
    setSeconds(0);
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const toggleMute = React.useCallback(() => {
    setMuted((current) => {
      const next = !current;
      streamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
      return next;
    });
  }, []);

  const hangup = React.useCallback(() => {
    cleanup();
    setPhase("ended");
  }, [cleanup]);

  const retry = React.useCallback(() => {
    cleanup();
    setAttempt((a) => a + 1);
  }, [cleanup]);

  return { phase, muted, seconds, errorKey, toggleMute, hangup, retry };
}

/** Latin-digit mm:ss timer. */
export function formatCallDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(m)}:${pad(s)}`;
}
