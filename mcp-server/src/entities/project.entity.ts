import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Endpoint } from './endpoint.entity';

@Entity()
export class Project {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  version: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Endpoint, (endpoint) => endpoint.project)
  endpoints: Endpoint[];
}
