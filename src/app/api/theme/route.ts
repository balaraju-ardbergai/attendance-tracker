import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { BUILT_IN_THEMES, isThemeSlug, MONOCHROME_THEME_SLUG } from "@/lib/themes";

const builtInThemeList = () => BUILT_IN_THEMES.map((theme) => ({ id: theme.slug, ...theme }));

export async function GET() {
  return handleRoute(async () => {
    const { user } = await requireActiveUser();
    const savedThemes = await prisma.portalTheme.findMany({
      where: { isActive: true, slug: { in: BUILT_IN_THEMES.map((theme) => theme.slug) } },
      select: { id: true, slug: true, name: true, description: true },
      orderBy: { name: "asc" },
    });
    const themes = savedThemes.length ? savedThemes : builtInThemeList();

    return ok({
      activeTheme: user.themeId && themes.some((theme) => theme.id === user.themeId)
        ? themes.find((theme) => theme.id === user.themeId)?.slug
        : MONOCHROME_THEME_SLUG,
      themes,
    });
  });
}

export async function PATCH(req: Request) {
  return handleRoute(async () => {
    const { user } = await requireActiveUser();
    const body = await readJson<{ theme: unknown }>(req);
    if (!isThemeSlug(body.theme)) throw new ApiError(400, "Unknown theme.");

    const themeDefinition = BUILT_IN_THEMES.find((theme) => theme.slug === body.theme)!;
    const theme = await prisma.portalTheme.upsert({
      where: { slug: body.theme },
      update: { ...themeDefinition, isBuiltIn: true, isActive: true },
      create: { ...themeDefinition, isBuiltIn: true, isActive: true },
    });
    if (!theme || !theme.isActive) throw new ApiError(400, "Theme is not available.");

    await prisma.user.update({ where: { id: user.id }, data: { themeId: theme.id } });
    return ok({ theme: theme.slug, message: "Theme preference saved." });
  });
}
