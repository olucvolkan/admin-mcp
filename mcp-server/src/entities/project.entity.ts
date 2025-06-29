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

  @Column({ nullable: true })
  baseUrl: string;

  @Column({ nullable: true })
  domain: string;

  @Column({ nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Endpoint, (endpoint) => endpoint.project)
  endpoints: Endpoint[];
}
