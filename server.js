import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import {
  pdfStore,
  parsePdfBuffer,
  generateDynamicSuggestions,
  searchChunks,
  generateGroundedAnswer,
  downloadPdfFromUrl,
  syncDocToSupabase,
  deleteDocFromSupabase,
  syncMessageToSupabase
} from './pdf-rag-service.js';
import {
  codeStore,
  syncSessionToSupabase,
  deleteSessionFromSupabase
} from './code-service.js';

// Load environment variables from .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '.env');

// Load environment variables from .env
dotenv.config({ path: envPath });

const app = express();
const PORT = process.env.PORT || 3000;

// Security and request size limits (1MB JSON limit)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve static files from workspace
app.use(express.static(__dirname));

// Route root to welcome screen
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '07_welcome', 'code.html'));
});

// Helper: Read active API key from .env (re-reads to pick up local edits)
function getApiKey() {
  dotenv.config({ path: envPath, override: true });
  return (process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
}

// Helper: Read active model ID from custom preference or .env, normalizing to verified active models
function getGeminiModel(customModel) {
  const supported = [
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-flash-latest'
  ];

  if (customModel && typeof customModel === 'string' && customModel.trim()) {
    const rawCustom = customModel.trim();
    const lower = rawCustom.toLowerCase();
    if (lower.includes('3.5')) return 'gemini-3.5-flash';
    if (lower.includes('3.8')) return 'gemini-3.8-flash';
    if (lower.includes('latest')) return 'gemini-flash-latest';
    if (supported.includes(rawCustom)) return rawCustom;
  }

  dotenv.config({ path: envPath, override: true });
  const raw = (process.env.GEMINI_MODEL || '').trim().replace(/^["']|["']$/g, '');
  if (!raw) return 'gemini-3.5-flash';
  
  // Normalize display names or retired model aliases to verified active model
  const lower = raw.toLowerCase();
  if (lower.includes('3.5')) return 'gemini-3.5-flash';
  if (lower.includes('3.8')) return 'gemini-3.8-flash';
  if (lower.includes('latest')) return 'gemini-flash-latest';
  if (lower.includes('1.5') || lower.includes('2.0') || lower.includes('2.5')) return 'gemini-3.5-flash';
  
  return raw;
}

// Helper: Sanitize errors to prevent leaking secrets or stack traces
function sanitizeError(err) {
  const msg = err && err.message ? String(err.message) : 'Unknown upstream error';
  
  if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('PERMISSION_DENIED') || msg.includes('UNAUTHENTICATED') || msg.includes('401') || msg.includes('403')) {
    return 'Invalid or unauthorized Gemini API key. Please verify your GEMINI_API_KEY in the .env file.';
  }
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
    return 'Gemini API rate limit or quota exceeded. Please wait a moment and try again.';
  }
  if (msg.includes('MODEL_NOT_FOUND') || (msg.includes('404') && msg.includes('models/'))) {
    return 'The requested Gemini model is unavailable or not found. Check GEMINI_MODEL in your .env file.';
  }
  // Strip any long credential-looking tokens from the message for safety
  const safeMsg = msg.replace(/[A-Za-z0-9_-]{24,}/g, '[REDACTED]');
  return `Gemini API Error: ${safeMsg}`;
}

// ============================================================================
// CHAT ATTACHMENTS & TEXT STORE
// ============================================================================

const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
const DATA_DIR = path.resolve(__dirname, 'data');
const TEXT_STORE_FILE = path.join(DATA_DIR, 'text_store.json');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

class TextStore {
  constructor() {
    this.attachments = new Map();
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(TEXT_STORE_FILE)) {
        const raw = fs.readFileSync(TEXT_STORE_FILE, 'utf-8');
        const data = JSON.parse(raw);
        for (const [id, item] of Object.entries(data)) {
          this.attachments.set(id, item);
        }
      }
    } catch (e) {
      console.warn('[TextStore] Could not load text store from disk:', e.message);
    }
  }

  saveToDisk() {
    try {
      const data = Object.fromEntries(this.attachments);
      fs.writeFileSync(TEXT_STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[TextStore] Could not save text store to disk:', e.message);
    }
  }

  save(attachment) {
    this.attachments.set(attachment.id, attachment);
    this.saveToDisk();
  }

  get(id, userId = null) {
    const item = this.attachments.get(id);
    if (!item) return null;
    if (userId && item.userId && item.userId !== userId && item.userId !== 'guest_user') {
      return null;
    }
    return item;
  }
}

const textStore = new TextStore();

// Allowed extensions for general chat attachments
const ALLOWED_CHAT_EXTENSIONS = new Set([
  '.pdf',
  '.txt', '.md', '.json', '.csv',
  '.js', '.ts', '.py', '.html', '.css',
  '.java', '.c', '.cpp', '.h', '.sql', '.sh', '.xml', '.yaml', '.yml'
]);

// Multer middleware for chat attachments (in-memory buffer, max 50MB)
const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_CHAT_EXTENSIONS.has(ext)) {
      return cb(new Error(`Unsupported file type "${ext || 'unknown'}". SmartAssist AI supports PDF (.pdf), Text (.txt, .md, .csv, .json), and Source Code (.py, .js, .java, .cpp, .html, .css).`));
    }
    cb(null, true);
  }
});

