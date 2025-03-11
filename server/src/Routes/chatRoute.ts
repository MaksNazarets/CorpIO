import express from "express";
import { isAuthenticated } from "../Controllers/userController";
import {
  addGroupMember,
  createChannel,
  createGroup,
  createPrivateChat,
  getChannels,
  getChatAvatar,
  getChatData,
  getChatMessages,
  getGroupMembers,
  getGroups,
  getPrivateChatByUsers,
  getUserChats,
  joinGroup,
  removeGroupMember,
  subscribeChannel,
} from "../Controllers/chatController";
import { getFile } from "../Controllers/messageController";
import {
  processChannelPostWithAttachments,
  processGroupMessageWithAttachments,
  processPrivateMessageWithAttachments,
} from "../Controllers/messageController";
import multer from "multer";

export const router = express.Router();

router.get("/get-user-chats", isAuthenticated, getUserChats);

router.get("/:chatType/:chatId/get-chat-data", isAuthenticated, getChatData);

router.get(
  "/:chatType/:chatId/get-chat-messages",
  isAuthenticated,
  getChatMessages
);

router.get("/get-p-chat", isAuthenticated, getPrivateChatByUsers);

router.get("/get-groups", isAuthenticated, getGroups);

router.get("/get-group-members", isAuthenticated, getGroupMembers);

router.get("/get-channels", isAuthenticated, getChannels);

router.post("/create-p-chat", isAuthenticated, createPrivateChat);

router.post("/create-group", isAuthenticated, createGroup);

router.post("/join-group", isAuthenticated, joinGroup);

router.post("/add-group-member", isAuthenticated, addGroupMember);

router.put("/remove-group-member", isAuthenticated, removeGroupMember);

router.post("/create-channel", isAuthenticated, createChannel);

router.post("/subscribe-channel", isAuthenticated, subscribeChannel);

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 30 * 1024 * 1024 } });

router.post(
  "/send-private-message-with-files",
  [isAuthenticated, upload.array("files")],
  processPrivateMessageWithAttachments
);

router.post(
  "/send-group-message-with-files",
  [isAuthenticated, upload.array("files")],
  processGroupMessageWithAttachments
);

router.post(
  "/send-channel-post-with-files",
  [isAuthenticated, upload.array("files")],
  processChannelPostWithAttachments
);

router.get("/:chatType/:chatId/avatar", getChatAvatar);

router.get("/get-file", isAuthenticated, getFile);
