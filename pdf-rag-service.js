/**
 * SmartAssist AI — PDF RAG Service
 * Implements real PDF parsing, page-by-page text extraction, chunking,
 * Gemini semantic embeddings, hybrid vector/keyword retrieval,
 * grounded Q&A generation, SSRF-safe URL imports, and dual persistence.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { GoogleGenAI } from '@google/genai';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
const DATA_DIR = path.resolve(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'pdf_store.json');

// Ensure directories exist
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// 1. Persistent Store (Local JSON with Supabase Sync)
// ---------------------------------------------------------------------------
class PdfStore {
  constructor() {
    this.documents = new Map(); // docId -> docObject
    this.messages = new Map();  // docId -> array of messages
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data.documents) {
          for (const [id, doc] of Object.entries(data.documents)) {
            this.documents.set(id, doc);
          }
        }
        if (data.messages) {
          for (const [id, msgs] of Object.entries(data.messages)) {
            this.messages.set(id, msgs);
          }
        }
      }
    } catch (e) {
      console.warn('[PdfStore] Could not load store from disk:', e.message);
    }
  }

  saveToDisk() {
    try {
      const data = {
        documents: Object.fromEntries(this.documents),
        messages: Object.fromEntries(this.messages)
      };
      fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[PdfStore] Could not save store to disk:', e.message);
    }
  }

  getDoc(docId, userId = null) {
    const doc = this.documents.get(docId);
    if (!doc) return null;
    if (userId && doc.userId && doc.userId !== userId && doc.userId !== 'guest_user') {
      return null; // Enforce user isolation
    }
    return doc;
  }

  saveDoc(doc) {
    this.documents.set(doc.id, doc);
    this.saveToDisk();
  }

  deleteDoc(docId, userId = null) {
    const doc = this.getDoc(docId, userId);
    if (!doc) return false;

    // Delete uploaded physical file safely across candidate paths
    const candidates = [
      doc.filePath,
      doc.filePath ? path.resolve(UPLOADS_DIR, path.basename(doc.filePath)) : null,
      doc.id ? path.resolve(UPLOADS_DIR, `${doc.id}.pdf`) : null
    ];
    for (const p of candidates) {
      if (p && fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (e) {}
      }
    }

    this.documents.delete(docId);
    this.messages.delete(docId);
    this.saveToDisk();
    return true;
  }

  listDocs(userId = null) {
    const list = [];
    for (const doc of this.documents.values()) {
      if (!userId || !doc.userId || doc.userId === userId || doc.userId === 'guest_user') {
        // Exclude heavy chunk text in list response
        list.push({
          id: doc.id,
          userId: doc.userId,
          filename: doc.filename,
          fileSize: doc.fileSize,
          pageCount: doc.pageCount,
          chunkCount: doc.chunks ? doc.chunks.length : 0,
          status: doc.status,
          uploadedAt: doc.uploadedAt,
          chaptersCount: doc.chapters ? doc.chapters.length : 0
        });
      }
    }
    // Return sorted newest first
    return list.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  }

  getMessages(docId, userId = null) {
    const doc = this.getDoc(docId, userId);
    if (!doc) return [];
    return this.messages.get(docId) || [];
  }

  addMessage(docId, msg, userId = null) {
    const doc = this.getDoc(docId, userId);
    if (!doc) return null;
    if (!this.messages.has(docId)) {
      this.messages.set(docId, []);
    }
    const list = this.messages.get(docId);
    const newMsg = {
      id: crypto.randomUUID(),
      docId,
      userId: userId || doc.userId,
      role: msg.role, // 'user' or 'model'
      content: msg.content,
      citations: msg.citations || [],
      excerpt: msg.excerpt || null,
      score: msg.score || null,
      timestamp: new Date().toISOString()
    };
    list.push(newMsg);
    this.saveToDisk();
    return newMsg;
  }

  clearMessages(docId, userId = null) {
    const doc = this.getDoc(docId, userId);
    if (!doc) return false;
    this.messages.set(docId, []);
    this.saveToDisk();
    return true;
  }
}

export const pdfStore = new PdfStore();

// ---------------------------------------------------------------------------
// 2. Real PDF Text Extraction & Page Breakdown
// ---------------------------------------------------------------------------
export async function parsePdfBuffer(buffer, originalFilename = 'document.pdf', options = {}) {
  const chunkSize = options.chunkSize || 900;
  const chunkOverlap = options.chunkOverlap || 150;

  const parser = new PDFParse({ data: buffer });
  let textResult = null;
  let infoResult = null;

  try {
    infoResult = await parser.getInfo().catch(() => null);
    textResult = await parser.getText();
  } finally {
    try { await parser.destroy(); } catch (e) {}
  }

  const rawPages = (textResult && Array.isArray(textResult.pages)) ? textResult.pages : [];
  const pageCount = (textResult && textResult.total) ? textResult.total : Math.max(rawPages.length, 1);

  // Analyze page text
  const pages = [];
  let totalExtractedLength = 0;

  for (let i = 0; i < pageCount; i++) {
    const rawP = rawPages[i];
    const text = rawP ? (rawP.text || '').trim() : '';
    totalExtractedLength += text.length;
    pages.push({
      pageNumber: i + 1,
      text: text
    });
  }

  // Check for scanned / non-extractable PDFs
  const isScanned = totalExtractedLength < 25;
  const scanNotice = isScanned
    ? 'This PDF appears to be a scanned document or image-only file with no extractable text layer. Optical Character Recognition (OCR) is required to index image-only documents. Please upload a digital PDF with searchable text.'
    : null;

  // -------------------------------------------------------------------------
  // Detect Chapters / Headings
  // -------------------------------------------------------------------------
  const chapters = detectChapters(pages);

  // -------------------------------------------------------------------------
  // Split into Searchable Chunks preserving page numbers
  // -------------------------------------------------------------------------
  const chunks = createChunks(pages, chunkSize, chunkOverlap);

  // -------------------------------------------------------------------------
  // Generate Contextual Suggested Questions
  // -------------------------------------------------------------------------
  let suggestedQuestions = [];
  if (options.ai) {
    suggestedQuestions = await generateDynamicSuggestions(options.ai, options.model, originalFilename, chapters, pages, chunks);
  } else {
    suggestedQuestions = generateHeuristicSuggestions(originalFilename, chapters, pages);
  }

  return {
    filename: originalFilename,
    pageCount,
    totalExtractedLength,
    isScanned,
    scanNotice,
    pages,
    chapters,
    chunks,
    suggestedQuestions,
    info: infoResult ? infoResult.info : null
  };
}

// Extract chapters from headings or outline
function detectChapters(pages) {
  const chapters = [];
  const chapterRegex = /(?:^(?:Chapter|Unit|Section|Module)\s+(\d+|[IVXLCDM]+)[:.\s-]+([^\n\r]{3,80}))|(?:^(\d+\.0)\s+([A-Z][^\n\r]{3,80}))/im;

  for (const page of pages) {
    if (!page.text) continue;
    const lines = page.text.split(/\r?\n/).slice(0, 10); // check top lines of each page
    for (const line of lines) {
      const match = line.trim().match(chapterRegex);
      if (match) {
        const num = match[1] || match[3] || String(chapters.length + 1);
        const title = (match[2] || match[4] || line.trim()).replace(/^[:.\s-]+/, '').trim();
        // Avoid duplicate titles
        if (!chapters.some(c => c.title.toLowerCase() === title.toLowerCase())) {
          chapters.push({
            id: `ch_${chapters.length + 1}`,
            number: num,
            title: title,
            pageStart: page.pageNumber,
            pageEnd: page.pageNumber
          });
        }
      }
    }
  }

  // Adjust page ranges
  for (let i = 0; i < chapters.length; i++) {
    if (i < chapters.length - 1) {
      chapters[i].pageEnd = Math.max(chapters[i].pageStart, chapters[i + 1].pageStart - 1);
    } else {
      chapters[i].pageEnd = pages.length;
    }
  }

  return chapters;
}

// Chunking algorithm with sentence/paragraph awareness
function createChunks(pages, chunkSize = 900, overlap = 150) {
  const chunks = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const text = page.text;
    if (!text || text.length === 0) continue;

    if (text.length <= chunkSize) {
      chunks.push({
        id: `c_${chunkIndex++}`,
        chunkIndex: chunkIndex - 1,
        pageNumber: page.pageNumber,
        content: text,
        wordCount: text.split(/\s+/).filter(Boolean).length
      });
      continue;
    }

    // Split page text with overlap
    let start = 0;
    while (start < text.length) {
      let end = start + chunkSize;
      if (end >= text.length) {
        end = text.length;
      } else {
        // Try breaking at a sentence boundary (.!?) or newline
        const windowText = text.slice(start, end);
        const lastPeriod = Math.max(
          windowText.lastIndexOf('. '),
          windowText.lastIndexOf('.\n'),
          windowText.lastIndexOf('\n\n')
        );
        if (lastPeriod > chunkSize * 0.5) {
          end = start + lastPeriod + 1;
        }
      }

      const chunkContent = text.slice(start, end).trim();
      if (chunkContent.length > 20) {
        chunks.push({
          id: `c_${chunkIndex++}`,
          chunkIndex: chunkIndex - 1,
          pageNumber: page.pageNumber,
          content: chunkContent,
          wordCount: chunkContent.split(/\s+/).filter(Boolean).length
        });
      }

      if (end >= text.length) break;
      start = end - overlap;
    }
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Real Document-Aware Suggested Questions Engine (Gemini + Content Heuristics)
// ---------------------------------------------------------------------------
export async function generateDynamicSuggestions(ai, model, filename, chapters = [], pages = [], chunks = []) {
  // If scanned or insufficient text (< 40 words total)
  const totalWords = pages.reduce((acc, p) => acc + (p.text ? p.text.split(/\s+/).filter(Boolean).length : 0), 0);
  if (totalWords < 40) {
    return [];
  }

  // 1. If AI is available, generate questions grounded in the actual document excerpt
  if (ai) {
    try {
      const chapterList = (chapters || []).map(c => `- ${c.title} (Page ${c.pageStart})`).join('\n');
      const textSample = (pages || []).slice(0, 3).map(p => `[Page ${p.pageNumber}]\n${(p.text || '').slice(0, 1000)}`).join('\n\n').slice(0, 2500);

      const prompt = `You are an academic and document-analysis assistant for SmartAssist AI.
Analyze the following document excerpt from "${filename}" and generate 3 to 5 highly relevant, specific questions that a user would ask about this exact document.

Document Headings/Chapters:
${chapterList || 'None explicitly detected'}

Document Content Excerpt:
${textSample}

Requirements:
1. The questions must strictly reflect the subject matter, terminology, headings, and specific details in the text above.
2. If this is a resume or CV, ask about the candidate's technical skills, professional projects, work experience, or certifications.
3. If this is technical coursework or an academic paper, ask about the specific concepts, algorithms, definitions, or methodologies discussed.
4. Do NOT ask generic questions like "What is this document about?".
5. Return ONLY a valid JSON array of 3 to 5 strings. Example format:
["Question 1?", "Question 2?", "Question 3?", "Question 4?"]`;

      const candidateModels = [model, 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3-flash-preview', 'gemini-3.8-flash'].filter(Boolean);
      const uniqueModels = [...new Set(candidateModels)];

      let responseText = '';
      for (const modelToTry of uniqueModels) {
        try {
          const res = await ai.models.generateContent({
            model: modelToTry,
            contents: prompt,
            config: {
              responseMimeType: 'application/json'
            }
          });
          if (res && res.text) {
            responseText = res.text.trim();
            break;
          }
        } catch (mErr) {
          // Fall through to next model
        }
      }

      if (responseText) {
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed) && parsed.length >= 2) {
            const cleaned = parsed
              .filter(q => typeof q === 'string' && q.trim().length >= 10 && q.trim().length <= 150)
              .map(q => q.trim().replace(/^[\d\-.)\s]+/, ''))
              .slice(0, 5);
            if (cleaned.length >= 2) {
              return cleaned;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[PDF Suggestions] Gemini suggestion generation failed, falling back to content heuristics:', err.message);
    }
  }

  // 2. Intelligent Content-Aware Heuristic Fallback (Never hardcodes unrelated topics!)
  return generateHeuristicSuggestions(filename, chapters, pages);
}

export function generateHeuristicSuggestions(filename, chapters = [], pages = []) {
  const questions = [];
  const fullText = (pages || []).map(p => p.text || '').join('\n');
  const lowerText = fullText.toLowerCase();

  // A. Check if the document is a Resume / CV
  const isResume = /resume|curriculum vitae|\bcv\b/i.test(filename) ||
    (/\b(experience|education|skills|projects|certifications|summary)\b/i.test(lowerText) &&
     /\b(b\.?tech|bachelor|developer|intern|university|cgpa|github|linkedin)\b/i.test(lowerText));

  if (isResume) {
    if (/\bskills\b/i.test(lowerText)) {
      questions.push('What are the candidate’s core technical skills and programming languages?');
    }
    if (/\b(experience|intern|internship|work)\b/i.test(lowerText)) {
      questions.push('Summarize the candidate’s work and internship experience.');
    }
    if (/\bprojects?\b/i.test(lowerText)) {
      questions.push('What technical projects has the candidate built and shipped?');
    }
    if (/\bcertificat/i.test(lowerText)) {
      questions.push('What certifications and credentials does the candidate hold?');
    }
    if (/\beducation|university|college\b/i.test(lowerText) && questions.length < 4) {
      questions.push('What is the candidate’s educational background and degree?');
    }
    return questions.slice(0, 4);
  }

  // B. Check if chapters/headings exist
  if (chapters && chapters.length >= 2) {
    questions.push(`Summarize the key concepts in ${chapters[0].title}`);
    questions.push(`What are the main principles explained in ${chapters[1].title}?`);
    if (chapters.length >= 3) {
      questions.push(`How does ${chapters[2].title} work according to this document?`);
    } else {
      questions.push(`Explain the key definitions and formulas presented.`);
    }
    return questions.slice(0, 4);
  }

  // C. Extract top salient headings or capitalized lines from text
  const headingCandidates = [];
  const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length > 5 && line.length < 60 && !line.includes('http') && !line.includes('@')) {
      if (/^[A-Z0-9\s:–-]{5,60}$/.test(line) || /^[A-Z][a-zA-Z\s]{4,40}$/.test(line)) {
        if (!headingCandidates.includes(line)) {
          headingCandidates.push(line);
          if (headingCandidates.length >= 3) break;
        }
      }
    }
  }

  if (headingCandidates.length >= 2) {
    questions.push(`Summarize the main points of ${headingCandidates[0]}`);
    questions.push(`What does the document state regarding ${headingCandidates[1]}?`);
    if (headingCandidates.length >= 3) {
      questions.push(`Explain the details and significance of ${headingCandidates[2]}`);
    } else {
      questions.push(`What are the primary conclusions and takeaways?`);
    }
    return questions.slice(0, 4);
  }

  // D. General clean fallback derived from clean document title
  const cleanTitle = filename.replace(/\.pdf$/i, '').replace(/[_\-+]/g, ' ');
  return [
    `Summarize the key topics and structure of ${cleanTitle}`,
    `What are the most important findings or definitions in this document?`,
    `What are the key technical concepts detailed in ${cleanTitle}?`
  ];
}

// ---------------------------------------------------------------------------
// 3. Real Hybrid Vector & Semantic Retrieval Engine
// ---------------------------------------------------------------------------
export async function searchChunks(ai, chunks, query, options = {}) {
  const topK = options.topK || 5;
  const scopeMin = options.scopeMin || 1;
  const scopeMax = options.scopeMax || Infinity;

  // Filter chunks by page scope
  const scopedChunks = chunks.filter(c => c.pageNumber >= scopeMin && c.pageNumber <= scopeMax);
  if (scopedChunks.length === 0) return [];

  // 1. Keyword Relevance Score (BM25 / TF-IDF Style)
  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const keywordScores = scopedChunks.map(chunk => {
    const contentLower = chunk.content.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      const count = (contentLower.match(new RegExp(`\\b${term}`, 'g')) || []).length;
      if (count > 0) {
        score += Math.min(count, 5) * (1 / (queryTerms.length || 1));
      }
    }
    // Boost for exact phrase match
    if (queryTerms.length >= 2 && contentLower.includes(query.toLowerCase().trim())) {
      score += 2.0;
    }
    return score;
  });

  // 2. Vector Cosine Similarity (via Gemini gemini-embedding-001 with fast timeout & caching)
  let vectorScores = null;
  if (ai) {
    try {
      const qEmbedRes = await Promise.race([
        ai.models.embedContent({
          model: 'gemini-embedding-001',
          contents: query
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Embedding timeout')), 3500))
      ]);
      const qVector = qEmbedRes?.embeddings?.[0]?.values;

      if (Array.isArray(qVector) && qVector.length > 0) {
        // Pre-rank candidate chunks by keyword score to select top 3 candidates
        const candidates = scopedChunks
          .map((chunk, idx) => ({ chunk, idx, kw: keywordScores[idx] }))
          .sort((a, b) => b.kw - a.kw)
          .slice(0, 3);

        vectorScores = new Array(scopedChunks.length).fill(0);

        // Parallel embed candidates if not cached
        await Promise.all(candidates.map(async (cand) => {
          if (!cand.chunk.vector) {
            try {
              const cEmbedRes = await Promise.race([
                ai.models.embedContent({
                  model: 'gemini-embedding-001',
                  contents: cand.chunk.content.slice(0, 600)
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Chunk embedding timeout')), 3500))
              ]);
              cand.chunk.vector = cEmbedRes?.embeddings?.[0]?.values || null;
            } catch (e) {
              // fallback gracefully
            }
          }

          if (Array.isArray(cand.chunk.vector)) {
            const cosSim = cosineSimilarity(qVector, cand.chunk.vector);
            vectorScores[cand.idx] = cosSim;
          }
        }));
      }
    } catch (embErr) {
      // Gracefully fall back to keyword scoring if embedding fails or times out
    }
  }

  // 3. Combine scores into normalized relevance score [0, 1]
  const maxKw = Math.max(...keywordScores, 1);
  const results = scopedChunks.map((chunk, idx) => {
    const normKw = keywordScores[idx] / maxKw;
    const vScore = vectorScores ? (vectorScores[idx] || 0) : 0;

    const finalScore = vectorScores && vScore > 0
      ? (0.65 * vScore + 0.35 * normKw)
      : normKw;

    return {
      chunk,
      score: Number(finalScore.toFixed(3)),
      pageNumber: chunk.pageNumber,
      content: chunk.content
    };
  });

  return results
    .filter(r => r.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const STOP_WORDS = new Set([
  'the','is','at','which','on','and','a','an','in','of','to','it','for','with','as','that',
  'by','this','are','from','be','or','what','how','why','when','who','where','can','does'
]);

// ---------------------------------------------------------------------------
// 4. Grounded Q&A Generation with Gemini 3.8 Flash
// ---------------------------------------------------------------------------
export async function generateGroundedAnswer(ai, model, doc, query, retrievedChunks) {
  // If no chunks match
  if (!retrievedChunks || retrievedChunks.length === 0) {
    return {
      answer: `The uploaded document **${doc.filename}** does not provide enough information to answer: "${query}".\n\nPlease check if your question relates to the topics covered in this document, or try widening your search scope.`,
      citations: [],
      topExcerpt: null,
      grounded: false,
      relevanceScore: 0
    };
  }

  // Build context blocks with verbatim page markers
  const contextExcerpts = retrievedChunks.map((r, i) => {
    return `[EXCERPT ${i + 1} - Page ${r.pageNumber}]\n${r.content}\n`;
  }).join('\n---\n\n');

  const systemInstruction = `You are SmartAssist AI, an authoritative, helpful Computer Science academic tutor.
You are answering questions about an uploaded PDF document named "${doc.filename}".

CRITICAL GROUNDING RULES:
1. Base your answer EXCLUSIVELY on the provided excerpts below.
2. If the excerpts do not contain the answer, explicitly say: "The uploaded document does not provide enough information to answer this question."
3. Cite the exact page numbers using inline badges like [Page X] or [Pages X–Y] whenever stating facts or definitions.
4. Structure your response cleanly using Markdown headings, bullet points, and code blocks where applicable.
5. Never invent or hallucinate citations or page numbers not present in the excerpts.`;

  const promptText = `User Question: "${query}"

Here are the retrieved relevant excerpts from ${doc.filename}:

${contextExcerpts}

Provide a well-structured, comprehensive answer grounded in these excerpts. Always include [Page X] citations.`;

  let response;
  const candidateModels = [model, 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3-flash-preview', 'gemini-3.8-flash'].filter(Boolean);
  const uniqueModels = [...new Set(candidateModels)];

  for (const modelToTry of uniqueModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: modelToTry,
          contents: promptText,
          config: { systemInstruction }
        });
        if (response && response.text) break;
      } catch (genErr) {
        const errMsg = genErr && genErr.message ? String(genErr.message) : '';
        const isTransient = errMsg.includes('503') || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('overloaded') || errMsg.includes('UNAVAILABLE');
        if (isTransient && attempt === 0) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        break; // try next candidate model
      }
    }
    if (response && response.text) break;
  }

  const answerText = response && response.text ? response.text.trim() : 'I was unable to generate an answer.';

  // Extract unique pages from retrieved chunks
  const matchedPages = [...new Set(retrievedChunks.map(r => r.pageNumber))].sort((a, b) => a - b);
  const citations = matchedPages.map(p => ({
    page: p,
    label: `Page ${p}`,
    url: `/api/pdf/document/${doc.id}/view#page=${p}`
  }));

  // Top excerpt for citation callout
  const top = retrievedChunks[0];
  const topExcerpt = top ? {
    pageNumber: top.pageNumber,
    snippet: top.content.slice(0, 280) + (top.content.length > 280 ? '…' : ''),
    relevancePercent: Math.min(Math.round(top.score * 100), 99)
  } : null;

  return {
    answer: answerText,
    citations,
    topExcerpt,
    grounded: true,
    relevanceScore: top ? top.score : 0.5
  };
}

// ---------------------------------------------------------------------------
// 5. SSRF-Safe URL Downloader
// ---------------------------------------------------------------------------
export async function downloadPdfFromUrl(urlStr, maxBytes = 50 * 1024 * 1024) {
  let parsedUrl;
  try {
    parsedUrl = new URL(urlStr);
  } catch (e) {
    throw new Error('Invalid URL format. Please provide a complete HTTP or HTTPS URL.');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Unsupported protocol. Only http: and https: URLs are permitted.');
  }

  // Prevent SSRF to localhost or private subnets
  const hostname = parsedUrl.hostname.toLowerCase();
  const isPrivate = (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
    hostname.startsWith('169.254.') ||
    hostname.includes('metadata.google.internal') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  );

  if (isPrivate) {
    throw new Error('Access to local or private network addresses is forbidden.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(parsedUrl.href, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SmartAssist-PDF-Bot/1.0 (Educational Assistant)',
        'Accept': 'application/pdf,*/*'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Remote server responded with HTTP status ${response.status} (${response.statusText}).`);
    }

    const contentType = response.headers.get('content-type') || '';
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);

    if (contentLength > maxBytes) {
      throw new Error(`Remote file exceeds the 50 MB size limit.`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > maxBytes) {
      throw new Error(`Downloaded file is ${Math.round(buffer.length / (1024*1024))} MB, which exceeds the 50 MB limit.`);
    }

    // Validate PDF magic bytes %PDF-
    if (!buffer.slice(0, 5).toString('ascii').startsWith('%PDF-')) {
      throw new Error('The URL did not return a valid PDF document (missing %PDF- header).');
    }

    // Determine filename
    let filename = path.basename(parsedUrl.pathname);
    if (!filename || !filename.toLowerCase().endsWith('.pdf')) {
      filename = 'downloaded_document.pdf';
    }

    return { buffer, filename };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Download timed out after 25 seconds.');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 6. Supabase Persistence Synchronization (Graceful Fallback)
// ---------------------------------------------------------------------------
export async function syncDocToSupabase(supabase, doc) {
  if (!supabase || !doc || !doc.userId || doc.userId === 'guest_user') return;
  try {
    await supabase.from('pdf_documents').upsert({
      id: doc.id,
      user_id: doc.userId,
      filename: doc.filename,
      file_size: doc.fileSize,
      page_count: doc.pageCount,
      chunk_count: doc.chunks ? doc.chunks.length : 0,
      chapters: doc.chapters || [],
      suggested_questions: doc.suggestedQuestions || [],
      status: doc.status || 'indexed',
      updated_at: new Date().toISOString()
    });

    if (Array.isArray(doc.chunks) && doc.chunks.length > 0) {
      const chunkRows = doc.chunks.map(c => ({
        id: `${doc.id}_${c.id}`,
        document_id: doc.id,
        user_id: doc.userId,
        chunk_index: c.chunkIndex,
        page_number: c.pageNumber,
        content: c.content,
        metadata: { wordCount: c.wordCount }
      }));
      // Batch upsert in groups of 50 chunks
      for (let i = 0; i < chunkRows.length; i += 50) {
        await supabase.from('pdf_chunks').upsert(chunkRows.slice(i, i + 50));
      }
    }
  } catch (err) {
    console.warn('[PdfStore] Supabase syncDoc notice:', err?.message || err);
  }
}

export async function deleteDocFromSupabase(supabase, docId, userId) {
  if (!supabase || !docId || !userId || userId === 'guest_user') return;
  try {
    await supabase.from('pdf_documents').delete().match({ id: docId, user_id: userId });
  } catch (err) {
    console.warn('[PdfStore] Supabase deleteDoc notice:', err?.message || err);
  }
}

export async function syncMessageToSupabase(supabase, msg) {
  if (!supabase || !msg || !msg.userId || msg.userId === 'guest_user') return;
  try {
    await supabase.from('pdf_messages').insert({
      id: msg.id,
      document_id: msg.docId,
      user_id: msg.userId,
      role: msg.role,
      content: msg.content,
      citations: msg.citations || [],
      relevance_score: msg.score || null
    });
  } catch (err) {
    console.warn('[PdfStore] Supabase syncMessage notice:', err?.message || err);
  }
}