function handleChatUpload(req, res, next) {
  chatUpload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File exceeds the maximum allowed size of 50 MB.' });
      }
      return res.status(400).json({ error: `File upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}

// POST /api/chat/upload - Upload, validate and process chat attachment
app.post('/api/chat/upload', handleChatUpload, async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file was uploaded. Please select a valid file.' });
    }

    const buffer = req.file.buffer;
    const originalFilename = req.file.originalname || 'attachment';
    const ext = path.extname(originalFilename).toLowerCase();
    const user = await getAuthUser(req);

    // 1. PDF Documents
    if (ext === '.pdf') {
      if (!buffer.slice(0, 5).toString('ascii').startsWith('%PDF-')) {
        return res.status(400).json({ error: 'Uploaded file is corrupted or not a valid PDF document (missing %PDF- header).' });
      }

      const parsed = await parsePdfBuffer(buffer, originalFilename, {
        chunkSize: 900,
        chunkOverlap: 150
      });

      const docId = `doc_chat_${crypto.randomUUID()}`;
      const filePath = path.join(UPLOADS_DIR, `${docId}.pdf`);
      fs.writeFileSync(filePath, buffer);

      const doc = {
        id: docId,
        userId: user.id,
        userEmail: user.email,
        filename: originalFilename,
        filePath,
        fileSize: buffer.length,
        pageCount: parsed.pageCount,
        isScanned: parsed.isScanned,
        scanNotice: parsed.scanNotice,
        chapters: parsed.chapters,
        suggestedQuestions: parsed.suggestedQuestions,
        chunks: parsed.chunks,
        indexSettings: {
          chunkSize: 900,
          chunkOverlap: 150,
          topK: 5,
          embeddingModel: 'gemini-embedding-001'
        },
        status: parsed.isScanned ? 'scanned_ocr_required' : 'indexed',
        uploadedAt: new Date().toISOString()
      };

      pdfStore.saveDoc(doc);

      return res.status(201).json({
        success: true,
        attachment: {
          id: doc.id,
          filename: doc.filename,
          fileSize: doc.fileSize,
          fileType: 'pdf',
          isPdf: true,
          pageCount: doc.pageCount,
          isScanned: doc.isScanned,
          scanNotice: doc.scanNotice,
          chunkCount: doc.chunks.length
        }
      });
    }

    // 2. Text / Code Files
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Text and source code files must not exceed 10 MB.' });
    }

    const textContent = buffer.toString('utf-8');
    if (textContent.includes('\0')) {
      return res.status(400).json({ error: 'The uploaded file appears to contain binary data. Please upload readable text or code.' });
    }

    const fileId = `file_chat_${crypto.randomUUID()}`;
    const cleanExt = ext.replace('.', '') || 'txt';
    const filePath = path.join(UPLOADS_DIR, `${fileId}${ext}`);
    fs.writeFileSync(filePath, buffer);

    const textItem = {
      id: fileId,
      userId: user.id,
      userEmail: user.email,
      filename: originalFilename,
      filePath,
      fileSize: buffer.length,
      fileType: cleanExt,
      isPdf: false,
      text: textContent,
      uploadedAt: new Date().toISOString()
    };

    textStore.save(textItem);

    return res.status(201).json({
      success: true,
      attachment: {
        id: textItem.id,
        filename: textItem.filename,
        fileSize: textItem.fileSize,
        fileType: textItem.fileType,
        isPdf: false,
        textLength: textContent.length,
        preview: textContent.slice(0, 150)
      }
    });
  } catch (err) {
    console.error('[Chat Upload Error]:', err?.message || err);
    return res.status(500).json({
      error: `Failed to process uploaded file: ${err?.message || 'Internal upload error'}`
    });
  }
});

// POST /api/chat - Main AI Chatbot endpoint (Supports text, files, PDFs & grounded citations)
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history, attachment, preferences } = req.body || {};

    const hasMessage = typeof message === 'string' && message.trim().length > 0;
    const hasAttachment = Boolean(attachment && (attachment.id || attachment.filename));

    // 1. Validate request payload
    if (!hasMessage && !hasAttachment) {
      return res.status(400).json({
        error: 'Bad Request: Please enter a message or attach a file.'
      });
    }

    if (hasMessage && message.length > 25000) {
      return res.status(400).json({
        error: 'Bad Request: Message is too long (maximum 25,000 characters).'
      });
    }

    // Determine effective user query
    let userQuery = hasMessage ? message.trim() : '';
    if (!userQuery && hasAttachment) {
      userQuery = (attachment.isPdf || attachment.fileType === 'pdf')
        ? 'Please summarize the key topics and main takeaways of this document.'
        : 'Please analyze and explain the contents of this file.';
    }

    // 2. Validate API Key existence
    const apiKey = getApiKey();
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY' || apiKey.includes('YOUR_API_KEY_HERE')) {
      return res.status(503).json({
        error: 'Gemini API key is not configured. Please open the root .env file and set your valid GEMINI_API_KEY.'
      });
    }

    // 3. Initialize GoogleGenAI SDK instance with server-side key
    const ai = new GoogleGenAI({ apiKey: apiKey });
    const requestedModel = preferences?.model || req.body?.model;
    const responseStyle = preferences?.responseStyle || req.body?.responseStyle || 'balanced';
    const language = preferences?.language || req.body?.language || 'en-US';
    const configuredModel = getGeminiModel(requestedModel);
    const user = await getAuthUser(req);

    let styleDirective = '';
    if (responseStyle === 'concise') {
      styleDirective = ' Response Depth Directive: Keep your answers succinct, concise, and to-the-point with minimal preamble.';
    } else if (responseStyle === 'detailed') {
      styleDirective = ' Response Depth Directive: Provide exhaustive, deeply detailed explanations with step-by-step proofs, complete code samples, and extensive architectural rationale.';
    }

    let langDirective = '';
    if (language && language !== 'en-US') {
      const langMap = { 'en-GB': 'English (UK)', 'zh-CN': 'Chinese (Simplified)', 'es-ES': 'Spanish', 'de-DE': 'German' };
      langDirective = ` Respond strictly in ${langMap[language] || language}.`;
    }

    // ------------------------------------------------------------------------
    // CASE 1: PDF Document Attachment (RAG Grounding with True Page Citations)
    // ------------------------------------------------------------------------
    if (hasAttachment && (attachment.isPdf || attachment.fileType === 'pdf')) {
      const doc = pdfStore.getDoc(attachment.id, user.id) || pdfStore.getDoc(attachment.id);

      if (!doc) {
        return res.status(404).json({
          error: `Document "${attachment.filename || 'PDF'}" was not found or session has expired. Please re-attach the file.`
        });
      }

      if (doc.isScanned) {
        return res.json({
          reply: `The attached document **${doc.filename}** appears to be a scanned or image-only PDF with no extractable text layer.\n\nOptical Character Recognition (OCR) is required to index and search image-based documents. Please upload a digital PDF with selectable text.`,
          citations: [],
          attachment: {
            id: doc.id,
            filename: doc.filename,
            pageCount: doc.pageCount,
            status: 'scanned_ocr_required'
          }
        });
      }

      // Perform retrieval over document chunks
      const retrievedChunks = await searchChunks(ai, doc.chunks || [], userQuery, { topK: 5 });

      // Generate grounded answer using existing RAG engine
      const grounded = await generateGroundedAnswer(ai, configuredModel, doc, userQuery, retrievedChunks);

      return res.json({
        reply: grounded.answer,
        citations: grounded.citations || [],
        attachment: {
          id: doc.id,
          filename: doc.filename,
          fileSize: doc.fileSize,
          pageCount: doc.pageCount,
          status: 'indexed'
        }
      });
    }

    // ------------------------------------------------------------------------
    // CASE 2: Text / Code File Attachment (In-Context Analysis)
    // ------------------------------------------------------------------------
    if (hasAttachment && !attachment.isPdf) {
      const textItem = textStore.get(attachment.id, user.id) || textStore.get(attachment.id);
      const fileText = (textItem && textItem.text) ? textItem.text : (attachment.text || '');
      const filename = (textItem && textItem.filename) || attachment.filename || 'attachment';
      const fileType = (textItem && textItem.fileType) || attachment.fileType || 'txt';

      const truncatedText = fileText.length > 40000
        ? fileText.slice(0, 40000) + '\n\n[... content truncated for token limits ...]'
        : fileText;

      const fileContextPrompt = `[ATTACHED FILE: ${filename} (${fileType})]\n\`\`\`${fileType}\n${truncatedText}\n\`\`\`\n[END OF ATTACHED FILE]\n\nUser Question:\n${userQuery}`;

      let contents = [];
      if (Array.isArray(history) && history.length > 0) {
        for (const h of history) {
          if (h && typeof h.text === 'string' && (h.role === 'user' || h.role === 'model' || h.role === 'assistant')) {
            contents.push({
              role: h.role === 'assistant' ? 'model' : h.role,
              parts: [{ text: h.text }]
            });
          }
        }
      }
      contents.push({
        role: 'user',
        parts: [{ text: fileContextPrompt }]
      });

      const response = await ai.models.generateContent({
        model: configuredModel,
        contents: contents,
        config: {
          systemInstruction: `You are SmartAssist AI, an expert academic and software engineering copilot. The user has provided an attached source code or text file. Ground your response in the file content, explain details clearly with line/function references, and provide clean code examples where appropriate.${styleDirective}${langDirective}`
        }
      });

      const reply = response && response.text ? response.text : 'I was unable to analyze the attached file.';
      return res.json({
        reply,
        attachment: {
          id: attachment.id,
          filename: filename,
          fileType: fileType
        }
      });
    }

    // ------------------------------------------------------------------------
    // CASE 3: Standard Conversational Text Chat
    // ------------------------------------------------------------------------
    let contents = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const h of history) {
        if (h && typeof h.text === 'string' && (h.role === 'user' || h.role === 'model' || h.role === 'assistant')) {
          contents.push({
            role: h.role === 'assistant' ? 'model' : h.role,
            parts: [{ text: h.text }]
          });
        }
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: userQuery }]
    });

    // Call Gemini API with candidate fallback and backoff retry
    let response;
    const candidateModels = [configuredModel, 'gemini-3.8-flash', 'gemini-flash-latest'].filter(Boolean);
    const uniqueModels = [...new Set(candidateModels)];
    let lastError = null;

    for (const modelToTry of uniqueModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: modelToTry,
            contents: contents.length === 1 ? userQuery : contents,
            config: {
              systemInstruction: `You are SmartAssist AI, a helpful, precise academic and developer copilot. Provide clear, structured, and technically accurate responses with code examples where relevant.${styleDirective}${langDirective}`
            }
          });
          if (response && response.text) break;
        } catch (genErr) {
          lastError = genErr;
          const errMsg = genErr && genErr.message ? String(genErr.message) : '';
          const isTransient = errMsg.includes('503') || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('overloaded');
          if (isTransient && attempt === 0) {
            await new Promise(r => setTimeout(r, 1200));
            continue;
          }
          break;
        }
      }
      if (response && response.text) break;
    }

    if (!response || !response.text) {
      throw lastError || new Error('Unable to generate response from Gemini API.');
    }

    const reply = response && response.text ? response.text : 'I was unable to generate a response.';
    return res.json({ reply });
  } catch (error) {
    const safeErrorMessage = sanitizeError(error);
    console.error(`[Chat API Error]:`, safeErrorMessage);
    return res.status(500).json({
      error: safeErrorMessage
    });
  }
});

