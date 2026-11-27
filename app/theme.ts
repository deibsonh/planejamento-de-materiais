export const themeStorageKey = 'romagnole-theme';
export const darkThemeQuery = '(prefers-color-scheme: dark)';
export type Theme = 'light' | 'dark';

export const initializeTheme = `(() => {
  const root = document.documentElement;
  let preference;
  try { preference = localStorage.getItem(${JSON.stringify(themeStorageKey)}); } catch {}
  if (preference === 'light' || preference === 'dark') {
    root.dataset.themePreference = preference;
    root.dataset.theme = preference;
  } else {
    root.dataset.theme = matchMedia(${JSON.stringify(darkThemeQuery)}).matches ? 'dark' : 'light';
  }
})();`;
