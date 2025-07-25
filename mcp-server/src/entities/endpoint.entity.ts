import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Project } from './project.entity';
import { RequestParameter } from './request-parameter.entity';
import { ResponseField } from './response-field.entity';
import { ResponseMessage } from './response-message.entity';

@Entity()
export class Endpoint {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  projectId: number;

  @Column()
  path: string;

  @Column()
  method: string;

  @Column({ nullable: true })
  summary: string;

  @Column({ type: 'text', nullable: true })
  promptText: string; // AI generated natural language description

  @Column({ type: 'text', nullable: true })
  embeddingVector: string; // JSON string of embedding vector for semantic search

  @Column({ type: 'text', nullable: true })
  keywords: string; // JSON array of keywords for lexical matching

  @Column({ type: 'text', nullable: true })
  intentPatterns: string; // JSON array of user intent patterns

  @ManyToOne(() => Project, (project) => project.endpoints)
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @OneToMany(() => RequestParameter, (param) => param.endpoint)
  requestParameters: RequestParameter[];

  @OneToMany(() => ResponseField, (field) => field.endpoint)
  responseFields: ResponseField[];

  @OneToMany(() => ResponseMessage, (message) => message.endpoint)
  responseMessages: ResponseMessage[];
}
