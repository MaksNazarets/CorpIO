import { Request, Response } from "express";
import { Server } from "socket.io";
import { MoreThan, Not } from "typeorm";
import { AppDataSource } from "../data-source";
import { Channel } from "../entity/Channel";
import { GroupChat } from "../entity/GroupChat";
import { Message } from "../entity/Message";
import { MessageAttachment } from "../entity/MessageAttachment";
import { PrivateChat } from "../entity/PrivateChat";
import { User } from "../entity/User";
import { broadcastToUsers } from "../sockets/socket";
import { extractUserIdFromRequest, gBucketName, gStorage } from "../utils";

export const processPrivateMessage = async (
  msgData: any,
  callback: any,
  socketUser: User
) => {
  try {
    const privateChat = await PrivateChat.findOne({
      select: {
        id: true,
        user1: {
          id: true,
        },
        user2: {
          id: true,
        },
        baseChat: {
          id: true,
        },
      },
      where: {
        id: msgData.chatId,
      },
      relations: {
        user1: true,
        user2: true,
        baseChat: true,
      },
    });

    if (
      !privateChat ||
      ![privateChat.user1.id, privateChat.user2.id].includes(socketUser.id)
    )
      return;

    const msg = new Message();
    msg.text = msgData.text;
    msg.chat = privateChat.baseChat;
    msg.sender = { id: socketUser.id } as User;

    const sentMsg = await msg.save();
    if (sentMsg) {
      const recipientId =
        privateChat.user1.id === socketUser.id
          ? privateChat.user2.id
          : privateChat.user1.id;

      broadcastToUsers(
        [recipientId, socketUser.id],
        "private-message",
        sentMsg
      );
      console.log("message sent");
      callback("message successfully sent");
    } else {
      console.log("error sending message");
      callback("error sending message");
    }
  } catch (err) {
    console.error("error sending private message:", err);
    callback("error sending message");
  }
};

export const processPrivateMessageWithAttachments = async (
  req: Request,
  res: Response
) => {
  console.log("send msg with file request");

  const { text, chatId } = req.body;
  const files = req.files;

  const user = req.user as User;

  try {
    const privateChat = await PrivateChat.findOne({
      select: {
        id: true,
        user1: {
          id: true,
        },
        user2: {
          id: true,
        },
        baseChat: {
          id: true,
        },
      },
      where: {
        id: chatId,
      },
      relations: {
        user1: true,
        user2: true,
        baseChat: true,
      },
    });

    if (
      !privateChat ||
      ![privateChat.user1.id, privateChat.user2.id].includes(user.id)
    )
      return res.status(404).json();

    const msg = new Message();
    msg.text = text;
    msg.chat = privateChat.baseChat;
    msg.sender = { id: user.id } as User;
    msg.attachments = [];

    for (let file of files as Express.Multer.File[]) {
      try {
        await new Promise((resolve, reject) => {
          const originalName = Buffer.from(
            file.originalname,
            "latin1"
          ).toString("utf-8");

          const onDiskName = `${Date.now()}-${originalName}`;
          const blob = gStorage
            .bucket(gBucketName)
            .file(`uploads/message-attachments/${onDiskName}`);

          const blobStream = blob.createWriteStream({
            resumable: false,
          });

          blobStream.on("error", (err) => {
            console.error("Error writing to GCS:", err);
            reject(err);
          });

          blobStream.on("finish", () => {
            const attachment = new MessageAttachment();
            attachment.filenameOnDisk = onDiskName;
            attachment.filename = originalName;
            attachment.size = file.size;

            msg.attachments.push(attachment);
            resolve(true);
          });

          blobStream.end(file.buffer);
        });
      } catch {}
    }

    let sentMsg = null;
    await AppDataSource.transaction(async (transactionManager) => {
      await transactionManager.save(msg.attachments);
      sentMsg = await transactionManager.save(msg);
    });

    console.log(sentMsg);

    if (sentMsg) {
      const recipientId =
        privateChat.user1.id === user.id
          ? privateChat.user2.id
          : privateChat.user1.id;

      broadcastToUsers([recipientId, user.id], "private-message", sentMsg);
      console.log("message with file sent");
      return res.status(200).json();
    } else {
      console.log("error sending message with file");
      return res.status(400).json();
    }
  } catch (err) {
    console.log("error sending message with file:", err);
    return res.status(500).json();
  }
};

