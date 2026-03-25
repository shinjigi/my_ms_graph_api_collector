import { nibolBookDesk, nibolCheckIn } from '../src/collectors/nibol';
import * as dotenv from 'dotenv';

dotenv.config();

async function test() {
    const date = new Date().toISOString().split('T')[0];
    console.log(`Testing Nibol automation for date: ${date}`);

    try {
        console.log('--- Testing Book Desk ---');
        await nibolBookDesk(date);

        console.log('--- Testing Check-in ---');
        await nibolCheckIn(date);

        console.log('Test logic completed. Please check logs for success/failure.');
    } catch (error) {
        console.error('Test failed:', error);
    }
}

test();
