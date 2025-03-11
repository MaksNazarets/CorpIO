import {
  BaseEntity,
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Message } from "./Message";

@Entity()
export class Chat extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  type: "private" | "group" | "channel"; 

  @OneToMany(() => Message, (msg) => msg.chat)
  messages: Message[];
}
