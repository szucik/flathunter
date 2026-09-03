import cron, { type ScheduledTask } from 'node-cron';
import main from './index';

export const SCHEDULE = '0 */8 * * *';

type ScheduleFunction = (expression: string, callback: () => void) => ScheduledTask;

export function createScheduler(
    run: () => Promise<void>,
    schedule: string = SCHEDULE,
    scheduleFunction: ScheduleFunction = cron.schedule
): ScheduledTask {
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

export function startScheduler(): ScheduledTask {
    const task = createScheduler(main);
    task.start();
    console.log('Scheduler uruchomiony. Oczekuje na zaplanowane zadania...');
    return task;
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

if (require.main === module) {
    startScheduler();
}