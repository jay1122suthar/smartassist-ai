import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('=== SmartAssist AI - Sign Up Page & Right-Side Cards Validation ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  function makeRequest(options, postData) {
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(body); } catch(e) {}
          resolve({ status: res.statusCode, headers: res.headers, body, json });
        });
      });
      req.on('error', reject);
      if (postData) {
        req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
      }
      req.end();
    });
  }

  // 1. Static HTML and Layout Checks
  console.log('--- 1. Checking 08_sign_up/code.html Structure & Elements ---');
  const htmlContent = fs.readFileSync(path.join(__dirname, '08_sign_up', 'code.html'), 'utf8');

  // Verify form inputs
  const requiredFormIds = [
    'signup-form', 'full-name', 'academic-email', 'password-input', 'confirm-password-input',
    'toggle-password', 'toggle-confirm-password', 'terms-agree', 'submit-btn',
    'name-error-text', 'email-error-text', 'password-error-text', 'confirm-error-text', 'terms-error-text',
    'bar-1', 'bar-2', 'bar-3', 'bar-4', 'strength-label',
    'req-len', 'req-upper', 'req-sym',
    'form-error-banner', 'form-success-banner', 'auth-provider-modal'
  ];

  requiredFormIds.forEach(id => {
    assert(htmlContent.includes(`id="${id}"`), `Form element id="${id}" is preserved`);
  });

  // Verify removal of unsupported / fabricated claims
  console.log('\n--- 2. Verifying Removal of Unsupported Claims ---');
  const forbiddenClaims = [
    'GPU ALLOCATION 40HRS/MO',
    'Algorithmic Compiler Throughput',
    '99.8% Reliability',
    'smartassist-core.rs',
    'FERPA Compliant',
    'Prof. Marcus Vance',
    'Dept of Computer Science',
    '+8k',
    'EDUPASS ACTIVE',
    'Campus License Tier 1'
  ];

  forbiddenClaims.forEach(claim => {
    assert(!htmlContent.includes(claim), `Fabricated claim "${claim}" was removed`);
  });

  // Verify addition of truthful, functional elements
  console.log('\n--- 3. Verifying Truthful Right-Side Cards ---');
  assert(htmlContent.includes('Core Academic AI Tools'), 'Card 1 title "Core Academic AI Tools" present');
  assert(htmlContent.includes('data-path="study-assistant"'), 'Card 1 includes link to Study Assistant');
  assert(htmlContent.includes('data-path="code-assistant"'), 'Card 1 includes link to Code Assistant');
  assert(htmlContent.includes('data-path="chat-with-pdf"'), 'Card 1 includes link to Chat with PDF');
  assert(htmlContent.includes('data-path="chat"'), 'Card 1 includes link to AI Chat Copilot');

  assert(htmlContent.includes('Service Architecture'), 'Card 2 title "Service Architecture" present');
  assert(htmlContent.includes('id="cardLiveStatusText"'), 'Card 2 includes live status container');
  assert(htmlContent.includes('POST /api/code/analyze'), 'Card 2 includes genuine endpoint snippet');
  assert(htmlContent.includes('User-Isolated Data'), 'Card 2 includes truthful user isolation badge');

  assert(htmlContent.includes('Built for Learning &amp; Productivity') || htmlContent.includes('Built for Learning & Productivity'), 'Card 3 title "Built for Learning & Productivity" present');
  assert(htmlContent.includes('Grounded Citations'), 'Card 3 includes Grounded Citations feature');
  assert(htmlContent.includes('Conceptual Clarity'), 'Card 3 includes Conceptual Clarity feature');
  assert(htmlContent.includes('Privacy First'), 'Card 3 includes Privacy First feature');
  assert(htmlContent.includes('checkServiceHealth()'), 'Script includes live checkServiceHealth function');

  // Verify all navigation target files exist on disk
  console.log('\n--- 4. Verifying Navigation Link Targets on Disk ---');
  const targetFiles = [
    { pathKey: 'welcome', file: path.join(__dirname, '07_welcome', 'code.html') },
    { pathKey: 'sign-in', file: path.join(__dirname, '09_sign_in', 'code.html') },
    { pathKey: 'study-assistant', file: path.join(__dirname, '03_study_assistant', 'code.html') },
    { pathKey: 'code-assistant', file: path.join(__dirname, '04_code_assistant', 'code.html') },
    { pathKey: 'chat-with-pdf', file: path.join(__dirname, '05_chat_with_pdf', 'code.html') },
    { pathKey: 'chat', file: path.join(__dirname, '01_main_chat_dashboard', 'code.html') }
  ];

  targetFiles.forEach(({ pathKey, file }) => {
    assert(fs.existsSync(file), `Navigation target for "${pathKey}" exists at ${path.basename(path.dirname(file))}/${path.basename(file)}`);
  });

  // Verify Backend Registration Validation Endpoint
  console.log('\n--- 5. Testing POST /api/auth/register Validations ---');
  try {
    // A. Empty fields
    const emptyRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {});
    assert(emptyRes.status === 400, `Empty submission rejected with HTTP 400 (got ${emptyRes.status})`);

    // B. Invalid email
    const invalidEmailRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { fullName: 'Alex Chen', email: 'not-an-email', password: 'ValidPassword123!' });
    assert(invalidEmailRes.status === 400, `Invalid email rejected with HTTP 400 (got ${invalidEmailRes.status})`);

    // C. Password too short
    const shortPassRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { fullName: 'Alex Chen', email: 'alex@university.edu', password: 'short' });
    assert(shortPassRes.status === 400, `Short password rejected with HTTP 400 (got ${shortPassRes.status})`);

    // D. Valid payload structure (reaches Supabase Auth)
    const validRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { fullName: 'Alex Chen', email: 'alex.test.signup@university.edu', password: 'ValidPassword123!' });
    
    // Status can be 201 (created), 409 (already registered), 429 (rate-limited), or 503 (provider unconfigured)
    assert([201, 409, 429, 503].includes(validRes.status), `Valid payload reached auth provider (returned HTTP ${validRes.status})`);
    console.log(`   Registration response status: HTTP ${validRes.status} -> ${validRes.body.slice(0, 100)}`);
  } catch (e) {
    assert(false, `POST /api/auth/register failed: ${e.message}`);
  }

  // Verify Live Health Endpoint Used by Card 2
  console.log('\n--- 6. Testing Service Health Endpoint for Card 2 ---');
  try {
    const healthRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/settings/config',
      method: 'GET'
    });
    assert(healthRes.status === 200, `Health check returned HTTP 200 (got ${healthRes.status})`);
    assert(healthRes.json && healthRes.json.activeModel, `Active model returned: "${healthRes.json?.activeModel}"`);
  } catch (e) {
    assert(false, `Health check failed: ${e.message}`);
  }

  console.log(`\n=== Test Summary: ${passed} Passed, ${failed} Failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
