import assert from 'node:assert/strict';
import test from 'node:test';
import cron from 'node-cron';
import { createScheduler, SCHEDULE } from '../src/scheduler';

type Callback = () => void;

function fakeSchedule(expression: string, callback: Callback) {
    return {
        expression,
        callback,
        start() {},
        stop() {}
    } as ReturnType<typeof cron.schedule>;
}

test('uses a valid schedule every eight hours', () => {
    assert.equal(cron.validate(SCHEDULE), true);
    assert.equal(SCHEDULE, '0 */8 * * *');
});

test('runs a scheduled job and prevents overlapping executions', async () => {
    let callback: Callback | undefined;
    let resolveRun!: () => void;
    let runCount = 0;

    createScheduler(
        () => {
            runCount++;
            return new Promise<void>(resolve => {
                resolveRun = resolve;
            });
        },
        SCHEDULE,
        (_expression, scheduledCallback) => {
            callback = scheduledCallback;
            return fakeSchedule(SCHEDULE, scheduledCallback);
        }
    );

    assert.ok(callback);
    callback();
    callback();
    assert.equal(runCount, 1);

    resolveRun();
    await new Promise<void>(resolve => setImmediate(resolve));
    callback();
    assert.equal(runCount, 2);
});

test('allows another run after a failed job', async () => {
    let callback: Callback | undefined;
    let runCount = 0;

    createScheduler(
        async () => {
            runCount++;
            throw new Error('expected test failure');
        },
        SCHEDULE,
        (_expression, scheduledCallback) => {
            callback = scheduledCallback;
            return fakeSchedule(SCHEDULE, scheduledCallback);
        }
    );

    assert.ok(callback);
    callback();
    await new Promise<void>(resolve => setImmediate(resolve));
    callback();
    assert.equal(runCount, 2);
});
