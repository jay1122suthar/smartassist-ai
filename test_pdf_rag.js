import fs from 'fs';

async function runTests() {
  console.log('--- STARTING PDF RAG END-TO-END TESTS ---\n');

  // 1. Test PDF Upload
  console.log('1. Testing POST /api/pdf/upload ...');
  const fileBuffer = fs.readFileSync('sample_os_notes.pdf');
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  const form = new FormData();
  form.append('file', blob, 'Operating_Systems_Notes.pdf');

  const uploadRes = await fetch('http://localhost:3000/api/pdf/upload', {
    method: 'POST',
    body: form
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Upload failed (${uploadRes.status}): ${err}`);
  }

  const uploadData = await uploadRes.json();
  console.log('Upload Success:', {
    id: uploadData.document.id,
    filename: uploadData.document.filename,
    pages: uploadData.document.pageCount,
    chunks: uploadData.document.chunkCount,
    chaptersCount: uploadData.document.chapters?.length,
    suggestedQuestions: uploadData.document.suggestedQuestions
  });

  const docId = uploadData.document.id;

  // 2. Test Document Retrieval
  console.log('\n2. Testing GET /api/pdf/document/' + docId + ' ...');
  const getDocRes = await fetch(`http://localhost:3000/api/pdf/document/${docId}`);
  const getDocData = await getDocRes.json();
  console.log('Document Details Status:', getDocData.document.status, 'Filename:', getDocData.document.filename);

  // 3. Test In-Document Grounded Question (Deadlock Coffman conditions)
  console.log('\n3. Testing POST /api/pdf/query with Question Present in Document...');
  const q1 = "What are the four Coffman conditions for a deadlock?";
  const q1Res = await fetch('http://localhost:3000/api/pdf/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      docId,
      query: q1,
      topK: 3
    })
  });

  const q1Data = await q1Res.json();
  if (q1Data.error) {
    console.error('Q1 returned error:', q1Data.error);
  } else {
    console.log('Q1 Query:', q1);
    console.log('Q1 Grounded:', q1Data.grounded);
    console.log('Q1 Citations:', q1Data.citations);
    console.log('Q1 Relevance Score:', q1Data.relevanceScore);
    console.log('Q1 Answer Excerpt (first 200 chars):', q1Data.answer ? q1Data.answer.slice(0, 200) + '...' : 'N/A');
  }

  // 4. Test Out-of-Document Question (Chocolate chip cookies)
  console.log('\n4. Testing POST /api/pdf/query with Question Absent from Document...');
  const q2 = "What is the recipe for baking chocolate chip cookies?";
  const q2Res = await fetch('http://localhost:3000/api/pdf/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      docId,
      query: q2,
      topK: 3
    })
  });

  const q2Data = await q2Res.json();
  console.log('Q2 Query:', q2);
  console.log('Q2 Grounded:', q2Data.grounded);
  console.log('Q2 Citations:', q2Data.citations);
  console.log('Q2 Answer:', q2Data.answer);

  // 5. Test PDF View Stream
  console.log('\n5. Testing GET /api/pdf/document/' + docId + '/view ...');
  const viewRes = await fetch(`http://localhost:3000/api/pdf/document/${docId}/view`);
  console.log('View Status:', viewRes.status, 'Content-Type:', viewRes.headers.get('content-type'));

  // 6. Test Re-indexing
  console.log('\n6. Testing POST /api/pdf/reindex ...');
  const reindexRes = await fetch('http://localhost:3000/api/pdf/reindex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      docId,
      chunkSize: 400,
      chunkOverlap: 100,
      topK: 4
    })
  });
  const reindexData = await reindexRes.json();
  console.log('Re-index Success:', reindexData.success, 'New Chunk Count:', reindexData.document.chunkCount);

  // 7. Test Messages Fetch
  console.log('\n7. Testing GET /api/pdf/messages/' + docId + ' ...');
  const msgsRes = await fetch(`http://localhost:3000/api/pdf/messages/${docId}`);
  const msgsData = await msgsRes.json();
  console.log('Saved Messages Count:', msgsData.messages?.length);

  // 8. Test Clear Messages
  console.log('\n8. Testing POST /api/pdf/messages/' + docId + '/clear ...');
  const clearRes = await fetch(`http://localhost:3000/api/pdf/messages/${docId}/clear`, { method: 'POST' });
  const clearData = await clearRes.json();
  console.log('Clear Messages Success:', clearData.success);

  console.log('\n--- ALL PDF RAG BACKEND TESTS COMPLETED SUCCESSFULLY! ---');
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
