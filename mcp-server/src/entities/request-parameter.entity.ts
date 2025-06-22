import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Endpoint } from './endpoint.entity';

@Entity()
export class RequestParameter {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  in: string;

  @Column({ nullable: true })
  required?: boolean;

  @ManyToOne(() => Endpoint, (endpoint) => endpoint.id)
  endpoint: Endpoint;
}
