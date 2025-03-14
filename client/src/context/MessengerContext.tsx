import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { useQuery } from "react-query";
import { axiosInstance } from "../untils";
import { useParams } from "react-router-dom";
import { useAuthContext } from "./AuthContext";

type FilterType = {
  text: string;
  departmentIds?: number[];
};

type ChatItemUser = {
  id: number;
  firstName: string;
  lastName: string;
  isOnline: boolean;
};

type PrivateChatListItem = {
  id: number;
  user1?: ChatItemUser;
  user2?: ChatItemUser;
  unreadMsgsNumber: number;
};

type GroupChatListItem = { id: number; name: string; unreadMsgsNumber: number };

type Chats = {
  privateChats: PrivateChatListItem[];
  groups: GroupChatListItem[];
  channels: GroupChatListItem[];
} | null;

type MessengerContextType = {
  chats: Chats;
  chatFilters: FilterType;
  setChatFilters: React.Dispatch<React.SetStateAction<FilterType>>;
  isChatsLoading: boolean;
  openChatType?: string;
  openChatId?: number;
  addChat?: (
    type: "p" | "g" | "c",
    data: PrivateChatListItem | GroupChatListItem
  ) => void;
};

export const MessengerContext = createContext<MessengerContextType | null>(
  null
);

export const useMessengerContext = (): MessengerContextType => {
  const context = useContext(MessengerContext);
  if (!context) {
    throw new Error(
      "useMessengerContext must be used within a MessengerProvider"
    );
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const MessengerProvider = ({ children }: AuthProviderProps) => {
  const [chatFilters, setChatFilters] = useState<FilterType>({ text: "" });
  const [chats, setChats] = useState<Chats | null>(null);
  const { socket } = useAuthContext();

  const { chatType: openChatType, chatId: openChatId } = useParams();

  const { isLoading: isChatsLoading } = useQuery({
    queryKey: ["userChats"],
    queryFn: () => axiosInstance.get("/chats/get-user-chats"),
    onSuccess(res) {
      setChats(res.data);
    },
    onError(err: any) {
      console.log("error:", err.response.data);
    },
  });

  useEffect(() => {
    if (socket) {
      socket.on("new chat", (data) => {
        console.log("new chat", data);
        if (data.type === "p") {
          setChats((prev: Chats) => {
            return (
              prev && {
                ...prev,
                privateChats: [data.data, ...prev.privateChats],
              }
            );
          });
        } else if (data.type === "g") {
          setChats((prev: Chats) => {
            return (
              prev && {
                ...prev,
                groups: [data.data, ...prev.groups],
              }
            );
          });
        } else if (data.type === "c") {
          setChats((prev: Chats) => {
            return (
              prev && {
                ...prev,
                channels: [data.data, ...prev.channels],
              }
            );
          });
        }
      });
      socket.on("user online status changed", (data) => {
        console.log("user online status changed", data);
        setChats((prev: Chats) => {
          const updatedPrivateChats = prev?.privateChats.map((pc) => {
            if (pc.user1?.id === data.userId)
              return { ...pc, user1: { ...pc.user1, isOnline: data.isOnline } };
            else if (pc.user2?.id === data.userId)
              return { ...pc, user2: { ...pc.user2, isOnline: data.isOnline } };

            return pc;
          });

          return (
            prev && {
              ...prev,
              privateChats: updatedPrivateChats as PrivateChatListItem[],
            }
          );
        });
      });
      return () => {
        socket.off("messages seen");
        socket.off("user online status changed");
      };
    }
  }, [socket]);

  return (
    <MessengerContext.Provider
      value={{
        chats,
        chatFilters,
        setChatFilters,
        isChatsLoading,
        openChatType,
        openChatId: Number(openChatId),
      }}
    >
      {children}
    </MessengerContext.Provider>
  );
};
