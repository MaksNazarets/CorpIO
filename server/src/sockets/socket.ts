import { Server } from "socket.io";
import {
  getNewMessages,
  markMsgsAsSeen,
  processChannelPost,
  processGroupMessage,
  processPrivateMessage,
} from "../Controllers/messageController";
import { User } from "../entity/User";
import { io } from "..";

export async function broadcastToUsers(
  userIds: number[],
  event: string,
  data: any
) {
  await io.fetchSockets().then((sockets) => {
    sockets.forEach((socket) => {
      if (userIds.includes(socket.data.userId)) {
        socket.emit(event, data);
        console.log(
          `broadcasted "${event}" to socket.id client ${socket.id} (${socket.data.user.username})`
        );
      }
    });
  });
}

export const updateUserOnlineStatus = (io: Server, user: User) => {
  io.fetchSockets().then(async (sockets) => {
    const userSocketClients = sockets.filter((s) => s.data.userId === user.id);
    try {
      const u = await User.findOne({
        select: {
          id: true,
          isOnline: true,
          lastTimeOnline: true,
          user1Chats: {
            id: true,
            user2: {
              id: true,
            },
          },
          user2Chats: {
            id: true,
            user1: {
              id: true,
            },
          },
        },
        where: {
          id: user.id,
        },
        relations: {
          user1Chats: {
            user2: true,
          },
          user2Chats: {
            user1: true,
          },
        },
      });
      if (!u) return;

      u.isOnline = userSocketClients.length !== 0;
      u.lastTimeOnline = new Date();

      await u.save();

      broadcastToUsers(
        u
          .getPrivateChats()
          .map((chat) => (chat.user1 ? chat.user1.id : chat.user2.id)),
        "user online status changed",
        { userId: u.id, isOnline: u.isOnline }
      );
    } catch (err) {
      console.error("Couldn't update user online status:", err);
    }
  });
};

const handleSockets = () => {
  io.on("connection", async (socket) => {
    try {
      const user = socket.data.user as User;
      console.log(`user connected: ${socket.id} (${user?.username})`);
      updateUserOnlineStatus(io, user);

      socket.data.userId = user.id;

      socket.on("get new messages", (chatData, callback) => {
        console.log("get new msgs request:", chatData);
        getNewMessages(chatData, callback, user);
      });

      socket.on("private-message", async (msgData, callback) => {
        processPrivateMessage(msgData, callback, user);
      });

      socket.on("group-message", async (msgData, callback) => {
        processGroupMessage(msgData, callback, user);
      });

      socket.on("channel-post", async (postData, callback) => {
        processChannelPost(postData, callback, user);
      });

      socket.on("mark all msgs as seen", async (chatId: number) => {
        console.log("mark as seen request, chatId:", chatId);
        markMsgsAsSeen(chatId, user.id, io);
      });

      socket.on("disconnect", () => {
        console.log(`user disconnected: ${socket.id} (${user?.username})`);
        updateUserOnlineStatus(io, user);
      });
    } catch (err) {
      console.log("socket.io error: ", err);
    }
  });
};

export default handleSockets;