// POST /api/study/assist - Real Gemini-powered Study Assistant Engine
app.post('/api/study/assist', async (req, res) => {
  try {
    const { mode = 'explain', subject, topic, depth = 'intermediate', notes = '' } = req.body || {};

    const validModes = ['explain', 'summarize', 'mcq'];
    const validDepths = ['beginner', 'intermediate', 'advanced'];

    const chosenMode = validModes.includes(mode) ? mode : 'explain';
    const chosenDepth = validDepths.includes(depth) ? depth : 'intermediate';

    // 1. Validation
    const cleanSubject = typeof subject === 'string' ? subject.trim() : '';
    const cleanTopic = typeof topic === 'string' ? topic.trim() : '';
    const cleanNotes = typeof notes === 'string' ? notes.trim() : '';

    if (chosenMode === 'explain' || chosenMode === 'mcq') {
      if (!cleanSubject) {
        return res.status(400).json({ error: 'Please select or enter an academic Subject.' });
      }
      if (!cleanTopic) {
        return res.status(400).json({ error: 'Please select or enter a Topic to study.' });
      }
    } else if (chosenMode === 'summarize') {
      if (!cleanNotes && !cleanTopic) {
        return res.status(400).json({ error: 'Please provide Supplementary Notes or a Topic to summarize.' });
      }
    }

    if (cleanNotes.length > 30000) {
      return res.status(400).json({ error: 'Supplementary notes too long (maximum 30,000 characters).' });
    }

    // 2. Validate Gemini API Key
    const apiKey = getApiKey();
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY' || apiKey.includes('YOUR_API_KEY_HERE')) {
      return res.status(503).json({
        error: 'Gemini API key is not configured. Please open .env and set your valid GEMINI_API_KEY.'
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const configuredModel = getGeminiModel(req.body?.preferences?.model || req.body?.model);

    // 3. Construct Tailored Prompts
    let systemInstruction = 'You are SmartAssist AI Study Assistant, a world-class academic tutor and Computer Science & Engineering professor. Provide accurate, clear, and deeply helpful responses.';
    let promptText = '';

    if (chosenMode === 'explain') {
      const depthGuides = {
        beginner: 'Focus on intuitive mental models, plain everyday analogies, simple definitions, and fundamental building blocks. Avoid overly dense notation. Explain WHY it exists.',
        intermediate: 'Provide a structured, rigorous technical breakdown. Include formal definition, sequential algorithmic steps or workflow, architecture trade-offs, standard formulas, and clean practical code examples.',
        advanced: 'Provide an in-depth systems-level analysis. Include kernel or hardware mechanics, memory/cache hierarchy impacts, concurrency/race condition hazards, complexity proofs, and production engineering edge cases.'
      };

      promptText = `Provide a comprehensive academic explanation for B.Tech Computer Science syllabus:
Subject: ${cleanSubject}
Topic: ${cleanTopic}
Comprehension Depth: ${chosenDepth.toUpperCase()} (${depthGuides[chosenDepth]})
${cleanNotes ? `User-Supplied Notes/Context:\n"${cleanNotes}"\n` : ''}

Format your output in clean, professional Markdown with these exact sections:
### Unit Overview
Provide a brief academic badge title (e.g. "Unit 2 • OS-SCHED") and quick concept category.

### Core Definition
Provide a precise, authoritative 2-3 sentence definition.

### Key Concepts & Variants
Detail 3 to 4 core pillars, algorithms, or classifications with concise descriptions.

### Step-by-Step Breakdown
Explain the exact sequential flow or algorithmic logic step by step.

### Concrete Implementation / Example
Provide an illustrative code snippet (in Python, C++, Java, or pseudo-code) or trace illustrating this concept.

### Exam Revision Tips
List 2 to 3 high-yield exam takeaways, common theoretical pitfalls, or university viva questions.

### Quick Summary
A 2-sentence crisp recap.`;

    } else if (chosenMode === 'summarize') {
      promptText = `Provide a high-yield academic study summary:
Subject: ${cleanSubject || 'Computer Science'}
Topic: ${cleanTopic || 'Lecture Synthesis'}
Target Depth: ${chosenDepth.toUpperCase()}
Material to Summarize:
${cleanNotes ? cleanNotes : `Comprehensive summary of the core concepts of "${cleanTopic}" under "${cleanSubject}".`}

Format your output in clean, structured Markdown:
### Executive Summary
High-level overview of what this material represents.

### Core Definitions & Formulas
Bullet points of essential terminology, formulas, equations, or time/space complexities.

### Key Conceptual Pillars
The most critical concepts and logic organized into crisp, digestible bullet points.

### Exam Cram Points
Essential rapid-fire facts and distinction comparisons frequently asked in exams.`;

    } else if (chosenMode === 'mcq') {
      systemInstruction = 'You are an academic test generator for Computer Science university exams. You output ONLY strictly valid JSON without markdown fences.';
      promptText = `Generate exactly 5 high-quality, non-trivial Multiple Choice Questions (MCQs) for B.Tech Computer Science:
Subject: ${cleanSubject}
Topic: ${cleanTopic}
Target Difficulty Level: ${chosenDepth.toUpperCase()}
${cleanNotes ? `Context from user notes: "${cleanNotes}"` : ''}

You MUST respond with valid JSON matching this exact structure:
{
  "subject": "${cleanSubject}",
  "topic": "${cleanTopic}",
  "difficulty": "${chosenDepth}",
  "questions": [
    {
      "id": 1,
      "question": "Clear, technically precise question text?",
      "options": [
        { "key": "A", "text": "First option" },
        { "key": "B", "text": "Second option" },
        { "key": "C", "text": "Third option" },
        { "key": "D", "text": "Fourth option" }
      ],
      "correctKey": "A",
      "explanation": "Clear explanation of why this option is correct and why the alternatives are incorrect."
    }
  ]
}
IMPORTANT: Only valid JSON. No markdown code blocks, no backticks.`;
    }

    // 4. Generate Content with Fallback and Retry Backoff
    let response;
    const candidateModels = [configuredModel, 'gemini-3.8-flash', 'gemini-flash-latest'].filter(Boolean);
    const uniqueModels = [...new Set(candidateModels)];
    let lastError = null;

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
          lastError = genErr;
          const errMsg = genErr?.message || '';
          const isRateLimitOrOverload = errMsg.includes('503') || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('overloaded');
          if (isRateLimitOrOverload && attempt === 0) {
            await new Promise(res => setTimeout(res, 1200));
            continue;
          }
          break; // try next candidate model
        }
      }
      if (response && response.text) break;
    }

    if (!response || !response.text) {
      throw lastError || new Error('Unable to generate response from Gemini API.');
    }

    const rawText = response && response.text ? response.text : '';

    // 5. Handle output based on mode
    if (chosenMode === 'mcq') {
      let cleanJson = rawText.trim();
      if (cleanJson.startsWith('```json')) {
        cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      let parsedData = null;
      try {
        parsedData = JSON.parse(cleanJson);
      } catch (parseErr) {
        const match = cleanJson.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsedData = JSON.parse(match[0]);
          } catch (e2) {}
        }
      }

      if (!parsedData || !Array.isArray(parsedData.questions) || parsedData.questions.length === 0) {
        return res.status(500).json({
          error: 'AI generated questions in an unexpected format. Please retry.'
        });
      }

      return res.json({
        success: true,
        mode: 'mcq',
        subject: cleanSubject,
        topic: cleanTopic,
        depth: chosenDepth,
        data: parsedData
      });
    }

    return res.json({
      success: true,
      mode: chosenMode,
      subject: cleanSubject,
      topic: cleanTopic,
      depth: chosenDepth,
      markdown: rawText
    });

  } catch (err) {
    const safeError = sanitizeError(err);
    console.error('[Study Assist API Error]:', safeError);
    return res.status(500).json({ error: safeError });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const apiKey = getApiKey();
  const hasKey = Boolean(apiKey && apiKey !== 'YOUR_GEMINI_API_KEY');
  res.json({
    status: 'ok',
    geminiConfigured: hasKey,
    model: process.env.GEMINI_MODEL || 'gemini-flash-latest'
  });
});

