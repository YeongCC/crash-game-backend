import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';

@WebSocketGateway({ cors: true })
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly gameService: GameService) { }

  afterInit(server: Server) {
    this.gameService.setServer(server);
    this.gameService.startLoop();
  }

  handleConnection(client: Socket) {
    this.gameService.registerClient(client);
  }

  handleDisconnect(client: Socket) {
    this.gameService.unregisterClient(client);
  }

  @SubscribeMessage('place_bet')
  handleBet(client: Socket, data: { amount: number; autoCashout?: number }) {
    this.gameService.placeBet(client.id, data.amount, data.autoCashout);
  }

  @SubscribeMessage('cash_out')
  handleCashOut(client: Socket) {
    this.gameService.cashOut(client.id);
  }

  @SubscribeMessage('cancel_bet')
  handleCancelBet(client: Socket) {
    this.gameService.cancelBet(client.id);
  }
}
