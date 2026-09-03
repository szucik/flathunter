"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEDULE = void 0;
exports.createScheduler = createScheduler;
exports.startScheduler = startScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const index_1 = __importDefault(require("./index"));
exports.SCHEDULE = '0 */8 * * *';
function createScheduler(run, schedule = exports.SCHEDULE, scheduleFunction = node_cron_1.default.schedule) {
    let isRunning = false;
    return scheduleFunction(schedule, () => {
        if (isRunning) {
            console.warn('Pomijam zadanie: poprzednie scrapowanie nadal trwa.');
            return;
        }
        isRunning = true;
        console.log('Uruchamiam zaplanowane scrapowanie...');
        run()
            .catch(error => console.error('Zaplanowane scrapowanie zakonczone bledem:', getErrorMessage(error)))
            .finally(() => {
            isRunning = false;
        });
    });
}
function startScheduler() {
    const task = createScheduler(index_1.default);
    task.start();
    console.log('Scheduler uruchomiony. Oczekuje na zaplanowane zadania...');
    return task;
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
if (require.main === module) {
    startScheduler();
}
