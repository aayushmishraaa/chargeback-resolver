# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui.spec.ts >> Chargeback Dispute Resolver Arena >> should simulate full agent debate and capture visual regression
- Location: tests/ui.spec.ts:18:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=Arbiter Verdict')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=Arbiter Verdict')

```

```yaml
- main:
  - heading "Multi-Agent Dispute Resolver" [level=1]
  - text: System Online
  - heading "Dispute Initializer" [level=2]
  - text: Dispute ID
  - textbox: DSP-90124
  - text: Customer Claim
  - textbox: I did not make this purchase. My card was stolen.
  - text: Merchant 3DS Logs (JSON)
  - textbox: "{ \"auth_method\": \"3D_SECURE_V2\", \"ip\": \"192.168.1.42\", \"device_fingerprint\": \"match_99%\", \"otp_verified\": true }"
  - button "Initiate Agent Protocol" [disabled]
  - heading "Live Agent Arena" [level=2]
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Chargeback Dispute Resolver Arena', () => {
  4  | 
  5  |   test('should display validation errors for empty dispute id', async ({ page }) => {
  6  |     await page.goto('/');
  7  | 
  8  |     // Clear the default dispute id
  9  |     await page.fill('input[name="dispute_id"]', '');
  10 |     
  11 |     // Submit
  12 |     await page.click('button[type="submit"]');
  13 | 
  14 |     // Verify zod error message is rendered
  15 |     await expect(page.locator('text=Dispute ID must be at least 3 characters')).toBeVisible();
  16 |   });
  17 | 
  18 |   test('should simulate full agent debate and capture visual regression', async ({ page }) => {
  19 |     page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  20 |     
  21 |     await page.goto('/');
  22 | 
  23 |     // Mock the backend SSE endpoint
  24 |     await page.route('http://localhost:8000/api/resolve', async route => {
  25 |       // Create a mocked chunked response stream simulating the agents
  26 |       
  27 |       const encoder = new TextEncoder();
  28 |       
  29 |       const stream = new ReadableStream({
  30 |         async start(controller) {
  31 |           
  32 |           const sendEvent = (event: string, data: any) => {
  33 |             controller.enqueue(encoder.encode(`event: ${event}\n`));
  34 |             if (data) {
  35 |                 controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n`));
  36 |             }
  37 |             controller.enqueue(encoder.encode('\n\n'));
  38 |           };
  39 | 
  40 |           const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
  41 |           
  42 |           const turn1 = { agent: 'customer', argument: 'Mock claim: I did not make this purchase.' };
  43 |           sendEvent('message', { node: 'customer_agent', state: { debate_history: [turn1] }});
  44 |           await delay(500);
  45 | 
  46 |           const turn2 = { agent: 'merchant', argument: 'Mock logs defense: Device matched.' };
  47 |           sendEvent('message', { node: 'merchant_agent', state: { debate_history: [turn1, turn2] }});
  48 |           await delay(500);
  49 | 
  50 |           const turn3 = { agent: 'customer', argument: 'Mock claim: I was asleep.' };
  51 |           sendEvent('message', { node: 'customer_agent', state: { debate_history: [turn1, turn2, turn3] }});
  52 |           await delay(500);
  53 | 
  54 |           const turn4 = { agent: 'merchant', argument: 'Mock logs defense: OTP verified.' };
  55 |           sendEvent('message', { node: 'merchant_agent', state: { debate_history: [turn1, turn2, turn3, turn4] }});
  56 |           await delay(500);
  57 | 
  58 |           const verdict = {
  59 |             winner: 'merchant',
  60 |             confidence_score: 0.99,
  61 |             justification: 'The 3DS logs clearly show authenticated customer activity.'
  62 |           };
  63 |           sendEvent('message', { node: 'arbiter_judge', state: { debate_history: [turn1, turn2, turn3, turn4], verdict }});
  64 |           await delay(500);
  65 | 
  66 |           sendEvent('close', 'done');
  67 |           controller.close();
  68 |         }
  69 |       });
  70 | 
  71 |       await route.fulfill({
  72 |         headers: {
  73 |             'Content-Type': 'text/event-stream',
  74 |             'Cache-Control': 'no-cache',
  75 |             'Connection': 'keep-alive',
  76 |             'Access-Control-Allow-Origin': '*'
  77 |         },
  78 |         body: stream,
  79 |       });
  80 |     });
  81 | 
  82 |     // Start protocol
  83 |     await page.click('button[type="submit"]');
  84 | 
  85 |     // Wait for the Arbiter Verdict card to appear
> 86 |     await expect(page.locator('text=Arbiter Verdict')).toBeVisible({ timeout: 10000 });
     |                                                        ^ Error: expect(locator).toBeVisible() failed
  87 |     
  88 |     // Wait for animations to finish
  89 |     await page.waitForTimeout(2000);
  90 | 
  91 |     // Assert the layout visually
  92 |     await expect(page).toHaveScreenshot('arena-verdict.png', { fullPage: true });
  93 |   });
  94 | });
  95 | 
```