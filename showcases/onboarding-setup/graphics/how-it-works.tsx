export default function HowItWorks() {
  const box = {
    background: "var(--card)",
    border: "2px solid var(--border, rgba(255,255,255,0.15))",
    borderRadius: "0.6em",
    padding: "0.7em 0.9em",
    color: "var(--foreground)",
  } as const;
  const label = { fontSize: "0.75em", opacity: 0.7, marginBottom: "0.3em" } as const;

  return (
    <div style={{ width: "100%", height: "100%", containerType: "size" } as any}>
      <style>{`
        @keyframes hiw-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .hiw { animation: hiw-in 0.6s ease-out both; }
        .hiw-row { display: flex; align-items: center; justify-content: center; gap: 1em;
                   width: 100%; height: 100%; padding: 1em; box-sizing: border-box;
                   font-size: min(3.2cqw, 6cqh); }
        .hiw-yaml { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8em;
                    line-height: 1.5; white-space: nowrap; }
        .hiw-arrow { font-size: 1.6em; color: var(--primary); }
        .hiw-arrow::before { content: "→"; }
        .hiw-right { display: flex; flex-direction: column; gap: 0.6em; width: 14em; }
        .hiw-pair { display: flex; gap: 0.6em; }
        @container (max-aspect-ratio: 1/1) {
          .hiw-row { flex-direction: column; gap: 0.6em; font-size: min(5.5cqw, 3.4cqh); }
          .hiw-arrow::before { content: "↓"; }
        }
      `}</style>

      <div className="hiw-row">
        <div className="hiw hiw-yaml" style={{ ...box, animationDelay: "0s" }}>
          <div style={label}>onboarding.yaml</div>
          <div>- id: jdk</div>
          <div>&nbsp;&nbsp;title: Java 21</div>
          <div>&nbsp;&nbsp;<span style={{ color: "var(--primary)" }}>check:</span> which java</div>
          <div>&nbsp;&nbsp;<span style={{ color: "var(--primary)" }}>fix:</span> mise install java</div>
          <div style={{ opacity: 0.6 }}>- id: bats …</div>
          <div style={{ opacity: 0.6 }}>- id: oracle …</div>
        </div>

        <div className="hiw hiw-arrow" style={{ animationDelay: "0.4s" }} />

        <div className="hiw hiw-right" style={{ animationDelay: "0.8s" }}>
          <div style={{ ...box, textAlign: "center" }}>
            <div style={label}>for each step</div>
            Run the <b>check</b>
          </div>
          <div className="hiw-pair">
            <div style={{ ...box, flex: 1, textAlign: "center" }}>
              <div style={label}>passes</div>
              <span style={{ color: "#3fb950", fontWeight: 700 }}>✓ Ready</span>
            </div>
            <div style={{ ...box, flex: 1, textAlign: "center" }}>
              <div style={label}>fails</div>
              Run the <b>fix</b>,<br />then check again
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