export const processGroupMessage = async (
  msgData: any,
  callback: any,
  socketUser: User
) => {
  try {
    const groupChat = await GroupChat.findOne({
      select: {
        id: true,
        baseChat: {
          id: true,
        },
        members: { id: true },
      },
      where: {
        id: msgData.chatId,
      },
      relations: {
        baseChat: true,
        members: true,
      },
    });

    if (!groupChat || !groupChat.members.some((m) => m.id === socketUser.id)) {
      console.log(
        "user trying to send a message to unaccessible (for them) chat"
      );
      return;
    }

    const msg = new Message();
    msg.text = msgData.text;
    msg.chat = groupChat.baseChat;
    msg.sender = {
      id: socketUser.id,
      firstName: socketUser.firstName,
      lastName: socketUser.lastName,
    } as User;
    msg.isSeen = true;

    const sentMsg = await msg.save();
    if (sentMsg) {
      broadcastToUsers(
        groupChat.members.map((m) => m.id),
        "group-message",
        { ...sentMsg, groupId: groupChat.id }
      );
      console.log("message sent");
      callback("message successfully sent");
    } else {
      console.log("error sending message");
      callback("error sending message");
    }
  } catch (err) {
    console.log("error sending group message with file:", err);
    callback("error sending message");
  }
};

export const processGroupMessageWithAttachments = async (
  req: Request,
  res: Response
) => {
  const { text, chatId } = req.body;
  const files = req.files;

  const user = req.user as User;

  try {
    const groupChat = await GroupChat.findOne({
      select: {
        id: true,
        baseChat: {
          id: true,
        },
        members: { id: true },
      },
      where: {
        id: chatId,
      },
      relations: {
        baseChat: true,
        members: true,
      },
    });

    if (!groupChat || !groupChat.members.some((m) => m.id === user.id)) {
      console.log(
        "user trying to send a message to unaccessible (for them) chat"
      );
      return;
    }

    const msg = new Message();
    msg.text = text;
    msg.chat = groupChat.baseChat;
    msg.sender = { id: user.id } as User;
    msg.isSeen = true;
    msg.attachments = [];

    for (let file of files as Express.Multer.File[]) {
      try {
        await new Promise((resolve, reject) => {
          const originalName = Buffer.from(
            file.originalname,
            "latin1"
          ).toString("utf-8");

          const onDiskName = `${Date.now()}-${originalName}`;
          const blob = gStorage
            .bucket(gBucketName)
            .file(`uploads/message-attachments/${onDiskName}`);

          const blobStream = blob.createWriteStream({
            resumable: false,
          });

          blobStream.on("error", (err) => {
            console.error("Error writing to GCS:", err);
            reject(err);
          });

          blobStream.on("finish", () => {
            const attachment = new MessageAttachment();
            attachment.filenameOnDisk = onDiskName;
            attachment.filename = originalName;
            attachment.size = file.size;

            msg.attachments.push(attachment);
            resolve(true);
          });

          blobStream.end(file.buffer);
        });
      } catch {}
    }

    let sentMsg = null;
    await AppDataSource.transaction(async (transactionManager) => {
      await transactionManager.save(msg.attachments);
      sentMsg = await transactionManager.save(msg);
    });

    if (sentMsg) {
      broadcastToUsers(
        groupChat.members.map((m) => m.id),
        "group-message",
        { ...(sentMsg as Message), groupId: groupChat.id }
      );
      console.log("message sent");
      return res.status(200).json();
    } else {
      console.log("error sending group message with file");
      return res.status(500).json();
    }
  } catch (err) {
    console.log("error sending group message with files:", err);
    return res.status(500).json();
  }
};

export const processChannelPost = async (
  msgData: any,
  callback: any,
  socketUser: User
) => {
  try {
    const channel = await Channel.findOne({
      select: {
        id: true,
        baseChat: {
          id: true,
        },
        subscribers: {
          id: true,
        },
        creator: {
          id: true,
        },
      },
      where: {
        id: msgData.chatId,
      },
      relations: {
        baseChat: true,
        subscribers: true,
        creator: true,
      },
    });

    if (!channel || channel.creator.id !== socketUser.id) {
      console.log("User doesn't have the right to post to this channel");
      return;
    }

    const msg = new Message();
    msg.text = msgData.text;
    msg.chat = channel.baseChat;
    msg.sender = { id: socketUser.id } as User;
    msg.isSeen = true;

    const sentMsg = await msg.save();
    if (sentMsg) {
      broadcastToUsers(
        channel.subscribers.map((m) => m.id),
        "channel-post",
        { ...sentMsg, channelId: channel.id }
      );
      console.log("post published");
      callback("post successfully published");
    } else {
      console.log("error publication a post");
      callback("error publication a post");
    }
  } catch (err) {
    console.log("error publication a post:", err);
    callback("error publication a post");
  }
};

