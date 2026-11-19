/**
 * EV OS Design Tokens
 * 
 * Strict solid color palette, neutral greys, one brand accent,
 * status colours, spacing scale, radius, subtle shadows, and Poppins font scale.
 * No gradients, no emojis, no decorative clutter.
 */

export const tokens = {
  colors: {
    // Neutral greys
    neutral: {
      0: '#FFFFFF',
      50: '#FAFAF8',
      100: '#F7F7F5',
      200: '#E8E8E5',
      300: '#D4D4CE',
      400: '#A3A39E',
      500: '#737373',
      600: '#525252',
      700: '#3F3F46',
      800: '#27272A',
      900: '#18181B',
    },
    // Brand
    brand: {
      primary: '#0B3D2B',       // Primary Forest Green
      primaryHover: '#082E20',
      primaryActive: '#06241A',
      accent: '#10B981',        // Electric Emerald Accent
      accentHover: '#0EA372',
      accentLight: '#E8F8F0',
    },
    // Clear functional status colors
    status: {
      success: {
        text: '#166534',
        bg: '#F0FDF4',
        border: '#BBF7D0',
        solid: '#16A34A',
      },
      warning: {
        text: '#92400E',
        bg: '#FFFBEB',
        border: '#FDE68A',
        solid: '#D97706',
      },
      danger: {
        text: '#991B1B',
        bg: '#FEF2F2',
        border: '#FECACA',
        solid: '#DC2626',
      },
      info: {
        text: '#1E40AF',
        bg: '#EFF6FF',
        border: '#BFDBFE',
        solid: '#2563EB',
      },
      neutral: {
        text: '#525252',
        bg: '#F7F7F5',
        border: '#E8E8E5',
        solid: '#737373',
      },
    },
  },
  spacing: {
    0: '0px',
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
    16: '64px',
  },
  radius: {
    none: '0px',
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
    full: '9999px',
  },
  shadow: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.03)',
  },
  typography: {
    fontFamily: "var(--font-poppins), 'Poppins', sans-serif",
    fontSize: {
      xs: '11px',
      sm: '12px',
      base: '13px',
      md: '14px',
      lg: '16px',
      xl: '18px',
      '2xl': '20px',
      '3xl': '24px',
      '4xl': '30px',
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.4,
      relaxed: 1.6,
    },
  },
} as const;

export type DesignTokens = typeof tokens;
