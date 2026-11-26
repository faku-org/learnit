import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { isAuthenticated, loadSession } from "@/lib/auth";
import { LoginModal } from "@/components/LoginModal";

type Props = {
  children: React.ReactNode;
};

export function AuthGuard({ children }: Props) {
  const [authed, setAuthed] = useState<boolean | null>(isAuthenticated() ? true : null);

  useEffect(() => {
    let alive = true;
    // Already known on this page: nothing to ask, nothing to flash.
    loadSession().then((user) => {
      if (alive) setAuthed(user !== null);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (authed === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-accent" size={28} />
      </div>
    );
  }

  if (!authed) {
    return <LoginModal onSignedIn={() => setAuthed(true)} />;
  }

  return <>{children}</>;
}
