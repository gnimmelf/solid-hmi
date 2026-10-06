export const ThemeNames = ["day", "dusk", "night", "bright"] as const;

export type ThemeName = (typeof ThemeNames)[number];

export const THEME_CHANGE_EVENT = "obc-theme-change";

export function getTheme(): ThemeName {
  const theme = document.documentElement.getAttribute("data-obc-theme");
  return ThemeNames.includes(theme as ThemeName) ? (theme as ThemeName) : "day";
}

export function setTheme(theme: ThemeName, notify = true) {
  document.documentElement.setAttribute("data-obc-theme", theme);
  if (notify) {
    window.dispatchEvent(
      new CustomEvent<ThemeName>(THEME_CHANGE_EVENT, { detail: theme }),
    );
  }
}