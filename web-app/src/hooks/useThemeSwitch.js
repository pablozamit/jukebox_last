import { useRef, useState } from 'react';
import { useTheme } from '../ThemeContext';

export function useThemeSwitch({ t, toast }) {
  const { theme, toggleTheme } = useTheme();
  const [themeSwitching, setThemeSwitching] = useState(false);
  const themeSwitchingRef = useRef(false);

  const handleToggleTheme = () => {
    if (themeSwitchingRef.current) return;
    themeSwitchingRef.current = true;
    setThemeSwitching(true);
    const switchingToClassic = !(theme === 'catrina');
    toggleTheme();
    window.setTimeout(() => {
      const explainerSeen = localStorage.getItem('theme-explainer-seen');
      if (!explainerSeen) {
        localStorage.setItem('theme-explainer-seen', 'true');
        toast(switchingToClassic ? t.themeExplainerClassic : t.themeExplainerNeon, 'info', 6000);
      } else {
        toast(switchingToClassic ? t.themeSwitchedClassic : t.themeSwitchedNeon, 'success');
      }
      themeSwitchingRef.current = false;
      setThemeSwitching(false);
    }, 450);
  };

  return { themeSwitching, handleToggleTheme };
}
