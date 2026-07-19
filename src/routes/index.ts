import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import walletRoutes from "../modules/wallet/wallet.routes";
import servicesRoutes from "../modules/services/services.routes";
import adminAuthRoutes from "../modules/admin/admin-auth.routes";
import adminDashboardRoutes from "../modules/admin/admin-dashboard.routes";
import adminUsersRoutes from "../modules/admin/admin-users.routes";
import adminTransactionsRoutes from "../modules/admin/admin-transactions.routes";
import adminSettingsRoutes from "../modules/admin/admin-settings.routes";
import adminManagementRoutes from "../modules/admin/admin-management.routes";

const router = Router();

// Public + authenticated user-facing API
router.use("/auth", authRoutes);
router.use("/wallet", walletRoutes);
router.use("/services", servicesRoutes);

// Admin panel API — every sub-router enforces its own role requirements
router.use("/admin/auth", adminAuthRoutes);
router.use("/admin/dashboard", adminDashboardRoutes);
router.use("/admin/users", adminUsersRoutes);
router.use("/admin/transactions", adminTransactionsRoutes);
router.use("/admin/settings", adminSettingsRoutes);
router.use("/admin", adminManagementRoutes); // /admin/audit-logs, /admin/admins

export default router;
