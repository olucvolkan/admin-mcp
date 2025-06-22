import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Endpoint } from './endpoint.entity';

@Entity()
export class ResponseMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  code: number;

  @Column()
  message: string;

  @ManyToOne(() => Endpoint, (endpoint) => endpoint.id)
  endpoint: Endpoint;
}
