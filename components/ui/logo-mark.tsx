/** medium logo mark: circular "m." — blue circle with a black dot on light
 * backgrounds, light circle with a blue dot on dark backgrounds. */
export function LogoMark({
  size = 46,
  variant = 'light',
}: {
  size?: number;
  variant?: 'light' | 'dark';
}) {
  const circleFill = variant === 'dark' ? '#EDEDED' : '#3B5BFE';
  const textFill = variant === 'dark' ? '#0A0A0A' : '#FFFFFF';
  const dotFill = variant === 'dark' ? '#2E6BFF' : '#000000';

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
        m<tspan fill={dotFill}>.</tspan>
      </text>
    </svg>
  );
}
