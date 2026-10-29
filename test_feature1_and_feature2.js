/**
 * Comprehensive Automated Verification Suite for:
 * 1. Feature 1: Dynamic, Document-Aware PDF Suggestions & Grounded Q&A
 * 2. Feature 2: Profile Photo Upload, Replacement, Removal, Security, & Magic Bytes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('\n===============================================================');
  console.log('🚀 RUNNING SMARTASSIST AI VERIFICATION SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const testUserId1 = '0e84b92e-b476-499e-99da-54572ab98fee';
  const testUserId2 = 'another_user_uuid_1111-2222-3333-4444';

  // --------------------------------------------------------------------------
  // FEATURE 1: Document-Aware PDF Suggestions & Grounded Q&A
  // --------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: PDF Document-Aware Suggestions ---');

  // Test Document 1: Resume
  const resumePdfPath = path.join(__dirname, 'uploads', 'doc_4df0d730-1747-403d-822f-af510104fd9b.pdf');
  assert(fs.existsSync(resumePdfPath), 'Resume PDF exists in uploads/');

  // Query suggestions for Resume
  const resumeDocId = 'doc_4df0d730-1747-403d-822f-af510104fd9b';
  console.log(`\nFetching suggestions for Resume (${resumeDocId}) with refresh=true...`);
  const resumeSugRes = await fetch(`${BASE_URL}/api/pdf/document/${resumeDocId}/suggestions?refresh=true`, {
    headers: { 'X-User-Id': testUserId1 }
  });
  assert(resumeSugRes.ok, `Resume suggestions endpoint responded with status ${resumeSugRes.status}`);

  const resumeSugData = await resumeSugRes.json();
  const resumeSuggestions = resumeSugData.suggestions || [];
  console.log('Resume Suggestions:', resumeSuggestions);

  assert(Array.isArray(resumeSuggestions) && resumeSuggestions.length >= 3, `Generated ${resumeSuggestions.length} questions for Resume`);
  
  // Verify resume questions are relevant to a resume, not an OS textbook
  const resumeKeywords = /experience|skills|projects|technologies|education|certifications|role|qualifications|developer/i;
  const osKeywords = /scheduling|deadlock|virtual memory|paging|round robin|semaphore|mutex/i;

  const hasResumeFocus = resumeSuggestions.some(q => resumeKeywords.test(q));
  const hasNoOsHallucination = !resumeSuggestions.some(q => osKeywords.test(q));

  assert(hasResumeFocus, 'Resume suggestions accurately focus on candidate skills/experience/projects');
  assert(hasNoOsHallucination, 'Resume suggestions DO NOT contain unrelated Operating Systems questions (no scheduling/deadlock)');

  // Test Grounded Answer for one Resume suggestion
  const testResumeQuery = resumeSuggestions[0];
  console.log(`\nSubmitting Resume question to Q&A backend: "${testResumeQuery}"...`);
  const resumeQaRes = await fetch(`${BASE_URL}/api/pdf/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': testUserId1
    },
    body: JSON.stringify({
      docId: resumeDocId,
      query: testResumeQuery,
      topK: 5
    })
  });

  assert(resumeQaRes.ok, `Resume Q&A responded with status ${resumeQaRes.status}`);
  const resumeQaData = await resumeQaRes.json();
  console.log('Resume Q&A Answer (preview):', resumeQaData.answer ? resumeQaData.answer.slice(0, 180) + '…' : 'None');
  console.log('Resume Q&A Citations:', resumeQaData.citations);

  assert(Boolean(resumeQaData.answer && resumeQaData.answer.length > 50), 'Resume Q&A generated comprehensive answer');
  assert(Array.isArray(resumeQaData.citations) && resumeQaData.citations.length > 0, `Resume Q&A returned truthful citations (${resumeQaData.citations.map(c => c.label).join(', ')})`);

  // Test Document 2: Operating Systems Notes
  console.log('\n--- Uploading Document 2: Operating Systems Notes ---');
  const osPdfPath = path.join(__dirname, 'sample_os_notes.pdf');
  assert(fs.existsSync(osPdfPath), 'Operating Systems sample PDF exists');

  const osBuffer = fs.readFileSync(osPdfPath);
  const formData = new FormData();
  formData.append('file', new Blob([osBuffer], { type: 'application/pdf' }), 'Operating_Systems_Lecture_Notes.pdf');

  const osUploadRes = await fetch(`${BASE_URL}/api/pdf/upload`, {
    method: 'POST',
    headers: { 'X-User-Id': testUserId1 },
    body: formData
  });

  assert(osUploadRes.ok, `OS PDF upload responded with status ${osUploadRes.status}`);
  const osUploadData = await osUploadRes.json();
  const osDocId = osUploadData.document?.id;
  const osSuggestions = osUploadData.document?.suggestedQuestions || [];
  console.log(`Uploaded OS Doc ID: ${osDocId}`);
  console.log('OS Suggestions:', osSuggestions);

  assert(Array.isArray(osSuggestions) && osSuggestions.length >= 3, `Generated ${osSuggestions.length} questions for OS PDF`);

  const hasOsFocus = osSuggestions.some(q => /operating|process|scheduling|system|memory|cpu|algorithm|chapter/i.test(q));
  assert(hasOsFocus, 'OS PDF suggestions accurately focus on operating systems topics/chapters');

  // Verify that Resume and OS suggestions are SUBSTANTIALLY DIFFERENT
  const areDifferent = JSON.stringify(resumeSuggestions) !== JSON.stringify(osSuggestions);
  assert(areDifferent, 'Suggestions for Resume and OS Document are distinct and tailored to each document');

  // Test Grounded Answer for one OS suggestion
  const testOsQuery = osSuggestions[0];
  console.log(`\nSubmitting OS question to Q&A backend: "${testOsQuery}"...`);
  const osQaRes = await fetch(`${BASE_URL}/api/pdf/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': testUserId1
    },
    body: JSON.stringify({
      docId: osDocId,
      query: testOsQuery,
      topK: 5
    })
  });

  assert(osQaRes.ok, `OS Q&A responded with status ${osQaRes.status}`);
  const osQaData = await osQaRes.json();
  console.log('OS Q&A Answer (preview):', osQaData.answer ? osQaData.answer.slice(0, 180) + '…' : 'None');
  console.log('OS Q&A Citations:', osQaData.citations);

  assert(Boolean(osQaData.answer && osQaData.answer.length > 50), 'OS Q&A generated grounded response');
  assert(Array.isArray(osQaData.citations) && osQaData.citations.length > 0, `OS Q&A cited real document pages (${osQaData.citations.map(c => c.label).join(', ')})`);

  // --------------------------------------------------------------------------
  // FEATURE 2: Profile Photo Upload, Persistence, Removal, and Security
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Profile Photo Management ---');

  // 1. Create a minimal valid 1x1 PNG image buffer: 89 50 4E 47 0D 0A 1A 0A ...
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
    0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
  ]);

  // Test 1: Upload Real PNG Photo
  console.log('\nUploading real PNG profile photo for user 1...');
  const avatarForm = new FormData();
  avatarForm.append('file', new Blob([validPngBuffer], { type: 'image/png' }), 'avatar.png');

  const avatarUploadRes = await fetch(`${BASE_URL}/api/profile/avatar`, {
    method: 'POST',
    headers: { 'X-User-Id': testUserId1 },
    body: avatarForm
  });

  assert(avatarUploadRes.ok, `Avatar upload returned status ${avatarUploadRes.status}`);
  const avatarUploadData = await avatarUploadRes.json();
  console.log('Upload result:', avatarUploadData);
  assert(Boolean(avatarUploadData.avatarUrl), `Avatar URL returned: ${avatarUploadData.avatarUrl}`);

  // Test 2: Fetch and verify served avatar
  const getAvatarRes = await fetch(`${BASE_URL}/api/profile/avatar/${testUserId1}`);
  assert(getAvatarRes.ok, `Serving avatar returned HTTP ${getAvatarRes.status}`);
  assert(getAvatarRes.headers.get('content-type') === 'image/png', `Served with correct MIME type: ${getAvatarRes.headers.get('content-type')}`);
  const servedBytes = Buffer.from(await getAvatarRes.arrayBuffer());
  assert(servedBytes.length === validPngBuffer.length, `Served byte size matches original (${servedBytes.length} bytes)`);

  // Test 3: Replace photo with JPEG
  console.log('\nReplacing profile photo with JPEG image...');
  // Minimal valid 1x1 JPEG buffer: FF D8 FF E0 ... FF D9
  const validJpgBuffer = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F,
    0x00, 0xBF, 0x00, 0xFF, 0xD9
  ]);

  const replaceForm = new FormData();
  replaceForm.append('file', new Blob([validJpgBuffer], { type: 'image/jpeg' }), 'avatar.jpg');

  const replaceRes = await fetch(`${BASE_URL}/api/profile/avatar`, {
    method: 'POST',
    headers: { 'X-User-Id': testUserId1 },
    body: replaceForm
  });

  assert(replaceRes.ok, `Replacement upload returned status ${replaceRes.status}`);
  const getReplacedRes = await fetch(`${BASE_URL}/api/profile/avatar/${testUserId1}`);
  assert(getReplacedRes.headers.get('content-type') === 'image/jpeg', 'Served with replaced JPEG MIME type');

  // Test 4: Reject Oversized Image (> 5 MB)
  console.log('\nTesting rejection of oversized image (6 MB)...');
  const oversizedBuffer = Buffer.alloc(6 * 1024 * 1024, 0x00);
  // Give it JPEG magic bytes
  oversizedBuffer[0] = 0xFF;
  oversizedBuffer[1] = 0xD8;
  oversizedBuffer[2] = 0xFF;

  const oversizedForm = new FormData();
  oversizedForm.append('file', new Blob([oversizedBuffer], { type: 'image/jpeg' }), 'large.jpg');

  const oversizedRes = await fetch(`${BASE_URL}/api/profile/avatar`, {
    method: 'POST',
    headers: { 'X-User-Id': testUserId1 },
    body: oversizedForm
  });

  assert(oversizedRes.status === 400, `Oversized image was rejected with HTTP 400 (Got ${oversizedRes.status})`);
  const oversizedData = await oversizedRes.json();
  console.log('Oversized rejection message:', oversizedData.error);
  assert(Boolean(oversizedData.error && oversizedData.error.includes('5 MB')), 'Error message indicates 5 MB limit');

  // Test 5: Reject Invalid / Spoofed File Type (e.g. text/exe with fake extension)
  console.log('\nTesting rejection of non-image file spoofed as png...');
  const fakePngBuffer = Buffer.from('THIS IS NOT A VALID PNG IMAGE FILE CONTENT');
  const fakeForm = new FormData();
  fakeForm.append('file', new Blob([fakePngBuffer], { type: 'image/png' }), 'evil.png');

  const fakeRes = await fetch(`${BASE_URL}/api/profile/avatar`, {
    method: 'POST',
    headers: { 'X-User-Id': testUserId1 },
    body: fakeForm
  });

  assert(fakeRes.status === 400, `Magic bytes validation rejected non-image with HTTP 400 (Got ${fakeRes.status})`);
  const fakeData = await fakeRes.json();
  console.log('Fake file rejection message:', fakeData.error);
  assert(Boolean(fakeData.error && fakeData.error.includes('valid JPEG, PNG, or WebP')), 'Error indicates magic byte validation failure');

  // Test 6: Remove Profile Photo
  console.log('\nTesting photo removal...');
  const deleteRes = await fetch(`${BASE_URL}/api/profile/avatar`, {
    method: 'DELETE',
    headers: { 'X-User-Id': testUserId1 }
  });

  assert(deleteRes.ok, `Delete avatar returned status ${deleteRes.status}`);
  const deleteData = await deleteRes.json();
  assert(deleteData.success === true, 'Delete response returned success');

  // Verify avatar file is removed
  const getAfterDeleteRes = await fetch(`${BASE_URL}/api/profile/avatar/${testUserId1}`);
  assert(getAfterDeleteRes.status === 404, `Avatar endpoint returns 404 after removal (Got ${getAfterDeleteRes.status})`);

  // Test 7: User Isolation & Unauthorized Access Defense
  console.log('\nTesting unauthorized modification protection...');
  const unauthRes = await fetch(`${BASE_URL}/api/profile/avatar`, {
    method: 'POST',
    headers: {}, // No auth header
    body: avatarForm
  });
  assert(unauthRes.status === 401, `Unauthenticated upload rejected with HTTP 401 (Got ${unauthRes.status})`);

  // Path traversal defense on avatar retrieval
  const traversalRes = await fetch(`${BASE_URL}/api/profile/avatar/..%2F..%2Fserver`);
  assert(traversalRes.status === 400 || traversalRes.status === 404, `Directory traversal attempt rejected with HTTP ${traversalRes.status}`);

  console.log('\n===============================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
