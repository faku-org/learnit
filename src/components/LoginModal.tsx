import { motion } from "motion/react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

const API = `http://localhost:${import.meta.env.PUBLIC_API_PORT ?? 3001}`;

export function LoginModal() {
  const handleGoogleLogin = () => {
    window.location.href = `${API}/api/auth/google`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-sm px-6"
      >
        <div className="flex flex-col items-center gap-8">
          <div className="flex items-center gap-2.5">
            <BookOpen size={28} className="text-accent" />
            <span className="font-display text-2xl text-foreground">LearnIt!</span>
          </div>

          <div className="w-full space-y-3 text-center">
            <h2 className="text-lg font-semibold text-foreground">Sign in to continue</h2>
            <p className="text-sm text-muted-foreground">
              Your progress and exercises are saved to your account.
            </p>

            <Button
              onClick={handleGoogleLogin}
              variant="outline"
              className="w-full gap-3 h-11 mt-2"
            >
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
              Continue with Google
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
