/** Medium logo mark (canvas LogoMark): royal-blue tile + sage dot. */
export function LogoMark({ size = 46 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="11" fill="#3B5BFE" />
      <path
        d="M11 27V13h2.4l4.1 7.6 4.1-7.6h2.4v14h-2.2v-9.5l-3.6 6.6h-1.4l-3.6-6.6V27H11Z"
        fill="#fff"
      />
      <circle cx="29.5" cy="13.5" r="1.8" fill="#7CC4A8" />
    </svg>
  );
}