export const processChannelPostWithAttachments = async (
  req: Request,
  res: Response
) => {
  const { text, chatId } = req.body;
  const files = req.files;

  const user = req.user as User;

  try {
    const channel = await Channel.findOne({
      select: {
        id: true,
        baseChat: {
          id: true,
        },
        subscribers: {
          id: true,
        },
        creator: {
          id: true,
        },
      },
      where: {
        id: chatId,
      },
      relations: {
        baseChat: true,
        subscribers: true,
        creator: true,
      },
    });

    if (!channel || channel.creator.id !== user.id) {
      console.log("User doesn't have the right to post to this channel");
      return;
    }

    const msg = new Message();
    msg.text = text;
    msg.chat = channel.baseChat;
    msg.sender = { id: user.id } as User;
    msg.isSeen = true;
    msg.attachments = [];

    for (let file of files as Express.Multer.File[]) {
      try {
        await new Promise((resolve, reject) => {
          const originalName = Buffer.from(
            file.originalname,
            "latin1"
          ).toString("utf-8");

          const onDiskName = `${Date.now()}-${originalName}`;
          const blob = gStorage
            .bucket(gBucketName)
            .file(`uploads/message-attachments/${onDiskName}`);

          const blobStream = blob.createWriteStream({
            resumable: false,
          });

          blobStream.on("error", (err) => {
            console.error("Error writing to GCS:", err);
            reject(err);
          });

          blobStream.on("finish", () => {
            const attachment = new MessageAttachment();
            attachment.filenameOnDisk = onDiskName;
            attachment.filename = originalName;
            attachment.size = file.size;

            msg.attachments.push(attachment);
            resolve(true);
          });

          blobStream.end(file.buffer);
        });
      } catch {}
    }

    let sentMsg = null;
    await AppDataSource.transaction(async (transactionManager) => {
      await transactionManager.save(msg.attachments);
      sentMsg = await transactionManager.save(msg);
    });

    if (sentMsg) {
      broadcastToUsers(
        channel.subscribers.map((m) => m.id),
        "channel-post",
        { ...(sentMsg as Message), channelId: channel.id }
      );
      console.log("post published");
      return res.status(200).json();
    } else {
      console.log("error publication a post");
      return res.status(500).json();
    }
  } catch (err) {
    console.log("error publication a post with files:", err);
    return res.status(500).json();
  }
};

export const getNewMessages = async (
  chatData: {
    chatType: "p" | "g" | "c";
    chatId: number;
    lastMessageId: number;
  },
  callback: any,
  socketUser: User
) => {
  const privateChat = await PrivateChat.findOne({
    select: {
      id: true,
      user1: {
        id: true,
      },
      user2: {
        id: true,
      },
      baseChat: {
        id: true,
      },
    },
    where: {
      id: chatData.chatId,
    },
    relations: {
      user1: true,
      user2: true,
      baseChat: true,
    },
  });

  if (
    !privateChat ||
    ![privateChat.user1.id, privateChat.user2.id].includes(socketUser.id)
  )
    return;

  const newMessages = await Message.find({
    select: {
      sender: {
        id: true,
      },
    },
    where: {
      chat: { id: privateChat?.baseChat.id },
      id: MoreThan(chatData.lastMessageId),
    },
    relations: {
      chat: true,
      attachments: true,
      sender: true,
    },
    order: {
      timestamp: "DESC",
    },
  });

  callback(newMessages);
};

export const markMsgsAsSeen = async (
  chatId: number,
  userId: number,
  io: Server
) => {
  try {
    const privateChat = await PrivateChat.findOne({
      select: {
        user1: { id: true },
        user2: { id: true },
        baseChat: {
          id: true,
        },
      },
      where: {
        id: chatId,
      },
      relations: {
        baseChat: true,
        user1: true,
        user2: true,
      },
    });

    if (privateChat) {
      const unreadMsgs = await Message.update(
        {
          chat: { id: privateChat.baseChat.id },
          sender: { id: Not(userId) },
          isSeen: false,
        },
        { isSeen: true }
      );

      console.log(unreadMsgs.affected + " messages marked as seen");

      if (unreadMsgs.affected && unreadMsgs.affected > 0) {
        broadcastToUsers(
          [
            privateChat.user1.id === userId
              ? privateChat.user2.id
              : privateChat.user1.id,
          ],
          "messages seen",
          chatId
        );
      }
    }
  } catch (err) {
    console.log("error while marking messages as seen:", err);
  }
};

export const getFile = async (req: Request, res: Response) => {
  const { attId } = req.query;

  if (!attId || isNaN(Number(attId)))
    return res.status(400).send("Invalid attId parameter");

  try {
    const requestingUserId = extractUserIdFromRequest(req);
    // TODO: check if user has access to the file (right to download it)

    const attachment = await MessageAttachment.findOneBy({ id: Number(attId) });

    if (!attachment) return res.status(400).json();

    const filename = `uploads/message-attachments/${attachment.filenameOnDisk}`;

    const file = gStorage.bucket(gBucketName).file(filename);

    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).send("File not found");
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(attachment.filename)}"`
    );
    file.createReadStream().pipe(res);
  } catch (err) {
    console.log("error while getting message attachment:", err);
    return res.status(500).json(null);
  }
};
