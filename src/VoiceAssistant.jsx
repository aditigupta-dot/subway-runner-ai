import { useEffect, useRef, useState } from "react";

const SpeechRecognitionClass =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

// English words need word boundaries ("right" must not match "alright").
const words = (c, list) => new RegExp(`\\b(${list.join("|")})\\b`).test(c);
const has = (c, list) => list.some((w) => c.includes(w));

function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[.,!?।]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Returns { label, run(callbacks) } or null. No side effects.
function matchCommand(raw) {
  const c = normalize(raw);
  if (!c) return null;

  if (words(c, ["left"]) || has(c, ["लेफ्ट", "बाएं", "बायें"])) {
    return { label: "Moving left", run: (cb) => cb.onMove?.(-1) };
  }
  if (words(c, ["right"]) || has(c, ["राइट", "दाएं", "दायें"])) {
    return { label: "Moving right", run: (cb) => cb.onMove?.(1) };
  }
  if (words(c, ["jump", "up"]) || has(c, ["जंप", "जम्प", "कूद", "ऊपर"])) {
    return { label: "Jumping", run: (cb) => cb.onJump?.() };
  }
  if (words(c, ["slide", "duck", "down"]) || has(c, ["स्लाइड", "झुको", "नीचे"])) {
    return { label: "Sliding", run: (cb) => cb.onSlide?.() };
  }
  if (words(c, ["pause", "stop"]) || has(c, ["पॉज"])) {
    return { label: "Paused", run: (cb) => cb.onPause?.() };
  }
  if (words(c, ["resume", "continue"]) || has(c, ["रिज्यूम"])) {
    return { label: "Resumed", run: (cb) => cb.onResume?.() };
  }
  if (words(c, ["start", "restart", "play"]) || has(c, ["स्टार्ट"])) {
    return { label: "Starting", run: (cb) => cb.onStart?.() };
  }
  return null;
}

