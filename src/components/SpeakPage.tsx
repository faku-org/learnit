import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Volume2, RefreshCw, Check, X, Sparkles, MessagesSquare, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AuthGuard } from "@/components/AuthGuard";
import {
  synthesizeSpeech,
  transcribeSpeech,
  generateSpeakScenario,
  gradeSpeakResponse,
  getCurrentPath,
  getPreferences,
  getProgress,
  type SpeakScenario,
  type SpeakGrade,
} from "@/lib/api";
import { useRealtimeVoice } from "@/lib/useRealtimeVoice";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";

const LANGUAGES = [
  "japanese", "chinese", "korean", "spanish", "french", "german", "italian",
  "portuguese", "russian", "arabic", "hindi", "dutch", "swedish", "polish",
  "turkish", "english",
] as const;
type Language = (typeof LANGUAGES)[number];

type Phrase = { text: string; translit?: string };

const SAMPLE_PHRASES: Record<Language, Phrase[]> = {
  japanese: [
    { text: "おはようございます", translit: "Ohayou gozaimasu" },
    { text: "ありがとうございます", translit: "Arigatou gozaimasu" },
    { text: "すみません、駅はどこですか", translit: "Sumimasen, eki wa doko desu ka" },
    { text: "私は日本語を勉強しています", translit: "Watashi wa nihongo o benkyoushiteimasu" },
  ],
  chinese: [
    { text: "早上好", translit: "Zǎoshang hǎo" },
    { text: "谢谢你", translit: "Xièxiè nǐ" },
    { text: "请问，车站在哪里？", translit: "Qǐngwèn, chēzhàn zài nǎlǐ?" },
    { text: "我在学习中文", translit: "Wǒ zài xuéxí zhōngwén" },
  ],
  korean: [
    { text: "안녕하세요", translit: "Annyeonghaseyo" },
    { text: "감사합니다", translit: "Gamsahamnida" },
    { text: "실례합니다, 역이 어디예요?", translit: "Sillyehamnida, yeogi eodiyeyo?" },
    { text: "저는 한국어를 공부하고 있어요", translit: "Jeoneun hangugeoreul gongbuhago isseoyo" },
  ],
  spanish: [
    { text: "Buenos días, ¿cómo estás?" },
    { text: "¿Dónde está la estación?" },
    { text: "Me gustaría un café, por favor" },
    { text: "¿Cuánto cuesta esto?" },
  ],
  french: [
    { text: "Bonjour, comment allez-vous ?" },
    { text: "Où est la gare ?" },
    { text: "Je voudrais un café, s'il vous plaît" },
    { text: "Combien ça coûte ?" },
  ],
  german: [
    { text: "Guten Morgen, wie geht es dir?" },
    { text: "Wo ist der Bahnhof?" },
    { text: "Ich hätte gerne einen Kaffee, bitte" },
    { text: "Wie viel kostet das?" },
  ],
  italian: [
    { text: "Buongiorno, come stai?" },
    { text: "Dov'è la stazione?" },
    { text: "Vorrei un caffè, per favore" },
    { text: "Quanto costa questo?" },
  ],
  portuguese: [
    { text: "Bom dia, como você está?" },
    { text: "Onde fica a estação?" },
    { text: "Eu gostaria de um café, por favor" },
    { text: "Quanto custa isso?" },
  ],
  russian: [
    { text: "Доброе утро", translit: "Dobroye utro" },
    { text: "Спасибо большое", translit: "Spasibo bolshoye" },
    { text: "Извините, где находится вокзал?", translit: "Izvinite, gde nakhoditsya vokzal?" },
    { text: "Я изучаю русский язык", translit: "Ya izuchayu russkiy yazyk" },
  ],
  arabic: [
    { text: "صباح الخير", translit: "Sabah al-khayr" },
    { text: "شكرا جزيلا", translit: "Shukran jazilan" },
    { text: "عفوا، أين المحطة؟", translit: "Afwan, ayna al-mahatta?" },
    { text: "أنا أتعلم اللغة العربية", translit: "Ana ata'allam al-lugha al-arabiya" },
  ],
  hindi: [
    { text: "नमस्ते, आप कैसे हैं?", translit: "Namaste, aap kaise hain?" },
    { text: "धन्यवाद", translit: "Dhanyavaad" },
    { text: "माफ़ कीजिए, स्टेशन कहाँ है?", translit: "Maaf kijiye, station kahaan hai?" },
    { text: "मैं हिंदी सीख रहा हूँ", translit: "Main Hindi seekh raha hoon" },
  ],
  dutch: [
    { text: "Goedemorgen, hoe gaat het met je?" },
    { text: "Waar is het station?" },
    { text: "Ik wil graag een koffie, alstublieft" },
    { text: "Hoeveel kost dit?" },
  ],
  swedish: [
    { text: "God morgon, hur mår du?" },
    { text: "Var är stationen?" },
    { text: "Jag skulle vilja ha en kaffe, tack" },
    { text: "Hur mycket kostar det här?" },
  ],
  polish: [
    { text: "Dzień dobry, jak się masz?" },
    { text: "Gdzie jest stacja?" },
    { text: "Poproszę kawę" },
    { text: "Ile to kosztuje?" },
  ],
  turkish: [
    { text: "Günaydın, nasılsın?" },
    { text: "İstasyon nerede?" },
    { text: "Bir kahve istiyorum, lütfen" },
    { text: "Bu ne kadar?" },
  ],
  english: [
    { text: "Good morning, how are you?" },
    { text: "Where is the train station?" },
    { text: "I would like a coffee, please" },
    { text: "How much does this cost?" },
  ],
};

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

