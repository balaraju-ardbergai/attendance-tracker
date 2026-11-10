export const MONOCHROME_THEME_SLUG = "monochrome";

export const BUILT_IN_THEMES = [
  {
    slug: MONOCHROME_THEME_SLUG,
    name: "Monochrome",
    description: "Neutral workspace palette with functional status colors.",
  },
] as const;

export type ThemeSlug = (typeof BUILT_IN_THEMES)[number]["slug"];

export function isThemeSlug(value: unknown): value is ThemeSlug {
  return typeof value === "string" && BUILT_IN_THEMES.some((theme) => theme.slug === value);
}
