import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('crashusers')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column('decimal', { precision: 10, scale: 2, default: 1000.00 })
  balance: number;
}
