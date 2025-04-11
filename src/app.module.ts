import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GameModule } from './game/game.module';
import { UserService } from './user/user.service';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from './user/user.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<TypeOrmModuleOptions> => {
        const driver = config.get<'mysql' | 'postgres'>('DB_DRIVER');
    
        return {
          type: driver,
          host: config.get<string>(driver === 'mysql' ? 'MYSQL_DB_HOST' : 'POSTGRES_DB_HOST'),
          port: Number(config.get(driver === 'mysql' ? 'MYSQL_DB_PORT' : 'POSTGRES_DB_PORT')),
          username: config.get<string>(driver === 'mysql' ? 'MYSQL_DB_USER' : 'POSTGRES_DB_USER'),
          password: config.get<string>(driver === 'mysql' ? 'MYSQL_DB_PASS' : 'POSTGRES_DB_PASS'),
          database: config.get<string>(driver === 'mysql' ? 'MYSQL_DB_NAME' : 'POSTGRES_DB_NAME'),
          entities: [User],
          synchronize: true,
          ssl: {
            rejectUnauthorized: false, 
          },
        } as TypeOrmModuleOptions;
      },
    }),
    
    TypeOrmModule.forFeature([User]),
    GameModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
