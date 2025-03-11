import {
  BaseEntity,
  Column,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./User";
import { Project } from "./Project";

@Entity()
export class Department extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    length: 100,
    unique: true,
  })
  name: string;

  @OneToMany(() => User, (user) => user.department)
  employees: User[];

  @OneToMany(() => Project, (project) => project.department)
  projects: Project[];

  @OneToOne(() => User, (head) => head.headOf)
  @JoinColumn()
  head: User | null;
}
