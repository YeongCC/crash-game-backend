import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private users: Repository<User>,
  ) { }

  async getOrCreate(username: string): Promise<User> {
    let user = await this.users.findOne({ where: { username } });
    if (user) return user;

    try {
      const newUser = this.users.create({ username });
      return await this.users.save(newUser);
    } catch (err) {
      if (err.code === '23505') {
        return await this.users.findOne({ where: { username } });
      }
      throw err; 
    }
  }

  async getBalance(username: string): Promise<number> {
    const user = await this.getOrCreate(username);
    return Number(user.balance);
  }

  async updateBalance(username: string, delta: number): Promise<User> {
    const user = await this.getOrCreate(username);
    const newBalance = Number(user.balance) + delta;
    if (newBalance < 0) throw new Error('Insufficient balance');
    user.balance = newBalance;
    return this.users.save(user);
  }
}
