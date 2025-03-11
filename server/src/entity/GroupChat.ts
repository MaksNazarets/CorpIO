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
  PrimaryGeneratedColumn
} from "typeorm";
import { Chat } from "./Chat";
import { User } from "./User";

@Entity()
export class GroupChat extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: false })
  isPrivate: boolean;

  @ManyToOne(() => User)
  creator: User;

  @CreateDateColumn({ type: "timestamp" })
  createdAt: Date;

  @OneToOne(() => Chat)
  @JoinColumn()
  baseChat: Chat;

  @ManyToMany(() => User, (user) => user.memberships)
  @JoinTable({ name: "group_member" })
  members: User[];
}
