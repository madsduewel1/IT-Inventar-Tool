export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        'on-primary': 'var(--on-primary)',
        'primary-container': 'var(--primary-container)',
        'on-primary-container': 'var(--on-primary-container)',
        
        secondary: 'var(--secondary)',
        'on-secondary': 'var(--on-secondary)',
        'secondary-container': 'var(--secondary-container)',
        'on-secondary-container': 'var(--on-secondary-container)',

        tertiary: 'var(--tertiary)',
        'on-tertiary': 'var(--on-tertiary)',
        'tertiary-container': 'var(--tertiary-container)',
        'on-tertiary-container': 'var(--on-tertiary-container)',

        error: 'var(--error)',
        'on-error': 'var(--on-error)',
        'error-container': 'var(--error-container)',
        'on-error-container': 'var(--on-error-container)',

        background: 'var(--background)',
        'on-background': 'var(--on-background)',
        
        surface: 'var(--surface)',
        'on-surface': 'var(--on-surface)',
        'surface-variant': 'var(--surface-variant)',
        'on-surface-variant': 'var(--on-surface-variant)',
        
        outline: 'var(--outline)',
        'outline-variant': 'var(--outline-variant)',
        
        'surface-container-lowest': 'var(--surface-container-lowest)',
        'surface-container-low': 'var(--surface-container-low)',
        'surface-container': 'var(--surface-container)',
        'surface-container-high': 'var(--surface-container-high)',
        'surface-container-highest': 'var(--surface-container-highest)',
        
        'surface-dim': 'var(--surface-dim)',
        'surface-bright': 'var(--surface-bright)',
        'surface-tint': 'var(--surface-tint)',

        'inverse-surface': 'var(--inverse-surface)',
        'inverse-on-surface': 'var(--inverse-on-surface)',
        'inverse-primary': 'var(--inverse-primary)',

        'primary-fixed': 'var(--primary-fixed)',
        'primary-fixed-dim': 'var(--primary-fixed-dim)',
        'on-primary-fixed': 'var(--on-primary-fixed)',
        'on-primary-fixed-variant': 'var(--on-primary-fixed-variant)',
        
        'secondary-fixed': 'var(--secondary-fixed)',
        'secondary-fixed-dim': 'var(--secondary-fixed-dim)',
        'on-secondary-fixed': 'var(--on-secondary-fixed)',
        'on-secondary-fixed-variant': 'var(--on-secondary-fixed-variant)',

        'tertiary-fixed': 'var(--tertiary-fixed)',
        'tertiary-fixed-dim': 'var(--tertiary-fixed-dim)',
        'on-tertiary-fixed': 'var(--on-tertiary-fixed)',
        'on-tertiary-fixed-variant': 'var(--on-tertiary-fixed-variant)',

        'bg-badge-blue': 'var(--bg-badge-blue)',
        'text-badge-blue': 'var(--text-badge-blue)',
        'bg-badge-green': 'var(--bg-badge-green)',
        'text-badge-green': 'var(--text-badge-green)',
        'bg-badge-orange': 'var(--bg-badge-orange)',
        'text-badge-orange': 'var(--text-badge-orange)',
        'bg-badge-red': 'var(--bg-badge-red)',
        'text-badge-red': 'var(--text-badge-red)',
        'bg-badge-yellow': 'var(--bg-badge-yellow)',
        'text-badge-yellow': 'var(--text-badge-yellow)',
        'bg-badge-violet': 'var(--bg-badge-violet)',
        'text-badge-violet': 'var(--text-badge-violet)',

        'header-btn': 'var(--bg-header-btn)',
        'header-btn-hover': 'var(--bg-header-btn-hover)',
        'sidebar-item-hover': 'var(--bg-sidebar-item-hover)',
        'sidebar-item-active': 'var(--bg-sidebar-item-active)'
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        sm: '0.125rem',
        md: '0.25rem',
        lg: '0.25rem',
        xl: '0.375rem',
        '2xl': '0.625rem',
      },
      spacing: {
        sidebar_collapsed: '64px',
        table_cell_padding: '12px 16px',
        container_gap: '24px',
        sidebar_width: '240px',
        grid_gutter: '16px'
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        'label-caps': ['Inter', 'sans-serif'],
        'display-lg': ['Inter', 'sans-serif'],
        'body-sm': ['Inter', 'sans-serif'],
        'mono-data': ['JetBrains Mono', 'monospace'],
        'headline-md': ['Inter', 'sans-serif'],
        'title-sm': ['Inter', 'sans-serif'],
        'body-md': ['Inter', 'sans-serif']
      },
      fontSize: {
        'label-caps': ['11px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '700' }],
        'display-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '600' }],
        'body-sm': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'mono-data': ['13px', { lineHeight: '20px', fontWeight: '400' }],
        'headline-md': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'title-sm': ['18px', { lineHeight: '28px', fontWeight: '500' }],
        'body-md': ['14px', { lineHeight: '20px', fontWeight: '400' }]
      }
    }
  },
  plugins: []
};
