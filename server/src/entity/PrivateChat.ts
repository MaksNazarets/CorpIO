import {
  BaseEntity,
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./User";
import { Chat } from "./Chat";

@Entity()
@Check(`"user1Id" <> "user2Id"`)
export class PrivateChat extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  user1: User;

  @ManyToOne(() => User)
  user2: User;

  @CreateDateColumn({ type: "timestamp" })
  createdAt: Date;

  @OneToOne(() => Chat)
  @JoinColumn()
  baseChat: Chat;
}