type Mode = "repeat" | "scenario";
type RecordPhase = "idle" | "recording" | "transcribing" | "result";

/** Strip punctuation across scripts (ASCII, CJK, Arabic, Devanagari) and whitespace
 * before comparing — ASR transcripts rarely match target spacing/punctuation exactly. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,!?;:'"()\-—…、。！？：；「」『』，،؟]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

type PathModule = { topics?: { name: string }[] };
type PathContext = { language: string; level: string; topic: string } | null;

// BCP-47 hints for xAI's Speech-to-Speech ASR. Spanish/Portuguese need a region;
// dutch/swedish/polish aren't in xAI's officially supported list, so they're
// left out here and the session falls back to automatic language detection.
const XAI_LANGUAGE_HINTS: Partial<Record<Language, string>> = {
  japanese: "ja", chinese: "zh", korean: "ko", spanish: "es-ES", french: "fr",
  german: "de", italian: "it", portuguese: "pt-BR", russian: "ru", arabic: "ar-SA",
  hindi: "hi", turkish: "tr", english: "en",
};

function buildScenarioInstructions(scenario: SpeakScenario, language: string, nativeLanguage: string): string {
  return `You are a friendly conversation partner helping a student practice speaking ${language} out loud.

Scenario: ${scenario.situation}
Their task: ${scenario.prompt}

Stay in character for this scenario. Speak only in ${language}, in short natural turns (1-2 sentences), so the student does most of the talking. If they make a mistake, don't lecture — just model the correct form naturally in your reply. Only switch to ${nativeLanguage} if they explicitly ask for help in ${nativeLanguage}. Open by greeting them and setting the scene in one short line, then wait for their response.`;
}

/** Picks the best MediaRecorder mime type this browser supports for a short voice clip. */
function pickRecorderMime(): { mime: string; ext: string } {
  const candidates = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "mp4" },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return { mime: "", ext: "webm" };
}

