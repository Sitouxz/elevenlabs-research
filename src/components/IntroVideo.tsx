interface IntroVideoProps {
  onComplete: () => void;
}

export function IntroVideo({ onComplete }: IntroVideoProps) {
  return (
    <div className="fixed inset-0 z-[100] bg-midnight">
      <video
        ref={(el) => {
          if (!el) return;
          // Must set muted as a DOM property before play() — React's JSX muted
          // prop is not serialized to the attribute, so browsers block autoplay.
          el.muted = true;
          el.play().catch(() => onComplete());
        }}
        className="w-full h-full object-cover"
        src={`${import.meta.env.BASE_URL}intro.mp4`}
        playsInline
        onEnded={onComplete}
        onError={onComplete}
      />
      <button
        onClick={onComplete}
        className="absolute bottom-6 right-6 px-4 py-2 rounded-full glass-panel text-xs font-mono tracking-widest text-primary/80 hover:text-primary hover:border-primary/40 transition-colors"
      >
        SKIP
      </button>
    </div>
  );
}
