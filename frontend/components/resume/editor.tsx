"use client";

import CodeMirror from "@uiw/react-codemirror";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

// Colours come from the app's CSS variables, so the editor follows light and dark
const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--background)", color: "var(--foreground)", fontSize: "13px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-geist-mono)", lineHeight: "1.65" },
  ".cm-content": { caretColor: "var(--foreground)", padding: "12px 0" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-gutters": { backgroundColor: "var(--background)", color: "var(--muted-foreground)", border: "none" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 16px", opacity: "0.6" },
  ".cm-activeLine": { backgroundColor: "color-mix(in oklch, var(--muted) 60%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklch, var(--foreground) 18%, transparent) !important",
  },
  ".cm-matchingBracket": { backgroundColor: "var(--accent)", outline: "1px solid var(--border)" },
});

// Greyscale like the rest of the app: commands stand out by weight, comments fade back
const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.tagName], color: "var(--foreground)", fontWeight: "600" },
  { tag: tags.comment, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [tags.bracket, tags.squareBracket], color: "var(--muted-foreground)" },
  { tag: [tags.atom, tags.number, tags.string], color: "color-mix(in oklch, var(--foreground) 75%, transparent)" },
]);

const extensions = [
  StreamLanguage.define(stex),
  syntaxHighlighting(highlight),
  EditorView.lineWrapping,
  // The browser's spellcheck underlines LaTeX commands and names
  EditorView.contentAttributes.of({ spellcheck: "false" }),
  theme,
];

export function Editor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme="none"
      height="100%"
      className="h-full"
      basicSetup={{ foldGutter: false, highlightActiveLineGutter: true, autocompletion: false }}
    />
  );
}
