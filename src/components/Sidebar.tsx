import { motion } from "motion/react";
import { Home, Target, BookOpen, Mic, Library, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", icon: Home, label: "Dashboard" },
  { href: "/goals", icon: Target, label: "Goals" },
  { href: "/learn", icon: BookOpen, label: "Learn" },
  { href: "/speak", icon: Mic, label: "Speak" },
  { href: "/vocabulary", icon: Library, label: "Vocabulary" },
] as const;

interface SidebarProps {
  currentPath: string;
}

export function Sidebar({ currentPath }: SidebarProps) {
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
        title="LearnIt!"
      >
        <span className="font-display text-base leading-none text-accent select-none">L!</span>
      </motion.a>

      <nav className="flex flex-col gap-1 w-full px-2 flex-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label }, i) => (
          <motion.a
            key={href}
            href={href}
            initial={{ x: -16, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.08 + i * 0.05, duration: 0.3, ease: "easeOut" }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.93 }}
            title={label}
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
          title="Settings"
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