// Helper: Initialize official Supabase client with safe server-side config
function getSupabaseClient() {
  dotenv.config({ path: envPath, override: true });
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const supabaseKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  const isConfigured = Boolean(
    supabaseUrl &&
    supabaseKey &&
    !supabaseUrl.includes('YOUR_') &&
    !supabaseKey.includes('YOUR_')
  );

  if (!isConfigured) return null;

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

// Authentication provider status endpoint
app.get('/api/auth/status', (req, res) => {
  const supabase = getSupabaseClient();
  const isConfigured = Boolean(supabase);

  res.json({
    provider: isConfigured ? 'supabase' : null,
    configured: isConfigured,
    message: isConfigured
      ? 'Supabase authentication is configured and active.'
      : 'No real authentication provider configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env to enable real accounts.'
  });
});

// Provide public Supabase config (URL and anon key) to frontend client
app.get('/api/auth/config', (req, res) => {
  dotenv.config({ path: envPath, override: true });
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  const isConfigured = Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('YOUR_') &&
    !supabaseAnonKey.includes('YOUR_')
  );

  if (!isConfigured) {
    return res.status(503).json({ configured: false, error: 'Supabase is not configured' });
  }

  res.json({
    configured: true,
    supabaseUrl,
    supabaseAnonKey
  });
});

// Real Account Registration Endpoint (Supabase Auth email/password)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body || {};

    // 1. Validate inputs
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return res.status(400).json({ error: 'Full legal or academic name is required (min 2 characters).' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({
        configured: false,
        error: 'Authentication provider is not yet configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.'
      });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();

    // 2. Call Supabase Auth signUp
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: password,
      options: {
        data: {
          full_name: trimmedName
        }
      }
    });

    if (error) {
      if (error.message && error.message.toLowerCase().includes('already registered')) {
        return res.status(409).json({
          error: 'An account with this email address already exists. Please sign in or reset your password.'
        });
      }
      return res.status(error.status || 400).json({ error: error.message });
    }

    // Supabase returns empty identities list if user already exists and confirm email is enabled
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return res.status(409).json({
        error: 'An account with this email address already exists. Please sign in or reset your password.'
      });
    }

    const requiresConfirmation = !data?.session;

    return res.status(201).json({
      success: true,
      requiresConfirmation,
      message: requiresConfirmation
        ? 'Registration successful! A confirmation email has been sent. Please verify your email before signing in.'
        : 'Account created successfully! You can now sign in.',
      user: {
        id: data?.user?.id,
        email: data?.user?.email,
        name: trimmedName
      }
    });
  } catch (err) {
    console.error('[Auth Registration Error]:', err?.message || err);
    return res.status(500).json({
      error: 'An internal error occurred while communicating with the authentication service.'
    });
  }
});

// User Sign In Endpoint (Supabase Auth signInWithPassword)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Email address is required.' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required.' });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({
        configured: false,
        error: 'Authentication provider is not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.'
      });
    }

    const trimmedEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: password
    });

    if (error) {
      const msg = error.message || '';
      if (msg.includes('Invalid login credentials')) {
        return res.status(401).json({
          error: 'The email or password you entered is incorrect. Please verify your credentials and try again.'
        });
      }
      if (msg.toLowerCase().includes('email not confirmed')) {
        return res.status(403).json({
          unconfirmed: true,
          error: 'Please confirm your email address before signing in. Check your inbox for the confirmation link.'
        });
      }
      return res.status(error.status || 400).json({ error: msg });
    }

    return res.status(200).json({
      success: true,
      message: 'Signed in successfully!',
      user: {
        id: data?.user?.id,
        email: data?.user?.email,
        name: data?.user?.user_metadata?.full_name || trimmedEmail.split('@')[0]
      },
      session: {
        accessToken: data?.session?.access_token,
        refreshToken: data?.session?.refresh_token,
        expiresAt: data?.session?.expires_at
      }
    });
  } catch (err) {
    console.error('[Auth Login Error]:', err?.message || err);
    return res.status(500).json({
      error: 'An internal error occurred during authentication.'
    });
  }
});

// Password Reset Request Endpoint (Supabase Auth resetPasswordForEmail)
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email } = req.body || {};

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({
        configured: false,
        error: 'Authentication provider is not configured.'
      });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol || 'http';
    const redirectTo = `${protocol}://${host}/09_sign_in/code.html`;

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: redirectTo
    });

    if (error) {
      return res.status(error.status || 400).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      message: `If an account exists for ${trimmedEmail}, a password reset link has been dispatched.`
    });
  } catch (err) {
    console.error('[Auth Reset Password Error]:', err?.message || err);
    return res.status(500).json({
      error: 'An internal error occurred while processing password recovery.'
    });
  }
});

// Sign out endpoint
app.post('/api/auth/logout', async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (supabase && token) {
      await supabase.auth.admin?.signOut?.(token).catch(() => {});
    }
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    return res.status(200).json({ success: true, message: 'Logged out' });
  }
});

// ============================================================================
// USER PROFILE AVATAR MANAGEMENT (Upload, Serve, Remove)
// ============================================================================

const AVATARS_DIR = path.resolve(__dirname, 'uploads', 'avatars');
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });

// Multer storage for profile photos (max 5MB, JPEG, PNG, WebP)
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = new Set(['.jpg', '.jpeg', '.png', '.webp']);
    const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedExts.has(ext) || !allowedMimes.has(file.mimetype)) {
      return cb(new Error('Invalid image format. Only JPEG, PNG, and WebP images up to 5MB are supported.'));
    }
    cb(null, true);
  }
});

function handleAvatarUpload(req, res, next) {
  avatarUpload.fields([{ name: 'file', maxCount: 1 }, { name: 'photo', maxCount: 1 }])(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Photo exceeds the maximum allowed size of 5 MB.' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    // Normalize to req.file
    if (req.files) {
      req.file = req.files['file']?.[0] || req.files['photo']?.[0] || null;
    }
    next();
  });
}

function validateImageMagicBytes(buffer) {
  if (!buffer || buffer.length < 12) return false;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg';
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'png';
  // WebP: RIFF .... WEBP
  const riff = buffer.subarray(0, 4).toString('ascii');
  const webp = buffer.subarray(8, 12).toString('ascii');
  if (riff === 'RIFF' && webp === 'WEBP') return 'webp';
  return false;
}

// 1. POST /api/profile/avatar - Upload profile photo
app.post('/api/profile/avatar', async (req, res, next) => {
  const user = await getAuthUser(req);
  if (!user || user.id === 'guest_user') {
    return res.status(401).json({ error: 'Authentication required to update profile photo.' });
  }

  handleAvatarUpload(req, res, async () => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'No image file was provided.' });
      }

    const buffer = req.file.buffer;
    const detectedExt = validateImageMagicBytes(buffer);
    if (!detectedExt) {
      return res.status(400).json({ error: 'Uploaded file is corrupted or not a valid JPEG, PNG, or WebP image.' });
    }

    // Clean up any existing avatar for this user
    const extensions = ['jpg', 'jpeg', 'png', 'webp'];
    for (const ext of extensions) {
      const p = path.join(AVATARS_DIR, `${user.id}.${ext}`);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (_) {}
      }
    }

    // Save new avatar file
    const targetPath = path.join(AVATARS_DIR, `${user.id}.${detectedExt}`);
    fs.writeFileSync(targetPath, buffer);

    const avatarUrl = `/api/profile/avatar/${user.id}?v=${Date.now()}`;

    // Update Supabase Auth user_metadata
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.auth.admin?.updateUserById?.(user.id, {
          user_metadata: { avatar_url: avatarUrl }
        }).catch(() => {});
      } catch (_) {}
    }

    return res.status(200).json({
      success: true,
      message: 'Profile photo uploaded and persisted successfully.',
      avatarUrl: avatarUrl
    });
  } catch (err) {
    console.error('[Avatar Upload Error]:', err?.message || err);
    return res.status(500).json({ error: 'Failed to upload profile photo: ' + (err?.message || err) });
  }
  });
});

// 2. GET /api/profile/avatar/:userId - Serve profile photo
app.get('/api/profile/avatar/:userId', (req, res) => {
  try {
    const rawUserId = req.params.userId || '';
    const safeUserId = path.basename(rawUserId); // Guard against directory traversal
    if (!safeUserId || safeUserId === '.' || safeUserId === '..') {
      return res.status(400).send('Invalid user ID.');
    }

    const extensions = ['jpg', 'jpeg', 'png', 'webp'];
    let foundPath = null;
    let foundExt = null;

    for (const ext of extensions) {
      const p = path.join(AVATARS_DIR, `${safeUserId}.${ext}`);
      if (fs.existsSync(p)) {
        foundPath = p;
        foundExt = ext;
        break;
      }
    }

    if (!foundPath) {
      return res.status(404).send('Avatar not found.');
    }

    const mimeTypes = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp'
    };

    res.setHeader('Content-Type', mimeTypes[foundExt] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    return res.sendFile(foundPath);
  } catch (err) {
    return res.status(500).send('Error serving avatar.');
  }
});

