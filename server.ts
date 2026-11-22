import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL_NAME = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface SearchResultItem {
  id: string;
  title: string;
  url: string;
  snippet: string;
  query: string;
  cycle: number;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function unwrapDuckDuckGoUrl(rawHref: string): string {
  try {
    if (rawHref.startsWith('//')) {
      rawHref = `https:${rawHref}`;
    }
    const parsed = new URL(rawHref, 'https://duckduckgo.com');
    const uddg = parsed.searchParams.get('uddg');
    const resolved = uddg ? new URL(decodeURIComponent(uddg)) : parsed;
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return '';
    }
    return resolved.toString();
  } catch {
    return '';
  }
}

async function searchDuckDuckGo(query: string, cycle: number): Promise<SearchResultItem[]> {
  const results: SearchResultItem[] = [];
  const seenUrls = new Set<string>();

  // 1. DuckDuckGo HTML Lite endpoint
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const htmlRes = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          Accept: 'text/html',
        },
        signal: controller.signal,
      },
    );
    clearTimeout(timer);

    if (htmlRes.ok) {
      const html = await htmlRes.text();
      const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

      const links: { url: string; title: string }[] = [];
      let match: RegExpExecArray | null;
      while ((match = linkRegex.exec(html)) !== null && links.length < 6) {
        const url = unwrapDuckDuckGoUrl(match[1]);
        const title = decodeHtmlEntities(match[2]);
        if (url.startsWith('http') && title) {
          links.push({ url, title });
        }
      }

      const snippets: string[] = [];
      while ((match = snippetRegex.exec(html)) !== null && snippets.length < 6) {
        snippets.push(decodeHtmlEntities(match[1]));
      }

      links.forEach((item, idx) => {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          results.push({
            id: `ddg_${cycle}_${results.length + 1}_${Date.now().toString(36)}`,
            title: item.title.slice(0, 180),
            url: item.url,
            snippet: (snippets[idx] || 'Retrieved via DuckDuckGo web search.').slice(0, 400),
            query,
            cycle,
          });
        }
      });
    }
  } catch {
    // Continue to Instant Answer API fallback
  }

  // 2. DuckDuckGo Instant Answer JSON API
  if (results.length < 3) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const ddgRes = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
        { signal: controller.signal },
      );
      clearTimeout(timer);

      if (ddgRes.ok) {
        const data = (await ddgRes.json()) as {
          Heading?: string;
          AbstractText?: string;
          AbstractURL?: string;
          RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
        };

        if (data.AbstractText && data.AbstractURL && !seenUrls.has(data.AbstractURL)) {
          seenUrls.add(data.AbstractURL);
          results.push({
            id: `ddg_ia_${cycle}_${results.length + 1}`,
            title: (data.Heading || query).slice(0, 180),
            url: data.AbstractURL,
            snippet: data.AbstractText.slice(0, 400),
            query,
            cycle,
          });
        }

        for (const topic of data.RelatedTopics ?? []) {
          if (results.length >= 5) break;
          if (topic.FirstURL && topic.Text && !seenUrls.has(topic.FirstURL)) {
            seenUrls.add(topic.FirstURL);
            results.push({
              id: `ddg_rel_${cycle}_${results.length + 1}`,
              title: topic.Text.split(' - ')[0]?.slice(0, 160) || query,
              url: topic.FirstURL,
              snippet: topic.Text.slice(0, 400),
              query,
              cycle,
            });
          }
        }
      }
    } catch {
      // Continue to Wikipedia OpenSearch fallback
    }
  }

  // 3. Wikipedia OpenSearch fallback if DuckDuckGo endpoints returned 0 results
  if (results.length === 0) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const wikiRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=4&namespace=0&format=json`,
        {
          headers: { 'User-Agent': 'AgentFlowStudio/1.0' },
          signal: controller.signal,
        },
      );
      clearTimeout(timer);

      if (wikiRes.ok) {
        const payload = (await wikiRes.json()) as [string, string[], string[], string[]];
        const titles = payload[1] || [];
        const descriptions = payload[2] || [];
        const urls = payload[3] || [];

        titles.forEach((title, idx) => {
          const url = urls[idx];
          if (url && !seenUrls.has(url)) {
            seenUrls.add(url);
            results.push({
              id: `wiki_${cycle}_${idx + 1}`,
              title: title.slice(0, 180),
              url,
              snippet: (descriptions[idx] || `Reference article for ${title}`).slice(0, 400),
              query,
              cycle,
            });
          }
        });
      }
    } catch {
      // Return whatever results were gathered
    }
  }

  return results.slice(0, 5);
}

const PREFERRED_GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai/gpt-oss-120b',
  'qwen/qwen3-32b',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-20b',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'gemma2-9b-it',
  'mixtral-8x7b-32768',
];

const EXCLUDED_GROQ_MODEL_PATTERNS = [
  'whisper',
  'tts',
  'orpheus',
  'guard',
  'embedding',
  'allam',
];

let cachedGroqModels: { models: string[]; fetchedAt: number } | null = null;

async function getAvailableGroqModels(groqKey: string): Promise<string[]> {
  if (cachedGroqModels && Date.now() - cachedGroqModels.fetchedAt < 5 * 60 * 1000) {
    return cachedGroqModels.models;
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${groqKey}` },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        data?: Array<{ id?: string; active?: boolean }>;
      };
      const rawIds = (data.data ?? [])
        .filter((m) => m.id && m.active !== false)
        .map((m) => String(m.id))
        .filter(
          (id) => !EXCLUDED_GROQ_MODEL_PATTERNS.some((pat) => id.toLowerCase().includes(pat)),
        );

      if (rawIds.length > 0) {
        const prioritized = PREFERRED_GROQ_MODELS.filter((m) => rawIds.includes(m));
        const others = rawIds.filter((m) => !prioritized.includes(m));
        const ordered = [...prioritized, ...others];
        cachedGroqModels = { models: ordered, fetchedAt: Date.now() };
        return ordered;
      }
    }
  } catch {
    // Fallback to known public models if model listing fails
  }

  return ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct'];
}

