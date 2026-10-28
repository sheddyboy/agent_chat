import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";

// WMO weather code to an icon, by the ranges Open-Meteo documents
const ICONS: [number, LucideIcon][] = [
  [0, Sun],
  [2, CloudSun],
  [3, Cloud],
  [48, CloudFog],
  [57, CloudDrizzle],
  [67, CloudRain],
  [77, CloudSnow],
  [82, CloudRain],
  [86, CloudSnow],
  [99, CloudLightning],
];

export function SkyIcon({ code, night, className }: { code: number; night?: boolean; className?: string }) {
  const Icon = (ICONS.find(([max]) => code <= max) ?? ICONS[ICONS.length - 1])[1];
  // Clear and partly cloudy skies show the moon after dark
  if (night && Icon === Sun) return <Moon className={className} />;
  if (night && Icon === CloudSun) return <CloudMoon className={className} />;
  return <Icon className={className} />;
}