// 3. DELETE /api/profile/avatar - Remove profile photo
app.delete('/api/profile/avatar', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || user.id === 'guest_user') {
      return res.status(401).json({ error: 'Authentication required to remove profile photo.' });
    }

    const extensions = ['jpg', 'jpeg', 'png', 'webp'];
    for (const ext of extensions) {
      const p = path.join(AVATARS_DIR, `${user.id}.${ext}`);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (_) {}
      }
    }

    // Update Supabase Auth user_metadata
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.auth.admin?.updateUserById?.(user.id, {
          user_metadata: { avatar_url: '' }
        }).catch(() => {});
      } catch (_) {}
    }

    return res.status(200).json({
      success: true,
      message: 'Profile photo removed successfully.',
      avatarUrl: ''
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove profile photo.' });
  }
});

// ============================================================================
// PDF RAG & DOCUMENT MANAGEMENT ENDPOINTS
// ============================================================================

// Multer storage & upload handler (50MB limit, PDF-only)
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.pdf' && file.mimetype !== 'application/pdf') {
      return cb(new Error('Invalid file type. Only PDF documents (.pdf) up to 50MB are supported.'));
    }
    cb(null, true);
  }
});

function handlePdfUpload(req, res, next) {
  pdfUpload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File exceeds the maximum allowed size of 50 MB.' });
      }
      return res.status(400).json({ error: `File upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}

// Helper: Safely decode JWT payload without external library
function decodeJwtPayload(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length === 3) {
      const payloadStr = Buffer.from(parts[1], 'base64url').toString('utf8');
      return JSON.parse(payloadStr);
    }
  } catch (_) {}
  return null;
}

// Helper: Resolve physical PDF file path safely against uploads directory
function getResolvedPdfPath(doc) {
  if (!doc) return null;
  // 1. Direct absolute path check
  if (doc.filePath && path.isAbsolute(doc.filePath) && fs.existsSync(doc.filePath)) {
    return doc.filePath;
  }
  // 2. Relative or basename lookup in uploads/
  if (doc.filePath) {
    const candidate = path.resolve(UPLOADS_DIR, path.basename(doc.filePath));
    if (fs.existsSync(candidate)) return candidate;
  }
  // 3. Fallback by doc.id in uploads/
  if (doc.id) {
    const candidateId = path.resolve(UPLOADS_DIR, `${doc.id}.pdf`);
    if (fs.existsSync(candidateId)) return candidateId;
  }
  return null;
}

// Helper: Extract authenticated user from Authorization header, query parameters, or guest ID
async function getAuthUser(req) {
  try {
    // 1. Check Authorization header or query parameter 'token' / 'auth'
    const authHeader = req.headers.authorization;
    let token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
    if (!token && req.query) {
      token = (req.query.token || req.query.auth || '').trim();
    }

    if (token) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { data: { user }, error } = await supabase.auth.getUser(token);
          if (user && !error) return user;
        } catch (_) {}
      }

      // Resilient fallback: decode valid JWT structure
      const jwtPayload = decodeJwtPayload(token);
      if (jwtPayload && jwtPayload.sub) {
        const nowSec = Math.floor(Date.now() / 1000);
        if (!jwtPayload.exp || jwtPayload.exp > nowSec) {
          return {
            id: jwtPayload.sub,
            email: jwtPayload.email || 'user@smartassist.ai',
            isGuest: false
          };
        }
      }
    }

    // 2. Next check user ID or guest ID from headers or query params
    const rawUserId = req.headers['x-user-id'] || req.query?.['x-user-id'] || req.query?.userId || req.query?.user_id;
    if (rawUserId && typeof rawUserId === 'string' && rawUserId.trim().length > 3) {
      return { id: rawUserId.trim(), email: 'user@smartassist.ai', isGuest: false };
    }

    const guestId = req.headers['x-guest-id'] || req.query?.['x-guest-id'] || req.query?.guestId || req.query?.guest_id;
    if (guestId && typeof guestId === 'string' && guestId.trim().length > 3) {
      return { id: guestId.trim(), email: 'guest@smartassist.ai', isGuest: true };
    }

    return { id: 'guest_user', email: 'guest@smartassist.ai', isGuest: true };
  } catch (e) {
    return { id: 'guest_user', email: 'guest@smartassist.ai', isGuest: true };
  }
}

// 1. POST /api/pdf/upload - Real PDF Upload & Processing
app.post('/api/pdf/upload', handlePdfUpload, async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No PDF file was uploaded. Please select a valid PDF file.' });
    }

    const buffer = req.file.buffer;

    // Validate PDF magic bytes %PDF-
    if (!buffer.slice(0, 5).toString('ascii').startsWith('%PDF-')) {
      return res.status(400).json({ error: 'Uploaded file is corrupted or not a valid PDF document (missing %PDF- header).' });
    }

    const user = await getAuthUser(req);
    const originalFilename = req.file.originalname || 'document.pdf';

    const apiKey = getApiKey();
    const ai = (apiKey && apiKey !== 'YOUR_GEMINI_API_KEY') ? new GoogleGenAI({ apiKey }) : null;
    const configuredModel = getGeminiModel();

    // Parse PDF page by page with AI suggestions
    const parsed = await parsePdfBuffer(buffer, originalFilename, {
      chunkSize: 900,
      chunkOverlap: 150,
      ai,
      model: configuredModel
    });

    // Save physical file safely in uploads/
    const uploadsDir = path.resolve(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const docId = `doc_${crypto.randomUUID()}`;
    const filePath = path.join(uploadsDir, `${docId}.pdf`);
    fs.writeFileSync(filePath, buffer);

    const doc = {
      id: docId,
      userId: user.id,
      userEmail: user.email,
      filename: originalFilename,
      filePath,
      fileSize: buffer.length,
      pageCount: parsed.pageCount,
      isScanned: parsed.isScanned,
      scanNotice: parsed.scanNotice,
      chapters: parsed.chapters,
      suggestedQuestions: parsed.suggestedQuestions,
      chunks: parsed.chunks,
      indexSettings: {
        chunkSize: 900,
        chunkOverlap: 150,
        topK: 5,
        embeddingModel: 'gemini-embedding-001'
      },
      status: parsed.isScanned ? 'scanned_ocr_required' : 'indexed',
      uploadedAt: new Date().toISOString()
    };

    pdfStore.saveDoc(doc);

    // Sync to Supabase in background if configured
    syncDocToSupabase(getSupabaseClient(), doc);

    return res.status(201).json({
      success: true,
      document: {
        id: doc.id,
        filename: doc.filename,
        fileSize: doc.fileSize,
        pageCount: doc.pageCount,
        chunkCount: doc.chunks.length,
        chapters: doc.chapters,
        suggestedQuestions: doc.suggestedQuestions,
        isScanned: doc.isScanned,
        scanNotice: doc.scanNotice,
        status: doc.status,
        indexSettings: doc.indexSettings,
        uploadedAt: doc.uploadedAt
      }
    });
  } catch (err) {
    console.error('[PDF Upload Error]:', err?.message || err);
    return res.status(500).json({
      error: `Failed to process uploaded PDF: ${err?.message || 'Internal parsing error'}`
    });
  }
});

// 2. POST /api/pdf/upload-url - SSRF-safe URL Download & Indexing
app.post('/api/pdf/upload-url', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: 'A valid HTTP or HTTPS PDF URL is required.' });
    }

    const user = await getAuthUser(req);

    // Safely download with SSRF protections and 50MB check
    const { buffer, filename } = await downloadPdfFromUrl(url.trim());

    const apiKey = getApiKey();
    const ai = (apiKey && apiKey !== 'YOUR_GEMINI_API_KEY') ? new GoogleGenAI({ apiKey }) : null;
    const configuredModel = getGeminiModel();

    // Parse PDF with AI suggestions
    const parsed = await parsePdfBuffer(buffer, filename, {
      chunkSize: 900,
      chunkOverlap: 150,
      ai,
      model: configuredModel
    });

    const uploadsDir = path.resolve(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const docId = `doc_${crypto.randomUUID()}`;
    const filePath = path.join(uploadsDir, `${docId}.pdf`);
    fs.writeFileSync(filePath, buffer);

    const doc = {
      id: docId,
      userId: user.id,
      userEmail: user.email,
      filename,
      filePath,
      fileSize: buffer.length,
      pageCount: parsed.pageCount,
      isScanned: parsed.isScanned,
      scanNotice: parsed.scanNotice,
      chapters: parsed.chapters,
      suggestedQuestions: parsed.suggestedQuestions,
      chunks: parsed.chunks,
      indexSettings: {
        chunkSize: 900,
        chunkOverlap: 150,
        topK: 5,
        embeddingModel: 'gemini-embedding-001'
      },
      status: parsed.isScanned ? 'scanned_ocr_required' : 'indexed',
      uploadedAt: new Date().toISOString()
    };

    pdfStore.saveDoc(doc);
    syncDocToSupabase(getSupabaseClient(), doc);

    return res.status(201).json({
      success: true,
      document: {
        id: doc.id,
        filename: doc.filename,
        fileSize: doc.fileSize,
        pageCount: doc.pageCount,
        chunkCount: doc.chunks.length,
        chapters: doc.chapters,
        suggestedQuestions: doc.suggestedQuestions,
        isScanned: doc.isScanned,
        scanNotice: doc.scanNotice,
        status: doc.status,
        indexSettings: doc.indexSettings,
        uploadedAt: doc.uploadedAt
      }
    });
  } catch (err) {
    console.error('[PDF URL Download Error]:', err?.message || err);
    return res.status(400).json({
      error: err?.message || 'Could not download or parse PDF from the specified URL.'
    });
  }
});

// 3. GET /api/pdf/documents - List User's Uploaded Documents
app.get('/api/pdf/documents', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const docs = pdfStore.listDocs(user.id);
    return res.json({ documents: docs });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve documents.' });
  }
});

// 4. GET /api/pdf/document/:docId - Get Single Document Metadata
app.get('/api/pdf/document/:docId', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const doc = pdfStore.getDoc(req.params.docId, user.id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found or access denied.' });
    }

    return res.json({
      document: {
        id: doc.id,
        filename: doc.filename,
        fileSize: doc.fileSize,
        pageCount: doc.pageCount,
        chunkCount: doc.chunks ? doc.chunks.length : 0,
        chapters: doc.chapters || [],
        suggestedQuestions: doc.suggestedQuestions || [],
        isScanned: Boolean(doc.isScanned),
        scanNotice: doc.scanNotice || null,
        status: doc.status || 'indexed',
        indexSettings: doc.indexSettings || {
          chunkSize: 900,
          chunkOverlap: 150,
          topK: 5,
          embeddingModel: 'gemini-embedding-001'
        },
        uploadedAt: doc.uploadedAt
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve document details.' });
  }
});

// 4b. GET /api/pdf/document/:docId/suggestions - Get or dynamically generate document-aware suggestions
app.get('/api/pdf/document/:docId/suggestions', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const doc = pdfStore.getDoc(req.params.docId, user.id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found or access unauthorized.' });
    }

    if (doc.isScanned || !doc.chunks || doc.chunks.length === 0) {
      return res.json({
        docId: doc.id,
        filename: doc.filename,
        isScanned: true,
        suggestions: []
      });
    }

    const forceRefresh = req.query.refresh === 'true';
    const legacyBadQuestion = 'Explain the scheduling algorithms discussed';
    const isLegacyBadResume = doc.filename?.toLowerCase().includes('resume') &&
      Array.isArray(doc.suggestedQuestions) &&
      doc.suggestedQuestions.includes(legacyBadQuestion);

    const hasExistingValidSuggestions = Array.isArray(doc.suggestedQuestions) &&
      doc.suggestedQuestions.length >= 2 &&
      !isLegacyBadResume &&
      !forceRefresh;

    if (hasExistingValidSuggestions) {
      return res.json({
        docId: doc.id,
        filename: doc.filename,
        suggestions: doc.suggestedQuestions
      });
    }

    // Generate fresh dynamic suggestions with Gemini
    const apiKey = getApiKey();
    const ai = (apiKey && apiKey !== 'YOUR_GEMINI_API_KEY') ? new GoogleGenAI({ apiKey }) : null;
    const model = getGeminiModel();

    // Map doc chunks back to virtual pages for excerpt extraction
    const pages = [];
    const pageMap = new Map();
    for (const chunk of (doc.chunks || [])) {
      const pNum = chunk.pageNumber || 1;
      if (!pageMap.has(pNum)) pageMap.set(pNum, []);
      pageMap.get(pNum).push(chunk.content);
    }
    for (const [pNum, textArr] of pageMap.entries()) {
      pages.push({ pageNumber: pNum, text: textArr.join('\n') });
    }

    const suggestions = await generateDynamicSuggestions(ai, model, doc.filename, doc.chapters || [], pages, doc.chunks);
    doc.suggestedQuestions = suggestions;
    pdfStore.saveDoc(doc);
    syncDocToSupabase(getSupabaseClient(), doc);

    return res.json({
      docId: doc.id,
      filename: doc.filename,
      suggestions: doc.suggestedQuestions
    });
  } catch (err) {
    console.error('[PDF Suggestions Error]:', err?.message || err);
    return res.status(500).json({ error: 'Failed to generate suggestions.' });
  }
});

// 5. GET /api/pdf/document/:docId/view - Stream PDF inline for viewer modal
app.get('/api/pdf/document/:docId/view', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const doc = pdfStore.getDoc(req.params.docId, user.id);
    const resolvedPath = getResolvedPdfPath(doc);

    if (!doc || !resolvedPath) {
      return res.status(404).send('Document not found or access unauthorized.');
    }

    const filename = doc.filename || 'document.pdf';
    const safeAsciiFilename = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    const safeUtf8Filename = encodeURIComponent(filename);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeAsciiFilename}"; filename*=UTF-8''${safeUtf8Filename}`);
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Accept-Ranges', 'bytes');

    return res.sendFile(resolvedPath);
  } catch (err) {
    console.error('[PDF View Error]:', err?.message || err);
    return res.status(500).send('Error streaming PDF document.');
  }
});

