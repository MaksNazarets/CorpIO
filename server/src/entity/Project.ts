import {
  BaseEntity,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ProjectTeamMember as ProjectTeamMember } from "./ProjectTeamMember";
import { User } from "./User";
import { ProjectAttachment } from "./ProjectAttachment";
import { GroupChat } from "./GroupChat";
import { Department } from "./Department";

@Entity()
export class Project extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  name: string;

  @Column({ type: "text" })
  description: string;

  @ManyToOne(() => User)
  manager: User;

  @Column({
    type: "timestamp with time zone",
    default: () => "CURRENT_TIMESTAMP",
  })
  startDate: Date;

  @Column({ type: "timestamp with time zone", nullable: true, default: null })
  endDate: Date;

  @OneToMany(() => ProjectTeamMember, (member) => member.project)
  teamMembers: ProjectTeamMember[];

  @OneToMany(() => ProjectAttachment, (att) => att.project)
  attachments: ProjectAttachment[];

  @OneToOne(() => GroupChat)
  @JoinColumn()
  groupChat: GroupChat;

  @ManyToOne(() => Department, (dep) => dep.projects, { nullable: true })
  department: Department;
}