export default function VoiceAssistant({
  onMove,
  onJump,
  onSlide,
  onStart,
  onPause,
  onResume,
  onListeningChange,
}) {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [instant, setInstant] = useState(false);
  const [message, setMessage] = useState("Voice control is off");
  const [transcript, setTranscript] = useState("");

  const callbacksRef = useRef({});
  callbacksRef.current = { onMove, onJump, onSlide, onStart, onPause, onResume, onListeningChange };

  const activeRef = useRef(false);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  const recognitionRef = useRef(null);
  const levelRef = useRef(null);

  const speechStartedRef = useRef(false);
  const speechStartRef = useRef(0);
  const silenceStartRef = useRef(null);
  const inflightRef = useRef(0);
  const lastFastRef = useRef(0); // when the instant path last ran a command

  function execute(text) {
    const match = matchCommand(text);
    if (!match) return false;
    const result = match.run(callbacksRef.current);
    setMessage(result === false ? "Game is not running" : `${match.label} ⚡`);
    return true;
  }

  /* ---------- Path 1: instant. Reacts to interim words, mid-sentence. ---------- */

  function startInstant() {
    if (!SpeechRecognitionClass) return;
    const rec = new SpeechRecognitionClass();
    rec.lang = "en-IN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    const fired = new Set(); // result indexes already acted on

    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        setTranscript(result[0].transcript);
        if (fired.has(i)) continue;
        for (let a = 0; a < result.length; a++) {
          if (execute(result[a].transcript)) {
            fired.add(i);
            lastFastRef.current = Date.now();
            break;
          }
        }
      }
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setInstant(false);
        recognitionRef.current = null;
      }
    };

    rec.onend = () => {
      // Chrome ends sessions on its own; restart right away.
      if (activeRef.current && recognitionRef.current === rec) {
        setTimeout(() => {
          try {
            rec.start();
          } catch {
            /* already started */
          }
        }, 80);
      }
    };

    try {
      rec.start();
      recognitionRef.current = rec;
      setInstant(true);
    } catch {
      setInstant(false);
    }
  }

  /* ---------- Path 2: Gnani. Runs in parallel and never blocks listening. ---------- */

  async function sendAudio(blob, startedAt) {
    inflightRef.current += 1;
    setBusy(true);

    try {
      const formData = new FormData();
      formData.append("audio", blob, "voice-command.webm");

      const response = await fetch("https://subway-runner-voice-server.onrender.com/api/voice-command", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gnani API request failed");

      const text = result.transcript || "";
      if (text.trim()) {
        setTranscript(text);
        // Skip if the instant path already handled this utterance.
        const alreadyHandled = lastFastRef.current >= startedAt - 400;
        if (!alreadyHandled && !execute(text)) setMessage("Command not recognized");
      }
    } catch (error) {
      console.error("[VOICE ERROR]", error);
      setMessage(error.message || "Voice connection failed");
    } finally {
      inflightRef.current -= 1;
      if (inflightRef.current === 0) {
        setBusy(false);
        callbacksRef.current.onListeningChange?.(false);
      }
    }
  }

  function stopRecording() {
    speechStartedRef.current = false;
    silenceStartRef.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") recorder.stop();
  }

  function startRecording() {
    if (!streamRef.current || !activeRef.current) return;

    const chunks = []; // local, so overlapping uploads never mix audio
    const startedAt = Date.now();
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (blob.size > 1000 && activeRef.current) {
        sendAudio(blob, startedAt);
      } else if (inflightRef.current === 0) {
        callbacksRef.current.onListeningChange?.(false);
      }
    };

    speechStartedRef.current = true;
    silenceStartRef.current = null;
    speechStartRef.current = startedAt;
    recorder.start();
    callbacksRef.current.onListeningChange?.(true);
  }

  function startDetection() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);

    function detect() {
      if (!activeRef.current) return;

      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const volume = Math.sqrt(sum / data.length);
      const now = Date.now();

      if (levelRef.current) {
        levelRef.current.style.width = `${Math.min(100, volume * 700)}%`;
      }

      if (volume > 0.02) {
        silenceStartRef.current = null;
        if (!speechStartedRef.current) startRecording();
      } else if (speechStartedRef.current) {
        if (!silenceStartRef.current) silenceStartRef.current = now;
        if (now - speechStartRef.current > 150 && now - silenceStartRef.current > 350) {
          stopRecording();
        }
      }

      // Safety: never record more than 4 seconds of noise.
      if (speechStartedRef.current && now - speechStartRef.current > 4000) stopRecording();

      animationRef.current = requestAnimationFrame(detect);
    }

    animationRef.current = requestAnimationFrame(detect);
  }

  async function enableVoice() {
    try {
      setMessage("Requesting microphone permission...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      audioContextRef.current = context;
      await context.resume();

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      activeRef.current = true;
      setActive(true);
      setMessage("Listening. Say jump, left, right, slide.");

      startInstant();
      startDetection();
    } catch (error) {
      console.error("[MICROPHONE ERROR]", error);
      setMessage("Please allow microphone access and try again.");
    }
  }

  function disableVoice() {
    activeRef.current = false;
    setActive(false);
    setInstant(false);
    cancelAnimationFrame(animationRef.current);

    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onend = null;
      rec.abort();
    }

    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;

    speechStartedRef.current = false;
    if (levelRef.current) levelRef.current.style.width = "0%";
    callbacksRef.current.onListeningChange?.(false);
    setMessage("Voice control is off");
  }

  useEffect(() => () => disableVoice(), []); // release the mic on unmount

  return (
    <div
      style={{
        position: "absolute",
        top: "60px",
        right: "12px",
        zIndex: 20,
        width: "210px",
        padding: "10px 12px",
        borderRadius: "12px",
        background: "rgba(27,16,56,0.85)",
        border: "1px solid rgba(34,211,238,0.45)",
        color: "white",
        fontFamily: "inherit",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "8px" }}>
        <span style={{ color: "#22d3ee" }}>Voice control</span>
        <span style={{ color: instant ? "#facc15" : "#94a3b8" }}>
          {active ? (instant ? "⚡ Instant" : "Gnani") : ""}
        </span>
      </div>

      <button
        onClick={active ? disableVoice : enableVoice}
        style={{
          width: "100%",
          padding: "9px",
          border: "none",
          borderRadius: "8px",
          background: active ? "#dc2626" : "#0284c7",
          color: "white",
          fontWeight: "bold",
          fontSize: "13px",
          cursor: "pointer",
        }}
      >
        {active ? "● Voice off" : "🎙 Enable voice"}
      </button>

      <div
        style={{
          height: "5px",
          margin: "8px 0",
          borderRadius: "3px",
          background: "rgba(255,255,255,0.12)",
          overflow: "hidden",
        }}
      >
        <div
          ref={levelRef}
          style={{ height: "100%", width: "0%", background: "#22d3ee", transition: "width 60ms linear" }}
        />
      </div>

      <div style={{ fontSize: "12px", color: "#e2e8f0", minHeight: "16px" }}>
        {message}
        {busy ? " …" : ""}
      </div>

      {transcript && (
        <div style={{ marginTop: "6px", fontSize: "11px", color: "#a5b4fc", overflowWrap: "anywhere" }}>
          Heard: {transcript}
        </div>
      )}
    </div>
  );
}