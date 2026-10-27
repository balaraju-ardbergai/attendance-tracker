import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { computeMonthStats, fromKey, serverTodayKey, toKey } from "@/lib/dates";

export async function GET(req: Request) {
  return handleRoute(async () => {
    const { user } = await requireActiveUser();
    const url = new URL(req.url);
    const now = new Date();
    // Note: month is 0-based and January is "0" — never use || defaults here.
    const yearParam = url.searchParams.get("year");
    const monthParam = url.searchParams.get("month");
    const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : now.getFullYear();
    const month = monthParam !== null && monthParam !== "" && Number.isFinite(Number(monthParam)) ? Number(monthParam) : now.getMonth();
    if (month < 0 || month > 11) throw new ApiError(400, "Month must be between 0 and 11.");
    if (year < 2000 || year > 2100) throw new ApiError(400, "Year out of range.");

    const start = fromKey(toKey(new Date(Date.UTC(year, month, 1))));
    const end = fromKey(toKey(new Date(Date.UTC(year, month + 1, 1))));

    const records = await prisma.attendance.findMany({
      where: { userId: user.id, date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
    });

    return ok({
      year,
      month,
      today: serverTodayKey(),
      records: records.map((r) => ({
        key: toKey(r.date),
        status: r.status,
        clockInAt: r.clockInAt,
        clockOutAt: r.clockOutAt,
        latitude: r.latitude,
        longitude: r.longitude,
      })),
      stats: computeMonthStats(records, year, month),
    });
  });
}

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { user } = await requireActiveUser();
    const body = await readJson<{ action?: "CLOCK_IN" | "CLOCK_OUT"; latitude?: number | null; longitude?: number | null }>(req);
    const action = body.action ?? "CLOCK_IN";
    const today = fromKey(serverTodayKey());
    const now = new Date();

    const existing = await prisma.attendance.findUnique({
      where: { userId_date: { userId: user.id, date: today } },
    });

    if (action === "CLOCK_IN") {
      if (existing) {
        if (existing.status === "LEAVE" || existing.status === "WFH") {
          throw new ApiError(409, `You are on approved ${existing.status === "LEAVE" ? "leave" : "WFH"} today — attendance is already recorded.`);
        }
        throw new ApiError(409, "Attendance has already been marked for today.");
      }
      const record = await prisma.attendance.create({
        data: {
          userId: user.id,
          date: today,
          status: "PRESENT",
          clockInAt: now,
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
        },
      });
      return ok({ record: { key: toKey(record.date), status: record.status, clockInAt: record.clockInAt }, message: "Attendance marked." });
    }

    // CLOCK_OUT
    if (!existing || !existing.clockInAt) {
      throw new ApiError(400, "Mark your attendance before clocking out.");
    }
    if (existing.clockOutAt) {
      throw new ApiError(409, "You have already clocked out today.");
    }
    const record = await prisma.attendance.update({
      where: { id: existing.id },
      data: { clockOutAt: now },
    });
    return ok({ record: { key: toKey(record.date), status: record.status, clockInAt: record.clockInAt, clockOutAt: record.clockOutAt }, message: "Clocked out. See you tomorrow!" });
  });
}
