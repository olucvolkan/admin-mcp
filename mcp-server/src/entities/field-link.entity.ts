import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Endpoint } from './endpoint.entity';
import { ResponseField } from './response-field.entity';

@Entity()
export class FieldLink {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  fromFieldId: number;

  @Column()
  toEndpointId: number;

  @Column()
  toParamName: string;

  @Column({ nullable: true })
  relationType: string; // e.g., 'direct', 'transformation', etc.

  @Column({ nullable: true })
  description: string;

  @ManyToOne(() => ResponseField, (field) => field.fieldLinks)
  @JoinColumn({ name: 'fromFieldId' })
  fromField: ResponseField;

  @ManyToOne(() => Endpoint, (endpoint) => endpoint.id)
  @JoinColumn({ name: 'toEndpointId' })
  toEndpoint: Endpoint;
}
