import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StudentAnswer } from "@shared/grading";
import { Latex } from "@/components/blocks/Latex";
import { searchCommands, type MathCommand } from "./mathCatalog";

// For a quantitative path the student needs to WRITE mathematics, not only read
// it. Free-text mathematics is ambiguous for the student and for the grader
// alike; LaTeX is unambiguous for both, and the raw string is what reaches the
// grader, so the model receives an expression rather than an attempt to parse
// `(x+1)/(2x-3)^2` out of prose.
//
// The cost of that is that the student has to write LaTeX, which is why the
// palette and the shortcuts are not decoration: they are what makes the choice
// affordable.

/** The caret position to restore after a programmatic edit. */
type PendingCaret = { at: number } | null;

/** Index just inside the first empty `{}` at or after `from`, if there is one. */
function nextSlot(text: string, from: number): number | null {
  const at = text.indexOf("{}", from);
  if (at !== -1) return at + 1;
  const bracket = text.indexOf("[]", from);
  return bracket !== -1 ? bracket + 1 : null;
}

export function MathInput({
  value,
  onChange,
  onSubmit,
  submitted,
  taxonomy,
}: {
  value: StudentAnswer;
  onChange: (next: StudentAnswer) => void;
  onSubmit: () => void;
  submitted: boolean;
  taxonomy: string[];
}) {
  const { t } = useTranslation();
  const text = value.kind === "text" ? value.value : "";

  const areaRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<PendingCaret>(null);

  // Palette state. `triggerAt` is the index of the `\` or `/` that opened it, so
  // the query is everything typed since, and dismissing can put that character
  // back where it belongs.
  const [triggerAt, setTriggerAt] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const matches = useMemo(
    () => (triggerAt === null ? [] : searchCommands(query, taxonomy)),
    [triggerAt, query, taxonomy],
  );

  useEffect(() => setHighlighted(0), [query]);

  useLayoutEffect(() => {
    const pending = caretRef.current;
    if (pending && areaRef.current) {
      areaRef.current.focus();
      areaRef.current.setSelectionRange(pending.at, pending.at);
      caretRef.current = null;
    }
  });

  const closePalette = (): void => {
    setTriggerAt(null);
    setQuery("");
  };

  const write = (next: string, caretAt: number): void => {
    caretRef.current = { at: caretAt };
    onChange({ kind: "text", value: next });
  };

  /** Insert a template at the caret, landing inside its first argument slot. */
  const insert = (latex: string, replaceFrom?: number): void => {
    const area = areaRef.current;
    const start = replaceFrom ?? area?.selectionStart ?? text.length;
    const end = area?.selectionEnd ?? start;
    const next = text.slice(0, start) + latex + text.slice(Math.max(start, end));
    const slot = nextSlot(next, start);
    write(next, slot ?? start + latex.length);
    closePalette();
  };

  const acceptMatch = (cmd: MathCommand | undefined): void => {
    if (!cmd || triggerAt === null) return;
    // The trigger character and the query are consumed: the template carries its
    // own backslash.
    const tail = text.slice(triggerAt + 1 + query.length);
    const head = text.slice(0, triggerAt);
    const next = head + cmd.latex + tail;
    const slot = nextSlot(next, head.length);
    write(next, slot ?? head.length + cmd.latex.length);
    closePalette();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const next = e.target.value;
    const caret = e.target.selectionStart;
    onChange({ kind: "text", value: next });

    if (triggerAt === null) {
      const typed = next[caret - 1];
      if (typed === "\\" || typed === "/") {
        setTriggerAt(caret - 1);
        setQuery("");
      }
      return;
    }
    if (caret <= triggerAt || next[triggerAt] === undefined) {
      closePalette();
      return;
    }
    const candidate = next.slice(triggerAt + 1, caret);
    // A space ends a command name, so it ends the palette too.
    if (/\s/.test(candidate)) closePalette();
    else setQuery(candidate);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const area = e.currentTarget;
    const caret = area.selectionStart;

    if (triggerAt !== null && matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((h) => (h + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((h) => (h - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab" || (e.key === " " && e.ctrlKey)) {
        e.preventDefault();
        acceptMatch(matches[highlighted]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closePalette();
        return;
      }
    }

    // Tab walks the argument slots of whatever was just inserted.
    if (e.key === "Tab") {
      const slot = nextSlot(text, caret);
      if (slot !== null) {
        e.preventDefault();
        write(text, slot);
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!submitted && text.trim().length > 0) onSubmit();
      return;
    }

    // Auto-brace: `^` and `_` almost always take a group, and typing the braces
    // by hand is where LaTeX stops being worth it.
    if ((e.key === "^" || e.key === "_") && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      insert(`${e.key}{}`);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      const shortcuts: Record<string, string> = {
        f: "\\frac{}{}",
        r: "\\sqrt{}",
        "8": "\\cdot ",
      };
      const template = shortcuts[e.key.toLowerCase()];
      if (template) {
        e.preventDefault();
        insert(template);
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea
          ref={areaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(closePalette, 120)}
          disabled={submitted}
          rows={2}
          spellCheck={false}
          placeholder={t("learn.mathInputPlaceholder")}
          className="w-full p-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary disabled:opacity-50 font-mono text-sm resize-y"
        />

        {triggerAt !== null && matches.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg py-1 max-h-64 overflow-y-auto">
            {matches.map((cmd, i) => (
              <button
                key={cmd.id}
                onMouseDown={(e) => { e.preventDefault(); acceptMatch(cmd); }}
                onMouseEnter={() => setHighlighted(i)}
                className={[
                  "w-full text-left px-3 py-1.5 flex items-center gap-3 text-sm transition-colors",
                  i === highlighted ? "bg-secondary" : "hover:bg-secondary/50",
                ].join(" ")}
              >
                <span className="w-16 shrink-0 text-foreground">
                  <Latex value={cmd.preview} />
                </span>
                <span className="flex-1 text-muted-foreground truncate">{cmd.label}</span>
                {cmd.shortcut && (
                  <kbd className="text-[10px] text-muted-foreground/70 border border-border rounded px-1 py-0.5">
                    {cmd.shortcut}
                  </kbd>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-10 flex items-center justify-center px-3 py-2 rounded-lg border border-dashed border-border bg-secondary/20">
        {text.trim() ? (
          <Latex value={text} display />
        ) : (
          <span className="text-xs text-muted-foreground">{t("learn.mathInputHint")}</span>
        )}
      </div>
    </div>
  );
}
