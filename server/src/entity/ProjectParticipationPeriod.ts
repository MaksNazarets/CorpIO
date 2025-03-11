import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ProjectTeamMember } from "./ProjectTeamMember";

@Entity()
export class ProjectParticipationPeriod extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ProjectTeamMember, (worker) => worker.participationPeriods)
  ProjectTeamMember: ProjectTeamMember;

  @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  startDate: Date;

  @Column({ type: "timestamp", nullable: true })
  endDate: Date;
}
