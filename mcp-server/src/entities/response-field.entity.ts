import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Endpoint } from './endpoint.entity';

@Entity()
export class ResponseField {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToOne(() => Endpoint, (endpoint) => endpoint.id)
  endpoint: Endpoint;
}
