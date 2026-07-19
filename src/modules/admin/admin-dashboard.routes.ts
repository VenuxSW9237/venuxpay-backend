import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../db/client";
import { asyncHandler } from "../../lib/validate";
import { requireAdmin } from "../../middleware/auth";
import { users, transactions } from "../../db/schema";

const router = Router();

router.get(
  "/overview",
  requireAdmin(),
  asyncHandler(async (_req, res) => {
    const userCountResult = await db.execute(sql`SELECT COUNT(*)::int AS count FROM ${users}`);
    const txStatsResult = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_transactions,
        COALESCE(SUM(total_charged) FILTER (WHERE status = 'SUCCESSFUL'), 0)::float AS total_revenue,
        COUNT(*) FILTER (WHERE status = 'SUCCESSFUL')::int AS successful_count,
        COUNT(*) FILTER (WHERE status = 'FAILED' OR status = 'REVERSED')::int AS failed_count,
        COUNT(*) FILTER (WHERE status = 'PENDING' OR status = 'PROCESSING')::int AS pending_count
      FROM ${transactions}
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);

    const userCount = userCountResult.rows[0] as { count: number };
    const txStats = txStatsResult.rows[0];

    res.json({
      totalUsers: userCount.count,
      last30Days: txStats,
    });
  }),
);

export default router;
