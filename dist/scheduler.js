"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_cron_1 = __importDefault(require("node-cron"));
const index_1 = __importDefault(require("./index"));
let isRunning = false;
node_cron_1.default.schedule('0 8,14,20 * * *', () => {
    if (isRunning) {
        console.warn('Pomijam zadanie: poprzednie scrapowanie nadal trwa.');
        return;
    }
    isRunning = true;
    console.log('Uruchamiam zaplanowane scrapowanie...');
    (0, index_1.default)()
        .catch(error => console.error('Zaplanowane scrapowanie zakonczone bledem:', getErrorMessage(error)))
        .finally(() => {
        isRunning = false;
    });
});
console.log('Scheduler uruchomiony. Oczekuje na zaplanowane zadania...');
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
