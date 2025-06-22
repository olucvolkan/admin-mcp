import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Endpoint } from './endpoint.entity';

@Entity()
export class ResponseMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  endpointId: number;

  @Column()
  statusCode: number; // HTTP status code (200, 400, 404, etc.)

  @Column()
  message: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  suggestion: string; // Suggested action for this response

  @ManyToOne(() => Endpoint, (endpoint) => endpoint.responseMessages)
  @JoinColumn({ name: 'endpointId' })
  endpoint: Endpoint;
}
