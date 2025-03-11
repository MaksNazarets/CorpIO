import {
  BaseEntity,
  Check,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { GroupChat } from "./GroupChat";
import { User } from "./User";

@Entity()
export class GroupMember extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  user: User;

  @ManyToOne(() => GroupChat, (group)=>group.members)
  group: GroupChat;

  @CreateDateColumn({ type: "timestamp" })
  joinedAt: Date;
}
