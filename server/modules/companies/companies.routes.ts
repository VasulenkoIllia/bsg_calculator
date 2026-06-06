/**
 * Companies routes — mounted at /api/v1/companies in app.ts.
 *
 * All endpoints require Bearer access token (any active user — no
 * admin gate per the auth matrix). Bonus: the deals-by-company
 * route is mounted here too for natural URL shape
 * `/api/v1/companies/:id/deals`.
 */

import { Router } from "express";
import { dealsByCompanyController } from "../deals/deals.controller";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { asyncHandler } from "../../shared/async-handler";
import { getController, listController, purgeController } from "./companies.controller";

export const companiesRouter = Router();

// One auth guard for the entire router.
companiesRouter.use(requireAuth());

companiesRouter.get("/", asyncHandler(listController));
companiesRouter.get("/:id", asyncHandler(getController));
companiesRouter.get("/:id/deals", asyncHandler(dealsByCompanyController));

// ADMIN — fully purge a HubSpot-deleted company + its documents from our
// system. requireRole("admin") accepts admin AND super_admin; the service
// additionally refuses unless the company is flagged deleted-from-HubSpot.
companiesRouter.delete("/:id", requireRole("admin"), asyncHandler(purgeController));
