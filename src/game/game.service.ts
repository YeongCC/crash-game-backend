import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import {
  generateCrashPoint,
  generateServerSeed,
  calculateScalingFactor,
  generateQuotaPool,
} from './utils/gameUtils';
import { UserService } from 'src/user/user.service';
import * as crypto from 'crypto';

interface Bet {
  clientId: string;
  amount: number;
  cashedOut: boolean;
  multiplierAtCashout?: number;
  autoCashout?: number;
}

@Injectable()
export class GameService {
  private server: Server;
  private clients: Record<string, string> = {};
  private gameState: 'waiting' | 'running' | 'crashed' = 'waiting';
  private multiplier = 1.0;
  private crashPoint = 0;
  private bets: Bet[] = [];
  private recentPayouts: number[] = [];
  private interval: ReturnType<typeof setInterval>;
  private countdown: number = 0;
  private quotaPool: ('low' | 'mid' | 'high')[] = [];
  private currentRound = 0;
  private lastRoundWinners: number = 0;
  private recentSystemProfit: number[] = [];
  private currentServerSeed: string = null;

  constructor(
    private readonly userService: UserService
  ) { }

  setServer(server: Server) {
    this.server = server;
  }

  async registerClient(client: any) {
    const username = client.handshake.query.username as string;
    this.clients[client.id] = username;
    await this.userService.getOrCreate(username);
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

  private calculateTotalRiskScore(): number {
    if (this.bets.length === 0) return 1;

    const riskyCount = this.bets.filter(b => b.autoCashout && b.autoCashout <= 1.05).length; // 提高範圍
    const riskyRatio = riskyCount / this.bets.length;
  
    const winRatio = this.lastRoundWinners / this.bets.length;
  
    const recentProfit = this.recentSystemProfit.reduce((a, b) => a + b, 0);
    const systemLosingRatio = recentProfit < 0 ? Math.min(Math.abs(recentProfit) / 500, 1) : 0; // 擴大虧損感知
  
    const totalRisk = 0.5 * riskyRatio + 0.4 * winRatio + 0.3 * systemLosingRatio;
    return Math.min(Math.max(totalRisk, 0), 1);
  }


  private startGame() {
    this.gameState = 'running';

    if (this.currentRound % 10 === 0) {
      this.quotaPool = generateQuotaPool();
    }

    const quotaType = this.quotaPool[this.currentRound % 10];
    const scaling = calculateScalingFactor(this.recentPayouts.slice(-10));
    const seed = generateServerSeed();
    const riskScore = this.calculateTotalRiskScore();
    this.currentServerSeed = seed;
    this.crashPoint = generateCrashPoint(quotaType, seed, scaling, riskScore, this.bets.length);
    console.log(`🎯 Round #${this.currentRound + 1} → Quota: [${quotaType}] → CrashPoint: ${this.crashPoint}`);
    this.countdown = 0;
    this.interval = setInterval(() => {
      this.multiplier = +(this.multiplier + 0.01).toFixed(2);

      this.bets.forEach(bet => {
        if (!bet.cashedOut && bet.autoCashout && this.multiplier >= bet.autoCashout) {
          this.cashOut(bet.clientId);
        }
      });

      if (this.multiplier >= this.crashPoint) {
        clearInterval(this.interval);
        this.endGame();
      }

      this.broadcastState();
    }, 100);
    this.currentRound++;
  }

  async endGame() {
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
    const balances = Object.fromEntries(await Promise.all(
      Object.entries(this.clients).map(async ([_, username]) => {
        const bal = await this.userService.getBalance(username);
        return [username, bal] as const;
      })
    ));

    const serverSeed = this.currentServerSeed;
    const hash = crypto.createHash('sha256').update(serverSeed).digest('hex'); 

    this.server.emit('game_state', {
      state: 'crashed',
      multiplier: this.multiplier,
      crashPoint: this.crashPoint,
      endCrashPoint: this.crashPoint,
      serverSeed,
      hash, 
      countdown: 5,
      bets: this.bets.map(b => ({
        clientId: b.clientId,
        username: this.clients[b.clientId],
        amount: b.amount,
        cashedOut: b.cashedOut,
        multiplier: b.multiplierAtCashout ?? null,
      })),
      balances,
    });

    this.countdown = 5;
    this.gameState = 'waiting';
    setTimeout(() => this.loopWaiting(), 0);
  }

  async placeBet(clientId: string, amount: number, autoCashout?: number) {
    if (this.gameState !== 'waiting') return;
    const username = this.clients[clientId];
    const already = this.bets.find(b => b.clientId === clientId);
    if (already) return;
    try {
      await this.userService.updateBalance(username, -amount);
    } catch (e) {
      return;
    }
    this.bets.push({
      clientId,
      amount,
      cashedOut: false,
      autoCashout,
    });

    this.broadcastState();
  }

  async cashOut(clientId: string) {
    const username = this.clients[clientId];
    const bet = this.bets.find(b => b.clientId === clientId && !b.cashedOut);
    if (!bet) return;
    bet.cashedOut = true;
    bet.multiplierAtCashout = this.multiplier;
    const payout = +(bet.amount * this.multiplier).toFixed(2);
    await this.userService.updateBalance(username, payout);
    this.broadcastState();
  }

  async broadcastState() {
    const balancePromises = Object.entries(this.clients).map(async ([clientId, username]) => {
      const balance = await this.userService.getBalance(username);
      return [username, balance] as const;
    });

    const resolved = await Promise.all(balancePromises);
    const balances = Object.fromEntries(resolved);

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
      balances,
    });
  }

  async cancelBet(clientId: string) {
    if (this.gameState !== 'waiting') return;
    const username = this.clients[clientId];
    const index = this.bets.findIndex(b => b.clientId === clientId && !b.cashedOut);
    if (index !== -1) {
      const refund = this.bets[index].amount;
      this.bets.splice(index, 1);
      await this.userService.updateBalance(username, refund);
      this.broadcastState();
    }
  }

  getRecentPayouts(): number[] {
    return this.recentPayouts.slice(-10);
  }

}