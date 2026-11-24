import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { AUDIT, logAudit } from "@/lib/audit";

const NAME_RE = /^[\p{L}\p{N} .+#&/()_-]{2,80}$/u;

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { session, user } = await requireActiveUser();
    const body = await readJson<{ name?: string; proficiency?: number; evidence?: string | null }>(req);
    const name = body.name?.trim();
    if (!name || !NAME_RE.test(name)) throw new ApiError(400, "Skill name must be 2–80 characters.");
    const proficiency = Math.round(Number(body.proficiency ?? 1));
    if (!Number.isFinite(proficiency) || proficiency < 1 || proficiency > 5) {
      throw new ApiError(400, "Proficiency must be between 1 and 5.");
    }
    const evidence = body.evidence?.trim() || null;
    if (evidence && evidence.length > 500) throw new ApiError(400, "Evidence must be 500 characters or fewer.");

    const skill = await prisma.skill.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    const row = await prisma.userSkill.upsert({
      where: { userId_skillId: { userId: user.id, skillId: skill.id } },
      update: { proficiency, evidence },
      create: { userId: user.id, skillId: skill.id, proficiency, evidence },
      include: { skill: true },
    });

    await logAudit({
      actorId: session.userId,
      targetUserId: session.userId,
      action: AUDIT.SKILL_ADDED,
      details: { skill: name, proficiency },
    });
    return ok({ skill: row, message: "Skill saved." }, 201);
  });
}

export async function PATCH(req: Request) {
  return handleRoute(async () => {
    const { session, user } = await requireActiveUser();
    const body = await readJson<{ id?: string; proficiency?: number; evidence?: string | null }>(req);
    if (!body.id) throw new ApiError(400, "Skill id is required.");
    const proficiency = Math.round(Number(body.proficiency));
    if (!Number.isFinite(proficiency) || proficiency < 1 || proficiency > 5) {
      throw new ApiError(400, "Proficiency must be between 1 and 5.");
    }
    const evidence = body.evidence?.trim() || null;
    if (evidence && evidence.length > 500) throw new ApiError(400, "Evidence must be 500 characters or fewer.");

    const existing = await prisma.userSkill.findFirst({ where: { id: body.id, userId: user.id }, include: { skill: true } });
    if (!existing) throw new ApiError(404, "Skill not found.");
    const row = await prisma.userSkill.update({
      where: { id: existing.id },
      data: { proficiency, evidence },
      include: { skill: true },
    });
    await logAudit({
      actorId: session.userId,
      targetUserId: session.userId,
      action: AUDIT.SKILL_UPDATED,
      details: { skill: existing.skill.name, proficiency },
    });
    return ok({ skill: row, message: "Skill updated." });
  });
}

export async function DELETE(req: Request) {
  return handleRoute(async () => {
    const { session, user } = await requireActiveUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError(400, "Skill id is required.");
    const existing = await prisma.userSkill.findFirst({ where: { id, userId: user.id }, include: { skill: true } });
    if (!existing) throw new ApiError(404, "Skill not found.");
    await prisma.userSkill.delete({ where: { id: existing.id } });
    await logAudit({
      actorId: session.userId,
      targetUserId: session.userId,
      action: AUDIT.SKILL_REMOVED,
      details: { skill: existing.skill.name },
    });
    return ok({ message: "Skill removed." });
  });
}
