/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 主色调 - 科技感的紫色系
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
        },
        // 强调色 - 青色，用于交互
        accent: {
          400: '#22d3ee',
          500: '#06b6d4',
        },
        // 状态色
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        // 自定义深色背景（基于 slate）
        surface: {
          DEFAULT: '#0f1014',
          soft: '#13141b',
          card: '#1a1c24',
        },
      },
      fontSize: {
        // 字号规范 - 基于 16px 基准
        'xs': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0.01em' }],
        'base': ['1rem', { lineHeight: '1.5rem', letterSpacing: '0' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.02em' }],
        '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.03em' }],
      },
      spacing: {
        // 8px 网格规范 - 已默认使用
      },
      borderRadius: {
        'lg': '0.625rem',
        'xl': '0.875rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        // 轻阴影 - 现代极简
        'soft': '0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.15)',
        'card': '0 2px 8px rgba(0, 0, 0, 0.2)',
        'glow-violet': '0 0 20px rgba(139, 92, 246, 0.15)',
      },
      transitionTimingFunction: {
        'soft': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
