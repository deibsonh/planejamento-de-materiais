'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { darkThemeQuery, themeStorageKey, type Theme } from './theme';

export function ThemeToggle({className=''}:{className?:string}) {
  const [theme,setTheme] = useState<Theme>('light');

  useEffect(()=>{
    const root = document.documentElement;
    const media = window.matchMedia(darkThemeQuery);
    const followSystem = () => {
      if (root.dataset.themePreference) return;
      const next = media.matches ? 'dark' : 'light';
      root.dataset.theme = next;
      setTheme(next);
    };
    if (root.dataset.themePreference) setTheme(root.dataset.theme === 'dark' ? 'dark' : 'light');
    else followSystem();
    media.addEventListener('change',followSystem);
    return ()=>media.removeEventListener('change',followSystem);
  },[]);

  function toggleTheme() {
    const root = document.documentElement;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    root.dataset.themePreference = next;
    setTheme(next);
    try { window.localStorage.setItem(themeStorageKey,next); } catch {}
  }

  const dark = theme === 'dark';
  return <button type="button" className={`icon-button theme-toggle ${className}`} aria-label="Tema escuro"
    aria-pressed={dark} title={dark ? 'Ativar tema claro' : 'Ativar tema escuro'} onClick={toggleTheme}>
    {dark ? <Sun size={19} aria-hidden="true"/> : <Moon size={19} aria-hidden="true"/>}
  </button>;
}
