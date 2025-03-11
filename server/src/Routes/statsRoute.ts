import express from "express";
import { isAdmin, isAuthenticated } from "../Controllers/userController";
import { getMessageLoadStatistics } from "../Controllers/statsController";

export const router = express.Router();

router.get(
  "/messaging-load",
  [isAuthenticated, isAdmin],
  getMessageLoadStatistics
);
