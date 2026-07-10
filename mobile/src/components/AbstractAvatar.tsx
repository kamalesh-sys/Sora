import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Polygon, Rect } from "react-native-svg";

export const abstractAvatarOptions = [
  "fold",
  "orbit",
  "bloom",
  "summit",
  "ripple",
  "weave",
  "prism",
  "dawn",
] as const;

export type AbstractAvatarKey = (typeof abstractAvatarOptions)[number];

const palettes: Record<AbstractAvatarKey, [string, string, string, string]> = {
  bloom: ["#32146F", "#A77BF3", "#F7B2D9", "#FFF0A6"],
  dawn: ["#6D230B", "#F07836", "#FFBE75", "#FFF2D8"],
  fold: ["#062E78", "#0052FF", "#58B7F8", "#F5A623"],
  orbit: ["#0B4A42", "#15A389", "#7CE3C6", "#F6D365"],
  prism: ["#3D125E", "#7C3AED", "#21B8F6", "#FFB347"],
  ripple: ["#172554", "#3157C8", "#7EA6FF", "#DDE8FF"],
  summit: ["#243B2F", "#25845B", "#87D37C", "#F1D36A"],
  weave: ["#4A1D35", "#D14572", "#F49BB8", "#FFD166"],
};

export function AbstractAvatar({ size = 56, variant = "fold" }: { size?: number; variant?: AbstractAvatarKey }) {
  const [base, primary, secondary, accent] = palettes[variant];
  const clipId = `sora-avatar-${variant}`;

  return (
    <Svg accessibilityLabel={`${variant} abstract avatar`} height={size} viewBox="0 0 64 64" width={size}>
      <Defs>
        <ClipPath id={clipId}>
          <Circle cx="32" cy="32" r="32" />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        <Rect fill={base} height="64" width="64" />
        {variant === "fold" ? (
          <>
            <Polygon fill={primary} points="-4,48 30,7 40,39 20,68" />
            <Polygon fill={secondary} points="30,7 70,29 40,39" />
            <Polygon fill={accent} points="40,39 70,29 57,66" />
          </>
        ) : null}
        {variant === "orbit" ? (
          <>
            <Circle cx="32" cy="32" fill={primary} r="13" />
            <Ellipse cx="32" cy="32" fill="none" rx="27" ry="14" stroke={secondary} strokeWidth="6" transform="rotate(-28 32 32)" />
            <Circle cx="53" cy="19" fill={accent} r="6" />
          </>
        ) : null}
        {variant === "bloom" ? (
          <>
            <Ellipse cx="32" cy="16" fill={secondary} rx="10" ry="19" />
            <Ellipse cx="47" cy="33" fill={primary} rx="10" ry="19" transform="rotate(88 47 33)" />
            <Ellipse cx="31" cy="48" fill={secondary} rx="10" ry="19" />
            <Ellipse cx="16" cy="31" fill={primary} rx="10" ry="19" transform="rotate(88 16 31)" />
            <Circle cx="32" cy="32" fill={accent} r="8" />
          </>
        ) : null}
        {variant === "summit" ? (
          <>
            <Polygon fill={secondary} points="-8,61 22,15 38,61" />
            <Polygon fill={primary} points="17,64 45,8 73,64" />
            <Polygon fill={accent} points="37,24 45,8 53,24 46,21" />
          </>
        ) : null}
        {variant === "ripple" ? (
          <>
            <Circle cx="32" cy="32" fill="none" r="27" stroke={secondary} strokeWidth="7" />
            <Circle cx="32" cy="32" fill="none" r="16" stroke={primary} strokeWidth="7" />
            <Circle cx="32" cy="32" fill={accent} r="6" />
          </>
        ) : null}
        {variant === "weave" ? (
          <>
            {[-28, -8, 12, 32, 52].map((x) => (
              <Rect fill={primary} height="96" key={`a-${x}`} transform={`rotate(36 ${x} 32)`} width="9" x={x} y="-16" />
            ))}
            {[-20, 3, 26, 49].map((x) => (
              <Rect fill={secondary} height="96" key={`b-${x}`} opacity="0.9" transform={`rotate(-36 ${x} 32)`} width="7" x={x} y="-16" />
            ))}
            <Circle cx="50" cy="14" fill={accent} r="6" />
          </>
        ) : null}
        {variant === "prism" ? (
          <>
            <Polygon fill={primary} points="32,3 59,52 32,43" />
            <Polygon fill={secondary} points="32,3 32,43 5,52" />
            <Polygon fill={accent} points="5,52 32,43 59,52 32,65" />
          </>
        ) : null}
        {variant === "dawn" ? (
          <>
            <Circle cx="32" cy="30" fill={accent} r="15" />
            <Path d="M-5 47 Q12 32 32 47 T69 47 V68 H-5Z" fill={primary} />
            <Path d="M-5 55 Q14 42 32 55 T69 55 V68 H-5Z" fill={secondary} />
          </>
        ) : null}
      </G>
      <Circle cx="32" cy="32" fill="none" r="31" stroke="rgba(255,255,255,0.44)" strokeWidth="2" />
    </Svg>
  );
}
