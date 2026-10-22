export default function Recap() {
  const steps = [
    { n: "1", name: "Draft", text: "An agent reads the repo and writes onboarding.yaml." },
    { n: "2", name: "Run", text: "The extension checks each step and fixes the ones that fail." },
    { n: "3", name: "Troubleshoot", text: "An agent repairs what the fix couldn't, and adds notes for next time." },
  ];

  return (
    <div style={{ width: "100%", height: "100%", containerType: "size" } as any}>
      <style>{`
        @keyframes rc-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .rc { animation: rc-in 0.6s ease-out both; }
        .rc-row { display: flex; align-items: stretch; justify-content: center; gap: 0.8em;
                  width: 100%; height: 100%; padding: 1em; box-sizing: border-box;
                  font-size: min(2.8cqw, 6cqh); }
        .rc-card { flex: 1; max-width: 13em; display: flex; flex-direction: column; gap: 0.5em;
                   background: var(--card); color: var(--foreground);
                   border: 2px solid var(--border, rgba(255,255,255,0.15));
                   border-radius: 0.6em; padding: 0.9em 1em; align-self: center; }
        .rc-head { display: flex; align-items: center; gap: 0.5em; font-weight: 700; font-size: 1.15em; }
        .rc-num { display: inline-flex; align-items: center; justify-content: center;
                  width: 1.6em; height: 1.6em; border-radius: 50%;
                  background: var(--primary); color: var(--background, #000); font-size: 0.85em; }
        .rc-text { opacity: 0.85; line-height: 1.4; }
        .rc-arrow { align-self: center; font-size: 1.6em; color: var(--primary); }
        .rc-arrow::before { content: "→"; }
        @container (max-aspect-ratio: 1/1) {
          .rc-row { flex-direction: column; align-items: center; gap: 0.5em; font-size: min(5.5cqw, 3.4cqh); }
          .rc-card { width: 100%; max-width: 16em; align-self: center; }
          .rc-arrow::before { content: "↓"; }
        }
      `}</style>

      <div className="rc-row">
        {steps.flatMap((s, i) => [
          ...(i > 0 ? [<div key={`a${i}`} className="rc rc-arrow" style={{ animationDelay: `${i * 0.5 - 0.25}s` }} />] : []),
          <div key={s.n} className="rc rc-card" style={{ animationDelay: `${i * 0.5}s` }}>
            <div className="rc-head">
              <span className="rc-num">{s.n}</span>
              {s.name}
            </div>
            <div className="rc-text">{s.text}</div>
          </div>,
        ])}
      </div>
    </div>
  );
}
