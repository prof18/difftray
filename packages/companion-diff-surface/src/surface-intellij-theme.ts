import {
  registerCustomTheme,
  type ThemeRegistrationResolved,
  type ThemesType
} from "@pierre/diffs";

import darkThemeJson from "../../../apps/desktop/src/renderer/themes/intellij-islands-dark-theme.json?raw";
import lightThemeJson from "../../../apps/desktop/src/renderer/themes/intellij-islands-light-theme.json?raw";

export const intellijIslandsDarkThemeName = "intellij-idea-islands-dark";
export const intellijIslandsLightThemeName = "intellij-idea-islands-light";

export const intellijIslandsDiffTheme = {
  dark: intellijIslandsDarkThemeName,
  light: intellijIslandsLightThemeName
} as const satisfies ThemesType;

let registered = false;

export function registerIntellijIslandsDiffThemes(): void {
  if (registered) {
    return;
  }

  registered = true;
  registerCustomTheme(intellijIslandsDarkThemeName, () =>
    Promise.resolve(parseTheme(darkThemeJson))
  );
  registerCustomTheme(intellijIslandsLightThemeName, () =>
    Promise.resolve(parseTheme(lightThemeJson))
  );
}

function parseTheme(themeJson: string): ThemeRegistrationResolved {
  return JSON.parse(themeJson) as ThemeRegistrationResolved;
}
