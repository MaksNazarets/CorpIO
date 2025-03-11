import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Chat } from "./Chat";
import { MessageAttachment } from "./MessageAttachment";
import { User } from "./User";

@Entity()
export class Message extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Chat, (chat) => chat.messages)
  chat: Chat;

  @ManyToOne(() => User)
  sender: User;

  @Column({ type: "varchar", nullable: true })
  text: string;

  @OneToMany(() => MessageAttachment, (att) => att.message)
  attachments: MessageAttachment[];

  @Column({ default: false })
  isSeen: boolean;

  @CreateDateColumn({ type: "timestamp with time zone" })
  timestamp: Date;

  @OneToOne(() => Message)
  @JoinColumn()
  isReplyTo: Message | null;
}
