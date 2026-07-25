import { test, expect } from '@playwright/test';

test.describe('Chargeback Dispute Resolver Arena', () => {

  test('should display validation errors for empty dispute id', async ({ page }) => {
    await page.goto('/');

    // Clear the default dispute id
    await page.fill('input[name="dispute_id"]', '');
    
    // Submit
    await page.click('button[type="submit"]');

    // Verify zod error message is rendered
    await expect(page.locator('text=Dispute ID must be at least 3 characters')).toBeVisible();
  });

  test('should simulate full agent debate and capture visual regression', async ({ page }) => {
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    
    await page.goto('/');

    // Mock the backend SSE endpoint
    await page.route('http://localhost:8000/api/resolve', async route => {
      // Create a mocked chunked response stream simulating the agents
      
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Accept'
          }
        });
        return;
      }
      
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        async start(controller) {
          
          const sendEvent = (event: string, data: any) => {
            controller.enqueue(encoder.encode(`event: ${event}\n`));
            if (data) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n`));
            }
            controller.enqueue(encoder.encode('\n\n'));
          };

          const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
          
          const turn1 = { agent: 'customer', argument: 'Mock claim: I did not make this purchase.' };
          sendEvent('message', { node: 'customer_agent', state: { debate_history: [turn1] }});
          await delay(500);

          const turn2 = { agent: 'merchant', argument: 'Mock logs defense: Device matched.' };
          sendEvent('message', { node: 'merchant_agent', state: { debate_history: [turn1, turn2] }});
          await delay(500);

          const turn3 = { agent: 'customer', argument: 'Mock claim: I was asleep.' };
          sendEvent('message', { node: 'customer_agent', state: { debate_history: [turn1, turn2, turn3] }});
          await delay(500);

          const turn4 = { agent: 'merchant', argument: 'Mock logs defense: OTP verified.' };
          sendEvent('message', { node: 'merchant_agent', state: { debate_history: [turn1, turn2, turn3, turn4] }});
          await delay(500);

          const verdict = {
            winner: 'merchant',
            confidence_score: 0.99,
            justification: 'The 3DS logs clearly show authenticated customer activity.'
          };
          sendEvent('message', { node: 'arbiter_judge', state: { debate_history: [turn1, turn2, turn3, turn4], verdict }});
          await delay(500);

          sendEvent('close', 'done');
          controller.close();
        }
      });

      await route.fulfill({
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        },
        body: stream,
      });
    });

    // Start protocol
    await page.click('button[type="submit"]');

    // Wait for the Arbiter Verdict card to appear
    await expect(page.locator('text=Arbiter Verdict')).toBeVisible({ timeout: 10000 });
    
    // Wait for animations to finish
    await page.waitForTimeout(2000);

    // Assert the layout visually
    await expect(page).toHaveScreenshot('arena-verdict.png', { fullPage: true });
  });
});
