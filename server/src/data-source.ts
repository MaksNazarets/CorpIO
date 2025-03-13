import "reflect-metadata";
import { DataSource } from "typeorm";
import { Channel } from "./entity/Channel";
import { Chat } from "./entity/Chat";
import { Department } from "./entity/Department";
import { GroupChat } from "./entity/GroupChat";
import { Message } from "./entity/Message";
import { MessageAttachment } from "./entity/MessageAttachment";
import { PrivateChat } from "./entity/PrivateChat";
import { User } from "./entity/User";
import { Project } from "./entity/Project";
import { ProjectTeamMember } from "./entity/ProjectTeamMember";
import { ProjectParticipationPeriod } from "./entity/ProjectParticipationPeriod";
import { ProjectAttachment } from "./entity/ProjectAttachment";

export const AppDataSource = new DataSource({
  type: "postgres",

  host: process.env.DB_HOST,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,

  synchronize: true,
  logging: false,
  entities: [
    User,
    Department,
    Chat,
    PrivateChat,
    GroupChat,
    Channel,
    Message,
    MessageAttachment,
    Project,
    ProjectTeamMember,
    ProjectParticipationPeriod,
    ProjectAttachment,
  ],
  migrations: [],
  subscribers: [],
  ssl: {
    rejectUnauthorized: false,
  },
});
