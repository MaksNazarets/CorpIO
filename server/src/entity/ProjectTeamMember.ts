import {
  BaseEntity,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Project } from "./Project";
import { User } from "./User";
import { ProjectParticipationPeriod } from "./ProjectParticipationPeriod";

@Entity()
export class ProjectTeamMember extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Project, (project) => project.teamMembers)
  project: Project;

  @ManyToOne(() => User)
  user: User;

  @OneToMany(
    () => ProjectParticipationPeriod,
    (period) => period.ProjectTeamMember
  )
  participationPeriods: ProjectParticipationPeriod[];
}