// 6. GET /api/pdf/document/:docId/download - Download PDF attachment
app.get('/api/pdf/document/:docId/download', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const doc = pdfStore.getDoc(req.params.docId, user.id);
    const resolvedPath = getResolvedPdfPath(doc);

    if (!doc || !resolvedPath) {
      return res.status(404).json({ error: 'Document not found or access unauthorized.' });
    }

    const filename = doc.filename || 'document.pdf';
    const safeAsciiFilename = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    const safeUtf8Filename = encodeURIComponent(filename);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${safeUtf8Filename}`);

    return res.sendFile(resolvedPath);
  } catch (err) {
    console.error('[PDF Download Error]:', err?.message || err);
    return res.status(500).json({ error: 'Error downloading PDF document.' });
  }
});

// 7. DELETE /api/pdf/document/:docId - Remove Document & Embeddings
app.delete('/api/pdf/document/:docId', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const deleted = pdfStore.deleteDoc(req.params.docId, user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Document not found or access unauthorized.' });
    }

    deleteDocFromSupabase(getSupabaseClient(), req.params.docId, user.id);

    return res.json({ success: true, message: 'Document and indexed chunks successfully removed.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete document.' });
  }
});

// 7b. DELETE /api/pdf/documents/user/all - Delete all uploaded documents for authenticated user
app.delete('/api/pdf/documents/user/all', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const userDocs = pdfStore.listDocs(user.id);
    let deletedCount = 0;

    for (const doc of userDocs) {
      if (pdfStore.deleteDoc(doc.id, user.id)) {
        deleteDocFromSupabase(getSupabaseClient(), doc.id, user.id);
        deletedCount++;
      }
    }

    return res.json({
      success: true,
      message: `Successfully purged ${deletedCount} stored document(s).`,
      deletedCount
    });
  } catch (err) {
    console.error('[PurgeDocs Error]:', err?.message || err);
    return res.status(500).json({ error: 'Failed to purge user documents.' });
  }
});

// GET /api/settings/config - Retrieve server runtime preferences and supported models
app.get('/api/settings/config', (req, res) => {
  res.json({
    activeModel: getGeminiModel(),
    supportedModels: [
      { id: 'gemini-3.5-flash', name: 'Google Gemini 3.5 Flash', latency: '~45ms', status: 'Active (Recommended)' },
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', latency: '~80ms', status: 'Next-Gen Multimodal' },
      { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', latency: '~60ms', status: 'Auto-updated' }
    ],
    maxAvatarSizeMb: 5,
    authProvider: 'Supabase'
  });
});

// 8. POST /api/pdf/replace/:docId - Replace Document with new PDF
app.post('/api/pdf/replace/:docId', handlePdfUpload, async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No replacement PDF file was uploaded.' });
    }

    const buffer = req.file.buffer;
    if (!buffer.slice(0, 5).toString('ascii').startsWith('%PDF-')) {
      return res.status(400).json({ error: 'Uploaded file is not a valid PDF document.' });
    }

    const user = await getAuthUser(req);
    const existing = pdfStore.getDoc(req.params.docId, user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Target document to replace not found.' });
    }

    const apiKey = getApiKey();
    const ai = (apiKey && apiKey !== 'YOUR_GEMINI_API_KEY') ? new GoogleGenAI({ apiKey }) : null;
    const configuredModel = getGeminiModel();

    // Parse replacement with fresh AI suggested questions
    const parsed = await parsePdfBuffer(buffer, req.file.originalname, {
      ...(existing.indexSettings || {}),
      ai,
      model: configuredModel
    });

    // Overwrite physical file safely
    const targetPath = getResolvedPdfPath(existing) || existing.filePath || path.join(UPLOADS_DIR, `${existing.id}.pdf`);
    fs.writeFileSync(targetPath, buffer);

    // Update document properties
    existing.filePath = targetPath;
    existing.filename = req.file.originalname;
    existing.fileSize = buffer.length;
    existing.pageCount = parsed.pageCount;
    existing.isScanned = parsed.isScanned;
    existing.scanNotice = parsed.scanNotice;
    existing.chapters = parsed.chapters;
    existing.suggestedQuestions = parsed.suggestedQuestions;
    existing.chunks = parsed.chunks;
    existing.status = parsed.isScanned ? 'scanned_ocr_required' : 'indexed';
    existing.uploadedAt = new Date().toISOString();

    pdfStore.saveDoc(existing);
    pdfStore.clearMessages(existing.id, user.id);
    syncDocToSupabase(getSupabaseClient(), existing);

    return res.json({
      success: true,
      message: 'Document replaced and re-indexed successfully.',
      document: {
        id: existing.id,
        filename: existing.filename,
        fileSize: existing.fileSize,
        pageCount: existing.pageCount,
        chunkCount: existing.chunks.length,
        chapters: existing.chapters,
        suggestedQuestions: existing.suggestedQuestions,
        isScanned: existing.isScanned,
        scanNotice: existing.scanNotice,
        status: existing.status,
        indexSettings: existing.indexSettings,
        uploadedAt: existing.uploadedAt
      }
    });
  } catch (err) {
    return res.status(500).json({ error: `Replacement failed: ${err?.message || err}` });
  }
});

// 9. POST /api/pdf/reindex - Update Index Settings and Re-chunk
app.post('/api/pdf/reindex', async (req, res) => {
  try {
    const { docId, chunkSize, chunkOverlap, topK } = req.body || {};
    if (!docId) {
      return res.status(400).json({ error: 'Document ID is required.' });
    }

    const user = await getAuthUser(req);
    const doc = pdfStore.getDoc(docId, user.id);
    if (!doc || !doc.filePath || !fs.existsSync(doc.filePath)) {
      return res.status(404).json({ error: 'Document not found or physical file missing.' });
    }

    const validatedChunkSize = Math.max(300, Math.min(2500, Number(chunkSize) || 900));
    const validatedOverlap = Math.max(50, Math.min(500, Number(chunkOverlap) || 150));
    const validatedTopK = Math.max(1, Math.min(15, Number(topK) || 5));

    const buffer = fs.readFileSync(doc.filePath);
    const parsed = await parsePdfBuffer(buffer, doc.filename, {
      chunkSize: validatedChunkSize,
      chunkOverlap: validatedOverlap
    });

    doc.chunks = parsed.chunks;
    doc.chapters = parsed.chapters;
    doc.suggestedQuestions = parsed.suggestedQuestions;
    doc.indexSettings = {
      chunkSize: validatedChunkSize,
      chunkOverlap: validatedOverlap,
      topK: validatedTopK,
      embeddingModel: 'gemini-embedding-001'
    };
    doc.status = parsed.isScanned ? 'scanned_ocr_required' : 'indexed';

    pdfStore.saveDoc(doc);
    syncDocToSupabase(getSupabaseClient(), doc);

    return res.json({
      success: true,
      message: 'Document re-indexed successfully with updated settings.',
      document: {
        id: doc.id,
        filename: doc.filename,
        fileSize: doc.fileSize,
        pageCount: doc.pageCount,
        chunkCount: doc.chunks.length,
        chapters: doc.chapters,
        suggestedQuestions: doc.suggestedQuestions,
        status: doc.status,
        indexSettings: doc.indexSettings
      }
    });
  } catch (err) {
    return res.status(500).json({ error: `Re-indexing failed: ${err?.message || err}` });
  }
});

// 10. POST /api/pdf/query - Real Grounded RAG Q&A with Citations
app.post('/api/pdf/query', async (req, res) => {
  try {
    const { docId, query, scopeMin, scopeMax, topK } = req.body || {};

    if (!docId || typeof docId !== 'string') {
      return res.status(400).json({ error: 'Please select a document to chat with.' });
    }

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'Please enter a question.' });
    }

    if (query.trim().length > 5000) {
      return res.status(400).json({ error: 'Query is too long (maximum 5,000 characters).' });
    }

    const user = await getAuthUser(req);
    const doc = pdfStore.getDoc(docId, user.id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found or access unauthorized.' });
    }

    if (doc.isScanned || !doc.chunks || doc.chunks.length === 0) {
      return res.json({
        answer: doc.scanNotice || 'This PDF does not contain extractable text. OCR is required to index and query image-only documents.',
        citations: [],
        topExcerpt: null,
        grounded: false,
        relevanceScore: 0
      });
    }

    const apiKey = getApiKey();
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
      return res.status(503).json({
        error: 'Gemini API key is not configured. Please set GEMINI_API_KEY in the root .env file.'
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const configuredModel = getGeminiModel();
    const effectiveTopK = Number(topK) || doc.indexSettings?.topK || 5;

    // Retrieve matching chunks via hybrid vector cosine similarity + BM25 keyword scoring
    const retrieved = await searchChunks(ai, doc.chunks, query.trim(), {
      topK: effectiveTopK,
      scopeMin: Number(scopeMin) || 1,
      scopeMax: Number(scopeMax) || Infinity
    });

    // Generate grounded answer with strict citation constraints
    const groundedResult = await generateGroundedAnswer(ai, configuredModel, doc, query.trim(), retrieved);

    // Save message history in local store
    pdfStore.addMessage(doc.id, { role: 'user', content: query.trim() }, user.id);
    const modelMsg = pdfStore.addMessage(doc.id, {
      role: 'model',
      content: groundedResult.answer,
      citations: groundedResult.citations,
      excerpt: groundedResult.topExcerpt,
      score: groundedResult.relevanceScore
    }, user.id);

    // Async sync messages to Supabase if configured
    syncMessageToSupabase(getSupabaseClient(), { docId: doc.id, userId: user.id, role: 'user', content: query.trim() });
    syncMessageToSupabase(getSupabaseClient(), modelMsg);

    return res.json({
      answer: groundedResult.answer,
      citations: groundedResult.citations,
      topExcerpt: groundedResult.topExcerpt,
      grounded: groundedResult.grounded,
      relevanceScore: groundedResult.relevanceScore,
      messageId: modelMsg?.id
    });
  } catch (err) {
    console.error('[PDF Query Error]:', err?.message || err);
    return res.status(500).json({
      error: sanitizeError(err)
    });
  }
});

// 11. GET /api/pdf/messages/:docId - Fetch Document Conversation History
app.get('/api/pdf/messages/:docId', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const messages = pdfStore.getMessages(req.params.docId, user.id);
    return res.json({ messages });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve messages.' });
  }
});

// 12. POST /api/pdf/messages/:docId/clear - Clear Document Conversation History
app.post('/api/pdf/messages/:docId/clear', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    pdfStore.clearMessages(req.params.docId, user.id);
    return res.json({ success: true, message: 'Chat history cleared for this document.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to clear chat history.' });
  }
});

// ============================================================================
// CODE ASSISTANT ENDPOINTS
// ============================================================================

// 1. POST /api/code/analyze - AI Code Analysis, Debugging, Generation & AST Evaluation
app.post('/api/code/analyze', async (req, res) => {
  const startTime = Date.now();
  try {
    const { code, language = 'python', mode = 'debug', prompt = '', filename = 'main.py' } = req.body || {};

    // 1. Validation
    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ error: 'Code is required. Please provide source code in the editor.' });
    }

    if (code.length > 30000) {
      return res.status(400).json({ error: 'Code exceeds maximum allowed size (30,000 characters).' });
    }

    const validLangs = ['python', 'javascript', 'java', 'cpp', 'c', 'typescript', 'c++'];
    const normLang = String(language).toLowerCase().trim();
    if (!validLangs.includes(normLang)) {
      return res.status(400).json({ error: `Language "${language}" is not currently supported for code analysis.` });
    }

    // 2. Validate API key
    const apiKey = getApiKey();
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY' || apiKey.includes('YOUR_API_KEY_HERE')) {
      return res.status(503).json({
        error: 'Gemini API key is not configured. Please open the root .env file and set your valid GEMINI_API_KEY.'
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const configuredModel = getGeminiModel(req.body?.preferences?.model || req.body?.model);

    // 3. Construct structured analysis prompt
    const systemPrompt = `You are an expert compiler engineer, algorithm designer, and code reviewer.
Analyze the user's ${normLang} source code strictly and objectively.
The user's intent mode is: "${mode}".
Optional user instructions / problem description: "${prompt || 'None provided'}".
Target file: "${filename}".

CRITICAL RULES:
1. ONLY report a bug on a specific line number if that exact line in the submitted code contains an error. Never fabricate line numbers or report errors on lines outside the line range of the submitted code. Line numbers must be 1-indexed and strictly correspond to the submitted code.
2. If the code is already correct and bug-free, return an empty issues array [] and set severity to "Clean".
3. Return ONLY a valid JSON object matching this exact schema without any markdown formatting or commentary outside the JSON:
{
  "summary": "Short 1-2 sentence high-level summary of the code and findings",
  "issues": [
    {
      "line": 5,
      "severity": "Logical Error",
      "category": "Logical Error",
      "message": "Direct concise explanation of the issue (e.g. Overwriting accumulator instead of accumulating)",
      "explanation": "Why this causes an issue at runtime"
    }
  ],
  "correctedCode": "The full corrected and complete implementation of the code",
  "explanation": "Clear explanation of how the correction resolves the issue and best practices followed",
  "complexity": {
    "time": "O(N)",
    "space": "O(1)",
    "profile": "Optimal Linear Summation: O(N) Time, O(1) Memory",
    "allocations": "0 heap allocations"
  },
  "steps": [
    {
      "stepNumber": 1,
      "title": "Concise step title",
      "description": "What this step does and why"
    }
  ],
  "testCases": [
    {
      "input": "Sample input representation",
      "expectedOutput": "Expected output string",
      "description": "Test case description"
    }
  ],
  "terminalEvaluation": {
    "output": "Expected output when the corrected code runs",
    "exitCode": 0,
    "executionStatus": "verified_expected",
    "note": "Semantic AST expected output."
  }
}`;

    const userContent = `Here is the source code to analyze (${normLang}):\n\`\`\`${normLang}\n${code}\n\`\`\``;

    // 4. Call Gemini with fallback
    let response;
    let usedModel = configuredModel;
    const candidateModels = [configuredModel, 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'].filter(Boolean);
    const uniqueModels = [...new Set(candidateModels)];
    let lastError = null;

    for (const modelToTry of uniqueModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: modelToTry,
            contents: [
              { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userContent}` }] }
            ],
            config: {
              responseMimeType: 'application/json',
              temperature: 0.1
            }
          });
          if (response && response.text) {
            usedModel = modelToTry;
            break;
          }
        } catch (genErr) {
          lastError = genErr;
          const errMsg = genErr && genErr.message ? String(genErr.message) : '';
          const isTransient = errMsg.includes('503') || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('overloaded');
          if (isTransient && attempt === 0) {
            await new Promise(r => setTimeout(r, 1200));
            continue;
          }
          break;
        }
      }
      if (response && response.text) break;
    }

    if (!response || !response.text) {
      throw lastError || new Error('No response returned from Gemini API.');
    }

    // 5. Parse JSON
    let parsed;
    try {
      let rawText = response.text.trim();
      if (rawText.startsWith('```json')) rawText = rawText.slice(7);
      if (rawText.startsWith('```')) rawText = rawText.slice(3);
      if (rawText.endsWith('```')) rawText = rawText.slice(0, -3);
      parsed = JSON.parse(rawText.trim());
    } catch (parseErr) {
      console.warn('[Code Analysis JSON Parse Error]:', response.text);
      throw new Error('Gemini returned an invalid structured format. Please try again.');
    }

    const latencyMs = Date.now() - startTime;

    return res.json({
      success: true,
      ...parsed,
      latencyMs,
      model: usedModel
    });
  } catch (err) {
    const safeError = sanitizeError(err);
    console.error('[Code Analysis Error]:', safeError);
    return res.status(500).json({ error: safeError });
  }
});

