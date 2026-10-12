import { useState } from "react";
import { UserRound } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type AccountUser,
  confirmTotpSetup,
  deleteAccount,
  disableTotp,
  getMe,
  logoutAccount,
  startTotpSetup,
} from "@/lib/api";
import { clearSession, getUser, setSession } from "@/lib/auth";
import "@/lib/i18n";

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function AccountCard() {
  const { t } = useTranslation();
  const [user, setUser] = useState<AccountUser | null>(getUser());
  const [secret, setSecret] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmHandle, setConfirmHandle] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const refresh = async () => {
    const fresh = (await getMe()).user;
    setSession(fresh);
    setUser(fresh);
  };

  const guarded = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.error(errorMessage(err, t("account.toastError")));
    } finally {
      setBusy(false);
    }
  };

  const signOut = () =>
    guarded(async () => {
      await logoutAccount();
      clearSession();
      window.location.href = "/";
    });

  const beginTwoFactor = () =>
    guarded(async () => {
      setSecret(await startTotpSetup());
      setCode("");
    });

  const confirmTwoFactor = () =>
    guarded(async () => {
      await confirmTotpSetup(code);
      setSecret(null);
      await refresh();
      toast.success(t("account.toast2faOn"));
    });

  const turnOffTwoFactor = () =>
    guarded(async () => {
      await disableTotp(password);
      setPassword("");
      await refresh();
      toast.success(t("account.toast2faOff"));
    });

  const removeAccount = () =>
    guarded(async () => {
      await deleteAccount({ confirm: confirmHandle, ...(user.hasPassword ? { password } : {}) });
      clearSession();
      toast.success(t("account.toastDeleted"));
      window.location.href = "/";
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <UserRound size={14} className="text-accent" />
          {t("account.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-foreground">{t("account.signedInAs", { handle: user.handle })}</p>
          <Button size="sm" variant="outline" onClick={signOut} disabled={busy}>
            {t("account.signOut")}
          </Button>
        </div>

        {user.hasPassword && (
          <section className="space-y-2" aria-label={t("account.twoFactor")}>
            <h3 className="text-sm font-medium text-foreground">{t("account.twoFactor")}</h3>
            <p className="text-xs text-muted-foreground">
              {user.totpEnabled ? t("account.twoFactorOn") : t("account.twoFactorOff")}
            </p>
            {user.totpEnabled && (
              <p className="text-xs text-muted-foreground">
                {t("account.recoveryLeft", { count: user.recoveryCodesLeft })}
              </p>
            )}

            {!user.totpEnabled && !secret && (
              <Button size="sm" variant="outline" onClick={beginTwoFactor} disabled={busy}>
                {t("account.enableTwoFactor")}
              </Button>
            )}

            {secret && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t("account.secretLabel")}</p>
                <code className="block break-all rounded-md bg-secondary px-3 py-2 text-xs">{secret.secret}</code>
                <div className="flex gap-2">
                  <Input
                    aria-label={t("account.confirmCode")}
                    placeholder={t("account.confirmCode")}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <Button size="sm" onClick={confirmTwoFactor} disabled={busy || !code}>
                    {t("account.confirm")}
                  </Button>
                </div>
              </div>
            )}

            {user.totpEnabled && (
              <div className="flex gap-2">
                <Input
                  type="password"
                  autoComplete="current-password"
                  aria-label={t("account.passwordLabel")}
                  placeholder={t("account.passwordLabel")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button size="sm" variant="outline" onClick={turnOffTwoFactor} disabled={busy || !password}>
                  {t("account.disableTwoFactor")}
                </Button>
              </div>
            )}
          </section>
        )}

        <section className="space-y-2" aria-label={t("account.deleteTitle")}>
          <h3 className="text-sm font-medium text-foreground">{t("account.deleteTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("account.deleteBody")}</p>
          <Input
            aria-label={t("account.deleteConfirm", { handle: user.handle })}
            placeholder={t("account.deleteConfirm", { handle: user.handle })}
            value={confirmHandle}
            onChange={(e) => setConfirmHandle(e.target.value)}
          />
          {user.hasPassword && (
            <Input
              type="password"
              autoComplete="current-password"
              aria-label={t("account.passwordLabel")}
              placeholder={t("account.passwordLabel")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={removeAccount}
            disabled={busy || confirmHandle.trim().toLowerCase() !== user.handle}
          >
            {t("account.deleteButton")}
          </Button>
        </section>
      </CardContent>
    </Card>
  );
}
