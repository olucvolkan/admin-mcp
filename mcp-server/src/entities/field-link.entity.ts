import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Endpoint } from './endpoint.entity';
import { ResponseField } from './response-field.entity';

@Entity()
export class FieldLink {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ResponseField, (field) => field.id)
  sourceField: ResponseField;

  @ManyToOne(() => Endpoint, (endpoint) => endpoint.id)
  targetEndpoint: Endpoint;

  @Column()
  targetParam: string;
}
