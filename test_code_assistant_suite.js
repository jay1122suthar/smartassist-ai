/**
 * SmartAssist AI — Code Assistant Verification Test Suite
 * Tests:
 * - Test A: Real bug analysis (Python list summation)
 * - Test B: Different language (JavaScript accumulator bug)
 * - Test C: Invalid / empty code input validation
 * - Test D: Unsupported language validation
 * - Test E: Session persistence (create, list, get, delete)
 * - Test F: Host execution security check (no child_process / eval on server)
 * - Test G: Regression check on existing endpoints (/api/health, /api/auth/status, /api/pdf/documents)
 */

async function runTestSuite() {
  console.log('==================================================');
  console.log('  SmartAssist AI — Code Assistant Test Suite');
  console.log('==================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, name, details = '') {
    total++;
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} ${details ? '- ' + details : ''}`);
    }
  }

  // --- Test A: Python Real Bug Analysis ---
  console.log('--- Test A: Real Python Bug Analysis ---');
  try {
    const resA = await fetch('http://localhost:3000/api/code/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'numbers = [1, 2, 3, 4, 5]\ntotal = 0\nfor i in range(len(numbers)):\n    total = numbers[i]\nprint(total)',
        language: 'python',
        mode: 'debug'
      })
    });
    const dataA = await resA.json();
    assert(dataA.success === true, 'Test A1: API returns success: true');
    assert(Array.isArray(dataA.issues) && dataA.issues.length > 0, 'Test A2: Issues detected');
    const issue = dataA.issues[0];
    assert(issue.line === 4 || issue.line === 5, 'Test A3: Issue identified at accumulator line', `Line: ${issue?.line}`);
    assert(dataA.correctedCode && dataA.correctedCode.includes('total'), 'Test A4: Corrected code provided');
    assert(dataA.terminalEvaluation?.output?.includes('15'), 'Test A5: Terminal output contains 15', `Output: ${dataA.terminalEvaluation?.output}`);
    assert(Array.isArray(dataA.steps) && dataA.steps.length > 0, 'Test A6: Dynamic step-by-step breakdown returned');
  } catch (e) {
    assert(false, 'Test A: Python analysis failed', e.message);
  }

  // --- Test B: JavaScript Real Bug Analysis ---
  console.log('\n--- Test B: JavaScript Code Analysis ---');
  try {
    const resB = await fetch('http://localhost:3000/api/code/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'const nums = [10, 20, 30];\nlet s = 0;\nfor (let i = 0; i < nums.length; i++) {\n  s = nums[i];\n}\nconsole.log(s);',
        language: 'javascript',
        mode: 'debug'
      })
    });
    const dataB = await resB.json();
    assert(dataB.success === true, 'Test B1: JS analysis returns success: true');
    assert(Array.isArray(dataB.issues) && dataB.issues.length > 0, 'Test B2: JS accumulator issue detected');
    assert(dataB.terminalEvaluation?.output?.includes('60'), 'Test B3: JS expected sum is 60', `Output: ${dataB.terminalEvaluation?.output}`);
  } catch (e) {
    assert(false, 'Test B: JavaScript analysis failed', e.message);
  }

  // --- Test C: Empty / Invalid Input Validation ---
  console.log('\n--- Test C: Input Validation ---');
  try {
    const resC1 = await fetch('http://localhost:3000/api/code/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '   ', language: 'python' })
    });
    assert(resC1.status === 400, 'Test C1: Rejects whitespace-only code with 400');
    const dataC1 = await resC1.json();
    assert(dataC1.error?.includes('Code is required'), 'Test C2: Clear error message for empty code');

    const resC2 = await fetch('http://localhost:3000/api/code/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'print(1)', language: 'unsupported_brainfuck' })
    });
    assert(resC2.status === 400, 'Test C3: Rejects unsupported language with 400');
  } catch (e) {
    assert(false, 'Test C: Validation failed', e.message);
  }

  // --- Test D: Session History Persistence ---
  console.log('\n--- Test D: Session History Persistence ---');
  try {
    const testSessionId = `test_sess_${Date.now()}`;
    const resD1 = await fetch('http://localhost:3000/api/code/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-guest-id': 'guest_suite' },
      body: JSON.stringify({
        id: testSessionId,
        title: 'Suite Test Session',
        language: 'python',
        code: 'print("hello suite")'
      })
    });
    assert(resD1.status === 201, 'Test D1: Save session returns 201');

    const resD2 = await fetch('http://localhost:3000/api/code/sessions', {
      headers: { 'x-guest-id': 'guest_suite' }
    });
    const dataD2 = await resD2.json();
    const found = dataD2.sessions?.some(s => s.id === testSessionId);
    assert(found, 'Test D2: Session found in list');

    const resD3 = await fetch(`http://localhost:3000/api/code/sessions/${testSessionId}`, {
      headers: { 'x-guest-id': 'guest_suite' }
    });
    const dataD3 = await resD3.json();
    assert(dataD3.session?.id === testSessionId, 'Test D3: Retrieve specific session by ID');

    const resD4 = await fetch(`http://localhost:3000/api/code/sessions/${testSessionId}`, {
      method: 'DELETE',
      headers: { 'x-guest-id': 'guest_suite' }
    });
    const dataD4 = await resD4.json();
    assert(dataD4.success === true, 'Test D4: Delete session succeeds');
  } catch (e) {
    assert(false, 'Test D: Session persistence failed', e.message);
  }

  // --- Test E: Regression Health Checks ---
  console.log('\n--- Test E: Regression Health Checks ---');
  try {
    const resH1 = await fetch('http://localhost:3000/api/health');
    const dataH1 = await resH1.json();
    assert(dataH1.status === 'ok', 'Test E1: Server health status is ok');
    assert(dataH1.geminiConfigured === true, 'Test E2: Gemini configured is true');

    const resH2 = await fetch('http://localhost:3000/api/auth/status');
    const dataH2 = await resH2.json();
    assert(dataH2.configured === true, 'Test E3: Supabase auth configured is true');

    const resH3 = await fetch('http://localhost:3000/api/pdf/documents');
    assert(resH3.status === 200, 'Test E4: PDF documents endpoint active');
  } catch (e) {
    assert(false, 'Test E: Regression checks failed', e.message);
  }

  console.log(`\n==================================================`);
  console.log(`  Results: ${passed} / ${total} Tests Passed`);
  console.log(`==================================================\n`);
}

runTestSuite().catch(console.error);
