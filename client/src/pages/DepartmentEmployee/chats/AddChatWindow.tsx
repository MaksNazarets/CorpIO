import { useState } from "react";
import ChatSearchForm from "./components/ChatSearchForm";
import GroupCreationForm from "./components/GroupCreationForm";
import ChannelCreationForm from "./components/ChannelCreationForm";
import { User } from "../../../types";
import { useAuthContext } from "../../../context/AuthContext";

type Props = {
  chatType: "g" | "c";
};

const AddChatWindow = ({ chatType }: Props) => {
  const { user } = useAuthContext();
  const [selectedTab, setSelectedTab] = useState<"find" | "create">("find");

  return (
    <div className="add-chat-window">
      <ul className="window-tab-container">
        <li
          onClick={() => setSelectedTab("find")}
          className={selectedTab === "find" ? "open" : ""}
        >
          Знайти
        </li>
        {((chatType === "c" && (user as User).isHeadOfDepartment) ||
          chatType !== "c") && (
          <li
            onClick={() => setSelectedTab("create")}
            className={selectedTab === "create" ? "open" : ""}
          >
            Створити
          </li>
        )}
      </ul>
      {selectedTab === "find" ? (
        <ChatSearchForm chatType={chatType} />
      ) : chatType === "g" ? (
        <GroupCreationForm />
      ) : (
        <ChannelCreationForm />
      )}
    </div>
  );
};

export default AddChatWindow;
