import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { canReviewRequestOf } from "@/lib/permissions";
import { fromKey, serverTodayKey, toKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";
import { REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL } from "@/lib/roles";
import { requestStatusEmail, sendMail } from "@/lib/mail";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser();
    const { action, note } = await readJson<{ action?: string; note?: string }>(req);
    if (action !== "APPROVE" && action !== "REJECT" && action !== "CANCEL") {
      throw new ApiError(400, "Action must be APPROVE, REJECT or CANCEL.");
    }

    const request = await prisma.request.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!request) throw new ApiError(404, "Request not found.");

    const canReview = await canReviewRequestOf(session, request.userId);

    if (action === "CANCEL") {
      if (request.userId !== session.userId) throw new ApiError(403, "You can only cancel your own requests.");
      if (request.status !== "PENDING") throw new ApiError(409, "Only pending requests can be cancelled.");
      const updated = await prisma.request.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      await logAudit({
        actorId: session.userId,
        targetUserId: request.userId,
        action: AUDIT.REQUEST_CANCELLED,
        details: { requestId: id, type: request.type },
      });
      return ok({ request: updated, message: "Request cancelled." });
    }

    if (!canReview) throw new ApiError(403, "Only HR Admins, Directors or the requester's team lead can review requests.");
    if (request.status !== "PENDING") {
      throw new ApiError(409, `This request has already been ${REQUEST_STATUS_LABEL[request.status].toLowerCase()}.`);
    }

    const status = action === "APPROVE" ? "APPROVED" : "REJECTED";
    const updated = await prisma.request.update({
      where: { id },
      data: {
        status,
        reviewNote: note?.trim() || null,
        reviewedById: session.userId,
        reviewedAt: new Date(),
      },
    });

    if (status === "APPROVED") {
      // Record LEAVE/WFH on each working day from today through the end of the range.
      const todayKey = serverTodayKey();
      const startKey = toKey(request.startDate) < todayKey ? todayKey : toKey(request.startDate);
      const endKey = toKey(request.endDate);
      const rows: { userId: string; date: Date; status: "LEAVE" | "WFH" }[] = [];
      let cursor = startKey;
      let guard = 0;
      while (cursor <= endKey && guard++ < 62) {
        const dow = fromKey(cursor).getUTCDay();
        if (dow !== 0 && dow !== 6) rows.push({ userId: request.userId, date: fromKey(cursor), status: request.type === "LEAVE" ? "LEAVE" : "WFH" });
        cursor = toKey(new Date(fromKey(cursor).getTime() + 86400_000));
      }
      if (rows.length) {
        await prisma.attendance.createMany({ data: rows, skipDuplicates: true });
      }
    }

    await logAudit({
      actorId: session.userId,
      targetUserId: request.userId,
      action: status === "APPROVED" ? AUDIT.REQUEST_APPROVED : AUDIT.REQUEST_REJECTED,
      details: { requestId: id, type: request.type, note: note?.trim() || undefined },
    });

    const typeLabel = REQUEST_TYPE_LABEL[request.type];
    const mail = requestStatusEmail(request.user.name, request.user.email, typeLabel, REQUEST_STATUS_LABEL[status], note?.trim());
    await sendMail(mail);

    return ok({ request: updated, message: `Request ${status.toLowerCase()}.` });
  });
}
