import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToMany,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn
} from "typeorm";
import { Channel } from "./Channel";
import { Department } from "./Department";
import { GroupChat } from "./GroupChat";
import { PrivateChat } from "./PrivateChat";

@Entity()
export class User extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    length: 50,
  })
  firstName: string;

  @Column({
    length: 70,
  })
  lastName: string;

  @Column({
    length: 50,
    nullable: true,
  })
  patronymic: string;

  @Index({ unique: true })
  @Column({ length: 30, unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column({ unique: true, length: 13 })
  phoneNumber: string;

  @ManyToOne(() => Department, (dep) => dep.employees)
  department: Department;

  @Column({ length: 100 })
  position: string;

  @CreateDateColumn({ type: "timestamp" })
  registrationDate: Date;

  @Column({ type: "char", length: 60 })
  password: string;

  @Column({ default: false })
  isOnline: boolean;

  @Column({ nullable: true })
  lastTimeOnline: Date;

  @Column({ default: false })
  isSuperAdmin: boolean;

  @OneToOne(() => Department, (department) => department.head)
  headOf: Department;

  @ManyToMany(() => Channel, (channel) => channel.subscribers)
  subscriptions: Channel[];

  @ManyToMany(() => GroupChat, (group) => group.members)
  memberships: GroupChat[];

  @OneToMany(() => PrivateChat, (chat) => chat.user1)
  user1Chats: PrivateChat[];

  @OneToMany(() => PrivateChat, (chat) => chat.user2)
  user2Chats: PrivateChat[];

  @Column({ default: true })
  isActive: boolean;

  getPrivateChats = () => {
    return this.user1Chats.concat(this.user2Chats);
  };
}
