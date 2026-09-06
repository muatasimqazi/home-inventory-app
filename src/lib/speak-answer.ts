"use client";

// Shared by every Ask surface that offers voice input (ask-fab.tsx,
// finance-ai-card.tsx) — docs/Voice Input Addendum.md §3: plays an
// answer back only when the question that produced it came in by voice,
// never for a typed question. Fire-and-forget; a playback failure isn't
// worth surfacing as an error toast on top of an answer the user can
// already read on screen.
export function speakAnswer(text: string): void {
  (async () => {
    try {
      const res = await fetch("/api/v1/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
      await audio.play();
    } catch (error) {
      console.error("speakAnswer: couldn't play the spoken answer:", error);
    }
  })();
}
