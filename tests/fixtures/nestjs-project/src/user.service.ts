import { Injectable } from '@nestjs/common';

@Injectable()
export class UserService {
  async createUser(dto: CreateUserDto): Promise<User> {
    // implementation
  }

  async findOne(id: string): Promise<User> {
    // implementation
  }
}