// 2. GET /api/code/sessions - List user's code sessions
app.get('/api/code/sessions', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const sessions = codeStore.getSessions(user.id);
    return res.json({ sessions });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve code sessions.' });
  }
});

// 3. POST /api/code/sessions - Create or update a session
app.post('/api/code/sessions', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const { id, title, language, filename, code, prompt, mode, result } = req.body || {};

    const sessionId = id || `code_${crypto.randomUUID()}`;
    const session = {
      id: sessionId,
      userId: user.id,
      userEmail: user.email,
      title: title || `${(language || 'Code').toUpperCase()} Session`,
      language: language || 'python',
      filename: filename || 'main.py',
      code: typeof code === 'string' ? code : '',
      prompt: prompt || '',
      mode: mode || 'debug',
      result: result || null
    };

    const saved = codeStore.saveSession(session);
    syncSessionToSupabase(getSupabaseClient(), saved);

    return res.status(201).json({ success: true, session: saved });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save code session.' });
  }
});

// 4. GET /api/code/sessions/:id - Get specific session
app.get('/api/code/sessions/:id', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const session = codeStore.getSession(req.params.id, user.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or unauthorized.' });
    }
    return res.json({ session });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve session.' });
  }
});

// 5. DELETE /api/code/sessions/:id - Delete session
app.delete('/api/code/sessions/:id', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const deleted = codeStore.deleteSession(req.params.id, user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Session not found or unauthorized.' });
    }
    deleteSessionFromSupabase(getSupabaseClient(), req.params.id, user.id);
    return res.json({ success: true, message: 'Session deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete session.' });
  }
});


