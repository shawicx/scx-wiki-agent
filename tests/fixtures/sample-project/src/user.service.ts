export class UserService {
  createUser(name: string): void {
    console.log(`Creating user: ${name}`);
  }

  deleteUser(id: string): void {
    console.log(`Deleting user: ${id}`);
  }
}
