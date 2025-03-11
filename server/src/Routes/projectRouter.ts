import express from "express";

import {
  createProject,
  getAllProjects,
  getMyProjects,
  getProjectAttachment,
  getProjectData,
  isHeadOfDepartment,
} from "../Controllers/projectController";
import { isAuthenticated } from "../Controllers/userController";
import multer from "multer";

export const router = express.Router();

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "uploads/project-attachments/");
//   },
//   filename: (req, file, cb) => {
//     const originalName = Buffer.from(file.originalname, "latin1").toString(
//       "utf-8"
//     );

//     cb(null, `${Date.now()}-${originalName}`);
//   },
// });

const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: { fileSize: 1.95 * 1024 * 1024 * 1024 },
});

router.post(
  "/create-project",
  [isAuthenticated, isHeadOfDepartment, upload.array("attachments")],
  createProject
);

router.get("/get-my-projects", [isAuthenticated], getMyProjects);

router.get("/get-all-projects", [isAuthenticated], getAllProjects);

router.get("/get-project-data", [isAuthenticated], getProjectData);

router.get("/get-attachment", isAuthenticated, getProjectAttachment);
