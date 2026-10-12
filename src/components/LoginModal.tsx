import { useState } from "react";
import { motion } from "motion/react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import {
  loginAccount,
  recoverAccount,
  registerAccount,
  verifyTotpCode,
  type AccountUser,
} from "@/lib/api";
import { setSession } from "@/lib/auth";
import "@/lib/i18n";

type Mode = "login" | "register" | "totp" | "recover" | "codes";

type Props = {
  onSignedIn?: () => void;
};

const GOOGLE_URL = "/api/auth/google";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function LoginModal({ onSignedIn }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("login");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enter = (user: AccountUser) => {
    setSession(user);
    onSignedIn?.();
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.genericError"));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (mode === "login") {
        const result = await loginAccount({ handle, password });
        if (result.status === "totp_required") {
          setCode("");
          setMode("totp");
        } else {
          enter(result.user);
        }
      } else if (mode === "register") {
        const result = await registerAccount({ handle, displayName: displayName || handle, password });
        setSession(result.user);
        setRecoveryCodes(result.recoveryCodes);
        setMode("codes");
      } else if (mode === "totp") {
        enter((await verifyTotpCode(code)).user);
      } else if (mode === "recover") {
        enter((await recoverAccount({ handle, code })).user);
      }
    });
  };

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
    setCode("");
  };

  const title =
    mode === "register"
      ? t("auth.registerTitle")
      : mode === "totp"
        ? t("auth.totpTitle")
        : mode === "recover"
          ? t("auth.recoverTitle")
          : mode === "codes"
            ? t("auth.codesTitle")
            : t("auth.signInTitle");

  const body =
    mode === "register"
      ? t("auth.registerBody")
      : mode === "totp"
        ? t("auth.totpBody")
        : mode === "recover"
          ? t("auth.recoverBody")
          : mode === "codes"
            ? t("auth.codesBody")
            : t("auth.signInBody");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-sm px-6 py-8"
      >
        <div className="flex flex-col items-center gap-8">
          <div className="flex items-center gap-2.5">
            <BookOpen size={28} className="text-accent" />
            <span className="font-display text-2xl text-foreground">{t("sidebar.brand")}</span>
          </div>

          <div className="w-full space-y-3 text-center">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{body}</p>

            {mode === "codes" ? (
              <div className="space-y-4 text-left">
                <ul
                  aria-label={t("auth.codesTitle")}
                  className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-secondary p-3 font-mono text-sm text-foreground"
                >
                  {recoveryCodes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <Button className="w-full h-11" onClick={() => onSignedIn?.()}>
                  {t("auth.codesSaved")}
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3 text-left" noValidate>
                {mode !== "totp" && (
                  <label className="block text-xs text-muted-foreground">
                    {t("auth.handle")}
                    <Input
                      className="mt-1"
                      autoComplete="username"
                      autoCapitalize="none"
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      required
                    />
                  </label>
                )}
                {mode === "register" && (
                  <label className="block text-xs text-muted-foreground">
                    {t("auth.displayName")}
                    <Input
                      className="mt-1"
                      autoComplete="name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </label>
                )}
                {(mode === "login" || mode === "register") && (
                  <label className="block text-xs text-muted-foreground">
                    {t("auth.password")}
                    <Input
                      className="mt-1"
                      type="password"
                      autoComplete={mode === "register" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    {mode === "register" && (
                      <span className="mt-1 block">{t("auth.passwordHint")}</span>
                    )}
                  </label>
                )}
                {(mode === "totp" || mode === "recover") && (
                  <label className="block text-xs text-muted-foreground">
                    {mode === "totp" ? t("auth.totpCode") : t("auth.recoveryCode")}
                    <Input
                      className="mt-1"
                      inputMode={mode === "totp" ? "numeric" : "text"}
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      required
                    />
                  </label>
                )}

                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full h-11" disabled={busy}>
                  {mode === "register"
                    ? t("auth.createAccount")
                    : mode === "login"
                      ? t("auth.signIn")
                      : t("auth.continue")}
                </Button>

                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {mode !== "login" && (
                    <button type="button" className="underline" onClick={() => switchTo("login")}>
                      {t("auth.haveAccount")}
                    </button>
                  )}
                  {mode === "login" && (
                    <button type="button" className="underline" onClick={() => switchTo("register")}>
                      {t("auth.noAccount")}
                    </button>
                  )}
                  {(mode === "login" || mode === "totp") && (
                    <button type="button" className="underline" onClick={() => switchTo("recover")}>
                      {t("auth.useRecoveryCode")}
                    </button>
                  )}
                </div>
              </form>
            )}

            {(mode === "login" || mode === "register") && (
              <Button asChild variant="outline" className="w-full gap-3 h-11 mt-2">
                <a href={GOOGLE_URL}>
                  <GoogleIcon />
                  {t("auth.continueWithGoogle")}
                </a>
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