function SpeakInner() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("repeat");
  const [language, setLanguage] = useState<Language>("japanese");
  const [nativeLanguage, setNativeLanguage] = useState("english");
  const [pathContext, setPathContext] = useState<PathContext>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Repeat mode
  const [phrase, setPhrase] = useState<Phrase>(SAMPLE_PHRASES.japanese[0]);
  const [repeatPhase, setRepeatPhase] = useState<RecordPhase>("idle");
  const [repeatTranscript, setRepeatTranscript] = useState("");
  const [repeatFeedback, setRepeatFeedback] = useState<"correct" | "incorrect" | null>(null);

  // Scenario mode — a live xAI Speech-to-Speech conversation
  const [scenario, setScenario] = useState<SpeakScenario | null>(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [grade, setGrade] = useState<SpeakGrade | null>(null);
  const [gradingLoading, setGradingLoading] = useState(false);
  const voice = useRealtimeVoice();

  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const interimBusyRef = useRef(false);
  const languageRef = useRef<Language>(language);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  // Load active-path context once so Scenario mode can be tailored to it.
  useEffect(() => {
    Promise.allSettled([getCurrentPath(), getPreferences()]).then(async ([pathResult, prefsResult]) => {
      if (prefsResult.status === "fulfilled") setNativeLanguage(prefsResult.value.nativeLanguage);
      if (pathResult.status !== "fulfilled") return;
      const path = pathResult.value as unknown as {
        _id: string;
        language: string;
        startingLevel?: string;
        modules: PathModule[];
      };
      const langKey = path.language?.toLowerCase() as Language;
      if (LANGUAGES.includes(langKey)) setLanguage(langKey);

      const progress = await getProgress(path._id).catch(() => null);
      const topic =
        progress &&
        path.modules[progress.currentModuleIndex]?.topics?.[progress.currentTopicIndex]?.name;

      setPathContext({
        language: path.language,
        level: (path.startingLevel ?? "beginner").replace(/_/g, " "),
        topic: topic ?? "everyday conversation",
      });
    });
  }, []);

  const pickRandomPhrase = useCallback((lang: Language = language) => {
    const phrases = SAMPLE_PHRASES[lang] ?? SAMPLE_PHRASES.japanese;
    setPhrase(phrases[Math.floor(Math.random() * phrases.length)]);
    setRepeatTranscript("");
    setRepeatFeedback(null);
    setRepeatPhase("idle");
  }, [language]);

  const switchLanguage = (lang: Language) => {
    setLanguage(lang);
    pickRandomPhrase(lang);
  };

  const switchMode = (m: Mode) => {
    if (m !== mode && voice.status !== "idle") voice.stop();
    setMode(m);
  };

  const speak = useCallback(
    async (text: string) => {
      setIsSpeaking(true);
      try {
        const blob = await synthesizeSpeech(text, language);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
        };
        await audio.play();
      } catch {
        setIsSpeaking(false);
        toast.error(t("speak.playAudioFailed"));
      }
    },
    [language],
  );

  // ── Shared recorder: chunks feed a growing buffer that's re-transcribed every
  // ~1.5s for a live-captions feel, then the full clip is transcribed once more
  // on stop for the final (more accurate) result. ─────────────────────────────
  const startRecording = useCallback(async (onFinal: (transcript: string) => void) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const { mime, ext } = pickRecorderMime();
      const filename = `speech.${ext}`;
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      interimBusyRef.current = false;
      setInterimTranscript("");

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
        if (chunksRef.current.length >= 2 && !interimBusyRef.current) {
          interimBusyRef.current = true;
          const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
          transcribeSpeech(blob, languageRef.current, filename)
            .then((r) => setInterimTranscript(r.transcript))
            .catch(() => null)
            .finally(() => {
              interimBusyRef.current = false;
            });
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        try {
          const { transcript } = await transcribeSpeech(blob, languageRef.current, filename);
          onFinal(transcript);
        } catch {
          toast.error(t("speak.transcriptionFailed"));
          onFinal("");
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
    } catch (err) {
      if ((err as DOMException)?.name === "NotAllowedError") {
        toast.error(t("speak.micDenied"));
      } else {
        toast.error(t("speak.micAccessFailed"));
      }
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  const handleRepeatMic = () => {
    if (isRecording) {
      stopRecording();
      setRepeatPhase("transcribing");
      return;
    }
    setRepeatTranscript("");
    setRepeatFeedback(null);
    setRepeatPhase("recording");
    startRecording((transcript) => {
      setRepeatTranscript(transcript);
      setRepeatPhase("result");
      setRepeatFeedback(normalize(transcript) === normalize(phrase.text) ? "correct" : "incorrect");
    });
  };

  const loadScenario = useCallback(async () => {
    setScenarioLoading(true);
    setScenario(null);
    setGrade(null);
    try {
      const result = await generateSpeakScenario({
        language: pathContext?.language ?? language,
        level: pathContext?.level ?? "beginner",
        topic: pathContext?.topic ?? "everyday conversation",
        nativeLanguage,
      });
      setScenario(result);
    } catch {
      toast.error(t("speak.scenarioGenFailedToast"));
    } finally {
      setScenarioLoading(false);
    }
  }, [pathContext, language, nativeLanguage]);

  useEffect(() => {
    if (mode === "scenario" && !scenario && !scenarioLoading) loadScenario();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ── Scenario mode: a live xAI Speech-to-Speech conversation ────────────────
  const handleStartConversation = useCallback(async () => {
    if (!scenario) return;
    setGrade(null);
    const targetLanguage = pathContext?.language ?? language;
    try {
      await voice.start({
        instructions: buildScenarioInstructions(scenario, targetLanguage, nativeLanguage),
        languageHint: XAI_LANGUAGE_HINTS[language],
        voice: "eve",
      });
    } catch (err) {
      if ((err as DOMException)?.name === "NotAllowedError") {
        toast.error(t("speak.micDenied"));
      } else {
        toast.error(t("speak.conversationStartFailed"));
      }
    }
  }, [scenario, pathContext, language, nativeLanguage, voice.start]);

  const handleEndConversation = useCallback(async () => {
    const transcript = voice.fullUserTranscript();
    voice.stop();
    if (!scenario || !transcript.trim()) return;
    setGradingLoading(true);
    try {
      const result = await gradeSpeakResponse({
        language: pathContext?.language ?? language,
        situation: scenario.situation,
        prompt: scenario.prompt,
        transcript,
        nativeLanguage,
      });
      setGrade(result);
    } catch {
      toast.error(t("speak.gradingFailed"));
    } finally {
      setGradingLoading(false);
    }
  }, [voice.stop, voice.fullUserTranscript, scenario, pathContext, language, nativeLanguage]);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="px-6 py-8 max-w-3xl mx-auto w-full"
    >
      <motion.h1 variants={itemVariants} className="font-display text-3xl text-foreground mb-2">
        {t("speak.title")}
      </motion.h1>
      <motion.p variants={itemVariants} className="text-muted-foreground mb-6">
        {t("speak.subtitle")}
      </motion.p>

      <motion.div variants={itemVariants} className="flex gap-2 mb-6">
        <button
          onClick={() => switchMode("repeat")}
          className={[
            "px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors",
            mode === "repeat"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <Volume2 size={13} />
          {t("speak.modeRepeat")}
        </button>
        <button
          onClick={() => switchMode("scenario")}
          className={[
            "px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors",
            mode === "scenario"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <MessagesSquare size={13} />
          {t("speak.modeScenario")}
        </button>
      </motion.div>

      {mode === "repeat" && (
        <motion.div variants={itemVariants} className="flex flex-wrap gap-2 mb-6">
          {LANGUAGES.map((lang) => (
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
              {t(`common.languages.${lang}`)}
            </button>
          ))}
        </motion.div>
      )}

      {mode === "repeat" ? (
        <AnimatePresence mode="wait">
          <motion.div
            key={repeatPhase + phrase.text}
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
                    {t("speak.listenAndRepeat")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="text-center py-4">
                    <p className="text-2xl font-medium text-foreground">{phrase.text}</p>
                    {phrase.translit && (
                      <p className="text-sm text-muted-foreground mt-1 italic">{phrase.translit}</p>
                    )}
                  </div>
                  <div className="flex justify-center gap-3">
                    <Button
                      onClick={() => speak(phrase.text)}
                      disabled={isSpeaking || isRecording}
                      variant="outline"
                      size="lg"
                      className="gap-2"
                    >
                      <Volume2 size={18} className={isSpeaking ? "text-accent animate-pulse" : ""} />
                      {isSpeaking ? t("speak.speaking") : t("common.listen")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={itemVariants} className="flex flex-col items-center gap-3">
              <button
                onClick={handleRepeatMic}
                disabled={isSpeaking || repeatPhase === "transcribing"}
                className={[
                  "w-20 h-20 rounded-full flex items-center justify-center transition-all",
                  isRecording
                    ? "bg-red-500/20 text-red-400 scale-110 animate-pulse"
                    : "bg-primary/10 text-primary hover:bg-primary/20 hover:scale-105",
                  "disabled:opacity-30 disabled:cursor-not-allowed",
                ].join(" ")}
              >
                {repeatPhase === "transcribing" ? (
                  <Loader2 size={28} className="animate-spin" />
                ) : isRecording ? (
                  <MicOff size={28} />
                ) : (
                  <Mic size={28} />
                )}
              </button>
              <p className="text-xs text-muted-foreground">
                {isRecording
                  ? (interimTranscript || t("speak.listening"))
                  : repeatPhase === "transcribing"
                    ? t("speak.transcribing")
                    : t("speak.tapToRepeat")}
              </p>
            </motion.div>

            {repeatPhase === "result" && (
              <motion.div variants={itemVariants} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <CardContent className="space-y-3 pt-6">
                    <div
                      className={[
                        "flex items-center gap-2 p-3 rounded-lg",
                        repeatFeedback === "correct"
                          ? "bg-accent/10 text-accent"
                          : "bg-red-500/10 text-red-400",
                      ].join(" ")}
                    >
                      {repeatFeedback === "correct" ? <Check size={16} /> : <X size={16} />}
                      <span className="text-sm">
                        {repeatFeedback === "correct" ? t("speak.perfect") : t("speak.notQuite")}
                      </span>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">{t("speak.youSaid")}</span>
                        <span className="text-foreground">{repeatTranscript || t("speak.nothingHeard")}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t("speak.expected")}</span>
                        <span className="text-accent">{phrase.text}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={() => speak(phrase.text)} variant="outline" size="sm" className="gap-1">
                        <Volume2 size={14} />
                        {t("speak.listenAgain")}
                      </Button>
                      <Button onClick={() => pickRandomPhrase()} variant="outline" size="sm" className="gap-1">
                        <RefreshCw size={14} />
                        {t("speak.newPhrase")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      ) : (
        <div className="space-y-4">
          <motion.div variants={itemVariants} className="text-xs text-muted-foreground">
            {pathContext ? (
              <span>
                {t("speak.practicingWithPath")}{" "}
                <span className="text-foreground capitalize">{pathContext.language}</span>
                {" · "}
                <span className="text-foreground">{pathContext.topic}</span>
              </span>
            ) : (
              <span>
                {t("speak.noPathScenario", { language: t(`common.languages.${language}`) })}
              </span>
            )}
          </motion.div>

          {scenarioLoading ? (
            <Card>
              <CardContent className="py-12 flex items-center justify-center">
                <Loader2 size={22} className="animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : !scenario ? (
            <Card>
              <CardContent className="py-12 flex flex-col items-center justify-center gap-3">
                <p className="text-sm text-muted-foreground">{t("speak.scenarioGenFailed")}</p>
                <Button onClick={loadScenario} variant="outline" size="sm" className="gap-1">
                  <RefreshCw size={14} />
                  {t("speak.tryAgain")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={scenario.situation}
                variants={containerVariants}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <motion.div variants={itemVariants}>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                        <Sparkles size={13} className="text-accent" />
                        {t("speak.modeScenario")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-foreground/90">{scenario.situation}</p>
                      <div className="p-3 rounded-lg bg-secondary/50">
                        <p className="text-sm font-medium text-foreground">{scenario.prompt}</p>
                      </div>
                      <div className="flex justify-center">
                        <Button
                          onClick={() => speak(scenario.sampleResponse)}
                          disabled={isSpeaking || voice.status !== "idle"}
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                        >
                          <Volume2 size={14} className={isSpeaking ? "text-accent animate-pulse" : ""} />
                          {t("speak.hearExample")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {voice.status === "active" && voice.turns.length > 0 && (
                  <motion.div variants={itemVariants}>
                    <Card>
                      <CardContent className="space-y-2 pt-6 max-h-72 overflow-y-auto">
                        {voice.turns.map((t) => (
                          <div key={t.id} className={t.role === "user" ? "text-right" : "text-left"}>
                            <span
                              className={[
                                "inline-block px-3 py-1.5 rounded-lg text-sm max-w-[85%]",
                                t.role === "user"
                                  ? "bg-primary/10 text-foreground"
                                  : "bg-secondary text-foreground",
                              ].join(" ")}
                            >
                              {t.text || "…"}
                            </span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                <motion.div variants={itemVariants} className="flex flex-col items-center gap-3">
                  {voice.status === "active" ? (
                    <>
                      <button
                        onClick={handleEndConversation}
                        className="w-20 h-20 rounded-full flex items-center justify-center transition-all bg-red-500/20 text-red-400 hover:scale-105"
                      >
                        <MicOff size={28} />
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {voice.assistantSpeaking
                          ? t("speak.grokSpeaking")
                          : voice.userSpeaking
                            ? t("speak.voiceListening")
                            : t("speak.conversationActive")}
                      </p>
                    </>
                  ) : voice.status === "connecting" ? (
                    <>
                      <div className="w-20 h-20 rounded-full flex items-center justify-center bg-primary/10 text-primary">
                        <Loader2 size={28} className="animate-spin" />
                      </div>
                      <p className="text-xs text-muted-foreground">{t("speak.connecting")}</p>
                    </>
                  ) : voice.status === "error" ? (
                    <>
                      <p className="text-sm text-muted-foreground">{t("speak.connectFailed")}</p>
                      <Button onClick={handleStartConversation} variant="outline" size="sm" className="gap-1">
                        <RefreshCw size={14} />
                        {t("speak.retry")}
                      </Button>
                    </>
                  ) : gradingLoading ? (
                    <Loader2 size={22} className="animate-spin text-muted-foreground" />
                  ) : !grade ? (
                    <>
                      <button
                        onClick={handleStartConversation}
                        disabled={isSpeaking}
                        className="w-20 h-20 rounded-full flex items-center justify-center transition-all bg-primary/10 text-primary hover:bg-primary/20 hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Mic size={28} />
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {t("speak.tapToStartConversation", { language: pathContext?.language ?? language })}
                      </p>
                    </>
                  ) : null}
                </motion.div>

                {grade && voice.status === "idle" && !gradingLoading && (
                  <motion.div variants={itemVariants} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <Card>
                      <CardContent className="space-y-3 pt-6">
                        <div
                          className={[
                            "flex items-center gap-2 p-3 rounded-lg",
                            grade.correct ? "bg-accent/10 text-accent" : "bg-red-500/10 text-red-400",
                          ].join(" ")}
                        >
                          {grade.correct ? <Check size={16} /> : <X size={16} />}
                          <span className="text-sm">{grade.feedback}</span>
                        </div>

                        {grade.corrected && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">{t("speak.tryInstead")}</span>
                            <span className="text-accent">{grade.corrected}</span>
                          </div>
                        )}

                        <div className="flex gap-2">
                          {grade.corrected && (
                            <Button
                              onClick={() => speak(grade.corrected!)}
                              variant="outline"
                              size="sm"
                              className="gap-1"
                            >
                              <Volume2 size={14} />
                              {t("common.listen")}
                            </Button>
                          )}
                          <Button onClick={loadScenario} variant="outline" size="sm" className="gap-1">
                            <RefreshCw size={14} />
                            {t("speak.newScenario")}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}
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
