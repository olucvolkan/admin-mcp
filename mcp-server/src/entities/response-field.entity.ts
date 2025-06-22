import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Endpoint } from './endpoint.entity';
import { FieldLink } from './field-link.entity';

@Entity()
export class ResponseField {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  endpointId: number;

  @Column()
  jsonPath: string; // JSONPath to the field in response

  @Column({ nullable: true })
  type: string;

  @Column({ nullable: true })
  description: string;

  @ManyToOne(() => Endpoint, (endpoint) => endpoint.responseFields)
  @JoinColumn({ name: 'endpointId' })
  endpoint: Endpoint;

  @OneToMany(() => FieldLink, (link) => link.fromField)
  fieldLinks: FieldLink[];
}