function parseJsonObjectSafe<T>(rawText: string): T {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const withoutFence = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    try {
      return JSON.parse(withoutFence) as T;
    } catch {
      const start = withoutFence.indexOf('{');
      const end = withoutFence.lastIndexOf('}');
      if (start !== -1 && end > start) {
        return JSON.parse(withoutFence.slice(start, end + 1)) as T;
      }
      throw new Error('Model returned non-JSON output');
    }
  }
}

async function callGroqJson(systemInstruction: string, prompt: string): Promise<string | null> {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) return null;

  const models = await getAvailableGroqModels(groqKey);
  let lastError = 'Groq API request failed.';

  for (const model of models.slice(0, 5)) {
    for (const useJsonMode of [true, false]) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model,
          ...(useJsonMode ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content ?? null;
        if (content) return content;
        lastError = `Groq model ${model} returned empty content.`;
        break;
      }

      const errText = await res.text();
      lastError = `Groq API error (${res.status}) [${model}]: ${errText.slice(0, 240)}`;

      // Retry without response_format if strict JSON mode rejected output
      if (res.status === 400 && useJsonMode && errText.includes('json_validate_failed')) {
        continue;
      }

      // If model is unavailable/blocked in project settings, try next model
      if (res.status === 404 || res.status === 403 || errText.includes('model_not_found')) {
        cachedGroqModels = null;
        break;
      }

      throw new Error(lastError);
    }
  }

  throw new Error(lastError);
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(express.json({ limit: '512kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      groqConfigured: Boolean(process.env.GROQ_API_KEY),
    });
  });

  app.post('/api/agent/research', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        topic?: string;
        followUpQuery?: string;
        cycleCount?: number;
        priorNotes?: string;
        humanFeedback?: string;
        provider?: 'google' | 'groq';
      };

      const topic = String(body.topic || '').trim().slice(0, 500);
      if (!topic) {
        res.status(400).json({ error: 'Topic is required to run the Researcher Agent.' });
        return;
      }

      const cycle = Math.min(Math.max(Math.trunc(Number(body.cycleCount || 0)), 0), 9) + 1;
      const baseQuery = String(body.followUpQuery || topic).trim().slice(0, 300);
      const shortKeywords = baseQuery
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .slice(0, 6)
        .join(' ');
      const queries = Array.from(
        new Set([
          shortKeywords || baseQuery.slice(0, 100),
          cycle > 1 ? `${shortKeywords} benchmarks metrics` : `${shortKeywords} architecture`,
        ].filter(Boolean)),
      );

      const ai = getGeminiClient();
      const useGroq = body.provider === 'groq' && Boolean(process.env.GROQ_API_KEY);

      // Execute real DuckDuckGo searches in parallel
      const allSearches = await Promise.all(queries.map((q) => searchDuckDuckGo(q, cycle)));
      const newSources = allSearches.flat().slice(0, 6);

      // Step 3: Synthesize research findings
      const sourceContext = newSources.length
        ? newSources
            .map((s, idx) => `[${idx + 1}] ${s.title} (${s.url})\nSnippet: ${s.snippet}`)
            .join('\n\n')
        : 'No live web snippets returned; synthesize verified engineering knowledge and clearly note which empirical benchmarks need direct citation.';

      let researchSummary = '';
      const synthesisPrompt = [
        `Research Topic: ${topic}`,
        `Cycle: ${cycle}`,
        body.followUpQuery ? `Specific Gap to Address: ${body.followUpQuery}` : '',
        body.humanFeedback ? `Human Feedback: ${body.humanFeedback}` : '',
        `Retrieved Search Results:\n${sourceContext}`,
        'Synthesize crisp, structured bulleted technical findings (180-280 words). Cite source numbers [1], [2] when referencing search snippets.',
      ]
        .filter(Boolean)
        .join('\n\n');

      if (useGroq) {
        const groqOut = await callGroqJson(
          'You are a senior Researcher Agent. Output valid JSON with a single string field: {"researchSummary": "markdown bulleted findings"}.',
          synthesisPrompt,
        );
        if (groqOut) {
          const parsed = parseJsonObjectSafe<{ researchSummary?: string | string[] }>(groqOut);
          researchSummary = Array.isArray(parsed.researchSummary)
            ? parsed.researchSummary.map((item) => `- ${String(item)}`).join('\n')
            : String(parsed.researchSummary || '');
        }
      } else if (ai) {
        const synthRes = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: synthesisPrompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            systemInstruction:
              'You are a senior Researcher Agent in an autonomous multi-agent workflow. Provide factual, structured technical research notes with explicit citations.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                researchSummary: {
                  type: Type.STRING,
                  description: 'Structured markdown bullet points summarizing the cycle findings.',
                },
              },
              required: ['researchSummary'],
            },
          },
        });
        const parsed = JSON.parse((synthRes.text || '{}').trim()) as { researchSummary?: string };
        researchSummary = parsed.researchSummary || '';
      } else {
        console.error('Researcher Agent error: GEMINI_API_KEY is not configured.');
        res.status(503).json({
          error: 'Something went wrong, try again',
        });
        return;
      }

      res.json({
        queries,
        newSources,
        researchSummary: researchSummary || 'No findings synthesized.',
      });
    } catch (error) {
      console.error('Researcher Agent error:', error);
      res.status(500).json({ error: 'Something went wrong, try again' });
    }
  });

  app.post('/api/agent/write', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        topic?: string;
        framework?: 'langgraph' | 'crewai';
        provider?: 'google' | 'groq';
        cycleCount?: number;
        maxCycles?: number;
        researchNotes?: string;
        sources?: SearchResultItem[];
        humanFeedback?: string;
      };

      const topic = String(body.topic || '').trim().slice(0, 500);
      const cycleCount = Math.min(Math.max(Math.trunc(Number(body.cycleCount || 1)), 1), 10);
      const maxCycles = Math.min(Math.max(Math.trunc(Number(body.maxCycles || 3)), 1), 5);
      const researchNotes = String(body.researchNotes || '').slice(0, 40000);
      const sources = Array.isArray(body.sources) ? body.sources.slice(0, 30) : [];

      const ai = getGeminiClient();
      const useGroq = body.provider === 'groq' && Boolean(process.env.GROQ_API_KEY);

      if (!ai && !useGroq) {
        console.error('Writer Agent error: GEMINI_API_KEY is not configured.');
        res.status(503).json({
          error: 'Something went wrong, try again',
        });
        return;
      }

      const canLoop = cycleCount < maxCycles;
      const sourceList = sources
        .map((s, idx) => `- [${idx + 1}] ${s.title}: ${s.url}`)
        .join('\n');

      const writerPrompt = [
        `Topic: ${topic}`,
        `Orchestration Framework: ${body.framework === 'crewai' ? 'CrewAI' : 'LangGraph'}`,
        `Current Cycle: ${cycleCount} of ${maxCycles}`,
        body.humanFeedback ? `Human Reviewer Feedback (must be addressed): ${body.humanFeedback}` : '',
        `Accumulated Research Notes:\n${researchNotes}`,
        sourceList ? `Available Citations:\n${sourceList}` : '',
        canLoop
          ? 'Task: Draft a thorough Markdown report with a comparative table and architecture recommendations. ALSO act as a strict quality gate: if Cycle == 1 or concrete quantitative benchmarks/failure modes are still missing, set needsMoreResearch=true and specify missingDataReason + a targeted followUpQuery so the graph routes back to the Researcher Agent.'
          : 'Task: You have reached the final research cycle. Synthesize ALL accumulated notes into a polished, publication-ready Markdown report with Executive Summary, Comparative Matrix, Trade-offs, and Recommendations. Set needsMoreResearch=false so the pipeline pauses at the Human Approval Gate.',
      ]
        .filter(Boolean)
        .join('\n\n');

      let writerPayload: {
        draftMarkdown?: string;
        needsMoreResearch?: boolean;
        missingDataReason?: string;
        followUpQuery?: string;
      } = {};

      if (useGroq) {
        const groqOut = await callGroqJson(
          'You are a Principal Writer Agent in a cyclic multi-agent pipeline. Return a single JSON object with keys: draftMarkdown (string), needsMoreResearch (boolean), missingDataReason (string), followUpQuery (string).',
          writerPrompt,
        );
        if (groqOut) {
          writerPayload = parseJsonObjectSafe<typeof writerPayload>(groqOut);
        }
      } else if (ai) {
        const wRes = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: writerPrompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            systemInstruction:
              'You are a Principal Writer Agent that drafts crisp Markdown reports and routes incomplete drafts back to the Researcher Agent when critical evidence is missing.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                draftMarkdown: {
                  type: Type.STRING,
                  description: 'Well-formatted Markdown technical report with headings, bullet points, and tables.',
                },
                needsMoreResearch: {
                  type: Type.BOOLEAN,
                  description: 'True if important quantitative evidence or edge cases are missing and canLoop is true.',
                },
                missingDataReason: {
                  type: Type.STRING,
                  description: 'Clear 1-sentence explanation of what data is missing when needsMoreResearch is true.',
                },
                followUpQuery: {
                  type: Type.STRING,
                  description: 'Targeted DuckDuckGo search query for the Researcher Agent.',
                },
              },
              required: ['draftMarkdown', 'needsMoreResearch', 'missingDataReason', 'followUpQuery'],
            },
          },
        });
        writerPayload = JSON.parse((wRes.text || '{}').trim());
      }

      res.json({
        draftMarkdown: writerPayload.draftMarkdown || '# Research Report\n\nNo draft generated.',
        needsMoreResearch: canLoop ? Boolean(writerPayload.needsMoreResearch) : false,
        missingDataReason: writerPayload.missingDataReason || '',
        followUpQuery: writerPayload.followUpQuery || '',
      });
    } catch (error) {
      console.error('Writer Agent error:', error);
      res.status(500).json({ error: 'Something went wrong, try again' });
    }
  });

  const distDir = path.join(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AgentFlow Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
