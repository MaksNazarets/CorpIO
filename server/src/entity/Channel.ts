import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Chat } from "./Chat";
import { User } from "./User";

@Entity()
export class Channel extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ unique: true })
  linkName: string;

  @ManyToOne(() => User)
  creator: User;

  @CreateDateColumn({ type: "timestamp" })
  createdAt: Date;

  @OneToOne(() => Chat)
  @JoinColumn()
  baseChat: Chat;

  @ManyToMany(() => User, (user) => user.subscriptions)
  @JoinTable({ name: "channel_subscriber" })
  subscribers: User[];
}
