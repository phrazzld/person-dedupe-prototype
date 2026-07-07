// LLM adjudication for the ambiguous band: batch call to a cheap commodity
// model via OpenRouter, with a fixture fallback so the whole demo runs with
// zero keys. Both paths produce identical-shaped LlmAdjudication data.

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Person, Signal, LlmAdjudication } from './types';
import type { PersonPair } from './candidates';
import { pairKey } from './candidates';

export interface AdjudicationInput {
  pair: PersonPair;
  personA: Person;
  personB: Person;
  signals: Signal[];
}

const COMPARED_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'address_line',
  'city',
  'region',
  'postal_code',
  'license_plate',
] as const;

function comparedRecord(p: Person): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const field of COMPARED_FIELDS) out[field] = p[field] ?? null;
  return out;
}

const LlmAdjudicationSchema = z.object({
  confidence: z.number().min(0).max(100),
  verdict: z.enum(['duplicate', 'distinct_people', 'unclear']),
  distinct_hypothesis: z.enum(['spouse', 'parent_child', 'roommate', 'coincidence']).nullable(),
  field_weights: z.record(z.enum(['strong', 'moderate', 'weak', 'counter'])),
  rationale: z.string().max(120),
});

const BatchResponseSchema = z.array(
  z.object({
    pair_key: z.string(),
    adjudication: LlmAdjudicationSchema,
  }),
);

const BATCH_SIZE = 20;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

let cachedPrompt: string | null = null;
function systemPrompt(): string {
  if (cachedPrompt) return cachedPrompt;
  const promptPath = path.join(process.cwd(), 'prompts', 'adjudicate.md');
  cachedPrompt = fs.readFileSync(promptPath, 'utf-8');
  return cachedPrompt;
}

function fixturesPath(): string {
  return path.join(process.cwd(), 'fixtures', 'adjudications.json');
}

function loadFixtures(): Record<string, LlmAdjudication> {
  const raw = fs.readFileSync(fixturesPath(), 'utf-8');
  return JSON.parse(raw);
}

const FALLBACK_UNCLEAR: LlmAdjudication = {
  confidence: 50,
  verdict: 'unclear',
  distinct_hypothesis: null,
  field_weights: {},
  rationale: 'No fixture adjudication recorded for this pair; treated as unclear.',
};

function adjudicateFromFixtures(inputs: AdjudicationInput[]): Map<string, LlmAdjudication> {
  const fixtures = loadFixtures();
  const results = new Map<string, LlmAdjudication>();
  for (const input of inputs) {
    const key = pairKey(input.pair);
    results.set(key, fixtures[key] ?? FALLBACK_UNCLEAR);
  }
  return results;
}

function buildUserMessage(inputs: AdjudicationInput[]): string {
  const payload = inputs.map((input) => ({
    pair_key: pairKey(input.pair),
    person_a: comparedRecord(input.personA),
    person_b: comparedRecord(input.personB),
    deterministic_signals: input.signals.map((s) => ({
      field: s.field,
      kind: s.kind,
      similarity: s.similarity,
    })),
  }));
  return JSON.stringify(payload, null, 2);
}

function extractJsonArray(content: string): unknown {
  const trimmed = content.trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  const jsonSlice = start >= 0 && end >= start ? trimmed.slice(start, end + 1) : trimmed;
  return JSON.parse(jsonSlice);
}

async function callOpenRouterOnce(
  inputs: AdjudicationInput[],
  apiKey: string,
  model: string,
  correction?: string,
): Promise<unknown> {
  const messages = [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: buildUserMessage(inputs) },
  ];
  if (correction) {
    messages.push({ role: 'user', content: correction });
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, temperature: 0 }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('OpenRouter response missing message content');
  }
  return extractJsonArray(content);
}

async function adjudicateViaOpenRouter(inputs: AdjudicationInput[], apiKey: string): Promise<Map<string, LlmAdjudication>> {
  const model = process.env.LLM_MODEL ?? 'deepseek/deepseek-v4-flash';
  const results = new Map<string, LlmAdjudication>();

  for (const batch of chunk(inputs, BATCH_SIZE)) {
    let parsed: z.infer<typeof BatchResponseSchema> | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const raw = await callOpenRouterOnce(
          batch,
          apiKey,
          model,
          attempt === 0 ? undefined : 'Your previous response did not match the required JSON shape. Return ONLY the JSON array described in the instructions.',
        );
        parsed = BatchResponseSchema.parse(raw);
      } catch (err) {
        lastError = err;
      }
    }

    if (!parsed) {
      throw new Error(`OpenRouter adjudication failed schema validation after retry: ${String(lastError)}`);
    }

    for (const entry of parsed) {
      results.set(entry.pair_key, entry.adjudication);
    }
  }

  return results;
}

/**
 * Adjudicates the ambiguous-band pairs. Uses fixtures when OPENROUTER_API_KEY
 * is unset (the default, zero-cost demo path); otherwise calls the live
 * model. Returns a map keyed by pairKey(pair).
 */
export async function adjudicateBatch(inputs: AdjudicationInput[]): Promise<Map<string, LlmAdjudication>> {
  if (inputs.length === 0) return new Map();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return adjudicateFromFixtures(inputs);
  }
  return adjudicateViaOpenRouter(inputs, apiKey);
}
