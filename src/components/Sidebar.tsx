import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Home, Target, BookOpen, Mic, Library, Settings, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentPath } from "@/lib/api";
import { isLanguagePath, taxonomyOf } from "@/lib/domains";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";

const NAV_ITEMS = [
  { href: "/", icon: Home, labelKey: "sidebar.dashboard", languageOnly: false },
  { href: "/goals", icon: Target, labelKey: "sidebar.goals", languageOnly: false },
  { href: "/learn", icon: BookOpen, labelKey: "sidebar.learn", languageOnly: false },
  { href: "/exercises", icon: History, labelKey: "sidebar.exercises", languageOnly: false },
  { href: "/speak", icon: Mic, labelKey: "sidebar.speak", languageOnly: true },
  { href: "/vocabulary", icon: Library, labelKey: "sidebar.vocabulary", languageOnly: true },
] as const;

interface SidebarProps {
  currentPath: string;
}

export function Sidebar({ currentPath }: SidebarProps) {
  const { t } = useTranslation();
  // Speak and Vocabulary only apply to a language path. Until the active path is
  // known they stay visible, so the nav never flickers items away on load.
  const [languageMode, setLanguageMode] = useState(true);

  useEffect(() => {
    getCurrentPath()
      .then((path) => setLanguageMode(isLanguagePath(taxonomyOf(path as never))))
      .catch(() => setLanguageMode(true));
  }, []);

  const items = NAV_ITEMS.filter((item) => !item.languageOnly || languageMode);

  const isActive = (href: string) =>
    href === "/" ? currentPath === "/" : currentPath.startsWith(href);

  return (
    <motion.aside
      initial={{ x: -64, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="fixed left-0 top-0 h-screen w-16 flex flex-col items-center py-5 bg-card border-r border-border z-50"
    >
      <motion.a
        href="/"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 20 }}
        className="mb-5 flex items-center justify-center w-10 h-10"
        title={t("sidebar.brand")}
      >
        <span className="font-display text-base leading-none text-accent select-none">L!</span>
      </motion.a>

      <nav className="flex flex-col gap-1 w-full px-2 flex-1">
        {items.map(({ href, icon: Icon, labelKey }, i) => (
          <motion.a
            key={href}
            href={href}
            initial={{ x: -16, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.08 + i * 0.05, duration: 0.3, ease: "easeOut" }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.93 }}
            title={t(labelKey)}
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-lg mx-auto transition-colors",
              isActive(href)
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary",
            )}
          >
            <Icon size={18} strokeWidth={1.8} />
          </motion.a>
        ))}
      </nav>

      <div className="w-full px-2 pb-1">
        <motion.a
          href="/settings"
          initial={{ x: -16, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.38, duration: 0.3, ease: "easeOut" }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.93 }}
          title={t("sidebar.settings")}
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-lg mx-auto transition-colors",
            isActive("/settings")
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary",
          )}
        >
          <Settings size={18} strokeWidth={1.8} />
        </motion.a>
      </div>
    </motion.aside>
  );
}
