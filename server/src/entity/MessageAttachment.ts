import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";
import { Message } from "./Message";

@Entity()
export class MessageAttachment extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Message, (msg) => msg.attachments)
  message: Message;

  @Column()
  filename: string;

  @Column()
  filenameOnDisk: string;

  @Column({default: 0})
  size: number;
}
