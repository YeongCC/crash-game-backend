import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import {
  generateCrashPoint,
  generateServerSeed,
  calculateScalingFactor,
  generateQuotaPool,
} from './utils/gameUtils';

interface Bet {
  clientId: string;
  amount: number;
  cashedOut: boolean;
  multiplierAtCashout?: number;
}

@Injectable()
export class GameService {
  private server: Server;
  private clients: Record<string, string> = {};
  private gameState: 'waiting' | 'running' | 'crashed' = 'waiting';
  private multiplier = 1.0;
  private crashPoint = 2.5;
  private bets: Bet[] = [];
  private recentPayouts: number[] = [];
  private interval: ReturnType<typeof setInterval>;
  private countdown: number = 0;
  private quotaPool: ('low' | 'mid' | 'high')[] = [];
  private currentRound = 0;
  
  setServer(server: Server) {
    this.server = server;
  }

  registerClient(client: any) {
    const username = `Player_${Math.floor(Math.random() * 99999)}`;
    this.clients[client.id] = username;
    this.server.to(client.id).emit('init', { username });
  }

  unregisterClient(client: any) {
    delete this.clients[client.id];
  }

  startLoop() {
    this.loopWaiting();
  }

  private loopWaiting() {
    this.gameState = 'waiting';
    this.multiplier = 1.0;
    this.bets = [];
    this.countdown = 5;

    this.broadcastState();

    this.server.emit('game_state', {
      state: 'waiting',
      multiplier: 0,
      crashPoint: null,
      countdown: this.countdown,
      bets: [],
    });

    const countdownInterval = setInterval(() => {
      if (this.countdown > 1) {
        this.countdown--;
        this.server.emit('game_state', {
          state: 'waiting',
          multiplier: 0,
          crashPoint: null,
          countdown: this.countdown,
          bets: this.bets.map((b) => ({
            clientId: b.clientId,
            username: this.clients[b.clientId],
            amount: b.amount,
            cashedOut: b.cashedOut,
            multiplier: b.multiplierAtCashout ?? null,
          })),
        });
      } else {
        clearInterval(countdownInterval);
        this.startGame(); 
      }

    }, 1000);
  }

  private startGame() {
    this.gameState = 'running';
    
    if (this.currentRound % 10 === 0) {
      this.quotaPool = generateQuotaPool();
    }
  
    const quotaType = this.quotaPool[this.currentRound % 10];
    const scaling = calculateScalingFactor(this.recentPayouts.slice(-10));
    const seed = generateServerSeed();
    this.crashPoint = generateCrashPoint(quotaType, seed, scaling);
    this.crashPoint = 5;
    console.log("crashPoint: "+this.crashPoint)
    this.countdown = 0;
    this.interval = setInterval(() => {
      this.multiplier = +(this.multiplier + 0.01).toFixed(2);

      if (this.multiplier >= this.crashPoint) {
        clearInterval(this.interval);
        this.endGame();
      }

      this.broadcastState();
    }, 100);
    this.currentRound++;
  }

  private endGame() {
    this.gameState = 'crashed';
    this.bets.forEach(bet => {
      if (!bet.cashedOut) {
        bet.cashedOut = true;
        bet.multiplierAtCashout = 0;
      }
    });

    const max = Math.max(...this.bets.map(b => b.multiplierAtCashout || 0), 0);
    this.recentPayouts.push(max);
    if (this.recentPayouts.length > 10) this.recentPayouts.shift();

    this.broadcastState(); 
    this.countdown = 5;
    this.gameState = 'waiting';
    setTimeout(() => this.loopWaiting(), 0);
  }

  placeBet(clientId: string, amount: number) {
    if (this.gameState !== 'waiting') return;
    const already = this.bets.find(b => b.clientId === clientId);
    if (already) return;
    this.bets.push({ clientId, amount, cashedOut: false });
    this.broadcastState();
  }

  cashOut(clientId: string) {
    const bet = this.bets.find(b => b.clientId === clientId && !b.cashedOut);
    if (!bet) return;
    bet.cashedOut = true;
    bet.multiplierAtCashout = this.multiplier;
    this.broadcastState();
  }

  private broadcastState() {
    this.server.emit('game_state', {
      state: this.gameState,
      multiplier: this.multiplier,
      crashPoint: this.crashPoint,
      countdown: this.countdown,
      bets: this.bets.map(b => ({
        clientId: b.clientId,
        username: this.clients[b.clientId],
        amount: b.amount,
        cashedOut: b.cashedOut,
        multiplier: b.multiplierAtCashout ?? null,
      })),
    });
  }

  cancelBet(clientId: string) {
    if (this.gameState !== 'waiting') return;
    const index = this.bets.findIndex(b => b.clientId === clientId && !b.cashedOut);
    if (index !== -1) {
      this.bets.splice(index, 1);
      this.broadcastState();
    }
    this.bets = this.bets.filter(bet => this.clients[bet.clientId]);
  }

  getRecentPayouts(): number[] {
    return this.recentPayouts.slice(-10);
  }
  
}
 