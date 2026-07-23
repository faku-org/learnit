import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Volume2, RefreshCw, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AuthGuard } from "@/components/AuthGuard";

const SAMPLE_PHRASES: Record<string, string[]> = {
  japanese: [
    "Ohayou gozaimasu",
    "Arigatou gozaimasu",
    "Sumimasen, eki wa doko desu ka",
    "Watashi wa nihongo o benkyou shiteimasu",
  ],
  spanish: [
    "Buenos dias, como estas?",
    "Donde esta la estacion?",
    "Me gustaria un cafe, por favor",
    "Cuanto cuesta esto?",
  ],
  french: [
    "Bonjour, comment allez-vous?",
    "Ou est la gare?",
    "Je voudrais un cafe, s'il vous plait",
    "Combien ca coute?",
  ],
};

const LANG_CODES: Record<string, string> = {
  japanese: "ja-JP",
  spanish: "es-ES",
  french: "fr-FR",
};

const TTS_LANG_PREFIX: Record<string, string> = {
  japanese: "ja",
  spanish: "es",
  french: "fr",
};

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

type Phase = "idle" | "speaking" | "listening" | "result";

interface SREvent {
  results: { [i: number]: { [j: number]: { transcript: string } } };
}
interface SRErrorEvent {
  error: string;
}
interface SRInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SREvent) => void) | null;
  onerror: ((event: SRErrorEvent) => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SRInstance;

function SpeakInner() {
  const [language, setLanguage] = useState("japanese");
  const [phrase, setPhrase] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  const recognitionRef = useRef<SRInstance | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    synthRef.current = window.speechSynthesis;
  }, []);

  const pickRandomPhrase = useCallback(
    (lang = language) => {
      const phrases = SAMPLE_PHRASES[lang] ?? SAMPLE_PHRASES.japanese;
      setPhrase(phrases[Math.floor(Math.random() * phrases.length)]);
      setTranscript("");
      setFeedback(null);
      setPhase("idle");
    },
    [language],
  );

  useEffect(() => {
    pickRandomPhrase();
  }, [pickRandomPhrase]);

  const speak = useCallback(() => {
    if (!synthRef.current || !phrase) return;
    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(phrase);
    const voices = synthRef.current.getVoices();
    const prefix = TTS_LANG_PREFIX[language] ?? "ja";
    const voice = voices.find((v) => v.lang.startsWith(prefix)) ?? voices[0];
    if (voice) utterance.voice = voice;
    utterance.rate = 0.85;
    utterance.pitch = 1;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setPhase("speaking");
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setPhase("idle");
    };

    synthRef.current.speak(utterance);
  }, [phrase, language]);

  const startListening = useCallback(() => {
    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | SpeechRecognitionCtor
      | undefined;
    if (!SR) {
      alert("Speech recognition is not supported in this browser. Use Chrome or Edge.");
      return;
    }

    const recognition = new SR();
    recognition.lang = LANG_CODES[language] ?? "ja-JP";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setPhase("listening");
      setTranscript("");
    };

    recognition.onresult = (event: SREvent) => {
      const result = event.results[0][0].transcript;
      setTranscript(result);
      setIsListening(false);
      setPhase("result");

      const clean = (s: string) =>
        s
          .toLowerCase()
          .replace(/[.,!?]/g, "")
          .trim();
      setFeedback(clean(result) === clean(phrase) ? "correct" : "incorrect");
    };

    recognition.onerror = (event: SRErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      setPhase("idle");
      if (event.error === "not-allowed") {
        alert("Microphone access denied. Please allow microphone access.");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [phrase, language]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setPhase("idle");
  }, []);

  const switchLanguage = (lang: string) => {
    setLanguage(lang);
    pickRandomPhrase(lang);
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="px-6 py-8 max-w-3xl mx-auto w-full"
    >
      <motion.h1 variants={itemVariants} className="font-display text-3xl text-foreground mb-2">
        Speak
      </motion.h1>
      <motion.p variants={itemVariants} className="text-muted-foreground mb-8">
        Listen to the phrase, repeat it aloud. Your speech will be checked.
      </motion.p>

      <motion.div variants={itemVariants} className="flex gap-2 mb-6">
        {(["japanese", "spanish", "french"] as const).map((lang) => (
          <button
            key={lang}
            onClick={() => switchLanguage(lang)}
            className={[
              "px-3 py-1.5 rounded-lg text-xs capitalize transition-colors",
              language === lang
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {lang}
          </button>
        ))}
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div
          key={phase + phrase}
          variants={containerVariants}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0, y: -10 }}
          className="space-y-4"
        >
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest">
                  Listen and repeat
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-2xl font-medium text-foreground text-center py-4">{phrase}</p>
                <div className="flex justify-center gap-3">
                  <Button
                    onClick={speak}
                    disabled={isSpeaking || isListening}
                    variant="outline"
                    size="lg"
                    className="gap-2"
                  >
                    <Volume2 size={18} className={isSpeaking ? "text-accent animate-pulse" : ""} />
                    {isSpeaking ? "Speaking..." : "Listen"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants} className="flex justify-center">
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={isSpeaking}
              className={[
                "w-20 h-20 rounded-full flex items-center justify-center transition-all",
                isListening
                  ? "bg-red-500/20 text-red-400 scale-110 animate-pulse"
                  : "bg-primary/10 text-primary hover:bg-primary/20 hover:scale-105",
                "disabled:opacity-30 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              {isListening ? <MicOff size={28} /> : <Mic size={28} />}
            </button>
          </motion.div>

          <motion.p variants={itemVariants} className="text-center text-xs text-muted-foreground">
            {isListening ? "Listening... speak now" : "Tap the mic and repeat the phrase"}
          </motion.p>

          {phase === "result" && transcript && (
            <motion.div
              variants={itemVariants}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <div
                    className={[
                      "flex items-center gap-2 p-3 rounded-lg",
                      feedback === "correct"
                        ? "bg-accent/10 text-accent"
                        : "bg-red-500/10 text-red-400",
                    ].join(" ")}
                  >
                    {feedback === "correct" ? <Check size={16} /> : <X size={16} />}
                    <span className="text-sm">
                      {feedback === "correct" ? "Perfect!" : "Not quite. Keep practicing."}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">You said: </span>
                      <span className="text-foreground">{transcript}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Expected: </span>
                      <span className="text-accent">{phrase}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={speak} variant="outline" size="sm" className="gap-1">
                      <Volume2 size={14} />
                      Listen again
                    </Button>
                    <Button
                      onClick={() => pickRandomPhrase()}
                      variant="outline"
                      size="sm"
                      className="gap-1"
                    >
                      <RefreshCw size={14} />
                      New phrase
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

// Zero-hook shell: AuthGuard must gate mounting of SpeakInner, not just its
// output, or the fetch effects below fire (and 401) before auth is known.
export function SpeakPage() {
  return (
    <AuthGuard>
      <SpeakInner />
    </AuthGuard>
  );
}
