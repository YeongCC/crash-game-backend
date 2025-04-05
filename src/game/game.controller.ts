import { Controller, Get, Query } from '@nestjs/common';
import { GameService } from './game.service';
import { generateServerSeed, calculateScalingFactor, generateQuotaPool, generateCrashPoint } from './utils/gameUtils';

@Controller('game')
export class GameController {
    constructor(private readonly gameService: GameService) { }


    @Get('simulate-quota-rounds')
    simulateQuotaRounds() {
        const results = [];
        let recentPayouts: number[] = [];
        let quotaPool: ('low' | 'mid' | 'high')[] = [];

        const totalRounds = 25;

        for (let i = 0; i < totalRounds; i++) {
            if (i % 10 === 0) {
                quotaPool = generateQuotaPool();
            }

            const type = quotaPool[i % 10];
            const serverSeed = generateServerSeed();
            const scalingFactor = calculateScalingFactor(recentPayouts);
            const crashPoint = generateCrashPoint(type, serverSeed, scalingFactor);

            results.push({
                round: i + 1,
                type,
                serverSeed,
                scalingFactor,
                crashPoint,
            });

            recentPayouts.push(crashPoint);
            if (recentPayouts.length > 10) {
                recentPayouts.shift();
            }
        }

        return results;

    }
}
