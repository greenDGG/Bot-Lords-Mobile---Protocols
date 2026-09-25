import React from 'react';

export const colors = {
  bg: '#0d1117',
  surface: '#161b22',
  border: '#30363d',
  text: '#c9d1d9',
  textSecondary: '#8b949e',
  primary: '#58a6ff',
  success: '#3fb950',
  warning: '#d29922',
  danger: '#f85149',
  accent: '#bc8cff',
};

export const cssVars = {
  '--bg': colors.bg,
  '--surface': colors.surface,
  '--border': colors.border,
  '--text': colors.text,
  '--text-secondary': colors.textSecondary,
  '--primary': colors.primary,
  '--success': colors.success,
  '--warning': colors.warning,
  '--danger': colors.danger,
};

export function GlobalStyles() {
  return React.createElement('style', {}, `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0d1117;
  color: #c9d1d9;
  line-height: 1.5;
}
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: #0d1117; }
::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
input, select, textarea {
  background: #0d1117;
  border: 1px solid #30363d;
  color: #c9d1d9;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 14px;
}
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: #58a6ff;
}
button {
  background: #161b22;
  border: 1px solid #30363d;
  color: #c9d1d9;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}
button:hover { background: #21262d; }
button.primary { background: #1f6feb; border-color: #1f6feb; color: #fff; }
button.primary:hover { background: #388bfd; }
button.danger { color: #f85149; border-color: #f85149; }
button.danger:hover { background: rgba(248,81,73,0.1); }
`);
}
