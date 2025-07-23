"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      className="fixed top-6 right-6 z-50 w-10 h-10 p-0 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 hover:bg-accent/50 transition-all duration-300 hover:scale-110"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5 text-amber-500 hover:text-amber-400 transition-colors duration-200" />
      ) : (
        <Moon className="h-5 w-5 text-blue-600 hover:text-blue-500 transition-colors duration-200" />
      )}
    </Button>
  );
}
