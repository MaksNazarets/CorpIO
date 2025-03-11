import express from "express";

import multer from "multer";
import {
  getMe,
  getUserAvatar,
  getUserData,
  getUsers,
  isAdmin,
  isAuthenticated,
  loginUser,
  logoutUser,
  registerUser,
  updateUserAvatar,
  updateUserPersonalData,
  validateUserData,
} from "../Controllers/userController";

import path from "path";

export const router = express.Router();

router.post("/login", loginUser);

router.post("/logout", logoutUser);

router.post(
  "/register",
  [isAuthenticated, isAdmin, validateUserData],
  registerUser
);

router.post(
  "/update-user-personal-data",
  [isAuthenticated, validateUserData],
  updateUserPersonalData
);

router.get("/get-me", isAuthenticated, getMe);

router.get("/get-users", isAuthenticated, getUsers);

router.get("/get-user-data", isAuthenticated, getUserData);

router.get("/:userId/avatar", getUserAvatar);

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Файл може мати лише такі розширення: " + filetypes));
  },
});

router.post(
  "/change-avatar",
  [isAuthenticated, upload.single("avatar")],
  updateUserAvatar
);
