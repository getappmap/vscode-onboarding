export default function OnboardingIcon() {
  // The extension's icon (media/onboarding.svg in the repo): a clipboard with a checked list.
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg
        viewBox="0 0 24 24"
        style={{ width: "100%", height: "100%" }}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V3h6v1" />
        <path d="M8 10l1.5 1.5L12 9" />
        <path d="M14 10.5h2" />
        <path d="M8 15.5l1.5 1.5L12 14.5" />
        <path d="M14 16h2" />
      </svg>
    </div>
  );
}
