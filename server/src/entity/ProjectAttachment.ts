import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";
import { Project } from "./Project";

@Entity()
export class ProjectAttachment extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  filename: string;

  @Column()
  filenameOnDisk: string;

  @ManyToOne(() => Project)
  project: Project;
  
  @Column({ default: 0 })
  size: number;
}
