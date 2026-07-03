import { useTheme } from 'vuetify';

export function useThemeToggle() {
  const theme = useTheme();

  function toggleTheme(): void {
    theme.global.name.value = theme.global.current.value.dark ? 'light' : 'dark';
  }

  const isDark = () => theme.global.current.value.dark;

  return { toggleTheme, isDark };
}
