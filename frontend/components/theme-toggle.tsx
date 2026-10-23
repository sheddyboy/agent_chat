"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// Flips the .dark class on <html>; layout.tsx reapplies the saved choice before paint
export function ThemeToggle({ labelClass = "" }: { labelClass?: string }) {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      title="Toggle theme"
      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
    >
      {dark ? <Sun className="size-4 shrink-0" /> : <Moon className="size-4 shrink-0" />}
      <span className={labelClass}>{dark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
