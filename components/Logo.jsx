// Inline SVG soccer ball — used as the wordmark mark. Inherits color via currentColor.
export default function Logo({ size = 30 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="logo"
    >
      <circle cx="24" cy="24" r="21" fill="currentColor" />
      {/* central pentagon */}
      <path
        d="M24 13l8.6 6.2-3.3 10.1H18.7l-3.3-10.1L24 13z"
        fill="var(--chalk)"
      />
      {/* spokes to the rim */}
      <g stroke="var(--chalk)" strokeWidth="2.2" strokeLinecap="round">
        <line x1="24" y1="13" x2="24" y2="4.5" />
        <line x1="32.6" y1="19.2" x2="40.5" y2="16" />
        <line x1="29.3" y1="29.3" x2="34.5" y2="38" />
        <line x1="18.7" y1="29.3" x2="13.5" y2="38" />
        <line x1="15.4" y1="19.2" x2="7.5" y2="16" />
      </g>
    </svg>
  );
}
