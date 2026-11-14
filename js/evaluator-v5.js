/**
 * Motor de Evaluación y Diagnóstico Post-Sesión (English Partner v8 - Auditoría Real CEFR)
 * - Cero calificaciones hardcodeadas (elimina el falso 80 ante fallas)
 * - Extracción y parseo JSON resiliente dentro del ciclo de reintento por modelo
 * - Rúbrica CEFR estricta y retroalimentación obligatoria sobre turnos reales del alumno
 */

const EVALUATOR_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-pro-latest'
];

const Evaluator = {
  async analyzeSession(sessionData, apiKey) {
    const { scenario, history, durationSeconds } = sessionData;
    const safeHistory = Array.isArray(history) ? history : [];
    const userTurns = safeHistory.filter(h => h.role === 'user' && (h.text || '').trim().length > 0);

    if (!apiKey || !apiKey.trim()) {
      const msg = 'Falta configurar tu API Key de Gemini en ⚙️ Ajustes para generar la auditoría.';
      return { success: false, error: msg, report: this.buildErrorReport(msg) };
    }

    if (userTurns.length === 0) {
      const msg = 'No se capturó ninguna frase de tu voz en esta sesión. Verifica el micrófono y habla al menos un turno antes de finalizar.';
      return { success: false, error: msg, report: this.buildErrorReport(msg) };
    }

    const prompt = this.buildAuditPrompt(scenario, safeHistory, userTurns, durationSeconds || 0);
    let lastError = null;

    for (const model of EVALUATOR_MODELS) {
      try {
        const parsed = await this.requestModelWithMimeFallback(model, apiKey.trim(), prompt);
        const normalized = this.normalizeReport(parsed, userTurns);
        return { success: true, modelUsed: model, report: normalized };
      } catch (err) {
        console.warn(`[Evaluator] Fallo con modelo ${model}:`, err.message);
        lastError = err;
        await new Promise(r => setTimeout(r, 350));
      }
    }

    const errorMessage = (lastError && lastError.message) || 'No se pudo conectar con Gemini para evaluar la sesión.';
    console.error('[Evaluator] Todos los modelos fallaron:', errorMessage);
    return {
      success: false,
      error: errorMessage,
      report: this.buildErrorReport(errorMessage)
    };
  },

  async requestModelWithMimeFallback(model, apiKey, prompt) {
    try {
      return await this.callGeminiModel(model, apiKey, prompt, true);
    } catch (err) {
      if (err.message && err.message.includes('HTTP 400')) {
        return await this.callGeminiModel(model, apiKey, prompt, false);
      }
      throw err;
    }
  },

  async callGeminiModel(model, apiKey, prompt, useJsonMime) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const generationConfig = {
      temperature: 0.25,
      maxOutputTokens: 2500
    };
    if (useJsonMime) {
      generationConfig.responseMimeType = 'application/json';
    }

    const doFetch = (typeof Config !== 'undefined' && Config.fetchWithTimeout)
      ? Config.fetchWithTimeout.bind(Config)
      : fetch;

    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig
      })
    }, 25000);

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`HTTP ${response.status} (${model}): ${errBody.slice(0, 220)}`);
    }

    const data = await response.json();
    const rawText = this.extractTextFromCandidate(data);
    return this.extractJsonObject(rawText);
  },

  extractTextFromCandidate(data) {
    const candidate = data && data.candidates && data.candidates[0];
    const parts = candidate && candidate.content && candidate.content.parts;
    if (!Array.isArray(parts) || parts.length === 0) {
      throw new Error('Respuesta vacía de Gemini (sin partes de contenido).');
    }

    // Ignorar bloques de pensamiento interno (thought: true) en modelos con razonamiento
    const nonThoughtTexts = parts
      .filter(p => p && !p.thought && typeof p.text === 'string' && p.text.trim().length > 0)
      .map(p => p.text.trim());

    const jsonCandidate = nonThoughtTexts.find(t => t.includes('{')) || nonThoughtTexts[0];
    if (!jsonCandidate) {
      throw new Error('La respuesta de Gemini no contiene texto evaluable.');
    }
    return jsonCandidate;
  },

  extractJsonObject(rawText) {
    let cleaned = (rawText || '').trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
      return JSON.parse(cleaned);
    } catch (_) {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace <= firstBrace) {
        throw new Error('Gemini no devolvió un objeto JSON válido.');
      }

      let sliced = cleaned.slice(firstBrace, lastBrace + 1);
      // Limpiar comas colgantes antes de } o ] que ocasionalmente generan los LLM
      sliced = sliced.replace(/,\s*([}\]])/g, '$1');

      try {
        return JSON.parse(sliced);
      } catch (parseErr) {
        throw new Error(`JSON malformado en respuesta de Gemini: ${parseErr.message}`);
      }
    }
  },

  buildAuditPrompt(scenario, history, userTurns, durationSeconds) {
    const isPlacement = (scenario.id === 'placement_test');
    const userFullText = userTurns.map(t => `[${t.timestamp}s] ${t.text}`).join('\n');
    const conversationTranscript = history
      .map(h => `${h.role === 'user' ? 'Student' : 'Coach'}: ${h.text}`)
      .join('\n');

    return `
You are a strict, honest Staff English Language Auditor and certified CEFR Examiner.
A student completed a voice conversation session (transcribed via Speech-to-Text).

SCENARIO: ${scenario.title} (${scenario.category || 'general'})
CONTEXT: ${scenario.scenarioContext}
IS PLACEMENT TEST: ${isPlacement ? 'YES' : 'NO'}
DURATION: ${durationSeconds} seconds (${userTurns.length} student turns)

FULL TRANSCRIPT:
${conversationTranscript}

STUDENT EXACT TURNS TO AUDIT:
${userFullText}

STRICT GRADING RULES (CRITICAL):
1. NEVER default to 80 or flatter the student. Grade strictly from 0 to 100 using real CEFR evidence:
   - 0-45: Very short, incomplete, heavily broken syntax, or minimal participation.
   - 46-64: Frequent errors in verb tenses, prepositions, word order, or literal Spanish-to-English translations.
   - 65-77: Understandable B1/lower-B2 speech with noticeable grammar slips or basic repetitive vocabulary.
   - 78-88: Solid, natural flow with only minor slips and varied vocabulary.
   - 89-100: Near-native precision, idiomatic fluency, and rich register control.
2. Each category (grammar, vocabulary, pronunciation) MUST reflect distinct real performance rather than identical numbers.
3. Base EVERY audit item strictly on phrases and words the student ACTUALLY said in STUDENT EXACT TURNS. Do not invent quotes.
4. Populate ALL arrays with concrete coaching:
   - grammarAudit: Analyze actual errors (tenses, articles, prepositions, subject-verb, word order). If the student made few errors, quote their actual sentences and provide more natural native/idiomatic structural upgrades (at least 2 items when the student had >= 2 turns).
   - vocabularyAudit: Pick 2 to 4 actual phrases the student used and give both an informal native alternative and a professional/executive alternative, explaining why in Spanish.
   - fillerWords: Count actual hesitation/filler words used ("like", "um", "uh", "so", "actually", "basically", etc.). Return [] only if none occurred.
   - pronunciationAudit: Since input comes from Speech-to-Text, look for (a) words that look like STT phonetic misrecognitions in context (indicating unclear articulation) AND (b) 2 to 4 challenging English words the student actually spoke (containing "th", "r", "v/b", "-ed" endings, silent letters, or tricky vowels). Provide exact IPA, Spanish figured pronunciation, and physical tongue/lip articulation advice in Spanish.
5. Write all explanations, executiveSummary, strengths, placement.rationale, and homeworkChallenge in clear, direct Spanish (using English only for the quoted phrases/alternatives and part of spokenSummary).

Respond ONLY with raw valid JSON (no markdown fences, no commentary outside JSON):
{
  "scores": {
    "grammar": <integer 0-100>,
    "vocabulary": <integer 0-100>,
    "pronunciation": <integer 0-100>,
    "overall": <integer 0-100>
  },
  "placement": {
    "assignedLevel": "<A2|B1|B2|C1>",
    "rationale": "Explicación honesta en español basada en evidencia de los turnos del alumno."
  },
  "executiveSummary": "Evaluación crítica y constructiva en español (1-2 párrafos) señalando aciertos concretos y fallos principales observados.",
  "spokenSummary": "Resumen hablado de 35-45 segundos en inglés claro (con un breve cierre motivador) mencionando 1 error clave a corregir y 1 logro.",
  "grammarAudit": [
    {
      "original": "Frase textual dicha por el alumno",
      "corrected": "Versión corregida o más natural",
      "explanation": "Explicación precisa en español de la regla gramatical o mejora",
      "rule": "Nombre de la regla"
    }
  ],
  "vocabularyAudit": [
    {
      "original": "Frase textual dicha por el alumno",
      "nativeAlternative": "Cómo lo diría un nativo informal",
      "businessAlternative": "Alternativa ejecutiva/profesional",
      "reason": "Por qué suena más natural o precisa"
    }
  ],
  "fillerWords": [
    { "word": "so", "count": 2 }
  ],
  "pronunciationAudit": [
    {
      "word": "palabra usada por el alumno",
      "ipa": "/.../",
      "figuredPronunciation": "pronunciación figurada en español",
      "phoneticTip": "Instrucción física en español (lengua, labios, acento)",
      "turnTimestamp": 0
    }
  ],
  "strengths": [
    "Fortaleza concreta demostrada",
    "Otra fortaleza observada"
  ],
  "homeworkChallenge": "Micro-reto práctico en español para la próxima sesión de 10 minutos."
}
`;
  },

  clampScore(val) {
    const num = Number(val);
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.min(100, Math.round(num)));
  },

  normalizeReport(parsed, userTurns) {
    const rawScores = parsed.scores || {};
    const grammar = this.clampScore(rawScores.grammar);
    const vocabulary = this.clampScore(rawScores.vocabulary);
    const pronunciation = this.clampScore(rawScores.pronunciation);
    let overall = this.clampScore(rawScores.overall);

    if (overall === null && grammar !== null && vocabulary !== null && pronunciation !== null) {
      overall = Math.round((grammar + vocabulary + pronunciation) / 3);
    }

    const grammarAudit = Array.isArray(parsed.grammarAudit) ? parsed.grammarAudit : [];
    const vocabularyAudit = Array.isArray(parsed.vocabularyAudit) ? parsed.vocabularyAudit : [];
    const fillerWords = Array.isArray(parsed.fillerWords) ? parsed.fillerWords : [];
    const strengths = Array.isArray(parsed.strengths) ? parsed.strengths : [];
    let pronunciationAudit = Array.isArray(parsed.pronunciationAudit) ? parsed.pronunciationAudit : [];

    pronunciationAudit = pronunciationAudit.map(item => {
      const matchedTurn = userTurns.find(
        t => Math.abs((t.timestamp || 0) - (item.turnTimestamp || 0)) <= 30 && t.audioUrl
      );
      return {
        ...item,
        userAudioUrl: matchedTurn ? matchedTurn.audioUrl : null
      };
    });

    const mistakes = [];
    grammarAudit.forEach(g => {
      if (g && g.original && g.corrected) {
        mistakes.push({
          type: 'GRAMMAR',
          original: g.original,
          correction: g.corrected,
          explanation: g.explanation || g.rule || ''
        });
      }
    });
    pronunciationAudit.forEach(p => {
      if (p && p.word) {
        mistakes.push({
          type: 'PRONUNCIATION',
          original: p.word,
          correction: `${p.ipa || ''} (${p.figuredPronunciation || ''})`.trim(),
          explanation: p.phoneticTip || ''
        });
      }
    });

    return {
      isErrorReport: false,
      scores: { grammar, vocabulary, pronunciation, overall },
      placement: parsed.placement || null,
      executiveSummary: parsed.executiveSummary || '',
      spokenSummary: parsed.spokenSummary || '',
      grammarAudit,
      vocabularyAudit,
      fillerWords,
      pronunciationAudit,
      strengths,
      homeworkChallenge: parsed.homeworkChallenge || '',
      mistakes
    };
  },

  buildErrorReport(errorMessage) {
    return {
      isErrorReport: true,
      errorMessage,
      scores: { grammar: null, vocabulary: null, pronunciation: null, overall: null },
      placement: null,
      executiveSummary: '',
      spokenSummary: '',
      grammarAudit: [],
      vocabularyAudit: [],
      fillerWords: [],
      pronunciationAudit: [],
      strengths: [],
      homeworkChallenge: '',
      mistakes: []
    };
  }
};
