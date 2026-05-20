/**
 * Deals routes — mounted at /api/v1/deals in app.ts.
 *
 * The /api/v1/companies/:id/deals route is mounted by
 * companies.routes.ts to keep that nested URL natural.
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { asyncHandler } from "../../shared/async-handler";
import { getController, listController } from "./deals.controller";

export const dealsRouter = Router();

dealsRouter.use(requireAuth());

dealsRouter.get("/", asyncHandler(listController));
dealsRouter.get("/:id", asyncHandler(getController));
