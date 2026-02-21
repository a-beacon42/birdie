/**
 * Birdie design system — centralized theme constants.
 */

export const colors = {
    // Brand palette
    primary: "#6A0DAD", // purple
    primaryLight: "#9B59B6",
    accent: "#A8D600", // yellow-green
    accentDark: "#7CB342",

    // UI colors
    background: "#F5F5F0",
    surface: "#FFFFFF",
    surfaceElevated: "#FAFAFA",
    text: "#1A1A2E",
    textSecondary: "#6B7280",
    textMuted: "#9CA3AF",
    border: "#E5E7EB",
    borderFocus: "#6A0DAD",

    // Semantic
    success: "#10B981",
    error: "#EF4444",
    warning: "#F59E0B",
    info: "#3B82F6",

    // Game-specific
    cardFront: "#FFFFFF",
    cardBack: "#FFFFFF",
    correct: "#10B981",
    incorrect: "#EF4444",
    skipped: "#9CA3AF",
} as const;

export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
} as const;

export const radii = {
    sm: 6,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
} as const;

export const typography = {
    h1: { fontSize: 28, fontWeight: "700" as const, lineHeight: 34 },
    h2: { fontSize: 22, fontWeight: "700" as const, lineHeight: 28 },
    h3: { fontSize: 18, fontWeight: "600" as const, lineHeight: 24 },
    body: { fontSize: 16, fontWeight: "400" as const, lineHeight: 22 },
    bodySmall: { fontSize: 14, fontWeight: "400" as const, lineHeight: 20 },
    caption: { fontSize: 12, fontWeight: "400" as const, lineHeight: 16 },
    label: { fontSize: 14, fontWeight: "600" as const, lineHeight: 18 },
} as const;

export const shadows = {
    sm: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    md: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    lg: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
    },
} as const;
