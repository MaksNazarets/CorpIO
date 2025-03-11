import express from "express";
import { isAdmin, isAuthenticated } from "../Controllers/userController";
import {
  createDepartment,
  deleteDepartment,
  getAllDepartments,
  getDepartment,
  getDepartmentList,
  updateDepartment,
} from "../Controllers/departmentController";

export const router = express.Router();

router.get("/get-all", isAuthenticated, getAllDepartments);

router.post("/create", [isAuthenticated, isAdmin], createDepartment);

router.put("/update/:depId", [isAuthenticated, isAdmin], updateDepartment);

router.delete("/delete/:depId", [isAuthenticated, isAdmin], deleteDepartment);

router.get("/get-department-list", isAuthenticated, getDepartmentList);

router.get("/get-department", isAuthenticated, getDepartment);
