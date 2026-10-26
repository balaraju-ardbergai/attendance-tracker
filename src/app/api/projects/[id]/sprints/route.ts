import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { canManageProject, assertManageProject } from "@/lib/permissions";
import { fromKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/projects/[id]/sprints — create a sprint (scrum projects).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser();
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) throw new ApiError(404, "Project not found.");
    assertManageProject(await canManageProject(session, project));
    if (project.methodology !== "SCRUM") throw new ApiError(400, "Sprints are only available for SCRUM projects.");

    const body = await readJson<{ name?: string; goal?: string; startDate?: string; endDate?: string }>(req);
    const name = body.name?.trim();
    if (!name) throw new ApiError(400, "Sprint name is required.");
    if (body.startDate && !KEY_RE.test(body.startDate)) throw new ApiError(400, "Invalid start date.");
    if (body.endDate && !KEY_RE.test(body.endDate)) throw new ApiError(400, "Invalid end date.");
    if (body.startDate && body.endDate && body.startDate > body.endDate) {
      throw new ApiError(400, "The sprint cannot end before it starts.");
    }

    const sprint = await prisma.sprint.create({
      data: {
        projectId: id,
        name,
        goal: body.goal?.trim() || null,
        startDate: body.startDate ? fromKey(body.startDate) : null,
        endDate: body.endDate ? fromKey(body.endDate) : null,
      },
    });

    await logAudit({ actorId: session.userId, action: AUDIT.SPRINT_CREATED, details: { projectId: id, projectKey: project.key, sprint: name } });
    return ok({ sprint, message: "Sprint created." }, 201);
  });
}
