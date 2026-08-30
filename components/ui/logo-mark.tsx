/** Medium logo mark: circular "m." — ink (or light, on dark backgrounds) circle, blue dot. */
export function LogoMark({
  size = 46,
  variant = 'light',
}: {
  size?: number;
  variant?: 'light' | 'dark';
}) {
  const circleFill = variant === 'dark' ? '#EDEDED' : '#171717';
  const textFill = variant === 'dark' ? '#0A0A0A' : '#FFFFFF';

  return (
    <svg width={size} height={size} viewBox="0 0 220 220" aria-hidden="true">
      <circle cx="110" cy="110" r="100" fill={circleFill} />
      <text
        x="110"
        y="144"
        textAnchor="middle"
        fontFamily="var(--font-manrope), Helvetica, Arial, sans-serif"
        fontWeight={700}
        fontSize="96"
        fill={textFill}
      >
        m<tspan fill="#2E6BFF">.</tspan>
      </text>
    </svg>
  );
}
