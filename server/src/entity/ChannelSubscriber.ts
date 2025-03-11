import {
  BaseEntity,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";
import { Channel } from "./Channel";
import { User } from "./User";

@Entity()
export class ChannelSubscriber extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  user: User;

  @ManyToOne(() => Channel, (channel) => channel.subscribers)
  channel: Channel;

  @CreateDateColumn({ type: "timestamp" })
  joinedAt: Date;
}
