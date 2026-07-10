export type ComputeOperation =
  | { task: "age"; birthYear: number; targetYear: number }
  | { task: "count_occurrences"; text: string; substring: string; caseSensitive?: boolean }
  | { task: "count_words"; text: string }
  | { task: "nth_word"; text: string; n: number }
  | { task: "reverse_without_vowels"; text: string }
  | { task: "scramble"; text: string }
  | { task: "swap_chars"; text: string; charA: string; charB: string }
  | { task: "arithmetic"; expression: string };

function safeArithmetic(expression: string): number {
  const sanitized = expression.replace(/\s/g, "");
  if (!/^[\d+\-*/().]+$/.test(sanitized)) {
    throw new Error("Invalid arithmetic expression");
  }
  return new Function(`"use strict"; return (${sanitized});`)() as number;
}

export function compute(operation: ComputeOperation): string {
  try {
    switch (operation.task) {
      case "age": {
        const age = operation.targetYear - operation.birthYear;
        return `A person born in ${operation.birthYear} will be ${age} years old in ${operation.targetYear}.`;
      }
      case "count_occurrences": {
        let text = operation.text;
        let sub = operation.substring;
        if (operation.caseSensitive !== true) {
          text = text.toLowerCase();
          sub = sub.toLowerCase();
        }
        let count = 0;
        if (sub.length === 0) {
          return `The substring is empty, so the count is 0.`;
        }
        for (let i = 0; i <= text.length - sub.length; i++) {
          if (text.slice(i, i + sub.length) === sub) count++;
        }
        return `The substring "${operation.substring}" appears ${count} time${count === 1 ? "" : "s"} in the text.`;
      }
      case "count_words": {
        const words = operation.text.trim().split(/\s+/).filter(Boolean);
        return `The text contains ${words.length} word${words.length === 1 ? "" : "s"}.`;
      }
      case "nth_word": {
        const words = operation.text.trim().split(/\s+/).filter(Boolean);
        const n = operation.n;
        if (n < 1 || n > words.length) {
          return `There is no ${n}th word. The text has ${words.length} word${words.length === 1 ? "" : "s"}.`;
        }
        return `The ${n}th word is "${words[n - 1]}".`;
      }
      case "reverse_without_vowels": {
        const noVowels = operation.text.replace(/[aeiouAEIOU]/g, "");
        const reversed = noVowels.split("").reverse().join("");
        return `Reversed without vowels: "${reversed}".`;
      }
      case "scramble": {
        const chars = operation.text.split("");
        for (let i = chars.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [chars[i], chars[j]] = [chars[j], chars[i]];
        }
        return `Scrambled: "${chars.join("")}".`;
      }
      case "swap_chars": {
        const { text, charA, charB } = operation;
        if (charA.length !== 1 || charB.length !== 1) {
          throw new Error("charA and charB must each be a single character");
        }
        const swapped = text
          .split("")
          .map((ch) => {
            if (ch === charA) return charB;
            if (ch === charB) return charA;
            return ch;
          })
          .join("");
        return `Swapped '${charA}' and '${charB}' in "${text}": "${swapped}".`;
      }
      case "arithmetic": {
        const result = safeArithmetic(operation.expression);
        return `${operation.expression} = ${result}`;
      }
      default:
        return "Unknown compute task.";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Compute error: ${message}`;
  }
}

// ponytail: dev-only sanity check so off-by-one fixes stay fixed
if (import.meta.env.DEV) {
  const checks: { op: ComputeOperation; want: string }[] = [
    { op: { task: "age", birthYear: 1997, targetYear: 2027 }, want: "30" },
    { op: { task: "count_words", text: "one two three four five" }, want: "5" },
    { op: { task: "nth_word", text: "one two three four five", n: 5 }, want: "five" },
    { op: { task: "reverse_without_vowels", text: "informatics" }, want: "sctmrfn" },
    { op: { task: "swap_chars", text: "informatics", charA: "n", charB: "f" }, want: "ifornmatics" },
    { op: { task: "arithmetic", expression: "2027 - 1997" }, want: "30" },
  ];
  for (const { op, want } of checks) {
    const got = compute(op);
    if (!got.includes(want)) {
      console.error("[compute self-check] FAIL", op, got, "expected to include", want);
    }
  }
}
