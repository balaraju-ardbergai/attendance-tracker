import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { canManageProject, assertManageProject } from "@/lib/permissions";
import { fromKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/projects/[id]/phases — create a waterfall phase.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser();
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) throw new ApiError(404, "Project not found.");
    assertManageProject(await canManageProject(session, project));
    if (project.methodology !== "WATERFALL") throw new ApiError(400, "Phases are only available for WATERFALL projects.");

    const body = await readJson<{ name?: string; startDate?: string; endDate?: string }>(req);
    const name = body.name?.trim();
    if (!name) throw new ApiError(400, "Phase name is required.");
    if (body.startDate && !KEY_RE.test(body.startDate)) throw new ApiError(400, "Invalid start date.");
    if (body.endDate && !KEY_RE.test(body.endDate)) throw new ApiError(400, "Invalid end date.");

    const last = await prisma.phase.findFirst({ where: { projectId: id }, orderBy: { order: "desc" }, select: { order: true } });
    const phase = await prisma.phase.create({
      data: {
        projectId: id,
        name,
        order: (last?.order ?? 0) + 1,
        startDate: body.startDate ? fromKey(body.startDate) : null,
        endDate: body.endDate ? fromKey(body.endDate) : null,
      },
    });

    await logAudit({ actorId: session.userId, action: AUDIT.PHASE_CREATED, details: { projectId: id, projectKey: project.key, phase: name } });
    return ok({ phase, message: "Phase created." }, 201);
  });
}
