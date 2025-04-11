import {
    Catch,
    ArgumentsHost,
    ExceptionFilter,
    HttpException,
  } from '@nestjs/common';
  import { Response } from 'express';
  
  @Catch()
  export class AllExceptionsFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
      const ctx = host.switchToHttp();
      const res = ctx.getResponse<Response>();
  
      const status = exception instanceof HttpException
        ? exception.getStatus()
        : 500;
  
      console.error('🔥 Unhandled Error:', exception);
  
      res.status(status).json({
        statusCode: status,
        message: 'Something went wrong!',
      });
    }
  }
  