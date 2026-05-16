/**
 * Calculator-configs routes — mounted at /api/v1/calculator-configs
 * in app.ts.
 *
 * All endpoints require any active user (no admin gate). The list
 * endpoint sees the same `requireAuth` middleware as the rest — we
 * could later restrict deletion to admins (or to the creator only)
 * if BSG ops asks for it. For now the model is "operators trust
 * each other's drafts".
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { asyncHandler } from "../../shared/async-handler";
import {
  createController,
  deleteController,
  getController,
  listController,
  updateController
} from "./calculator-configs.controller";

export const calculatorConfigsRouter = Router();

calculatorConfigsRouter.use(requireAuth());

calculatorConfigsRouter.get("/", asyncHandler(listController));
calculatorConfigsRouter.post("/", asyncHandler(createController));
calculatorConfigsRouter.get("/:id", asyncHandler(getController));
calculatorConfigsRouter.put("/:id", asyncHandler(updateController));
calculatorConfigsRouter.delete("/:id", asyncHandler(deleteController));