// 2. DELETE /api/pdf/documents/user/all - Delete all PDF documents and chunks belonging to authenticated user
app.delete('/api/pdf/documents/user/all', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const userId = user.id;

    const userDocs = pdfStore.listDocs(userId);
    let deletedCount = 0;

    for (const doc of userDocs) {
      pdfStore.deleteDoc(doc.id);
      deleteDocFromSupabase(getSupabaseClient(), doc.id, userId);
      if (doc.filePath && fs.existsSync(doc.filePath)) {
        try { fs.unlinkSync(doc.filePath); } catch(e) {}
      }
      deletedCount++;
    }

    return res.json({
      success: true,
      deletedCount,
      message: `Successfully deleted ${deletedCount} document(s) for user.`
    });
  } catch (err) {
    console.error('[Delete All Documents Error]:', err?.message || err);
    return res.status(500).json({ error: 'Failed to purge documents.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`  SmartAssist AI Server running on port ${PORT}`);
  console.log(`  Local URL: http://localhost:${PORT}`);
  console.log(`  Welcome:   http://localhost:${PORT}/07_welcome/code.html`);
  console.log(`  Dashboard: http://localhost:${PORT}/01_main_chat_dashboard/code.html`);
  console.log(`  Chat:      http://localhost:${PORT}/02_active_conversation/code.html`);
  console.log(`==================================================\n`);
});
