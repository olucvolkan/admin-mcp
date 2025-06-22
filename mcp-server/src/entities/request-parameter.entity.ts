import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Endpoint } from './endpoint.entity';

@Entity()
export class RequestParameter {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  endpointId: number;

  @Column()
  name: string;

  @Column()
  in: string; // path, query, header, body

  @Column({ nullable: true })
  type: string;

  @Column({ default: false })
  required: boolean;

  @Column({ nullable: true })
  description: string;

  @ManyToOne(() => Endpoint, (endpoint) => endpoint.requestParameters)
  @JoinColumn({ name: 'endpointId' })
  endpoint: Endpoint;
}
