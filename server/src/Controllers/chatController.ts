import { Request, Response } from "express";
import { transliterate } from "transliteration";
import { ILike, LessThan } from "typeorm";
import { Channel } from "../entity/Channel";
import { Chat } from "../entity/Chat";
import { GroupChat } from "../entity/GroupChat";
import { Message } from "../entity/Message";
import { PrivateChat } from "../entity/PrivateChat";
import { User } from "../entity/User";
import { broadcastToUsers } from "../sockets/socket";
import { extractUserIdFromRequest, gBucketName, gStorage } from "../utils";

const MESSAGE_NUMBER_PER_REQUEST = 25;

export const getUserChats = async (req: Request, res: Response) => {
  console.log("getUserChats request received");
  const userId = extractUserIdFromRequest(req);

  try {
    const chats = await User.findOne({
      select: {
        memberships: {
          id: true,
          name: true,
        },
        subscriptions: {
          id: true,
          name: true,
        },
        user1Chats: {
          id: true,
          user2: {
            id: true,
            firstName: true,
            lastName: true,
            isOnline: true,
          },
        },
        user2Chats: {
          id: true,
          user1: {
            id: true,
            firstName: true,
            lastName: true,
            isOnline: true,
          },
        },
        id: true,
      },
      where: { id: userId },
      relations: {
        memberships: true,
        subscriptions: true,
        user1Chats: {
          user2: true,
        },
        user2Chats: {
          user1: true,
        },
      },
    });

    // console.log(chats);

    return res.json({
      privateChats: chats?.getPrivateChats(),
      groups: chats?.memberships,
      channels: chats?.subscriptions,
    });
  } catch (err) {
    console.error("Error fetching chats:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getChatData = async (req: Request, res: Response) => {
  const { chatType, chatId, u2Id } = req.params;

  console.log("getChatData request");

  if (!["p", "g", "c"].includes(chatType) || isNaN(Number(chatId))) {
    return res.status(400).json({
      error: "Wrong chatType or chatId params",
    });
  }

  if (u2Id && isNaN(Number(u2Id))) return res.status(400).json();

  try {
    const requestingUser = req.user as User;

    if (chatType === "p") {
      const chat = await PrivateChat.findOne({
        select: {
          user1: {
            id: true,
            firstName: true,
            lastName: true,
            isOnline: true,
            lastTimeOnline: true,
          },
          user2: {
            id: true,
            firstName: true,
            lastName: true,
            isOnline: true,
            lastTimeOnline: true,
          },
          id: true,
          baseChat: {
            id: true,
          },
        },
        where: u2Id
          ? [
              {
                user1: { id: Number(u2Id) },
                user2: { id: requestingUser.id },
              },
              {
                user2: { id: Number(u2Id) },
                user1: { id: requestingUser.id },
              },
            ]
          : {
              id: Number(chatId),
            },
        relations: {
          user1: true,
          user2: true,
          baseChat: true,
        },
      });
      if (!chat)
        return res.status(404).json({
          error: "Chat not found",
        });

      const userId = requestingUser.id || requestingUser.department.id === 1;
      if (chat.user1.id !== userId && chat.user2.id !== userId)
        return res.status(403).json({
          error: "Chat is not accessible for you",
        });

      const user = chat.user1.id == userId ? chat.user2 : chat.user1;

      return res.status(200).json({
        baseChat: chat.baseChat,
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        isOnline: user.isOnline,
        lastTimeOnline: user.lastTimeOnline,
      });
    } else if (chatType === "g") {
      const chat = await GroupChat.findOne({
        select: {
          name: true,
          id: true,
          baseChat: {
            id: true,
          },
          members: { id: true },
          creator: {
            id: true,
          },
        },
        where: {
          id: Number(chatId),
        },
        relations: {
          creator: true,
          baseChat: true,
          members: true,
        },
      });
      if (!chat)
        return res.status(404).json({
          error: "Chat not found",
        });

      return res.status(200).json({
        name: chat.name,
        id: chat.id,
        members_number: chat.members.length,
        adminIds: [chat.creator.id],
      });
    } else {
      const chat = await Channel.findOne({
        select: {
          name: true,
          id: true,
          baseChat: {
            id: true,
          },
          subscribers: { id: true },
          creator: {
            id: true,
          },
        },
        where: {
          id: Number(chatId),
        },
        relations: {
          creator: true,
          baseChat: true,
          subscribers: true,
        },
      });
      if (!chat)
        return res.status(404).json({
          error: "Chat not found",
        });

      return res.status(200).json({
        name: chat.name,
        id: chat.id,
        subscribers_number: chat.subscribers.length,
        adminIds: [chat.creator.id],
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json("Internal server error");
  }
};

export const getGroupMembers = async (req: Request, res: Response) => {
  const { gid } = req.query;

  const groupId = gid && Number(gid);

  if (!groupId || isNaN(groupId)) return res.status(400).json();

  try {
    const chat = await GroupChat.findOne({
      select: {
        id: true,
        members: {
          id: true,
          firstName: true,
          lastName: true,
          patronymic: true,
          department: {
            id: true,
            name: true,
          },
        },
        creator: { id: true },
      },
      where: {
        id: groupId,
      },
      relations: {
        members: {
          department: true,
        },
        creator: true,
      },
    });

    if (!chat) res.status(404).json();
    else
      res
        .status(200)
        .json({ members: chat?.members, creatorId: chat.creator.id });
  } catch (err) {
    console.error("Error while receiving group members: ", err);
    res.status(500).json();
  }
};

export const getChatAvatar = async (req: Request, res: Response) => {
  const { chatType, chatId } = req.params;

  if (!chatType || !["g", "c"].includes(chatType))
    return res.status(400).send("Invalid chatType parameter");

  if (!chatId || isNaN(Number(chatId)))
    return res.status(400).send("Invalid chatId parameter");

  const filename = `uploads/chat_avatars/${chatType}/${chatId}`;
  const file = gStorage.bucket(gBucketName).file(filename);

  try {
    const [exists] = await file.exists();
    if (!exists) {
      const defaultFilename = `uploads/chat_avatars/${chatType}/defaults/default_avatar.svg`;
      const defaultFile = gStorage.bucket(gBucketName).file(defaultFilename);

      const [metadata] = await defaultFile.getMetadata();
      const contentType = metadata.contentType || "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="avatar.svg"`);

      return defaultFile.createReadStream().pipe(res);
    }

    return res.status(501).json();
  } catch (err) {
    console.log("Error while sending chat avatar");
    res.status(500).json();
  }
};

export const getChatMessages = async (req: Request, res: Response) => {
  const { chatType, chatId } = req.params;
  const { startMsgId } = req.query;

  console.log("getChatMessages request");

  if (!["p", "g", "c"].includes(chatType) || isNaN(Number(chatId))) {
    return res.status(400).json({
      error: "Wrong chatType or chatId params",
    });
  }
  try {
    if (chatType === "p") {
      const chat = await PrivateChat.findOne({
        select: {
          id: true,
          baseChat: {
            id: true,
          },
          user1: {
            id: true,
          },
          user2: {
            id: true,
          },
        },
        where: {
          id: Number(chatId),
        },
        relations: {
          baseChat: true,
          user1: true,
          user2: true,
        },
      });
      if (!chat)
        return res.status(404).json({
          error: "Chat not found",
        });

      const userId = extractUserIdFromRequest(req);
      if (chat.user1.id !== userId && chat.user2.id !== userId)
        return res.status(403).json({
          error: "Chat is not accessible for you",
        });

      const conditions = Number(startMsgId)
        ? {
            chat: { id: chat?.baseChat.id },
            id: LessThan(Number(startMsgId)),
          }
        : { chat: { id: chat?.baseChat.id } };

      let messages = await Message.find({
        select: {
          sender: {
            id: true,
          },
        },
        where: conditions,
        relations: {
          chat: true,
          attachments: true,
          sender: true,
        },
        order: {
          timestamp: "DESC",
        },
        take: MESSAGE_NUMBER_PER_REQUEST,
      });

      const first_msg = messages[messages.length - 1];

      if (first_msg && first_msg.sender.id !== userId && !first_msg.isSeen) {
        messages = await Message.find({
          select: {
            sender: {
              id: true,
            },
          },
          where: { ...conditions, isSeen: false },
          relations: {
            chat: true,
            attachments: true,
            sender: true,
          },
          order: {
            timestamp: "DESC",
          },
        });
      }

      console.log("Found " + messages.length + " messages");

      return res.status(200).json({
        messages,
      });
    } else if (chatType === "g") {
      const chat = await GroupChat.findOne({
        select: {
          id: true,
          baseChat: {
            id: true,
          },
          members: { id: true },
        },
        where: {
          id: Number(chatId),
        },
        relations: {
          baseChat: true,
          members: true,
        },
      });
      if (!chat)
        return res.status(404).json({
          error: "Chat not found",
        });

      const userId = extractUserIdFromRequest(req);

      if (!chat.members.some((user) => user.id === userId))
        return res.status(403).json({
          error: "Chat is not accessible for you",
        });

      const conditions = Number(startMsgId)
        ? {
            chat: { id: chat?.baseChat.id },
            id: LessThan(Number(startMsgId)),
          }
        : { chat: { id: chat?.baseChat.id } };

      const messages = await Message.find({
        select: {
          sender: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        where: conditions,
        relations: {
          chat: true,
          attachments: true,
          sender: true,
        },
        order: {
          timestamp: "DESC",
        },
        take: MESSAGE_NUMBER_PER_REQUEST,
      });

      console.log("Found " + messages.length + " messages");

      return res.status(200).json({
        messages,
      });
    } else if (chatType === "c") {
      const chat = await Channel.findOne({
        select: {
          id: true,
          baseChat: {
            id: true,
          },
          subscribers: { id: true },
        },
        where: {
          id: Number(chatId),
        },
        relations: {
          baseChat: true,
          subscribers: true,
        },
      });
      if (!chat)
        return res.status(404).json({
          error: "Chat not found",
        });

      const userId = extractUserIdFromRequest(req);

      if (!chat.subscribers.some((user) => user.id === userId))
        return res.status(403).json({
          error: "Chat is not accessible for you",
        });

      const conditions = Number(startMsgId)
        ? {
            chat: { id: chat?.baseChat.id },
            id: LessThan(Number(startMsgId)),
          }
        : { chat: { id: chat?.baseChat.id } };

      const messages = await Message.find({
        where: conditions,
        relations: {
          attachments: true,
        },
        order: {
          timestamp: "DESC",
        },
        take: MESSAGE_NUMBER_PER_REQUEST,
      });

      console.log("Found " + messages.length + " publications");

      return res.status(200).json({
        messages,
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json("Internal server error");
  }
};

export const getPrivateChatByUsers = async (req: Request, res: Response) => {
  const userId = extractUserIdFromRequest(req);
  const secondUserId = Number(req.query.u2Id) || null;

  if (!secondUserId)
    return res.status(400).json("Second user id not specified");

  try {
    const chat = await PrivateChat.findOne({
      select: {
        id: true,
      },
      where: [
        { user1: { id: userId }, user2: { id: secondUserId } },
        { user1: { id: secondUserId }, user2: { id: userId } },
      ],
      relations: {
        user1: true,
        user2: true,
      },
    });

    if (!chat)
      return res.status(404).json("Private chat of these users not found");

    return res.json({
      chatId: chat.id,
    });
  } catch (err) {
    console.error("Error getting private chat:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const createPrivateChat = async (req: Request, res: Response) => {
  console.log("createPrivateChat request");

  const secondUserId = req.body.u2Id;

  const requestingUserId = extractUserIdFromRequest(req);
  if (
    !secondUserId ||
    !Number.isInteger(secondUserId) ||
    secondUserId === requestingUserId
  ) {
    return res.status(400).json("Wrong user id");
  }

  try {
    const chatExists =
      (await PrivateChat.findOne({
        select: {
          id: true,
        },
        where: [
          { user1: { id: requestingUserId }, user2: { id: secondUserId } },
          { user1: { id: secondUserId }, user2: { id: requestingUserId } },
        ],
        relations: {
          user1: true,
          user2: true,
        },
      })) !== null;

    if (chatExists) return res.status(400).json("Private chat already exists");

    const newBaseChat = new Chat();
    newBaseChat.type = "private";
    await newBaseChat.save();

    const newChat = new PrivateChat();
    newChat.baseChat = newBaseChat;
    newChat.user1 = { id: requestingUserId } as User;
    newChat.user2 = { id: secondUserId } as User;
    await newChat.save();

    const c = await PrivateChat.findOne({
      where: { id: newChat.id },
      relations: {
        user2: true,
      },
    });

    broadcastToUsers([newChat.user1.id, newChat.user2.id], "new chat", {
      type: "p",
      data: {
        id: c!.id,
        user2: c!.user2,
        unreadMessages: 0,
      },
    });

    return res
      .status(201)
      .json({ message: "Private chat successfully created", chat: newChat });
  } catch (err) {
    console.log("error while creating a private chat:", err);
    return res.status(500).json(null);
  }
};

export const getGroups = async (req: Request, res: Response) => {
  const fullInfo = Boolean(req.query.fullInfo) || false;
  const likeString = req.query.likeStr;
  console.log("getGroups request");

  if (!likeString) {
    console.log("error: getGroups request doesn't contain the search term");

    return res
      .status(400)
      .json({ message: "The request must contain the search term" });
  }

  try {
    let groups: any[] | null;

    if (!fullInfo) {
      groups = await GroupChat.find({
        where: {
          name: ILike("%" + likeString.toString().trim() + "%"),
          isPrivate: false,
        },
        select: ["id", "name", "isPrivate"],
      });
    } else {
      groups = await GroupChat.find({
        select: {
          id: true,
          name: true,
          isPrivate: true,
          creator: {
            id: true,
            firstName: true,
            lastName: true,
          },
          members: true,
        },
        relations: {
          creator: true,
          members: true,
        },
        where: {
          name: ILike("%" + likeString.toString().trim() + "%"),
          isPrivate: false,
        },
      });

      groups = groups.map((g) => {
        const { id, name, members, creator, ...gr } = g;

        return {
          ...gr,
          groupId: id,
          groupName: name,
          membersNumber: members.length,
          creator: {
            id: creator.id,
            name: creator.firstName + " " + creator.lastName,
          },
        };
      });
    }

    if (groups) {
      console.log("groups found");
      return res.status(200).json({ groups });
    } else {
      return res.status(404).json({ error: "groups not found" });
    }
  } catch (error) {
    console.error("Error fetching groups:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const createGroup = async (req: Request, res: Response) => {
  console.log("createGroup request");
  const groupData = req.body.data;

  if (!groupData) return res.status(400).json("Group data not found");
  if (!groupData.name) return res.status(400).json("Group name required");

  if (groupData.name.trim().length === 0)
    return res
      .status(400)
      .json({ errorTypes: ["name"], errorMessages: ["Некоректне ім'я"] });

  const requestingUserId = extractUserIdFromRequest(req);

  try {
    const newBaseChat = new Chat();
    newBaseChat.type = "group";
    await newBaseChat.save();

    const newGroup = new GroupChat();
    newGroup.baseChat = newBaseChat;
    newGroup.name = groupData.name.trim();
    newGroup.description = groupData.description?.trim() || null;
    newGroup.isPrivate = groupData.isPrivate || false;
    newGroup.creator = req.user as User;
    newGroup.members = [req.user as User];

    await newGroup.save();

    broadcastToUsers([requestingUserId], "new chat", {
      type: "g",
      data: {
        id: newGroup.id,
        name: newGroup.name,
      },
    });

    return res
      .status(201)
      .json({ message: "Group successfully created", chat: newGroup });
  } catch (err) {
    console.log("error while creating a group:", err);
    return res.status(500).json(null);
  }
};

export const joinGroup = async (req: Request, res: Response) => {
  console.log("joinGroup request");
  const groupId = req.body.groupId;

  if (!groupId) return res.status(400).json("Group id is required");
  if (!Number.isInteger(Number(groupId)))
    return res.status(400).json("Group id must be an integer");

  const requestingUserId = extractUserIdFromRequest(req);

  try {
    const group = await GroupChat.findOne({
      where: { id: groupId },
      relations: {
        members: true,
      },
    });

    if (!group) {
      console.log("Group with specified id not found");
      return res.status(404).json("Group with specified id not found");
    }

    if (group.isPrivate) {
      return res
        .status(403)
        .json(
          "You can't join the private group, you only can be added by a group administrator"
        );
    }

    if (group.members.some((m) => m.id === requestingUserId))
      return res.status(409).json("You are already a member of this group");

    group.members.push({ id: requestingUserId } as User);

    await group.save();

    broadcastToUsers([requestingUserId], "new chat", {
      type: "g",
      data: {
        id: group.id,
        name: group.name,
      },
    });

    console.log("Group member added");

    return res
      .status(201)
      .json({ message: "Group member successfully added", groupId: group.id });
  } catch (err) {
    console.log("error while adding a member to a group:", err);
    return res.status(500).json(null);
  }
};

export const addGroupMember = async (req: Request, res: Response) => {
  console.log("addGroupMember request");
  const { groupId, userId } = req.body;

  if (!groupId) return res.status(400).json("Group id is required");
  if (!userId) return res.status(400).json("User id is required");
  if (isNaN(Number(groupId)) || isNaN(Number(userId)))
    return res.status(400).json("Group and user ids must be numbers");
  if (!Number.isInteger(Number(groupId)) || !Number.isInteger(Number(userId)))
    return res.status(400).json("Group and user ids must be integers");

  const requestingUserId = extractUserIdFromRequest(req);

  try {
    const group = await GroupChat.findOne({
      where: { id: groupId },
      relations: {
        members: true,
        creator: true,
      },
    });

    if (!group) {
      console.log("Group with specified id not found");
      return res.status(404).json("Group with specified id not found");
    }

    if (group.creator.id !== requestingUserId)
      return res.status(403).json("You don't have right to add group members");

    if (group.members.some((m) => m.id === userId))
      return res.status(409).json("This user is already a member of the group");

    const user = await User.findOneBy({ id: userId });
    if (!user) return res.status(400).json("There is no user with this id");

    group.members.push({ id: userId } as User);

    await group.save();

    broadcastToUsers(
      group.members.map((m) => m.id),
      "new group member",
      {
        groupId: groupId,
      }
    );

    broadcastToUsers([user.id], "new chat", {
      type: "g",
      data: {
        id: group.id,
        name: group.name,
      },
    });

    console.log("Group member added");

    return res
      .status(201)
      .json({ message: "Group member successfully added", newMember: user });
  } catch (err) {
    console.log("Error while adding a member to a group:", err);
    return res.status(500).json(null);
  }
};

export const removeGroupMember = async (req: Request, res: Response) => {
  console.log("removeGroupMember request");
  const { groupId, userId } = req.body;

  if (!groupId) return res.status(400).json("Group id is required");
  if (!userId) return res.status(400).json("User id is required");
  if (isNaN(Number(groupId)) || isNaN(Number(userId)))
    return res.status(400).json("Group and user ids must be numbers");
  if (!Number.isInteger(Number(groupId)) || !Number.isInteger(Number(userId)))
    return res.status(400).json("Group and user ids must be integers");

  const requestingUserId = extractUserIdFromRequest(req);

  try {
    const group = await GroupChat.findOne({
      where: { id: groupId },
      relations: {
        members: true,
        creator: true,
      },
    });

    if (!group) {
      console.log("Group with specified id not found");
      return res.status(404).json("Group with specified id not found");
    }

    if (group.creator.id !== requestingUserId)
      return res
        .status(403)
        .json("You don't have right to remove group members");

    group.members = group.members.filter((m) => m.id !== userId);

    await group.save();

    broadcastToUsers(
      group.members.map((m) => m.id),
      "group member removed",
      {
        groupId: groupId,
      }
    );

    console.log("Group member removed");

    return res
      .status(201)
      .json({ message: "Group member successfully removed", userId });
  } catch (err) {
    console.log("Error while removed a member from a group:", err);
    return res.status(500).json(null);
  }
};

export const getChannels = async (req: Request, res: Response) => {
  const fullInfo = Boolean(req.query.fullInfo) || false;
  const likeString = req.query.likeStr;
  console.log("getChannels request");

  if (!likeString) {
    console.log("error: getChannels request doesn't contain the search term");

    return res
      .status(400)
      .json({ message: "The request must contain the search term" });
  }

  try {
    let channels: any[] | null;

    if (!fullInfo) {
      channels = await Channel.find({
        where: { name: ILike("%" + likeString.toString().trim() + "%") },
        select: ["id", "name"],
      });
    } else {
      channels = await Channel.find({
        select: {
          id: true,
          name: true,
          creator: {
            id: true,
            firstName: true,
            lastName: true,
          },
          subscribers: true,
        },
        relations: {
          creator: true,
          subscribers: true,
        },
        where: {
          name: ILike("%" + likeString.toString().trim() + "%"),
        },
      });

      channels = channels.map((c) => {
        const { id, name, subscribers, creator, ...ch } = c;

        return {
          ...ch,
          channelId: id,
          channelName: name,
          subscribersNumber: subscribers.length,
          creator: {
            id: creator.id,
            name: creator.firstName + " " + creator.lastName,
          },
        };
      });
    }

    if (channels) {
      console.log("channels found");
      return res.status(200).json({ channels: channels });
    } else {
      return res.status(404).json({ error: "channels not found" });
    }
  } catch (error) {
    console.error("Error fetching channels:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const subscribeChannel = async (req: Request, res: Response) => {
  console.log("subscribeChannel request");
  const channelId = req.body.channelId;

  if (!channelId) return res.status(400).json("Channel id is required");
  if (!Number.isInteger(Number(channelId)))
    return res.status(400).json("Channel id must be an integer");

  const requestingUserId = extractUserIdFromRequest(req);

  try {
    const channel = await Channel.findOne({
      where: { id: channelId },
      relations: {
        subscribers: true,
      },
    });

    if (!channel) {
      console.log("Channel with specified id not found");
      return res.status(404).json("Channel with specified id not found");
    }

    if (channel.subscribers.some((s) => s.id === requestingUserId))
      return res.status(409).json("You are already subscribed to this channel");

    channel.subscribers.push({ id: requestingUserId } as User);

    await channel.save();

    console.log("Channel subscriber added");

    broadcastToUsers([requestingUserId], "new chat", {
      type: "c",
      data: {
        id: channel.id,
        name: channel.name,
      },
    });

    return res.status(201).json({
      message: "You have been successfully subscribed to the channel",
      channelId: channel.id,
    });
  } catch (err) {
    console.log("error while subscribing a user to a channel:", err);
    return res.status(500).json(null);
  }
};

export const createChannel = async (req: Request, res: Response) => {
  console.log("createChannel request");
  const channelData = req.body.data;

  if (!channelData) return res.status(400).json("Channel data not found");
  if (!channelData.name) return res.status(400).json("Channel name required");

  if (channelData.name.trim().length === 0)
    return res
      .status(400)
      .json({ errorTypes: ["name"], errorMessages: ["Некоректне ім'я"] });

  const requestingUserId = extractUserIdFromRequest(req);

  try {
    const newBaseChat = new Chat();
    newBaseChat.type = "channel";
    await newBaseChat.save();

    const newChannel = new Channel();
    newChannel.baseChat = newBaseChat;
    newChannel.name = channelData.name.trim();
    newChannel.description = channelData.description?.trim() || null;
    newChannel.creator = req.user as User;
    newChannel.subscribers = [req.user as User];

    let linkName = transliterate(newChannel.name)
      .toLowerCase()
      .substring(0, 30);

    let i = 1;
    while (await Channel.findOneBy({ linkName: linkName })) {
      linkName = linkName.substring(0, 30 - i.toString().length) + i.toString();
      i++;
    }

    newChannel.linkName = linkName;

    await newChannel.save();

    broadcastToUsers([requestingUserId], "new chat", {
      type: "c",
      data: {
        id: newChannel.id,
        name: newChannel.name,
      },
    });

    return res
      .status(201)
      .json({ message: "Channel successfully created", chat: newChannel });
  } catch (err) {
    console.log("error while creating a channel:", err);
    return res.status(500).json(null);
  }
};
