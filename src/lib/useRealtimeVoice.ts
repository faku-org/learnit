import { useCallback, useEffect, useRef, useState } from "react";
import { getRealtimeVoiceToken } from "@/lib/api";

export type TranscriptTurn = { id: string; role: "user" | "assistant"; text: string };
export type RealtimeStatus = "idle" | "connecting" | "active" | "error";

export type StartOptions = {
  instructions: string;
  languageHint?: string;
  voice?: string;
};

const SAMPLE_RATE = 24000;

function floatToPCM16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64PCM16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
  return float32;
}

/**
 * Drives a live xAI Speech-to-Speech conversation (wss://api.x.ai/v1/realtime).
 * Streams the mic as PCM16/base64 over `input_audio_buffer.append`, plays
 * `response.output_audio.delta` chunks back gaplessly, and surfaces live
 * transcripts for both sides of the conversation.
 */
export function useRealtimeVoice() {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlayTimeRef = useRef(0);
  const turnsRef = useRef<TranscriptTurn[]>([]);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  const upsertTurn = useCallback(
    (id: string, role: "user" | "assistant", updater: (prev: string) => string) => {
      setTurns((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx === -1) return [...prev, { id, role, text: updater("") }];
        const next = [...prev];
        next[idx] = { ...next[idx], text: updater(next[idx].text) };
        return next;
      });
    },
    [],
  );

  const cleanup = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    inputCtxRef.current?.close().catch(() => null);
    inputCtxRef.current = null;
    outputCtxRef.current?.close().catch(() => null);
    outputCtxRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    nextPlayTimeRef.current = 0;
    setAssistantSpeaking(false);
    setUserSpeaking(false);
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  // Never leave a live mic + $3/hr WebSocket running past the component's life.
  useEffect(() => () => cleanup(), [cleanup]);

  const playChunk = useCallback((base64: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    const float32 = base64PCM16ToFloat32(base64);
    if (float32.length === 0) return;
    const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    src.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
  }, []);

  const start = useCallback(
    async (opts: StartOptions) => {
      setStatus("connecting");
      setTurns([]);
      turnsRef.current = [];
      try {
        const { value: token } = await getRealtimeVoiceToken();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;

        const inputCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
        inputCtxRef.current = inputCtx;
        const outputCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
        outputCtxRef.current = outputCtx;
        nextPlayTimeRef.current = outputCtx.currentTime;

        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        // ScriptProcessorNode only fires onaudioprocess while connected to a
        // destination — route through a silent gain so the mic isn't echoed back.
        const silentGain = inputCtx.createGain();
        silentGain.gain.value = 0;
        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(inputCtx.destination);

        const ws = new WebSocket("wss://api.x.ai/v1/realtime?model=grok-voice-latest", [
          `xai-client-secret.${token}`,
        ]);
        wsRef.current = ws;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const input = e.inputBuffer.getChannelData(0);
          ws.send(
            JSON.stringify({ type: "input_audio_buffer.append", audio: floatToPCM16Base64(input) }),
          );
        };

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              type: "session.update",
              session: {
                voice: opts.voice ?? "eve",
                instructions: opts.instructions,
                turn_detection: { type: "server_vad" },
                audio: {
                  input: {
                    format: { type: "audio/pcm", rate: SAMPLE_RATE },
                    transcription: opts.languageHint
                      ? { model: "grok-transcribe", language_hint: opts.languageHint }
                      : { model: "grok-transcribe" },
                  },
                  output: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
                },
              },
            }),
          );
          setStatus("active");
        };

        ws.onmessage = (ev) => {
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(ev.data as string);
          } catch {
            return;
          }
          switch (event.type as string) {
            case "response.output_audio.delta": {
              const delta = (event.delta as string) ?? "";
              if (delta) playChunk(delta);
              setAssistantSpeaking(true);
              break;
            }
            case "response.output_audio.done":
            case "response.done": {
              setAssistantSpeaking(false);
              break;
            }
            case "response.output_audio_transcript.delta": {
              const id = (event.item_id as string) ?? (event.response_id as string) ?? "assistant";
              const delta = (event.delta as string) ?? "";
              upsertTurn(id, "assistant", (prev) => prev + delta);
              break;
            }
            case "conversation.item.input_audio_transcription.updated":
            case "conversation.item.input_audio_transcription.completed": {
              const id = (event.item_id as string) ?? "user";
              const text = (event.transcript as string) ?? "";
              upsertTurn(id, "user", () => text);
              break;
            }
            case "input_audio_buffer.speech_started": {
              setUserSpeaking(true);
              break;
            }
            case "input_audio_buffer.speech_stopped": {
              setUserSpeaking(false);
              break;
            }
            case "error": {
              console.error("Realtime voice error:", event);
              break;
            }
            default:
              break;
          }
        };

        ws.onerror = () => {
          if (wsRef.current !== ws) return;
          setStatus("error");
        };

        ws.onclose = () => {
          if (wsRef.current !== ws) return;
          setStatus((s) => (s === "active" || s === "connecting" ? "idle" : s));
        };
      } catch (err) {
        cleanup();
        setStatus("error");
        throw err;
      }
    },
    [cleanup, playChunk, upsertTurn],
  );

  const fullUserTranscript = useCallback(
    () => turnsRef.current.filter((t) => t.role === "user").map((t) => t.text).join(" "),
    [],
  );

  return { status, turns, assistantSpeaking, userSpeaking, start, stop, fullUserTranscript };
}
